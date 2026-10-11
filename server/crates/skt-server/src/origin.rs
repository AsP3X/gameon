//! Development origins. Production is a fixed site origin; this process allows local pages.

/// `http://localhost` and `http://127.0.0.1`, with or without a port.
#[must_use]
pub fn origin_allowed(value: &str) -> bool {
    let rest = value
        .strip_prefix("http://localhost")
        .or_else(|| value.strip_prefix("http://127.0.0.1"));
    match rest {
        Some(rest) => rest.is_empty() || rest.starts_with(':'),
        None => false,
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
    use super::origin_allowed;

    #[test]
    fn local_pages_are_allowed() {
        assert!(origin_allowed("http://localhost"));
        assert!(origin_allowed("http://localhost:5173"));
        assert!(origin_allowed("http://localhost:54659"));
        assert!(origin_allowed("http://127.0.0.1:8080"));
        assert!(!origin_allowed("http://localhost.evil.com"));
        assert!(!origin_allowed("https://localhost:5173"));
        assert!(!origin_allowed("http://example.com"));
    }
}
