//! Server socket messages. Pushes have no `re`. Replies carry `re`.

use serde::{Deserialize, Serialize};
use skt_engine::Seat;
use ts_rs::TS;

use crate::error_code::ErrorCode;
use crate::ids::{GameId, MessageId, UnixMs};
use crate::lobby::{Lobby, QueueStatus};
use crate::rest::Me;
use crate::table::{GameResult, GameStart, GameUpdate};

/// `{ "t": "ok", "re", ... }`.
///
/// `lobby`, `queue`, and `serverTime` are omitted when they do not apply. They are never `null`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "OkReply.ts")]
pub struct OkReply {
    /// Literal `ok`.
    #[serde(rename = "t")]
    #[ts(rename = "t", type = "\"ok\"")]
    pub tag: OkTag,
    /// The client message this answers.
    pub re: MessageId,
    /// Present after a lobby action that returns the lobby.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub lobby: Option<Lobby>,
    /// Present after joining the queue.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub queue: Option<QueueStatus>,
    /// Present on `ping`, and on any other reply that carries the clock.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub server_time: Option<UnixMs>,
}

/// Literal tag for [`OkReply`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OkTag {
    /// The wire string `ok`.
    #[serde(rename = "ok")]
    Value,
}

/// `{ "t": "err", "re", "code", "message" }`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "ErrMessage.ts")]
pub struct ErrMessage {
    /// Literal `err`.
    #[serde(rename = "t")]
    #[ts(rename = "t", type = "\"err\"")]
    pub tag: ErrTag,
    /// The client message this answers.
    pub re: MessageId,
    /// What the client branches on.
    pub code: ErrorCode,
    /// Showable text.
    pub message: String,
}

/// Literal tag for [`ErrMessage`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ErrTag {
    /// The wire string `err`.
    #[serde(rename = "err")]
    Value,
}

/// The snapshot pushed after `hello`, and after every reconnect.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "Welcome.ts")]
pub struct Welcome {
    /// Literal `welcome`.
    #[serde(rename = "t")]
    #[ts(rename = "t", type = "\"welcome\"")]
    pub tag: WelcomeTag,
    /// The receiver.
    pub me: Me,
    /// The server clock.
    pub server_time: UnixMs,
    /// The lobby, or `null`.
    pub lobby: Option<Lobby>,
    /// The queue, or `null`.
    pub queue: Option<QueueStatus>,
    /// The game, or `null`.
    pub game: Option<WelcomeGame>,
}

/// Literal tag for [`Welcome`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum WelcomeTag {
    /// The wire string `welcome`.
    #[serde(rename = "welcome")]
    Value,
}

/// A game restored on connect. Both halves are complete snapshots.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export_to = "WelcomeGame.ts")]
pub struct WelcomeGame {
    /// Opening snapshot, including the canonical deck.
    pub start: GameStart,
    /// Current view. `events` is empty.
    pub update: GameUpdate,
}

/// Sent on the socket that a newer login replaces. The socket then closes with code 4001.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export_to = "Superseded.ts")]
pub struct Superseded {
    /// Literal `superseded`.
    #[serde(rename = "t")]
    #[ts(rename = "t", type = "\"superseded\"")]
    pub tag: SupersededTag,
}

/// Literal tag for [`Superseded`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SupersededTag {
    /// The wire string `superseded`.
    #[serde(rename = "superseded")]
    Value,
}

/// Pushed to every member when the lobby changes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export_to = "LobbyStatePush.ts")]
pub struct LobbyStatePush {
    /// Literal `lobby.state`.
    #[serde(rename = "t")]
    #[ts(rename = "t", type = "\"lobby.state\"")]
    pub tag: LobbyStateTag,
    /// The lobby after the change.
    pub lobby: Lobby,
}

/// Literal tag for [`LobbyStatePush`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LobbyStateTag {
    /// The wire string `lobby.state`.
    #[serde(rename = "lobby.state")]
    Value,
}

/// Why someone was removed from a lobby.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "CloseReason.ts")]
pub enum CloseReason {
    /// The host kicked this member.
    Kicked,
    /// The lobby closed.
    Closed,
    /// The lobby was idle.
    Idle,
}

/// Pushed to someone who was removed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export_to = "LobbyClosed.ts")]
pub struct LobbyClosed {
    /// Literal `lobby.closed`.
    #[serde(rename = "t")]
    #[ts(rename = "t", type = "\"lobby.closed\"")]
    pub tag: LobbyClosedTag,
    /// Why.
    pub reason: CloseReason,
}

/// Literal tag for [`LobbyClosed`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LobbyClosedTag {
    /// The wire string `lobby.closed`.
    #[serde(rename = "lobby.closed")]
    Value,
}

/// Pushed as the queue changes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export_to = "QueueStatusPush.ts")]
pub struct QueueStatusPush {
    /// Literal `queue.status`.
    #[serde(rename = "t")]
    #[ts(rename = "t", type = "\"queue.status\"")]
    pub tag: QueueStatusTag,
    /// Progress.
    pub queue: QueueStatus,
}

/// Literal tag for [`QueueStatusPush`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum QueueStatusTag {
    /// The wire string `queue.status`.
    #[serde(rename = "queue.status")]
    Value,
}

/// An emote from a seat. `emote` is not a fixed list in this draft.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export_to = "GameEmotePush.ts")]
pub struct GameEmotePush {
    /// Literal `game.emote`.
    #[serde(rename = "t")]
    #[ts(rename = "t", type = "\"game.emote\"")]
    pub tag: GameEmoteTag,
    /// Who sent it.
    pub seat: Seat,
    /// Emote id.
    pub emote: String,
}

/// Literal tag for [`GameEmotePush`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum GameEmoteTag {
    /// The wire string `game.emote`.
    #[serde(rename = "game.emote")]
    Value,
}

/// Standings, sent after the final `game.update`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "GameOver.ts")]
pub struct GameOver {
    /// Literal `game.over`.
    #[serde(rename = "t")]
    #[ts(rename = "t", type = "\"game.over\"")]
    pub tag: GameOverTag,
    /// Game id.
    pub game_id: GameId,
    /// Standings for this seat.
    pub result: GameResult,
}

/// Literal tag for [`GameOver`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum GameOverTag {
    /// The wire string `game.over`.
    #[serde(rename = "game.over")]
    Value,
}
