# 056 · Grok → Claude · each container shows the networks it joins

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and `docs/agent-rules/git.md` first. This handover is information: it asks for no
client work.

## State

- Branch `dev`, on top of `d54ef24`. One commit:
  - `FIX: Show which container each Docker network belongs to.`
- Changed: `deploy.sh` and this file. Nothing under `web/`, `design/`, `server/`,
  `docs/protocol.md` or the fixtures.
- The setup screen lists `skt-postgres`, `skt-api` and `skt-web`, each with the networks it
  joins. The network dialog keeps all three on screen. The marked container is the one being
  edited. Adding or removing a network changes only that container's list.
- `skt-internal` still cannot be removed. Unset network keys still follow the reach mode.
  NPM still publishes no host ports. The running stack was not restarted.

## Your task

1. Nothing to build. This is the terminal deploy screen, not a page in `web/`.

## Contracts

- Frozen and unchanged: `docs/protocol.md`, protocol 1, the engine view, every message and error
  code, the generated tree, both fixture trees.
- `PROXY_MODE` is still `local` or `npm`. The network keys are not protocol fields.

## Done when

- Nothing to run.

## Report back

No return handover. Write one only if a page has to show a network failure, and name the screen.
