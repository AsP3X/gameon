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

use crate::rate::{Budgets, RateGate, TrustedProxies, client_key};
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
    trusted: TrustedProxies,
    /// How long a new socket may wait before `hello`.
    hello_wait: std::time::Duration,
    /// How long a socket may stay silent.
    silence: std::time::Duration,
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
            trusted: TrustedProxies::none(),
            hello_wait: std::time::Duration::from_secs(5),
            silence: std::time::Duration::from_secs(45),
        }
    }

    /// An empty tavern with short socket deadlines. Tests use this.
    #[must_use]
    pub fn for_socket_tests(hello_wait: std::time::Duration, silence: std::time::Duration) -> Self {
        Self {
            hello_wait,
            silence,
            ..Self::new()
        }
    }

    /// Connect to Postgres and apply migrations.
    ///
    /// # Errors
    ///
    /// The database is unreachable or a migration fails.
    pub async fn connect(url: &str) -> Result<Self, String> {
        let store = Store::connect(url).await?;
        let saved = store.load_open().await.map_err(|err| format!("{err:?}"))?;
        let mut world = World::new();
        world.resume(saved.into_iter().filter_map(restore_game).collect());
        let trusted = TrustedProxies::from_env()?;
        Ok(Self::with_store(store, world, Budgets::standard(), trusted))
    }

    /// A migrated pool, a queue wait, and rate budgets. Tests use this.
    #[must_use]
    pub fn for_tests(pool: sqlx::PgPool, fill: std::time::Duration, budgets: Budgets) -> Self {
        Self::with_store(
            Store::from_pool(pool),
            World::with_fill(fill),
            budgets,
            TrustedProxies::none(),
        )
    }

    fn with_store(store: Store, world: World, budgets: Budgets, trusted: TrustedProxies) -> Self {
        Self {
            world: Arc::new(Mutex::new(world)),
            store: Some(store),
            rates: RateGate::new(budgets),
            trusted,
            hello_wait: std::time::Duration::from_secs(5),
            silence: std::time::Duration::from_secs(45),
        }
    }

    /// Run due bot moves and deadlines, then store any game that finished.
    ///
    /// The socket does not wait on this. A click is answered before the log is written.
    pub async fn tick(&self) {
        let reports = self.world.lock().await.tick();
        self.settle(reports).await;
        self.persist_penalties().await;
        self.persist_open().await;
    }

    /// Move the table clock. Tests use this to play a game out.
    #[cfg(test)]
    pub async fn advance(&self, by: std::time::Duration) {
        let reports = self.world.lock().await.advance(by);
        self.settle(reports).await;
    }

    /// One seated player and their cards, in the live world.
    #[cfg(test)]
    pub async fn live_hand(&self) -> Option<(skt_protocol::UserId, Vec<u8>)> {
        self.world.lock().await.first_hand()
    }

    /// Replay running games from Postgres into a new world. Tests use this.
    #[cfg(test)]
    pub async fn restored_hand(&self, user: &skt_protocol::UserId) -> Option<Vec<u8>> {
        self.persist_open().await;
        let saved = self.store.as_ref()?.load_open().await.ok()?;
        let mut world = World::new();
        world.resume(saved.into_iter().filter_map(restore_game).collect());
        world.hand(user)
    }

    /// Log length of a reloaded solo game, before and after 30 seconds on the new clock.
    ///
    /// A paused solo game stays the same length. Tests use this.
    #[cfg(test)]
    pub async fn reloaded_log_len(&self, user: &skt_protocol::UserId) -> Option<(usize, usize)> {
        self.persist_open().await;
        let saved = self.store.as_ref()?.load_open().await.ok()?;
        let mut world = World::new();
        world.resume(saved.into_iter().filter_map(restore_game).collect());
        let before = world.log_len(user)?;
        let _ = world.advance(std::time::Duration::from_secs(30));
        let after = world.log_len(user)?;
        Some((before, after))
    }

    /// The solo seat is offline. Tests wait until a closed socket has been noticed.
    #[cfg(test)]
    pub async fn solo_seat_offline(&self, user: &skt_protocol::UserId) -> bool {
        self.world.lock().await.solo_seat_offline(user)
    }

    /// Store leave penalties queued by the last socket messages.
    pub async fn persist_penalties(&self) {
        let pending = self.world.lock().await.take_penalties();
        let Some(store) = &self.store else {
            return;
        };
        for penalty in pending {
            let season = i32::try_from(penalty.season).unwrap_or(i32::MAX);
            let leaves = i32::try_from(penalty.leaves).unwrap_or(i32::MAX);
            if store
                .write_penalty(penalty.user.as_str(), season, leaves, penalty.until)
                .await
                .is_err()
            {
                tracing::error!("penalty was not stored");
            }
        }
    }

    async fn settle(&self, reports: Vec<crate::world::GameReport>) {
        for report in reports {
            let stored = if let Some(store) = &self.store {
                store.record(&report).await.is_ok()
            } else {
                true
            };
            {
                let mut world = self.world.lock().await;
                world.deliver(&report);
                if stored {
                    world.apply_report(&report);
                }
            }
            self.persist_penalties().await;
        }
        self.persist_open().await;
    }

    /// Write steps of games that are still running, and delete games the last human resigned.
    pub async fn persist_open(&self) {
        let (abandoned, pending) = {
            let mut world = self.world.lock().await;
            let abandoned = world.take_abandoned();
            (abandoned, world.checkpoint())
        };
        let Some(store) = &self.store else {
            return;
        };
        for id in abandoned {
            if store.drop_open(&id).await.is_err() {
                tracing::error!("a cancelled game was not deleted");
            }
        }
        for game in pending {
            let write = crate::store::OpenWrite {
                id: game.id.clone(),
                mode: game.mode,
                matchmade: game.matchmade,
                settings: serde_json::to_string(&game.settings).unwrap_or_else(|_| "{}".to_owned()),
                seats: game.seats,
                table_kind: game.table_kind,
                started_at: game.started_at,
                entries: game.entries,
            };
            if store.save_open(&write).await.is_ok() {
                self.world.lock().await.mark_stored(&game.id, game.stored);
            } else {
                tracing::error!("a running game was not stored");
            }
        }
    }

    /// The same write the tick uses, for a finished game the test already scored.
    #[cfg(test)]
    pub(crate) async fn record_for_test(&self, report: crate::world::GameReport) {
        let Some(store) = &self.store else {
            return;
        };
        store.record(&report).await.expect("record");
        let mut world = self.world.lock().await;
        world.deliver(&report);
        world.apply_report(&report);
    }
}

