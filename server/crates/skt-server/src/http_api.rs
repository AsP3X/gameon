//! Session routes and the socket upgrade.

use std::sync::Arc;

use std::net::SocketAddr;

use axum::Json;
use axum::extract::ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade};
use axum::extract::{ConnectInfo, FromRequest, Path, Request, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use skt_protocol::{Credentials, ErrorCode, Me, Profile, ProfilePatch, ServerConfig};
use tokio::sync::{Mutex, mpsc};

use crate::rate::{Budgets, RateGate};
use crate::store::{Store, StoreFailure};
use crate::world::Wire;
use crate::world::World;
use crate::{AppError, origin};

/// Shared rooms for HTTP and the socket.
#[derive(Clone)]
pub struct AppState {
    world: Arc<Mutex<World>>,
    store: Option<Store>,
    rates: RateGate,
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

impl AppState {
    /// An empty tavern.
    #[must_use]
    pub fn new() -> Self {
        Self {
            world: Arc::new(Mutex::new(World::new())),
            store: None,
            rates: RateGate::new(Budgets::standard()),
        }
    }

    /// Connect to Postgres and apply migrations.
    ///
    /// # Errors
    ///
    /// The database is unreachable or a migration fails.
    pub async fn connect(url: &str) -> Result<Self, String> {
        let store = Store::connect(url).await?;
        Ok(Self::with_store(store, World::new(), Budgets::standard()))
    }

    /// A migrated pool, a queue wait, and rate budgets. Tests use this.
    #[must_use]
    pub fn for_tests(pool: sqlx::PgPool, fill: std::time::Duration, budgets: Budgets) -> Self {
        Self::with_store(Store::from_pool(pool), World::with_fill(fill), budgets)
    }

    fn with_store(store: Store, world: World, budgets: Budgets) -> Self {
        Self {
            world: Arc::new(Mutex::new(world)),
            store: Some(store),
            rates: RateGate::new(budgets),
        }
    }

    /// Run due bot moves and deadlines, then store any game that finished.
    pub async fn tick(&self) {
        let reports = self.world.lock().await.tick();
        let Some(store) = &self.store else {
            return;
        };
        for report in reports {
            if store.record(&report).await.is_err() {
                continue;
            }
            self.world.lock().await.apply_report(&report);
        }
    }

    /// The same write the tick uses, for a finished game the test already scored.
    #[cfg(test)]
    pub(crate) async fn record_for_test(&self, report: crate::world::GameReport) {
        let Some(store) = &self.store else {
            return;
        };
        store.record(&report).await.expect("record");
        self.world.lock().await.apply_report(&report);
    }
}

pub async fn config() -> Json<ServerConfig> {
    std::future::ready(Json(World::config())).await
}

pub async fn guest(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    origin::check_origin(header_str(&headers, header::ORIGIN))?;
    let existing = session_cookie(&headers);
    if let Some(token) = existing.as_deref()
        && remember(&state, token).await.is_ok()
    {
        let me = state.world.lock().await.me(token).map_err(AppError::new)?;
        return Ok(with_cookie(Json(me), token));
    }
    if state.store.is_some() {
        let store = state
            .store
            .clone()
            .ok_or(AppError::new(ErrorCode::Internal))?;
        let (token, snap) = store.create_guest().await.map_err(|err| failure(&err))?;
        state.world.lock().await.import(&token, snap);
        let me = state.world.lock().await.me(&token).map_err(AppError::new)?;
        return Ok(with_cookie(Json(me), &token));
    }
    let (token, me) = state.world.lock().await.guest(None);
    Ok(with_cookie(Json(me), &token))
}

pub async fn register(
    State(state): State<AppState>,
    headers: HeaderMap,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    request: Request,
) -> Result<Response, AppError> {
    origin::check_origin(header_str(&headers, header::ORIGIN))?;
    limit(state.rates.register(&caller(&headers, peer)).await)?;
    let token = session_cookie(&headers).ok_or(AppError::new(ErrorCode::Unauthenticated))?;
    remember(&state, &token).await?;
    let guest = {
        let world = state.world.lock().await;
        let id = world.me(&token).map_err(AppError::new)?.user.id;
        world.is_guest(&id)
    };
    if !guest {
        return Err(AppError::new(ErrorCode::AlreadyRegistered));
    }
    let JsonBody(body) = JsonBody::<Credentials>::from_request(request, &state)
        .await
        .map_err(|_| AppError::new(ErrorCode::Validation))?;
    if !valid_username(&body.username) {
        return Err(AppError::new(ErrorCode::UsernameInvalid));
    }
    if body.password.is_empty() {
        return Err(AppError::new(ErrorCode::WeakPassword));
    }
    let store = state
        .store
        .clone()
        .ok_or(AppError::new(ErrorCode::Internal))?;
    let snap = store
        .register(&token, &body.username, &body.password)
        .await
        .map_err(|err| failure(&err))?;
    state.world.lock().await.import(&token, snap);
    let me = state.world.lock().await.me(&token).map_err(AppError::new)?;
    Ok(with_cookie(Json(me), &token))
}

pub async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    request: Request,
) -> Result<Response, AppError> {
    origin::check_origin(header_str(&headers, header::ORIGIN))?;
    limit(state.rates.login(&caller(&headers, peer)).await)?;
    let JsonBody(body) = JsonBody::<Credentials>::from_request(request, &state).await?;
    let store = state
        .store
        .clone()
        .ok_or(AppError::new(ErrorCode::Internal))?;
    let (token, snap) = store
        .login(&body.username, &body.password)
        .await
        .map_err(|err| failure(&err))?;
    let previous = session_cookie(&headers);
    if let Some(old) = previous.as_deref()
        && old != token.as_str()
        && let Ok(snap_old) = store.load_session(old).await
    {
        if snap_old.user.id != snap.user.id {
            state.world.lock().await.drop_presence(&snap_old.user.id);
        }
        let _ = store.revoke_token(old).await;
        state.world.lock().await.revoke(old);
    }
    state.world.lock().await.import(&token, snap);
    let me = state.world.lock().await.me(&token).map_err(AppError::new)?;
    Ok(with_cookie(Json(me), &token))
}

pub async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    origin::check_origin(header_str(&headers, header::ORIGIN))?;
    let token = session_cookie(&headers).ok_or(AppError::new(ErrorCode::Unauthenticated))?;
    let store = state
        .store
        .clone()
        .ok_or(AppError::new(ErrorCode::Internal))?;
    let user = store.logout(&token).await.map_err(|err| failure(&err))?;
    state.world.lock().await.revoke(&token);
    state.world.lock().await.drop_presence(&user);
    Ok(clear_cookie())
}

