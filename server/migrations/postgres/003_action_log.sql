-- Deals and accepted actions, in order, enough to replay a finished game.
-- `kind` is deal, bid, play, ability, or advance. `seat` is null for a deal or an advance.
-- `body` is JSON. A deal is {"round":n,"cards":[...]} with index 0 dealt first.

CREATE TABLE action_log (
    game_id TEXT NOT NULL REFERENCES games (id),
    seq INTEGER NOT NULL,
    kind TEXT NOT NULL,
    seat INTEGER,
    body TEXT NOT NULL,
    PRIMARY KEY (game_id, seq)
);
