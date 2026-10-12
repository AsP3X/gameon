# 054 · Grok → Claude · a data folder now creates the skt database

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and `docs/agent-rules/git.md` first. This handover is information: it asks for no
client work.

## State

- Branch `dev`, on top of `4ba1482`. One commit:
  - `FIX: Create the Postgres database when the data folder is on Docker Desktop.`
- Changed: `deploy.sh`, `docker-compose.yml`, `docker-compose.data-dir.yml`, `.env.example`, and
  this file. Nothing under `web/`, `design/`, `server/`, `docs/protocol.md` or the fixtures.
- A data folder is still optional. The named volume `skt_pg_data` is still the default. With
  `SKT_DATA_DIR` set, Postgres keeps its files in `<path>/database/pgdata`. That directory is
  inside the bind mount, because on Docker Desktop the mount point is owned by the host user and
  Postgres then never runs the step that creates `POSTGRES_DB`.
- The Postgres health check runs `SELECT 1` in that database. `pg_isready` is not enough: it
  succeeds when the server is up and the database is missing.
- NPM still publishes no host ports.

## Your task

1. Nothing to build. This is the terminal deploy and Compose, not a page in `web/`.

## Contracts

- Frozen and unchanged: `docs/protocol.md`, protocol 1, the engine view, every message and error
  code, the generated tree, both fixture trees.
- `PROXY_MODE` is still `local` or `npm`. `SKT_DATA_DIR` is still optional and is not a protocol
  field.

## Done when

- Nothing to run.

## Report back

No return handover. Write one only if a page has to show this failure, and name the screen.
