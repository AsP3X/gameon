//! One JSON value per message and DTO. These are shapes, not a recorded game.

use std::path::Path;

use skt_engine::{
    Ability, AbilityChoice, Card, CardId, EngineView, Phase, PlayedAs, RoundRecord, Seat,
    SeatOrNone, Suit, Trick,
};

use crate::EngineEvent;
use crate::PROTOCOL;
use crate::client::{ActionAt, ClientMessage};
use crate::error_code::{ErrorBody, ErrorCode, ErrorObject};
use crate::ids::{GameId, LobbyId, MessageId, UnixMs, UserId};
use crate::lobby::{
    Lobby, LobbyList, LobbyPhase, LobbySummary, Member, QueueMode, QueueStatus, TableMode,
    Visibility,
};
use crate::output::{ExportError, put};
use crate::pushes::{
    CloseReason, ErrMessage, ErrTag, GameEmotePush, GameEmoteTag, GameOver, GameOverTag,
    LobbyClosed, LobbyClosedTag, LobbyStatePush, LobbyStateTag, OkReply, OkTag, QueueStatusPush,
    QueueStatusTag, SeatLost, SeatLostReason, SeatLostTag, Superseded, SupersededTag, Welcome,
    WelcomeGame, WelcomeTag,
};
use crate::rest::{
    ActionLog, ActionLogEntry, Active, Credentials, Health, LadderEntry, LadderPage, Me, Profile,
    ProfilePatch, Rating, Season, ServerConfig, Stats, TableColor, Timers, User, emote_ids,
};
use crate::settings::GameSettings;
use crate::table::{
    Deadline, DeadlineKind, GameEvent, GameResult, GameStart, GameStartTag, GameUpdate,
    GameUpdateTag, OnlineEvent, RatingChange, SeatInfo, SeatStatus, TableInfo,
};

const USER: &str = "018f6b4a-6a2e-7c3a-8b1d-9e0f1a2b3c4d";
const LOBBY: &str = "018f6b4a-6a2e-7c3a-8b1d-9e0f1a2b3c4e";
const GAME: &str = "018f6b4a-6a2e-7c3a-8b1d-9e0f1a2b3c4f";
const WHEN: i64 = 1_700_000_000_000;

pub(crate) fn apply(dir: &Path, write: bool) -> Result<(), ExportError> {
    rest(dir, write)?;
    people(dir, write)?;
    lobbies(dir, write)?;
    game(dir, write)?;
    client_lobby(dir, write)?;
    client_game(dir, write)?;
    replies(dir, write)?;
    pushes(dir, write)?;
    Ok(())
}

fn rest(dir: &Path, write: bool) -> Result<(), ExportError> {
    put(
        dir,
        write,
        "action-log",
        &ActionLog {
            game_id: GameId::new(GAME),
            entries: vec![ActionLogEntry {
                seq: 0,
                kind: "deal".to_owned(),
                seat: None,
                body: r#"{"round":0,"cards":[1]}"#.to_owned(),
            }],
        },
    )?;
    put(dir, write, "health", &Health { ok: true })?;
    put(
        dir,
        write,
        "metrics",
        &crate::rest::Metrics {
            games: 0,
            sockets: 0,
            casual: 0,
            ranked: 0,
        },
    )?;
    put(dir, write, "timers", &Timers::standard())?;
    put(dir, write, "game-settings", &GameSettings::standard())?;
    put(
        dir,
        write,
        "server-config",
        &ServerConfig {
            protocol: PROTOCOL,
            build: "dev".to_owned(),
            timers: Timers::standard(),
            standard: GameSettings::standard(),
            season: None,
            emotes: emote_ids(),
        },
    )?;
    put(
        dir,
        write,
        "season",
        &Season {
            id: 1,
            name: "Season 1".to_owned(),
            starts_at: UnixMs::new(WHEN),
            ends_at: UnixMs::new(WHEN + 86_400_000),
        },
    )?;
    put(
        dir,
        write,
        "credentials",
        &Credentials {
            username: "Anne".to_owned(),
            password: "example-password".to_owned(),
        },
    )?;
    put(
        dir,
        write,
        "profile-patch",
        &ProfilePatch {
            name: Some("Anne".to_owned()),
            color: None,
        },
    )?;
    put(
        dir,
        write,
        "error",
        &ErrorBody {
            error: ErrorObject {
                code: ErrorCode::NotFound,
                message: ErrorCode::NotFound.message().to_owned(),
            },
        },
    )?;
    Ok(())
}

