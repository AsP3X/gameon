//! One running game. The engine is the authority. This module only deals, times, and hides.

use std::collections::HashMap;
use std::time::{Duration, Instant};

use skt_engine::{BotLevel, Expansions, GameState, Phase, Ruleset, Seat};
use skt_protocol::{
    ClientMessage, Deadline, DeadlineKind, EngineView, ErrMessage, ErrTag, ErrorCode, GameEvent,
    GameId, GameOver, GameOverTag, GameResult, GameStart, GameStartTag, GameUpdate, GameUpdateTag,
    Lobby, LobbyId, Member, MessageId, OkReply, OkTag, OnlineEvent, SeatInfo, SeatStatus,
    TableInfo, TableMode, UserId, WelcomeGame,
};

use super::identity;
use super::send;
use crate::random::{DeckShuffle, OsRandom};

struct SeatPlay {
    user: Option<UserId>,
    name: String,
    color: skt_protocol::TableColor,
    started_bot: bool,
    misses: u8,
    offline_since: Option<Instant>,
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

/// A finished game, written in one database transaction.
pub struct GameReport {
    /// Game id.
    pub id: String,
    /// `custom` or `casual`.
    pub mode: &'static str,
    /// Humans who were still seated. A `game.leave` is absent.
    pub seats: Vec<SeatTally>,
}

struct Running {
    id: GameId,
    lobby_id: LobbyId,
    /// Quick play has no lobby to reopen.
    matchmade: bool,
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
}

/// Every game in the process.
pub struct Tables {
    games: HashMap<GameId, Running>,
    seat_of: HashMap<UserId, (GameId, Seat)>,
}

impl Tables {
    pub fn new() -> Self {
        Self {
            games: HashMap::new(),
            seat_of: HashMap::new(),
        }
    }

