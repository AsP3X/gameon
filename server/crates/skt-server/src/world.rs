//! In-memory sessions, lobbies, the casual and ranked queues, and one table task's worth of state.
//!
//! A single mutex owns every table. Callers copy outbound frames out of the lock and send them
//! afterwards, so the lock is never held across an `.await`. Each accepted game step queues `ok`
//! and then that step's `game.update` before anything else can write.

pub(crate) mod identity;
mod table;

pub(crate) use table::GameReport;
#[cfg(test)]
pub(crate) use table::RatedResult;
#[cfg(test)]
pub(crate) use table::SeatTally;

use std::collections::{HashMap, VecDeque};
use std::time::{Duration, Instant};

use skt_protocol::{
    Active, ClientMessage, ErrMessage, ErrTag, ErrorCode, GameId, Lobby, LobbyClosed,
    LobbyClosedTag, LobbyId, LobbyList, LobbyPhase, LobbyStatePush, LobbyStateTag, LobbySummary,
    Me, Member, MessageId, OkReply, OkTag, QueueMode, QueueStatus, QueueStatusPush, QueueStatusTag,
    ServerConfig, TableColor, TableMode, UserId, Visibility,
};
use tokio::sync::mpsc::UnboundedSender;

use identity::{AccountSnap, Identity};

use crate::rating::{self, Waiter};

use table::{OpenPrior, Tables};

/// One outbound frame, or an instruction to close the socket.
pub enum Wire {
    /// A JSON text frame.
    Text(String),
    /// A close code. 1008 ends a session that was logged out or replaced.
    Close(u16),
}

/// Frames waiting on one socket.
pub type Outbox = UnboundedSender<Wire>;

/// The process-wide room.
pub struct World {
    identity: Identity,
    tables: Tables,
    lobbies: HashMap<LobbyId, Lobby>,
    codes: HashMap<String, LobbyId>,
    /// Public-list order. Oldest first.
    opened: Vec<LobbyId>,
    /// Quick play. May fill with bots.
    casual: Line,
    /// Accounts only. Never fills with bots.
    ranked: Line,
    fill: Duration,
    /// Leave penalties waiting to be written. The socket task stores them after the lock.
    penalties: Vec<PenaltyWrite>,
    /// Current socket for a user, if `hello` has been accepted.
    live: HashMap<UserId, Live>,
    /// Upgrades waiting for `hello`, keyed by connection id. They are not the player's socket yet.
    pending: HashMap<u64, Pending>,
    now: Instant,
}

/// A ranked leave, persisted outside the world lock.
pub struct PenaltyWrite {
    /// The player.
    pub user: UserId,
    /// Season the leave counts in.
    pub season: u32,
    /// Leaves this season, including this one.
    pub leaves: u32,
    /// Unix milliseconds when ranked opens again.
    pub until: i64,
}

struct Waiting {
    user: UserId,
    since: skt_protocol::UnixMs,
    joined: Instant,
    /// Match ordinal. Casual does not read it.
    rating: i32,
}

/// One matchmaking line. Casual and ranked do not share waiters.
struct Line {
    waiting: VecDeque<Waiting>,
    /// When this line last became non-empty. Casual uses it for the bot fill.
    since: Option<Instant>,
}

impl Line {
    fn new() -> Self {
        Self {
            waiting: VecDeque::new(),
            since: None,
        }
    }

    fn push(&mut self, user: UserId, now: Instant, rating: i32) {
        if self.waiting.is_empty() {
            self.since = Some(now);
        }
        self.waiting.push_back(Waiting {
            user,
            since: identity::unix_now(),
            joined: now,
            rating,
        });
    }

    fn remove(&mut self, user: &UserId) -> bool {
        let before = self.waiting.len();
        self.waiting.retain(|waiting| &waiting.user != user);
        if self.waiting.is_empty() {
            self.since = None;
        }
        self.waiting.len() != before
    }

    fn contains(&self, user: &UserId) -> bool {
        self.waiting.iter().any(|waiting| &waiting.user == user)
    }

    fn take_ids(&mut self, ids: &[UserId], now: Instant) -> Vec<Waiting> {
        let mut taken = Vec::new();
        let mut rest = VecDeque::new();
        while let Some(waiting) = self.waiting.pop_front() {
            if ids.iter().any(|id| id == &waiting.user) {
                taken.push(waiting);
            } else {
                rest.push_back(waiting);
            }
        }
        self.waiting = rest;
        if self.waiting.is_empty() {
            self.since = None;
        } else if !taken.is_empty() {
            self.since = Some(now);
        }
        taken
    }

    fn status(&self, user: &UserId, mode: QueueMode) -> Option<QueueStatus> {
        let waiting = self.waiting.iter().find(|waiting| &waiting.user == user)?;
        Some(QueueStatus {
            mode,
            since: waiting.since,
            found: u32::try_from(self.waiting.len()).unwrap_or(0),
            needed: 4,
        })
    }
}

struct Live {
    id: u64,
    out: Outbox,
}

/// A socket that has upgraded and has not had its `hello` accepted yet.
struct Pending {
    out: Outbox,
}

