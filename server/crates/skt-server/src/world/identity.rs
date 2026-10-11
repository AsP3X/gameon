//! Guest accounts. Tokens are stored as SHA-256 hashes.

use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use sha2::{Digest, Sha256};
use skt_protocol::{GameId, LobbyId, Rating, Stats, TableColor, UnixMs, User, UserId};

use crate::rating::{self, PlayerSkill, StoredSkill};

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
    /// Ranked skill, once a row or a leave penalty exists. Absent means unrated.
    skill: Option<StoredSkill>,
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
    /// Ranked skill, if a row or a penalty exists.
    pub skill: Option<StoredSkill>,
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
                skill: None,
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
        let now = unix_now().get();
        if let Some(account) = self.accounts.get_mut(&id) {
            account.user.name = snap.user.name;
            account.user.color = snap.user.color;
            account.guest = snap.guest;
            account.username = snap.username;
            account.stats = snap.stats;
            account.skill = merge_skill(account.skill, snap.skill, now);
            account.user.tier = tier_of(account.skill, now);
        } else {
            let skill = snap.skill;
            let mut user = snap.user;
            user.tier = tier_of(skill, now);
            self.accounts.insert(
                id.clone(),
                Account {
                    user,
                    guest: snap.guest,
                    username: snap.username,
                    stats: snap.stats,
                    skill,
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
        let now = unix_now().get();
        self.accounts.get(id).map_or_else(
            || User {
                id: id.clone(),
                name: "Sailor".to_owned(),
                color: TableColor::Sky,
                tier: None,
            },
            |account| {
                let mut user = account.user.clone();
                user.tier = tier_of(account.skill, now);
                user
            },
        )
    }

    /// Wire rating, or nothing when the account has not finished a ranked game.
    pub fn rating_of(&self, id: &UserId) -> Option<Rating> {
        let stored = self.accounts.get(id)?.skill?;
        let now = unix_now().get();
        let shown = rating::shown(stored, now);
        let season = rating::season_at(now).id;
        if shown.games == 0 && stored.season_id == season {
            return None;
        }
        Some(rating::to_rating(shown))
    }

    /// Ordinal used by the matchmaker. Unrated is 0, the prior.
    pub fn ordinal_of(&self, id: &UserId) -> i32 {
        let now = unix_now().get();
        self.accounts.get(id).map_or(0, |account| {
            account.skill.map_or(0, |stored| {
                let shown = rating::shown(stored, now);
                rating::ordinal(shown.mu, shown.sigma)
            })
        })
    }

    /// Skill at the start of a game, after a season reset. Unrated uses the prior.
    pub fn open_skill(&self, id: &UserId) -> (PlayerSkill, Option<String>) {
        let now = unix_now().get();
        let Some(stored) = self.accounts.get(id).and_then(|account| account.skill) else {
            return (rating::prior(), None);
        };
        let shown = rating::shown(stored, now);
        let tier = self.rating_of(id).map(|rating| rating.tier);
        (shown, tier)
    }

    /// Unix milliseconds when ranked opens, if the penalty is still running.
    pub fn cooldown_until(&self, id: &UserId) -> Option<i64> {
        let stored = self.accounts.get(id)?.skill?;
        rating::active_cooldown(stored.cooldown_until, unix_now().get())
    }

    /// Ranked leaves already taken this season.
    pub fn leaves_of(&self, id: &UserId) -> u32 {
        let now = unix_now().get();
        self.accounts.get(id).map_or(0, |account| {
            account
                .skill
                .map_or(0, |stored| rating::active_leaves(stored, now))
        })
    }

    /// Remember the skill written for a finished ranked game.
    pub fn set_rated(&mut self, id: &UserId, after: PlayerSkill, season: u32) {
        let Some(account) = self.accounts.get_mut(id) else {
            return;
        };
        let (leaves, leave_season, cooldown_until) =
            account.skill.map_or((0, season, None), |skill| {
                (skill.leaves, skill.leave_season, skill.cooldown_until)
            });
        account.skill = Some(StoredSkill {
            season_id: season,
            mu: after.mu,
            sigma: after.sigma,
            games: after.games,
            leaves,
            leave_season,
            cooldown_until,
        });
        account.user.tier =
            Some(rating::tier_name(rating::ordinal(after.mu, after.sigma)).to_owned());
    }

    /// Close ranked for this account. A first penalty does not invent a visible rating.
    pub fn note_penalty(&mut self, id: &UserId, leaves: u32, season: u32, until: i64) {
        let Some(account) = self.accounts.get_mut(id) else {
            return;
        };
        let base = account.skill.unwrap_or(StoredSkill {
            season_id: season,
            mu: rating::prior().mu,
            sigma: rating::prior().sigma,
            games: 0,
            leaves: 0,
            leave_season: season,
            cooldown_until: None,
        });
        account.skill = Some(StoredSkill {
            leaves,
            leave_season: season,
            cooldown_until: Some(until),
            ..base
        });
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

fn tier_of(skill: Option<StoredSkill>, now: i64) -> Option<String> {
    let stored = skill?;
    let shown = rating::shown(stored, now);
    let season = rating::season_at(now).id;
    if shown.games == 0 && stored.season_id == season {
        return None;
    }
    Some(rating::tier_name(rating::ordinal(shown.mu, shown.sigma)).to_owned())
}

fn merge_skill(
    memory: Option<StoredSkill>,
    db: Option<StoredSkill>,
    now: i64,
) -> Option<StoredSkill> {
    let season = rating::season_at(now).id;
    match (memory, db) {
        (None, db) => db,
        (memory, None) => memory,
        (Some(memory), Some(db)) => Some(prefer_skill(memory, db, season, now)),
    }
}

fn prefer_skill(memory: StoredSkill, db: StoredSkill, season: u32, now: i64) -> StoredSkill {
    let mut chosen = match (memory.season_id == season, db.season_id == season) {
        (true, false) => memory,
        (true, true) if memory.games > db.games => memory,
        _ => db,
    };
    let memory_leaves = if memory.leave_season == season {
        memory.leaves
    } else {
        0
    };
    let db_leaves = if db.leave_season == season {
        db.leaves
    } else {
        0
    };
    if memory_leaves.max(db_leaves) > 0 {
        chosen.leaves = memory_leaves.max(db_leaves);
        chosen.leave_season = season;
    }
    chosen.cooldown_until = rating::active_cooldown(memory.cooldown_until, now)
        .max(rating::active_cooldown(db.cooldown_until, now))
        .or(memory.cooldown_until)
        .or(db.cooldown_until);
    chosen
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
