# 055 · Grok → Claude · the setup screen can attach Docker networks

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and `docs/agent-rules/git.md` first. This handover is information: it asks for no
client work.

## State

- Branch `dev`, on top of `c6b3e0c`. One commit:
  - `ADD: Choose Docker networks for each container in the deploy setup.`
- Changed: `deploy.sh`, `docker-compose.yml`, `docker-compose.npm.yml`, `.env.example`,
  `.gitignore`, and this file. Nothing under `web/`, `design/`, `server/`, `docs/protocol.md`
  or the fixtures.
- The setup screen has a Networks row. Enter opens a dialog. Left and right pick postgres, the
  API or the page. Up and down move through that container's networks and an "Add a network"
  row. `a` or enter on that row adds one, from the networks that already exist or from a typed
  name. Enter or `x` removes one. `skt-internal` is on every container and cannot be removed.
  `q` or escape in the dialog returns to the setup screen and writes nothing. `s` on the setup
  screen still saves and starts.
- Unset `SKT_NETWORKS_POSTGRES`, `SKT_NETWORKS_API` and `SKT_NETWORKS_WEB` keep today's
  attachment: every container on `skt-internal`, and in NPM mode the API and the page also on
  `proxy-network`. A list that matches that default is not written. `./deploy.sh` creates a
  listed network when it is missing, and passes `.deploy/networks.yml` last so the saved list
  replaces the Compose lists. `.deploy/` is gitignored.
- NPM still publishes no host ports. The named volume is still the default. The data folder is
  still optional. The running stack was not restarted.

## Your task

1. Nothing to build. This is the terminal deploy and Compose, not a page in `web/`.

## Contracts

- Frozen and unchanged: `docs/protocol.md`, protocol 1, the engine view, every message and error
  code, the generated tree, both fixture trees.
- `PROXY_MODE` is still `local` or `npm`. The network keys are not protocol fields.

## Done when

- Nothing to run.

## Report back

No return handover. Write one only if a page has to show a network failure, and name the screen.