impl World {
    /// An empty tavern.
    #[must_use]
    pub fn new() -> Self {
        Self::with_fill(Duration::from_secs(6))
    }

    /// `fill` is how long a casual queue waits before bots take the empty seats.
    #[must_use]
    pub fn with_fill(fill: Duration) -> Self {
        Self {
            identity: Identity::new(),
            tables: Tables::new(),
            lobbies: HashMap::new(),
            codes: HashMap::new(),
            opened: Vec::new(),
            casual: Line::new(),
            ranked: Line::new(),
            fill,
            penalties: Vec::new(),
            live: HashMap::new(),
            pending: HashMap::new(),
            now: Instant::now(),
        }
    }

    /// Remember an account loaded from Postgres.
    pub fn import(&mut self, token: &str, snap: AccountSnap) {
        self.identity.import(token, snap);
    }

    /// Forget a session hash. The account and any seat stay until [`Self::drop_presence`].
    pub fn revoke(&mut self, token: &str) {
        self.identity.revoke(token);
    }

    /// Whether the cached account has no password.
    #[must_use]
    pub fn is_guest(&self, id: &UserId) -> bool {
        self.identity.guest_of(id)
    }

    /// Public server description.
    #[must_use]
    pub fn config() -> ServerConfig {
        ServerConfig {
            protocol: skt_protocol::PROTOCOL,
            build: "dev".to_owned(),
            timers: skt_protocol::Timers::standard(),
            standard: skt_protocol::GameSettings::standard(),
            season: Some(rating::season_at(identity::unix_now().get())),
            emotes: skt_protocol::emote_ids(),
        }
    }

    /// Create a guest, or return the one that already holds `token`.
    pub fn guest(&mut self, token: Option<&str>) -> (String, Me) {
        if let Some(token) = token
            && let Some(me) = self.me_for_token(token)
        {
            return (token.to_owned(), me);
        }
        let (token, user) = self.identity.create_guest();
        (token, self.me_of(&user))
    }

    /// The player behind a session cookie.
    pub fn me(&self, token: &str) -> Result<Me, ErrorCode> {
        self.me_for_token(token).ok_or(ErrorCode::Unauthenticated)
    }

    /// Remember an upgraded socket until its `hello` is accepted.
    ///
    // Human: Opening a socket and dropping it must not kick the player who is already at the table.
    // Agent: WRITES pending; does not replace `live` and does not send superseded.
    pub fn bind(&mut self, token: &str, out: Outbox) -> Result<(UserId, u64), ErrorCode> {
        let user = self
            .identity
            .user_for_token(token)
            .ok_or(ErrorCode::Unauthenticated)?;
        let id = self.identity.next_conn();
        self.pending.insert(id, Pending { out });
        Ok((user, id))
    }

    /// The socket closed. A seated player becomes `offline` when this was their live socket.
    pub fn disconnect(&mut self, user: &UserId, id: u64) {
        if self.pending.remove(&id).is_some() {
            return;
        }
        let current = self.live.get(user).is_some_and(|live| live.id == id);
        if !current {
            return;
        }
        self.live.remove(user);
        self.mark_connected(user, false);
        self.tables.on_socket(user, false, self.now, &self.live);
    }

    /// One client frame from connection `conn`.
    pub fn on_message(&mut self, user: &UserId, conn: u64, text: &str) {
        if self.pending.contains_key(&conn) {
            self.hello(user, conn, text);
            return;
        }
        if self.live.get(user).is_none_or(|live| live.id != conn) {
            return;
        }
        if let Some(id) = message_id(text)
            && queue_mode_rejected(text)
        {
            self.fail_live(user, id, ErrorCode::Validation);
            return;
        }
        let message: ClientMessage = match serde_json::from_str(text) {
            Ok(message) => message,
            Err(_) => return,
        };
        self.dispatch(user, message);
    }

    /// Deadlines, bot moves, the casual fill, and the ranked window.
    pub fn tick(&mut self) -> Vec<GameReport> {
        self.now = Instant::now();
        self.step()
    }

    /// Move the clock without reading the wall time. Tests use this to finish a table.
    #[cfg(test)]
    pub fn advance(&mut self, by: Duration) -> Vec<GameReport> {
        self.now += by;
        self.step()
    }

    /// Penalties queued by the last messages. The caller stores them and drops them here.
    pub fn take_penalties(&mut self) -> Vec<PenaltyWrite> {
        std::mem::take(&mut self.penalties)
    }

    /// Apply ranked skills and send the `game.over` frames stored on the report.
    pub fn deliver(&mut self, report: &GameReport) {
        let season = rating::season_at(identity::unix_now().get()).id;
        for rated in &report.rated {
            self.identity.set_rated(&rated.user, rated.after, season);
        }
        for user in &report.penalise {
            self.penalise(user);
        }
        self.tables.deliver(report, &self.live);
    }

    fn step(&mut self) -> Vec<GameReport> {
        self.fill_queue();
        self.form_ranked();
        let (finished, reports) = self.tables.tick(self.now, &self.live, &mut self.lobbies);
        for user in finished {
            self.identity.set_game(&user, None);
        }
        reports
    }

