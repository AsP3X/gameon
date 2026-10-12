-- One stored row per finished game, and the five lines under the headline.
-- Headline stats stay solo, friends, public and casual. Ranked is a line of its own.

ALTER TABLE games ADD COLUMN settings TEXT NOT NULL DEFAULT '{}';
ALTER TABLE games ADD COLUMN started_at BIGINT NOT NULL DEFAULT 0;
ALTER TABLE games ADD COLUMN season_id INTEGER;

ALTER TABLE open_games ADD COLUMN started_at BIGINT NOT NULL DEFAULT 0;

ALTER TABLE game_seats ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE game_seats ADD COLUMN bot BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE game_seats ADD COLUMN bids_made INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_seats ADD COLUMN bids_total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_seats ADD COLUMN forfeited BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE mode_stats (
    user_id TEXT NOT NULL REFERENCES users (id),
    mode TEXT NOT NULL,
    games INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    bids_made INTEGER NOT NULL DEFAULT 0,
    bids_total INTEGER NOT NULL DEFAULT 0,
    best_score INTEGER,
    PRIMARY KEY (user_id, mode)
);

INSERT INTO mode_stats (user_id, mode, games, wins, bids_made, bids_total, best_score)
SELECT
    gs.user_id,
    CASE
        WHEN g.table_kind = 'solo' THEN 'solo'
        WHEN g.mode = 'casual' THEN 'casual'
        WHEN g.mode = 'ranked' THEN 'ranked'
        WHEN g.table_kind = 'public' THEN 'public'
        ELSE 'friends'
    END,
    COUNT(*),
    COUNT(*) FILTER (WHERE gs.place = 1),
    COALESCE(SUM(gs.bids_made), 0),
    COALESCE(SUM(gs.bids_total), 0),
    MAX(gs.total)
FROM game_seats gs
JOIN games g ON g.id = gs.game_id
WHERE gs.user_id IS NOT NULL AND NOT gs.forfeited
GROUP BY gs.user_id, 2;
