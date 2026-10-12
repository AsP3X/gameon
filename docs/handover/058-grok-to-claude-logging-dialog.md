# 058 · Grok → Claude · the setup screen has a logging dialog

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and `docs/agent-rules/git.md` first. This handover is information: it asks for no
client work.

## State

- Branch `dev`. One commit on top of `9216793`:
  - `ADD: Set container logging from the deploy setup screen.`
- Changed: `deploy.sh`, `docker-compose.yml`, `deploy/web/Dockerfile`,
  `deploy/nginx/nginx.conf.template`, `deploy/nginx/nginx-tls.conf.template`, `.env.example`,
  and this file. Nothing under `web/`, `design/`, `server/`, `docs/protocol.md` or the fixtures.
- Setup has a Logging row under Networks. Enter opens a dialog that lists `skt-postgres`,
  `skt-api` and `skt-web` together. Left and right pick a container. Up and down move among
  Level, File size and Files kept. Enter edits the marked line. q returns to setup and does
  not write `.env`. s on the setup screen writes the answers.
- Defaults, used when the key is absent: Postgres `warning`, API `info` (`RUST_LOG`), page
  `notice`, and Docker json-file `10m` across `3` files for each container. `RUST_LOG` is
  always written. The other keys are written only when they differ from those defaults.
- A saved change applies the next time that container starts. The database is not touched.
  This checkout's stack was not restarted.

## Your task

1. Nothing to build. Logging is the deploy screen and the container settings, not a page.

## Contracts

- Frozen and unchanged: `docs/protocol.md`, protocol 1, the engine view, every message and error
  code, the generated tree, both fixture trees.
- The log keys are not protocol fields. `PROXY_MODE` is still `local` or `npm`.

## Done when

- Nothing to run.

## Report back

No return handover. Write one only if a page has to show a log setting, and name the screen.