pub async fn metrics(State(state): State<AppState>) -> Json<skt_protocol::Metrics> {
    let (games, sockets, casual, ranked) = state.world.lock().await.counts();
    Json(skt_protocol::Metrics {
        games,
        sockets,
        casual,
        ranked,
    })
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
    limit(
        state
            .rates
            .register(&caller(&headers, peer, &state.trusted))
            .await,
    )?;
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
    limit(
        state
            .rates
            .login(&caller(&headers, peer, &state.trusted))
            .await,
    )?;
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
    // Human: The ladder already shows this rating. The profile was dropping it.
    // Agent: READS stored skill; WRITES Profile.rating and user.tier. A season with no finished game stays unrated.
    let now = crate::world::identity::unix_now().get();
    let rating = snap.skill.as_ref().and_then(|stored| {
        let shown = crate::rating::shown(*stored, now);
        (shown.games > 0).then(|| crate::rating::to_rating(shown))
    });
    let mut user = snap.user;
    user.tier = rating.as_ref().map(|rating| rating.tier.clone());
    Ok(Json(Profile {
        user,
        stats: snap.stats,
        rating,
    }))
}

pub async fn my_games(
    State(state): State<AppState>,
    headers: HeaderMap,
    request: Request,
) -> Result<Json<skt_protocol::GamePage>, AppError> {
    let token = session_cookie(&headers).ok_or(AppError::new(ErrorCode::Unauthenticated))?;
    remember(&state, &token).await?;
    let user = state
        .world
        .lock()
        .await
        .me(&token)
        .map_err(AppError::new)?
        .user
        .id;
    let asked = parse_games(request.uri().query().unwrap_or(""))?;
    let store = state
        .store
        .clone()
        .ok_or(AppError::new(ErrorCode::Internal))?;
    store
        .game_page(user.as_str(), asked.limit, asked.after.as_deref())
        .await
        .map(Json)
        .map_err(|err| failure(&err))
}

