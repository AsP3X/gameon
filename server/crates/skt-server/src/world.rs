//! In-memory sessions, private lobbies, and one table task's worth of state.
//!
//! A single mutex owns every table. Callers copy outbound frames out of the lock and send them
//! afterwards, so the lock is never held across an `.await`. Each accepted game step queues `ok`
//! and then that step's `game.update` before anything else can write.

pub(crate) mod identity;
mod table;

pub(crate) use table::GameReport;
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

use table::Tables;

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
    queue: VecDeque<Waiting>,
    /// When the casual queue last became non-empty.
    queue_since: Option<Instant>,
    fill: Duration,
    /// Current socket for a user, if `hello` has been accepted.
    live: HashMap<UserId, Live>,
    now: Instant,
}

struct Waiting {
    user: UserId,
    since: skt_protocol::UnixMs,
}

struct Live {
    id: u64,
    out: Outbox,
    greeted: bool,
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
            queue: VecDeque::new(),
            queue_since: None,
            fill,
            live: HashMap::new(),
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

    /// Public server description. Emotes stay empty until the owner names them.
    #[must_use]
    pub fn config() -> ServerConfig {
        ServerConfig {
            protocol: skt_protocol::PROTOCOL,
            build: "dev".to_owned(),
            timers: skt_protocol::Timers::standard(),
            standard: skt_protocol::GameSettings::standard(),
            season: None,
            emotes: Vec::new(),
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

    /// Attach `out` as this user's only socket. A previous socket is superseded.
    pub fn bind(&mut self, token: &str, out: Outbox) -> Result<(UserId, u64), ErrorCode> {
        let user = self
            .identity
            .user_for_token(token)
            .ok_or(ErrorCode::Unauthenticated)?;
        let id = self.identity.next_conn();
        if let Some(previous) = self.live.insert(
            user.clone(),
            Live {
                id,
                out,
                greeted: false,
            },
        ) {
            send(
                &previous.out,
                &skt_protocol::Superseded {
                    tag: skt_protocol::SupersededTag::Value,
                },
            );
        }
        Ok((user, id))
    }

    /// The socket closed. A seated player becomes `offline` when this was their live socket.
    pub fn disconnect(&mut self, user: &UserId, id: u64) {
        let current = self.live.get(user).is_some_and(|live| live.id == id);
        if !current {
            return;
        }
        self.live.remove(user);
        self.mark_connected(user, false);
        self.tables.on_socket(user, false, self.now, &self.live);
    }

    /// One client frame.
    pub fn on_message(&mut self, user: &UserId, text: &str) {
        let Some(live) = self.live.get(user) else {
            return;
        };
        if !live.greeted {
            self.hello(user, text);
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

    /// Deadlines, bot moves, and the disconnect grace.
    pub fn tick(&mut self) -> Vec<GameReport> {
        self.now = Instant::now();
        self.fill_queue();
        let (finished, reports) = self.tables.tick(self.now, &self.live, &mut self.lobbies);
        for user in finished {
            self.identity.set_game(&user, None);
        }
        reports
    }

    /// Add the stored counters to the in-memory account.
    pub fn apply_report(&mut self, report: &GameReport) {
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

    fn hello(&mut self, user: &UserId, text: &str) {
        let Ok(ClientMessage::Hello { id, protocol, .. }) = serde_json::from_str(text) else {
            self.fail_live(user, MessageId::new(0), ErrorCode::Validation);
            return;
        };
        if protocol != skt_protocol::PROTOCOL {
            self.fail_live(user, id, ErrorCode::ProtocolUnsupported);
            return;
        }
        if let Some(live) = self.live.get_mut(user) {
            live.greeted = true;
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
            ClientMessage::GameEmote { id, .. } => self.fail_live(user, id, ErrorCode::Validation),
            other => {
                let left = self
                    .tables
                    .act(user, other, self.now, &self.live, &mut self.lobbies);
                for seated in left {
                    self.identity.set_game(&seated, None);
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
        for (seated, game) in self
            .tables
            .open(&game_id, &lobby, self.now, &self.live, false)
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
        if self.queued(user) {
            self.queue.retain(|waiting| &waiting.user != user);
            if self.queue.is_empty() {
                self.queue_since = None;
            }
            self.push_queue();
        }
        self.close_socket(user, 1008);
    }

    fn join_queue(&mut self, user: &UserId, id: MessageId, mode: QueueMode) {
        if mode == QueueMode::Ranked && self.identity.guest_of(user) {
            self.fail_live(user, id, ErrorCode::AccountRequired);
            return;
        }
        if self.busy(user) {
            self.fail_live(user, id, ErrorCode::AlreadySeated);
            return;
        }
        if mode == QueueMode::Ranked {
            self.fail_live(user, id, ErrorCode::Internal);
            return;
        }
        if self.queue.is_empty() {
            self.queue_since = Some(self.now);
        }
        self.queue.push_back(Waiting {
            user: user.clone(),
            since: identity::unix_now(),
        });
        let status = self.queue_status(user);
        self.ok_queue(user, id, status);
        self.push_queue_except(user);
        if self.queue.len() >= 4 {
            self.seat_from_queue(4);
        }
    }

    fn leave_queue(&mut self, user: &UserId, id: MessageId) {
        self.queue.retain(|waiting| &waiting.user != user);
        if self.queue.is_empty() {
            self.queue_since = None;
        }
        self.ok(user, id, None, false);
        self.push_queue();
    }

    fn fill_queue(&mut self) {
        let Some(since) = self.queue_since else {
            return;
        };
        if self.queue.is_empty() || self.now.saturating_duration_since(since) < self.fill {
            return;
        }
        let count = self.queue.len();
        self.seat_from_queue(count);
    }

    fn seat_from_queue(&mut self, count: usize) {
        let waiting: Vec<Waiting> = self.queue.drain(..count.min(self.queue.len())).collect();
        if self.queue.is_empty() {
            self.queue_since = None;
        } else {
            self.queue_since = Some(self.now);
        }
        let mut members = Vec::new();
        for seat in &waiting {
            members.push(self.human_member(&seat.user, false));
        }
        while members.len() < 4 {
            let name = bot_name(&members);
            let color = TableColor::Sky;
            members.push(Member::Bot {
                name,
                color,
                level: skt_engine::BotLevel::Normal,
            });
        }
        let lobby = Lobby {
            id: LobbyId::new(identity::uuid()),
            code: String::new(),
            mode: TableMode::Casual,
            visibility: Visibility::Private,
            host_id: None,
            settings: skt_protocol::GameSettings::standard(),
            members,
            state: LobbyPhase::Open,
            game_id: None,
        };
        let game_id = GameId::new(identity::uuid());
        for (seated, game) in self
            .tables
            .open(&game_id, &lobby, self.now, &self.live, true)
        {
            self.identity.set_game(&seated, Some(game));
        }
    }

    fn queued(&self, user: &UserId) -> bool {
        self.queue.iter().any(|waiting| &waiting.user == user)
    }

    fn queue_status(&self, user: &UserId) -> Option<QueueStatus> {
        let waiting = self.queue.iter().find(|waiting| &waiting.user == user)?;
        Some(QueueStatus {
            mode: QueueMode::Casual,
            since: waiting.since,
            found: u32::try_from(self.queue.len()).unwrap_or(0),
            needed: 4,
        })
    }

    fn push_queue(&self) {
        self.push_queue_except(&UserId::new(String::new()));
    }

    fn push_queue_except(&self, skip: &UserId) {
        let found = u32::try_from(self.queue.len()).unwrap_or(0);
        for waiting in &self.queue {
            if &waiting.user == skip {
                continue;
            }
            self.send(
                &waiting.user,
                &QueueStatusPush {
                    tag: QueueStatusTag::Value,
                    queue: QueueStatus {
                        mode: QueueMode::Casual,
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
        } else if self.queued(user) {
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
            cooldown_until: None,
            stats: self.identity.stats_of(user),
            rating: None,
        }
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

fn message_id(text: &str) -> Option<MessageId> {
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
