//! Table rules that do not change during a game: scoring, format, expansions, bots.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Classic exact bids, or Rascal where missing by one still scores.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "Scoring.ts")]
pub enum Scoring {
    /// Bid 0 scores `±10 × cards`. Any other bid scores `20 × bid` on a hit and `-10 × difference` on a miss.
    Classic,
    /// A hit scores `10 × cards` plus the bonus. Off by one scores half. Anything else scores nothing.
    Rascal,
}

/// How many cards each round deals, before the deck-size cap.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "Format.ts")]
pub enum Format {
    /// Ten rounds, 1 through 10 cards.
    Classic,
    /// Five rounds, 6 through 10 cards.
    Brawl,
    /// Five rounds of 5 cards.
    Swift,
    /// Two rounds each of 2, 4, 6, 8 and 10.
    Even,
    /// Two rounds each of 9, 7, 5, 3 and 1.
    Whirl,
}

impl Format {
    /// The card counts, one entry per round, before `min(count, floor(deck / players))`.
    #[must_use]
    pub const fn sequence(self) -> &'static [u8] {
        match self {
            Self::Classic => &[1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            Self::Brawl => &[6, 7, 8, 9, 10],
            Self::Swift => &[5, 5, 5, 5, 5],
            Self::Even => &[2, 2, 4, 4, 6, 6, 8, 8, 10, 10],
            Self::Whirl => &[9, 9, 7, 7, 5, 5, 3, 3, 1, 1],
        }
    }
}

/// How boldly a bot bids and plays. A per-seat view does not include it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "BotLevel.ts")]
pub enum BotLevel {
    /// Knows the game. Miscounts a mermaid or a high side card on some hands, and
    /// sometimes plays the card a beginner would.
    Easy,
    /// Counts a makeable bid and plays it. Does not throw a stopper, an escape, or the Kraken away.
    Normal,
    /// The same plan as Normal. When that plan leaves a choice, leans on the next seat's bid.
    Hard,
}

/// The three optional cards. Pirate abilities are a separate switch on [`Ruleset`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Expansions {
    /// Two loot cards.
    pub loot: bool,
    /// The Kraken.
    pub kraken: bool,
    /// The White Whale.
    pub whale: bool,
}

impl Expansions {
    /// The 70-card deck.
    #[must_use]
    pub const fn none() -> Self {
        Self {
            loot: false,
            kraken: false,
            whale: false,
        }
    }

    /// Loot, Kraken and White Whale.
    #[must_use]
    pub const fn all() -> Self {
        Self {
            loot: true,
            kraken: true,
            whale: true,
        }
    }
}

/// Everything the engine needs to deal and score. Bot level and pace are not rules.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Ruleset {
    /// Classic or Rascal.
    pub scoring: Scoring,
    /// Round lengths.
    pub format: Format,
    /// Which extra cards are in the deck.
    pub expansions: Expansions,
    /// Pirate abilities fire when that pirate wins a trick.
    pub abilities: bool,
}

impl Ruleset {
    /// A finished ruleset.
    #[must_use]
    pub const fn new(
        scoring: Scoring,
        format: Format,
        expansions: Expansions,
        abilities: bool,
    ) -> Self {
        Self {
            scoring,
            format,
            expansions,
            abilities,
        }
    }
}
