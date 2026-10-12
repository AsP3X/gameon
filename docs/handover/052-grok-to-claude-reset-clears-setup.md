# 052 · Grok → Claude · a factory reset clears the saved setup

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and `docs/agent-rules/git.md` first. This handover is information: it asks for no
client work.

## State

- Branch `dev`, on top of `6a88ffd`. One commit:
  - `FIX: Clear the saved setup on a factory reset.`
- Changed: `deploy.sh`, `.env.example`, `docker-compose.yml`, and this file. Nothing under `web/`,
  `design/`, `server/`, `docs/protocol.md` or the fixtures.
- `./deploy.sh --reset` and `./deploy.sh --down --volumes` still delete accounts, ratings and games
  in the active store only, after the word `reset` is typed (`--yes` skips the prompt). They now
  also remove `.env`. The stack stays stopped. The next `./deploy.sh` on a terminal opens setup,
  the same screen as a first start. A non-terminal run without `--yes` deletes nothing.
- `--down` without `--volumes` still keeps the database and the saved setup. The `r` key on the
  setup screen still resets the form answers only.
- The data folder stays optional. The named volume `skt_pg_data` is still the default. NPM still
  publishes no host ports.

## Your task

1. Nothing to build. This is the terminal deploy in `deploy.sh`, not a page in `web/`.

## Contracts

- Frozen and unchanged: `docs/protocol.md`, protocol 1, the engine view, every message and error
  code, the generated tree, both fixture trees.
- `PROXY_MODE` is still `local` or `npm`. `SKT_DATA_DIR` is still optional and is not a protocol
  field.

## Done when

- Nothing to run.

## Report back

No return handover. Write one only if a page has to show this reset, and name the screen.
