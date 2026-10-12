//! Accounts, session hashes, and the stats written when a game ends.
//!
//! The pool is used outside the world lock. A password is hashed on a blocking thread and is
//! never logged.

use argon2::Argon2;
use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use skt_protocol::{Stats, TableColor, User, UserId};
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;

use crate::rating::StoredSkill;
use crate::world::GameReport;
use crate::world::identity::{self, AccountSnap, hash_token};

/// Why a write did not happen. The HTTP layer maps this to [`crate::AppError`].
#[derive(Debug)]
pub enum StoreFailure {
    /// The database could not complete the statement.
    Database,
    /// The username belongs to someone else.
    UsernameTaken,
    /// No user has that username, or the password does not match.
    InvalidCredentials,
    /// The session is missing or expired.
    Unauthenticated,
    /// The user id is not in the table.
    NotFound,
    /// That session already has a password.
    AlreadyRegistered,
}

/// One game still in progress, with every stored step.
pub struct SavedGame {
    /// Game id.
    pub id: String,
    /// `custom`, `casual`, or `ranked`.
    pub mode: String,
    /// Quick play and ranked have no lobby.
    pub matchmade: bool,
    /// `GameSettings` as JSON.
    pub settings: String,
    /// Seats as JSON.
    pub seats: String,
    /// `solo`, or nothing.
    pub table_kind: Option<String>,
    /// `seq`, kind, seat, body.
    pub log: Vec<(i32, String, Option<i32>, String)>,
}

/// New steps to append for a game that is still running.
pub struct OpenWrite {
    /// Game id.
    pub id: String,
    /// `custom`, `casual`, or `ranked`.
    pub mode: String,
    /// Quick play and ranked have no lobby.
    pub matchmade: bool,
    /// `GameSettings` as JSON.
    pub settings: String,
    /// Seats as JSON.
    pub seats: String,
    /// `solo`, or nothing. A restart uses this to keep the table paused.
    pub table_kind: Option<String>,
    /// New rows only. `seq` is the position in the whole log.
    pub entries: Vec<(i32, String, Option<i32>, String)>,
}

/// Postgres for accounts and results.
#[derive(Clone)]
pub struct Store {
    pool: PgPool,
}

impl Store {
    /// Connect and apply every migration from an empty database upward.
    ///
    /// # Errors
    ///
    /// The database is unreachable or a migration fails.
    /// # Errors
    ///
    /// The database is unreachable or a migration fails.
    pub async fn connect(url: &str) -> Result<Self, String> {
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .connect(url)
            .await
            .map_err(|err| err.to_string())?;
        sqlx::migrate!("../../migrations/postgres")
            .run(&pool)
            .await
            .map_err(|err| err.to_string())?;
        Ok(Self { pool })
    }

