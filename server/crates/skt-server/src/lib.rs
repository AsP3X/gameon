//! HTTP and WebSocket entry for Skull King Tavern.

#[cfg(test)]
mod phase2_tests;
#[cfg(test)]
mod phase3_tests;

mod http_api;
mod origin;
mod random;
mod rate;
mod rating;
mod store;
mod world;

pub use http_api::AppState;

use axum::Json;
use axum::Router;
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use skt_protocol::{ErrorBody, ErrorCode, ErrorObject, Health};

use http_api::{
    config, guest, ladder, lobbies, login, logout, me, patch_me, profile, register, socket,
};

/// Routes mounted at `/api/v1`.
pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/v1/health", get(health).fallback(method_not_allowed))
        .route("/api/v1/config", get(config).fallback(method_not_allowed))
        .route(
            "/api/v1/auth/guest",
            post(guest).fallback(method_not_allowed),
        )
        .route(
            "/api/v1/auth/register",
            post(register).fallback(method_not_allowed),
        )
        .route(
            "/api/v1/auth/login",
            post(login).fallback(method_not_allowed),
        )
        .route(
            "/api/v1/auth/logout",
            post(logout).fallback(method_not_allowed),
        )
        .route(
            "/api/v1/me",
            get(me).patch(patch_me).fallback(method_not_allowed),
        )
        .route(
            "/api/v1/users/{id}",
            get(profile).fallback(method_not_allowed),
        )
        .route("/api/v1/lobbies", get(lobbies).fallback(method_not_allowed))
        .route("/api/v1/ladder", get(ladder).fallback(method_not_allowed))
        .route("/api/v1/ws", get(socket).fallback(method_not_allowed))
        .fallback(not_found)
        .with_state(state)
}

async fn health() -> Json<Health> {
    std::future::ready(Json(Health { ok: true })).await
}

async fn not_found() -> AppError {
    std::future::ready(AppError::new(ErrorCode::NotFound)).await
}

async fn method_not_allowed() -> AppError {
    std::future::ready(AppError::new(ErrorCode::Validation)).await
}

/// An HTTP error under `/api/v1`. The status comes from [`ErrorCode::status`].
#[derive(Debug, Clone, Copy)]
pub struct AppError {
    code: ErrorCode,
    retry_after: Option<u64>,
}

impl AppError {
    /// An error with the default player-safe message for `code`.
    #[must_use]
    pub const fn new(code: ErrorCode) -> Self {
        Self {
            code,
            retry_after: None,
        }
    }

    /// `RATE_LIMITED` with a `Retry-After` of `seconds`.
    #[must_use]
    pub const fn limited(seconds: u64) -> Self {
        Self {
            code: ErrorCode::RateLimited,
            retry_after: Some(seconds),
        }
    }

    /// The protocol code.
    #[must_use]
    pub const fn code(self) -> ErrorCode {
        self.code
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.code.message())
    }
}

impl std::error::Error for AppError {}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let body = Json(ErrorBody {
            error: ErrorObject {
                code: self.code,
                message: self.code.message().to_owned(),
            },
        });
        let mut response = (http_status(self.code), body).into_response();
        if self.code == ErrorCode::RateLimited {
            let seconds = self.retry_after.unwrap_or(1).to_string();
            if let Ok(value) = HeaderValue::from_str(&seconds) {
                response.headers_mut().insert(header::RETRY_AFTER, value);
            }
        }
        response
    }
}

fn http_status(code: ErrorCode) -> StatusCode {
    match code.status() {
        400 => StatusCode::BAD_REQUEST,
        401 => StatusCode::UNAUTHORIZED,
        403 => StatusCode::FORBIDDEN,
        404 => StatusCode::NOT_FOUND,
        409 => StatusCode::CONFLICT,
        426 => StatusCode::UPGRADE_REQUIRED,
        429 => StatusCode::TOO_MANY_REQUESTS,
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

#[cfg(test)]
mod tests {
    use axum::body::Body;
    use axum::http::{Request, StatusCode, header};
    use axum::response::IntoResponse;
    use http_body_util::BodyExt;
    use skt_protocol::{ErrorBody, ErrorCode};
    use tower::ServiceExt;

    use super::{AppError, router};

    #[tokio::test]
    async fn health_is_ok() {
        let response = router(crate::AppState::new())
            .oneshot(
                Request::builder()
                    .uri("/api/v1/health")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        assert_eq!(bytes.as_ref(), br#"{"ok":true}"#);
    }

    #[tokio::test]
    async fn unknown_path_uses_the_envelope() {
        let response = router(crate::AppState::new())
            .oneshot(
                Request::builder()
                    .uri("/api/v1/missing")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        let bytes = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let body: ErrorBody = serde_json::from_slice(&bytes).expect("json");
        assert_eq!(body.error.code, ErrorCode::NotFound);
        assert_eq!(body.error.message, ErrorCode::NotFound.message());
    }

    #[tokio::test]
    async fn wrong_method_uses_the_envelope() {
        let response = router(crate::AppState::new())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/health")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let bytes = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let body: ErrorBody = serde_json::from_slice(&bytes).expect("json");
        assert_eq!(body.error.code, ErrorCode::Validation);
    }

    #[test]
    fn rate_limited_sets_retry_after() {
        let response = AppError::new(ErrorCode::RateLimited).into_response();
        assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
        let value = response.headers().get(header::RETRY_AFTER);
        assert_eq!(
            value.map(axum::http::HeaderValue::as_bytes),
            Some(&b"1"[..])
        );
    }
}
