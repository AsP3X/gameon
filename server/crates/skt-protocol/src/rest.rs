//! REST bodies. Field names match `docs/protocol.md`.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::ids::{GameId, UnixMs, UserId};
use crate::lobby::TableKind;
use crate::settings::GameSettings;

/// `GET /api/v1/metrics`. Public counts. No player, hand, or bid.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "Metrics.ts")]
pub struct Metrics {
    /// Games on the clock.
    pub games: u32,
    /// Open sockets that have said hello.
    pub sockets: u32,
    /// People waiting in quick play.
    pub casual: u32,
    /// People waiting in ranked.
    pub ranked: u32,
}

/// `GET /api/v1/health`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export_to = "Health.ts")]
pub struct Health {
    /// Always `true` when this process is serving.
    pub ok: bool,
}

/// One of the eight legacy table colours.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export_to = "TableColor.ts")]
pub enum TableColor {
    /// `#1cb0f6`.
    #[serde(rename = "#1cb0f6")]
    Sky,
    /// `#ff9600`.
    #[serde(rename = "#ff9600")]
    Orange,
    /// `#ce82ff`.
    #[serde(rename = "#ce82ff")]
    Purple,
    /// `#ff4b4b`.
    #[serde(rename = "#ff4b4b")]
    Red,
    /// `#58cc02`.
    #[serde(rename = "#58cc02")]
    Green,
    /// `#e5a400`.
    #[serde(rename = "#e5a400")]
    Gold,
    /// `#2b70c9`.
    #[serde(rename = "#2b70c9")]
    Navy,
    /// `#ff5fbf`.
    #[serde(rename = "#ff5fbf")]
    Pink,
}

/// Default deadlines, in milliseconds. Pace scales bid, play, and ability.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "Timers.ts")]
pub struct Timers {
    /// Bidding deadline.
    pub bid_ms: u32,
    /// Play deadline.
    pub play_ms: u32,
    /// Ability deadline.
    pub ability_ms: u32,
    /// How long a resolved trick stays up.
    pub trick_end_ms: u32,
    /// How long the round summary stays up.
    pub round_end_ms: u32,
    /// How long a dropped seat is kept before a bot takes it.
    pub disconnect_grace_ms: u32,
}

impl Timers {
    /// The standard pace from the protocol: 45s, 30s, 30s, 2.5s, 20s, 60s.
    #[must_use]
    pub const fn standard() -> Self {
        Self {
            bid_ms: 45_000,
            play_ms: 30_000,
            ability_ms: 30_000,
            trick_end_ms: 2_500,
            round_end_ms: 20_000,
            disconnect_grace_ms: 60_000,
        }
    }
}

/// Emote ids the server accepts, in the order `GET /config` lists them.
pub const EMOTES: &[&str] = &[
    "yoho", "arr", "nice", "oops", "thinking", "laugh", "cry", "gg",
];

/// Owned copy of [`EMOTES`] for `ServerConfig`.
#[must_use]
pub fn emote_ids() -> Vec<String> {
    EMOTES.iter().map(|id| (*id).to_owned()).collect()
}

/// `GET /api/v1/config`. Public.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "ServerConfig.ts")]
pub struct ServerConfig {
    /// Protocol version. Currently 1.
    pub protocol: u32,
    /// Server build id.
    pub build: String,
    /// The default deadlines.
    pub timers: Timers,
    /// Quick-play and ranked rules.
    pub standard: GameSettings,
    /// The live season, or `null` when there is none.
    pub season: Option<Season>,
    /// Emote ids this process accepts. See [`EMOTES`].
    pub emotes: Vec<String>,
}

/// One stored step of a finished game.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "ActionLogEntry.ts")]
pub struct ActionLogEntry {
    /// Position in the game, starting at 0.
    pub seq: u32,
    /// `deal`, `bid`, `play`, `ability`, or `advance`.
    pub kind: String,
    /// Acting seat. Absent for a deal or an advance.
    pub seat: Option<u8>,
    /// JSON text of that step.
    pub body: String,
}

/// `GET /api/v1/games/{id}/log`. The caller sat in the game.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "ActionLog.ts")]
pub struct ActionLog {
    /// The finished game.
    pub game_id: GameId,
    /// Steps in deal order.
    pub entries: Vec<ActionLogEntry>,
}

/// Where a reconnect lands.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(tag = "kind", rename_all = "camelCase", export_to = "Active.ts")]
pub enum Active {
    /// Sitting in a lobby.
    Lobby {
        /// Lobby id.
        id: String,
    },
    /// Waiting in a queue.
    Queue {
        /// Queue id.
        id: String,
    },
    /// In a game.
    Game {
        /// Game id.
        id: String,
        /// Which table. Absent on an older reply; the reader then uses `game.start.mode`.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        table: Option<TableKind>,
        /// 1-based deal index. Present for a solo game.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        round: Option<u32>,
        /// Format length. The deck-size cap does not change it.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        rounds: Option<u32>,
        /// Seated bots. Present for a solo game.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        bots: Option<u32>,
    },
}

/// A public player.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "User.ts")]
pub struct User {
    /// User id.
    pub id: UserId,
    /// Display name.
    pub name: String,
    /// Table colour.
    pub color: TableColor,
    /// Ranked tier, or `null`.
    pub tier: Option<String>,
}