    /// Add the stored counters to the in-memory account.
    ///
    /// A ranked game is stored and does not change these counters. Its rating is a later write.
    pub fn apply_report(&mut self, report: &GameReport) {
        if report.mode == "ranked" {
            return;
        }
        for seat in &report.seats {
            self.identity.add_result(
                &seat.user,
                seat.win,
                seat.bids_made,
                seat.bids_total,
                seat.total,
            );
        }
    }

    fn hello(&mut self, user: &UserId, conn: u64, text: &str) {
        let Some(pending) = self.pending.get(&conn) else {
            return;
        };
        let out = pending.out.clone();
        let Ok(ClientMessage::Hello { id, protocol, .. }) = serde_json::from_str(text) else {
            fail_out(&out, MessageId::new(0), ErrorCode::Validation);
            return;
        };
        if protocol != skt_protocol::PROTOCOL {
            fail_out(&out, id, ErrorCode::ProtocolUnsupported);
            return;
        }
        self.pending.remove(&conn);
        // Human: The new page is the player only once it has said hello. The previous page is told to stop.
        // Agent: REPLACES live; WRITES superseded and close 4001 on the previous outbox; then welcome on the new one.
        if let Some(previous) = self.live.insert(user.clone(), Live { id: conn, out }) {
            send(
                &previous.out,
                &skt_protocol::Superseded {
                    tag: skt_protocol::SupersededTag::Value,
                },
            );
            let _ = previous.out.send(Wire::Close(4001));
        }
        self.ok(user, id, None, true);
        self.push_welcome(user);
        self.tables.flush_owed(user, &self.live);
        self.mark_connected(user, true);
        self.tables.on_socket(user, true, self.now, &self.live);
    }

    fn dispatch(&mut self, user: &UserId, message: ClientMessage) {
        match message {
            ClientMessage::Hello { id, .. } | ClientMessage::Ping { id } => {
                if matches!(message, ClientMessage::Ping { .. }) {
                    self.ok(user, id, None, true);
                } else {
                    self.fail_live(user, id, ErrorCode::Validation);
                }
            }
            ClientMessage::LobbyCreate {
                id,
                visibility,
                settings,
            } => {
                self.create_lobby(user, id, visibility, settings);
            }
            ClientMessage::LobbyJoin { id, code, lobby_id } => {
                self.join_lobby(user, id, code, lobby_id);
            }
            ClientMessage::LobbyLeave { id } => self.leave_lobby(user, id),
            ClientMessage::LobbyReady { id, ready } => self.ready_lobby(user, id, ready),
            ClientMessage::LobbySettings { id, settings } => self.set_settings(user, id, settings),
            ClientMessage::LobbyAddBot { id } => self.add_bot(user, id),
            ClientMessage::LobbyRemoveBot { id, index } => self.remove_bot(user, id, index),
            ClientMessage::LobbyKick { id, user_id } => self.kick(user, id, &user_id),
            ClientMessage::LobbyStart { id } => self.start(user, id),
            ClientMessage::QueueJoin { id, mode } => self.join_queue(user, id, mode),
            ClientMessage::QueueLeave { id } => self.leave_queue(user, id),
            ClientMessage::GameEmote { id, emote } => {
                self.tables.emote(user, id, &emote, self.now, &self.live);
            }
            other => {
                let (left, ranked_leave) =
                    self.tables
                        .act(user, other, self.now, &self.live, &mut self.lobbies);
                for seated in left {
                    self.identity.set_game(&seated, None);
                    if ranked_leave {
                        self.penalise(&seated);
                    }
                    if let Some(lobby_id) = self.identity.lobby_of(&seated) {
                        self.remove_member(&lobby_id, &seated);
                    }
                }
            }
        }
    }

    fn create_lobby(
        &mut self,
        user: &UserId,
        id: MessageId,
        visibility: Visibility,
        settings: skt_protocol::GameSettings,
    ) {
        if self.busy(user) {
            self.fail_live(user, id, ErrorCode::AlreadySeated);
            return;
        }
        if !(2..=8).contains(&settings.max_players) {
            self.fail_live(user, id, ErrorCode::Validation);
            return;
        }
        let lobby_id = LobbyId::new(identity::uuid());
        let code = self.fresh_code();
        let lobby = Lobby {
            id: lobby_id.clone(),
            code: code.clone(),
            mode: TableMode::Custom,
            visibility,
            host_id: Some(user.clone()),
            settings,
            members: vec![self.human_member(user, false)],
            state: LobbyPhase::Open,
            game_id: None,
        };
        self.codes.insert(code, lobby_id.clone());
        self.lobbies.insert(lobby_id.clone(), lobby.clone());
        self.opened.push(lobby_id.clone());
        self.identity.set_lobby(user, Some(lobby_id));
        self.ok(user, id, Some(lobby), false);
    }

