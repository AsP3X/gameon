//! Tracing for the API process.
//!
//! Human: The Logging dialog writes `RUST_LOG`. `RUST_LOG_FORMAT` is text or json and that
//! dialog does not edit it. A request line names the route template, never the path or query
//! the client sent.
//! Agent: CALLS `init_subscriber` once from `main` before other work; READS `RUST_LOG` and
//! `RUST_LOG_FORMAT`; never logs a session token, password, hand, pile or unrevealed bid.

use std::time::Duration;

use axum::Router;
use axum::extract::{MatchedPath, Request};
use axum::http::{HeaderName, HeaderValue};
use axum::middleware::Next;
use axum::response::Response;
use rand::Rng;
use tower_http::LatencyUnit;
use tower_http::classify::ServerErrorsFailureClass;
use tower_http::trace::{DefaultOnResponse, TraceLayer};
use tracing::{Level, Span};
use tracing_subscriber::EnvFilter;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

use crate::AppState;

/// Directive used when `RUST_LOG` is unset. The dialog's default `info` replaces this.
const DEFAULT_FILTER: &str = "info,skt_server=info,tower_http=info,sqlx=warn";

/// Header echoed on the response so a caller can match one log line.
pub(crate) const REQUEST_ID_HEADER: HeaderName = HeaderName::from_static("x-request-id");

/// Filter for a process started without `RUST_LOG`.
///
/// # Panics
///
/// Panics if [`DEFAULT_FILTER`] is not a tracing directive. That string is fixed in this file.
#[must_use]
pub fn default_env_filter() -> EnvFilter {
    EnvFilter::try_new(DEFAULT_FILTER).expect("default tracing filter")
}

/// Install the process subscriber. Text, unless `RUST_LOG_FORMAT` is `json`.
pub fn init_subscriber() {
    let json = format_is_json(std::env::var("RUST_LOG_FORMAT").ok().as_deref());
    let installed = if json {
        tracing_subscriber::registry()
            .with(filter_from_env())
            .with(tracing_subscriber::fmt::layer().json())
            .try_init()
    } else {
        tracing_subscriber::registry()
            .with(filter_from_env())
            .with(text_layer(std::io::stdout, stdout_is_terminal()))
            .try_init()
    };
    if installed.is_err() {
        eprintln!("tracing subscriber was already installed");
        return;
    }
    tracing::info!(
        rust_log = %std::env::var("RUST_LOG").unwrap_or_else(|_| "(default)".into()),
        format = if json { "json" } else { "text" },
        "tracing subscriber initialized"
    );
}

/// Request id, then a span around the matched route. The id runs first.
pub(crate) fn trace(router: Router<AppState>) -> Router<AppState> {
    router
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(make_request_span)
                .on_response(
                    DefaultOnResponse::new()
                        .level(Level::DEBUG)
                        .latency_unit(LatencyUnit::Millis),
                )
                .on_failure(on_http_failure),
        )
        .layer(axum::middleware::from_fn(request_id_middleware))
}

fn filter_from_env() -> EnvFilter {
    EnvFilter::try_from_default_env().unwrap_or_else(|_| default_env_filter())
}

/// `json` in either case. Anything else, including a missing value, is text.
fn format_is_json(value: Option<&str>) -> bool {
    value.is_some_and(|value| value.eq_ignore_ascii_case("json"))
}

fn stdout_is_terminal() -> bool {
    std::io::IsTerminal::is_terminal(&std::io::stdout())
}

/// Text line: time, level, target, message. No thread, file or line.
fn text_layer<S, W>(
    writer: W,
    ansi: bool,
) -> tracing_subscriber::fmt::Layer<
    S,
    tracing_subscriber::fmt::format::DefaultFields,
    tracing_subscriber::fmt::format::Format,
    W,
>
where
    W: for<'writer> tracing_subscriber::fmt::MakeWriter<'writer> + Send + Sync + 'static,
{
    tracing_subscriber::fmt::layer()
        .with_writer(writer)
        .with_ansi(ansi)
        .with_target(true)
        .with_thread_ids(false)
        .with_thread_names(false)
        .with_file(false)
        .with_line_number(false)
}

/// The route template (`/api/v1/users/{id}`), or `(no route)`.
fn route_of(request: &Request) -> &str {
    request
        .extensions()
        .get::<MatchedPath>()
        .map_or("(no route)", MatchedPath::as_str)
}

fn make_request_span(request: &Request) -> Span {
    let request_id = request
        .headers()
        .get(&REQUEST_ID_HEADER)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("missing");
    tracing::info_span!(
        "http.request",
        request_id = %request_id,
        method = %request.method(),
        route = %route_of(request),
        version = ?request.version(),
    )
}

fn on_http_failure(error: ServerErrorsFailureClass, latency: Duration, span: &Span) {
    let error = match error {
        ServerErrorsFailureClass::StatusCode(code) => format!("Status code: {code}"),
        ServerErrorsFailureClass::Error(error) => format!("Error: {error}"),
    };
    tracing::error!(
        parent: span,
        error = %error,
        latency_ms = u64::try_from(latency.as_millis()).unwrap_or(u64::MAX),
        "http request failed"
    );
}

