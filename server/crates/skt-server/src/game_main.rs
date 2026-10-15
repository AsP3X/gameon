//! Skull King lobby and table server.
//!
//! Listens on `SKT_GAME_HOST`:`SKT_GAME_PORT`, or `127.0.0.1:8092`. Accounts stay on
//! `skt-server`. This process owns the socket, the public lobby list, and open games.

use std::time::Duration;

use skt_server::{AppState, game_router};

#[tokio::main]
async fn main() -> Result<(), std::io::Error> {
    skt_server::init_subscriber();
    let database = std::env::var("DATABASE_URL").map_err(|_| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "DATABASE_URL is required")
    })?;
    let state = AppState::connect(&database)
        .await
        .map_err(std::io::Error::other)?;
    let ticking = state.clone();
    // One task for every table. It wakes every 200ms and holds the world lock only for the tick.
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(200));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            interval.tick().await;
            ticking.tick().await;
        }
    });
    let address = listen_on()?;
    let listener = tokio::net::TcpListener::bind(&address).await?;
    tracing::info!("skull king listening on {address}");
    let draining = state.clone();
    axum::serve(
        listener,
        game_router(state).into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .with_graceful_shutdown(async move {
        shutdown().await;
        tracing::info!("draining");
        draining.persist_open().await;
    })
    .await
}

/// SIGINT, and SIGTERM on Unix. Deploy sends SIGTERM, then this process writes open games.
async fn shutdown() {
    // Human: Docker stops the process with SIGTERM. Windows has no SIGTERM, so Ctrl-C is the stop.
    // Agent: CALLS tokio::signal::ctrl_c; on unix also waits for SIGTERM; RETURNS when either fires.
    #[cfg(unix)]
    {
        let mut terminate =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()).ok();
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {}
            () = async {
                if let Some(terminate) = terminate.as_mut() {
                    terminate.recv().await;
                } else {
                    std::future::pending::<()>().await;
                }
            } => {}
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}

fn listen_on() -> Result<String, std::io::Error> {
    let host = std::env::var("SKT_GAME_HOST").unwrap_or_else(|_| "127.0.0.1".to_owned());
    let port = std::env::var("SKT_GAME_PORT").unwrap_or_else(|_| "8092".to_owned());
    if port.parse::<u16>().is_err() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "SKT_GAME_PORT is not a tcp port",
        ));
    }
    Ok(format!("{host}:{port}"))
}
