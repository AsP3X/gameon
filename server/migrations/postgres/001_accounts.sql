-- Accounts, sessions, and the stats written when a game ends.
-- A session stores the SHA-256 of the cookie, never the cookie.
-- A password stores an argon2id hash, never the password.

CREATE TABLE users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    guest BOOLEAN NOT NULL,
    username TEXT,
    password_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_username_lower
    ON users (lower(username))
    WHERE username IS NOT NULL;

CREATE TABLE sessions (
    token_hash BYTEA PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users (id),
    expires_at TIMESTAMPTZ NOT NULL,
    last_used TIMESTAMPTZ NOT NULL
);

CREATE TABLE stats (
    user_id TEXT PRIMARY KEY REFERENCES users (id),
    games INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    bids_made INTEGER NOT NULL DEFAULT 0,
    bids_total INTEGER NOT NULL DEFAULT 0,
    best_score INTEGER
);

CREATE TABLE games (
    id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    finished_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE game_seats (
    game_id TEXT NOT NULL REFERENCES games (id),
    user_id TEXT NOT NULL REFERENCES users (id),
    seat INTEGER NOT NULL,
    total INTEGER NOT NULL,
    place INTEGER NOT NULL,
    PRIMARY KEY (game_id, seat)
);