async fn request_id_middleware(mut request: Request, next: Next) -> Response {
    let supplied = request
        .headers()
        .get(&REQUEST_ID_HEADER)
        .and_then(|value| value.to_str().ok());
    let request_id = request_id_from(supplied);
    if let Ok(value) = HeaderValue::from_str(&request_id) {
        request
            .headers_mut()
            .insert(REQUEST_ID_HEADER, value.clone());
        let mut response = next.run(request).await;
        response.headers_mut().insert(REQUEST_ID_HEADER, value);
        response
    } else {
        next.run(request).await
    }
}

/// Keep a caller id that cannot break a log line. Otherwise mint 32 hex characters.
fn request_id_from(supplied: Option<&str>) -> String {
    if let Some(supplied) = supplied.filter(|value| acceptable_request_id(value)) {
        return supplied.to_owned();
    }
    let mut bytes = [0_u8; 16];
    rand::rng().fill(&mut bytes);
    let mut id = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        id.push(hex_digit(byte >> 4));
        id.push(hex_digit(byte & 0x0f));
    }
    id
}

/// One log field: letters, digits and `._-`, at most 128 characters.
fn acceptable_request_id(value: &str) -> bool {
    (1..=128).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
}

fn hex_digit(nibble: u8) -> char {
    char::from(b"0123456789abcdef"[usize::from(nibble)])
}

#[cfg(test)]
mod tests {
    use std::io::{self, Write};
    use std::sync::{Arc, Mutex};

    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt;
    use tracing_subscriber::EnvFilter;
    use tracing_subscriber::layer::SubscriberExt;

    use super::{
        DEFAULT_FILTER, REQUEST_ID_HEADER, acceptable_request_id, format_is_json, request_id_from,
        text_layer,
    };

    #[test]
    fn default_filter_parses_and_quiets_sql() {
        let _ = EnvFilter::try_new(DEFAULT_FILTER).expect("default filter");
        assert!(DEFAULT_FILTER.contains("sqlx=warn"));
    }

    #[test]
    fn dialog_levels_are_tracing_filters() {
        for level in [
            "error",
            "warn",
            "info",
            "debug",
            "trace",
            "off",
            "skt_server=debug",
            "info,skt_server=debug,sqlx=warn",
        ] {
            EnvFilter::try_new(level).unwrap_or_else(|_| panic!("filter {level}"));
        }
    }

    #[test]
    fn only_json_selects_json_lines() {
        assert!(format_is_json(Some("json")));
        assert!(format_is_json(Some("JSON")));
        assert!(!format_is_json(Some("text")));
        assert!(!format_is_json(Some("")));
        assert!(!format_is_json(None));
    }

    #[test]
    fn request_id_keeps_a_safe_caller_value() {
        assert_eq!(request_id_from(Some("abc-123")), "abc-123");
        let minted = request_id_from(Some("bad id\n"));
        assert_eq!(minted.len(), 32);
        assert!(acceptable_request_id(&minted));
        assert_ne!(request_id_from(None), request_id_from(None));
    }

    #[test]
    fn text_line_names_the_target_and_not_the_file() {
        let line = capture(false);
        assert!(
            line.contains(" INFO skt_server: listening"),
            "line was {line:?}"
        );
        assert!(!line.contains(".rs"), "line was {line:?}");
        assert!(!line.contains("ThreadId"), "line was {line:?}");
        assert!(!line.contains('\u{1b}'), "line was {line:?}");
    }

    #[test]
    fn json_line_names_the_target() {
        let line = capture(true);
        let value: serde_json::Value = serde_json::from_str(line.trim()).expect("json log");
        assert_eq!(value["level"], "INFO");
        assert_eq!(value["target"], "skt_server");
        assert_eq!(value["fields"]["message"], "listening");
    }

    #[tokio::test]
    async fn response_echoes_the_request_id() {
        let response = crate::router(crate::AppState::new())
            .oneshot(
                Request::builder()
                    .uri("/api/v1/health")
                    .header(REQUEST_ID_HEADER.as_str(), "table-9")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response
                .headers()
                .get(&REQUEST_ID_HEADER)
                .and_then(|value| value.to_str().ok()),
            Some("table-9")
        );
    }

    fn capture(json: bool) -> String {
        let buffer = Arc::new(Mutex::new(Vec::<u8>::new()));
        let copied = Arc::clone(&buffer);
        let writer = move || Mem(Arc::clone(&copied));
        if json {
            let subscriber = tracing_subscriber::registry()
                .with(EnvFilter::new("info"))
                .with(tracing_subscriber::fmt::layer().json().with_writer(writer));
            tracing::subscriber::with_default(subscriber, || {
                tracing::info!(target: "skt_server", "listening");
            });
        } else {
            let subscriber = tracing_subscriber::registry()
                .with(EnvFilter::new("info"))
                .with(text_layer(writer, false));
            tracing::subscriber::with_default(subscriber, || {
                tracing::info!(target: "skt_server", "listening");
            });
        }
        let bytes = buffer.lock().expect("log buffer").clone();
        String::from_utf8(bytes).expect("utf-8 log")
    }

    struct Mem(Arc<Mutex<Vec<u8>>>);

    impl Write for Mem {
        fn write(&mut self, data: &[u8]) -> io::Result<usize> {
            self.0.lock().expect("log buffer").extend_from_slice(data);
            Ok(data.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }
}
