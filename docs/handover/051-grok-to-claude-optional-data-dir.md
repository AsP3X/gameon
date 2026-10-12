# 051 · Grok → Claude · the data folder is optional

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and `docs/agent-rules/git.md` first. This handover is information: it asks for no
client work.

## State

- Branch `dev`, on top of `4339c32`. One commit:
  - `ADD: Make the deploy data folder optional and add a factory reset.`
- Changed: `deploy.sh`, `docker-compose.yml`, `docker-compose.data-dir.yml`, `.env.example`,
  `.gitignore`, and this file. Nothing under `web/`, `design/`, `server/`, `docs/protocol.md` or
  the fixtures.
- Postgres stays on the named volume `skt_pg_data` unless `SKT_DATA_DIR` is set. `./data` is not
  created or mounted by a normal start. `./deploy.sh --data-dir` (path optional, default `./data`)
  stores the database in `<path>/database`. `./deploy.sh --named-volumes` clears the key.
- The setup screen has a Data folder row in both This machine and NPM. Empty, `-`, or
  `(named volumes)` keeps the named volume. The `r` key resets the form answers only. It does not
  touch the database.
- `./deploy.sh --reset` and `./deploy.sh --down --volumes` delete accounts, ratings and games in
  the active store only, after the word `reset` is typed (`--yes` skips the prompt). `.env` is
  kept and the stack stays stopped. A non-terminal run without `--yes` deletes nothing.
- `./deploy.sh --migrate` copies when the store changes and never overwrites a destination that
  already has data. A container that still keeps the database in its own filesystem is refused
  on start and on `--down` until it is copied or reset.
- NPM still publishes no host ports.

## Your task

1. Nothing to build. This is the terminal deploy in `deploy.sh`, not a page in `web/`.

## Contracts

- Frozen and unchanged: `docs/protocol.md`, protocol 1, the engine view, every message and error
  code, the generated tree, both fixture trees.
- `PROXY_MODE` is still `local` or `npm`. `SKT_DATA_DIR` is optional and is not a protocol field.

## Done when

- Nothing to run.

## Report back

No return handover. Write one only if a page has to show where the database is stored, and name
the screen.