    /// A pool that has already been migrated, for tests.
    #[must_use]
    pub fn from_pool(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Insert a guest and a 30-day session.
    ///
    /// # Errors
    ///
    /// The insert failed.
    pub async fn create_guest(&self) -> Result<(String, AccountSnap), StoreFailure> {
        let id = UserId::new(identity::uuid());
        let color = next_color(&self.pool).await?;
        let name = format!(
            "Sailor {}",
            &id.as_str()[id.as_str().len().saturating_sub(4)..]
        );
        let token = identity::token();
        let hash = hash_token(&token);
        let snap = AccountSnap {
            user: User {
                id: id.clone(),
                name: name.clone(),
                color,
                tier: None,
            },
            guest: true,
            username: None,
            stats: zero_stats(),
            skill: None,
        };
        let mut tx = self.pool.begin().await.map_err(|err| database(&err))?;
        sqlx::query(
            "INSERT INTO users (id, name, color, guest, username, password_hash) VALUES ($1, $2, $3, TRUE, NULL, NULL)",
        )
        .bind(id.as_str())
        .bind(&name)
        .bind(color_name(color))
        .execute(connection(&mut tx))
        .await
        .map_err(|err| database(&err))?;
        sqlx::query("INSERT INTO stats (user_id) VALUES ($1)")
            .bind(id.as_str())
            .execute(connection(&mut tx))
            .await
            .map_err(|err| database(&err))?;
        insert_session(&mut tx, &hash, id.as_str()).await?;
        tx.commit().await.map_err(|err| database(&err))?;
        Ok((token, snap))
    }

    /// The account for a live session. Using it slides the 30-day expiry.
    ///
    /// # Errors
    ///
    /// The session is unknown or the read failed.
    pub async fn load_session(&self, token: &str) -> Result<AccountSnap, StoreFailure> {
        let hash = hash_token(token);
        let user_id: Option<String> = sqlx::query_scalar(
            "UPDATE sessions SET last_used = now(), expires_at = now() + interval '30 days' WHERE token_hash = $1 AND expires_at > now() RETURNING user_id",
        )
        .bind(hash.as_slice())
        .fetch_optional(&self.pool)
        .await
        .map_err(|err| database(&err))?;
        let Some(user_id) = user_id else {
            return Err(StoreFailure::Unauthenticated);
        };
        self.snap_of(&user_id).await
    }

    /// Upgrade a guest. The session token does not change.
    ///
    /// # Errors
    ///
    /// The session is not a guest, the username is taken, or the write failed.
    pub async fn register(
        &self,
        token: &str,
        username: &str,
        password: &str,
    ) -> Result<AccountSnap, StoreFailure> {
        let snap = self.load_session(token).await?;
        if !snap.guest {
            return Err(StoreFailure::AlreadyRegistered);
        }
        let hash = hash_password(password.to_owned()).await?;
        let updated = sqlx::query(
            "UPDATE users SET guest = FALSE, username = $1, password_hash = $2 WHERE id = $3 AND guest = TRUE AND NOT EXISTS (SELECT 1 FROM users other WHERE lower(other.username) = lower($1) AND other.id <> $3)",
        )
        .bind(username)
        .bind(&hash)
        .bind(snap.user.id.as_str())
        .execute(&self.pool)
        .await
        .map_err(|err| {
            if let sqlx::Error::Database(db) = &err
                && db.code().as_deref() == Some("23505")
            {
                return StoreFailure::UsernameTaken;
            }
            database(&err)
        })?;
        if updated.rows_affected() == 0 {
            let again = self.snap_of(snap.user.id.as_str()).await?;
            if !again.guest {
                return Err(StoreFailure::AlreadyRegistered);
            }
            return Err(StoreFailure::UsernameTaken);
        }
        self.snap_of(snap.user.id.as_str()).await
    }

    /// Check a password and open a new session.
    ///
    /// # Errors
    ///
    /// The username or password is wrong, or the write failed.
    pub async fn login(
        &self,
        username: &str,
        password: &str,
    ) -> Result<(String, AccountSnap), StoreFailure> {
        let row: Option<(String, Option<String>)> =
            sqlx::query_as("SELECT id, password_hash FROM users WHERE lower(username) = lower($1)")
                .bind(username)
                .fetch_optional(&self.pool)
                .await
                .map_err(|err| database(&err))?;
        let (user_id, stored) = row.unwrap_or_else(|| (String::new(), None));
        let matches = verify_password(password.to_owned(), stored).await?;
        if user_id.is_empty() || !matches {
            return Err(StoreFailure::InvalidCredentials);
        }
        let token = identity::token();
        let hash = hash_token(&token);
        let mut tx = self.pool.begin().await.map_err(|err| database(&err))?;
        insert_session(&mut tx, &hash, &user_id).await?;
        tx.commit().await.map_err(|err| database(&err))?;
        let snap = self.snap_of(&user_id).await?;
        Ok((token, snap))
    }

    /// Delete one session.
    ///
    /// # Errors
    ///
    /// The session is unknown or the delete failed.
    pub async fn logout(&self, token: &str) -> Result<UserId, StoreFailure> {
        let hash = hash_token(token);
        let user_id: Option<String> =
            sqlx::query_scalar("DELETE FROM sessions WHERE token_hash = $1 RETURNING user_id")
                .bind(hash.as_slice())
                .fetch_optional(&self.pool)
                .await
                .map_err(|err| database(&err))?;
        let Some(user_id) = user_id else {
            return Err(StoreFailure::Unauthenticated);
        };
        Ok(UserId::new(user_id))
    }

    /// Delete every session for a user except `keep`, when a login replaces another browser.
    ///
    /// # Errors
    ///
    /// The delete failed.
    pub async fn revoke_token(&self, token: &str) -> Result<(), StoreFailure> {
        let hash = hash_token(token);
        sqlx::query("DELETE FROM sessions WHERE token_hash = $1")
            .bind(hash.as_slice())
            .execute(&self.pool)
            .await
            .map_err(|err| database(&err))?;
        Ok(())
    }

    /// Change the display name, the colour, or both.
    ///
    /// # Errors
    ///
    /// The session is unknown or the write failed.
    pub async fn patch(
        &self,
        token: &str,
        name: Option<&str>,
        color: Option<TableColor>,
    ) -> Result<AccountSnap, StoreFailure> {
        let snap = self.load_session(token).await?;
        let name = name.unwrap_or(snap.user.name.as_str());
        let color = color.unwrap_or(snap.user.color);
        sqlx::query("UPDATE users SET name = $1, color = $2 WHERE id = $3")
            .bind(name)
            .bind(color_name(color))
            .bind(snap.user.id.as_str())
            .execute(&self.pool)
            .await
            .map_err(|err| database(&err))?;
        self.snap_of(snap.user.id.as_str()).await
    }

    /// A public profile. No username and no session.
    ///
    /// # Errors
    ///
    /// The id is unknown or the read failed.
    pub async fn profile(&self, id: &str) -> Result<AccountSnap, StoreFailure> {
        self.snap_of(id).await
    }

    /// Write the result, and each human's counters unless the game is ranked.
    ///
    /// # Errors
    ///
    /// The transaction failed.
    pub async fn record(&self, game: &GameReport) -> Result<(), StoreFailure> {
        let mut tx = self.pool.begin().await.map_err(|err| database(&err))?;
        sqlx::query("DELETE FROM open_games WHERE id = $1")
            .bind(&game.id)
            .execute(connection(&mut tx))
            .await
            .map_err(|err| database(&err))?;
        sqlx::query("INSERT INTO games (id, mode, table_kind) VALUES ($1, $2, $3)")
            .bind(&game.id)
            .bind(game.mode)
            .bind(game.table_kind)
            .execute(connection(&mut tx))
            .await
            .map_err(|err| database(&err))?;
        for (seq, entry) in game.log.iter().enumerate() {
            sqlx::query(
                "INSERT INTO action_log (game_id, seq, kind, seat, body) VALUES ($1, $2, $3, $4, $5)",
            )
            .bind(&game.id)
            .bind(i32::try_from(seq).unwrap_or(i32::MAX))
            .bind(entry.kind)
            .bind(entry.seat.map(i32::from))
            .bind(&entry.body)
            .execute(connection(&mut tx))
            .await
            .map_err(|err| database(&err))?;
        }
        // Human: Profile counters are custom and casual only. Ranked writes skill, not those counters.
        // Agent: DB INSERT games and game_seats; UPDATE stats only when mode is not ranked; UPSERT ratings for ranked.
        if game.mode == "ranked" {
            for rated in &game.rated {
                sqlx::query(
                    "INSERT INTO game_seats (game_id, user_id, seat, total, place) VALUES ($1, $2, $3, $4, $5)",
                )
                .bind(&game.id)
                .bind(rated.user.as_str())
                .bind(i32::from(rated.seat))
                .bind(rated.total)
                .bind(i32::try_from(rated.place).unwrap_or(i32::MAX))
                .execute(connection(&mut tx))
                .await
                .map_err(|err| database(&err))?;
                let season = i32::try_from(crate::rating::season_at(identity::unix_now().get()).id)
                    .unwrap_or(i32::MAX);
                sqlx::query(
                    "INSERT INTO ratings (user_id, season_id, mu, sigma, games) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id) DO UPDATE SET season_id = EXCLUDED.season_id, mu = EXCLUDED.mu, sigma = EXCLUDED.sigma, games = EXCLUDED.games",
                )
                .bind(rated.user.as_str())
                .bind(season)
                .bind(rated.after.mu)
                .bind(rated.after.sigma)
                .bind(i32::try_from(rated.after.games).unwrap_or(i32::MAX))
                .execute(connection(&mut tx))
                .await
                .map_err(|err| database(&err))?;
            }
        }
        if game.mode != "ranked" {
            for seat in &game.seats {
                sqlx::query(
                    "INSERT INTO game_seats (game_id, user_id, seat, total, place) VALUES ($1, $2, $3, $4, $5)",
                )
                .bind(&game.id)
                .bind(seat.user.as_str())
                .bind(i32::from(seat.seat))
                .bind(seat.total)
                .bind(i32::try_from(seat.place).unwrap_or(i32::MAX))
                .execute(connection(&mut tx))
                .await
                .map_err(|err| database(&err))?;
                sqlx::query(
                    "UPDATE stats SET games = games + 1, wins = wins + $2, bids_made = bids_made + $3, bids_total = bids_total + $4, best_score = CASE WHEN best_score IS NULL THEN $5 ELSE GREATEST(best_score, $5) END WHERE user_id = $1",
                )
                .bind(seat.user.as_str())
                .bind(i32::from(u8::from(seat.win)))
                .bind(i32::try_from(seat.bids_made).unwrap_or(i32::MAX))
                .bind(i32::try_from(seat.bids_total).unwrap_or(i32::MAX))
                .bind(seat.total)
                .execute(connection(&mut tx))
                .await
                .map_err(|err| database(&err))?;
            }
        }
        tx.commit().await.map_err(|err| database(&err))?;
        Ok(())
    }

    /// Append steps of a game that is still being played.
    ///
    /// # Errors
    ///
    /// The transaction failed.
    pub async fn save_open(&self, game: &OpenWrite) -> Result<(), StoreFailure> {
        let mut tx = self.pool.begin().await.map_err(|err| database(&err))?;
        sqlx::query(
            "INSERT INTO open_games (id, mode, matchmade, settings, seats, table_kind) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO UPDATE SET settings = EXCLUDED.settings, seats = EXCLUDED.seats, table_kind = EXCLUDED.table_kind",
        )
        .bind(&game.id)
        .bind(&game.mode)
        .bind(game.matchmade)
        .bind(&game.settings)
        .bind(&game.seats)
        .bind(&game.table_kind)
        .execute(connection(&mut tx))
        .await
        .map_err(|err| database(&err))?;
        for (seq, kind, seat, body) in &game.entries {
            sqlx::query(
                "INSERT INTO open_log (game_id, seq, kind, seat, body) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (game_id, seq) DO NOTHING",
            )
            .bind(&game.id)
            .bind(seq)
            .bind(kind)
            .bind(seat)
            .bind(body)
            .execute(connection(&mut tx))
            .await
            .map_err(|err| database(&err))?;
        }
        tx.commit().await.map_err(|err| database(&err))?;
        Ok(())
    }

    /// Delete one abandoned game. `open_log` goes with the row.
    ///
    /// # Errors
    ///
    /// The delete failed.
    pub async fn drop_open(&self, id: &str) -> Result<(), StoreFailure> {
        sqlx::query("DELETE FROM open_games WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|err| database(&err))?;
        Ok(())
    }

    /// Games that were still running when the process last wrote them down.
    ///
    /// # Errors
    ///
    /// The read failed.
    pub async fn load_open(&self) -> Result<Vec<SavedGame>, StoreFailure> {
        let games: Vec<(String, String, bool, String, String, Option<String>)> = sqlx::query_as(
            "SELECT id, mode, matchmade, settings, seats, table_kind FROM open_games ORDER BY id",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|err| database(&err))?;
        let mut saved = Vec::new();
        for (id, mode, matchmade, settings, seats, table_kind) in games {
            let log: Vec<(i32, String, Option<i32>, String)> = sqlx::query_as(
                "SELECT seq, kind, seat, body FROM open_log WHERE game_id = $1 ORDER BY seq",
            )
            .bind(&id)
            .fetch_all(&self.pool)
            .await
            .map_err(|err| database(&err))?;
            saved.push(SavedGame {
                id,
                mode,
                matchmade,
                settings,
                seats,
                table_kind,
                log,
            });
        }
        Ok(saved)
    }

    /// The action log of a finished game, if `user` sat in it.
    ///
    /// # Errors
    ///
    /// The read failed.
    pub async fn action_log(
        &self,
        game_id: &str,
        user_id: &str,
    ) -> Result<Option<Vec<(i32, String, Option<i32>, String)>>, StoreFailure> {
        let seated: Option<i32> =
            sqlx::query_scalar("SELECT seat FROM game_seats WHERE game_id = $1 AND user_id = $2")
                .bind(game_id)
                .bind(user_id)
                .fetch_optional(&self.pool)
                .await
                .map_err(|err| database(&err))?;
        if seated.is_none() {
            return Ok(None);
        }
        let rows = sqlx::query_as(
            "SELECT seq, kind, seat, body FROM action_log WHERE game_id = $1 ORDER BY seq",
        )
        .bind(game_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|err| database(&err))?;
        Ok(Some(rows))
    }

    async fn snap_of(&self, id: &str) -> Result<AccountSnap, StoreFailure> {
        let row: Option<AccountRow> = sqlx::query_as(
            "SELECT users.id, users.name, users.color, users.guest, users.username, stats.games, stats.wins, stats.bids_made, stats.bids_total, stats.best_score FROM users JOIN stats ON stats.user_id = users.id WHERE users.id = $1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|err| database(&err))?;
        let Some((
            id,
            name,
            color,
            guest,
            username,
            games,
            wins,
            bids_made,
            bids_total,
            best_score,
        )) = row
        else {
            return Err(StoreFailure::NotFound);
        };
        let skill = self.skill_of(&id).await?;
        Ok(AccountSnap {
            user: User {
                id: UserId::new(id),
                name,
                color: parse_color(&color).ok_or(StoreFailure::Database)?,
                tier: None,
            },
            guest,
            username,
            stats: Stats {
                games: u32::try_from(games).unwrap_or(0),
                wins: u32::try_from(wins).unwrap_or(0),
                bids_made: u32::try_from(bids_made).unwrap_or(0),
                bids_total: u32::try_from(bids_total).unwrap_or(0),
                best_score,
                by_mode: None,
            },
            skill,
        })
    }

    /// Replace the leave penalty for one account.
    ///
    /// # Errors
    ///
    /// The write failed.
    pub async fn write_penalty(
        &self,
        user: &str,
        season: i32,
        leaves: i32,
        until: i64,
    ) -> Result<(), StoreFailure> {
        sqlx::query(
            "INSERT INTO penalties (user_id, season_id, leaves, cooldown_until) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id) DO UPDATE SET season_id = EXCLUDED.season_id, leaves = EXCLUDED.leaves, cooldown_until = EXCLUDED.cooldown_until",
        )
        .bind(user)
        .bind(season)
        .bind(leaves)
        .bind(until)
        .execute(&self.pool)
        .await
        .map_err(|err| database(&err))?;
        Ok(())
    }

    /// Rated accounts in one season, highest ordinal first. No usernames.
    ///
    /// # Errors
    ///
    /// The read failed.
    pub async fn ladder(&self, season: i32) -> Result<Vec<LadderRow>, StoreFailure> {
        let rows: Vec<(String, String, String, f64, f64, i32)> = sqlx::query_as(
            "SELECT users.id, users.name, users.color, ratings.mu, ratings.sigma, ratings.games FROM ratings JOIN users ON users.id = ratings.user_id WHERE ratings.season_id = $1 AND ratings.games >= 1",
        )
        .bind(season)
        .fetch_all(&self.pool)
        .await
        .map_err(|err| database(&err))?;
        let mut entries: Vec<LadderRow> = rows
            .into_iter()
            .filter_map(|(id, name, color, mu, sigma, games)| {
                let color = parse_color(&color)?;
                Some(LadderRow {
                    id,
                    name,
                    color,
                    mu,
                    sigma,
                    games: u32::try_from(games).unwrap_or(0),
                })
            })
            .collect();
        entries.sort_by(|left, right| {
            let value = crate::rating::ordinal(right.mu, right.sigma)
                .cmp(&crate::rating::ordinal(left.mu, left.sigma));
            value
                .then_with(|| left.name.cmp(&right.name))
                .then_with(|| left.id.cmp(&right.id))
        });
        Ok(entries)
    }

    async fn skill_of(&self, id: &str) -> Result<Option<StoredSkill>, StoreFailure> {
        let rating: Option<(i32, f64, f64, i32)> =
            sqlx::query_as("SELECT season_id, mu, sigma, games FROM ratings WHERE user_id = $1")
                .bind(id)
                .fetch_optional(&self.pool)
                .await
                .map_err(|err| database(&err))?;
        let penalty: Option<(i32, i32, Option<i64>)> = sqlx::query_as(
            "SELECT season_id, leaves, cooldown_until FROM penalties WHERE user_id = $1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|err| database(&err))?;
        let now = identity::unix_now().get();
        Ok(match (rating, penalty) {
            (None, None) => None,
            (Some((season, mu, sigma, games)), penalty) => {
                let (leave_season, leaves, cooldown_until) = penalty.unwrap_or((season, 0, None));
                Some(StoredSkill {
                    season_id: u32::try_from(season).unwrap_or(0),
                    mu,
                    sigma,
                    games: u32::try_from(games).unwrap_or(0),
                    leaves: u32::try_from(leaves).unwrap_or(0),
                    leave_season: u32::try_from(leave_season).unwrap_or(0),
                    cooldown_until,
                })
            }
            (None, Some((season, leaves, cooldown_until))) => {
                let prior = crate::rating::prior();
                Some(StoredSkill {
                    season_id: crate::rating::season_at(now).id,
                    mu: prior.mu,
                    sigma: prior.sigma,
                    games: 0,
                    leaves: u32::try_from(leaves).unwrap_or(0),
                    leave_season: u32::try_from(season).unwrap_or(0),
                    cooldown_until,
                })
            }
        })
    }
}

/// One rated account, before it is turned into a ladder row.
pub struct LadderRow {
    /// User id.
    pub id: String,
    /// Display name.
    pub name: String,
    /// Table colour.
    pub color: skt_protocol::TableColor,
    /// Weng-Lin μ.
    pub mu: f64,
    /// Weng-Lin σ.
    pub sigma: f64,
    /// Ranked games this season.
    pub games: u32,
}

type AccountRow = (
    String,
    String,
    String,
    bool,
    Option<String>,
    i32,
    i32,
    i32,
    i32,
    Option<i32>,
);

fn zero_stats() -> Stats {
    Stats {
        games: 0,
        wins: 0,
        bids_made: 0,
        bids_total: 0,
        best_score: None,
        by_mode: None,
    }
}

fn database(err: &sqlx::Error) -> StoreFailure {
    tracing::error!(error = %err, "database");
    StoreFailure::Database
}

fn connection<'a>(
    tx: &'a mut sqlx::Transaction<'_, sqlx::Postgres>,
) -> &'a mut sqlx::postgres::PgConnection {
    tx
}

async fn next_color(pool: &PgPool) -> Result<TableColor, StoreFailure> {
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM users")
        .fetch_one(pool)
        .await
        .map_err(|err| database(&err))?;
    let index = usize::try_from(count).unwrap_or(0);
    Ok(COLORS[index % COLORS.len()])
}

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

fn color_name(color: TableColor) -> &'static str {
    match color {
        TableColor::Sky => "#1cb0f6",
        TableColor::Orange => "#ff9600",
        TableColor::Purple => "#ce82ff",
        TableColor::Red => "#ff4b4b",
        TableColor::Green => "#58cc02",
        TableColor::Gold => "#e5a400",
        TableColor::Navy => "#2b70c9",
        TableColor::Pink => "#ff5fbf",
    }
}

fn parse_color(value: &str) -> Option<TableColor> {
    Some(match value {
        "#1cb0f6" => TableColor::Sky,
        "#ff9600" => TableColor::Orange,
        "#ce82ff" => TableColor::Purple,
        "#ff4b4b" => TableColor::Red,
        "#58cc02" => TableColor::Green,
        "#e5a400" => TableColor::Gold,
        "#2b70c9" => TableColor::Navy,
        "#ff5fbf" => TableColor::Pink,
        _ => return None,
    })
}

async fn insert_session(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    hash: &[u8; 32],
    user_id: &str,
) -> Result<(), StoreFailure> {
    sqlx::query(
        "INSERT INTO sessions (token_hash, user_id, expires_at, last_used) VALUES ($1, $2, now() + interval '30 days', now())",
    )
    .bind(hash.as_slice())
    .bind(user_id)
    .execute(connection(tx))
    .await
    .map_err(|err| database(&err))?;
    Ok(())
}

// Human: A missing account still runs a verify, so the response time does not say which one was wrong.
// Agent: READS password_hash; CALLS argon2id verify on a blocking thread; never logs the password.
async fn verify_password(password: String, stored: Option<String>) -> Result<bool, StoreFailure> {
    let stored = stored.unwrap_or_else(dummy_hash);
    let joined = tokio::task::spawn_blocking(move || {
        let Ok(parsed) = PasswordHash::new(&stored) else {
            return false;
        };
        Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok()
    })
    .await
    .map_err(|_| StoreFailure::Database)?;
    Ok(joined)
}

fn dummy_hash() -> String {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(b"not-a-password", &salt)
        .map_or_else(|_| String::new(), |hash| hash.to_string())
}

async fn hash_password(password: String) -> Result<String, StoreFailure> {
    tokio::task::spawn_blocking(move || {
        let salt = SaltString::generate(&mut OsRng);
        Argon2::default()
            .hash_password(password.as_bytes(), &salt)
            .map(|hash| hash.to_string())
            .map_err(|_| StoreFailure::Database)
    })
    .await
    .map_err(|_| StoreFailure::Database)?
}
