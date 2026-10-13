You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `README.md`, and this file. You edit `README.md` only. You do not edit `server/`,
`web/`, `design/`, `docs/protocol.md`, `AGENTS.md`, or `docs/agent-rules/`.

## State

- Branch `dev`, not pushed. The readme is still commit `118e98e`
  (`DOCS: Add a readme for the whole stack, with screenshots and diagrams.`).
- This review changed no code, no message, no field, no error code, no fixture, and no generated
  file. Protocol stays 1. No `cargo` or `vp` gate was run. Path C was not started.
- Checked against the current tree: Quick start A and C, Architecture, Development → Server,
  Configuration, Deployment, and the server row of Tests and quality gates.

## Corrections

Apply these to `README.md`. Each item is the readme line, then what is true, then where that is
proven. Leave every other sentence as it is.

1. Line 171, "the pile" in "A seat never receives another hand, an unrevealed bid, the pile or the
   deck order."

   The other three claims stay. A view carries that seat's hand only (`GameState::view` in
   `server/crates/skt-engine/src/game.rs`, the `hand` field around line 190). While bidding, another
   seat's bid is sent as `-1`, not the number (`view_bids`, lines 790–796). `game.start` sends the
   canonical deck list, and that list is not the shuffle (`game.rs` lines 216–218,
   `server/crates/skt-server/src/world/table.rs` line 1819).

   The pile claim is wrong while an ability is open. The acting Seer's view includes
   `pending.peek`, a copy of the undealt pile, and every other seat's peek is omitted
   (`view_pending`, `game.rs` lines 803–819). Cards drawn for the acting Smuggler are
   `pending.drawn` on that seat's view only (same function, line 812). After the ability closes,
   the Seer's memory of the pile is not written onto a view (`seer_memory`, lines 248–252).

2. Lines 188–190, the `else rejected` branch of the play diagram
   (`err` `NOT_YOUR_TURN`, `STALE_ACTION`, or `ILLEGAL_MOVE`, and "a rejected intent changes
   nothing").

   Those three codes, and "changes nothing", are the live seated case. Freshness fails as
   `STALE_ACTION` before the engine runs (`table.rs` `player_step`, lines 956–958). The engine
   rolls the step back on `NotYourTurn` or `IllegalMove` (`game.rs` `play` uses `transact`, lines
   137–143; `code_of` at `table.rs` lines 2120–2124). `ok` is queued on the acting socket before
   that seat's `game.update` (`server/crates/skt-server/src/world.rs` lines 4–5, `table.rs` lines
   977–979).

   Three outcomes the branch does not show:
   - The table has already finished (`running.over`): `Tables::act` returns with no `ok` and no
     `err` (`table.rs` lines 732–734).
   - The player has no seat: `err` code `NOT_IN_GAME` (`table.rs` lines 718–727).
   - The engine returns `StepError::Broken`: `err` code `INTERNAL` (`table.rs` lines 966–968).

3. Lines 384–385. "Local pages on any port, plus `SKT_PUBLIC_ORIGIN`."

   The allow-list is `http://localhost` and `http://127.0.0.1`, with a port or without one, plus
   an exact match of `SKT_PUBLIC_ORIGIN` after the trailing slash is removed
   (`server/crates/skt-server/src/origin.rs` lines 12–35). `https://localhost` is rejected (test at
   lines 56–57). A missing `Origin` header is `FORBIDDEN` (`check_origin`, lines 38–43). The check
   runs on the state-changing routes and the socket upgrade: guest, register, login, logout,
   patch me, and `/api/v1/ws` (`http_api.rs` lines 257, 285, 330, 366, 395, 602).

4. Line 371, `SKT_TRUSTED_PROXIES`.

   Empty means no proxy is trusted and both forwarded headers are ignored, so every caller behind
   one TCP peer shares that peer's address (`rate.rs` lines 110–114 and 162–163). Compose sets
   `172.16.0.0/12` when the variable is unset or empty (`docker-compose.yml` line 77).

   A trusted peer may set `X-Forwarded-For`. `X-Real-IP` is used when that chain does not yield an
   untrusted address (`rate.rs` `client_key`, lines 156–185; `http_api.rs` `caller`, lines
   910–920). The budget those addresses share is register and login only: 5 registrations and 10
   logins a minute (`rate.rs` lines 12–31). `register` and `login` are the only callers
   (`http_api.rs` lines 286–290 and 331–335).

5. Line 370, `SKT_SECURE_COOKIE`, and line 445, the Nginx Proxy Manager row.

   `1` adds `Secure`. So do `true`, `TRUE`, and `True` (`http_api.rs` lines 984–992). Set it when
   the page is served over https. The npm compose comment says the same thing
   (`docker-compose.npm.yml` lines 15–16). `deploy.sh` help tells an NPM deploy to set
   `SKT_PUBLIC_ORIGIN` and does not require `SKT_SECURE_COOKIE=1` (`deploy.sh` lines 148–154).

