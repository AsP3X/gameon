//! Lobby and queue shapes.

use serde::{Deserialize, Serialize};
use skt_engine::BotLevel;
use ts_rs::TS;

use crate::ids::{GameId, LobbyId, UnixMs, UserId};
use crate::rest::{TableColor, User};
use crate::settings::GameSettings;

/// Which table a game is, in the words of the page.
///
/// `mode` stays `custom` for solo, friends and public so an older reader still has a mode it knows.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "TableKind.ts")]
pub enum TableKind {
    /// One human and bots, started by `solo.start`.
    Solo,
    /// A private lobby.
    Friends,
    /// A public lobby.
    Public,
    /// The casual queue.
    Casual,
    /// The ranked queue.
    Ranked,
}

/// Custom, casual, or ranked.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "TableMode.ts")]
pub enum TableMode {
    /// A private or public lobby the host configured.
    Custom,
    /// Quick play. No rating.
    Casual,
    /// A rated queue. An account is required.
    Ranked,
}

/// Queue modes. Custom is not a queue.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "QueueMode.ts")]
pub enum QueueMode {
    /// Quick play.
    Casual,
    /// Rated. An account is required.
    Ranked,
}

/// Who can see the lobby.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "Visibility.ts")]
pub enum Visibility {
    /// Join by code or link.
    Private,
    /// Listed in `GET /api/v1/lobbies`.
    Public,
}

/// Lifecycle of a lobby.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "LobbyPhase.ts")]
pub enum LobbyPhase {
    /// Waiting for players.
    Open,
    /// The host started and the game is being dealt.
    Starting,
    /// A game is running.
    InGame,
}

/// One person or bot in a lobby, in join order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(tag = "kind", rename_all = "camelCase", export_to = "Member.ts")]
pub enum Member {
    /// A signed-in player.
    Human {
        /// The player.
        user: User,
        /// Ready for the host to start.
        ready: bool,
        /// The socket is up.
        connected: bool,
    },
    /// A bot the host added.
    Bot {
        /// Display name.
        name: String,
        /// Table colour.
        color: TableColor,
        /// How it plays.
        level: BotLevel,
    },
}

/// A lobby snapshot.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "Lobby.ts")]
pub struct Lobby {
    /// Lobby id.
    pub id: LobbyId,
    /// Six characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`.
    pub code: String,
    /// Custom, casual, or ranked.
    pub mode: TableMode,
    /// Private or public.
    pub visibility: Visibility,
    /// Host, or `null` in a matchmade lobby.
    pub host_id: Option<UserId>,
    /// Rules for the next game.
    pub settings: GameSettings,
    /// When `Some(false)`, `lobby.addBot` is `BOTS_DISABLED`. Omitted means true.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub allow_bots: Option<bool>,
    /// Join order. `lobby.removeBot` indexes this array.
    pub members: Vec<Member>,
    /// Open, starting, or in a game.
    pub state: LobbyPhase,
    /// The running game, or `null`.
    pub game_id: Option<GameId>,
}

/// One row of the public lobby list.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "LobbySummary.ts")]
pub struct LobbySummary {
    /// Lobby id.
    pub id: LobbyId,
    /// The host's display name.
    pub host_name: String,
    /// The host's table colour. Omitted when this row has no host.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub host_color: Option<TableColor>,
    /// Rules shown in the list.
    pub settings: GameSettings,
    /// How many members are seated. Humans and bots both count.
    pub players: u32,
    /// When `Some(false)`, this table does not seat bots. Omitted means true.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub allow_bots: Option<bool>,
}

/// `GET /api/v1/lobbies`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export_to = "LobbyList.ts")]
pub struct LobbyList {
    /// Open public lobbies.
    pub lobbies: Vec<LobbySummary>,
}

/// Queue progress.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "QueueStatus.ts")]
pub struct QueueStatus {
    /// Casual or ranked.
    pub mode: QueueMode,
    /// When this player joined.
    pub since: UnixMs,
    /// Players found so far.
    pub found: u32,
    /// Players required.
    pub needed: u32,
    /// When a casual queue seats whoever is waiting and fills the rest with bots.
    /// Omitted for ranked, and when four people are already waiting.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub fills_at: Option<UnixMs>,
}
