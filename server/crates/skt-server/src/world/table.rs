//! One running game. The engine is the authority. This module only deals, times, and hides.

use std::collections::HashMap;
use std::time::{Duration, Instant};

use skt_engine::{BotLevel, Expansions, GameState, Phase, Ruleset, Seat};
use skt_protocol::{
    ClientMessage, Deadline, DeadlineKind, EngineView, ErrMessage, ErrTag, ErrorCode,
    GameEmotePush, GameEmoteTag, GameEvent, GameId, GameOver, GameOverTag, GameResult, GameStart,
    GameStartTag, GameUpdate, GameUpdateTag, Lobby, LobbyId, Member, MessageId, OkReply, OkTag,
    OnlineEvent, RatingChange, SeatInfo, SeatLost, SeatLostReason, SeatLostTag, SeatStatus,
    TableInfo, TableMode, UserId, WelcomeGame,
};

use crate::rating::{self, PlayerSkill};

use super::identity;
use super::send;
use crate::random::{OsRandom, Recall};

struct SeatPlay {
    user: Option<UserId>,
    name: String,
    color: skt_protocol::TableColor,
    started_bot: bool,
    misses: u8,
    /// When this seat last sent an accepted emote.
    last_emote: Option<Instant>,
    prior_mu: f64,
    prior_sigma: f64,
    prior_games: u32,
    tier: Option<String>,
}

/// One human's line in a finished game, ready to store.
pub struct SeatTally {
    /// The player.
    pub user: UserId,
    /// Seat index.
    pub seat: u8,
    /// Points at the end.
    pub total: i32,
    /// 1 is a win, including a shared first place.
    pub place: u32,
    /// `place` is 1.
    pub win: bool,
    /// Rounds where the bid was hit.
    pub bids_made: u32,
    /// Scored rounds.
    pub bids_total: u32,
}

/// One human in a ranked result, including a seat that left.
pub struct RatedResult {
    /// The player.
    pub user: UserId,
    /// Seat index.
    pub seat: u8,
    /// Points at the end, as played.
    pub total: i32,
    /// Place. A forfeit is last.
    pub place: u32,
    /// Skill after this game.
    pub after: PlayerSkill,
}

/// A finished game, written in one database transaction.
pub struct GameReport {
    /// Game id.
    pub id: String,
    /// `custom`, `casual`, or `ranked`.
    pub mode: &'static str,
    /// Humans who were still seated. A `game.leave` is absent.
    pub seats: Vec<SeatTally>,
    /// Ranked humans, including forfeits. Empty for every other mode.
    pub rated: Vec<RatedResult>,
    /// `game.over` for each human, sent after the result is stored.
    pub overs: Vec<(UserId, GameOver)>,
    /// Ranked seats that were away for most rounds. A `game.leave` is not repeated here.
    pub penalise: Vec<UserId>,
    /// Deals and accepted actions, in order.
    pub log: Vec<LogEntry>,
}

/// Steps of one running game that still need to be stored.
pub struct OpenDelta {
    /// Game id.
    pub id: String,
    /// `custom`, `casual`, or `ranked`.
    pub mode: String,
    /// Quick play and ranked have no lobby.
    pub matchmade: bool,
    /// The rules the table opened with.
    pub settings: skt_protocol::GameSettings,
    /// Seats as JSON.
    pub seats: String,
    /// New rows. `seq` is the position in the whole log.
    pub entries: Vec<(i32, String, Option<i32>, String)>,
    /// Log lines stored once these rows are written.
    pub stored: usize,
}

/// A seat as it is written into `open_games`.
#[derive(serde::Serialize, serde::Deserialize)]
struct SavedSeat {
    user: Option<String>,
    name: String,
    color: skt_protocol::TableColor,
    bot: bool,
}

/// A running game read back from Postgres.
pub struct RestoredGame {
    /// Game id.
    pub id: String,
    /// `custom`, `casual`, or `ranked`.
    pub mode: String,
    /// Quick play and ranked have no lobby.
    pub matchmade: bool,
    /// The rules the table opened with.
    pub settings: skt_protocol::GameSettings,
    /// Seats in order.
    pub seats: Vec<RestoredSeat>,
    /// Every stored step.
    pub log: Vec<super::replay::Step>,
}

/// One seat of a restored game.
#[derive(serde::Deserialize)]
pub struct RestoredSeat {
    /// The account, or nothing for a bot.
    pub user: Option<String>,
    /// Display name.
    pub name: String,
    /// Seat colour.
    pub color: skt_protocol::TableColor,
    /// The seat started as a bot.
    pub bot: bool,
}

/// One stored step. `body` is JSON.
pub struct LogEntry {
    /// `deal`, `bid`, `play`, `ability`, or `advance`.
    pub kind: &'static str,
    /// Acting seat, or nothing for a deal or an advance.
    pub seat: Option<u8>,
    /// JSON payload.
    pub body: String,
}

/// Skill copied onto a seat when the game opens.
pub struct OpenPrior {
    /// Weng-Lin μ.
    pub mu: f64,
    /// Weng-Lin σ.
    pub sigma: f64,
    /// Games already finished this season.
    pub games: u32,
    /// Tier at the opening, or nothing when the account is unrated.
    pub tier: Option<String>,
}

struct Running {
    id: GameId,
    lobby_id: LobbyId,
    /// Quick play and ranked have no lobby to reopen.
    matchmade: bool,
    mode: TableMode,
    settings: skt_protocol::GameSettings,
    state: GameState,
    seats: Vec<SeatPlay>,
    status: Vec<SeatStatus>,
    ready: Vec<bool>,
    rev: u32,
    bot_at: Option<Instant>,
    step_at: Option<Instant>,
    shown: Option<Deadline>,
    over: bool,
    reopened: bool,
    report: Option<GameReport>,
    owed: HashMap<UserId, GameOver>,
    forfeited: Vec<Seat>,
    /// Rounds that reached round end.
    rounds: u32,
    /// How many of those rounds ended while this seat was away.
    away_rounds: Vec<u32>,
    log: Vec<LogEntry>,
    /// How many log lines are already in `open_log`.
    stored: usize,
    /// Inactivity kicks this step. Drained by `Tables::tick`.
    kicks: Vec<UserId>,
    /// Seats closed for inactivity, in the order of the kicks. Not the leave list.
    kicked_seats: Vec<Seat>,
}

/// A player removed for inactivity. Ranked starts the cooldown here, not at `game.over`.
pub struct InactivityKick {
    /// The account.
    pub user: UserId,
    /// Ranked games forfeit and cool down. Other modes do not.
    pub ranked: bool,
}

/// Every game in the process.
pub struct Tables {
    games: HashMap<GameId, Running>,
    seat_of: HashMap<UserId, (GameId, Seat)>,
    /// `seat.lost` still owed. Removed once a `welcome` has had it queued.
    lost: HashMap<UserId, SeatLost>,
}

impl Tables {
    pub fn len(&self) -> usize {
        self.games.len()
    }

