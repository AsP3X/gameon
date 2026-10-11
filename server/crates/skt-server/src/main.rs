//! Skull King Tavern server.
//!
//! Listens on `HOST`:`PORT`, which defaults to `127.0.0.1:8080`. The container sets
//! `HOST=0.0.0.0` so nginx on the Docker network can reach it.

use std::time::Duration;

use skt_server::{AppState, router};

#[tokio::main]
async fn main() -> Result<(), std::io::Error> {
    if tracing_subscriber::fmt().try_init().is_err() {
        eprintln!("tracing subscriber was already installed");
    }
    let state = AppState::new();
    let ticking = state.clone();
    // One task for every table. It wakes every 200ms and holds the world lock only for the tick.
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(200));
        loop {
            interval.tick().await;
            ticking.tick().await;
        }
    });
    let address = listen_on()?;
    let listener = tokio::net::TcpListener::bind(&address).await?;
    tracing::info!("listening on {address}");
    axum::serve(listener, router(state)).await
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