fn people(dir: &Path, write: bool) -> Result<(), ExportError> {
    let user = user();
    let stats = stats();
    put(dir, write, "user", &user)?;
    put(dir, write, "stats", &stats)?;
    put(dir, write, "rating", &rating())?;
    put(
        dir,
        write,
        "active",
        &Active::Lobby {
            id: LOBBY.to_owned(),
        },
    )?;
    put(
        dir,
        write,
        "me",
        &Me {
            user: user.clone(),
            guest: false,
            username: Some("Anne".to_owned()),
            active: None,
            cooldown_until: None,
            stats,
            rating: None,
        },
    )?;
    put(
        dir,
        write,
        "profile",
        &Profile {
            user: user.clone(),
            stats,
            rating: Some(rating()),
        },
    )?;
    put(
        dir,
        write,
        "ladder-entry",
        &LadderEntry {
            rank: 1,
            user,
            rating: rating(),
        },
    )?;
    put(
        dir,
        write,
        "ladder",
        &LadderPage {
            season: Season {
                id: 1,
                name: "Season 1".to_owned(),
                starts_at: UnixMs::new(WHEN),
                ends_at: UnixMs::new(WHEN + 86_400_000),
            },
            entries: vec![LadderEntry {
                rank: 1,
                user: user_at(1),
                rating: rating(),
            }],
            next: None,
        },
    )?;
    Ok(())
}

fn lobbies(dir: &Path, write: bool) -> Result<(), ExportError> {
    let summary = LobbySummary {
        id: LobbyId::new(LOBBY),
        host_name: "Anne".to_owned(),
        settings: GameSettings::standard(),
        players: 2,
    };
    put(dir, write, "lobby-summary", &summary)?;
    put(
        dir,
        write,
        "lobby-list",
        &LobbyList {
            lobbies: vec![summary],
        },
    )?;
    put(dir, write, "member-human", &human())?;
    put(dir, write, "member-bot", &bot())?;
    put(dir, write, "lobby", &lobby())?;
    put(dir, write, "queue-status", &queue())?;
    Ok(())
}

fn game(dir: &Path, write: bool) -> Result<(), ExportError> {
    put(dir, write, "card", &card_number())?;
    put(dir, write, "engine-view", &view())?;
    put(dir, write, "seat-info", &seat_info())?;
    put(dir, write, "table-info", &table_info())?;
    put(dir, write, "game-start", &game_start())?;
    put(dir, write, "game-update", &game_update())?;
    put(dir, write, "game-result", &game_result())?;
    put(
        dir,
        write,
        "game-event",
        &GameEvent::Engine(EngineEvent::CardPlayed {
            seat: Seat::from_index(0),
            card: CardId::from_index(0),
            played_as: None,
        }),
    )?;
    put(
        dir,
        write,
        "game-event-tigress",
        &GameEvent::Engine(EngineEvent::CardPlayed {
            seat: Seat::from_index(0),
            card: CardId::from_index(66),
            played_as: Some(PlayedAs::Pirate),
        }),
    )?;
    put(
        dir,
        write,
        "game-event-seat-status",
        &GameEvent::Online(OnlineEvent::SeatStatus {
            seat: Seat::from_index(1),
            status: SeatStatus::Away,
        }),
    )?;
    put(
        dir,
        write,
        "game-event-seat-status-out",
        &GameEvent::Online(OnlineEvent::SeatStatus {
            seat: Seat::from_index(1),
            status: SeatStatus::Out,
        }),
    )?;
    put(
        dir,
        write,
        "game-event-timed-out",
        &GameEvent::Online(OnlineEvent::TimedOut {
            seat: Seat::from_index(1),
        }),
    )?;
    put(dir, write, "ability-choice", &AbilityChoice::Number(10))?;
    put(
        dir,
        write,
        "ability-choice-cards",
        &AbilityChoice::Cards(vec![CardId::from_index(0), CardId::from_index(1)]),
    )?;
    put(dir, write, "ability-choice-pass", &AbilityChoice::Pass(()))?;
    Ok(())
}