    pub fn new() -> Self {
        Self {
            games: HashMap::new(),
            seat_of: HashMap::new(),
            lost: HashMap::new(),
        }
    }

    pub fn open(
        &mut self,
        id: &GameId,
        lobby: &Lobby,
        now: Instant,
        live: &HashMap<UserId, super::Live>,
        matchmade: bool,
        priors: &HashMap<UserId, OpenPrior>,
    ) -> Vec<(UserId, GameId)> {
        let (mut seats, mut infos, status) = seats_from(lobby, live);
        for (seat, info) in seats.iter_mut().zip(infos.iter_mut()) {
            let Some(user) = seat.user.clone() else {
                continue;
            };
            if let Some(prior) = priors.get(&user) {
                seat.prior_mu = prior.mu;
                seat.prior_sigma = prior.sigma;
                seat.prior_games = prior.games;
                seat.tier.clone_from(&prior.tier);
                info.tier.clone_from(&prior.tier);
            }
        }
        let infos = unique_colors(infos);
        for (seat, info) in seats.iter_mut().zip(&infos) {
            seat.color = info.color;
        }
        let Some((state, log)) = opening_deal(&lobby.settings, seats.len()) else {
            return Vec::new();
        };
        let mode = if matchmade {
            lobby.mode
        } else {
            TableMode::Custom
        };
        let players = seats.len();
        let mut running = Running {
            id: id.clone(),
            lobby_id: lobby.id.clone(),
            matchmade,
            mode,
            settings: lobby.settings,
            state,
            seats,
            status,
            ready: Vec::new(),
            rev: 0,
            bot_at: None,
            step_at: None,
            shown: None,
            over: false,
            reopened: false,
            report: None,
            owed: HashMap::new(),
            forfeited: Vec::new(),
            rounds: 0,
            away_rounds: vec![0; players],
            log,
            stored: 0,
            kicks: Vec::new(),
            kicked_seats: Vec::new(),
        };
        running.ready.resize(running.seats.len(), false);
        running.arm(now);
        let players = running.players();
        for index in 0..players {
            let Some(user) = running.seats[index].user.clone() else {
                continue;
            };
            self.seat_of.insert(
                user.clone(),
                (
                    id.clone(),
                    Seat::from_index(u8::try_from(index).unwrap_or(0)),
                ),
            );
            if live.contains_key(&user) {
                running.send_start(&user, index, live);
                running.send_update(&user, index, Vec::new(), live);
            }
        }
        let seated = running
            .seats
            .iter()
            .filter_map(|seat| seat.user.clone())
            .map(|user| (user, id.clone()))
            .collect();
        self.games.insert(id.clone(), running);
        seated
    }

    /// One seated player and their cards. Tests use this after a replay.
    #[cfg(test)]
    pub fn first_hand(&self) -> Option<(UserId, Vec<u8>)> {
        let (user, _) = self.seat_of.iter().next()?;
        let cards = self.hand(user)?;
        Some((user.clone(), cards))
    }

    /// Cards in this player's hand. Tests use this to check a replay.
    #[cfg(test)]
    pub fn hand(&self, user: &UserId) -> Option<Vec<u8>> {
        let (id, seat) = self.seat_of.get(user)?;
        let running = self.games.get(id)?;
        let view = running.state.view(*seat).ok()?;
        Some(
            view.hand
                .iter()
                .map(|card| u8::try_from(card.index()).unwrap_or(0))
                .collect(),
        )
    }

    /// The game this player is sitting, if they have a seat.
    pub fn game_of(&self, user: &UserId) -> Option<GameId> {
        self.seat_of.get(user).map(|(id, _)| id.clone())
    }

    /// Steps not yet written to `open_log`.
    pub fn checkpoint(&self) -> Vec<OpenDelta> {
        self.games
            .values()
            .filter(|running| !running.over && running.stored < running.log.len())
            .map(|running| {
                let seats = running
                    .seats
                    .iter()
                    .map(|seat| SavedSeat {
                        user: seat.user.as_ref().map(|id| id.as_str().to_owned()),
                        name: seat.name.clone(),
                        color: seat.color,
                        bot: seat.started_bot,
                    })
                    .collect::<Vec<_>>();
                let entries = running
                    .log
                    .iter()
                    .enumerate()
                    .skip(running.stored)
                    .map(|(seq, entry)| {
                        (
                            i32::try_from(seq).unwrap_or(i32::MAX),
                            entry.kind.to_owned(),
                            entry.seat.map(i32::from),
                            entry.body.clone(),
                        )
                    })
                    .collect();
                OpenDelta {
                    id: running.id.as_str().to_owned(),
                    mode: mode_name(running.mode).to_owned(),
                    matchmade: running.matchmade,
                    settings: running.settings,
                    seats: serde_json::to_string(&seats).unwrap_or_else(|_| "[]".to_owned()),
                    entries,
                    stored: running.log.len(),
                }
            })
            .collect()
    }

    /// `stored` lines of this game are now in `open_log`.
    pub fn mark_stored(&mut self, id: &str, stored: usize) {
        if let Some(running) = self
            .games
            .values_mut()
            .find(|running| running.id.as_str() == id)
        {
            running.stored = running.stored.max(stored);
        }
    }

    /// Put a game read from `open_games` back on the clock. Deadlines start again from `now`.
    pub fn resume(&mut self, game: RestoredGame, now: Instant) -> bool {
        let players = u8::try_from(game.seats.len()).unwrap_or(0);
        let Some(state) = super::replay::rebuild(&game.settings, players, &game.log) else {
            return false;
        };
        let count = game.seats.len();
        let seats = game
            .seats
            .iter()
            .map(|seat| SeatPlay {
                user: seat.user.as_ref().map(|id| UserId::new(id.clone())),
                name: seat.name.clone(),
                color: seat.color,
                started_bot: seat.bot,
                misses: 0,
                last_emote: None,
                prior_mu: 25.0,
                prior_sigma: 25.0 / 3.0,
                prior_games: 0,
                tier: None,
            })
            .collect::<Vec<_>>();
        let log = game
            .log
            .iter()
            .filter_map(|step| {
                kind_of(&step.kind).map(|kind| LogEntry {
                    kind,
                    seat: step.seat,
                    body: step.body.clone(),
                })
            })
            .collect::<Vec<_>>();
        let stored = log.len();
        let id = GameId::new(game.id);
        let mut running = Running {
            id: id.clone(),
            lobby_id: skt_protocol::LobbyId::new("restored"),
            matchmade: game.matchmade,
            mode: mode_of(&game.mode),
            settings: game.settings,
            state,
            seats,
            status: vec![SeatStatus::Offline; count],
            ready: vec![false; count],
            rev: u32::try_from(stored).unwrap_or(u32::MAX),
            bot_at: None,
            step_at: None,
            shown: None,
            over: false,
            reopened: false,
            report: None,
            owed: HashMap::new(),
            forfeited: Vec::new(),
            rounds: 0,
            away_rounds: vec![0; count],
            log,
            stored,
            kicks: Vec::new(),
            kicked_seats: Vec::new(),
        };
        running.arm(now);
        for (index, seat) in running.seats.iter().enumerate() {
            let Some(user) = seat.user.clone() else {
                continue;
            };
            self.seat_of.insert(
                user,
                (
                    id.clone(),
                    Seat::from_index(u8::try_from(index).unwrap_or(0)),
                ),
            );
        }
        self.games.insert(id, running);
        true
    }