pub async fn me(State(state): State<AppState>, headers: HeaderMap) -> Result<Json<Me>, AppError> {
    let token = session_cookie(&headers).ok_or(AppError::new(ErrorCode::Unauthenticated))?;
    remember(&state, &token).await?;
    state
        .world
        .lock()
        .await
        .me(&token)
        .map(Json)
        .map_err(AppError::new)
}

pub async fn patch_me(
    State(state): State<AppState>,
    headers: HeaderMap,
    request: Request,
) -> Result<Json<Me>, AppError> {
    origin::check_origin(header_str(&headers, header::ORIGIN))?;
    let JsonBody(body) = JsonBody::<ProfilePatch>::from_request(request, &state).await?;
    let token = session_cookie(&headers).ok_or(AppError::new(ErrorCode::Unauthenticated))?;
    let name = match body.name.as_deref() {
        None => None,
        Some(name) => Some(display_name(name).ok_or(AppError::new(ErrorCode::Validation))?),
    };
    let store = state
        .store
        .clone()
        .ok_or(AppError::new(ErrorCode::Internal))?;
    let snap = store
        .patch(&token, name.as_deref(), body.color)
        .await
        .map_err(|err| failure(&err))?;
    {
        let mut world = state.world.lock().await;
        world.import(&token, snap);
        let id = world.me(&token).map_err(AppError::new)?.user.id;
        world.publish_profile(&id);
    }
    state
        .world
        .lock()
        .await
        .me(&token)
        .map(Json)
        .map_err(AppError::new)
}