    fn join_lobby(
        &mut self,
        user: &UserId,
        id: MessageId,
        code: Option<String>,
        lobby_id: Option<LobbyId>,
    ) {
        if self.busy(user) {
            self.fail_live(user, id, ErrorCode::AlreadySeated);
            return;
        }
        let found = if let Some(code) = code {
            self.codes.get(&code.to_uppercase()).cloned()
        } else {
            lobby_id
        };
        let Some(lobby_id) = found else {
            self.fail_live(user, id, ErrorCode::LobbyNotFound);
            return;
        };
        let Some(lobby) = self.lobbies.get(&lobby_id) else {
            self.fail_live(user, id, ErrorCode::LobbyNotFound);
            return;
        };
        if lobby.state != LobbyPhase::Open {
            self.fail_live(user, id, ErrorCode::LobbyStarted);
            return;
        }
        if lobby.members.len() >= usize::from(lobby.settings.max_players) {
            self.fail_live(user, id, ErrorCode::LobbyFull);
            return;
        }
        let member = self.human_member(user, false);
        let lobby = self.lobbies.get_mut(&lobby_id);
        let Some(lobby) = lobby else {
            return;
        };
        lobby.members.push(member);
        self.identity.set_lobby(user, Some(lobby_id.clone()));
        let snapshot = lobby.clone();
        self.ok(user, id, Some(snapshot.clone()), false);
        self.push_lobby(&snapshot);
    }

    fn leave_lobby(&mut self, user: &UserId, id: MessageId) {
        let Some(lobby_id) = self.identity.lobby_of(user) else {
            self.fail_live(user, id, ErrorCode::NotInLobby);
            return;
        };
        let Some(lobby) = self.lobbies.get(&lobby_id) else {
            self.fail_live(user, id, ErrorCode::NotInLobby);
            return;
        };
        if lobby.state != LobbyPhase::Open {
            self.fail_live(user, id, ErrorCode::LobbyStarted);
            return;
        }
        self.remove_member(&lobby_id, user);
        self.ok(user, id, None, false);
    }

    fn ready_lobby(&mut self, user: &UserId, id: MessageId, ready: bool) {
        if self.mutate_open(user, id, |lobby| {
            for member in &mut lobby.members {
                if let Member::Human {
                    user: seated,
                    ready: flag,
                    ..
                } = member
                    && &seated.id == user
                {
                    *flag = ready;
                }
            }
        }) {
            self.ok(user, id, None, false);
        }
    }

    fn set_settings(&mut self, user: &UserId, id: MessageId, settings: skt_protocol::GameSettings) {
        if !(2..=8).contains(&settings.max_players) {
            self.fail_live(user, id, ErrorCode::Validation);
            return;
        }
        if self.mutate_host(user, id, |lobby| {
            if lobby.members.len() > usize::from(settings.max_players) {
                return false;
            }
            lobby.settings = settings;
            for member in &mut lobby.members {
                if let Member::Human { ready, .. } = member {
                    *ready = false;
                }
            }
            true
        }) {
            self.ok(user, id, None, false);
        }
    }

    fn add_bot(&mut self, user: &UserId, id: MessageId) {
        if self.mutate_host(user, id, |lobby| {
            if lobby.members.len() >= usize::from(lobby.settings.max_players) {
                return false;
            }
            let name = bot_name(&lobby.members);
            let color = free_color(&lobby.members);
            lobby.members.push(Member::Bot {
                name,
                color,
                level: lobby.settings.bot_level,
            });
            true
        }) {
            self.ok(user, id, None, false);
        }
    }

    fn remove_bot(&mut self, user: &UserId, id: MessageId, index: u32) {
        if self.mutate_host(user, id, |lobby| {
            let Some(index) = usize::try_from(index).ok() else {
                return false;
            };
            if !matches!(lobby.members.get(index), Some(Member::Bot { .. })) {
                return false;
            }
            lobby.members.remove(index);
            true
        }) {
            self.ok(user, id, None, false);
        }
    }

    fn kick(&mut self, user: &UserId, id: MessageId, target: &UserId) {
        let Some(lobby_id) = self.identity.lobby_of(user) else {
            self.fail_live(user, id, ErrorCode::NotInLobby);
            return;
        };
        let Some(lobby) = self.lobbies.get(&lobby_id) else {
            self.fail_live(user, id, ErrorCode::NotInLobby);
            return;
        };
        if lobby.state != LobbyPhase::Open {
            self.fail_live(user, id, ErrorCode::LobbyStarted);
            return;
        }
        if lobby.host_id.as_ref() != Some(user) {
            self.fail_live(user, id, ErrorCode::NotHost);
            return;
        }
        if target == user {
            self.fail_live(user, id, ErrorCode::Validation);
            return;
        }
        self.remove_member(&lobby_id, target);
        self.send(
            target,
            &LobbyClosed {
                tag: LobbyClosedTag::Value,
                reason: skt_protocol::CloseReason::Kicked,
            },
        );
        self.ok(user, id, None, false);
    }