    pub fn welcome_game(&self, user: &UserId) -> Option<WelcomeGame> {
        let (id, seat) = self.seat_of.get(user)?;
        let running = self.games.get(id)?;
        if running.over || running.status.get(seat.index()) == Some(&SeatStatus::Out) {
            return None;
        }
        let index = seat.index();
        Some(WelcomeGame {
            start: running.start_for(index),
            update: running.update_for(index, Vec::new()),
        })
    }

    pub fn flush_owed(&self, user: &UserId, live: &HashMap<UserId, super::Live>) {
        for running in self.games.values() {
            if let Some(over) = running.owed.get(user)
                && let Some(socket) = live.get(user)
            {
                send(&socket.out, over);
            }
        }
    }

    pub fn on_socket(
        &mut self,
        user: &UserId,
        up: bool,
        now: Instant,
        live: &HashMap<UserId, super::Live>,
    ) {
        let Some((id, seat)) = self.seat_of.get(user).cloned() else {
            return;
        };
        let Some(running) = self.games.get_mut(&id) else {
            return;
        };
        if running.over || running.status.get(seat.index()) == Some(&SeatStatus::Out) {
            return;
        }
        let index = seat.index();
        let next = if up {
            SeatStatus::Online
        } else {
            SeatStatus::Offline
        };
        if running.status.get(index) == Some(&next) || running.seats[index].started_bot {
            return;
        }
        // Human: A drop starts the two offline misses at zero. Sitting back down clears them too.
        // Agent: WRITES misses on every connect and drop. Out is left closed.
        running.seats[index].misses = 0;
        running.status[index] = next;
        let events = vec![GameEvent::Online(OnlineEvent::SeatStatus {
            seat,
            status: next,
        })];
        running.publish(&events, None, live);
        running.arm(now);
    }

    /// Broadcast one emote. The sender gets `ok` and then the push. Other seats get the push only.
    pub fn emote(
        &mut self,
        user: &UserId,
        id: MessageId,
        emote: &str,
        now: Instant,
        live: &HashMap<UserId, super::Live>,
    ) {
        let Some((game_id, seat)) = self.seat_of.get(user).cloned() else {
            fail(live, user, id, ErrorCode::NotInGame);
            return;
        };
        let Some(running) = self.games.get_mut(&game_id) else {
            fail(live, user, id, ErrorCode::NotInGame);
            return;
        };
        if running.over
            || running
                .seats
                .get(seat.index())
                .is_none_or(|play| play.user.is_none())
        {
            fail(live, user, id, ErrorCode::NotInGame);
            return;
        }
        if !skt_protocol::EMOTES.contains(&emote) {
            fail(live, user, id, ErrorCode::Validation);
            return;
        }
        let index = seat.index();
        if running.seats[index]
            .last_emote
            .is_some_and(|last| now.saturating_duration_since(last) < Duration::from_secs(2))
        {
            fail(live, user, id, ErrorCode::RateLimited);
            return;
        }
        running.seats[index].last_emote = Some(now);
        let push = GameEmotePush {
            tag: GameEmoteTag::Value,
            seat,
            emote: emote.to_owned(),
        };
        ok(live, user, id);
        for play in &running.seats {
            let Some(seated) = &play.user else {
                continue;
            };
            if let Some(socket) = live.get(seated) {
                super::send(&socket.out, &push);
            }
        }
    }