pub async fn profile(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Profile>, AppError> {
    let token = session_cookie(&headers).ok_or(AppError::new(ErrorCode::Unauthenticated))?;
    remember(&state, &token).await?;
    let store = state
        .store
        .clone()
        .ok_or(AppError::new(ErrorCode::Internal))?;
    let snap = store.profile(&id).await.map_err(|err| failure(&err))?;
    Ok(Json(Profile {
        user: snap.user,
        stats: snap.stats,
        rating: None,
    }))
}

pub async fn lobbies(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<skt_protocol::LobbyList>, AppError> {
    let token = session_cookie(&headers).ok_or(AppError::new(ErrorCode::Unauthenticated))?;
    remember(&state, &token).await?;
    Ok(Json(state.world.lock().await.public_lobbies()))
}

pub async fn socket(
    State(state): State<AppState>,
    headers: HeaderMap,
    upgrade: WebSocketUpgrade,
) -> Result<Response, AppError> {
    origin::check_origin(header_str(&headers, header::ORIGIN))?;
    let token = session_cookie(&headers).ok_or(AppError::new(ErrorCode::Unauthenticated))?;
    remember(&state, &token).await?;
    let (out, mut inbound) = mpsc::unbounded_channel();
    let (user, conn) = state
        .world
        .lock()
        .await
        .bind(&token, out)
        .map_err(AppError::new)?;
    Ok(upgrade.on_upgrade(move |socket| async move {
        drive(state, user, conn, socket, &mut inbound).await;
    }))
}

async fn drive(
    state: AppState,
    user: skt_protocol::UserId,
    conn: u64,
    mut socket: WebSocket,
    inbound: &mut mpsc::UnboundedReceiver<Wire>,
) {
    let mut stamps = std::collections::VecDeque::new();
    loop {
        tokio::select! {
            incoming = socket.recv() => {
                let Some(Ok(message)) = incoming else { break; };
                let Message::Text(text) = message else { continue; };
                if text.len() > 4096 {
                    break;
                }
                let now = std::time::Instant::now();
                while stamps.front().is_some_and(|stamp| now.duration_since(*stamp).as_secs() >= 1) {
                    stamps.pop_front();
                }
                if stamps.len() >= 20 {
                    continue;
                }
                stamps.push_back(now);
                state.world.lock().await.on_message(&user, &text);
            }
            outgoing = inbound.recv() => {
                let Some(frame) = outgoing else { break; };
                match frame {
                    Wire::Text(text) => {
                        if socket.send(Message::Text(text.into())).await.is_err() {
                            break;
                        }
                    }
                    Wire::Close(code) => {
                        let _ = socket
                            .send(Message::Close(Some(CloseFrame {
                                code,
                                reason: "".into(),
                            })))
                            .await;
                        break;
                    }
                }
            }
        }
    }
    state.world.lock().await.disconnect(&user, conn);
}

struct JsonBody<T>(T);

impl<T> FromRequest<AppState> for JsonBody<T>
where
    T: serde::de::DeserializeOwned + Send,
{
    type Rejection = AppError;

    async fn from_request(req: Request, _state: &AppState) -> Result<Self, Self::Rejection> {
        let bytes = axum::body::to_bytes(req.into_body(), 64 * 1024)
            .await
            .map_err(|_| AppError::new(ErrorCode::Validation))?;
        serde_json::from_slice(&bytes)
            .map(JsonBody)
            .map_err(|_| AppError::new(ErrorCode::Validation))
    }
}

async fn remember(state: &AppState, token: &str) -> Result<(), AppError> {
    let Some(store) = &state.store else {
        return Ok(());
    };
    let snap = store
        .load_session(token)
        .await
        .map_err(|err| failure(&err))?;
    state.world.lock().await.import(token, snap);
    Ok(())
}

fn failure(err: &StoreFailure) -> AppError {
    AppError::new(match err {
        StoreFailure::Database => ErrorCode::Internal,
        StoreFailure::UsernameTaken => ErrorCode::UsernameTaken,
        StoreFailure::InvalidCredentials => ErrorCode::InvalidCredentials,
        StoreFailure::Unauthenticated => ErrorCode::Unauthenticated,
        StoreFailure::NotFound => ErrorCode::NotFound,
        StoreFailure::AlreadyRegistered => ErrorCode::AlreadyRegistered,
    })
}

fn limit(result: Result<(), u64>) -> Result<(), AppError> {
    match result {
        Ok(()) => Ok(()),
        Err(seconds) => Err(AppError::limited(seconds)),
    }
}

fn caller(headers: &HeaderMap, peer: SocketAddr) -> String {
    if let Some(value) = headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        && let Some(first) = value.split(',').next().map(str::trim)
        && !first.is_empty()
    {
        return first.to_owned();
    }
    peer.to_string()
}

fn valid_username(value: &str) -> bool {
    let count = value.chars().count();
    (3..=16).contains(&count)
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '_')
}

fn display_name(raw: &str) -> Option<String> {
    let name = raw.trim();
    let count = name.chars().count();
    if !(1..=16).contains(&count) || name.chars().any(char::is_control) {
        None
    } else {
        Some(name.to_owned())
    }
}

fn clear_cookie() -> Response {
    let mut response = StatusCode::NO_CONTENT.into_response();
    if let Ok(value) =
        HeaderValue::from_str("skt_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0")
    {
        response.headers_mut().insert(header::SET_COOKIE, value);
    }
    response
}

fn with_cookie(body: Json<Me>, token: &str) -> Response {
    let mut response = body.into_response();
    let cookie = session_cookie_header(token, secure_cookie());
    if let Ok(value) = HeaderValue::from_str(&cookie) {
        response.headers_mut().insert(header::SET_COOKIE, value);
    }
    response
}

/// `SKT_SECURE_COOKIE=1` adds `Secure`. Leave it unset for local `http`.
fn secure_cookie() -> bool {
    matches!(
        std::env::var("SKT_SECURE_COOKIE")
            .ok()
            .as_deref()
            .map(str::trim),
        Some("1" | "true" | "TRUE" | "True")
    )
}

fn session_cookie_header(token: &str, secure: bool) -> String {
    let mut cookie =
        format!("skt_session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000");
    if secure {
        cookie.push_str("; Secure");
    }
    cookie
}

fn session_cookie(headers: &HeaderMap) -> Option<String> {
    let value = headers.get(header::COOKIE)?.to_str().ok()?;
    value.split(';').find_map(|part| {
        let (name, token) = part.trim().split_once('=')?;
        (name == "skt_session").then(|| token.to_owned())
    })
}

fn header_str(headers: &HeaderMap, name: header::HeaderName) -> Option<&str> {
    headers.get(name).and_then(|value| value.to_str().ok())
}

#[cfg(test)]
mod tests {
    use super::session_cookie_header;

    #[test]
    fn the_local_cookie_is_not_secure_and_the_https_cookie_is() {
        let plain = session_cookie_header("abc", false);
        assert!(plain.contains("HttpOnly"));
        assert!(!plain.contains("Secure"));
        assert!(session_cookie_header("abc", true).ends_with("; Secure"));
    }
}