    fn start(&mut self, user: &UserId, id: MessageId) {
        let Some(lobby_id) = self.identity.lobby_of(user) else {
            self.fail_live(user, id, ErrorCode::NotInLobby);
            return;
        };
        let Some(lobby) = self.lobbies.get(&lobby_id).cloned() else {
            self.fail_live(user, id, ErrorCode::NotInLobby);
            return;
        };
        if lobby.state != LobbyPhase::Open || lobby.host_id.as_ref() != Some(user) {
            let code = if lobby.host_id.as_ref() == Some(user) {
                ErrorCode::LobbyStarted
            } else {
                ErrorCode::NotHost
            };
            self.fail_live(user, id, code);
            return;
        }
        let humans_ready = lobby.members.iter().all(|member| match member {
            Member::Bot { .. } => true,
            Member::Human { ready, .. } => *ready,
        });
        if lobby.members.len() < 2 || !humans_ready {
            self.fail_live(user, id, ErrorCode::NotReady);
            return;
        }
        self.ok(user, id, None, false);
        let game_id = GameId::new(identity::uuid());
        if let Some(lobby) = self.lobbies.get_mut(&lobby_id) {
            lobby.state = LobbyPhase::InGame;
            lobby.game_id = Some(game_id.clone());
        }
        let snapshot = self.lobbies.get(&lobby_id).cloned();
        if let Some(snapshot) = snapshot {
            self.push_lobby(&snapshot);
        }
        let priors = self.priors_of(&lobby);
        for (seated, game) in self
            .tables
            .open(&game_id, &lobby, self.now, &self.live, false, &priors)
        {
            self.identity.set_game(&seated, Some(game));
        }
    }

    fn mutate_open(&mut self, user: &UserId, id: MessageId, body: impl FnOnce(&mut Lobby)) -> bool {
        let Some(lobby_id) = self.identity.lobby_of(user) else {
            self.fail_live(user, id, ErrorCode::NotInLobby);
            return false;
        };
        let Some(lobby) = self.lobbies.get_mut(&lobby_id) else {
            self.fail_live(user, id, ErrorCode::NotInLobby);
            return false;
        };
        if lobby.state != LobbyPhase::Open {
            self.fail_live(user, id, ErrorCode::LobbyStarted);
            return false;
        }
        body(lobby);
        let snapshot = lobby.clone();
        self.push_lobby(&snapshot);
        true
    }

    fn mutate_host(
        &mut self,
        user: &UserId,
        id: MessageId,
        body: impl FnOnce(&mut Lobby) -> bool,
    ) -> bool {
        let Some(lobby_id) = self.identity.lobby_of(user) else {
            self.fail_live(user, id, ErrorCode::NotInLobby);
            return false;
        };
        let Some(lobby) = self.lobbies.get_mut(&lobby_id) else {
            self.fail_live(user, id, ErrorCode::NotInLobby);
            return false;
        };
        if lobby.state != LobbyPhase::Open {
            self.fail_live(user, id, ErrorCode::LobbyStarted);
            return false;
        }
        if lobby.host_id.as_ref() != Some(user) {
            self.fail_live(user, id, ErrorCode::NotHost);
            return false;
        }
        if !body(lobby) {
            self.fail_live(user, id, ErrorCode::Validation);
            return false;
        }
        let snapshot = lobby.clone();
        self.push_lobby(&snapshot);
        true
    }

    fn remove_member(&mut self, lobby_id: &LobbyId, user: &UserId) {
        self.identity.set_lobby(user, None);
        let Some(lobby) = self.lobbies.get_mut(lobby_id) else {
            return;
        };
        lobby.members.retain(|member| match member {
            Member::Human { user: seated, .. } => &seated.id != user,
            Member::Bot { .. } => true,
        });
        if lobby.host_id.as_ref() == Some(user) {
            lobby.host_id = lobby.members.iter().find_map(|member| match member {
                Member::Human { user, .. } => Some(user.id.clone()),
                Member::Bot { .. } => None,
            });
        }
        let empty = !lobby
            .members
            .iter()
            .any(|member| matches!(member, Member::Human { .. }));
        let code = lobby.code.clone();
        let snapshot = lobby.clone();
        if empty {
            self.codes.remove(&code);
            self.lobbies.remove(lobby_id);
            self.opened.retain(|id| id != lobby_id);
            return;
        }
        self.push_lobby(&snapshot);
    }

    /// Open public lobbies, oldest first, including full ones. In-game lobbies are omitted.
    pub fn public_lobbies(&self) -> LobbyList {
        let lobbies = self
            .opened
            .iter()
            .filter_map(|id| self.lobbies.get(id))
            .filter(|lobby| {
                lobby.visibility == Visibility::Public && lobby.state == LobbyPhase::Open
            })
            .map(|lobby| LobbySummary {
                id: lobby.id.clone(),
                host_name: lobby.host_id.as_ref().map_or_else(
                    || "Sailor".to_owned(),
                    |id| self.identity.public_user(id).name,
                ),
                settings: lobby.settings,
                players: u32::try_from(lobby.members.len()).unwrap_or(0),
            })
            .collect();
        LobbyList { lobbies }
    }