    pub fn act(
        &mut self,
        user: &UserId,
        message: ClientMessage,
        now: Instant,
        live: &HashMap<UserId, super::Live>,
        lobbies: &mut HashMap<LobbyId, Lobby>,
    ) -> (Vec<UserId>, bool) {
        let Some((id, seat)) = self.seat_of.get(user).cloned() else {
            if let ClientMessage::GameBid { id, .. }
            | ClientMessage::GamePlay { id, .. }
            | ClientMessage::GameAbility { id, .. }
            | ClientMessage::GameReady { id }
            | ClientMessage::GameLeave { id } = message
            {
                fail(live, user, id, ErrorCode::NotInGame);
            }
            return (Vec::new(), false);
        };
        let Some(running) = self.games.get_mut(&id) else {
            return (Vec::new(), false);
        };
        if running.over {
            return (Vec::new(), false);
        }
        let _ = lobbies;
        match message {
            ClientMessage::GameLeave { id: msg } => self.leave_seat(user, seat, msg, now, live),
            ClientMessage::GameReady { id: msg } => {
                if running.state.phase() != Phase::RoundEnd {
                    fail(live, user, msg, ErrorCode::NotYourTurn);
                    return (Vec::new(), false);
                }
                running.ready[seat.index()] = true;
                running.seats[seat.index()].misses = 0;
                ok(live, user, msg);
                running.publish(&[], Some(user), live);
                if running.humans_ready() {
                    let _ = running.advance(now, live);
                } else {
                    running.arm(now);
                }
                (Vec::new(), false)
            }
            ClientMessage::GameBid { id: msg, at, bid } => (
                self.player_step(
                    &id,
                    &Hit {
                        user,
                        seat,
                        msg,
                        at,
                        now,
                        live,
                    },
                    "bid",
                    format!(r#"{{"bid":{bid}}}"#),
                    |state| state.bid(seat, i64::from(bid)),
                ),
                false,
            ),
            ClientMessage::GamePlay {
                id: msg,
                at,
                card,
                played_as,
            } => (
                self.player_step(
                    &id,
                    &Hit {
                        user,
                        seat,
                        msg,
                        at,
                        now,
                        live,
                    },
                    "play",
                    play_body(card, played_as),
                    |state| state.play(seat, card, played_as),
                ),
                false,
            ),
            ClientMessage::GameAbility {
                id: msg,
                at,
                choice,
            } => (
                self.player_step(
                    &id,
                    &Hit {
                        user,
                        seat,
                        msg,
                        at,
                        now,
                        live,
                    },
                    "ability",
                    serde_json::to_string(&choice).unwrap_or_else(|_| "{}".to_owned()),
                    |state| state.ability(seat, &choice),
                ),
                false,
            ),
            _ => (Vec::new(), false),
        }
    }

    fn leave_seat(
        &mut self,
        user: &UserId,
        seat: Seat,
        msg: MessageId,
        now: Instant,
        live: &HashMap<UserId, super::Live>,
    ) -> (Vec<UserId>, bool) {
        let Some((id, _)) = self.seat_of.get(user).cloned() else {
            return (Vec::new(), false);
        };
        let Some(running) = self.games.get_mut(&id) else {
            return (Vec::new(), false);
        };
        let ranked = running.mode == TableMode::Ranked;
        ok(live, user, msg);
        running.status[seat.index()] = SeatStatus::Bot;
        let events = vec![GameEvent::Online(OnlineEvent::SeatStatus {
            seat,
            status: SeatStatus::Bot,
        })];
        running.publish(&events, Some(user), live);
        running.forfeited.push(seat);
        running.arm(now);
        self.seat_of.remove(user);
        (vec![user.clone()], ranked)
    }

    pub fn tick(
        &mut self,
        now: Instant,
        live: &HashMap<UserId, super::Live>,
        lobbies: &mut HashMap<LobbyId, Lobby>,
    ) -> (Vec<UserId>, Vec<GameReport>, Vec<InactivityKick>) {
        let ids: Vec<GameId> = self.games.keys().cloned().collect();
        let mut finished = Vec::new();
        let mut reports = Vec::new();
        let mut kicked = Vec::new();
        for id in ids {
            let ended = {
                let Some(running) = self.games.get_mut(&id) else {
                    continue;
                };
                if running.over {
                    if running.reopened {
                        None
                    } else {
                        running.reopened = true;
                        let users = running
                            .seats
                            .iter()
                            .filter_map(|seat| seat.user.clone())
                            .collect::<Vec<_>>();
                        if let Some(report) = running.report.take() {
                            reports.push(report);
                        }
                        Some((running.matchmade, running.lobby_id.clone(), users))
                    }
                } else {
                    if running.step_at.is_some_and(|at| at <= now) {
                        running.step_at = None;
                        running.fire_clock(now, live);
                    } else if running.bot_at.is_some_and(|at| at <= now) {
                        running.bot_at = None;
                        running.bot_move(now, live);
                    }
                    None
                }
            };
            if let Some(running) = self.games.get_mut(&id) {
                let pending = std::mem::take(&mut running.kicks);
                let mode = running.mode;
                let game_id = running.id.clone();
                let ranked = mode == TableMode::Ranked;
                for user in pending {
                    self.seat_of.remove(&user);
                    self.lost.entry(user.clone()).or_insert(SeatLost {
                        tag: SeatLostTag::Value,
                        game_id: game_id.clone(),
                        mode,
                        reason: SeatLostReason::Inactivity,
                    });
                    kicked.push(InactivityKick { user, ranked });
                }
            }
            if let Some((matchmade, lobby_id, users)) = ended {
                // A quick-play table has no lobby. A custom lobby opens with nobody ready.
                if !matchmade {
                    reopen_lobby(&lobby_id, lobbies, live);
                }
                for user in users {
                    self.seat_of.remove(&user);
                    finished.push(user);
                }
            }
        }
        (finished, reports, kicked)
    }

    /// `seat.lost` for this account, if a welcome has not queued it yet.
    pub fn take_lost(&mut self, user: &UserId) -> Option<SeatLost> {
        self.lost.remove(user)
    }

    pub fn deliver(&mut self, report: &GameReport, live: &HashMap<UserId, super::Live>) {
        for (user, over) in &report.overs {
            if let Some(socket) = live.get(user) {
                send(&socket.out, over);
            } else if let Some(running) = self.games.get_mut(&over.game_id) {
                running.owed.insert(user.clone(), over.clone());
            }
        }
    }

    fn player_step(
        &mut self,
        id: &GameId,
        hit: &Hit<'_>,
        kind: &'static str,
        payload: String,
        body: impl FnOnce(&mut GameState) -> Result<Vec<skt_engine::GameEvent>, skt_engine::StepError>,
    ) -> Vec<UserId> {
        let Some(running) = self.games.get_mut(id) else {
            return Vec::new();
        };
        if !fresh(running, hit.at) {
            fail(hit.live, hit.user, hit.msg, ErrorCode::StaleAction);
            return Vec::new();
        }
        let events = match body(&mut running.state) {
            Ok(events) => events,
            Err(skt_engine::StepError::Rejected(rejection)) => {
                fail(hit.live, hit.user, hit.msg, code_of(rejection));
                return Vec::new();
            }
            Err(skt_engine::StepError::Broken) => {
                fail(hit.live, hit.user, hit.msg, ErrorCode::Internal);
                return Vec::new();
            }
        };
        let wire: Vec<GameEvent> = events.into_iter().map(GameEvent::Engine).collect();
        running.push_log(kind, u8::try_from(hit.seat.index()).ok(), payload);
        running.seats[hit.seat.index()].misses = 0;
        if running.status[hit.seat.index()] == SeatStatus::Away {
            running.status[hit.seat.index()] = SeatStatus::Online;
        }
        ok(hit.live, hit.user, hit.msg);
        running.arm(hit.now);
        running.publish(&wire, Some(hit.user), hit.live);
        if running.step_at == Some(hit.now) {
            running.step_at = None;
            let _ = running.advance(hit.now, hit.live);
        }
        if running.state.phase() == Phase::GameOver {
            running.finish(hit.live);
        }
        Vec::new()
    }
}

struct Hit<'a> {
    user: &'a UserId,
    seat: Seat,
    msg: MessageId,
    at: skt_protocol::ActionAt,
    now: Instant,
    live: &'a HashMap<UserId, super::Live>,
}

impl Running {
    fn players(&self) -> usize {
        self.seats.len()
    }

    fn arm(&mut self, now: Instant) {
        self.bot_at = None;
        self.step_at = None;
        self.shown = None;
        if self.over || self.state.phase() == Phase::GameOver {
            return;
        }
        let pace = scaled(self.settings.pace);
        let timers = skt_protocol::Timers::standard();
        match self.state.phase() {
            Phase::TrickEnd => {
                self.step_at = Some(now + Duration::from_millis(u64::from(timers.trick_end_ms)));
            }
            Phase::RoundEnd if self.humans_ready() => self.step_at = Some(now),
            Phase::Bidding | Phase::Playing | Phase::Ability | Phase::RoundEnd => {
                if self.next_auto().is_some() {
                    self.bot_at = Some(now + Duration::from_millis(self.auto_delay_ms()));
                }
                if let Some(mut deadline) = self.human_deadline() {
                    let ms = match self.state.phase() {
                        Phase::Bidding => pace(timers.bid_ms),
                        Phase::Playing => pace(timers.play_ms),
                        Phase::Ability => pace(timers.ability_ms),
                        _ => timers.round_end_ms,
                    };
                    let at = identity::unix_now().get().saturating_add(i64::from(ms));
                    deadline.at = skt_protocol::UnixMs::new(at);
                    self.shown = Some(deadline);
                    self.step_at = Some(now + Duration::from_millis(u64::from(ms)));
                }
            }
            Phase::GameOver => {}
        }
    }

