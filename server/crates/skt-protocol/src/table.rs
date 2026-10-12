//! Game snapshots, the wire event union, and the result.

use serde::{Deserialize, Serialize};
use skt_engine::{Card, EngineView, Seat};
use ts_rs::TS;

use crate::ids::{GameId, LobbyId, UnixMs, UserId};
use crate::lobby::TableMode;
use crate::rest::{Rating, TableColor};
use crate::settings::GameSettings;

/// Why a deadline is running.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "DeadlineKind.ts")]
pub enum DeadlineKind {
    /// Seats that have not bid.
    Bid,
    /// The seat that must play.
    Play,
    /// The seat that must answer an ability.
    Ability,
    /// The round summary. `game.ready` can end it early.
    NextRound,
}

/// A shared deadline.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "Deadline.ts")]
pub struct Deadline {
    /// What the table is waiting for.
    pub kind: DeadlineKind,
    /// Seats the deadline applies to.
    pub seats: Vec<Seat>,
    /// When it fires.
    pub at: UnixMs,
}

/// Connection or takeover state of one seat.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "SeatStatus.ts")]
pub enum SeatStatus {
    /// The player's socket is up.
    Online,
    /// The socket is down. The seat is still this player's until two misses kick them.
    Offline,
    /// Two deadlines were missed while the socket was up. The server plays until the player acts.
    Away,
    /// A bot seat, or a seat a player left on purpose.
    Bot,
    /// Kicked for inactivity. The seat is not a bot, and the player cannot return.
    Out,
}

/// Events the server appends. They are not produced by the engine.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "camelCase")]
#[ts(tag = "type", rename_all = "camelCase", export_to = "OnlineEvent.ts")]
pub enum OnlineEvent {
    /// A seat's connection or takeover state changed.
    SeatStatus {
        /// Which seat.
        seat: Seat,
        /// The new state.
        status: SeatStatus,
    },
    /// The server played for this seat because a deadline fired.
    TimedOut {
        /// Which seat.
        seat: Seat,
    },
}

/// One public event on the wire.
///
/// `EngineEvent` is the engine list. This union adds `seatStatus` and `timedOut`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(untagged)]
#[ts(export_to = "GameEvent.ts")]
pub enum GameEvent {
    /// A server-only event.
    Online(OnlineEvent),
    /// A fact from the reducer.
    Engine(skt_engine::GameEvent),
}

/// One seat as introduced in `game.start`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "SeatInfo.ts")]
pub struct SeatInfo {
    /// Display name.
    pub name: String,
    /// Table colour.
    pub color: TableColor,
    /// The seat is a bot.
    pub bot: bool,
    /// The player, or `null` for a bot.
    pub user_id: Option<UserId>,
    /// Ranked tier, or `null`.
    pub tier: Option<String>,
}

/// The opening snapshot. `deck` is the canonical card list, not the shuffle.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "GameStart.ts")]
pub struct GameStart {
    /// Literal `game.start`.
    #[serde(rename = "t")]
    #[ts(rename = "t", type = "\"game.start\"")]
    pub tag: GameStartTag,
    /// Game id.
    pub game_id: GameId,
    /// Custom, casual, or ranked.
    pub mode: TableMode,
    /// The lobby to return to, or `null` for a queue game that has none.
    pub lobby_id: Option<LobbyId>,
    /// The rules this game was dealt with.
    pub settings: GameSettings,
    /// Canonical deck. A card id is an index into this array.
    pub deck: Vec<Card>,
    /// Cards per round, after the deck-size cap.
    pub schedule: Vec<u8>,
    /// Clockwise. The index is the seat.
    pub seats: Vec<SeatInfo>,
    /// The receiver's seat.
    pub me: Seat,
}

/// Literal tag for [`GameStart`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum GameStartTag {
    /// The wire string `game.start`.
    #[serde(rename = "game.start")]
    Value,
}

/// What changed, plus everything this seat is allowed to see now.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "GameUpdate.ts")]
pub struct GameUpdate {
    /// Literal `game.update`.
    #[serde(rename = "t")]
    #[ts(rename = "t", type = "\"game.update\"")]
    pub tag: GameUpdateTag,
    /// Game id.
    pub game_id: GameId,
    /// Increases by one for each accepted step. The client drops an older rev.
    pub rev: u32,
    /// What just happened, in order. Empty in a snapshot.
    pub events: Vec<GameEvent>,
    /// This seat's view after the step.
    pub view: EngineView,
    /// Deadlines and connection state. Not part of the engine view.
    pub table: TableInfo,
}

/// Literal tag for [`GameUpdate`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum GameUpdateTag {
    /// The wire string `game.update`.
    #[serde(rename = "game.update")]
    Value,
}

/// Deadlines, ready flags, and per-seat connection state.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "TableInfo.ts")]
pub struct TableInfo {
    /// One entry per seat.
    pub status: Vec<SeatStatus>,
    /// The current deadline, or `null` when the table is not waiting.
    pub deadline: Option<Deadline>,
    /// Per seat, during `roundEnd`.
    pub ready: Vec<bool>,
}

/// The receiver's rating change. Other players' new ratings come from their profiles.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "RatingChange.ts")]
pub struct RatingChange {
    /// Rating before the game.
    pub before: Rating,
    /// Rating after the game.
    pub after: Rating,
    /// `after.value - before.value`.
    pub delta: i32,
}

/// Standings after the final `game.update`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "GameResult.ts")]
pub struct GameResult {
    /// Score total per seat.
    pub totals: Vec<i32>,
    /// Place per seat. `1` is the winner. Ties share a place.
    pub places: Vec<u32>,
    /// Seats that forfeited.
    pub forfeited: Vec<Seat>,
    /// This seat's rating change, or `null` outside ranked.
    pub rating: Option<RatingChange>,
    /// Where "play again" goes, or `null`.
    pub lobby_id: Option<LobbyId>,
}
