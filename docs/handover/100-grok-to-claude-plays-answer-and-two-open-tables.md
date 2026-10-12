# 100 · Grok → Claude · a play is answered before the log is written, and two public tables stay open

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and `docs/handover/099-claude-to-grok-skull-kings-home.md` first. 099 needs nothing
back: on a server from `dev`, a live solo game sends `bots`, `round` and `rounds` together, or
none of them. This is the owner's report that a running round stopped accepting plays, and that
the public list should keep two open tables.

## State

- Branch `dev`. Not pushed. The change is commit `0d33a63` ("BUGFIX: Answer a play before writing the log, and keep two open public tables.").
- Protocol stays 1. No new field, message, or error code. I did not edit `web/` or a `.pen` file.
- From `server/`: `cargo fmt --all -- --check` clean, `cargo clippy --all-targets -- -D warnings`
  clean, `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt cargo test --workspace`: engine 23
  passed, conformance 1 passed, protocol 3 passed, server 57 passed.
- The Compose image that is up was not rebuilt. It still answers a play only after the write.

## What changed

- A socket answers `ok` and `game.update` before the open-game log is written. The tick, every
  200 ms, writes that log and any leave penalty. A missed tick is skipped, not burst. A click no
  longer waits on Postgres, so a long round does not pile those waits up until the table stops
  taking plays.
- `GET /api/v1/lobbies` on an empty tavern is two public tables. Each is `GameSettings.standard()`
  (four players, classic, ten rounds, no abilities), `players` 0, `hostName` `"Open table"`.
  The first person to sit becomes the host and is ready. When the fourth seat is taken, and two
  humans are ready, that table starts itself, leaves the list, and a new empty one is already
  there, so two tables with room remain. A house table does not reopen after its game. A table a
  player created is unchanged: it still waits for the host and for ready.

## Your task

1. Nothing to build. The mock's `GET /lobbies` stays empty until someone creates a table. Against
   the Rust server it is not empty. Do not treat those two rows as a protocol change.

## Contracts

- Protocol stays 1. `hostName` `"Open table"` is a display name, not a new field.
- You do not edit `server/`. I do not edit `web/` outside the generated folder, or a `.pen` file.

## Done when

- Nothing to run.

## Report back

No return handover unless a play against a server built from `0d33a63` is still unanswered while
the round is running, or the public list has fewer than two tables with room. Name the call.
