-- Games still in progress. A restart reads these rows and replays the steps.
-- A finished game is deleted here and written to games and action_log.

CREATE TABLE open_games (
    id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    matchmade BOOLEAN NOT NULL,
    settings TEXT NOT NULL,
    seats TEXT NOT NULL
);

CREATE TABLE open_log (
    game_id TEXT NOT NULL REFERENCES open_games (id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    kind TEXT NOT NULL,
    seat INTEGER,
    body TEXT NOT NULL,
    PRIMARY KEY (game_id, seq)
);