fn client_lobby(dir: &Path, write: bool) -> Result<(), ExportError> {
    let id = MessageId::new(1);
    put(
        dir,
        write,
        "hello",
        &ClientMessage::Hello {
            id,
            protocol: PROTOCOL,
            build: "dev".to_owned(),
        },
    )?;
    put(dir, write, "ping", &ClientMessage::Ping { id })?;
    put(
        dir,
        write,
        "lobby.create",
        &ClientMessage::LobbyCreate {
            id,
            visibility: Visibility::Private,
            settings: GameSettings::standard(),
        },
    )?;
    put(
        dir,
        write,
        "lobby.join",
        &ClientMessage::LobbyJoin {
            id,
            code: Some("ABCDEF".to_owned()),
            lobby_id: None,
        },
    )?;
    put(
        dir,
        write,
        "lobby.join-id",
        &ClientMessage::LobbyJoin {
            id,
            code: None,
            lobby_id: Some(LobbyId::new(LOBBY)),
        },
    )?;
    put(dir, write, "lobby.leave", &ClientMessage::LobbyLeave { id })?;
    put(
        dir,
        write,
        "lobby.ready",
        &ClientMessage::LobbyReady { id, ready: true },
    )?;
    put(
        dir,
        write,
        "lobby.settings",
        &ClientMessage::LobbySettings {
            id,
            settings: GameSettings::standard(),
        },
    )?;
    put(
        dir,
        write,
        "lobby.addBot",
        &ClientMessage::LobbyAddBot { id },
    )?;
    put(
        dir,
        write,
        "lobby.removeBot",
        &ClientMessage::LobbyRemoveBot { id, index: 3 },
    )?;
    put(
        dir,
        write,
        "lobby.kick",
        &ClientMessage::LobbyKick {
            id,
            user_id: UserId::new(USER),
        },
    )?;
    put(dir, write, "lobby.start", &ClientMessage::LobbyStart { id })?;
    put(
        dir,
        write,
        "queue.join",
        &ClientMessage::QueueJoin {
            id,
            mode: QueueMode::Casual,
        },
    )?;
    put(dir, write, "queue.leave", &ClientMessage::QueueLeave { id })?;
    Ok(())
}

fn client_game(dir: &Path, write: bool) -> Result<(), ExportError> {
    let id = MessageId::new(4);
    let at = ActionAt { round: 0, trick: 1 };
    put(
        dir,
        write,
        "game.bid",
        &ClientMessage::GameBid { id, at, bid: 2 },
    )?;
    put(
        dir,
        write,
        "game.play",
        &ClientMessage::GamePlay {
            id,
            at,
            card: CardId::from_index(0),
            played_as: None,
        },
    )?;
    put(
        dir,
        write,
        "game.play-tigress",
        &ClientMessage::GamePlay {
            id,
            at,
            card: CardId::from_index(66),
            played_as: Some(PlayedAs::Pirate),
        },
    )?;
    put(
        dir,
        write,
        "game.ability",
        &ClientMessage::GameAbility {
            id,
            at,
            choice: AbilityChoice::Number(0),
        },
    )?;
    put(dir, write, "game.ready", &ClientMessage::GameReady { id })?;
    put(
        dir,
        write,
        "game.emote",
        &ClientMessage::GameEmote {
            id,
            emote: "example".to_owned(),
        },
    )?;
    put(dir, write, "game.leave", &ClientMessage::GameLeave { id })?;
    Ok(())
}

