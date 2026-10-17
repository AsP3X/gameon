//! Lobbies and the one table each lobby plays.
//!
//! Accounts stay on the API. This room only checks the session cookie against `sessions`.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use ocho_engine::{BotLevel, Color, Game, Intent, Must, Phase, PlayerView, Rng, choose};
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
    /// Next [`Lobby::opened`], so the public list can be oldest first.
    next_opened: u64,
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
    /// Listed for anyone looking for a game. A friends table is false.
    open: bool,
    /// When the table was opened. The public list sorts by this, oldest first.
    opened: u64,
    /// Set when the host asked for bots. Every other seat is one.
    bots: Option<BotLevel>,
    /// Hand number a bot is waiting to deal, so a second pause does not deal twice.
    bot_deal: Option<u32>,
    /// Bumps when a person acts, so a bot pause from an earlier play does not move.
    bot_seq: u64,
    members: Vec<Member>,
    table: Option<Table>,
}

struct Member {
    user: String,
    name: String,
    ready: bool,
    bot: Option<BotLevel>,
}

struct Table {
    game: Game,
    seats: Vec<String>,
    /// `None` is a person. The index is the seat.
    bots: Vec<Option<BotLevel>>,
}

/// How long a bot waits on the score before dealing the next hand.
const BOT_DEAL_PAUSE: Duration = Duration::from_secs(4);
/// How long a played card stays on the discard before a bot plays over it.
/// The flight onto the discard is 420ms (`FLIGHT` in `web/src/ocho/motion.ts`). The rest is time to read the card.
const BOT_PLAY_PAUSE: Duration = Duration::from_millis(1500);

/// What one delayed bot step should do after it looks at the table.
enum BotStep {
    /// Nobody for this pause to play.
    Stop,
    /// A bot has to deal. The between view is already published.
    Deal(u32),
    /// A bot played. Publish that card, then deal or wait for the next bot.
    Played { deal: Option<u32>, again: bool },
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
    /// Open a table. `open` lists it. Absent means a friends table.
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
        /// Fill every seat but the host with a bot of this level. Absent means people fill the seats.
        #[serde(default)]
        bots: Option<BotLevel>,
        /// List the table for anyone looking for a game. Absent means private.
        #[serde(default)]
        open: bool,
    },
    /// Join with a code.
    #[serde(rename = "ocho.join")]
    Join {
        /// Correlation id.
        id: u64,
        /// Six-character code.
        code: String,
    },
    /// The waiting public tables.
    #[serde(rename = "ocho.tables")]
    Tables {
        /// Correlation id.
        id: u64,
    },
    /// Sit at a public table by its lobby id. A private id is not a table.
    #[serde(rename = "ocho.joinOpen")]
    JoinOpen {
        /// Correlation id.
        id: u64,
        /// Lobby id from `ocho.tables`. Not a join code.
        lobby: String,
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
    /// Host seats one bot in the next open seat. Its level is the table's.
    #[serde(rename = "ocho.addBot")]
    AddBot {
        /// Correlation id.
        id: u64,
    },
    /// Host removes the bot at this index in `members`.
    #[serde(rename = "ocho.removeBot")]
    RemoveBot {
        /// Correlation id.
        id: u64,
        /// Index in the member list.
        index: u32,
    },
    /// Host sets the skill of every bot at the table.
    #[serde(rename = "ocho.bots")]
    SetBots {
        /// Correlation id.
        id: u64,
        /// `easy`, `normal`, or `hard`.
        bots: BotLevel,
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
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
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
    /// Waiting public tables, for the player who asked.
    #[serde(rename = "ocho.tables")]
    Tables {
        /// Oldest first. No join code, and no private table.
        tables: Vec<OpenTable>,
    },
}

/// One waiting public table. The join code is not here.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenTable {
    /// Lobby id. `ocho.joinOpen` sits here.
    pub id: String,
    /// The host's display name.
    pub host_name: String,
    /// Seats the table will deal.
    pub players: u8,
    /// Who has sat down, people and bots.
    pub seated: u8,
    /// 2v2.
    pub teams: bool,
    /// `one` or `to500`.
    #[serde(rename = "match")]
    pub match_kind: MatchKind,
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
    /// The bots' level, when the host filled the other seats with bots.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bots: Option<BotLevel>,
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
    /// This seat is a bot. A friends table sends false.
    pub bot: bool,
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
                next_opened: 0,
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
    pub async fn handle(self: &Arc<Self>, user: &User, msg: ClientMsg) {
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

struct StepOk {
    re: u64,
    lobby: Option<LobbyView>,
    /// Waiting public tables, when this command asked for them.
    tables: Option<Vec<OpenTable>>,
    publish: bool,
    /// A bot went out on this hand and should deal after [`BOT_DEAL_PAUSE`].
    bot_deal: Option<u32>,
    /// A bot's turn should be played after [`BOT_PLAY_PAUSE`], if this is still `Lobby::bot_seq`.
    bot_play: Option<u64>,
}

fn done(re: u64, lobby: Option<LobbyView>, publish: bool) -> StepOk {
    StepOk {
        re,
        lobby,
        tables: None,
        publish,
        bot_deal: None,
        bot_play: None,
    }
}

/// What `ocho.create` asked to open.
#[derive(Clone, Copy)]
struct NewTable {
    players: u8,
    teams: bool,
    match_kind: MatchKind,
    bots: Option<BotLevel>,
    open: bool,
}

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
        return done(id, None, false);
    };
    let Some(lobby) = inner.lobbies.get(lobby_id) else {
        return done(id, None, false);
    };
    let started = lobby.table.is_some();
    done(id, Some(lobby_view(lobby)), started)
}