6. Line 363, "`npm` publishes none and joins `proxy-network`."

   NPM publishes no host ports (`deploy.sh` `compose`, lines 2115–2118, uses
   `docker-compose.npm.yml` and not the local overlay). The API and the page join
   `proxy-network`. Postgres stays on `skt-internal` (`docker-compose.npm.yml` lines 21–30;
   `deploy.sh` `net_default`, lines 490–498, and help lines 151–152).

7. Lines 448–449. "A deploy sends SIGTERM. The API finishes writing the open games and exits, and
   the next start replays them."

   Docker stop sends SIGTERM. The process handles SIGTERM and SIGINT, calls `persist_open`, and
   then exits (`main.rs` lines 33–46). The next start loads `open_games` and replays them
   (`http_api.rs` `connect`, lines 69–73; `world.rs` `resume`, lines 360–366). `./deploy.sh` on a
   stack it leaves running does not send that signal. Stop, restart, and a recreate do, because
   those go through Docker stop (`deploy.sh` help line 98; `compose up` is line 2369).

8. Line 297. "It exits 0 when every game finishes and 1 when a game faults or the pass is stopped."

   That part matches `usage()` (`server/crates/skt-bot-pass/src/main.rs` lines 427–429) and
   `exit_code` (lines 102–104). A bad argument, a failed Ctrl-C handler, or a failed terminal
   setup exits 2 (`main`, lines 74–83).

9. Line 436, the factory-reset caution.

   The two commands do delete the active database and `.env`, after confirmation. The prompt is
   `Type reset to continue:` unless `--yes` was passed. With no terminal and no `--yes`, nothing
   is deleted (`deploy.sh` `confirm_reset`, lines 2045–2063). `--yes` is a real flag (line 2248)
   and the command table does not list it.

10. Lines 426–427, `--logs` and `--restart`.

    The script passes the service names through to Compose (`deploy.sh` lines 2319–2328). The
    Compose services are `postgres`, `api`, and `web` (`docker-compose.yml`). Help text lists
    `api` and `web` only (lines 85–86). `postgres` works. `--restart` accepts one name or several.

## Cargo test

`cargo test --workspace` is run from `server/`. The workspace root is `server/Cargo.toml`.

It needs a running Postgres. The `#[sqlx::test]` functions in
`server/crates/skt-server/src/phase2_tests.rs`, `phase3_tests.rs`, and `solo_tests.rs` call
`dotenvy::var("DATABASE_URL")`, which panics with `DATABASE_URL must be set` when the variable is
missing and no `.env` can be loaded (`sqlx-postgres` 0.8.6, `src/testing/mod.rs` lines 43 and 96).
dotenvy walks upward from the test process's current directory, so a repo-root `.env` written by
`./deploy.sh` is visible when cargo is started in `server/`. The `skt-server` binary does not do
that lookup (`main.rs` lines 13–15 read the process environment only). The readme sentence that
the server does not read `.env` stays true.

The URL has to connect, and the role has to be allowed to create and drop databases. sqlx connects
to the database named in the URL, creates schema `_sqlx_test` there, and creates a temporary
database per test. The `migrations = "../../migrations/postgres"` attribute applies
`server/migrations/postgres/` to that temporary database. The tests bind their own listeners.
They do not start a separate `skt-server` process.

These do not need Postgres: `skt-engine` (conformance and the leak proptest), `skt-protocol`,
`skt-bot-pass`, and `phase1_tests.rs`. `cargo fmt --check` and `cargo clippy` do not need it.
There is no `sqlx::query!` macro, so compiling does not open a database.

If Postgres is down, or `DATABASE_URL` cannot be resolved, `cargo test --workspace` fails. Those
tests are not skipped.

CI does what the readme says. `.github/workflows/server.yml` lines 24–39 and 63–64 start
`postgres:16-alpine` and set `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt`. That is the
same URL as path C and `.env.example`. `docker-compose.yml` line 30 uses `postgres:16-alpine`.
The tests do not pin the major version.

Line 280 and line 458 describe the command and do not say a local run needs Postgres. Line 463 is
the only place Postgres 16 is mentioned, and it is the CI job. Add the local requirement beside
the server command.

## Leave these as they are

- Quick start A (lines 84–100) matches `deploy.sh` help: first run on a terminal with no `.env`
  opens setup, `s` saves and starts (help lines 100–105, key `s` at line 905), the default local
  URLs are `http://localhost:8081` and `http://localhost:8080/api/v1/health` (help lines 88–90,
  route in `server/crates/skt-server/src/lib.rs` lines 40 and 83). `--down` keeps the database
  (help line 75). It also keeps `.env`. The sentence does not say otherwise.
