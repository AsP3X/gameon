//! Who may call a state-changing route.
//!
//! Local pages are always allowed. `SKT_PUBLIC_ORIGIN` adds the one site origin nginx serves
//! in production, for example `https://tavern.example`.

/// `http://localhost` and `http://127.0.0.1`, with or without a port, plus `SKT_PUBLIC_ORIGIN`.
#[must_use]
pub fn origin_allowed(value: &str) -> bool {
    origin_is_allowed(value, public_origin().as_deref())
}

fn origin_is_allowed(value: &str, public_origin: Option<&str>) -> bool {
    local_page(value) || public_origin.is_some_and(|origin| !origin.is_empty() && origin == value)
}

/// `http://localhost` and `http://127.0.0.1`, with or without a port.
fn local_page(value: &str) -> bool {
    let rest = value
        .strip_prefix("http://localhost")
        .or_else(|| value.strip_prefix("http://127.0.0.1"));
    match rest {
        Some(rest) => rest.is_empty() || rest.starts_with(':'),
        None => false,
    }
}

/// The site origin from `SKT_PUBLIC_ORIGIN`, without a trailing slash.
fn public_origin() -> Option<String> {
    let raw = std::env::var("SKT_PUBLIC_ORIGIN").ok()?;
    let origin = raw.trim().trim_end_matches('/');
    if origin.is_empty() {
        None
    } else {
        Some(origin.to_owned())
    }
}

/// The `Origin` header on a state-changing request or a socket upgrade.
pub fn check_origin(origin: Option<&str>) -> Result<(), crate::AppError> {
    match origin {
        Some(value) if origin_allowed(value) => Ok(()),
        _ => Err(crate::AppError::new(skt_protocol::ErrorCode::Forbidden)),
    }
}

#[cfg(test)]
mod tests {
    use super::{origin_allowed, origin_is_allowed};

    #[test]
    fn local_pages_are_allowed() {
        assert!(origin_allowed("http://localhost"));
        assert!(origin_allowed("http://localhost:5173"));
        assert!(origin_allowed("http://localhost:54659"));
        assert!(origin_allowed("http://127.0.0.1:8080"));
        assert!(!origin_allowed("http://localhost.evil.com"));
        assert!(!origin_allowed("https://localhost:5173"));
        assert!(!origin_allowed("http://example.com"));
        assert!(origin_is_allowed(
            "https://tavern.example",
            Some("https://tavern.example"),
        ));
        assert!(!origin_is_allowed(
            "https://tavern.example.evil",
            Some("https://tavern.example"),
        ));
        assert!(!origin_is_allowed("https://tavern.example", None));
    }
}
