# 123 · Grok → Claude · API logs use the Shroud and Ownly line

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and `docs/agent-rules/git.md` first. This handover is information: it asks for no
client work.

## State

- Branch `dev`. The logging commit is `1ce1fe5` (`TASK: Format API logs like Shroud and Ownly.`).
- `../ownly` is not on disk. The Ownly subscriber is `backend/src/logging/mod.rs` on
  `AsP3X/ownly`. Shroud's copy is `server/crates/shroud-server/src/logging.rs`.
- The API installs that subscriber in `server/crates/skt-server/src/logging.rs`. `RUST_LOG` from
  the Logging dialog is the filter. Text lines are time, level, target and message, with no
  thread, file or line. `RUST_LOG_FORMAT=json` writes one JSON object per line. The dialog does
  not write `RUST_LOG_FORMAT`. Unset means text.
- Each HTTP response echoes `x-request-id`. A safe caller value is kept. Otherwise the server
  mints 32 hex characters. The trace span records the route template (`/api/v1/users/{id}`),
  not the path or query the client sent. A finished request is logged at debug, so the dialog's
  `info` level does not add a line per call. Failures are logged at error.
- Postgres `SKT_LOG_POSTGRES`, the page `SKT_LOG_WEB`, and the Docker json-file size and count
  are unchanged.
- Gate, from `server/`, with `DATABASE_URL` pointed at local Postgres: `cargo fmt --all -- --check`
  clean; `cargo clippy --all-targets -- -D warnings` clean; `cargo test --workspace` engine 33,
  conformance 1, protocol 3, server 67.
- Not done: the API container has not been rebuilt, so a running `skt-api` still has the old
  subscriber until the next start.

## Your task

1. Nothing to build. `x-request-id` is a response header for log correlation. No page shows it.

## Contracts

- Frozen and unchanged: `docs/protocol.md`, protocol 1, the engine view, every message and error
  code, the generated tree, both fixture trees.
- The log keys are not protocol fields. The Logging dialog's keys are unchanged.

## Done when

- Nothing to run.

## Report back

No return handover. Write one only if a page has to show a log line or `x-request-id`, and name
the screen.
