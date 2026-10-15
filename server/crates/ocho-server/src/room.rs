//! Lobbies and the one table each lobby plays.
//!
//! Accounts stay on the API. This room only checks the session cookie against `sessions`.

use std::collections::HashMap;
use std::sync::Arc;

use ocho_engine::{Color, Game, Intent, PlayerView, Rng};
use rand::Rng as _;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::sync::{Mutex, mpsc};
use tokio_postgres::NoTls;

/// A signed-in player.
#[derive(Debug, Clone)]
pub struct User {
    /// Account id.
    pub id: String,
    /// Display name.
    pub name: String,
}

/// The process-wide Ocho room.
pub struct Room {
    db: tokio_postgres::Client,
    inner: Mutex<Inner>,
}

struct Socket {
    tx: mpsc::UnboundedSender<String>,
    generation: u64,
}

struct Inner {
    sockets: HashMap<String, Socket>,
    next_socket: u64,
    lobbies: HashMap<String, Lobby>,
    codes: HashMap<String, String>,
    seated: HashMap<String, String>,
}

struct Lobby {
    id: String,
    code: String,
    host: String,
    players: u8,
    teams: bool,
    first_to_500: bool,
    members: Vec<Member>,
    table: Option<Table>,
}

struct Member {
    user: String,
    name: String,
    ready: bool,
}

struct Table {
    game: Game,
    seats: Vec<String>,
}

struct OsRng;

impl Rng for OsRng {
    fn next_u32(&mut self) -> u32 {
        rand::random()
    }
}

/// A frame from the browser.
#[derive(Debug, Deserialize)]
#[serde(tag = "t", rename_all_fields = "camelCase")]
pub enum ClientMsg {
    /// First frame.
    #[serde(rename = "hello")]
    Hello {
        /// Correlation id.
        id: u64,
    },
    /// Open a private table.
    #[serde(rename = "ocho.create")]
    Create {
        /// Correlation id.
        id: u64,
        /// Seats, 2 to 8. Teams requires 4.
        players: u8,
        /// 2v2. Only legal when `players` is 4.
        teams: bool,
        /// `one` or `to500`.
        #[serde(rename = "match")]
        match_kind: MatchKind,
    },
    /// Join with a code.
    #[serde(rename = "ocho.join")]
    Join {
        /// Correlation id.
        id: u64,
        /// Six-character code.
        code: String,
    },
    /// Leave the lobby or the table.
    #[serde(rename = "ocho.leave")]
    Leave {
        /// Correlation id.
        id: u64,
    },
    /// Ready or unready.
    #[serde(rename = "ocho.ready")]
    Ready {
        /// Correlation id.
        id: u64,
        /// Whether this player is ready.
        ready: bool,
    },
    /// Host deals. Every member is ready and the table is full.
    #[serde(rename = "ocho.start")]
    Start {
        /// Correlation id.
        id: u64,
    },
    /// Play a card. `color` is required for a wild.
    #[serde(rename = "ocho.play")]
    Play {
        /// Correlation id.
        id: u64,
        /// Card id.
        card: u16,
        /// Colour a wild names.
        color: Option<Color>,
    },
    /// Draw one, or take the open stack.
    #[serde(rename = "ocho.draw")]
    Draw {
        /// Correlation id.
        id: u64,
    },
    /// Decline the card just drawn.
    #[serde(rename = "ocho.keep")]
    Keep {
        /// Correlation id.
        id: u64,
    },
    /// Name the colour of an opening wild.
    #[serde(rename = "ocho.color")]
    Opening {
        /// Correlation id.
        id: u64,
        /// The colour.
        color: Color,
    },
    /// Deal the next hand.
    #[serde(rename = "ocho.next")]
    Next {
        /// Correlation id.
        id: u64,
    },
}

/// `one` or `to500`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MatchKind {
    /// The match is a single hand.
    One,
    /// First to 500.
    To500,
}