    fn human_deadline(&self) -> Option<Deadline> {
        let Ok(view) = self.state.view(Seat::from_index(0)) else {
            return None;
        };
        let kind = match view.phase {
            Phase::Bidding => DeadlineKind::Bid,
            Phase::Playing => DeadlineKind::Play,
            Phase::Ability => DeadlineKind::Ability,
            Phase::RoundEnd => DeadlineKind::NextRound,
            _ => return None,
        };
        let mut seats = Vec::new();
        for index in 0..self.players() {
            // Away humans are played for on bid, play, and ability. At round end they are waited
            // for, and the round-end deadline has to include them or the table never moves on.
            let away_from_round =
                self.status[index] == SeatStatus::Away && kind != DeadlineKind::NextRound;
            // Human: An offline seat stays on the clock so two misses can kick it. Out is not.
            if self.seats[index].started_bot
                || self.status[index] == SeatStatus::Bot
                || self.status[index] == SeatStatus::Out
                || away_from_round
            {
                continue;
            }
            let waiting = match view.phase {
                Phase::Bidding => view.bids.get(index).is_none_or(Option::is_none),
                Phase::Playing => {
                    view.turn == Some(Seat::from_index(u8::try_from(index).unwrap_or(0)))
                }
                Phase::Ability => view.pending.as_ref().is_some_and(|pending| {
                    pending.seat == Seat::from_index(u8::try_from(index).unwrap_or(0))
                }),
                Phase::RoundEnd => !self.ready[index],
                _ => false,
            };
            if waiting {
                seats.push(Seat::from_index(u8::try_from(index).unwrap_or(0)));
            }
        }
        if seats.is_empty() {
            return None;
        }
        let at = self
            .step_at
            .map_or_else(identity::unix_now, |_instant| identity::unix_now());
        let _ = at;
        Some(Deadline {
            kind,
            seats,
            at: identity::unix_now(),
        })
    }

    /// The next seat the server plays for: a bot, a takeover, or an away human.
    fn next_auto(&self) -> Option<Seat> {
        let Ok(view) = self.state.view(Seat::from_index(0)) else {
            return None;
        };
        match view.phase {
            Phase::Bidding => (0..self.players())
                .find(|index| {
                    self.automatic(*index) && view.bids.get(*index).is_none_or(Option::is_none)
                })
                .map(|index| Seat::from_index(u8::try_from(index).unwrap_or(0))),
            Phase::Playing => view.turn.filter(|seat| self.automatic(seat.index())),
            Phase::Ability => view
                .pending
                .as_ref()
                .and_then(|pending| self.automatic(pending.seat.index()).then_some(pending.seat)),
            _ => None,
        }
    }

    fn automatic(&self, index: usize) -> bool {
        self.seats.get(index).is_some_and(|seat| seat.started_bot)
            || matches!(
                self.status.get(index),
                Some(SeatStatus::Bot | SeatStatus::Away | SeatStatus::Out)
            )
    }

    /// Bots take 0.8–1.5s. An away human, and a kicked seat, are played after 1.5s.
    fn auto_delay_ms(&self) -> u64 {
        let away = self.next_auto().is_some_and(|seat| {
            matches!(
                self.status.get(seat.index()),
                Some(SeatStatus::Away | SeatStatus::Out)
            ) && !self
                .seats
                .get(seat.index())
                .is_some_and(|seat| seat.started_bot)
        });
        if away {
            1_500
        } else {
            800 + rand::rng().random_range(0..700)
        }
    }

    fn schedule_bot_if_idle(&mut self, now: Instant) {
        if self.bot_at.is_some() || self.over {
            return;
        }
        if self.next_auto().is_some() {
            self.bot_at = Some(now + Duration::from_millis(self.auto_delay_ms()));
        }
    }

    fn humans_ready(&self) -> bool {
        self.seats.iter().enumerate().all(|(index, seat)| {
            seat.started_bot
                || self.status[index] == SeatStatus::Bot
                || self.status[index] == SeatStatus::Offline
                || self.status[index] == SeatStatus::Out
                || self.ready[index]
        })
    }

    fn advance(&mut self, now: Instant, live: &HashMap<UserId, super::Live>) -> bool {
        let round_end = self.state.phase() == Phase::RoundEnd;
        let mut deals = Recall::new(self.state.deck().len());
        let Ok(events) = self.state.advance(&mut deals) else {
            return false;
        };
        for (round, cards) in deals.orders {
            self.push_log("deal", None, deal_body(round, &cards));
        }
        self.push_log("advance", None, "{}".to_owned());
        if round_end {
            self.note_round_end();
        }
        self.ready.fill(false);
        let wire: Vec<GameEvent> = events.into_iter().map(GameEvent::Engine).collect();
        self.publish(&wire, None, live);
        self.after_step(now, live);
        true
    }

    /// A trick-end or round-end clock advances. A bid, play, or ability clock plays the seats that missed it.
    fn fire_clock(&mut self, now: Instant, live: &HashMap<UserId, super::Live>) {
        match self.state.phase() {
            Phase::TrickEnd | Phase::RoundEnd => {
                let _ = self.advance(now, live);
            }
            Phase::Bidding | Phase::Playing | Phase::Ability => self.timeout_due(now, live),
            Phase::GameOver => {}
        }
    }

    fn timeout_due(&mut self, now: Instant, live: &HashMap<UserId, super::Live>) {
        let seats = self
            .shown
            .as_ref()
            .map(|deadline| deadline.seats.clone())
            .unwrap_or_default();
        let mut mark_away = Vec::new();
        for seat in seats {
            if self.over
                || !matches!(
                    self.state.phase(),
                    Phase::Bidding | Phase::Playing | Phase::Ability
                )
            {
                break;
            }
            let on_clock = matches!(
                self.status.get(seat.index()),
                Some(SeatStatus::Online | SeatStatus::Offline)
            );
            if !on_clock || !self.waiting(seat) {
                continue;
            }
            let _ = self.apply_auto(seat, live, true, &mut mark_away);
        }
        self.after_step(now, live);
        self.publish_away(&mark_away, live);
        self.schedule_bot_if_idle(now);
    }

    fn bot_move(&mut self, now: Instant, live: &HashMap<UserId, super::Live>) {
        let Some(seat) = self.next_auto() else {
            return;
        };
        let mut mark_away = Vec::new();
        if self.apply_auto(seat, live, false, &mut mark_away) {
            self.after_step(now, live);
            self.publish_away(&mark_away, live);
        }
    }

    fn waiting(&self, seat: Seat) -> bool {
        let Ok(view) = self.state.view(seat) else {
            return false;
        };
        match view.phase {
            Phase::Bidding => view.bids.get(seat.index()).is_none_or(Option::is_none),
            Phase::Playing => view.turn == Some(seat),
            Phase::Ability => view
                .pending
                .as_ref()
                .is_some_and(|pending| pending.seat == seat),
            _ => false,
        }
    }