fn replies(dir: &Path, write: bool) -> Result<(), ExportError> {
    put(dir, write, "ok", &ok(None, None, None))?;
    put(dir, write, "ok-lobby", &ok(Some(lobby()), None, None))?;
    put(dir, write, "ok-queue", &ok(None, Some(queue()), None))?;
    put(
        dir,
        write,
        "ok-time",
        &ok(None, None, Some(UnixMs::new(WHEN))),
    )?;
    put(
        dir,
        write,
        "err",
        &ErrMessage {
            tag: ErrTag::Value,
            re: MessageId::new(1),
            code: ErrorCode::NotYourTurn,
            message: ErrorCode::NotYourTurn.message().to_owned(),
        },
    )?;
    Ok(())
}

fn pushes(dir: &Path, write: bool) -> Result<(), ExportError> {
    put(
        dir,
        write,
        "welcome",
        &Welcome {
            tag: WelcomeTag::Value,
            me: me(),
            server_time: UnixMs::new(WHEN),
            lobby: None,
            queue: None,
            game: None,
        },
    )?;
    put(
        dir,
        write,
        "welcome-game",
        &WelcomeGame {
            start: game_start(),
            update: game_update(),
        },
    )?;
    put(
        dir,
        write,
        "superseded",
        &Superseded {
            tag: SupersededTag::Value,
        },
    )?;
    put(
        dir,
        write,
        "lobby.state",
        &LobbyStatePush {
            tag: LobbyStateTag::Value,
            lobby: lobby(),
        },
    )?;
    put(
        dir,
        write,
        "lobby.closed",
        &LobbyClosed {
            tag: LobbyClosedTag::Value,
            reason: CloseReason::Kicked,
        },
    )?;
    put(
        dir,
        write,
        "queue.status",
        &QueueStatusPush {
            tag: QueueStatusTag::Value,
            queue: queue(),
        },
    )?;
    put(
        dir,
        write,
        "game.emote-push",
        &GameEmotePush {
            tag: GameEmoteTag::Value,
            seat: Seat::from_index(0),
            emote: "example".to_owned(),
        },
    )?;
    put(
        dir,
        write,
        "seat.lost",
        &SeatLost {
            tag: SeatLostTag::Value,
            game_id: GameId::new(GAME),
            mode: TableMode::Ranked,
            reason: SeatLostReason::Inactivity,
        },
    )?;
    put(
        dir,
        write,
        "game.over",
        &GameOver {
            tag: GameOverTag::Value,
            game_id: GameId::new(GAME),
            seat: Some(Seat::from_index(0)),
            result: game_result(),
        },
    )?;
    Ok(())
}

fn ok(lobby: Option<Lobby>, queue: Option<QueueStatus>, server_time: Option<UnixMs>) -> OkReply {
    OkReply {
        tag: OkTag::Value,
        re: MessageId::new(1),
        lobby,
        queue,
        server_time,
    }
}

fn user() -> User {
    user_at(0)
}

fn user_at(index: u8) -> User {
    User {
        id: UserId::new(USER),
        name: "Anne".to_owned(),
        color: color(index),
        tier: None,
    }
}

fn color(index: u8) -> TableColor {
    match index {
        0 => TableColor::Sky,
        1 => TableColor::Orange,
        2 => TableColor::Purple,
        _ => TableColor::Red,
    }
}

fn stats() -> Stats {
    Stats {
        games: 3,
        wins: 1,
        bids_made: 4,
        bids_total: 10,
        best_score: Some(240),
    }
}

fn rating() -> Rating {
    Rating {
        value: 1000,
        tier: "Sailor".to_owned(),
        provisional: true,
        games: 3,
    }
}

fn me() -> Me {
    Me {
        user: user(),
        guest: true,
        username: None,
        active: None,
        cooldown_until: None,
        stats: stats(),
        rating: None,
    }
}

fn human() -> Member {
    Member::Human {
        user: user(),
        ready: true,
        connected: true,
    }
}

fn bot() -> Member {
    Member::Bot {
        name: "Calico".to_owned(),
        color: TableColor::Orange,
        level: skt_engine::BotLevel::Normal,
    }
}

fn lobby() -> Lobby {
    Lobby {
        id: LobbyId::new(LOBBY),
        code: "ABCDEF".to_owned(),
        mode: TableMode::Custom,
        visibility: Visibility::Private,
        host_id: Some(UserId::new(USER)),
        settings: GameSettings::standard(),
        members: vec![human(), bot()],
        state: LobbyPhase::Open,
        game_id: None,
    }
}

