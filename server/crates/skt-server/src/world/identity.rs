//! Guest accounts. Tokens are stored as SHA-256 hashes.

use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use sha2::{Digest, Sha256};
use skt_protocol::{GameId, LobbyId, TableColor, UnixMs, User, UserId};

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
    lobby: Option<LobbyId>,
    game: Option<GameId>,
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
                lobby: None,
                game: None,
            },
        );
        (token, id)
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

fn token() -> String {
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

fn hash_token(token: &str) -> [u8; 32] {
    let digest = Sha256::digest(token.as_bytes());
    let mut hash = [0u8; 32];
    hash.copy_from_slice(&digest);
    hash
}

use rand::Rng;