struct GamesAsked {
    limit: i64,
    after: Option<String>,
}

fn parse_games(query: &str) -> Result<GamesAsked, AppError> {
    let mut limit = 25i64;
    let mut after = None;
    if query.is_empty() {
        return Ok(GamesAsked { limit, after });
    }
    for pair in query.split('&') {
        let (key, raw) = pair.split_once('=').unwrap_or((pair, ""));
        let value = form_decode(raw);
        match key {
            "limit" => {
                let parsed = value
                    .parse::<i64>()
                    .map_err(|_| AppError::new(ErrorCode::Validation))?;
                if !(1..=100).contains(&parsed) {
                    return Err(AppError::new(ErrorCode::Validation));
                }
                limit = parsed;
            }
            "after" => {
                if value.is_empty() {
                    return Err(AppError::new(ErrorCode::Validation));
                }
                after = Some(value);
            }
            _ => {}
        }
    }
    Ok(GamesAsked { limit, after })
}

pub async fn lobbies(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<skt_protocol::LobbyList>, AppError> {
    let token = session_cookie(&headers).ok_or(AppError::new(ErrorCode::Unauthenticated))?;
    remember(&state, &token).await?;
    let mut world = state.world.lock().await;
    world.ensure_house_tables();
    Ok(Json(world.public_lobbies()))
}

pub async fn game_log(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<skt_protocol::ActionLog>, AppError> {
    let token = session_cookie(&headers).ok_or(AppError::new(ErrorCode::Unauthenticated))?;
    remember(&state, &token).await?;
    let user = state
        .world
        .lock()
        .await
        .me(&token)
        .map_err(AppError::new)?
        .user
        .id;
    let store = state
        .store
        .clone()
        .ok_or(AppError::new(ErrorCode::Internal))?;
    let rows = store
        .action_log(&id, user.as_str())
        .await
        .map_err(|err| failure(&err))?;
    let Some(rows) = rows else {
        return Err(AppError::new(ErrorCode::NotFound));
    };
    let entries = rows
        .into_iter()
        .map(|(seq, kind, seat, body)| skt_protocol::ActionLogEntry {
            seq: u32::try_from(seq).unwrap_or(u32::MAX),
            kind,
            seat: seat.and_then(|value| u8::try_from(value).ok()),
            body,
        })
        .collect();
    Ok(Json(skt_protocol::ActionLog {
        game_id: skt_protocol::GameId::new(id),
        entries,
    }))
}

// Human: The landing shows this list to a visitor, and a visit must not create a guest.
// Agent: HTTP GET /api/v1/ladder; no session; DB store.ladder for the current season only.
pub async fn ladder(
    State(state): State<AppState>,
    request: Request,
) -> Result<Json<skt_protocol::LadderPage>, AppError> {
    let asked = parse_ladder(request.uri().query().unwrap_or(""))?;
    let season = crate::rating::season_at(crate::world::identity::unix_now().get());
    if let Some(id) = asked.season
        && id != season.id
    {
        return Err(AppError::new(ErrorCode::NotFound));
    }
    let store = state
        .store
        .clone()
        .ok_or(AppError::new(ErrorCode::Internal))?;
    let rows = store
        .ladder(i32::try_from(season.id).unwrap_or(i32::MAX))
        .await
        .map_err(|err| failure(&err))?;
    Ok(Json(page_ladder(
        &season,
        &rows,
        asked.limit,
        asked.after.as_deref(),
    )?))
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
    let hello_wait = state.hello_wait;
    let silence_for = state.silence;
    let started = tokio::time::Instant::now();
    let mut last_heard = started;
    let mut greeted = false;
    let mut stamps = std::collections::VecDeque::new();
    loop {
        if socket_expired(greeted, started, last_heard, hello_wait, silence_for) {
            let _ = close_socket(&mut socket, 1000).await;
            break;
        }
        let wait = next_deadline(greeted, started, last_heard, hello_wait, silence_for);
        // Human: A click is answered before the game log is written. The tick stores the log.
        // Agent: SENDS queued frames first; CALLS on_message; does not await persist on this path.
        tokio::select! {
            biased;
            outgoing = inbound.recv() => {
                let Some(frame) = outgoing else { break; };
                match frame {
                    Wire::Text(text) => {
                        if socket.send(Message::Text(text.into())).await.is_err() {
                            break;
                        }
                    }
                    Wire::Close(code) => {
                        let _ = close_socket(&mut socket, code).await;
                        break;
                    }
                }
            }
            incoming = socket.recv() => {
                let Some(Ok(message)) = incoming else { break; };
                let Message::Text(text) = message else { continue; };
                last_heard = tokio::time::Instant::now();
                if text.len() > 4096 {
                    let _ = close_socket(&mut socket, 1009).await;
                    break;
                }
                if serde_json::from_str::<serde_json::Value>(text.as_str()).is_err() {
                    let _ = close_socket(&mut socket, 1003).await;
                    break;
                }
                if too_many(&mut stamps) {
                    let id = crate::world::message_id(text.as_str())
                        .unwrap_or(skt_protocol::MessageId::new(0));
                    state
                        .world
                        .lock()
                        .await
                        .reject(&user, conn, id, skt_protocol::ErrorCode::RateLimited);
                    continue;
                }
                state.world.lock().await.on_message(&user, conn, &text);
                if !greeted && state.world.lock().await.greeted(&user, conn) {
                    greeted = true;
                }
            }
            () = tokio::time::sleep(wait) => {}
        }
    }
    state.world.lock().await.disconnect(&user, conn);
}

fn socket_expired(
    greeted: bool,
    started: tokio::time::Instant,
    last_heard: tokio::time::Instant,
    hello_wait: std::time::Duration,
    silence_for: std::time::Duration,
) -> bool {
    (!greeted && started.elapsed() >= hello_wait) || last_heard.elapsed() >= silence_for
}

fn next_deadline(
    greeted: bool,
    started: tokio::time::Instant,
    last_heard: tokio::time::Instant,
    hello_wait: std::time::Duration,
    silence_for: std::time::Duration,
) -> std::time::Duration {
    let silence_left = silence_for.saturating_sub(last_heard.elapsed());
    if greeted {
        return silence_left;
    }
    silence_left.min(hello_wait.saturating_sub(started.elapsed()))
}

fn too_many(stamps: &mut std::collections::VecDeque<tokio::time::Instant>) -> bool {
    let now = tokio::time::Instant::now();
    while stamps.front().is_some_and(|stamp| {
        now.saturating_duration_since(*stamp) >= std::time::Duration::from_secs(1)
    }) {
        stamps.pop_front();
    }
    if stamps.len() >= 20 {
        return true;
    }
    stamps.push_back(now);
    false
}

async fn close_socket(socket: &mut WebSocket, code: u16) -> bool {
    socket
        .send(Message::Close(Some(CloseFrame {
            code,
            reason: "".into(),
        })))
        .await
        .is_ok()
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

struct Asked {
    season: Option<u32>,
    limit: usize,
    after: Option<String>,
}

fn parse_ladder(query: &str) -> Result<Asked, AppError> {
    let mut season = None;
    let mut limit = 25usize;
    let mut after = None;
    if query.is_empty() {
        return Ok(Asked {
            season,
            limit,
            after,
        });
    }
    for pair in query.split('&') {
        let (key, raw) = pair.split_once('=').unwrap_or((pair, ""));
        let value = form_decode(raw);
        match key {
            "season" => {
                season = Some(
                    value
                        .parse()
                        .map_err(|_| AppError::new(ErrorCode::NotFound))?,
                );
            }
            "limit" => {
                let parsed = value
                    .parse::<u32>()
                    .map_err(|_| AppError::new(ErrorCode::Validation))?;
                if !(1..=100).contains(&parsed) {
                    return Err(AppError::new(ErrorCode::Validation));
                }
                limit = usize::try_from(parsed).unwrap_or(25);
            }
            "after" => {
                if value.is_empty() {
                    return Err(AppError::new(ErrorCode::Validation));
                }
                after = Some(value);
            }
            _ => {}
        }
    }
    Ok(Asked {
        season,
        limit,
        after,
    })
}

fn page_ladder(
    season: &skt_protocol::Season,
    rows: &[crate::store::LadderRow],
    limit: usize,
    after: Option<&str>,
) -> Result<skt_protocol::LadderPage, AppError> {
    let start = if let Some(after) = after {
        rows.iter()
            .position(|row| row.id == after)
            .ok_or(AppError::new(ErrorCode::Validation))?
            .saturating_add(1)
    } else {
        0
    };
    let end = start.saturating_add(limit).min(rows.len());
    let entries = rows
        .get(start..end)
        .unwrap_or(&[])
        .iter()
        .enumerate()
        .map(|(offset, row)| {
            let skill = crate::rating::PlayerSkill {
                mu: row.mu,
                sigma: row.sigma,
                games: row.games,
            };
            let rating = crate::rating::to_rating(skill);
            skt_protocol::LadderEntry {
                rank: u32::try_from(start.saturating_add(offset).saturating_add(1)).unwrap_or(0),
                user: skt_protocol::User {
                    id: skt_protocol::UserId::new(row.id.clone()),
                    name: row.name.clone(),
                    color: row.color,
                    tier: Some(rating.tier.clone()),
                },
                rating,
            }
        })
        .collect();
    let next = (end < rows.len())
        .then(|| rows.get(end.saturating_sub(1)).map(|row| row.id.clone()))
        .flatten();
    Ok(skt_protocol::LadderPage {
        season: season.clone(),
        entries,
        next,
    })
}

fn form_decode(value: &str) -> String {
    let mut out = String::new();
    let bytes = value.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%'
            && let Some(hex) = bytes.get(index + 1..index + 3)
            && let Ok(text) = std::str::from_utf8(hex)
            && let Ok(byte) = u8::from_str_radix(text, 16)
        {
            out.push(char::from(byte));
            index += 3;
            continue;
        }
        if bytes[index] == b'+' {
            out.push(' ');
        } else {
            out.push(char::from(bytes[index]));
        }
        index += 1;
    }
    out
}

fn failure(err: &StoreFailure) -> AppError {
    AppError::new(match err {
        StoreFailure::Database => ErrorCode::Internal,
        StoreFailure::UsernameTaken => ErrorCode::UsernameTaken,
        StoreFailure::InvalidCredentials => ErrorCode::InvalidCredentials,
        StoreFailure::Unauthenticated => ErrorCode::Unauthenticated,
        StoreFailure::NotFound => ErrorCode::NotFound,
        StoreFailure::AlreadyRegistered => ErrorCode::AlreadyRegistered,
        StoreFailure::Validation => ErrorCode::Validation,
    })
}

fn limit(result: Result<(), u64>) -> Result<(), AppError> {
    match result {
        Ok(()) => Ok(()),
        Err(seconds) => Err(AppError::limited(seconds)),
    }
}

fn caller(headers: &HeaderMap, peer: SocketAddr, trusted: &TrustedProxies) -> String {
    client_key(
        peer,
        headers
            .get("x-forwarded-for")
            .and_then(|value| value.to_str().ok()),
        headers
            .get("x-real-ip")
            .and_then(|value| value.to_str().ok()),
        trusted,
    )
}

fn valid_username(value: &str) -> bool {
    let count = value.chars().count();
    (3..=16).contains(&count)
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '_')
}

fn restore_game(game: crate::store::SavedGame) -> Option<crate::world::RestoredGame> {
    let settings = serde_json::from_str(&game.settings).ok()?;
    let seats = serde_json::from_str::<Vec<crate::world::RestoredSeat>>(&game.seats).ok()?;
    let log = game
        .log
        .into_iter()
        .map(|(_seq, kind, seat, body)| crate::world::Step {
            kind,
            seat: seat.and_then(|value| u8::try_from(value).ok()),
            body,
        })
        .collect();
    Some(crate::world::RestoredGame {
        id: game.id,
        mode: game.mode,
        matchmade: game.matchmade,
        table_kind: game.table_kind,
        started_at: game.started_at,
        settings,
        seats,
        log,
    })
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
