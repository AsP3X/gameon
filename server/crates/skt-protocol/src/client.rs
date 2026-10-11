//! Client socket messages. Each one carries `id` and gets one `ok` or `err` reply.

use serde::{Deserialize, Serialize};
use skt_engine::{AbilityChoice, CardId, PlayedAs};
use ts_rs::TS;

use crate::ids::{LobbyId, MessageId, UserId};
use crate::lobby::{QueueMode, Visibility};
use crate::settings::GameSettings;

/// The round and trick the client was looking at.
///
/// `round` is the 0-based round index. `trick` is how many tricks are already complete.
/// A mismatch is `STALE_ACTION` and is checked by the server, not by the engine.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export_to = "ActionAt.ts")]
pub struct ActionAt {
    /// 0-based round index.
    pub round: u32,
    /// Tricks already completed in the round.
    pub trick: u32,
}

/// Every client frame.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "t", rename_all_fields = "camelCase")]
#[ts(
    tag = "t",
    rename_all_fields = "camelCase",
    export_to = "ClientMessage.ts"
)]
pub enum ClientMessage {
    /// First frame. Sent within 5 seconds of the upgrade.
    #[serde(rename = "hello")]
    Hello {
        /// Correlation id.
        id: MessageId,
        /// Must be protocol version 1.
        protocol: u32,
        /// Client build id.
        build: String,
    },
    /// Heartbeat, every 15 seconds.
    #[serde(rename = "ping")]
    Ping {
        /// Correlation id.
        id: MessageId,
    },
    /// Create a lobby.
    #[serde(rename = "lobby.create")]
    LobbyCreate {
        /// Correlation id.
        id: MessageId,
        /// Private or public.
        visibility: Visibility,
        /// Rules.
        settings: GameSettings,
    },
    /// Join by code or by id.
    ///
    /// Send one of `code` or `lobbyId`. If both are present, the server uses `code`.
    #[serde(rename = "lobby.join")]
    LobbyJoin {
        /// Correlation id.
        id: MessageId,
        /// Six-character lobby code.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        code: Option<String>,
        /// Lobby id.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        lobby_id: Option<LobbyId>,
    },
    /// Leave the lobby.
    #[serde(rename = "lobby.leave")]
    LobbyLeave {
        /// Correlation id.
        id: MessageId,
    },
    /// Set ready.
    #[serde(rename = "lobby.ready")]
    LobbyReady {
        /// Correlation id.
        id: MessageId,
        /// Whether this member is ready.
        ready: bool,
    },
    /// Host replaces the settings. Clears everyone's ready.
    #[serde(rename = "lobby.settings")]
    LobbySettings {
        /// Correlation id.
        id: MessageId,
        /// The new rules.
        settings: GameSettings,
    },
    /// Host adds a bot.
    #[serde(rename = "lobby.addBot")]
    LobbyAddBot {
        /// Correlation id.
        id: MessageId,
    },
    /// Host removes a bot. `index` is the index in `members`, not a seat.
    #[serde(rename = "lobby.removeBot")]
    LobbyRemoveBot {
        /// Correlation id.
        id: MessageId,
        /// Index into `Lobby.members`.
        index: u32,
    },
    /// Host removes a human.
    #[serde(rename = "lobby.kick")]
    LobbyKick {
        /// Correlation id.
        id: MessageId,
        /// Who to remove.
        user_id: UserId,
    },
    /// Host starts. Needs at least two seats and every human ready.
    #[serde(rename = "lobby.start")]
    LobbyStart {
        /// Correlation id.
        id: MessageId,
    },
    /// Join casual or ranked.
    #[serde(rename = "queue.join")]
    QueueJoin {
        /// Correlation id.
        id: MessageId,
        /// Casual or ranked.
        mode: QueueMode,
    },
    /// Leave the queue.
    #[serde(rename = "queue.leave")]
    QueueLeave {
        /// Correlation id.
        id: MessageId,
    },
    /// Bid for the session's seat.
    #[serde(rename = "game.bid")]
    GameBid {
        /// Correlation id.
        id: MessageId,
        /// The round and trick the client was looking at.
        at: ActionAt,
        /// The bid.
        bid: i32,
    },
    /// Play a card for the session's seat.
    #[serde(rename = "game.play")]
    GamePlay {
        /// Correlation id.
        id: MessageId,
        /// The round and trick the client was looking at.
        at: ActionAt,
        /// Card id.
        card: CardId,
        /// Required for the Tigress. Ignored on every other card.
        #[serde(rename = "as", default, skip_serializing_if = "Option::is_none")]
        #[ts(rename = "as", optional)]
        played_as: Option<PlayedAs>,
    },
    /// Answer the open ability.
    #[serde(rename = "game.ability")]
    GameAbility {
        /// Correlation id.
        id: MessageId,
        /// The round and trick the client was looking at.
        at: ActionAt,
        /// A seat, card ids, a stake, a bid change, or `null` for the Seer.
        choice: AbilityChoice,
    },
    /// Ready for the next round.
    #[serde(rename = "game.ready")]
    GameReady {
        /// Correlation id.
        id: MessageId,
    },
    /// One emote. The server accepts at most one every 2 seconds.
    ///
    /// One id from [`crate::EMOTES`].
    #[serde(rename = "game.emote")]
    GameEmote {
        /// Correlation id.
        id: MessageId,
        /// Emote id.
        emote: String,
    },
    /// Leave the table. A bot takes the seat. Ranked forfeits.
    #[serde(rename = "game.leave")]
    GameLeave {
        /// Correlation id.
        id: MessageId,
    },
}