    // Human: A bot, a takeover, or a missed deadline plays from that seat's own view.
    // Agent: READS EngineView for `seat` and the deck; WRITES one engine step; never serialises GameState.
    fn apply_auto(
        &mut self,
        seat: Seat,
        live: &HashMap<UserId, super::Live>,
        timed_out: bool,
        mark_away: &mut Vec<Seat>,
    ) -> bool {
        let Ok(view) = self.state.view(seat) else {
            return false;
        };
        let level = if self.seats[seat.index()].started_bot {
            self.settings.bot_level
        } else {
            BotLevel::Normal
        };
        let seat_no = u8::try_from(seat.index()).ok();
        let mut rng = OsRandom;
        let played = match view.phase {
            Phase::Bidding => {
                let Some(bid) =
                    skt_engine::choose_bid(&view, self.state.deck(), level, &mut rng).ok()
                else {
                    return false;
                };
                let events = self.state.bid(seat, i64::from(bid)).ok();
                if events.is_some() {
                    self.push_log("bid", seat_no, format!(r#"{{"bid":{bid}}}"#));
                }
                events
            }
            Phase::Playing => {
                let Some((card, played_as)) =
                    skt_engine::choose_play(&view, self.state.deck(), level, &mut rng).ok()
                else {
                    return false;
                };
                let events = self.state.play(seat, card, played_as).ok();
                if events.is_some() {
                    self.push_log("play", seat_no, play_body(card, played_as));
                }
                events
            }
            Phase::Ability => {
                let Some(choice) = skt_engine::choose_ability(&view, self.state.deck(), level).ok()
                else {
                    return false;
                };
                let events = self.state.ability(seat, &choice).ok();
                if events.is_some() {
                    self.push_log(
                        "ability",
                        seat_no,
                        serde_json::to_string(&choice).unwrap_or_else(|_| "{}".to_owned()),
                    );
                }
                events
            }
            _ => None,
        };
        let Some(events) = played else {
            return false;
        };
        let mut wire: Vec<GameEvent> = events.into_iter().map(GameEvent::Engine).collect();
        if timed_out {
            wire.push(GameEvent::Online(OnlineEvent::TimedOut { seat }));
            let misses = self.seats[seat.index()].misses.saturating_add(1);
            self.seats[seat.index()].misses = misses;
            if misses >= 2 && self.status[seat.index()] == SeatStatus::Online {
                mark_away.push(seat);
            }
            // Human: The second miss while the socket is down closes the seat in this same update.
            // Agent: WRITES status out and kicked_seats. Ranked lists that seat after leavers. Later turns are not timedOut.
            if misses >= 2 && self.status[seat.index()] == SeatStatus::Offline {
                self.status[seat.index()] = SeatStatus::Out;
                wire.push(GameEvent::Online(OnlineEvent::SeatStatus {
                    seat,
                    status: SeatStatus::Out,
                }));
                if !self.kicked_seats.contains(&seat) {
                    self.kicked_seats.push(seat);
                }
                if let Some(user) = self.seats[seat.index()].user.clone() {
                    self.kicks.push(user);
                }
            }
        }
        self.publish(&wire, None, live);
        true
    }

    /// Two missed deadlines become `away` on the step after the move that crossed the line.
    fn publish_away(&mut self, seats: &[Seat], live: &HashMap<UserId, super::Live>) {
        for seat in seats {
            if self.status.get(seat.index()) != Some(&SeatStatus::Online) {
                continue;
            }
            self.status[seat.index()] = SeatStatus::Away;
            let events = vec![GameEvent::Online(OnlineEvent::SeatStatus {
                seat: *seat,
                status: SeatStatus::Away,
            })];
            self.publish(&events, None, live);
        }
    }

    fn after_step(&mut self, now: Instant, live: &HashMap<UserId, super::Live>) {
        if self.state.phase() == Phase::GameOver {
            self.finish(live);
            return;
        }
        if self.state.phase() != Phase::RoundEnd {
            self.ready.fill(false);
        }
        self.arm(now);
        if self.step_at == Some(now) {
            self.step_at = None;
            let _ = self.advance(now, live);
        }
    }

    fn finish(&mut self, live: &HashMap<UserId, super::Live>) {
        if self.over {
            return;
        }
        self.over = true;
        let totals = self
            .state
            .totals()
            .unwrap_or_else(|_| vec![0; self.players()]);
        let forfeits = self.ranked_forfeits();
        let forfeited_index: Vec<usize> = forfeits.iter().map(|seat| seat.index()).collect();
        let places = if self.mode == TableMode::Ranked {
            rating::ranked_places(&totals, &forfeited_index)
        } else {
            totals
                .iter()
                .map(|total| {
                    1 + u32::try_from(totals.iter().filter(|other| *other > total).count())
                        .unwrap_or(0)
                })
                .collect::<Vec<_>>()
        };
        let scores = self.state.scores().unwrap_or_default();
        let bids_total = u32::try_from(scores.len()).unwrap_or(0);
        let mut tallies = Vec::new();
        for index in 0..self.players() {
            if self.closed(index) {
                continue;
            }
            let Some(user) = self.seats[index].user.clone() else {
                continue;
            };
            let made = u32::try_from(
                scores
                    .iter()
                    .filter(|row| row.get(index).is_some_and(|score| score.hit))
                    .count(),
            )
            .unwrap_or(0);
            let place = places.get(index).copied().unwrap_or(0);
            tallies.push(SeatTally {
                user,
                seat: u8::try_from(index).unwrap_or(0),
                total: totals.get(index).copied().unwrap_or(0),
                place,
                win: place == 1,
                bids_made: made,
                bids_total,
            });
        }
        let (rated, changes) = self.rated_changes(&places, &totals);
        let mut overs = Vec::new();
        for index in 0..self.players() {
            let Some(user) = self.seats[index].user.clone() else {
                continue;
            };
            overs.push((
                user,
                GameOver {
                    tag: GameOverTag::Value,
                    game_id: self.id.clone(),
                    seat: Some(Seat::from_index(u8::try_from(index).unwrap_or(0))),
                    result: GameResult {
                        totals: totals.clone(),
                        places: places.clone(),
                        forfeited: if self.mode == TableMode::Ranked {
                            forfeits.clone()
                        } else {
                            Vec::new()
                        },
                        rating: changes.get(index).cloned().flatten(),
                        lobby_id: (!self.matchmade).then(|| self.lobby_id.clone()),
                    },
                },
            ));
        }
        let _ = live;
        self.report = Some(GameReport {
            id: self.id.as_str().to_owned(),
            mode: mode_name(self.mode),
            seats: tallies,
            rated,
            overs,
            penalise: self.away_penalties(&forfeits),
            log: std::mem::take(&mut self.log),
        });
    }

    fn push_log(&mut self, kind: &'static str, seat: Option<u8>, body: String) {
        self.log.push(LogEntry { kind, seat, body });
    }

    fn note_round_end(&mut self) {
        self.rounds = self.rounds.saturating_add(1);
        for (index, count) in self.away_rounds.iter_mut().enumerate() {
            if self.status.get(index) == Some(&SeatStatus::Away) {
                *count = count.saturating_add(1);
            }
        }
    }

    fn closed(&self, index: usize) -> bool {
        self.closed_seat(Seat::from_index(u8::try_from(index).unwrap_or(0)))
    }

    fn closed_seat(&self, seat: Seat) -> bool {
        self.forfeited.contains(&seat) || self.kicked_seats.contains(&seat)
    }

    /// Leavers, then inactivity kicks, then a ranked seat that was away for most rounds.
    fn ranked_forfeits(&self) -> Vec<Seat> {
        let mut seats = self.forfeited.clone();
        for seat in &self.kicked_seats {
            if !seats.contains(seat) {
                seats.push(*seat);
            }
        }
        if self.mode != TableMode::Ranked {
            return seats;
        }
        for index in 0..self.players() {
            let away = self.away_rounds.get(index).copied().unwrap_or(0);
            if !rating::away_is_forfeit(away, self.rounds) {
                continue;
            }
            let seat = Seat::from_index(u8::try_from(index).unwrap_or(0));
            if !seats.contains(&seat) {
                seats.push(seat);
            }
        }
        seats
    }

    fn away_penalties(&self, forfeits: &[Seat]) -> Vec<UserId> {
        if self.mode != TableMode::Ranked {
            return Vec::new();
        }
        forfeits
            .iter()
            .filter(|seat| !self.forfeited.contains(seat) && !self.kicked_seats.contains(seat))
            .filter_map(|seat| {
                self.seats
                    .get(seat.index())
                    .and_then(|play| play.user.clone())
            })
            .collect()
    }

    fn rated_changes(
        &self,
        places: &[u32],
        totals: &[i32],
    ) -> (Vec<RatedResult>, Vec<Option<RatingChange>>) {
        let mut per_seat = vec![None; self.players()];
        if self.mode != TableMode::Ranked {
            return (Vec::new(), per_seat);
        }
        let mut skills = Vec::new();
        let mut used = Vec::new();
        for index in 0..self.players() {
            let Some(player) = self.seats[index].user.clone() else {
                continue;
            };
            skills.push(PlayerSkill {
                mu: self.seats[index].prior_mu,
                sigma: self.seats[index].prior_sigma,
                games: self.seats[index].prior_games,
            });
            used.push((index, player));
        }
        let skill_places: Vec<u32> = used
            .iter()
            .map(|(index, _)| places.get(*index).copied().unwrap_or(0))
            .collect();
        let after = rating::rate(&skills, &skill_places);
        let mut rated = Vec::new();
        for ((index, user), (before, after)) in used.into_iter().zip(skills.into_iter().zip(after))
        {
            let before_rating = rating::to_rating(before);
            let after_rating = rating::to_rating(after);
            per_seat[index] = Some(RatingChange {
                delta: after_rating.value - before_rating.value,
                before: before_rating,
                after: after_rating,
            });
            rated.push(RatedResult {
                user,
                seat: u8::try_from(index).unwrap_or(0),
                total: totals.get(index).copied().unwrap_or(0),
                place: places.get(index).copied().unwrap_or(0),
                after,
            });
        }
        (rated, per_seat)
    }

    fn publish(
        &mut self,
        events: &[GameEvent],
        actor: Option<&UserId>,
        live: &HashMap<UserId, super::Live>,
    ) {
        if !events.is_empty() || actor.is_some() {
            self.rev = self.rev.saturating_add(1);
        }
        // Human: Each socket gets only that seat's view. Other hands stay inside GameState.
        // Agent: READS GameState::view; WRITES one GameUpdate per seated socket; never serialises GameState.
        for index in 0..self.players() {
            let Some(user) = self.seats[index].user.clone() else {
                continue;
            };
            let seat = Seat::from_index(u8::try_from(index).unwrap_or(0));
            if self.closed_seat(seat) && actor != Some(&user) {
                continue;
            }
            if actor == Some(&user) || !self.closed_seat(seat) {
                self.send_update(&user, index, events.to_vec(), live);
            }
        }
    }

    fn send_start(&self, user: &UserId, index: usize, live: &HashMap<UserId, super::Live>) {
        if let Some(socket) = live.get(user) {
            send(&socket.out, &self.start_for(index));
        }
    }

    fn send_update(
        &self,
        user: &UserId,
        index: usize,
        events: Vec<GameEvent>,
        live: &HashMap<UserId, super::Live>,
    ) {
        if let Some(socket) = live.get(user) {
            send(&socket.out, &self.update_for(index, events));
        }
    }

    fn start_for(&self, index: usize) -> GameStart {
        GameStart {
            tag: GameStartTag::Value,
            game_id: self.id.clone(),
            mode: self.mode,
            lobby_id: (!self.matchmade).then(|| self.lobby_id.clone()),
            settings: self.settings,
            deck: self.state.deck().to_vec(),
            schedule: self.state.schedule().to_vec(),
            seats: self.infos(),
            me: Seat::from_index(u8::try_from(index).unwrap_or(0)),
        }
    }

    fn update_for(&self, index: usize, events: Vec<GameEvent>) -> GameUpdate {
        let seat = Seat::from_index(u8::try_from(index).unwrap_or(0));
        let view = self.state.view(seat).unwrap_or_else(|_| empty_view(seat));
        GameUpdate {
            tag: GameUpdateTag::Value,
            game_id: self.id.clone(),
            rev: self.rev,
            events,
            view,
            table: TableInfo {
                status: self.status.clone(),
                deadline: self.shown.clone(),
                ready: self.ready.clone(),
            },
        }
    }

    fn infos(&self) -> Vec<SeatInfo> {
        self.seats
            .iter()
            .map(|seat| SeatInfo {
                name: seat.name.clone(),
                color: seat.color,
                bot: seat.started_bot,
                user_id: seat.user.clone(),
                tier: seat.tier.clone(),
            })
            .collect()
    }
}

fn deal_entry(round: u32, cards: &[u8]) -> LogEntry {
    LogEntry {
        kind: "deal",
        seat: None,
        body: deal_body(round, cards),
    }
}

fn deal_body(round: u32, cards: &[u8]) -> String {
    serde_json::json!({ "round": round, "cards": cards }).to_string()
}

fn play_body(card: skt_engine::CardId, played_as: Option<skt_engine::PlayedAs>) -> String {
    serde_json::json!({ "card": card.index(), "as": played_as }).to_string()
}

fn kind_of(kind: &str) -> Option<&'static str> {
    Some(match kind {
        "deal" => "deal",
        "bid" => "bid",
        "play" => "play",
        "ability" => "ability",
        "advance" => "advance",
        _ => return None,
    })
}

fn mode_of(mode: &str) -> TableMode {
    match mode {
        "casual" => TableMode::Casual,
        "ranked" => TableMode::Ranked,
        _ => TableMode::Custom,
    }
}

fn mode_name(mode: TableMode) -> &'static str {
    match mode {
        TableMode::Custom => "custom",
        TableMode::Casual => "casual",
        TableMode::Ranked => "ranked",
    }
}