/// A frame to the browser.
#[derive(Debug, Serialize)]
#[serde(tag = "t", rename_all_fields = "camelCase")]
pub enum ServerMsg {
    /// The command was accepted.
    #[serde(rename = "ok")]
    Ok {
        /// Correlation id.
        re: u64,
    },
    /// The command was refused.
    #[serde(rename = "err")]
    Err {
        /// Correlation id.
        re: u64,
        /// Stable code.
        code: &'static str,
        /// A short sentence.
        message: &'static str,
    },
    /// Lobby membership.
    #[serde(rename = "ocho.lobby")]
    Lobby {
        /// The lobby.
        lobby: LobbyView,
    },
    /// This seat's table.
    #[serde(rename = "ocho.view")]
    View {
        /// The per-seat view.
        view: PlayerView,
    },
}

/// What every member of a lobby can see.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LobbyView {
    /// Lobby id.
    pub id: String,
    /// Join code.
    pub code: String,
    /// Host account id.
    pub host: String,
    /// Seats the table will deal.
    pub players: u8,
    /// 2v2.
    pub teams: bool,
    /// First to 500 when true. One hand when false.
    pub first_to_500: bool,
    /// Who has sat down.
    pub members: Vec<MemberView>,
    /// True once the first hand is dealt.
    pub started: bool,
}

/// One member.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberView {
    /// Account id.
    pub user: String,
    /// Display name.
    pub name: String,
    /// Ready for the deal.
    pub ready: bool,
}

impl ServerMsg {
    /// A refused command.
    #[must_use]
    pub const fn err(re: u64, code: &'static str, message: &'static str) -> Self {
        Self::Err { re, code, message }
    }
}

impl Room {
    /// Connect to the account database. The connection is driven on its own task.
    ///
    /// # Errors
    ///
    /// The database rejected the URL or the connection.
    pub async fn connect(url: &str) -> Result<Arc<Self>, tokio_postgres::Error> {
        let (client, connection) = tokio_postgres::connect(url, NoTls).await?;
        tokio::spawn(async move {
            if let Err(err) = connection.await {
                tracing::error!("postgres connection closed: {err}");
            }
        });
        Ok(Arc::new(Self {
            db: client,
            inner: Mutex::new(Inner {
                sockets: HashMap::new(),
                next_socket: 0,
                lobbies: HashMap::new(),
                codes: HashMap::new(),
                seated: HashMap::new(),
            }),
        }))
    }

    /// The account for this session cookie.
    ///
    /// # Errors
    ///
    /// The cookie is unknown, expired, or the database failed.
    pub async fn user(&self, token: &str) -> Result<User, ()> {
        let hash = hash_token(token);
        let user_id: Option<String> = self
            .db
            .query_opt(
                "UPDATE sessions SET last_used = now(), expires_at = now() + interval '30 days' WHERE token_hash = $1 AND expires_at > now() RETURNING user_id",
                &[&hash.as_slice()],
            )
            .await
            .map_err(|_| ())?
            .map(|row| row.get(0));
        let Some(user_id) = user_id else {
            return Err(());
        };
        let name: String = self
            .db
            .query_one("SELECT name FROM users WHERE id = $1", &[&user_id])
            .await
            .map_err(|_| ())?
            .get(0);
        Ok(User { id: user_id, name })
    }

    /// Remember where to push frames for `user`. A newer socket replaces an older one.
    pub async fn attach(&self, user: String, tx: mpsc::UnboundedSender<String>) -> u64 {
        let mut inner = self.inner.lock().await;
        inner.next_socket = inner.next_socket.saturating_add(1);
        let generation = inner.next_socket;
        inner.sockets.insert(user, Socket { tx, generation });
        generation
    }

    /// Forget the socket, but only if it is still the current one.
    pub async fn detach(&self, user: &str, generation: u64) {
        let mut inner = self.inner.lock().await;
        detach_socket(&mut inner, user, generation);
    }

