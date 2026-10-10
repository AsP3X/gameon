//! Skull King rules, the reducer, the per-seat view, and the bots.
//!
//! This crate does no I/O. It has no clock and no global random number generator.
//! The server passes a [`DealSource`] for each shuffle and an [`Rng`] when a bot decides.
//! [`GameState`] does not implement `Serialize`. Hidden cards leave the engine only through
//! [`GameState::view`].

mod bots;
mod card;
mod error;
mod game;
mod ids;
mod model;
mod rng;
mod rules;
mod score;

pub use bots::{choose_ability, choose_bid, choose_play};
pub use card::{Card, build_deck, is_legal, lead_suit, legal_cards, resolve_trick};
pub use error::{CreateError, Rejection, StepError};
pub use game::{DealSource, GameState};
pub use ids::{CardId, Seat, SeatOrNone};
pub use model::*;
pub use rng::Rng;
pub use rules::{BotLevel, Expansions, Format, Ruleset, Scoring};
pub use score::{score_seat, totals};

#[cfg(test)]
mod leak;

#[cfg(test)]
mod tests;