fn fresh(running: &Running, at: skt_protocol::ActionAt) -> bool {
    let Ok(view) = running.state.view(Seat::from_index(0)) else {
        return false;
    };
    u32::from(view.round) == at.round && finished_tricks(&view) == at.trick
}

fn finished_tricks(view: &EngineView) -> u32 {
    let won = view
        .won
        .iter()
        .fold(0u32, |sum, tricks| sum.saturating_add(u32::from(*tricks)));
    let destroyed = view
        .log
        .get(usize::from(view.round))
        .map_or(0, |record| u32::from(record.destroyed));
    won.saturating_add(destroyed)
}

// Human: The opening deal and its log lines. `None` when the deck cannot be built.
// Agent: CALLS GameState::create. RETURNS the state and one log line per round.
fn opening_deal(
    settings: &skt_protocol::GameSettings,
    players: usize,
) -> Option<(GameState, Vec<LogEntry>)> {
    let rules = Ruleset::new(
        settings.scoring,
        settings.format,
        Expansions {
            loot: settings.expansions.loot,
            kraken: settings.expansions.kraken,
            whale: settings.expansions.whale,
        },
        settings.abilities,
    );
    let deck = skt_engine::build_deck(rules.expansions).ok()?;
    let mut deals = Recall::new(deck.len());
    let state = GameState::create(
        rules,
        u8::try_from(players).unwrap_or(0),
        Seat::from_index(0),
        &mut deals,
    )
    .ok()?;
    let log = deals
        .orders
        .into_iter()
        .map(|(round, cards)| deal_entry(round, &cards))
        .collect();
    Some((state, log))
}