    /// Write a display name and colour into an open or running lobby and tell every member.
    pub fn publish_profile(&mut self, user: &UserId) {
        let Some(lobby_id) = self.identity.lobby_of(user) else {
            return;
        };
        let Some(lobby) = self.lobbies.get_mut(&lobby_id) else {
            return;
        };
        let shown = self.identity.public_user(user);
        for member in &mut lobby.members {
            if let Member::Human { user: seated, .. } = member
                && seated.id == *user
            {
                *seated = shown.clone();
            }
        }
        let snapshot = lobby.clone();
        self.push_lobby(&snapshot);
    }

    /// Leave an open lobby and the queue, and close the socket. A running game stays seated.
    pub fn drop_presence(&mut self, user: &UserId) {
        let in_game = self.identity.game_of(user).is_some();
        if !in_game && let Some(lobby_id) = self.identity.lobby_of(user) {
            let open = self
                .lobbies
                .get(&lobby_id)
                .is_some_and(|lobby| lobby.state == LobbyPhase::Open);
            if open {
                self.remove_member(&lobby_id, user);
            }
        }
        if self.casual.remove(user) {
            self.push_queue(QueueMode::Casual);
        } else if self.ranked.remove(user) {
            self.push_queue(QueueMode::Ranked);
        }
        self.close_socket(user, 1008);
    }

    fn join_queue(&mut self, user: &UserId, id: MessageId, mode: QueueMode) {
        if mode == QueueMode::Ranked && self.identity.guest_of(user) {
            self.fail_live(user, id, ErrorCode::AccountRequired);
            return;
        }
        if mode == QueueMode::Ranked && self.identity.cooldown_until(user).is_some() {
            self.fail_live(user, id, ErrorCode::QueueCooldown);
            return;
        }
        if self.busy(user) {
            self.fail_live(user, id, ErrorCode::AlreadySeated);
            return;
        }
        let ordinal = if mode == QueueMode::Ranked {
            self.identity.ordinal_of(user)
        } else {
            0
        };
        let now = self.now;
        self.line_mut(mode).push(user.clone(), now, ordinal);
        let status = self.line(mode).status(user, mode);
        self.ok_queue(user, id, status);
        self.push_queue_except(mode, user);
        if mode == QueueMode::Casual && self.casual.waiting.len() >= 4 {
            let ids: Vec<UserId> = self
                .casual
                .waiting
                .iter()
                .take(4)
                .map(|waiting| waiting.user.clone())
                .collect();
            self.seat_ids(QueueMode::Casual, &ids);
        } else if mode == QueueMode::Ranked {
            self.form_ranked();
        }
    }

    fn leave_queue(&mut self, user: &UserId, id: MessageId) {
        let left = if self.casual.remove(user) {
            Some(QueueMode::Casual)
        } else if self.ranked.remove(user) {
            Some(QueueMode::Ranked)
        } else {
            None
        };
        self.ok(user, id, None, false);
        if let Some(mode) = left {
            self.push_queue(mode);
        }
    }

    fn fill_queue(&mut self) {
        let Some(since) = self.casual.since else {
            return;
        };
        if self.casual.waiting.is_empty() || self.now.saturating_duration_since(since) < self.fill {
            return;
        }
        let ids: Vec<UserId> = self
            .casual
            .waiting
            .iter()
            .map(|waiting| waiting.user.clone())
            .collect();
        self.seat_ids(QueueMode::Casual, &ids);
    }

    fn form_ranked(&mut self) {
        let waiters: Vec<Waiter> = self
            .ranked
            .waiting
            .iter()
            .map(|waiting| Waiter {
                rating: waiting.rating,
                waited: self.now.saturating_duration_since(waiting.joined),
            })
            .collect();
        let Some(indexes) = rating::pick_table(&waiters) else {
            return;
        };
        let ids: Vec<UserId> = indexes
            .into_iter()
            .filter_map(|index| {
                self.ranked
                    .waiting
                    .get(index)
                    .map(|waiting| waiting.user.clone())
            })
            .collect();
        if ids.len() < 4 {
            return;
        }
        self.seat_ids(QueueMode::Ranked, &ids);
        self.push_queue(QueueMode::Ranked);
    }

    fn penalise(&mut self, user: &UserId) {
        let now = identity::unix_now().get();
        let leaves = self.identity.leaves_of(user).saturating_add(1);
        let season = rating::season_at(now).id;
        let until = now.saturating_add(rating::cooldown_ms(leaves));
        self.identity.note_penalty(user, leaves, season, until);
        self.penalties.push(PenaltyWrite {
            user: user.clone(),
            season,
            leaves,
            until,
        });
    }

