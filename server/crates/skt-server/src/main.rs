//! Skull King Tavern server. Binds `127.0.0.1:8080` and serves `GET /api/v1/health`.

use skt_server::router;

#[tokio::main]
async fn main() -> Result<(), std::io::Error> {
    if tracing_subscriber::fmt().try_init().is_err() {
        eprintln!("tracing subscriber was already installed");
    }
    let listener = tokio::net::TcpListener::bind("127.0.0.1:8080").await?;
    tracing::info!("listening on 127.0.0.1:8080");
    axum::serve(listener, router()).await
}
