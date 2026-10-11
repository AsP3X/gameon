//! Skull King Tavern server. Binds `127.0.0.1:8080`.

use std::time::Duration;

use skt_server::{AppState, router};

#[tokio::main]
async fn main() -> Result<(), std::io::Error> {
    if tracing_subscriber::fmt().try_init().is_err() {
        eprintln!("tracing subscriber was already installed");
    }
    let state = AppState::new();
    let ticking = state.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(200));
        loop {
            interval.tick().await;
            ticking.tick().await;
        }
    });
    let listener = tokio::net::TcpListener::bind("127.0.0.1:8080").await?;
    tracing::info!("listening on 127.0.0.1:8080");
    axum::serve(listener, router(state)).await
}
