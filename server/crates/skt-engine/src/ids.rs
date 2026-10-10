//! Seat and card indexes. Both are JSON numbers.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::StepError;

/// A seat at the table, clockwise from 0.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(type = "number", export_to = "Seat.ts")]
pub struct Seat(u8);

impl Seat {
    /// Seat `index`. The engine checks it against the table when the seat is asked to act.
    #[must_use]
    pub const fn from_index(index: u8) -> Self {
        Self(index)
    }

    /// The numeric seat.
    #[must_use]
    pub const fn get(self) -> u8 {
        self.0
    }

    /// Index into per-seat arrays.
    #[must_use]
    pub fn index(self) -> usize {
        usize::from(self.0)
    }

    pub(crate) fn checked(self, players: u8) -> Result<usize, StepError> {
        let index = self.index();
        if index < usize::from(players) {
            Ok(index)
        } else {
            Err(StepError::Broken)
        }
    }

    /// The next seat clockwise. `players` is the table size.
    ///
    /// # Errors
    ///
    /// [`StepError::Broken`] when `players` is 0.
    pub fn next(self, players: u8) -> Result<Self, StepError> {
        if players == 0 {
            return Err(StepError::Broken);
        }
        let next = (self.index() + 1) % usize::from(players);
        let narrow = u8::try_from(next).map_err(|_| StepError::Broken)?;
        Ok(Self(narrow))
    }
}

/// Index of a card in the canonical deck for this ruleset.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(type = "number", export_to = "CardId.ts")]
pub struct CardId(u8);

impl CardId {
    /// Card `index` in [`crate::canonical_deck`].
    #[must_use]
    pub const fn from_index(index: u8) -> Self {
        Self(index)
    }

    /// The numeric id.
    #[must_use]
    pub const fn get(self) -> u8 {
        self.0
    }

    /// Index into the deck array.
    #[must_use]
    pub fn index(self) -> usize {
        usize::from(self.0)
    }
}

/// A seat, or `-1` when nobody has claimed the black 14 or the mermaid-and-king bonus.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(type = "number", export_to = "SeatOrNone.ts")]
pub struct SeatOrNone(i8);

impl SeatOrNone {
    /// Nobody. Serialises as `-1`.
    #[must_use]
    pub const fn nobody() -> Self {
        Self(-1)
    }

    /// `seat` as a claim. Seats above 127 cannot be represented and become [`StepError::Broken`].
    ///
    /// # Errors
    ///
    /// [`StepError::Broken`] when the seat does not fit in an `i8`. A legal table never does this.
    pub fn from_seat(seat: Seat) -> Result<Self, StepError> {
        let value = i8::try_from(seat.get()).map_err(|_| StepError::Broken)?;
        Ok(Self(value))
    }

    /// The claimed seat, when there is one.
    #[must_use]
    pub fn seat(self) -> Option<Seat> {
        u8::try_from(self.0).ok().map(Seat::from_index)
    }

    /// Whether this claim is `seat`.
    #[must_use]
    pub fn is_seat(self, seat: Seat) -> bool {
        self.seat() == Some(seat)
    }
}