    /// Drop lobbies whose members are all disconnected and that have not dealt.
    pub async fn sweep(&self) {
        let mut inner = self.inner.lock().await;
        let gone: Vec<String> = inner
            .lobbies
            .iter()
            .filter(|(_, lobby)| lobby.table.is_none())
            .filter(|(_, lobby)| {
                lobby
                    .members
                    .iter()
                    .all(|member| !inner.sockets.contains_key(&member.user))
            })
            .map(|(id, _)| id.clone())
            .collect();
        for id in gone {
            if let Some(lobby) = inner.lobbies.remove(&id) {
                inner.codes.remove(&lobby.code);
                for member in lobby.members {
                    inner.seated.remove(&member.user);
                }
            }
        }
    }

    /// Handle one command. The seat is `user`, never a field of the message.
    pub async fn handle(&self, user: &User, msg: ClientMsg) {
        self.step_and_publish(user, msg).await;
    }

    async fn send(&self, user: &str, msg: &ServerMsg) {
        let Some(text) = serde_json::to_string(msg).ok() else {
            return;
        };
        let tx = self
            .inner
            .lock()
            .await
            .sockets
            .get(user)
            .map(|socket| socket.tx.clone());
        if let Some(tx) = tx {
            let _ = tx.send(text);
        }
    }
}

type StepOk = (u64, Option<LobbyView>, bool);
type StepErr = (u64, &'static str, &'static str);

fn detach_socket(inner: &mut Inner, user: &str, generation: u64) {
    let current = inner
        .sockets
        .get(user)
        .is_some_and(|socket| socket.generation == generation);
    if current {
        inner.sockets.remove(user);
    }
}

fn hello(inner: &Inner, user: &str, id: u64) -> StepOk {
    let Some(lobby_id) = inner.seated.get(user) else {
        return (id, None, false);
    };
    let Some(lobby) = inner.lobbies.get(lobby_id) else {
        return (id, None, false);
    };
    let started = lobby.table.is_some();
    (id, Some(lobby_view(lobby)), started)
}

fn create(
    inner: &mut Inner,
    user: &User,
    id: u64,
    players: u8,
    teams: bool,
    first_to_500: bool,
) -> Result<StepOk, StepErr> {
    if inner.seated.contains_key(&user.id) {
        return Err((id, "ALREADY_SEATED", "You are already at a table."));
    }
    if !(2..=8).contains(&players) || (teams && players != 4) {
        return Err((
            id,
            "VALIDATION",
            "Ocho seats 2 to 8, and teams is four players.",
        ));
    }
    let lobby_id = fresh_id();
    let code = fresh_code(&inner.codes);
    let lobby = Lobby {
        id: lobby_id.clone(),
        code: code.clone(),
        host: user.id.clone(),
        players,
        teams,
        first_to_500,
        members: vec![Member {
            user: user.id.clone(),
            name: user.name.clone(),
            ready: false,
        }],
        table: None,
    };
    inner.codes.insert(code, lobby_id.clone());
    inner.seated.insert(user.id.clone(), lobby_id.clone());
    let view = lobby_view(&lobby);
    inner.lobbies.insert(lobby_id, lobby);
    Ok((id, Some(view), false))
}

fn join(inner: &mut Inner, user: &User, id: u64, code: &str) -> Result<StepOk, StepErr> {
    if inner.seated.contains_key(&user.id) {
        return Err((id, "ALREADY_SEATED", "You are already at a table."));
    }
    let Some(lobby_id) = inner.codes.get(&code.to_ascii_uppercase()).cloned() else {
        return Err((id, "NOT_FOUND", "No table has that code."));
    };
    let Some(lobby) = inner.lobbies.get_mut(&lobby_id) else {
        return Err((id, "NOT_FOUND", "No table has that code."));
    };
    if lobby.table.is_some() || lobby.members.len() >= usize::from(lobby.players) {
        return Err((id, "LOBBY_FULL", "That table is full."));
    }
    lobby.members.push(Member {
        user: user.id.clone(),
        name: user.name.clone(),
        ready: false,
    });
    inner.seated.insert(user.id.clone(), lobby_id);
    let view = lobby_view(lobby);
    Ok((id, Some(view), false))
}