    pub fn open(
        &mut self,
        id: &GameId,
        lobby: &Lobby,
        now: Instant,
        live: &HashMap<UserId, super::Live>,
        matchmade: bool,
    ) -> Vec<(UserId, GameId)> {
        let (mut seats, infos, status) = seats_from(lobby, live);
        let infos = unique_colors(infos);
        for (seat, info) in seats.iter_mut().zip(&infos) {
            seat.color = info.color;
        }
        let rules = Ruleset::new(
            lobby.settings.scoring,
            lobby.settings.format,
            Expansions {
                loot: lobby.settings.expansions.loot,
                kraken: lobby.settings.expansions.kraken,
                whale: lobby.settings.expansions.whale,
            },
            lobby.settings.abilities,
        );
        let Ok(deck) = skt_engine::build_deck(rules.expansions) else {
            return Vec::new();
        };
        let mut deals = DeckShuffle::new(deck.len());
        let Ok(state) = GameState::create(
            rules,
            u8::try_from(seats.len()).unwrap_or(0),
            Seat::from_index(0),
            &mut deals,
        ) else {
            return Vec::new();
        };
        let mut running = Running {
            id: id.clone(),
            lobby_id: lobby.id.clone(),
            matchmade,
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

    pub fn welcome_game(&self, user: &UserId) -> Option<WelcomeGame> {
        let (id, seat) = self.seat_of.get(user)?;
        let running = self.games.get(id)?;
        if running.over {
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
        if running.over {
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
        running.status[index] = next;
        running.seats[index].offline_since = if up { None } else { Some(now) };
        let events = vec![GameEvent::Online(OnlineEvent::SeatStatus {
            seat,
            status: next,
        })];
        running.publish(&events, None, live);
        running.arm(now);
    }

    pub fn act(
        &mut self,
        user: &UserId,
        message: ClientMessage,
        now: Instant,
        live: &HashMap<UserId, super::Live>,
        lobbies: &mut HashMap<LobbyId, Lobby>,
    ) -> Vec<UserId> {
        let Some((id, seat)) = self.seat_of.get(user).cloned() else {
            if let ClientMessage::GameBid { id, .. }
            | ClientMessage::GamePlay { id, .. }
            | ClientMessage::GameAbility { id, .. }
            | ClientMessage::GameReady { id }
            | ClientMessage::GameLeave { id } = message
            {
                fail(live, user, id, ErrorCode::NotInGame);
            }
            return Vec::new();
        };
        let Some(running) = self.games.get_mut(&id) else {
            return Vec::new();
        };
        if running.over {
            return Vec::new();
        }
        match message {
            ClientMessage::GameLeave { id: msg } => {
                ok(live, user, msg);
                running.status[seat.index()] = SeatStatus::Bot;
                running.seats[seat.index()].offline_since = None;
                let events = vec![GameEvent::Online(OnlineEvent::SeatStatus {
                    seat,
                    status: SeatStatus::Bot,
                })];
                running.publish(&events, Some(user), live);
                running.forfeited.push(seat);
                running.arm(now);
                let _ = lobbies;
                self.seat_of.remove(user);
                vec![user.clone()]
            }
            ClientMessage::GameReady { id: msg } => {
                if running.state.phase() != Phase::RoundEnd {
                    fail(live, user, msg, ErrorCode::NotYourTurn);
                    return Vec::new();
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
                Vec::new()
            }
            ClientMessage::GameBid { id: msg, at, bid } => self.player_step(
                &id,
                &Hit {
                    user,
                    seat,
                    msg,
                    at,
                    now,
                    live,
                },
                |state| state.bid(seat, i64::from(bid)),
            ),
            ClientMessage::GamePlay {
                id: msg,
                at,
                card,
                played_as,
            } => self.player_step(
                &id,
                &Hit {
                    user,
                    seat,
                    msg,
                    at,
                    now,
                    live,
                },
                |state| state.play(seat, card, played_as),
            ),
            ClientMessage::GameAbility {
                id: msg,
                at,
                choice,
            } => self.player_step(
                &id,
                &Hit {
                    user,
                    seat,
                    msg,
                    at,
                    now,
                    live,
                },
                |state| state.ability(seat, &choice),
            ),
            _ => Vec::new(),
        }
    }

    pub fn tick(
        &mut self,
        now: Instant,
        live: &HashMap<UserId, super::Live>,
        lobbies: &mut HashMap<LobbyId, Lobby>,
    ) -> (Vec<UserId>, Vec<GameReport>) {
        let ids: Vec<GameId> = self.games.keys().cloned().collect();
        let mut finished = Vec::new();
        let mut reports = Vec::new();
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
                    running.expire_grace(now, live);
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
        (finished, reports)
    }

    fn player_step(
        &mut self,
        id: &GameId,
        hit: &Hit<'_>,
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
            if self.seats[index].started_bot
                || self.status[index] == SeatStatus::Bot
                || self.status[index] == SeatStatus::Offline
                || self.status[index] == SeatStatus::Away
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
                Some(SeatStatus::Bot | SeatStatus::Away)
            )
    }

    /// Bots take 0.8–1.5s. An away human is played after 1.5s.
    fn auto_delay_ms(&self) -> u64 {
        let away = self.next_auto().is_some_and(|seat| {
            self.status.get(seat.index()) == Some(&SeatStatus::Away)
                && !self
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
                || self.ready[index]
        })
    }

    fn expire_grace(&mut self, now: Instant, live: &HashMap<UserId, super::Live>) {
        let grace = Duration::from_millis(u64::from(
            skt_protocol::Timers::standard().disconnect_grace_ms,
        ));
        let expired: Vec<usize> = self
            .seats
            .iter()
            .enumerate()
            .filter_map(|(index, seat)| {
                seat.offline_since
                    .filter(|since| now.saturating_duration_since(*since) >= grace)
                    .map(|_| index)
            })
            .collect();
        for index in expired {
            self.seats[index].offline_since = None;
            self.status[index] = SeatStatus::Bot;
            let seat = Seat::from_index(u8::try_from(index).unwrap_or(0));
            let events = vec![GameEvent::Online(OnlineEvent::SeatStatus {
                seat,
                status: SeatStatus::Bot,
            })];
            self.publish(&events, None, live);
        }
        self.schedule_bot_if_idle(now);
    }

    fn advance(&mut self, now: Instant, live: &HashMap<UserId, super::Live>) -> bool {
        let mut deals = DeckShuffle::new(self.state.deck().len());
        let Ok(events) = self.state.advance(&mut deals) else {
            return false;
        };
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
            if self.status.get(seat.index()) != Some(&SeatStatus::Online) || !self.waiting(seat) {
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
        let mut rng = OsRandom;
        let played = match view.phase {
            Phase::Bidding => skt_engine::choose_bid(&view, self.state.deck(), level, &mut rng)
                .ok()
                .and_then(|bid| self.state.bid(seat, i64::from(bid)).ok()),
            Phase::Playing => skt_engine::choose_play(&view, self.state.deck(), level, &mut rng)
                .ok()
                .and_then(|(card, played_as)| self.state.play(seat, card, played_as).ok()),
            Phase::Ability => skt_engine::choose_ability(&view, self.state.deck(), level)
                .ok()
                .and_then(|choice| self.state.ability(seat, &choice).ok()),
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
        let places = totals
            .iter()
            .map(|total| {
                1 + u32::try_from(totals.iter().filter(|other| *other > total).count()).unwrap_or(0)
            })
            .collect::<Vec<_>>();
        let scores = self.state.scores().unwrap_or_default();
        let bids_total = u32::try_from(scores.len()).unwrap_or(0);
        let mut tallies = Vec::new();
        for index in 0..self.players() {
            if self.forfeited.iter().any(|left| left.index() == index) {
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
        self.report = Some(GameReport {
            id: self.id.as_str().to_owned(),
            mode: if self.matchmade { "casual" } else { "custom" },
            seats: tallies,
        });
        for index in 0..self.players() {
            let Some(user) = self.seats[index].user.clone() else {
                continue;
            };
            let over = GameOver {
                tag: GameOverTag::Value,
                game_id: self.id.clone(),
                seat: Some(Seat::from_index(u8::try_from(index).unwrap_or(0))),
                result: GameResult {
                    totals: totals.clone(),
                    places: places.clone(),
                    forfeited: self.forfeited.clone(),
                    rating: None,
                    lobby_id: (!self.matchmade).then(|| self.lobby_id.clone()),
                },
            };
            if live.contains_key(&user) {
                if let Some(socket) = live.get(&user) {
                    send(&socket.out, &over);
                }
            } else {
                self.owed.insert(user, over);
            }
        }
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
            if self
                .forfeited
                .contains(&Seat::from_index(u8::try_from(index).unwrap_or(0)))
                && actor != Some(&user)
            {
                continue;
            }
            if actor == Some(&user)
                || !self
                    .forfeited
                    .contains(&Seat::from_index(u8::try_from(index).unwrap_or(0)))
            {
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
            mode: if self.matchmade {
                TableMode::Casual
            } else {
                TableMode::Custom
            },
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
                tier: None,
            })
            .collect()
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
                    offline_since: None,
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
                    offline_since: None,
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
