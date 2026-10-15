<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="design/brand/gameon/gameon-logo-dark.svg">
    <img src="design/brand/gameon/gameon-logo.svg" alt="GameOn" width="300">
  </picture>
</p>

<h1 align="center">Skull King Tavern</h1>

<p align="center">
  The pirate trick-taking game in the browser: alone against bots, on one phone passed around the
  table, or online with friends, strangers and a ranked ladder.<br>
  A React client, a Rust server that is the only authority, and PostgreSQL.
</p>

<p align="center">
  <a href="https://github.com/AsP3X/gameon/actions/workflows/web.yml"><img src="https://github.com/AsP3X/gameon/actions/workflows/web.yml/badge.svg?branch=dev" alt="Web workflow"></a>
  <a href="https://github.com/AsP3X/gameon/actions/workflows/server.yml"><img src="https://github.com/AsP3X/gameon/actions/workflows/server.yml/badge.svg?branch=dev" alt="Server workflow"></a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/readme/landing-dark.png">
    <img src="docs/readme/landing-light.png" alt="The GameOn landing page with Skull King as the featured game" width="100%">
  </picture>
</p>

## Contents

1. [What it is](#what-it-is)
2. [Quick start](#quick-start)
3. [Architecture](#architecture)
4. [Repository layout](#repository-layout)
5. [Requirements](#requirements)
6. [Development](#development)
7. [Game options](#game-options)
8. [Configuration](#configuration)
9. [Deployment](#deployment)
10. [Tests and quality gates](#tests-and-quality-gates)
11. [Contracts: protocol and fixtures](#contracts-protocol-and-fixtures)
12. [Design](#design)
13. [Working on it with AI agents](#working-on-it-with-ai-agents)
14. [Documentation map](#documentation-map)

## What it is

**GameOn** is the frame: a landing page, a list of games, accounts, profiles and a ladder.
**Skull King** is its first game. Players bid how many tricks they will win, then try to hit that
number exactly.

<p align="center">
  <img src="docs/readme/table.png" alt="A solo game in the middle of a trick: three bots, the player's hand, the scoreboard and the last trick" width="100%">
</p>

### Ways to play

| Mode | Where it runs | Who | Notes |
| ---- | ------------- | --- | ----- |
| **Solo** | Server | You and 1 to 7 bots | No clock. Saved to the account, so it resumes on any device. If the server cannot be reached, the game runs on the device and is not counted. |
| **One screen** | Device | The crew on one phone | Pass-and-play. Needs no server and no network. |
| **Score a real game** | Device | Any | A scoresheet for a game played with physical cards. |
| **Quick play** | Server | Strangers | Casual queue with the standard rules. Bots fill the empty seats after a wait. |
| **Public tables** | Server | Anyone | Listed in the table browser. The host picks the rules. |
| **Your table** | Server | Friends | Private, joined with a 6-character code. The host picks the rules. |
| **Ranked** | Server | Accounts only | Solo queue, standard rules, never starts with a bot. Weng-Lin rating, seven tiers, quarterly seasons. Leaving scores last place and starts a cooldown. |

A **guest** is created with one tap and can play everything except ranked. An **account** is a
username and a password (argon2id). There is no email, so a lost password cannot be recovered.

<p align="center">
  <img src="docs/readme/phone-home.png" alt="Skull King's home on a phone, dark theme" width="250">
  &nbsp;
  <img src="docs/readme/phone-bid.png" alt="The bid sheet on a phone" width="250">
  &nbsp;
  <img src="docs/readme/phone-table.png" alt="The table on a phone in the middle of a trick" width="250">
</p>

The client is an installable PWA with light and dark themes, and layouts that hold from 360 px up.

## Quick start

Pick the path that matches what you want to do.

### A. Run the whole stack in Docker

```bash
git clone https://github.com/AsP3X/gameon.git
cd gameon
./deploy.sh
```

The first run on a terminal opens a setup screen and writes `.env`. Press `s` to accept the
defaults and start. Then open:

| What | URL |
| ---- | --- |
| The page | <http://localhost:8081> |
| API health | <http://localhost:8080/api/v1/health> |

`./deploy.sh --down` stops the stack and keeps the database. See [Deployment](#deployment).

### B. Work on the client with no server

```bash
cd web
npm ci
npm run dev
```

Open <http://localhost:5173/?mock>. `?mock` runs a mock server inside the page that speaks the real
protocol, so every online screen works without Rust or Postgres. One screen and the scoresheet
never need a server.

### C. Run client and server from source

```bash
# 1. From the repository root: Postgres only, published on 127.0.0.1:5432
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d postgres

# 2. In a second terminal: the server on 127.0.0.1:8080 (applies the migrations on start)
cd server
DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt cargo run

# 3. In a third terminal: the client on http://localhost:5173, proxying /api to the server
cd web
npm ci
npm run dev
```

> [!NOTE]
> If the Compose stack from path A is running, its `skt-api` container already holds port 8080.
> Stop it (`./deploy.sh --down`) or start your own server on another port (`PORT=8090`) and point
> the client at it with `SKT_API_TARGET=http://127.0.0.1:8090 npm run dev`.

## Architecture

```mermaid
flowchart TB
  subgraph browser["Browser · web/ (Vite+ · React 19 · TypeScript)"]
    direction LR
    shell["React shell<br/>GameOn frame · Skull King pages · online screens"]
    renderer["Table renderer<br/>lifted from the legacy build"]
    iface{{"Table interface"}}
    local["LocalTable<br/>reference engine and bots, offline"]
    remote["RemoteTable<br/>socket client, online"]
    shell --> renderer --> iface
    iface --> local
    iface --> remote
  end
  subgraph server["Server · server/ (Rust · axum · tokio)"]
    direction LR
    api["skt-server<br/>auth · lobbies · queues · tables · ratings"]
    engine["skt-engine<br/>rules · reducer · per-seat view · bots"]
    proto["skt-protocol<br/>wire types, exported to TypeScript"]
    api --> engine
    api --> proto
  end
  pg[("PostgreSQL 16<br/>accounts · sessions · games<br/>action logs · ratings")]
  shell -->|"REST /api/v1"| api
  remote <-->|"WebSocket /api/v1/ws"| api
  api --> pg
```

Three ideas hold the system together:

- **The server is the only authority.** It shuffles (OS-seeded CSPRNG), deals, validates, resolves
  tricks, scores, runs the timers, plays the bots and writes results and ratings. A client sends
  intents and renders the view it is given. The full rule is
  [`docs/agent-rules/server-authority.md`](docs/agent-rules/server-authority.md).
- **State leaves the engine only as a per-seat view.** `GameState` cannot be serialised. A seat
  never receives another hand, an unrevealed bid, or the deck order. While a Seer ability is open,
  that seat's view includes the undealt pile. While a Smuggler choice is open, that seat's view
  includes the cards it drew. Other seats receive neither, and both leave the view when the
  ability closes.
- **One `Table` interface, two implementations.** The table renderer does not know whether it is
  talking to `LocalTable` (the engine in the page) or `RemoteTable` (the socket).

What happens when a player plays a card online:

```mermaid
sequenceDiagram
  participant A as Seat A (browser)
  participant S as skt-server
  participant O as Other seats
  A->>S: game.play { card, at: round and trick }
  Note over S: The seat comes from the session cookie.<br/>Checked: phase, turn, freshness, legality.
  alt accepted
    S-->>A: ok
    S-->>A: game.update with A's own view
    S-->>O: game.update with each seat's own view
  else seated in a live game, and rejected
    S-->>A: err NOT_YOUR_TURN, STALE_ACTION or ILLEGAL_MOVE
    Note over S: The intent changes nothing for anyone.
  else the table has already finished
    Note over S: No ok and no err. Nothing changes.
  else the player has no seat
    S-->>A: err NOT_IN_GAME
  else the engine returns a broken step
    S-->>A: err INTERNAL
  end
```

The session is an HttpOnly cookie on the same origin, so REST and the socket upgrade both carry it
and the page never reads a token. A dropped socket reconnects with backoff and resumes from the
server's snapshot. Running games are written to Postgres as they are played and replayed after a
restart.

The rules exist twice: in TypeScript (`web/src/game/`, the reference, used offline) and in Rust
(`skt-engine`, used by the server). Recorded games in `fixtures/engine/` keep them equal. See
[Contracts](#contracts-protocol-and-fixtures).

## Repository layout

```
.
├── web/                     The client: Vite+, React 19, strict TypeScript
│   ├── src/game/            Reference engine: rules, reducer, bots (offline modes)
│   ├── src/table/           Table interface, LocalTable, RemoteTable
│   ├── src/net/             Socket client, REST client, online state, mock server
│   ├── src/gameon/          The frame: landing, Games, sign-up, profile, ladder
│   ├── src/skullking/       Skull King's home and the solo setup
│   ├── src/online/          Online index, ranked, tables, lobby, queue
│   ├── src/tableview/       The table renderer and its parity tests
│   ├── src/sound/           Web Audio synthesiser, recorded takes, menu music
│   ├── src/styles/          tokens.css and the stylesheets
│   ├── src/protocol/generated/   Wire types, generated by skt-protocol
│   └── e2e/                 Browser scripts: several players at one table
├── server/                  The Rust workspace
│   ├── crates/skt-engine/   Rules, reducer, per-seat view, bots. Pure, no I/O.
│   ├── crates/skt-protocol/ Wire types, the TypeScript export, the samples
│   ├── crates/skt-server/   HTTP and WebSocket server (the binary)
│   ├── crates/skt-bot-pass/ Bot-versus-bot runs from the terminal
│   └── migrations/postgres/ SQL migrations, applied on start
├── fixtures/
│   ├── engine/              Recorded games both engines must replay exactly
│   └── protocol/            One JSON sample of every message
├── design/                  Pencil design files, brand marks, card art
├── deploy/                  nginx templates and the web image
├── docs/                    Plan, protocol, conformance, agent rules, handovers
├── legacy/                  The original single-file build, kept as the reference
├── docker-compose*.yml      The stack and its overlays
├── deploy.sh                One-command deploy with a setup screen
├── AGENTS.md                Rules for every coding agent
└── CLAUDE.md                Loads AGENTS.md and the rule files for Claude Code
```

`web/README.md` goes deeper into the client: every address, every screen and the sound.

## Requirements

| Tool | Version | Needed for |
| ---- | ------- | ---------- |
| Docker with Compose v2 | `docker compose`, not `docker-compose` | Path A, Postgres for path C |
| Node.js | 22.18+, 24.11+ or 26+ (CI uses 24) | `web/` |
| Rust | Current stable with `rustfmt` and `clippy` (edition 2024). `server/rust-toolchain.toml` selects it. | `server/` |
| Chrome or Edge | Any recent | `npm run e2e` only. CI installs Playwright's Chromium instead. |
| Pen (pen.dev) | Any recent | Editing `design/*.pen` only |

`deploy.sh` runs on bash 3.2, the stock shell on macOS. There is no Makefile.

## Development

### Client (`web/`)

| Command | What it does |
| ------- | ------------ |
| `npm run dev` | Dev server on <http://localhost:5173>. Proxies `/api`, socket included, to `127.0.0.1:8080`. |
| `npm run check` | Format, lint and types (`vp check`). `npx vp check --fix` formats. |
| `npm run test` | Unit tests (`vp test`). |
| `npm run build` | Production build into `web/dist/`, service worker included. |
| `npm run preview` | Serves the build. |
| `npm run e2e` | Browser scripts: several players at one table. See [`web/e2e/README.md`](web/e2e/README.md). |
| `npm run fixtures` | Regenerates `fixtures/engine/` from the legacy reference. Only for an intended rule change. |
| `npm run fixtures:check` | Proves the files on disk are what the reference produces. |

Vite+ (`vp`) is the whole toolchain. Its configuration lives in `web/vite.config.ts`; there are no
separate ESLint, Prettier or Vitest config files.

Add `?mock` to any address on the dev server to play against the mock server in the page. It is not
in the production bundle.

### Server (`server/`)

| Command | What it does |
| ------- | ------------ |
| `cargo run` | Starts `skt-server` on `127.0.0.1:8080`. Needs `DATABASE_URL`. |
| `cargo fmt --check` | Formatting. |
| `cargo clippy --all-targets -- -D warnings` | Lints (`all` and `pedantic`), no suppressions. |
| `cargo test --workspace` | Unit, conformance, leak and integration tests. |
| `cargo run -p skt-protocol --bin export-protocol` | Regenerates `web/src/protocol/generated/` and `fixtures/protocol/`. |
| `scripts/bot-pass.sh` | Four blocks of bot-versus-bot games with a live dashboard and a report. |

The server does not read `.env` by itself. Export the variables or put them in front of the
command. Starting it applies every migration in `server/migrations/postgres/` to the database it is
pointed at.

`bot-pass` options:

| Option | Default | Meaning |
| ------ | ------- | ------- |
| `--games N` | `1000` | Games in each of the four blocks (easy, normal, hard, mixed). |
| `--seed HEX` | `5eed5a11` | Base seed. The same seed replays the same games. |
| `--plain` | off | A log instead of the dashboard. Also used when stdout is not a terminal. |
| `--report PATH` | `target/bot-pass/` | Where the report is written. |
| `--replay SUITE INDEX` | | Plays one game again. `SUITE` is `easy`, `normal`, `hard` or `mixed`. |

It exits 0 when every game finishes, 1 when a game faults or the pass is stopped, and 2 when an
argument is wrong or the terminal or the Ctrl-C handler cannot be set up.

### Ports

| Port | Who |
| ---- | --- |
| 5173 | `npm run dev` |
| 8080 | The API: `cargo run`, or the `skt-api` container (`API_PORT`) |
| 8081 | The page from Compose (`WEB_PORT`) |
| 5432 | Postgres, bound to `127.0.0.1` (`POSTGRES_PORT`) |

## Game options

<p align="center">
  <img src="docs/readme/solo-setup.png" alt="The solo setup: bots, bot skill, scoring, rounds and the advanced rules" width="100%">
</p>

A table's rules are one `GameSettings` object ([`docs/protocol.md`](docs/protocol.md) §5.3).
A private table's host can change them before the game starts, and a solo game chooses them when
it starts. A public table keeps the rules it opened with. Nobody at that table can change them.

| Setting | Values | Meaning |
| ------- | ------ | ------- |
| `maxPlayers` | `2` to `8` | Seats. Solo is the player plus 1 to 7 bots. A table opened from the page has 4. |
| `scoring` | `classic`, `rascal` | Classic is high risk. Rascal scores 10 per card dealt. |
| `format` | `classic` | 10 rounds of 1, 2, 3 … 10 cards. |
| | `brawl` | 5 rounds of 6, 7, 8, 9, 10 cards. |
| | `swift` | 5 rounds of 5 cards. |
| | `even` | 10 rounds: 2, 2, 4, 4, 6, 6, 8, 8, 10, 10. |
| | `whirl` | 10 rounds: 9, 9, 7, 7, 5, 5, 3, 3, 1, 1. |
| `loot` | on, off | Win a Loot to form an alliance: +20 each if both make their bids. |
| `kraken` | on, off | Swallows the trick. Nobody wins it. |
| `whale` | on, off | Special cards stop counting; the highest number wins. |
| `abilities` | on, off | Win a trick with a Pirate to use its power: Helmsman, Smuggler, Gambler, Seer or Giant. |
| `botLevel` | `easy`, `normal`, `hard` | Makes mistakes, solid play, counts cards. |
| `pace` | `relaxed`, `standard`, `fast` | Scales the bid, play and ability clocks: ×2, ×1, ×0.5. |

A table also has `allowBots` (default on): whether the host may seat bots.

**The standard rules** (quick play and ranked): four players, classic scoring, the classic format,
no loot, no Kraken, no White Whale, no abilities.

**Clocks** at standard pace. The server enforces them; the page only shows them.

| Step | Time | When it runs out |
| ---- | ---- | ---------------- |
| Bid | 45 s | The server plays a bot's move for that turn. |
| Play a card | 30 s | Same. Two misses in a row mark the seat away. |
| Pirate ability | 30 s | Same. |
| Trick end | 2.5 s | The server advances. Nobody can skip it. |
| Round end | 20 s | Or as soon as every connected player is ready. |

Solo has no clock: the bots play up to your turn and wait.

<p align="center">
  <img src="docs/readme/lobby.png" alt="A private table waiting to start: the table code, the rules, two bots seated and one open seat" width="100%">
</p>

## Configuration

### The stack (`.env`)

`./deploy.sh` writes `.env` from the setup screen. [`.env.example`](.env.example) holds the
defaults and a comment for every key. `.env` is never committed.

| Key | Default | Meaning |
| --- | ------- | ------- |
| `PROXY_MODE` | `local` | `local` publishes host ports. `npm` publishes none. The API and the page join `proxy-network` for Nginx Proxy Manager. Postgres stays on `skt-internal`. |
| `API_PORT` | `8080` | Host port of the API. `local` mode only. |
| `WEB_PORT` | `8081` | Host port of the page. `local` mode only. |
| `POSTGRES_PORT` | `5432` | Host port of Postgres on `127.0.0.1`. `local` mode only. |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | `skt` | Applied only when the data directory is first created. |
| `DATABASE_URL` | `postgres://skt:skt@127.0.0.1:5432/skt` | For a server started with `cargo run`. Compose builds its own. |
| `SKT_PUBLIC_ORIGIN` | empty | The page's origin when it is not `http://localhost` or `http://127.0.0.1`. No path. Example: `https://tavern.example`. |
| `SKT_SECURE_COOKIE` | empty | `1`, `true`, `TRUE`, or `True` when the page is served over https. Adds `Secure` to the session cookie. |
| `SKT_TRUSTED_PROXIES` | empty (`172.16.0.0/12` in Compose) | Addresses and CIDRs that may set `X-Forwarded-For`, and `X-Real-IP` when that chain yields no untrusted address. Empty ignores both headers, so callers behind one TCP peer share its address. The shared budget is register and login only: 5 registrations and 10 logins a minute. |
| `SKT_DATA_DIR` | unset | A folder for Postgres' files instead of the named volume `skt_pg_data`. |
| `SKT_NETWORKS_POSTGRES`, `SKT_NETWORKS_API`, `SKT_NETWORKS_WEB` | unset | Extra Docker networks for each container. `skt-internal` is always attached. |
| `RUST_LOG` | `info` | `error`, `warn`, `info`, `debug`, `trace`, `off`, or a filter such as `skt_server=debug`. `debug` and `trace` also log one line per HTTP request. |
| `RUST_LOG_FORMAT` | `text` | `text` or `json`. |
| `SKT_LOG_POSTGRES` | `warning` | Postgres `log_min_messages`. |
| `SKT_LOG_WEB` | `notice` | nginx error log level. |
| `SKT_LOG_SIZE_*`, `SKT_LOG_FILES_*` | `10m`, `3` | How much log Docker keeps for `POSTGRES`, `API` and `WEB`. |

### The server process

`skt-server` reads `HOST` (default `127.0.0.1`), `PORT` (default `8080`), `DATABASE_URL`
(required), `RUST_LOG`, `RUST_LOG_FORMAT`, `SKT_PUBLIC_ORIGIN`, `SKT_SECURE_COOKIE` and
`SKT_TRUSTED_PROXIES`. State-changing requests and the socket upgrade are checked against an
`Origin` allow-list: `http://localhost` and `http://127.0.0.1`, with a port or without one, plus
an exact match of `SKT_PUBLIC_ORIGIN` after a trailing slash is removed. A request with no
`Origin` header is rejected. `https://localhost` is rejected.

### The client's dev tooling

| Variable | Meaning |
| -------- | ------- |
| `SKT_API_TARGET` | Where the dev server proxies `/api`. Default `http://127.0.0.1:8080`. |
| `SKT_E2E=1` | Runs the browser scripts in `web/e2e/` instead of the unit tests. `npm run e2e` sets it. |
| `SKT_E2E_TARGET` | `mock`, or the URL of a server. Unset: the Rust server on 8080 if it answers, else the mock host. |
| `SKT_E2E_HEADED=1` | Shows the browsers. |
| `SKT_E2E_PORT` | Pins the page's port. |
| `SKT_E2E_SHOTS=<folder>` | Writes screenshots where a script takes them. |

The client has no runtime configuration: it talks to its own origin under `/api/v1`, and reads the
rules, timers and season from `GET /api/v1/config`.

## Deployment

```mermaid
flowchart LR
  user(["Browser"])
  subgraph stack["Compose project skt"]
    web["gameon-web<br/>nginx: the page, and a proxy for /api"]
    api["gameon-api<br/>accounts on 8080"]
    pg[("gameon-postgres<br/>volume skt_pg_data")]
    web -->|"/api/v1 and the socket"| api --> pg
  end
  user -->|"host port 8081, or Nginx Proxy Manager, or 443 with the TLS overlay"| web
```

The browser only ever talks to one origin. The API container runs read-only, as a non-root user,
with all capabilities dropped.

### `deploy.sh`

| Command | What it does |
| ------- | ------------ |
| `./deploy.sh` | Start, or rebuild what changed and start. |
| `./deploy.sh --setup` | Open the setup screen again, starting from the current `.env`. |
| `./deploy.sh --status` | URLs and the container table. |
| `./deploy.sh --ps` | The container table only. |
| `./deploy.sh --logs [svc…]` | Follow logs: all, or `postgres`, `api`, `web`. |
| `./deploy.sh --restart [svc…]` | Restart everything, or one or more of `postgres`, `api`, `web`. |
| `./deploy.sh --yes` | Skip a confirmation. The factory reset proceeds without typing `reset`, and `--migrate` copies without its yes prompt. |
| `./deploy.sh --rebuild` | Rebuild the images, then start. |
| `./deploy.sh --down` | Stop and remove the containers. The database and `.env` stay. |
| `./deploy.sh --backup` | Write a Postgres dump to `backups/`. |
| `./deploy.sh --data-dir [path]` | Keep Postgres in a folder (default `./data`) instead of the named volume. |
| `./deploy.sh --named-volumes` | Go back to the named volume. |
| `./deploy.sh --migrate` | Copy the database when changing where it is stored. |
| `./deploy.sh --help` | Everything above, and the keys of the setup screen. |

> [!CAUTION]
> `./deploy.sh --reset` and `./deploy.sh --down --volumes` are a factory reset: they delete the
> database (accounts, ratings, game records) and `.env`. They ask you to type `reset` first.
> `--yes` skips that prompt. With no terminal and no `--yes`, nothing is deleted. Run
> `./deploy.sh --backup` first.

### Three ways to expose it

| Mode | How | Result |
| ---- | --- | ------ |
| **This machine** | `PROXY_MODE=local` (the default) | Host ports for the page, the API and Postgres. |
| **Nginx Proxy Manager** | `PROXY_MODE=npm` | No host ports. Point a proxy host at `http://gameon-web:80`, turn websockets on, and set `SKT_PUBLIC_ORIGIN`. Set `SKT_SECURE_COOKIE=1` when that origin is https. |
| **TLS in the stack** | `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build` | nginx on 80 and 443 with the certificate at `deploy/certs/fullchain.pem` and the key at `deploy/certs/privkey.pem`. Port 80 redirects to https. |

Docker stop sends SIGTERM. The API finishes writing the open games and exits, and the next start
replays them. `./deploy.sh` leaves a container it does not recreate running. Stop, restart, and a
recreate send the signal.

## Tests and quality gates

Nothing is called done without the gate's output ([definition of done](docs/agent-rules/definition-of-done.md)).

| Area | Gate | What it covers |
| ---- | ---- | -------------- |
| Web | `vp check` · `vp test` · `vp build` | Format, lint, strict types; unit tests; the fixtures replayed; every protocol sample parsed; the renderer compared step by step with the legacy page. |
| Server | `cargo fmt --check` · `cargo clippy --all-targets -- -D warnings` · `cargo test --workspace` | The engine replaying every fixture; property tests that no seat's view holds another seat's cards; real-socket integration tests; forged intents. |
| Both | `npm run e2e` | Real browsers at one table: a whole game, a reload in the middle of a trick, a cheat attempt. |
| Bots | `server/scripts/bot-pass.sh` | Thousands of bot games for faults and balance. |

CI runs the web gate and the fixture check ([`web.yml`](.github/workflows/web.yml)), the offline
PWA script, and the server gate with Postgres 16 ([`server.yml`](.github/workflows/server.yml)).

**Manual smoke paths**, after a change to the table, lobbies or reconnects:

1. **Solo.** Start a game against bots, play a round, reload, resume.
2. **Friends.** Open a private table, join by code in a second browser, play a full game.
3. **Reconnect.** Drop one player's network in the middle of a trick. They return to the same seat and hand.
4. **Cheat probe.** From the console, send a play out of turn, a card not in hand and a bid for another seat. Each is rejected and nothing changes.

## Contracts: protocol and fixtures

Two sets of generated files keep the two halves honest. Neither is edited by hand.

```mermaid
flowchart LR
  doc["docs/protocol.md<br/>the contract"] --> crate["skt-protocol<br/>Rust wire types"]
  crate -->|"export-protocol"| ts["web/src/protocol/generated/"]
  crate -->|"export-protocol"| samples["fixtures/protocol/*.json"]
  samples --> webtests["web tests parse every sample"]

  legacy["legacy/Skull King Tavern.html<br/>the reference rules"] -->|"npm run fixtures"| games["fixtures/engine/*.json"]
  games --> js["web/src/game replays them"]
  games --> rs["skt-engine replays them"]
```

- **Protocol.** A change starts in [`docs/protocol.md`](docs/protocol.md), then the Rust types, then
  one run of `export-protocol`, all in the same piece of work. A change an older client cannot read
  bumps the `protocol` integer; the server answers an unknown version with `PROTOCOL_UNSUPPORTED`
  and the page says "reload to update". Rule: [`protocol-contract.md`](docs/agent-rules/protocol-contract.md).
- **Engine.** Each file in `fixtures/engine/` is one whole game: the settings, the deals, every
  action, every event and every seat's view after it. Both engines must replay all of them exactly.
  They are regenerated only for an intended rule change, never to make a port pass. Spec:
  [`docs/engine-conformance.md`](docs/engine-conformance.md).

## Design

| File | Holds |
| ---- | ----- |
| `design/web.pen` | Tokens, components and the screens of the table renderer. |
| `design/gameon.pen` | The GameOn frame: landing, Games, sign-up, profile, ladder, the footer's pages. |
| `design/skt.pen` | Skull King's home, the solo setup and the online tables. |
| `design/brand/gameon/` | The GameOn mark, wordmark and logo as SVG. |
| `design/card-art/` | Illustrated card fronts, suits and the scripts that compose them. |

`.pen` files are edited only in [Pen](https://pen.dev), through the Pencil MCP tools when an agent
does it, and never read or written as text. Every visible change in `web/` lands in the design in
the same piece of work, using the tokens of `web/src/styles/tokens.css`
([design sync](docs/agent-rules/design-sync.md)).

<p align="center">
  <img src="docs/readme/card-art.png" alt="Illustrated card fronts: Skull King, Pirate, Mermaid, Tigress, Kraken, White Whale, Loot and Escape" width="100%">
</p>

<p align="center"><sub>Card fronts from <code>design/card-art/fronts/</code>. The client draws its cards as SVG today.</sub></p>

## Working on it with AI agents

This repository is built by two coding agents that never see each other's sessions. The owner
carries the work between them by copy and paste.

| Agent | Owns | Never edits |
| ----- | ---- | ----------- |
| **Claude** | `web/`, `design/`, `fixtures/engine/` and its generator | `server/`, Compose and deploy files, CI, generated protocol files |
| **Grok** | `server/`, `docker-compose*.yml`, `deploy.sh`, `deploy/`, `.github/`, `web/src/protocol/generated/`, `fixtures/protocol/` | `web/`, `design/*.pen`, `fixtures/engine/` |
| **Owner** | `AGENTS.md`, `docs/agent-rules/`, every push and every merge to `master` | |

`docs/` is shared. `docs/protocol.md` and `docs/engine-conformance.md` change only as the
[protocol rule](docs/agent-rules/protocol-contract.md) says.

### The loop

```mermaid
sequenceDiagram
  actor O as Owner
  participant C as Claude (web)
  participant R as Repository (dev)
  participant G as Grok (server)
  O->>C: Paste the newest handover addressed to Claude
  C->>R: Work in web/, run the gate, commit
  C->>R: Write docs/handover/NNN-claude-to-grok-slug.md
  C-->>O: Print the same handover in one code block
  O->>G: Paste it
  G->>R: Work in server/, run the gate, commit
  G->>R: Write docs/handover/NNN-grok-to-claude-slug.md
  G-->>O: Print the same handover in one code block
  Note over O,G: Repeat. The handover is the only channel between the agents.
```

### Continuing the work, step by step

1. **Be on `dev` with a clean view of the tree.**
   ```bash
   git switch dev
   git status --short
   ```
2. **Find where things stand.** The newest files in `docs/handover/` are the current state. Each
   one names the commit, what the gate printed, what is not done and the next task.
   ```bash
   ls docs/handover | tail -5
   ```
3. **Open the agent in the repository root.** Claude Code reads `CLAUDE.md`, which loads
   `AGENTS.md` and every rule file. Any other agent is pointed at `AGENTS.md`.
4. **Paste the handover as the first message**, or give a task of your own (templates below).
5. **Let it finish the package.** It stays in its own paths, runs its gate, commits on `dev` with a
   prefixed message, and ends with a new handover, written to `docs/handover/` and printed in a
   code block.
6. **Paste that block into the other agent.** Push when you decide to. Agents do not push.

### Prompts that work

Continue from a handover:

```text
Read AGENTS.md and docs/handover/<newest file addressed to you>, then do the task in it.
```

Start a new piece of work:

```text
You are Claude, working on Skull King Tavern. Read AGENTS.md first.
Task: <what should change, and where the player sees it>.
Done when: vp check, vp test and vp build pass, and <the behaviour you want to see>.
End with a handover for Grok.
```

Ask for something that crosses the line between the two:

```text
The ladder should show <new thing>. Read docs/protocol.md §4 first. Change what is yours,
and put what you need from the other agent in the handover as a request, with the exact
message, field and error code.
```

### What the rules guarantee

Every rule is one file in [`docs/agent-rules/`](docs/agent-rules/), indexed in
[`AGENTS.md`](AGENTS.md).

| Rule | In one line |
| ---- | ----------- |
| [Server authority](docs/agent-rules/server-authority.md) | The server decides and hides. The client sends intents and renders what it is given. |
| [Ownership and handover](docs/agent-rules/ownership-and-handover.md) | Stay in your own paths. End every package with a paste-ready handover. |
| [Protocol contract](docs/agent-rules/protocol-contract.md) | The doc, the Rust types, the generated TypeScript and the samples change together. |
| [Design sync](docs/agent-rules/design-sync.md) | Every visible change also lands in the `.pen` design. |
| [No deprecated APIs](docs/agent-rules/no-deprecated-apis.md) | Replace them. Never suppress the warning. |
| [No AI attribution](docs/agent-rules/no-ai-attribution.md) | No `Co-Authored-By` trailer and no "Generated with" footer. |
| [Git](docs/agent-rules/git.md) | Work on `dev`. No new branch, worktree or push unless the owner asks. Prefixed commit messages. |
| [Data safety](docs/agent-rules/data-safety.md) | Nothing destructive unless the owner named that action. |
| [Rust quality](docs/agent-rules/rust-quality.md) | No panics outside tests, no lint suppressions, no blocking in async. |
| [API and migrations](docs/agent-rules/api-and-migrations.md) | One error envelope. Applied migrations are immutable. |
| [Web quality](docs/agent-rules/web-quality.md) | Strict TypeScript, tokens only, every remote string escaped. |
| [Definition of done](docs/agent-rules/definition-of-done.md) | Evidence before assertions: the commands and what they printed. |

Commit messages begin with exactly one of `ADD:`, `TASK:`, `FIX:`, `BUGFIX:`, `DOCS:` or `CHORE:`.

### Things only the owner can do

- **Push and merge.** Agents commit on `dev` and stop there.
- **Save the design.** Pencil edits live in the running Pen app until you press ⌘S. The agent will
  ask for it.
- **Allow anything destructive**, by naming it: `./deploy.sh --reset`, dropping a table, a force-push.
- **Change a rule.** An agent proposes it in a handover. To add one: a file in `docs/agent-rules/`,
  a row in `AGENTS.md` and an `@docs/agent-rules/<file>.md` line in `CLAUDE.md`.

### Tooling notes

- **Claude Code.** `.claude/settings.json` switches commit and pull request attribution off.
  `.claude/launch.json` is local and git-ignored; it names the dev servers the preview pane may
  start. A minimal one:
  ```json
  {
    "version": "0.0.1",
    "configurations": [
      {
        "name": "tavern-web",
        "runtimeExecutable": "npm",
        "runtimeArgs": ["--prefix", "/absolute/path/to/web", "run", "dev", "--", "--port", "5173", "--strictPort"],
        "port": 5173
      }
    ]
  }
  ```
- **Design work** needs Pen running with the file open and the Pencil MCP server connected.
- **The mock server** (`?mock`) lets the web agent build and test an online screen before the
  server has the endpoint. The handover then tells the server agent exactly what to build.
- **Two agents, one checkout.** Uncommitted files in the other agent's paths are its work in
  progress. Nobody stages, stashes or restores them.

## Documentation map

| Read this | For |
| --------- | --- |
| [`docs/multiplayer-plan.md`](docs/multiplayer-plan.md) | The plan: architecture, what players get, phases, decisions and risks. |
| [`docs/protocol.md`](docs/protocol.md) | Every REST endpoint, socket message, DTO, error code and timer. |
| [`docs/engine-conformance.md`](docs/engine-conformance.md) | How the Rust engine is held to the reference: fixtures, views, events, rejections. |
| [`docs/security-review.md`](docs/security-review.md) | The pre-launch review against the server-authority rule. |
| [`docs/agent-rules/`](docs/agent-rules/) | The rules, one per file. |
| [`docs/handover/`](docs/handover/) | The numbered log of every package handed between the agents. |
| [`web/README.md`](web/README.md) | The client in depth: addresses, screens, online behaviour, sound. |
| [`web/e2e/README.md`](web/e2e/README.md) | The browser scripts and what they run against. |
| [`.env.example`](.env.example) | Every configuration key, with comments. |

## Notice

This is an unofficial fan project. Skull King is a trademark of Grandpa Beck's Games, and the rules
of the game are theirs. The art in this repository is original. The recorded sounds and the menu
music were generated with ElevenLabs and are subject to the plan they were generated under
(`web/README.md`).
