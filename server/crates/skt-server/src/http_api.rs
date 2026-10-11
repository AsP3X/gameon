//! Session routes and the socket upgrade.

use std::sync::Arc;

use axum::Json;
use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::http::{HeaderMap, HeaderValue, header};
use axum::response::{IntoResponse, Response};
use skt_protocol::{ErrorCode, Me, ServerConfig};
use tokio::sync::{Mutex, mpsc};

use crate::AppError;
use crate::origin;
use crate::world::World;

/// Shared rooms for HTTP and the socket.
#[derive(Clone)]
pub struct AppState {
    world: Arc<Mutex<World>>,
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
        }
    }

    /// Run due bot moves and deadlines.
    pub async fn tick(&self) {
        self.world.lock().await.tick();
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
    let (token, me) = state.world.lock().await.guest(existing.as_deref());
    Ok(with_cookie(Json(me), &token))
}

pub async fn me(State(state): State<AppState>, headers: HeaderMap) -> Result<Json<Me>, AppError> {
    let token = session_cookie(&headers).ok_or(AppError::new(ErrorCode::Unauthenticated))?;
    state
        .world
        .lock()
        .await
        .me(&token)
        .map(Json)
        .map_err(AppError::new)
}

pub async fn socket(
    State(state): State<AppState>,
    headers: HeaderMap,
    upgrade: WebSocketUpgrade,
) -> Result<Response, AppError> {
    origin::check_origin(header_str(&headers, header::ORIGIN))?;
    let token = session_cookie(&headers).ok_or(AppError::new(ErrorCode::Unauthenticated))?;
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
    inbound: &mut mpsc::UnboundedReceiver<String>,
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
                if socket.send(Message::Text(frame.into())).await.is_err() {
                    break;
                }
            }
        }
    }
    state.world.lock().await.disconnect(&user, conn);
}

fn with_cookie(body: Json<Me>, token: &str) -> Response {
    let mut response = body.into_response();
    let cookie = format!("skt_session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000");
    if let Ok(value) = HeaderValue::from_str(&cookie) {
        response.headers_mut().insert(header::SET_COOKIE, value);
    }
    response
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
