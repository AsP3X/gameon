# 131 · Claude → Grok · the readme describes your half too

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, then `README.md` at the repository root, then this file. You do not edit `web/`
or `design/`. `README.md` is not in your paths either: send corrections back as a request.

## State

- Branch `dev`, not pushed. The readme is commit `118e98e`
  (`DOCS: Add a readme for the whole stack, with screenshots and diagrams.`). Its pictures are
  `docs/readme/*.png`, committed in `c3e8294`.
- The owner asked for it: one readme for setup, usage, configuration, options and continuing the
  work with the two agents, with visuals.
- Documentation only. No code, no message, field or error code, no generated file, no fixture, no
  edit to `docs/protocol.md`, `AGENTS.md` or `docs/agent-rules/`. Protocol stays 1.
- What I wrote about your paths, and where I took it from:
  - Quick start A and the Deployment section: `deploy.sh --help`, `.env.example` and the comments
    in the five `docker-compose*.yml` files.
  - Quick start C: Postgres alone with
    `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d postgres`, then
    `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt cargo run` in `server/`. I did not run
    this path today.
  - The server process: `HOST`, `PORT`, `DATABASE_URL`, `RUST_LOG`, `RUST_LOG_FORMAT`,
    `SKT_PUBLIC_ORIGIN`, `SKT_SECURE_COOKIE`, `SKT_TRUSTED_PROXIES`, from `main.rs`, `origin.rs`,
    `rate.rs`, `logging.rs` and `http_api.rs`. It says the server does not read `.env` itself.
  - `bot-pass`: the options and exit codes from `usage()` in `skt-bot-pass/src/main.rs`.
  - The architecture section does not say "one task per table", which is what
    `docs/multiplayer-plan.md` §2 says and `main.rs` does not do.
  - The clocks table: `docs/protocol.md` §5.6.
- Checked: every relative link and image path in the readme exists; the five Mermaid diagrams
  parse and render (mermaid 10.9.1 in headless Chrome); `./deploy.sh --help` runs. No `vp` or
  `cargo` gate was run, because nothing they cover changed.
- The screenshots are the dev server with the in-page mock (`?mock`), headless Chrome. Nothing was
  sent to the Compose API and no row was written to the database.
- Design: no UI changed, so no `.pen` file was touched.

## Your task

1. Read the sections that describe your paths: Quick start A and C, Architecture, Development →
   Server, Configuration, Deployment, and the server row of Tests and quality gates.
2. Report every sentence that is wrong or out of date, with the file and line that proves it.
3. Say whether `cargo test --workspace` needs a running Postgres and `DATABASE_URL`. The readme
   only says CI runs it with Postgres 16.
4. Nothing to build.

## Contracts

- Frozen and untouched: `docs/protocol.md`, `skt-protocol`, `web/src/protocol/generated/`,
  `fixtures/`.
- You may not edit `README.md`. I change it from your report.

## Done when

You have read those sections against the code and listed the corrections, or said there are none.

## Report back

A handover for Claude in `docs/handover/` (the next free number), printed in one fenced code
block: the corrections as "readme line → what is true → where it is proven", and the answer to
item 3.
