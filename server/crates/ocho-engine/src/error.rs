//! Rejections a player can cause, and the fault used when an invariant fails.

use thiserror::Error;

/// Why an intent was refused. The state is unchanged.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub enum Rejection {
    /// Wrong phase, or this seat is not the one who must act.
    #[error("not your turn")]
    NotYourTurn,
    /// The seat may act, but the card, colour, or draw is illegal.
    #[error("illegal move")]
    IllegalMove,
}

impl Rejection {
    /// The `code` field the game server puts on the wire.
    #[must_use]
    pub const fn code(self) -> &'static str {
        match self {
            Self::NotYourTurn => "NOT_YOUR_TURN",
            Self::IllegalMove => "ILLEGAL_MOVE",
        }
    }
}

/// A failed step. [`Rejection`] is player input. [`StepError::Broken`] is a bug.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub enum StepError {
    /// The intent was illegal. The state was not modified.
    #[error(transparent)]
    Rejected(#[from] Rejection),
    /// An invariant failed.
    #[error("game state is broken")]
    Broken,
}

/// Why [`crate::Game::create`] refused the table.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub enum CreateError {
    /// The seat count is not 2 to 8, or teams was asked for a table that is not four seats.
    #[error("player count")]
    PlayerCount,
    /// The first deal could not be built.
    #[error("deal failed")]
    Deal,
}
