//! Wire types for Skull King Tavern protocol 1.
//!
//! `docs/protocol.md` is the contract. This crate is the executable form.
//! [`export`] writes the TypeScript and `fixtures/protocol/`.

mod client;
mod error_code;
mod ids;
mod lobby;
mod output;
mod pushes;
mod rest;
mod samples;
mod settings;
mod table;

pub use client::{ActionAt, ClientMessage};
pub use error_code::{ErrorBody, ErrorCode, ErrorObject};
pub use ids::{GameId, LobbyId, MessageId, UnixMs, UserId};
pub use lobby::{
    Lobby, LobbyList, LobbyPhase, LobbySummary, Member, QueueMode, QueueStatus, TableMode,
    Visibility,
};
pub use output::{
    ExportError, check_fixtures, export, export_typescript, fixture_dir, typescript_dir,
    write_fixtures,
};
pub use pushes::{
    CloseReason, ErrMessage, ErrTag, GameEmotePush, GameEmoteTag, GameOver, GameOverTag,
    LobbyClosed, LobbyClosedTag, LobbyStatePush, LobbyStateTag, OkReply, OkTag, QueueStatusPush,
    QueueStatusTag, Superseded, SupersededTag, Welcome, WelcomeGame, WelcomeTag,
};
pub use rest::{
    ActionLog, ActionLogEntry, Active, Credentials, EMOTES, Health, LadderEntry, LadderPage, Me,
    Profile, ProfilePatch, Rating, Season, ServerConfig, Stats, TableColor, Timers, User,
    emote_ids,
};
pub use settings::{ExpansionFlags, GameSettings, Pace};
pub use table::{
    Deadline, DeadlineKind, GameEvent, GameResult, GameStart, GameStartTag, GameUpdate,
    GameUpdateTag, OnlineEvent, RatingChange, SeatInfo, SeatStatus, TableInfo,
};

pub use skt_engine::GameEvent as EngineEvent;
pub use skt_engine::{
    Ability, AbilityChoice, AbilityUsed, Beast, BotLevel, Card, CardId, EngineView, Format, Phase,
    Play, PlayedAs, ScoreKind, Scoring, Seat, SeatOrNone, Suit,
};

/// The protocol version spoken by `hello` and `ServerConfig.protocol`.
pub const PROTOCOL: u32 = 1;