fn create(inner: &mut Inner, user: &User, id: u64, table: NewTable) -> Result<StepOk, StepErr> {
    if inner.seated.contains_key(&user.id) {
        return Err((id, "ALREADY_SEATED", "You are already at a table."));
    }
    if !(2..=8).contains(&table.players) || (table.teams && table.players != 4) {
        return Err((
            id,
            "VALIDATION",
            "Ocho seats 2 to 8, and teams is four players.",
        ));
    }
    let lobby_id = fresh_id();
    let code = fresh_code(&inner.codes);
    let mut members = vec![Member {
        user: user.id.clone(),
        name: user.name.clone(),
        ready: false,
        bot: None,
    }];
    // Human: One person, and a bot in every other seat. Those seats are already ready.
    // Agent: WRITES members for seats 1..table.players. Does not insert bot ids into seated.
    if let Some(level) = table.bots {
        let mut names = vec![user.name.clone()];
        for seat in 1..table.players {
            let name = bot_name(&names);
            names.push(name.clone());
            members.push(Member {
                user: format!("bot-{lobby_id}-{seat}"),
                name,
                ready: true,
                bot: Some(level),
            });
        }
    }
    let opened = inner.next_opened;
    inner.next_opened = inner.next_opened.saturating_add(1);
    let lobby = Lobby {
        id: lobby_id.clone(),
        code: code.clone(),
        host: user.id.clone(),
        players: table.players,
        teams: table.teams,
        first_to_500: matches!(table.match_kind, MatchKind::To500),
        open: table.open,
        opened,
        bots: table.bots,
        bot_deal: None,
        bot_seq: 0,
        members,
        table: None,
    };
    inner.codes.insert(code, lobby_id.clone());
    inner.seated.insert(user.id.clone(), lobby_id.clone());
    let view = lobby_view(&lobby);
    inner.lobbies.insert(lobby_id, lobby);
    Ok(done(id, Some(view), false))
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
    sit(lobby, user);
    inner.seated.insert(user.id.clone(), lobby_id);
    let view = lobby_view(lobby);
    Ok(done(id, Some(view), false))
}

// Human: A public table can be sat by its id. A private id answers as if no such table exists, so the id does not confirm a friends table.
// Agent: READS lobbies.open, table, members; WRITES one member and seated; RETURNS NOT_FOUND for a private or missing id, LOBBY_FULL when dealt or full; never returns the code.
fn join_open(inner: &mut Inner, user: &User, id: u64, lobby_id: &str) -> Result<StepOk, StepErr> {
    if inner.seated.contains_key(&user.id) {
        return Err((id, "ALREADY_SEATED", "You are already at a table."));
    }
    let Some(lobby) = inner.lobbies.get_mut(lobby_id) else {
        return Err((id, "NOT_FOUND", "That table is gone."));
    };
    if !lobby.open {
        return Err((id, "NOT_FOUND", "That table is gone."));
    }
    if lobby.table.is_some() || lobby.members.len() >= usize::from(lobby.players) {
        return Err((id, "LOBBY_FULL", "That table is full."));
    }
    sit(lobby, user);
    inner.seated.insert(user.id.clone(), lobby_id.to_owned());
    let view = lobby_view(lobby);
    Ok(done(id, Some(view), false))
}

fn sit(lobby: &mut Lobby, user: &User) {
    lobby.members.push(Member {
        user: user.id.clone(),
        name: user.name.clone(),
        ready: false,
        bot: None,
    });
}

// Human: Anyone looking for a game sees waiting public tables, oldest first, including full ones. A friends table and every join code stay off this list. A dealt hand leaves it.
// Agent: READS lobbies.open, opened, table, members; RETURNS OpenTable without code; skips a lobby whose host member is gone.
fn listed(inner: &Inner) -> Vec<OpenTable> {
    let mut rows: Vec<&Lobby> = inner
        .lobbies
        .values()
        .filter(|lobby| lobby.open && lobby.table.is_none())
        .collect();
    rows.sort_by_key(|lobby| lobby.opened);
    rows.into_iter().filter_map(open_row).collect()
}

