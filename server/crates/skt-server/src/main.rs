//! Account API.
//!
//! Listens on `HOST`:`PORT`, which defaults to `127.0.0.1:8080`. Lobbies and tables are
//! `skt-game`, not this process.

use skt_server::{AppState, api_router};

#[tokio::main]
async fn main() -> Result<(), std::io::Error> {
    skt_server::init_subscriber();
    let database = std::env::var("DATABASE_URL").map_err(|_| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "DATABASE_URL is required")
    })?;
    let state = AppState::connect_accounts(&database)
        .await
        .map_err(std::io::Error::other)?;
    let address = listen_on()?;
    let listener = tokio::net::TcpListener::bind(&address).await?;
    tracing::info!("accounts listening on {address}");
    axum::serve(
        listener,
        api_router(state).into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown())
    .await
}

/// SIGINT or SIGTERM. Deploy sends SIGTERM. Running games stay in `open_games` and are replayed
/// on the next start.
async fn shutdown() {
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

/// `HOST` and `PORT` from the environment, or `127.0.0.1:8080`.
fn listen_on() -> Result<String, std::io::Error> {
    let host = std::env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_owned());
    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".to_owned());
    if host.is_empty()
        || host.chars().any(char::is_whitespace)
        || (host.contains(':') && !host.starts_with('['))
    {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "HOST must be a hostname or an IPv4 address",
        ));
    }
    if port.parse::<u16>().is_err() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "PORT is not a tcp port",
        ));
    }
    Ok(format!("{host}:{port}"))
}
