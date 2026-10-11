//! Guest accounts. Tokens are stored as SHA-256 hashes.

use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use sha2::{Digest, Sha256};
use skt_protocol::{GameId, LobbyId, Stats, TableColor, UnixMs, User, UserId};

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

struct Account {
    user: User,
    guest: bool,
    username: Option<String>,
    stats: Stats,
    lobby: Option<LobbyId>,
    game: Option<GameId>,
}

/// A row loaded from Postgres.
#[derive(Clone)]
pub struct AccountSnap {
    /// The public player.
    pub user: User,
    /// No password yet.
    pub guest: bool,
    /// Login name, with its original case.
    pub username: Option<String>,
    /// Counters stored with the account.
    pub stats: Stats,
}

/// Users and session hashes.
pub struct Identity {
    accounts: HashMap<UserId, Account>,
    by_hash: HashMap<[u8; 32], UserId>,
    next_color: usize,
    next_conn: u64,
}

impl Identity {
    pub fn new() -> Self {
        Self {
            accounts: HashMap::new(),
            by_hash: HashMap::new(),
            next_color: 0,
            next_conn: 1,
        }
    }

    pub fn next_conn(&mut self) -> u64 {
        let id = self.next_conn;
        self.next_conn = self.next_conn.saturating_add(1);
        id
    }

    pub fn create_guest(&mut self) -> (String, UserId) {
        let id = UserId::new(uuid());
        let color = COLORS[self.next_color % COLORS.len()];
        self.next_color = self.next_color.saturating_add(1);
        let name = format!(
            "Sailor {}",
            &id.as_str()[id.as_str().len().saturating_sub(4)..]
        );
        let token = token();
        let hash = hash_token(&token);
        let user = User {
            id: id.clone(),
            name,
            color,
            tier: None,
        };
        self.by_hash.insert(hash, id.clone());
        self.accounts.insert(
            id.clone(),
            Account {
                user,
                guest: true,
                username: None,
                stats: empty_stats(),
                lobby: None,
                game: None,
            },
        );
        (token, id)
    }

    /// Remember a row loaded from Postgres. A player already at a table keeps that seat.
    pub fn import(&mut self, token: &str, snap: AccountSnap) {
        let hash = hash_token(token);
        let id = snap.user.id.clone();
        if let Some(account) = self.accounts.get_mut(&id) {
            account.user = snap.user;
            account.guest = snap.guest;
            account.username = snap.username;
            account.stats = snap.stats;
        } else {
            self.accounts.insert(
                id.clone(),
                Account {
                    user: snap.user,
                    guest: snap.guest,
                    username: snap.username,
                    stats: snap.stats,
                    lobby: None,
                    game: None,
                },
            );
        }
        self.by_hash.insert(hash, id);
    }

    pub fn guest_of(&self, id: &UserId) -> bool {
        self.accounts.get(id).is_none_or(|account| account.guest)
    }

    pub fn username_of(&self, id: &UserId) -> Option<String> {
        self.accounts
            .get(id)
            .and_then(|account| account.username.clone())
    }

    pub fn stats_of(&self, id: &UserId) -> Stats {
        self.accounts
            .get(id)
            .map_or_else(empty_stats, |account| account.stats)
    }

    /// Apply one finished game. The first total sets `best_score` even when it is negative.
    pub fn add_result(
        &mut self,
        id: &UserId,
        win: bool,
        bids_made: u32,
        bids_total: u32,
        total: i32,
    ) {
        if let Some(account) = self.accounts.get_mut(id) {
            account.stats.games = account.stats.games.saturating_add(1);
            if win {
                account.stats.wins = account.stats.wins.saturating_add(1);
            }
            account.stats.bids_made = account.stats.bids_made.saturating_add(bids_made);
            account.stats.bids_total = account.stats.bids_total.saturating_add(bids_total);
            account.stats.best_score = Some(match account.stats.best_score {
                None => total,
                Some(old) => old.max(total),
            });
        }
    }

    pub fn revoke(&mut self, token: &str) {
        self.by_hash.remove(&hash_token(token));
    }

    pub fn user_for_token(&self, token: &str) -> Option<UserId> {
        self.by_hash.get(&hash_token(token)).cloned()
    }

    pub fn public_user(&self, id: &UserId) -> User {
        self.accounts
            .get(id)
            .map(|account| account.user.clone())
            .unwrap_or(User {
                id: id.clone(),
                name: "Sailor".to_owned(),
                color: TableColor::Sky,
                tier: None,
            })
    }

    pub fn set_lobby(&mut self, id: &UserId, lobby: Option<LobbyId>) {
        if let Some(account) = self.accounts.get_mut(id) {
            account.lobby = lobby;
        }
    }

    pub fn set_game(&mut self, id: &UserId, game: Option<GameId>) {
        if let Some(account) = self.accounts.get_mut(id) {
            account.game = game;
        }
    }

    pub fn lobby_of(&self, id: &UserId) -> Option<LobbyId> {
        self.accounts
            .get(id)
            .and_then(|account| account.lobby.clone())
    }

    pub fn game_of(&self, id: &UserId) -> Option<GameId> {
        self.accounts
            .get(id)
            .and_then(|account| account.game.clone())
    }
}

fn empty_stats() -> Stats {
    Stats {
        games: 0,
        wins: 0,
        bids_made: 0,
        bids_total: 0,
        best_score: None,
    }
}

pub fn unix_now() -> UnixMs {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis());
    let narrowed = i64::try_from(millis).unwrap_or(i64::MAX);
    UnixMs::new(narrowed)
}

pub fn uuid() -> String {
    let mut bytes = [0u8; 16];
    rand::rng().fill(&mut bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0],
        bytes[1],
        bytes[2],
        bytes[3],
        bytes[4],
        bytes[5],
        bytes[6],
        bytes[7],
        bytes[8],
        bytes[9],
        bytes[10],
        bytes[11],
        bytes[12],
        bytes[13],
        bytes[14],
        bytes[15]
    )
}

pub fn token() -> String {
    let mut bytes = [0u8; 32];
    rand::rng().fill(&mut bytes);
    let mut text = String::with_capacity(64);
    for byte in bytes {
        const HEX: &[u8; 16] = b"0123456789abcdef";
        text.push(char::from(HEX[usize::from(byte >> 4)]));
        text.push(char::from(HEX[usize::from(byte & 0x0f)]));
    }
    text
}

pub fn hash_token(token: &str) -> [u8; 32] {
    let digest = Sha256::digest(token.as_bytes());
    let mut hash = [0u8; 32];
    hash.copy_from_slice(&digest);
    hash
}

use rand::Rng;
