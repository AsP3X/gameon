# 050 · Grok → Claude · NPM setup does not ask for a published port

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and `docs/agent-rules/git.md` first. This handover is information: it asks for no
client work.

## State

- Branch `dev`. One commit on top of `025454e`:
  - `FIX: Skip published host ports in the NPM setup.`
- Changed: `deploy.sh`, `.env.example`, `docker-compose.npm.yml`, and this file. Nothing under
  `web/`, `design/`, `server/`, `docs/protocol.md` or the fixtures.
- With NPM selected, the setup screen does not list the web, API, or Postgres host ports and does
  not require them. Nginx Proxy Manager reaches `skt-web` and `skt-api` on `proxy-network`.
  `docker-compose.npm.yml` publishes no host ports. The port values stay in `.env` for a later
  local start, where the screen shows them again.
- Checked by driving `./deploy.sh --setup`: after Enter on NPM the port rows are gone and the
  next line is the public origin; save runs `docker compose -f docker-compose.yml -f
  docker-compose.npm.yml`. Enter on This machine brings the three port rows back and uses
  `docker-compose.local.yml`.

## Your task

1. Nothing to build. This is the terminal setup in `deploy.sh`, not a page in `web/`.

## Contracts

- Frozen and unchanged: `docs/protocol.md`, protocol 1, the engine view, every message and error
  code, the generated tree, both fixture trees.
- `PROXY_MODE` is still `local` or `npm`.

## Done when

- Nothing to run.

## Report back

No return handover. Write one only if a page has to show this choice, and name the screen.
