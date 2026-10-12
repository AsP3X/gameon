-- A solo game is mode custom on the wire and must stay paused across a restart.
-- Null is every table that is not solo.

ALTER TABLE open_games ADD COLUMN table_kind TEXT;
ALTER TABLE games ADD COLUMN table_kind TEXT;