fn seats_from(
    lobby: &Lobby,
    live: &HashMap<UserId, super::Live>,
) -> (Vec<SeatPlay>, Vec<SeatInfo>, Vec<SeatStatus>) {
    let mut seats = Vec::new();
    let mut infos = Vec::new();
    let mut status = Vec::new();
    for member in &lobby.members {
        match member {
            Member::Human { user, .. } => {
                seats.push(SeatPlay {
                    user: Some(user.id.clone()),
                    name: user.name.clone(),
                    color: user.color,
                    started_bot: false,
                    misses: 0,
                    last_emote: None,
                    prior_mu: 25.0,
                    prior_sigma: 25.0 / 3.0,
                    prior_games: 0,
                    tier: None,
                });
                infos.push(SeatInfo {
                    name: user.name.clone(),
                    color: user.color,
                    bot: false,
                    user_id: Some(user.id.clone()),
                    tier: None,
                });
                status.push(if live.contains_key(&user.id) {
                    SeatStatus::Online
                } else {
                    SeatStatus::Offline
                });
            }
            Member::Bot { name, color, .. } => {
                seats.push(SeatPlay {
                    user: None,
                    name: name.clone(),
                    color: *color,
                    started_bot: true,
                    misses: 0,
                    last_emote: None,
                    prior_mu: 25.0,
                    prior_sigma: 25.0 / 3.0,
                    prior_games: 0,
                    tier: None,
                });
                infos.push(SeatInfo {
                    name: name.clone(),
                    color: *color,
                    bot: true,
                    user_id: None,
                    tier: None,
                });
                status.push(SeatStatus::Bot);
            }
        }
    }
    (seats, infos, status)
}

fn unique_colors(mut infos: Vec<SeatInfo>) -> Vec<SeatInfo> {
    const COLORS: [skt_protocol::TableColor; 8] = [
        skt_protocol::TableColor::Sky,
        skt_protocol::TableColor::Orange,
        skt_protocol::TableColor::Purple,
        skt_protocol::TableColor::Red,
        skt_protocol::TableColor::Green,
        skt_protocol::TableColor::Gold,
        skt_protocol::TableColor::Navy,
        skt_protocol::TableColor::Pink,
    ];
    let mut used = Vec::new();
    for info in &mut infos {
        if used.contains(&info.color)
            && let Some(color) = COLORS.into_iter().find(|color| !used.contains(color))
        {
            info.color = color;
        }
        used.push(info.color);
    }
    infos
}

fn empty_view(seat: Seat) -> EngineView {
    self::fallback_view(seat)
}

fn fallback_view(me: Seat) -> EngineView {
    use skt_engine::Phase;
    EngineView {
        me,
        phase: Phase::GameOver,
        round: 0,
        rounds: 0,
        cards: 0,
        dealer: me,
        turn: None,
        hand: Vec::new(),
        hand_counts: Vec::new(),
        played: Vec::new(),
        bids: Vec::new(),
        won: Vec::new(),
        trick: skt_engine::Trick {
            leader: me,
            plays: Vec::new(),
        },
        last_trick: None,
        log: Vec::new(),
        pending: None,
        legal: Vec::new(),
    }
}

fn scaled(pace: skt_protocol::Pace) -> impl Fn(u32) -> u32 {
    move |ms| match pace {
        skt_protocol::Pace::Relaxed => ms.saturating_mul(2),
        skt_protocol::Pace::Fast => ms >> 1,
        skt_protocol::Pace::Standard => ms,
    }
}

fn code_of(rejection: skt_engine::Rejection) -> ErrorCode {
    match rejection {
        skt_engine::Rejection::NotYourTurn => ErrorCode::NotYourTurn,
        skt_engine::Rejection::IllegalMove => ErrorCode::IllegalMove,
        skt_engine::Rejection::BidOutOfRange => ErrorCode::BidOutOfRange,
    }
}

fn ok(live: &HashMap<UserId, super::Live>, user: &UserId, id: MessageId) {
    if let Some(socket) = live.get(user) {
        send(
            &socket.out,
            &OkReply {
                tag: OkTag::Value,
                re: id,
                lobby: None,
                queue: None,
                server_time: None,
            },
        );
    }
}

fn fail(live: &HashMap<UserId, super::Live>, user: &UserId, id: MessageId, code: ErrorCode) {
    if let Some(socket) = live.get(user) {
        send(
            &socket.out,
            &ErrMessage {
                tag: ErrTag::Value,
                re: id,
                code,
                message: code.message().to_owned(),
            },
        );
    }
}

fn reopen_lobby(
    lobby_id: &LobbyId,
    lobbies: &mut HashMap<LobbyId, Lobby>,
    live: &HashMap<UserId, super::Live>,
) {
    let Some(lobby) = lobbies.get_mut(lobby_id) else {
        return;
    };
    lobby.state = skt_protocol::LobbyPhase::Open;
    lobby.game_id = None;
    for member in &mut lobby.members {
        if let Member::Human { ready, .. } = member {
            *ready = false;
        }
    }
    let snapshot = lobby.clone();
    let frame = skt_protocol::LobbyStatePush {
        tag: skt_protocol::LobbyStateTag::Value,
        lobby: snapshot,
    };
    for member in &frame.lobby.members {
        if let Member::Human { user, .. } = member
            && let Some(socket) = live.get(&user.id)
        {
            send(&socket.out, &frame);
        }
    }
}

use rand::Rng;