fn open_row(lobby: &Lobby) -> Option<OpenTable> {
    let host = lobby
        .members
        .iter()
        .find(|member| member.user == lobby.host)?;
    let seated = u8::try_from(lobby.members.len()).ok()?;
    Some(OpenTable {
        id: lobby.id.clone(),
        host_name: host.name.clone(),
        players: lobby.players,
        seated,
        teams: lobby.teams,
        match_kind: if lobby.first_to_500 {
            MatchKind::To500
        } else {
            MatchKind::One
        },
    })
}

fn list_open(inner: &Inner, id: u64) -> StepOk {
    StepOk {
        re: id,
        lobby: None,
        tables: Some(listed(inner)),
        publish: false,
        bot_deal: None,
        bot_play: None,
    }
}

fn leave(inner: &mut Inner, user: &User, id: u64) -> Result<StepOk, StepErr> {
    let Some(lobby_id) = inner.seated.remove(&user.id) else {
        return Err((id, "NOT_SEATED", "You are not at a table."));
    };
    let Some(lobby) = inner.lobbies.get_mut(&lobby_id) else {
        return Ok(done(id, None, false));
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
    let no_human = lobby.members.iter().all(|member| member.bot.is_some());
    let code = lobby.code.clone();
    if no_human {
        inner.lobbies.remove(&lobby_id);
        inner.codes.remove(&code);
        return Ok(done(id, None, false));
    }
    if let Some(lobby) = inner.lobbies.get_mut(&lobby_id)
        && lobby.host == user.id
        && let Some(next) = lobby.members.iter().find(|member| member.bot.is_none())
    {
        lobby.host = next.user.clone();
    }
    let view = inner.lobbies.get(&lobby_id).map(lobby_view);
    Ok(done(id, view, false))
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
    Ok(done(id, Some(view), false))
}

/// The open lobby this host is in, before the deal.
fn host_open<'a>(inner: &'a mut Inner, user: &User, id: u64) -> Result<&'a mut Lobby, StepErr> {
    let lobby = lobby_of(inner, &user.id).ok_or((id, "NOT_SEATED", "You are not at a table."))?;
    if lobby.host != user.id {
        return Err((id, "NOT_HOST", "Only the host can do that."));
    }
    if lobby.table.is_some() {
        return Err((id, "GAME_RUNNING", "The hand has already started."));
    }
    Ok(lobby)
}

fn add_bot(inner: &mut Inner, user: &User, id: u64) -> Result<StepOk, StepErr> {
    let lobby = host_open(inner, user, id)?;
    if lobby.members.len() >= usize::from(lobby.players) {
        return Err((id, "LOBBY_FULL", "That table is full."));
    }
    // Human: One skill for the whole table. The first bot makes that skill Normal until the host picks.
    // Agent: WRITES one ready Member with bot = lobby.bots. Does not insert the bot into seated.
    let level = lobby.bots.unwrap_or(BotLevel::Normal);
    lobby.bots = Some(level);
    let names: Vec<String> = lobby
        .members
        .iter()
        .map(|member| member.name.clone())
        .collect();
    let name = bot_name(&names);
    let user_id = next_bot_id(lobby);
    lobby.members.push(Member {
        user: user_id,
        name,
        ready: true,
        bot: Some(level),
    });
    let view = lobby_view(lobby);
    Ok(done(id, Some(view), false))
}

fn remove_bot(inner: &mut Inner, user: &User, id: u64, index: u32) -> Result<StepOk, StepErr> {
    let lobby = host_open(inner, user, id)?;
    let Some(index) = usize::try_from(index).ok() else {
        return Err((id, "VALIDATION", "That seat is not a bot."));
    };
    if lobby
        .members
        .get(index)
        .is_none_or(|member| member.bot.is_none())
    {
        return Err((id, "VALIDATION", "That seat is not a bot."));
    }
    lobby.members.remove(index);
    let view = lobby_view(lobby);
    Ok(done(id, Some(view), false))
}

fn set_bots(inner: &mut Inner, user: &User, id: u64, level: BotLevel) -> Result<StepOk, StepErr> {
    let lobby = host_open(inner, user, id)?;
    // Human: Changing the skill moves every bot already sitting, and the people ready again.
    // Agent: WRITES lobby.bots, every Member.bot, and human ready = false.
    lobby.bots = Some(level);
    for member in &mut lobby.members {
        if member.bot.is_some() {
            member.bot = Some(level);
        } else {
            member.ready = false;
        }
    }
    let view = lobby_view(lobby);
    Ok(done(id, Some(view), false))
}

