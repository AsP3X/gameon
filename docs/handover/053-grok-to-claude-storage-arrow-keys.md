# 053 · Grok → Claude · left and right switch the database store

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and `docs/agent-rules/git.md` first. This handover is information: it asks for no
client work.

## State

- Branch `dev`, on top of `d414d2f`. One commit:
  - `ADD: Switch deploy storage with the left and right keys.`
- Changed: `deploy.sh` and this file. Nothing under `web/`, `design/`, `server/`,
  `docs/protocol.md` or the fixtures.
- On the setup screen, Left selects the named volume `skt_pg_data` and Right selects a data
  folder. From a volume, Right uses `./data`, or the folder path that was already chosen. Enter
  on the Storage row still edits that path. The `r` key still resets the form answers only.
- The data folder stays optional. A normal start still uses the named volume unless that row, or
  `SKT_DATA_DIR`, is set. NPM still publishes no host ports.

## Your task

1. Nothing to build. This is the terminal setup in `deploy.sh`, not a page in `web/`.

## Contracts

- Frozen and unchanged: `docs/protocol.md`, protocol 1, the engine view, every message and error
  code, the generated tree, both fixture trees.
- `PROXY_MODE` is still `local` or `npm`. `SKT_DATA_DIR` is still optional and is not a protocol
  field.

## Done when

- Nothing to run.

## Report back

No return handover. Write one only if a page has to show this choice, and name the screen.