- Quick start C (lines 116–133). `docker-compose.local.yml` lines 8–9 publish Postgres on
  `127.0.0.1`. User, password, and database default to `skt` in `docker-compose.yml` lines 38–40,
  so the command works when `.env` is absent. `cargo run` from `server/` starts `skt-server`
  (`server/Cargo.toml` line 9, `default-members`). It listens on `127.0.0.1:8080` unless `HOST`
  and `PORT` are set (`main.rs` lines 62–65) and applies migrations on connect (`store.rs` lines
  97–99). A running `skt-api` holds host port 8080 (`docker-compose.local.yml` lines 12–13).
  `PORT` is the server's port. `SKT_API_TARGET` is the dev proxy (`web/vite.config.ts` line 14).
- The architecture diagram does not say "one task per table", and it should stay that way.
  `docs/multiplayer-plan.md` §2 lines 71 and 91 still say one tokio task per table. `main.rs`
  lines 20–28 spawn one task that ticks every table every 200 ms. `world.rs` lines 3–5: one mutex
  owns every table.
- Shuffles use `rand::rng()` (`server/crates/skt-server/src/random.rs` lines 19–20). In rand 0.9
  that is `ThreadRng`: ChaCha12 seeded from `OsRng` (rand 0.9.5 `src/rngs/thread.rs` lines 49–59).
  `GameState` does not implement `Serialize` (`game.rs` line 3).
- The session cookie is `skt_session`, `HttpOnly`, `SameSite=Strict`, `Path=/` (`http_api.rs`
  lines 995–1001). The client reconnects with backoff (`web/src/net/socket.ts` lines 234–243).
  The server's `welcome` is the snapshot (`world.rs` lines 1422–1438).
- The server command table's `bot-pass` options match `usage()` and the constants
  `DEFAULT_GAMES` 1000 and `DEFAULT_SEED` `0x5EED_5A11` (`skt-bot-pass/src/main.rs` lines 26–27
  and 409–429). Suites are `easy`, `normal`, `hard`, and `mixed` (`stats.rs` lines 76–83).
  `--plain` is also selected when stdout is not a terminal (line 129). The default report
  directory is `target/bot-pass/` (`write_default`, lines 330–339).
- Clippy is `all` and `pedantic` (`server/Cargo.toml` lines 34–36). No `allow` attribute is in
  `server/`.
- `export-protocol` writes `web/src/protocol/generated/` and `fixtures/protocol/`
  (`server/crates/skt-protocol/src/bin/export-protocol.rs` line 1).
- The API image runs as user `skt` (uid 10001) and the compose service is read-only with every
  capability dropped (`server/Dockerfile` lines 35–39, `docker-compose.yml` lines 83–89).
- The deploy command table matches `show_help` (`deploy.sh` lines 69–83), apart from items 9 and
  10 above. The TLS row matches `docker-compose.prod.yml` and the 301 in
  `deploy/nginx/nginx-tls.conf.template` lines 3–15.
- The server test row's coverage is right: conformance replays `fixtures/engine`
  (`server/crates/skt-engine/tests/conformance.rs`), the leak proptest is
  `server/crates/skt-engine/src/leak.rs` `proptest_hidden_information`, and phase 1–3 and solo
  tests bind a real `TcpListener`. What the row omits is the Postgres requirement in the Cargo
  test section above.

When `RUST_LOG` is unset, the process filter is `info,skt_server=info,tower_http=info,sqlx=warn`
(`logging.rs` line 28). The `.env` default `info` is what setup writes (`.env.example` line 17)
and what Compose passes (`docker-compose.yml` line 68). The configuration table is about `.env`.
Add the unset filter to the server-process paragraph so those two defaults stay distinct.

## Your task

1. Edit `README.md` with the ten corrections, the cargo-test requirement, and the unset `RUST_LOG`
   filter. Keep the true halves of the sentences named above.
2. Do not add "one task per table".
3. Change no other file. Protocol stays 1.

## Contracts

Frozen: `docs/protocol.md`, `skt-protocol`, `web/src/protocol/generated/`, `fixtures/`, `server/`,
`web/`, `design/`. You may edit `README.md`.

## Done when

The ten sentences, the server test command, and the unset `RUST_LOG` filter say what this file
proves, and `git diff` for the readme is only those edits.

## Report back

A handover for Grok in `docs/handover/` (the next free number), printed in one fenced code block.
Name the readme commit and the lines you changed. If you leave a correction out, say which one and
why.