fn next_bot_id(lobby: &Lobby) -> String {
    let mut n = 1u8;
    loop {
        let id = format!("bot-{}-{n}", lobby.id);
        if lobby.members.iter().all(|member| member.user != id) {
            return id;
        }
        n = n.saturating_add(1);
        if n == 0 {
            return format!("bot-{}-extra", lobby.id);
        }
    }
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
    let mut game = Game::create(lobby.players, lobby.teams, lobby.first_to_500, &mut OsRng)
        .map_err(|_| (id, "VALIDATION", "Those settings cannot be dealt."))?;
    let seats: Vec<String> = lobby
        .members
        .iter()
        .map(|member| member.user.clone())
        .collect();
    let bots: Vec<Option<BotLevel>> = lobby.members.iter().map(|member| member.bot).collect();
    let pause = bots_until_a_player(&mut game, &bots, &mut OsRng);
    lobby.bot_deal = pause;
    lobby.table = Some(Table { game, seats, bots });
    let view = lobby_view(lobby);
    let mut step = done(id, Some(view), true);
    step.bot_deal = pause;
    Ok(step)
}

fn act(inner: &mut Inner, user: &User, id: u64, intent: Intent) -> Result<StepOk, StepErr> {
    let lobby = lobby_of(inner, &user.id).ok_or((id, "NOT_SEATED", "You are not at a table."))?;
    let pause = {
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
        // Human: The card just played is the discard the table shows. Bots move only after that view has gone out.
        // Agent: WRITES game via act; READS the next seat; does not play a bot in this call.
        let deal = bot_must_deal(table);
        let play = deal.is_none() && bot_must_play(table);
        (deal, play)
    };
    let (deal, play) = pause;
    lobby.bot_deal = deal;
    lobby.bot_seq = lobby.bot_seq.wrapping_add(1);
    let mut step = done(id, None, true);
    step.bot_deal = deal;
    if play {
        step.bot_play = Some(lobby.bot_seq);
    }
    Ok(step)
}

/// A bot is the seat that must deal the next hand.
fn bot_must_deal(table: &Table) -> Option<u32> {
    let probe = table.game.view(0).ok()?;
    let view = table.game.view(probe.turn).ok()?;
    if view.must != Must::NextHand {
        return None;
    }
    table.bots.get(usize::from(probe.turn)).copied().flatten()?;
    Some(view.hand_no)
}