fn leave(inner: &mut Inner, user: &User, id: u64) -> Result<StepOk, StepErr> {
    let Some(lobby_id) = inner.seated.remove(&user.id) else {
        return Err((id, "NOT_SEATED", "You are not at a table."));
    };
    let Some(lobby) = inner.lobbies.get_mut(&lobby_id) else {
        return Ok((id, None, false));
    };
    let still_playing = lobby
        .table
        .as_ref()
        .is_some_and(|table| !table.game.is_over());
    if still_playing {
        inner.seated.insert(user.id.clone(), lobby_id);
        return Err((id, "GAME_RUNNING", "The hand is still going."));
    }
    lobby.members.retain(|member| member.user != user.id);
    let empty = lobby.members.is_empty();
    let code = lobby.code.clone();
    let view = lobby_view(lobby);
    if empty {
        inner.lobbies.remove(&lobby_id);
        inner.codes.remove(&code);
        return Ok((id, None, false));
    }
    if view.host == user.id
        && let Some(lobby) = inner.lobbies.get_mut(&lobby_id)
        && let Some(next) = lobby.members.first()
    {
        lobby.host = next.user.clone();
    }
    let view = inner.lobbies.get(&lobby_id).map(lobby_view);
    Ok((id, view, false))
}

fn set_ready(inner: &mut Inner, user: &User, id: u64, ready: bool) -> Result<StepOk, StepErr> {
    let lobby = lobby_of(inner, &user.id).ok_or((id, "NOT_SEATED", "You are not at a table."))?;
    if lobby.table.is_some() {
        return Err((id, "GAME_RUNNING", "The hand has already started."));
    }
    let Some(member) = lobby
        .members
        .iter_mut()
        .find(|member| member.user == user.id)
    else {
        return Err((id, "NOT_SEATED", "You are not at a table."));
    };
    member.ready = ready;
    let view = lobby_view(lobby);
    Ok((id, Some(view), false))
}

fn start(inner: &mut Inner, user: &User, id: u64) -> Result<StepOk, StepErr> {
    let lobby_id =
        inner
            .seated
            .get(&user.id)
            .cloned()
            .ok_or((id, "NOT_SEATED", "You are not at a table."))?;
    let lobby =
        inner
            .lobbies
            .get_mut(&lobby_id)
            .ok_or((id, "NOT_SEATED", "You are not at a table."))?;
    if lobby.host != user.id {
        return Err((id, "NOT_HOST", "Only the host can deal."));
    }
    if lobby.table.is_some() {
        return Err((id, "GAME_RUNNING", "The hand has already started."));
    }
    if lobby.members.len() != usize::from(lobby.players)
        || lobby.members.iter().any(|member| !member.ready)
    {
        return Err((id, "NOT_READY", "Every seat has to be filled and ready."));
    }
    let game = Game::create(lobby.players, lobby.teams, lobby.first_to_500, &mut OsRng)
        .map_err(|_| (id, "VALIDATION", "Those settings cannot be dealt."))?;
    let seats = lobby
        .members
        .iter()
        .map(|member| member.user.clone())
        .collect();
    lobby.table = Some(Table { game, seats });
    let view = lobby_view(lobby);
    Ok((id, Some(view), true))
}

fn act(inner: &mut Inner, user: &User, id: u64, intent: Intent) -> Result<StepOk, StepErr> {
    let lobby = lobby_of(inner, &user.id).ok_or((id, "NOT_SEATED", "You are not at a table."))?;
    let table = lobby
        .table
        .as_mut()
        .ok_or((id, "NOT_STARTED", "The hand has not started."))?;
    let Some(seat) = table.seats.iter().position(|seated| seated == &user.id) else {
        return Err((id, "NOT_SEATED", "You are not at a table."));
    };
    let seat = u8::try_from(seat).map_err(|_| (id, "VALIDATION", "Seat is out of range."))?;
    table
        .game
        .act(seat, intent, &mut OsRng)
        .map_err(|err| match err {
            ocho_engine::StepError::Rejected(rejection) => {
                (id, rejection.code(), "That move is not legal.")
            }
            ocho_engine::StepError::Broken => (id, "INTERNAL", "The hand could not continue."),
        })?;
    Ok((id, None, true))
}