/// One mode's counters. The same five numbers as the headline, for that mode only.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS, Default)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "ModeLine.ts")]
pub struct ModeLine {
    /// Games finished in this mode.
    pub games: u32,
    /// Games won in this mode.
    pub wins: u32,
    /// Bids that matched the tricks taken.
    pub bids_made: u32,
    /// Bids placed.
    pub bids_total: u32,
    /// Highest total in this mode, or `null` before the first game.
    pub best_score: Option<i32>,
}

/// The five lines under the headline counters.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS, Default)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "StatsByMode.ts")]
pub struct StatsByMode {
    /// Server solo. An abandoned game and a device game are absent.
    pub solo: ModeLine,
    /// A private lobby.
    pub friends: ModeLine,
    /// A public lobby.
    pub public: ModeLine,
    /// The casual queue.
    pub casual: ModeLine,
    /// The ranked queue. Also counted in `rating.games` for the season.
    pub ranked: ModeLine,
}

/// Lifetime counters.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "Stats.ts")]
pub struct Stats {
    /// Games finished. Solo, friends, public and casual. Not ranked.
    pub games: u32,
    /// Games won.
    pub wins: u32,
    /// Bids that matched the tricks taken.
    pub bids_made: u32,
    /// Bids placed.
    pub bids_total: u32,
    /// Highest game total, or `null` before the first game.
    pub best_score: Option<i32>,
    /// Per-mode lines. Omitted when empty; the reader treats that as every line empty.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub by_mode: Option<StatsByMode>,
}

/// One seat on a stored finished game.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "FinishedSeat.ts")]
pub struct FinishedSeat {
    /// The player, or `null` for a bot.
    pub user_id: Option<UserId>,
    /// The seat was a bot.
    pub bot: bool,
    /// Place. 1 is the winner. Ties share a place.
    pub place: u32,
    /// Points scored.
    pub score: i32,
    /// Bids that matched the tricks taken.
    pub bids_made: u32,
    /// The seat left or was kicked in a ranked game.
    pub forfeited: bool,
}

/// One finished game on `GET /api/v1/me/games`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "FinishedGame.ts")]
pub struct FinishedGame {
    /// Game id.
    pub id: GameId,
    /// Which table it was.
    pub table: TableKind,
    /// The rules it was dealt with.
    pub settings: GameSettings,
    /// When it was dealt.
    pub started_at: UnixMs,
    /// When it ended.
    pub ended_at: UnixMs,
    /// The ranked season, or `null` for every other table.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub season_id: Option<u32>,
    /// One line per seat, in seat order.
    pub seats: Vec<FinishedSeat>,
}

/// `GET /api/v1/me/games`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "GamePage.ts")]
pub struct GamePage {
    /// Newest first.
    pub games: Vec<FinishedGame>,
    /// The id of the last row, when another page exists. Omitted on the last page.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub next: Option<GameId>,
}

/// A ranked rating.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "Rating.ts")]
pub struct Rating {
    /// Rating points.
    pub value: i32,
    /// Display tier.
    pub tier: String,
    /// The rating is still settling.
    pub provisional: bool,
    /// Ranked games counted.
    pub games: u32,
}

/// A ranked season.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "Season.ts")]
pub struct Season {
    /// Season number.
    pub id: u32,
    /// Display name.
    pub name: String,
    /// When it opens.
    pub starts_at: UnixMs,
    /// When it closes.
    pub ends_at: UnixMs,
}

/// `GET /api/v1/me` and the auth replies.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "Me.ts")]
pub struct Me {
    /// The player.
    pub user: User,
    /// The account has no password.
    pub guest: bool,
    /// Login name, or `null` for a guest.
    pub username: Option<String>,
    /// Where a reconnect lands, or `null`.
    pub active: Option<Active>,
    /// Leaver penalty end, or `null`. The queue error message does not repeat this.
    pub cooldown_until: Option<UnixMs>,
    /// Lifetime counters.
    pub stats: Stats,
    /// Ranked rating, or `null` outside ranked.
    pub rating: Option<Rating>,
}

/// `GET /api/v1/users/{id}`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export_to = "Profile.ts")]
pub struct Profile {
    /// The player.
    pub user: User,
    /// Lifetime counters.
    pub stats: Stats,
    /// Ranked rating, or `null`.
    pub rating: Option<Rating>,
}

/// One ladder row.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export_to = "LadderEntry.ts")]
pub struct LadderEntry {
    /// 1-based place.
    pub rank: u32,
    /// The player.
    pub user: User,
    /// The rating that earned the place.
    pub rating: Rating,
}

/// `GET /api/v1/ladder`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "LadderPage.ts")]
pub struct LadderPage {
    /// The season being listed.
    pub season: Season,
    /// Rows in rank order.
    pub entries: Vec<LadderEntry>,
    /// Cursor for the next page. Omitted on the last page.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub next: Option<String>,
}

/// `POST /api/v1/auth/register` and `POST /api/v1/auth/login`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export_to = "Credentials.ts")]
pub struct Credentials {
    /// Login name.
    pub username: String,
    /// Password. The sample value is not a real credential.
    pub password: String,
}

/// `PATCH /api/v1/me`. Absent fields stay as they are.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "ProfilePatch.ts")]
pub struct ProfilePatch {
    /// New display name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub name: Option<String>,
    /// New table colour.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub color: Option<TableColor>,
}