    // Human: Ranked starts with four accounts and no bot. Casual may fill the empty seats.
    // Agent: READS one queue line; WRITES a matchmade table; ranked never inserts Member::Bot.
    fn seat_ids(&mut self, mode: QueueMode, ids: &[UserId]) {
        if mode == QueueMode::Ranked && ids.len() < 4 {
            return;
        }
        let now = self.now;
        let waiting = self.line_mut(mode).take_ids(ids, now);
        let mut members = Vec::new();
        for seat in &waiting {
            members.push(self.human_member(&seat.user, false));
        }
        if mode == QueueMode::Casual {
            while members.len() < 4 {
                let name = bot_name(&members);
                members.push(Member::Bot {
                    name,
                    color: TableColor::Sky,
                    level: skt_engine::BotLevel::Normal,
                });
            }
        }
        let table_mode = match mode {
            QueueMode::Casual => TableMode::Casual,
            QueueMode::Ranked => TableMode::Ranked,
        };
        let lobby = Lobby {
            id: LobbyId::new(identity::uuid()),
            code: String::new(),
            mode: table_mode,
            visibility: Visibility::Private,
            host_id: None,
            settings: skt_protocol::GameSettings::standard(),
            members,
            state: LobbyPhase::Open,
            game_id: None,
        };
        let game_id = GameId::new(identity::uuid());
        let priors = self.priors_of(&lobby);
        for (seated, game) in self
            .tables
            .open(&game_id, &lobby, self.now, &self.live, true, &priors)
        {
            self.identity.set_game(&seated, Some(game));
        }
    }

    fn line(&self, mode: QueueMode) -> &Line {
        match mode {
            QueueMode::Casual => &self.casual,
            QueueMode::Ranked => &self.ranked,
        }
    }

    fn line_mut(&mut self, mode: QueueMode) -> &mut Line {
        match mode {
            QueueMode::Casual => &mut self.casual,
            QueueMode::Ranked => &mut self.ranked,
        }
    }

    fn queued(&self, user: &UserId) -> bool {
        self.casual.contains(user) || self.ranked.contains(user)
    }

    fn queue_status(&self, user: &UserId) -> Option<QueueStatus> {
        self.casual
            .status(user, QueueMode::Casual)
            .or_else(|| self.ranked.status(user, QueueMode::Ranked))
    }

    fn push_queue(&self, mode: QueueMode) {
        self.push_queue_except(mode, &UserId::new(String::new()));
    }

    fn push_queue_except(&self, mode: QueueMode, skip: &UserId) {
        let line = self.line(mode);
        let found = u32::try_from(line.waiting.len()).unwrap_or(0);
        for waiting in &line.waiting {
            if &waiting.user == skip {
                continue;
            }
            self.send(
                &waiting.user,
                &QueueStatusPush {
                    tag: QueueStatusTag::Value,
                    queue: QueueStatus {
                        mode,
                        since: waiting.since,
                        found,
                        needed: 4,
                    },
                },
            );
        }
    }

    fn ok_queue(&self, user: &UserId, id: MessageId, queue: Option<QueueStatus>) {
        self.send(
            user,
            &OkReply {
                tag: OkTag::Value,
                re: id,
                lobby: None,
                queue,
                server_time: None,
            },
        );
    }

    fn close_socket(&self, user: &UserId, code: u16) {
        if let Some(live) = self.live.get(user) {
            let _ = live.out.send(Wire::Close(code));
        }
    }

    fn push_lobby(&self, lobby: &Lobby) {
        let frame = LobbyStatePush {
            tag: LobbyStateTag::Value,
            lobby: lobby.clone(),
        };
        for member in &lobby.members {
            if let Member::Human { user, .. } = member {
                self.send(&user.id, &frame);
            }
        }
    }

    fn push_welcome(&self, user: &UserId) {
        let me = self.me_of(user);
        let lobby = self
            .identity
            .lobby_of(user)
            .and_then(|id| self.lobbies.get(&id).cloned());
        let game = self.tables.welcome_game(user);
        self.send(
            user,
            &skt_protocol::Welcome {
                tag: skt_protocol::WelcomeTag::Value,
                me,
                server_time: identity::unix_now(),
                lobby,
                queue: self.queue_status(user),
                game,
            },
        );
    }

    fn busy(&self, user: &UserId) -> bool {
        self.identity.lobby_of(user).is_some()
            || self.identity.game_of(user).is_some()
            || self.queued(user)
    }

    fn me_for_token(&self, token: &str) -> Option<Me> {
        let user = self.identity.user_for_token(token)?;
        Some(self.me_of(&user))
    }

    fn me_of(&self, user: &UserId) -> Me {
        let active = if let Some(id) = self.identity.game_of(user) {
            Some(Active::Game {
                id: id.as_str().to_owned(),
            })
        } else if self.ranked.contains(user) {
            Some(Active::Queue {
                id: "ranked".to_owned(),
            })
        } else if self.casual.contains(user) {
            Some(Active::Queue {
                id: "casual".to_owned(),
            })
        } else {
            self.identity.lobby_of(user).map(|id| Active::Lobby {
                id: id.as_str().to_owned(),
            })
        };
        Me {
            user: self.identity.public_user(user),
            guest: self.identity.guest_of(user),
            username: self.identity.username_of(user),
            active,
            cooldown_until: self
                .identity
                .cooldown_until(user)
                .map(skt_protocol::UnixMs::new),
            stats: self.identity.stats_of(user),
            rating: self.identity.rating_of(user),
        }
    }

    fn priors_of(&self, lobby: &Lobby) -> HashMap<UserId, OpenPrior> {
        let mut priors = HashMap::new();
        for member in &lobby.members {
            if let Member::Human { user, .. } = member {
                let (skill, tier) = self.identity.open_skill(&user.id);
                priors.insert(
                    user.id.clone(),
                    OpenPrior {
                        mu: skill.mu,
                        sigma: skill.sigma,
                        games: skill.games,
                        tier,
                    },
                );
            }
        }
        priors
    }

