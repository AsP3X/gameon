//! Identifiers on the wire. UUID ids are strings. Times and message ids are JSON numbers.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// A user id. The text is a UUID string.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(type = "string", export_to = "UserId.ts")]
pub struct UserId(String);

impl UserId {
    /// Wraps an id the caller has already checked.
    #[must_use]
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    /// The id text.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// A lobby id. The text is a UUID string.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(type = "string", export_to = "LobbyId.ts")]
pub struct LobbyId(String);

impl LobbyId {
    /// Wraps an id the caller has already checked.
    #[must_use]
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    /// The id text.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// A game id. The text is a UUID string.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(type = "string", export_to = "GameId.ts")]
pub struct GameId(String);

impl GameId {
    /// Wraps an id the caller has already checked.
    #[must_use]
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    /// The id text.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Unix time in milliseconds.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(type = "number", export_to = "UnixMs.ts")]
pub struct UnixMs(i64);

impl UnixMs {
    /// Milliseconds since the Unix epoch.
    #[must_use]
    pub const fn new(millis: i64) -> Self {
        Self(millis)
    }

    /// The millisecond value.
    #[must_use]
    pub const fn get(self) -> i64 {
        self.0
    }
}

/// The client's correlation id for one socket message.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(type = "number", export_to = "MessageId.ts")]
pub struct MessageId(u32);

impl MessageId {
    /// A counter the client picked.
    #[must_use]
    pub const fn new(value: u32) -> Self {
        Self(value)
    }

    /// The numeric id.
    #[must_use]
    pub const fn get(self) -> u32 {
        self.0
    }
}
