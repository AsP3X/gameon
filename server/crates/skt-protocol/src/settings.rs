//! Table settings shared by lobbies, queues, and `game.start`.

use serde::{Deserialize, Serialize};
use skt_engine::{BotLevel, Format, Scoring};
use ts_rs::TS;

/// How fast the deadlines run. Bid, play, and ability scale. The other timers do not.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "Pace.ts")]
pub enum Pace {
    /// Bid, play, and ability take twice as long.
    Relaxed,
    /// The times in [`crate::rest::Timers::standard`].
    Standard,
    /// Bid, play, and ability take half as long.
    Fast,
}

/// Loot, Kraken, and the White Whale.
///
/// Flattened into [`GameSettings`] on the wire, so JSON has `loot`, `kraken`, and `whale`
/// beside the other settings.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct ExpansionFlags {
    /// Two loot cards are in the deck.
    pub loot: bool,
    /// The Kraken is in the deck.
    pub kraken: bool,
    /// The White Whale is in the deck.
    pub whale: bool,
}

/// Rules for a lobby, a queue, or a game.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "GameSettings.ts")]
pub struct GameSettings {
    /// Seats at the table, from 2 to 8.
    pub max_players: u8,
    /// Classic or Rascal.
    pub scoring: Scoring,
    /// Round lengths.
    pub format: Format,
    /// Optional cards. Flattened on the wire.
    #[serde(flatten)]
    pub expansions: ExpansionFlags,
    /// Pirate abilities fire when that pirate wins a trick.
    pub abilities: bool,
    /// How the bots play. A per-seat view does not include it.
    pub bot_level: BotLevel,
    /// Deadline scale.
    pub pace: Pace,
}

impl GameSettings {
    /// Quick play and ranked.
    ///
    /// Four players, classic scoring, Skip to the Brawl, the 70-card deck, no pirate abilities,
    /// normal bots, standard pace.
    #[must_use]
    pub const fn standard() -> Self {
        Self {
            max_players: 4,
            scoring: Scoring::Classic,
            format: Format::Brawl,
            expansions: ExpansionFlags {
                loot: false,
                kraken: false,
                whale: false,
            },
            abilities: false,
            bot_level: BotLevel::Normal,
            pace: Pace::Standard,
        }
    }
}