    fn human_member(&self, user: &UserId, ready: bool) -> Member {
        Member::Human {
            user: self.identity.public_user(user),
            ready,
            connected: self.live.contains_key(user),
        }
    }

    fn mark_connected(&mut self, user: &UserId, connected: bool) {
        let Some(lobby_id) = self.identity.lobby_of(user) else {
            return;
        };
        let Some(lobby) = self.lobbies.get_mut(&lobby_id) else {
            return;
        };
        for member in &mut lobby.members {
            if let Member::Human {
                user: seated,
                connected: flag,
                ..
            } = member
                && &seated.id == user
            {
                *flag = connected;
            }
        }
        let snapshot = lobby.clone();
        self.push_lobby(&snapshot);
    }

    fn fresh_code(&self) -> String {
        const ALPHABET: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";
        let mut rng = rand::rng();
        loop {
            let code: String = (0..6)
                .map(|_| {
                    let index = rng.random_range(0..ALPHABET.len());
                    char::from(ALPHABET[index])
                })
                .collect();
            if !self.codes.contains_key(&code) {
                return code;
            }
        }
    }

    fn ok(&self, user: &UserId, id: MessageId, lobby: Option<Lobby>, clock: bool) {
        self.send(
            user,
            &OkReply {
                tag: OkTag::Value,
                re: id,
                lobby,
                queue: None,
                server_time: clock.then(identity::unix_now),
            },
        );
    }

    /// Reject one frame on connection `conn`, whether or not it has said hello.
    pub fn reject(&self, user: &UserId, conn: u64, id: MessageId, code: ErrorCode) {
        if let Some(pending) = self.pending.get(&conn) {
            fail_out(&pending.out, id, code);
            return;
        }
        if self.live.get(user).is_some_and(|live| live.id == conn) {
            self.fail_live(user, id, code);
        }
    }

    /// Whether this connection has sent an accepted `hello`.
    #[must_use]
    pub fn greeted(&self, user: &UserId, conn: u64) -> bool {
        self.live.get(user).is_some_and(|live| live.id == conn)
    }

    fn fail_live(&self, user: &UserId, id: MessageId, code: ErrorCode) {
        self.send(
            user,
            &ErrMessage {
                tag: ErrTag::Value,
                re: id,
                code,
                message: code.message().to_owned(),
            },
        );
    }

    fn send(&self, user: &UserId, frame: &impl serde::Serialize) {
        let Some(live) = self.live.get(user) else {
            return;
        };
        send(&live.out, frame);
    }
}

pub(crate) fn message_id(text: &str) -> Option<MessageId> {
    let value: serde_json::Value = serde_json::from_str(text).ok()?;
    let id = value.get("id")?.as_u64()?;
    u32::try_from(id).ok().map(MessageId::new)
}

/// `queue.join` whose `mode` is neither casual nor ranked.
fn queue_mode_rejected(text: &str) -> bool {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(text) else {
        return false;
    };
    if value.get("t").and_then(serde_json::Value::as_str) != Some("queue.join") {
        return false;
    }
    let mode = value.get("mode").and_then(serde_json::Value::as_str);
    mode != Some("casual") && mode != Some("ranked")
}

fn send(out: &Outbox, frame: &impl serde::Serialize) {
    if let Ok(text) = serde_json::to_string(frame) {
        let _ = out.send(Wire::Text(text));
    }
}

fn fail_out(out: &Outbox, id: MessageId, code: ErrorCode) {
    send(
        out,
        &ErrMessage {
            tag: ErrTag::Value,
            re: id,
            code,
            message: code.message().to_owned(),
        },
    );
}

fn bot_name(members: &[Member]) -> String {
    const NAMES: [&str; 8] = [
        "Barnacle", "Cutlass", "Doubloon", "Anchor", "Kelp", "Rigging", "Squall", "Marlin",
    ];
    let taken: Vec<&str> = members
        .iter()
        .map(|member| match member {
            Member::Bot { name, .. } => name.as_str(),
            Member::Human { user, .. } => user.name.as_str(),
        })
        .collect();
    NAMES
        .into_iter()
        .find(|name| !taken.contains(name))
        .unwrap_or("Bot")
        .to_owned()
}

fn free_color(members: &[Member]) -> TableColor {
    const COLORS: [TableColor; 8] = [
        TableColor::Sky,
        TableColor::Orange,
        TableColor::Purple,
        TableColor::Red,
        TableColor::Green,
        TableColor::Gold,
        TableColor::Navy,
        TableColor::Pink,
    ];
    let used: Vec<TableColor> = members
        .iter()
        .map(|member| match member {
            Member::Bot { color, .. } => *color,
            Member::Human { user, .. } => user.color,
        })
        .collect();
    COLORS
        .into_iter()
        .find(|color| !used.contains(color))
        .unwrap_or(TableColor::Sky)
}

use rand::Rng;
