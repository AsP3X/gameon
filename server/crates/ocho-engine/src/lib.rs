//! Ocho rules, the reducer, and the per-seat view.
//!
//! This crate does no I/O. It has no clock and no global random number generator.
//! The game server passes a [`Rng`] for the shuffle, the draw pile, and X-Ray.
//! [`Game`] does not implement `Serialize`. Hidden cards leave only through [`Game::view`].

mod card;
mod error;
mod game;
mod rng;

pub use card::{Card, CardId, Color, Kind, Symbol};
pub use error::{CreateError, Rejection, StepError};
pub use game::{Game, Intent, Must, Phase, PlayerView, XrayShown};
pub use rng::Rng;

#[cfg(test)]
mod tests;