fn queue() -> QueueStatus {
    QueueStatus {
        mode: QueueMode::Casual,
        since: UnixMs::new(WHEN),
        found: 2,
        needed: 4,
    }
}

fn card_number() -> Card {
    Card::Number {
        id: CardId::from_index(0),
        suit: Suit::Green,
        rank: 1,
    }
}

fn deck() -> Vec<Card> {
    vec![
        card_number(),
        Card::Escape {
            id: CardId::from_index(56),
        },
        Card::Pirate {
            id: CardId::from_index(61),
            ability: Ability::Helm,
        },
        Card::Tigress {
            id: CardId::from_index(66),
        },
        Card::SkullKing {
            id: CardId::from_index(67),
        },
        Card::Mermaid {
            id: CardId::from_index(68),
        },
        Card::Loot {
            id: CardId::from_index(70),
        },
        Card::Kraken {
            id: CardId::from_index(72),
        },
        Card::Whale {
            id: CardId::from_index(73),
        },
    ]
}

fn seat_info() -> SeatInfo {
    SeatInfo {
        name: "Anne".to_owned(),
        color: TableColor::Sky,
        bot: false,
        user_id: Some(UserId::new(USER)),
        tier: None,
    }
}

fn table_info() -> TableInfo {
    TableInfo {
        status: vec![SeatStatus::Online, SeatStatus::Bot],
        deadline: Some(Deadline {
            kind: DeadlineKind::Bid,
            seats: vec![Seat::from_index(0), Seat::from_index(1)],
            at: UnixMs::new(WHEN + 45_000),
        }),
        ready: vec![false, false],
    }
}

fn game_start() -> GameStart {
    GameStart {
        tag: GameStartTag::Value,
        game_id: GameId::new(GAME),
        mode: TableMode::Custom,
        lobby_id: Some(LobbyId::new(LOBBY)),
        settings: GameSettings::standard(),
        deck: deck(),
        schedule: vec![6, 7, 8, 9, 10],
        seats: vec![
            seat_info(),
            SeatInfo {
                name: "Calico".to_owned(),
                color: TableColor::Orange,
                bot: true,
                user_id: None,
                tier: None,
            },
        ],
        me: Seat::from_index(0),
    }
}

fn game_update() -> GameUpdate {
    GameUpdate {
        tag: GameUpdateTag::Value,
        game_id: GameId::new(GAME),
        rev: 1,
        events: vec![GameEvent::Engine(EngineEvent::BidPlaced {
            seat: Seat::from_index(0),
        })],
        view: view(),
        table: table_info(),
    }
}

fn game_result() -> GameResult {
    GameResult {
        totals: vec![80, 20],
        places: vec![1, 2],
        forfeited: vec![],
        rating: Some(RatingChange {
            before: rating(),
            after: Rating {
                value: 1012,
                tier: "Sailor".to_owned(),
                provisional: true,
                games: 4,
            },
            delta: 12,
        }),
        lobby_id: Some(LobbyId::new(LOBBY)),
    }
}

fn view() -> EngineView {
    EngineView {
        me: Seat::from_index(0),
        phase: Phase::Bidding,
        round: 0,
        rounds: 5,
        cards: 6,
        dealer: Seat::from_index(1),
        turn: None,
        hand: vec![CardId::from_index(0), CardId::from_index(67)],
        hand_counts: vec![6, 6],
        played: vec![],
        bids: vec![Some(2), Some(-1)],
        won: vec![0, 0],
        trick: Trick {
            leader: Seat::from_index(0),
            plays: vec![],
        },
        last_trick: None,
        log: vec![RoundRecord {
            cards: 6,
            bids: vec![None, None],
            tricks: vec![None, None],
            b14: vec![0, 0],
            mp: vec![0, 0],
            ps: vec![0, 0],
            wager: vec![0, 0],
            black14: SeatOrNone::nobody(),
            sm: SeatOrNone::nobody(),
            loot: vec![],
            destroyed: 0,
            giant: None,
            done: false,
        }],
        pending: None,
        legal: vec![],
    }
}
