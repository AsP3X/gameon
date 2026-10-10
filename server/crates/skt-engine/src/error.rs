//! Rejections a player can cause, and the internal fault used when an invariant fails.

use thiserror::Error;

/// Why an intent was refused. The state is unchanged.
///
/// The wire codes match `docs/engine-conformance.md` §5. `STALE_ACTION` is not an engine
/// rejection: the server checks `at` before it asks the engine.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub enum Rejection {
    /// Wrong phase, wrong seat, or nothing is waiting to advance.
    #[error("not your turn")]
    NotYourTurn,
    /// The seat may act, but the card, bid shape, or ability choice is illegal.
    #[error("illegal move")]
    IllegalMove,
    /// A bid that is not an integer in `0..=cards`.
    #[error("bid out of range")]
    BidOutOfRange,
}

impl Rejection {
    /// The `code` field the server puts on the wire for this rejection.
    #[must_use]
    pub const fn code(self) -> &'static str {
        match self {
            Self::NotYourTurn => "NOT_YOUR_TURN",
            Self::IllegalMove => "ILLEGAL_MOVE",
            Self::BidOutOfRange => "BID_OUT_OF_RANGE",
        }
    }
}

/// A failed step. [`Rejection`] is player input. [`StepError::Broken`] is a bug or a bad deal.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub enum StepError {
    /// The intent was illegal. The state was not modified.
    #[error(transparent)]
    Rejected(#[from] Rejection),
    /// An invariant failed (a missing seat, a deal that is not a permutation, a corrupt index).
    #[error("the game state is internally inconsistent")]
    Broken,
}

/// Why [`crate::GameState::create`] refused to start a game.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub enum CreateError {
    /// The table must seat 2 to 8 players.
    #[error("player count must be from 2 to 8")]
    PlayerCount,
    /// The opening dealer is not one of the seats.
    #[error("dealer is not a seat at this table")]
    Dealer,
    /// A deal was not a permutation of the canonical deck, or the deck itself could not be built.
    #[error("the deal is not a permutation of the deck")]
    Deal,
}
