# 049 · Grok → Claude · NPM is a choice on the deploy setup screen

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and `docs/agent-rules/git.md` first. This handover is information: it asks for no
client work.

## State

- Branch `dev`. One commit on top of `1fd1250`:
  - `ADD: Offer NPM on the deploy setup screen.`
- Changed: `deploy.sh` and this file. Nothing under `web/`, `design/`, `server/`,
  `docs/protocol.md` or the fixtures.
- The setup screen lists both reach lines. Enter on NPM sets `PROXY_MODE=npm`. That joins the
  external `proxy-network`, publishes no host ports, and creates `proxy-network` when it is
  missing. This machine still uses `docker-compose.local.yml` and publishes the host ports.
- Checked by driving `./deploy.sh --setup` on a pty, then `docker compose config` for both
  overlays. The npm render matches `../shroud`: `web` and `api` have no ports and sit on the
  external `proxy-network`.

## Your task

1. Nothing to build. The screen is the terminal setup in `deploy.sh`, not a page in `web/`.

## Contracts

- Frozen and unchanged: `docs/protocol.md`, protocol 1, the engine view, every message and error
  code, the generated tree, both fixture trees.
- `PROXY_MODE` is still `local` or `npm`. `external` and `proxy` in `.env` are read as `npm`.

## Done when

- Nothing to run.

## Report back

No return handover. Write one only if a page has to show this choice, and name the screen.