fn lobby_of<'a>(inner: &'a mut Inner, user: &str) -> Option<&'a mut Lobby> {
    let id = inner.seated.get(user)?.clone();
    inner.lobbies.get_mut(&id)
}

fn lobby_view(lobby: &Lobby) -> LobbyView {
    LobbyView {
        id: lobby.id.clone(),
        code: lobby.code.clone(),
        host: lobby.host.clone(),
        players: lobby.players,
        teams: lobby.teams,
        first_to_500: lobby.first_to_500,
        members: lobby
            .members
            .iter()
            .map(|member| MemberView {
                user: member.user.clone(),
                name: member.name.clone(),
                ready: member.ready,
            })
            .collect(),
        started: lobby.table.is_some(),
    }
}

fn sockets_for(
    inner: &Inner,
    lobby: Option<&LobbyView>,
) -> Vec<(String, mpsc::UnboundedSender<String>)> {
    let Some(lobby) = lobby else {
        return Vec::new();
    };
    lobby
        .members
        .iter()
        .filter_map(|member| {
            inner
                .sockets
                .get(&member.user)
                .map(|socket| (member.user.clone(), socket.tx.clone()))
        })
        .collect()
}

fn push_lobby(sockets: &[(String, mpsc::UnboundedSender<String>)], lobby: &LobbyView) {
    let msg = ServerMsg::Lobby {
        lobby: lobby.clone(),
    };
    let Some(text) = serde_json::to_string(&msg).ok() else {
        return;
    };
    for (_, tx) in sockets {
        let _ = tx.send(text.clone());
    }
}

/// SHA-256 of the cookie, the same bytes `sessions.token_hash` stores.
fn hash_token(token: &str) -> [u8; 32] {
    let digest = Sha256::digest(token.as_bytes());
    let mut hash = [0u8; 32];
    hash.copy_from_slice(&digest);
    hash
}

fn fresh_id() -> String {
    let mut bytes = [0u8; 16];
    rand::rng().fill(&mut bytes);
    let mut id = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        use std::fmt::Write as _;
        let _ = write!(id, "{byte:02x}");
    }
    id
}

fn fresh_code(used: &HashMap<String, String>) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    loop {
        let mut code = String::with_capacity(6);
        for _ in 0..6 {
            let index = usize::from(rand::random::<u8>()) % ALPHABET.len();
            code.push(char::from(ALPHABET[index]));
        }
        if !used.contains_key(&code) {
            return code;
        }
    }
}

// Views after a deal or a move are sent by a second pass so the lock is not held while writing.
impl Room {
    /// Push each seated player's view. Called from [`Room::handle`] after a successful start or move.
    async fn publish_views(&self, user: &str) {
        let snapshot = {
            let inner = self.inner.lock().await;
            let Some(lobby_id) = inner.seated.get(user) else {
                return;
            };
            let Some(lobby) = inner.lobbies.get(lobby_id) else {
                return;
            };
            let Some(table) = &lobby.table else {
                return;
            };
            let mut views = Vec::new();
            for (index, user_id) in table.seats.iter().enumerate() {
                let Ok(seat) = u8::try_from(index) else {
                    continue;
                };
                let Ok(view) = table.game.view(seat) else {
                    continue;
                };
                if let Some(socket) = inner.sockets.get(user_id) {
                    views.push((socket.tx.clone(), view));
                }
            }
            views
        };
        for (tx, view) in snapshot {
            if let Ok(text) = serde_json::to_string(&ServerMsg::View { view }) {
                let _ = tx.send(text);
            }
        }
    }
}

// `step` cannot call `publish_views` while it holds the lock. `handle` does, when the flag is set.
impl Room {
    async fn step_and_publish(&self, user: &User, msg: ClientMsg) {
        let views = {
            let mut inner = self.inner.lock().await;
            match dispatch(&mut inner, user, msg) {
                Ok((re, lobby, publish)) => {
                    let sockets = sockets_for(&inner, lobby.as_ref());
                    (re, lobby, sockets, publish, None)
                }
                Err((re, code, message)) => (
                    re,
                    None,
                    Vec::new(),
                    false,
                    Some(ServerMsg::err(re, code, message)),
                ),
            }
        };
        let (re, lobby, sockets, publish, err) = views;
        if let Some(err) = err {
            self.send(&user.id, &err).await;
            return;
        }
        self.send(&user.id, &ServerMsg::Ok { re }).await;
        if let Some(lobby) = lobby {
            push_lobby(&sockets, &lobby);
        }
        if publish {
            self.publish_views(&user.id).await;
        }
    }
}