/// A bot has a turn to play. Dealing the next hand is not one of those turns.
fn bot_must_play(table: &Table) -> bool {
    let Ok(probe) = table.game.view(0) else {
        return false;
    };
    let Ok(view) = table.game.view(probe.turn) else {
        return false;
    };
    if view.must == Must::None || view.must == Must::NextHand {
        return false;
    }
    table
        .bots
        .get(usize::from(probe.turn))
        .copied()
        .flatten()
        .is_some()
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
        bots: lobby.bots,
        members: lobby
            .members
            .iter()
            .map(|member| MemberView {
                user: member.user.clone(),
                name: member.name.clone(),
                ready: member.ready,
                bot: member.bot.is_some(),
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
    async fn step_and_publish(self: &Arc<Self>, user: &User, msg: ClientMsg) {
        let views = {
            let mut inner = self.inner.lock().await;
            match dispatch(&mut inner, user, msg) {
                Ok(step) => {
                    let sockets = sockets_for(&inner, step.lobby.as_ref());
                    (
                        step.re,
                        step.lobby,
                        step.tables,
                        sockets,
                        step.publish,
                        step.bot_deal,
                        step.bot_play,
                        None,
                    )
                }
                Err((re, code, message)) => (
                    re,
                    None,
                    None,
                    Vec::new(),
                    false,
                    None,
                    None,
                    Some(ServerMsg::err(re, code, message)),
                ),
            }
        };
        let (re, lobby, tables, sockets, publish, bot_deal, bot_play, err) = views;
        if let Some(err) = err {
            self.send(&user.id, &err).await;
            return;
        }
        if let Some(tables) = tables {
            self.send(&user.id, &ServerMsg::Tables { tables }).await;
        }
        self.send(&user.id, &ServerMsg::Ok { re }).await;
        if let Some(lobby) = lobby {
            push_lobby(&sockets, &lobby);
        }
        if publish {
            self.publish_views(&user.id).await;
        }
        if let Some(hand_no) = bot_deal {
            self.schedule_bot_deal(&user.id, hand_no);
        }
        if let Some(seq) = bot_play {
            self.schedule_bot_play(&user.id, seq);
        }
    }

    fn schedule_bot_deal(self: &Arc<Self>, user_id: &str, hand_no: u32) {
        let room = Arc::clone(self);
        let user_id = user_id.to_owned();
        tokio::spawn(async move {
            tokio::time::sleep(BOT_DEAL_PAUSE).await;
            room.deal_for_bot(&user_id, hand_no).await;
        });
    }

    /// One bot plays after the card has flown to the discard and sat there long enough to read.
    fn schedule_bot_play(self: &Arc<Self>, user_id: &str, seq: u64) {
        let room = Arc::clone(self);
        let user_id = user_id.to_owned();
        tokio::spawn(async move {
            tokio::time::sleep(BOT_PLAY_PAUSE).await;
            room.play_one_bot(&user_id, seq).await;
        });
    }

    /// Play a single bot seat, publish that card, then wait again if another bot is next.
    async fn play_one_bot(self: &Arc<Self>, user_id: &str, seq: u64) {
        // Human: Bots take turns one card at a time, so a person's card stays on the discard before the next one.
        // Agent: READS bot_seq and one seat's PlayerView; WRITES one Intent; does not hold the lock across the pause.
        let step = {
            let mut inner = self.inner.lock().await;
            let Some(lobby_id) = inner.seated.get(user_id).cloned() else {
                return;
            };
            let Some(lobby) = inner.lobbies.get_mut(&lobby_id) else {
                return;
            };
            if lobby.bot_seq != seq {
                return;
            }
            let acted = {
                let Some(table) = lobby.table.as_mut() else {
                    return;
                };
                let Ok(probe) = table.game.view(0) else {
                    tracing::error!("ocho bot could not see the table");
                    return;
                };
                let Some(level) = table.bots.get(usize::from(probe.turn)).copied().flatten() else {
                    return;
                };
                let Ok(view) = table.game.view(probe.turn) else {
                    tracing::error!("ocho bot could not see its seat");
                    return;
                };
                if view.must == Must::NextHand {
                    BotStep::Deal(view.hand_no)
                } else if view.must == Must::None {
                    BotStep::Stop
                } else {
                    let Ok(intent) = choose(&view, level, &mut OsRng) else {
                        tracing::error!("ocho bot could not choose");
                        return;
                    };
                    if table.game.act(probe.turn, intent, &mut OsRng).is_err() {
                        tracing::error!("ocho bot could not move");
                        return;
                    }
                    let deal = bot_must_deal(table);
                    let again = deal.is_none() && bot_must_play(table);
                    BotStep::Played { deal, again }
                }
            };
            let hand_no = match &acted {
                BotStep::Deal(hand_no)
                | BotStep::Played {
                    deal: Some(hand_no),
                    ..
                } => Some(*hand_no),
                BotStep::Stop | BotStep::Played { deal: None, .. } => None,
            };
            if let Some(hand_no) = hand_no {
                lobby.bot_deal = Some(hand_no);
            }
            acted
        };
        match step {
            BotStep::Stop => {}
            BotStep::Deal(hand_no) => self.schedule_bot_deal(user_id, hand_no),
            BotStep::Played { deal, again } => {
                self.publish_views(user_id).await;
                if let Some(hand_no) = deal {
                    self.schedule_bot_deal(user_id, hand_no);
                } else if again {
                    self.schedule_bot_play(user_id, seq);
                }
            }
        }
    }

    /// Deal the next hand for a bot who went out, then play bots up to a person.
    async fn deal_for_bot(self: &Arc<Self>, user_id: &str, hand_no: u32) {
        // Human: The score stays up briefly. Then the bot deals, and bots play until a person must act.
        // Agent: READS bot_deal and the per-seat view; WRITES the next hand; does not hold the lock across the pause.
        let next = {
            let mut inner = self.inner.lock().await;
            let Some(lobby_id) = inner.seated.get(user_id).cloned() else {
                return;
            };
            let Some(lobby) = inner.lobbies.get_mut(&lobby_id) else {
                return;
            };
            if lobby.bot_deal != Some(hand_no) {
                return;
            }
            let dealt = (|| {
                let table = lobby.table.as_mut()?;
                let probe = table.game.view(0).ok()?;
                if probe.phase != Phase::Between || probe.hand_no != hand_no {
                    return None;
                }
                let turn = probe.turn;
                table.bots.get(usize::from(turn)).copied().flatten()?;
                table.game.act(turn, Intent::Next, &mut OsRng).ok()?;
                Some(bots_until_a_player(
                    &mut table.game,
                    &table.bots,
                    &mut OsRng,
                ))
            })();
            let Some(pause) = dealt else {
                tracing::error!("ocho bot could not deal");
                lobby.bot_deal = None;
                return;
            };
            lobby.bot_deal = pause;
            pause
        };
        self.publish_views(user_id).await;
        if let Some(hand_no) = next {
            self.schedule_bot_deal(user_id, hand_no);
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
            bots,
            open,
        } => create(
            inner,
            user,
            id,
            NewTable {
                players,
                teams,
                match_kind,
                bots,
                open,
            },
        ),
        ClientMsg::Join { id, code } => join(inner, user, id, &code),
        ClientMsg::Tables { id } => Ok(list_open(inner, id)),
        ClientMsg::JoinOpen { id, lobby } => join_open(inner, user, id, &lobby),
        ClientMsg::Leave { id } => leave(inner, user, id),
        ClientMsg::Ready { id, ready } => set_ready(inner, user, id, ready),
        ClientMsg::Start { id } => start(inner, user, id),
        ClientMsg::AddBot { id } => add_bot(inner, user, id),
        ClientMsg::RemoveBot { id, index } => remove_bot(inner, user, id, index),
        ClientMsg::SetBots { id, bots } => set_bots(inner, user, id, bots),
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

/// Play bot seats until a person must act, or a bot has to deal the next hand.
fn bots_until_a_player(
    game: &mut Game,
    bots: &[Option<BotLevel>],
    rng: &mut impl Rng,
) -> Option<u32> {
    // Human: Bots play through their turns. A bot who went out leaves the score up instead of dealing at once.
    // Agent: READS one seat's PlayerView; CALLS choose and Game::act; never reads another seat's hand. RETURNS that hand number, or None.
    for _ in 0..1_024 {
        if game.is_over() {
            return None;
        }
        let Ok(probe) = game.view(0) else {
            tracing::error!("ocho bot could not see the table");
            return None;
        };
        let level = bots.get(usize::from(probe.turn)).copied().flatten()?;
        let Ok(view) = game.view(probe.turn) else {
            tracing::error!("ocho bot could not see its seat");
            return None;
        };
        if view.must == Must::None {
            return None;
        }
        if view.must == Must::NextHand {
            return Some(view.hand_no);
        }
        let Ok(intent) = choose(&view, level, rng) else {
            tracing::error!("ocho bot could not choose");
            return None;
        };
        if game.act(probe.turn, intent, rng).is_err() {
            tracing::error!("ocho bot could not move");
            return None;
        }
    }
    tracing::error!("ocho bots did not reach a player");
    None
}

fn bot_name(used: &[String]) -> String {
    const NAMES: [&str; 8] = ["Nico", "Luz", "Sol", "Noor", "Jules", "Rio", "Quinn", "Ada"];
    NAMES
        .into_iter()
        .find(|name| !used.iter().any(|taken| taken == *name))
        .map_or_else(|| format!("Bot {}", used.len()), str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::{
        ClientMsg, Inner, MatchKind, NewTable, ServerMsg, Socket, Table, User, act, add_bot,
        bots_until_a_player, create, detach_socket, hello, join, join_open, leave, list_open,
        remove_bot, set_bots, set_ready, start,
    };
    use ocho_engine::{BotLevel, Color, Game, Intent, Kind, Must, Phase};
    use std::collections::HashMap;
    use tokio::sync::mpsc;

    fn empty() -> Inner {
        Inner {
            sockets: HashMap::new(),
            next_socket: 0,
            next_opened: 0,
            lobbies: HashMap::new(),
            codes: HashMap::new(),
            seated: HashMap::new(),
        }
    }

    fn closed(players: u8, bots: Option<BotLevel>) -> NewTable {
        NewTable {
            players,
            teams: false,
            match_kind: MatchKind::One,
            bots,
            open: false,
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
        create(&mut inner, &user("host"), 1, closed(2, None)).expect("create");
        let step = hello(&inner, "host", 2);
        assert!(step.lobby.is_some());
        assert!(!step.publish);
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
        create(&mut inner, &host, 1, closed(2, None)).expect("create");
        let lobby_id = inner.seated[&host.id].clone();
        inner.lobbies.get_mut(&lobby_id).expect("lobby").table = Some(Table {
            game: Game::create(2, false, true, &mut Seq(0)).expect("game"),
            seats: vec!["host".to_owned(), "other".to_owned()],
            bots: vec![None, None],
        });
        let err = leave(&mut inner, &host, 4);
        assert!(err.is_err());
        assert!(inner.seated.contains_key("host"));
    }

    #[test]
    fn bots_fill_every_other_seat_and_play_up_to_the_host() {
        let mut inner = empty();
        let host = user("host");
        let step = create(
            &mut inner,
            &host,
            1,
            NewTable {
                players: 4,
                teams: true,
                match_kind: MatchKind::To500,
                bots: Some(BotLevel::Hard),
                open: false,
            },
        )
        .expect("create");
        let lobby = step.lobby.expect("lobby");
        assert_eq!(lobby.bots, Some(BotLevel::Hard));
        assert_eq!(lobby.members.len(), 4);
        assert!(!lobby.members[0].bot);
        assert!(lobby.members[1].bot && lobby.members[1].ready);
        assert_ne!(lobby.members[2].name, lobby.members[3].name);
        let err = join(&mut inner, &user("guest"), 2, &lobby.code);
        assert!(err.is_err());
        set_ready(&mut inner, &host, 3, true).expect("ready");
        let started = start(&mut inner, &host, 4).expect("start");
        assert!(started.publish);
        let lobby_id = inner.seated[&host.id].clone();
        let table = inner.lobbies[&lobby_id].table.as_ref().expect("table");
        let view = table.game.view(0).expect("view");
        match view.phase {
            Phase::Between | Phase::Over => {}
            Phase::ChooseColor | Phase::Turn | Phase::Drawn => {
                assert!(table.bots[usize::from(view.turn)].is_none());
            }
        }
        assert!(view.partner_hand.is_some());
    }

    #[test]
    fn leaving_a_bot_table_drops_it_when_no_person_remains() {
        let mut inner = empty();
        let host = user("host");
        create(&mut inner, &host, 1, closed(3, Some(BotLevel::Easy))).expect("create");
        leave(&mut inner, &host, 2).expect("leave");
        assert!(inner.seated.is_empty());
        assert!(inner.lobbies.is_empty());
    }

    #[test]
    fn the_host_adds_and_removes_bots_and_sets_their_skill() {
        let mut inner = empty();
        let host = user("host");
        let step = create(&mut inner, &host, 1, closed(4, None)).expect("create");
        let lobby = step.lobby.expect("lobby");
        assert_eq!(lobby.members.len(), 1);
        assert!(lobby.bots.is_none());
        let seated = add_bot(&mut inner, &host, 2).expect("add");
        let lobby = seated.lobby.expect("lobby");
        assert_eq!(lobby.bots, Some(BotLevel::Normal));
        assert!(lobby.members[1].bot && lobby.members[1].ready);
        assert_eq!(lobby.members[1].name, "Nico");
        add_bot(&mut inner, &host, 3).expect("second");
        let err = add_bot(&mut inner, &user("guest"), 4);
        assert!(err.is_err());
        let skilled = set_bots(&mut inner, &host, 5, BotLevel::Hard).expect("skill");
        let lobby = skilled.lobby.expect("lobby");
        assert_eq!(lobby.bots, Some(BotLevel::Hard));
        assert!(lobby.members.iter().skip(1).all(|member| member.bot));
        assert!(!lobby.members[0].ready);
        let stored = inner.seated[&host.id].clone();
        assert!(
            inner.lobbies[&stored]
                .members
                .iter()
                .skip(1)
                .all(|member| member.bot == Some(BotLevel::Hard))
        );
        remove_bot(&mut inner, &host, 6, 1).expect("remove");
        let lobby_id = inner.seated[&host.id].clone();
        let lobby = &inner.lobbies[&lobby_id];
        assert_eq!(lobby.members.len(), 2);
        let err = remove_bot(&mut inner, &host, 7, 0);
        assert!(err.is_err());
        add_bot(&mut inner, &host, 8).expect("fill");
        add_bot(&mut inner, &host, 9).expect("full");
        let err = add_bot(&mut inner, &host, 10);
        assert!(err.is_err());
    }

    #[test]
    fn a_play_stays_on_the_discard_until_the_bot_is_due() {
        let mut inner = empty();
        let host = user("host");
        create(&mut inner, &host, 1, closed(2, Some(BotLevel::Easy))).expect("create");
        let lobby_id = inner.seated[&host.id].clone();
        let bots = vec![None, Some(BotLevel::Easy)];
        let mut dealt = None;
        for seed in 0..40 {
            let mut game = Game::create(2, false, false, &mut Seq(seed)).expect("game");
            let _ = bots_until_a_player(&mut game, &bots, &mut Seq(seed.wrapping_add(9)));
            let mut view = game.view(0).expect("view");
            if view.must == Must::ChooseColor {
                game.act(0, Intent::Choose { color: Color::Red }, &mut Seq(3))
                    .expect("color");
                view = game.view(0).expect("view");
            }
            let Some(card) = view
                .hand
                .iter()
                .find(|card| view.legal.contains(&card.id) && matches!(card.kind, Kind::Number(_)))
            else {
                continue;
            };
            dealt = Some((game, card.id, view.counts[1]));
            break;
        }
        let (game, card, bot_cards) = dealt.expect("a seeded deal with a number to play");
        inner.lobbies.get_mut(&lobby_id).expect("lobby").table = Some(Table {
            game,
            seats: vec![host.id.clone(), "bot".to_owned()],
            bots,
        });
        let step = act(&mut inner, &host, 2, Intent::Play { card, color: None }).expect("play");
        assert!(step.publish);
        assert!(step.bot_play.is_some());
        assert!(step.bot_deal.is_none());
        let after = inner.lobbies[&lobby_id]
            .table
            .as_ref()
            .expect("table")
            .game
            .view(0)
            .expect("view");
        assert_eq!(after.top.id, card);
        assert_eq!(after.counts[1], bot_cards);
    }

    #[test]
    fn bots_stop_on_the_human_for_a_pair_and_for_eight() {
        for players in [2u8, 8] {
            let mut game = Game::create(players, false, false, &mut Seq(4)).expect("game");
            let bots: Vec<Option<BotLevel>> = (0..players)
                .map(|seat| (seat > 0).then_some(BotLevel::Normal))
                .collect();
            let pause = bots_until_a_player(&mut game, &bots, &mut Seq(8));
            let view = game.view(0).expect("view");
            if pause.is_some() {
                assert_eq!(view.phase, Phase::Between);
            } else if view.phase != Phase::Over {
                assert_eq!(view.turn, 0);
            }
        }
    }

    #[test]
    fn create_without_open_stays_private() {
        let msg: ClientMsg = serde_json::from_str(
            r#"{"t":"ocho.create","id":1,"players":4,"teams":false,"match":"one"}"#,
        )
        .expect("parse");
        let ClientMsg::Create { open, .. } = msg else {
            panic!("create");
        };
        assert!(!open);
        let mut inner = empty();
        create(&mut inner, &user("host"), 1, closed(4, None)).expect("create");
        let step = list_open(&inner, 2);
        assert_eq!(step.tables.expect("tables").len(), 0);
    }

    #[test]
    fn a_public_table_is_listed_without_its_code_and_can_be_sat() {
        let mut inner = empty();
        let first = create(
            &mut inner,
            &user("Anne"),
            1,
            NewTable {
                players: 4,
                teams: false,
                match_kind: MatchKind::One,
                bots: None,
                open: true,
            },
        )
        .expect("create");
        let private = create(&mut inner, &user("friend"), 2, closed(2, None)).expect("private");
        let second = create(
            &mut inner,
            &user("later"),
            3,
            NewTable {
                players: 4,
                teams: true,
                match_kind: MatchKind::To500,
                bots: None,
                open: true,
            },
        )
        .expect("second");
        let rows = list_open(&inner, 4).tables.expect("tables");
        let anne = first.lobby.expect("lobby").id;
        let later = second.lobby.expect("lobby").id;
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].id, anne);
        assert_eq!(rows[0].host_name, "Anne");
        assert_eq!(rows[0].players, 4);
        assert_eq!(rows[0].seated, 1);
        assert!(!rows[0].teams);
        assert_eq!(rows[0].match_kind, MatchKind::One);
        assert_eq!(rows[1].id, later);
        assert!(rows[1].teams);
        assert_eq!(rows[1].match_kind, MatchKind::To500);
        let secret = private.lobby.expect("private").code;
        let text = serde_json::to_string(&ServerMsg::Tables { tables: rows }).expect("json");
        assert!(text.contains("\"t\":\"ocho.tables\""));
        assert!(!text.contains("\"code\""));
        assert!(!text.contains(&secret));
        let hidden = inner.codes[&secret].clone();
        let err = join_open(&mut inner, &user("guest"), 5, &hidden);
        assert!(matches!(err, Err((_, "NOT_FOUND", _))));
        assert!(!inner.seated.contains_key("guest"));
        let err = join_open(&mut inner, &user("guest"), 6, "missing");
        assert!(matches!(err, Err((_, "NOT_FOUND", _))));
        let sat = join_open(&mut inner, &user("guest"), 7, &anne).expect("sit");
        let lobby = sat.lobby.expect("lobby");
        assert_eq!(lobby.members.len(), 2);
        assert!(join(&mut inner, &user("bycode"), 8, &lobby.code).is_ok());
        for (n, name) in ["p1", "p2", "p3"].into_iter().enumerate() {
            join_open(
                &mut inner,
                &user(name),
                20 + u64::try_from(n).expect("seat"),
                &later,
            )
            .expect("fill");
        }
        let err = join_open(&mut inner, &user("extra"), 30, &later);
        assert!(matches!(err, Err((_, "LOBBY_FULL", _))));
        inner.lobbies.get_mut(&anne).expect("row").table = Some(Table {
            game: Game::create(4, false, false, &mut Seq(1)).expect("game"),
            seats: vec!["Anne".to_owned()],
            bots: vec![None],
        });
        let waiting = list_open(&inner, 31).tables.expect("tables");
        assert!(waiting.iter().all(|row| row.id != anne));
        assert!(waiting.iter().any(|row| row.id == later && row.seated == 4));
    }
}
