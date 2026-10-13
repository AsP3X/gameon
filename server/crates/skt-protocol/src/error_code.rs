//! Error codes from `docs/protocol.md`. The client branches on `code`, never on `message`.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// A player-safe error. `message` is showable copy. Details stay in the server log.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(rename_all = "SCREAMING_SNAKE_CASE", export_to = "ErrorCode.ts")]
pub enum ErrorCode {
    /// No valid session.
    Unauthenticated,
    /// Not allowed, including a rejected origin.
    Forbidden,
    /// No such user, lobby, or game.
    NotFound,
    /// Malformed or out-of-range input.
    Validation,
    /// Too many requests. REST adds `Retry-After`.
    RateLimited,
    /// The client's protocol version is not spoken.
    ProtocolUnsupported,
    /// That username is already registered.
    UsernameTaken,
    /// The username fails the length, character, or reserved-name check.
    UsernameInvalid,
    /// The password does not meet the strength rule.
    WeakPassword,
    /// The username and password do not match an account.
    InvalidCredentials,
    /// The session's user is not a guest.
    AlreadyRegistered,
    /// Unknown lobby code or id.
    LobbyNotFound,
    /// The lobby has no free seat.
    LobbyFull,
    /// The game is already running.
    LobbyStarted,
    /// The user is in another lobby, queue, or game.
    AlreadySeated,
    /// The user is not in a lobby.
    NotInLobby,
    /// Only the host can do that.
    NotHost,
    /// Start was asked with unready players or fewer than two seats.
    NotReady,
    /// `lobby.addBot` on a table that does not seat bots.
    BotsDisabled,
    /// `lobby.settings` on a public table. The rules stay as they were opened.
    RulesLocked,
    /// Ranked needs a registered account.
    AccountRequired,
    /// The leaver penalty has not expired. The message carries no time.
    QueueCooldown,
    /// The user is not in a game.
    NotInGame,
    /// Wrong seat or wrong phase.
    NotYourTurn,
    /// `at` does not match the current round and trick.
    StaleAction,
    /// The action is illegal in the current position.
    IllegalMove,
    /// The bid is outside `0..=cards`.
    BidOutOfRange,
    /// Anything else. Details are in the server log only.
    Internal,
}

impl ErrorCode {
    /// Every code, in protocol-table order.
    #[must_use]
    pub const fn all() -> &'static [Self] {
        &[
            Self::Unauthenticated,
            Self::Forbidden,
            Self::NotFound,
            Self::Validation,
            Self::RateLimited,
            Self::ProtocolUnsupported,
            Self::UsernameTaken,
            Self::UsernameInvalid,
            Self::WeakPassword,
            Self::InvalidCredentials,
            Self::AlreadyRegistered,
            Self::LobbyNotFound,
            Self::LobbyFull,
            Self::LobbyStarted,
            Self::AlreadySeated,
            Self::NotInLobby,
            Self::NotHost,
            Self::NotReady,
            Self::BotsDisabled,
            Self::RulesLocked,
            Self::AccountRequired,
            Self::QueueCooldown,
            Self::NotInGame,
            Self::NotYourTurn,
            Self::StaleAction,
            Self::IllegalMove,
            Self::BidOutOfRange,
            Self::Internal,
        ]
    }

    /// HTTP status for this code.
    #[must_use]
    pub const fn status(self) -> u16 {
        match self {
            Self::Validation | Self::UsernameInvalid | Self::WeakPassword => 400,
            Self::Unauthenticated | Self::InvalidCredentials => 401,
            Self::Forbidden | Self::NotHost | Self::AccountRequired | Self::QueueCooldown => 403,
            Self::NotFound | Self::LobbyNotFound => 404,
            Self::UsernameTaken
            | Self::AlreadyRegistered
            | Self::LobbyFull
            | Self::LobbyStarted
            | Self::AlreadySeated
            | Self::NotInLobby
            | Self::NotReady
            | Self::BotsDisabled
            | Self::RulesLocked
            | Self::NotInGame
            | Self::NotYourTurn
            | Self::StaleAction
            | Self::IllegalMove
            | Self::BidOutOfRange => 409,
            Self::ProtocolUnsupported => 426,
            Self::RateLimited => 429,
            Self::Internal => 500,
        }
    }

    /// Copy that is safe to show to a player. No stack, SQL, token, or hand.
    #[must_use]
    pub const fn message(self) -> &'static str {
        match self {
            Self::Unauthenticated => "You need to sign in.",
            Self::Forbidden => "You cannot do that.",
            Self::NotFound => "Not found.",
            Self::Validation => "That request is not valid.",
            Self::RateLimited => "Too many requests.",
            Self::ProtocolUnsupported => "Reload to update.",
            Self::UsernameTaken => "That username is taken.",
            Self::UsernameInvalid => "That username is not allowed.",
            Self::WeakPassword => "Enter a password.",
            Self::InvalidCredentials => "Wrong username or password.",
            Self::AlreadyRegistered => "This account is already registered.",
            Self::LobbyNotFound => "No lobby with that code.",
            Self::LobbyFull => "That lobby is full.",
            Self::LobbyStarted => "That game has already started.",
            Self::AlreadySeated => "You are already at a table.",
            Self::NotInLobby => "You are not in a lobby.",
            Self::NotHost => "Only the host can do that.",
            Self::NotReady => "Not everyone is ready.",
            Self::BotsDisabled => "This table does not seat bots.",
            Self::RulesLocked => "A public table keeps its rules.",
            Self::AccountRequired => "Ranked needs an account.",
            Self::QueueCooldown => "You cannot queue yet.",
            Self::NotInGame => "You are not in a game.",
            Self::NotYourTurn => "It is not your turn.",
            Self::StaleAction => "That action was for an earlier trick.",
            Self::IllegalMove => "That move is not allowed.",
            Self::BidOutOfRange => "That bid is not allowed.",
            Self::Internal => "Something went wrong.",
        }
    }
}

/// `{ "error": { "code", "message" } }`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export_to = "ErrorBody.ts")]
pub struct ErrorBody {
    /// The code and the player-safe message.
    pub error: ErrorObject,
}

/// The code and message inside an error response.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export_to = "ErrorObject.ts")]
pub struct ErrorObject {
    /// What the client branches on.
    pub code: ErrorCode,
    /// Showable text. Not parsed.
    pub message: String,
}

#[cfg(test)]
mod tests {
    use super::ErrorCode;

    #[test]
    fn every_message_is_safe_to_show() {
        for code in ErrorCode::all() {
            let message = code.message();
            assert!(!message.is_empty());
            assert!(!message.contains("sql"));
            assert!(!message.contains("token"));
            assert_ne!(code.status(), 0);
        }
        assert!(
            !ErrorCode::QueueCooldown
                .message()
                .contains(|ch: char| ch.is_ascii_digit())
        );
    }
}