fn dispatch(inner: &mut Inner, user: &User, msg: ClientMsg) -> Result<StepOk, StepErr> {
    match msg {
        ClientMsg::Hello { id } => Ok(hello(inner, &user.id, id)),
        ClientMsg::Create {
            id,
            players,
            teams,
            match_kind,
        } => create(
            inner,
            user,
            id,
            players,
            teams,
            matches!(match_kind, MatchKind::To500),
        ),
        ClientMsg::Join { id, code } => join(inner, user, id, &code),
        ClientMsg::Leave { id } => leave(inner, user, id),
        ClientMsg::Ready { id, ready } => set_ready(inner, user, id, ready),
        ClientMsg::Start { id } => start(inner, user, id),
        ClientMsg::Play { id, card, color } => act(
            inner,
            user,
            id,
            Intent::Play {
                card: ocho_engine::CardId::new(card),
                color,
            },
        ),
        ClientMsg::Draw { id } => act(inner, user, id, Intent::Draw),
        ClientMsg::Keep { id } => act(inner, user, id, Intent::Keep),
        ClientMsg::Opening { id, color } => act(inner, user, id, Intent::Choose { color }),
        ClientMsg::Next { id } => act(inner, user, id, Intent::Next),
    }
}

#[cfg(test)]
mod tests {
    use super::{Inner, Socket, Table, User, create, detach_socket, hello, leave};
    use ocho_engine::Game;
    use std::collections::HashMap;
    use tokio::sync::mpsc;

    fn empty() -> Inner {
        Inner {
            sockets: HashMap::new(),
            next_socket: 0,
            lobbies: HashMap::new(),
            codes: HashMap::new(),
            seated: HashMap::new(),
        }
    }

    fn user(id: &str) -> User {
        User {
            id: id.to_owned(),
            name: id.to_owned(),
        }
    }

    struct Seq(u32);
    impl ocho_engine::Rng for Seq {
        fn next_u32(&mut self) -> u32 {
            let value = self.0;
            self.0 = self.0.wrapping_add(1);
            value
        }
    }

    #[test]
    fn hello_repeats_a_lobby_that_has_not_dealt() {
        let mut inner = empty();
        create(&mut inner, &user("host"), 1, 2, false, false).expect("create");
        let (_id, lobby, views) = hello(&inner, "host", 2);
        assert!(lobby.is_some());
        assert!(!views);
    }

    #[test]
    fn an_old_socket_does_not_drop_the_new_one() {
        let mut inner = empty();
        let (older, _) = mpsc::unbounded_channel();
        let (newer, _) = mpsc::unbounded_channel();
        inner.sockets.insert(
            "host".to_owned(),
            Socket {
                tx: older,
                generation: 1,
            },
        );
        inner.sockets.insert(
            "host".to_owned(),
            Socket {
                tx: newer,
                generation: 2,
            },
        );
        detach_socket(&mut inner, "host", 1);
        assert!(inner.sockets.contains_key("host"));
        detach_socket(&mut inner, "host", 2);
        assert!(!inner.sockets.contains_key("host"));
    }

    #[test]
    fn leave_refuses_a_live_hand() {
        let mut inner = empty();
        let host = user("host");
        create(&mut inner, &host, 1, 2, false, false).expect("create");
        let lobby_id = inner.seated[&host.id].clone();
        inner.lobbies.get_mut(&lobby_id).expect("lobby").table = Some(Table {
            game: Game::create(2, false, true, &mut Seq(0)).expect("game"),
            seats: vec!["host".to_owned(), "other".to_owned()],
        });
        let err = leave(&mut inner, &host, 4);
        assert!(err.is_err());
        assert!(inner.seated.contains_key("host"));
    }
}
