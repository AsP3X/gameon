//! Ocho lobby and table server.
//!
//! This process does not serve accounts. A player signs in on the API, and this server
//! reads the same `skt_session` cookie. Listens on `OCHO_HOST`:`OCHO_PORT`, or
//! `127.0.0.1:8091`.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{ConnectInfo, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::IntoResponse;
use axum::routing::get;
use tokio::sync::mpsc;

mod room;

use room::{ClientMsg, Room};

/// Shared room.
#[derive(Clone)]
struct App {
    room: Arc<Room>,
}

#[tokio::main]
async fn main() -> Result<(), std::io::Error> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();
    let database = std::env::var("DATABASE_URL").map_err(|_| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "DATABASE_URL is required")
    })?;
    let room = Room::connect(&database)
        .await
        .map_err(std::io::Error::other)?;
    let ticking = room.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(30));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            interval.tick().await;
            ticking.sweep().await;
        }
    });
    let app = Router::new()
        .route("/ocho/v1/health", get(health))
        .route("/ocho/v1/ws", get(socket))
        .with_state(App { room });
    let address = listen_on()?;
    let listener = tokio::net::TcpListener::bind(&address).await?;
    tracing::info!("ocho listening on {address}");
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(async {
        let _ = tokio::signal::ctrl_c().await;
    })
    .await
}

async fn health() -> &'static str {
    "ok"
}

async fn socket(
    State(app): State<App>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
    ConnectInfo(_peer): ConnectInfo<SocketAddr>,
) -> Result<impl IntoResponse, StatusCode> {
    let token = session_cookie(&headers).ok_or(StatusCode::UNAUTHORIZED)?;
    let user = app
        .room
        .user(&token)
        .await
        .map_err(|()| StatusCode::UNAUTHORIZED)?;
    Ok(ws.on_upgrade(move |socket| drive(app.room, user, socket)))
}

async fn drive(room: Arc<Room>, user: room::User, mut socket: WebSocket) {
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    let generation = room.attach(user.id.clone(), tx).await;
    loop {
        tokio::select! {
            outgoing = rx.recv() => {
                let Some(text) = outgoing else { break };
                if socket.send(Message::Text(text.into())).await.is_err() {
                    break;
                }
            }
            incoming = socket.recv() => {
                let Some(Ok(message)) = incoming else { break };
                let Message::Text(text) = message else { continue };
                let Ok(msg) = serde_json::from_str::<ClientMsg>(&text) else {
                    let bad = r#"{"t":"err","re":0,"code":"VALIDATION","message":"bad message"}"#;
                    let _ = socket.send(Message::Text(bad.into())).await;
                    continue;
                };
                room.handle(&user, msg).await;
            }
        }
    }
    room.detach(&user.id, generation).await;
}

fn session_cookie(headers: &HeaderMap) -> Option<String> {
    let value = headers.get(header::COOKIE)?.to_str().ok()?;
    value.split(';').find_map(|part| {
        let (name, token) = part.trim().split_once('=')?;
        (name == "skt_session").then(|| token.to_owned())
    })
}

fn listen_on() -> Result<String, std::io::Error> {
    let host = std::env::var("OCHO_HOST").unwrap_or_else(|_| "127.0.0.1".to_owned());
    let port = std::env::var("OCHO_PORT").unwrap_or_else(|_| "8091".to_owned());
    if port.parse::<u16>().is_err() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "OCHO_PORT is not a tcp port",
        ));
    }
    Ok(format!("{host}:{port}"))
}
