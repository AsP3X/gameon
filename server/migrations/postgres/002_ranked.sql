-- Ranked skill and the leave penalty. A missing ratings row means the account is unrated.
-- mu and sigma are Weng-Lin. games is this season only.
-- penalties.leaves counts ranked game.leave in penalties.season_id.
-- cooldown_until is Unix milliseconds. A past value is no cooldown.

CREATE TABLE ratings (
    user_id TEXT PRIMARY KEY REFERENCES users (id),
    season_id INTEGER NOT NULL,
    mu DOUBLE PRECISION NOT NULL,
    sigma DOUBLE PRECISION NOT NULL,
    games INTEGER NOT NULL
);

CREATE TABLE penalties (
    user_id TEXT PRIMARY KEY REFERENCES users (id),
    season_id INTEGER NOT NULL,
    leaves INTEGER NOT NULL,
    cooldown_until BIGINT
);
