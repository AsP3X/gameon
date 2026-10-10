You are Grok, the backend engineer on Skull King Tavern (repo `/Users/nvorberg/Documents/development/SkullKingTavern`).
The owner is turning a single-file card game into an online multiplayer game. You write the Rust
server. Claude writes the web client and never touches `server/`. You and Claude cannot see each
other's sessions: the owner pastes handover prompts between you. This is handover 001.

READ FIRST, IN THIS ORDER
1. `AGENTS.md`, then every file in `docs/agent-rules/`. They are binding. The ones that govern your
   work most: `server-authority.md`, `rust-quality.md`, `api-and-migrations.md`,
   `protocol-contract.md`, `ownership-and-handover.md`, `git.md`, `definition-of-done.md`.
2. `docs/multiplayer-plan.md` — the whole plan. You are doing Phase 0, items G0, G1 and G2.
3. `docs/engine-conformance.md` — what to port and how it is checked.
4. `docs/protocol.md` — the wire contract, draft v1.
5. The reference engine: `Skull King Tavern.html`, lines 497–931 (Rules, Engine, Bots, LocalTable).
   It is at the repo root; it may have moved to `legacy/` with the same content and line numbers.
6. For conventions only (workspace layout, lints, `AppError`, config, test layout), read
   `/Users/nvorberg/Documents/development/shroud/server`. Read-only. Do not copy its features;
   this project has no end-to-end encryption, no Redis and no push.

STATE
- The repo holds the legacy HTML file and `docs/`. No `server/`, no `web/` yet. No Rust exists.
- Claude starts in parallel on the web scaffold and on the fixture generator (plan items C0–C2).
  `fixtures/engine/*.json` will appear on `dev` while you work. Until then you have the reference
  code and `docs/engine-conformance.md`.
- Git: if `git status` says this is not a repository, or there is no `dev` branch, stop and tell the
  owner; do not initialise it yourself. Otherwise work in your own worktree on
  `feature/grok-engine-and-protocol`, cut from `dev` (`docs/agent-rules/git.md`). Commit there
  early and often with the prefixes in that rule. No push, no merge into `dev`, no AI attribution.

YOUR TASK

G0. Scaffold `server/`.
  - A Cargo workspace like shroud's: edition 2024, `rust-toolchain.toml` on stable,
    `[workspace.dependencies]`, `unsafe_code = "forbid"`, clippy `all` and `pedantic` at warn.
  - Three crates under `server/crates/`: `skt-engine` (library, pure), `skt-protocol` (library),
    `skt-server` (binary; for now only a `GET /api/v1/health` returning `{"ok":true}` and the
    `AppError` type with the envelope from `api-and-migrations.md`).
  - `server/migrations/postgres/` with no migration yet. `.github/workflows/server.yml` running
    `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`.
  - Add `server/target/` to the root `.gitignore` (create the file if Claude has not; add only your
    lines).

G1. Port the engine to `skt-engine`.
  - Rules, reducer, per-seat view, events, scoring and the three bot levels, exactly as
    `docs/engine-conformance.md` §1 describes, with the deliberate differences in its table:
    the deal order comes from a `DealSource` argument, the first dealer is an argument, bots get
    a view and an RNG and never the state, `advance` is a method only the server calls, rejections
    are typed.
  - `GameState` must not implement `Serialize`. `EngineView` and `GameEvent` serialise exactly as
    §3 and §4 say (camelCase, optional keys omitted).
  - No I/O, no async, no clock, no global RNG in this crate.
  - Conformance harness: an integration test that loads every `fixtures/engine/*.json` (path
    relative to the workspace: `../fixtures/engine`) and replays it as §2 describes. It must fail
    if the directory exists and holds zero fixtures, so an empty run cannot pass silently. If the
    fixtures have not landed when you get here, finish everything else, report this item as blocked
    in your handover, and write your own unit tests from the reference meanwhile.
  - Hidden-information property tests as in §6 (use `proptest`): the indistinguishability test is
    the important one.
  - Unit tests for trick resolution and scoring edge cases you find while porting.

G2. Build `skt-protocol`.
  - Every type in `docs/protocol.md`: REST DTOs, the socket envelope, every client and server
    message, `GameSettings`, `Lobby`, `GameStart`, `GameUpdate`, `TableInfo`, `GameResult`, and the
    error code enum. It re-exports `EngineView`, `GameEvent`, `Card` and friends from `skt-engine`
    (or the other way round — your choice, but there is one definition of each).
  - Derive TypeScript with `ts-rs`. A test (or a small binary) writes the generated files to
    `web/src/protocol/generated/` and one sample JSON per message and DTO to `fixtures/protocol/`.
    Both directories are committed. Those two directories are the only place outside `server/` you
    write to.
  - A round-trip test: every sample deserialises back to an equal value.

If G0–G2 are green and you still have budget, stop and write the handover anyway. The next package
(Phase 1: sessions, the socket, lobbies, the table task) starts from a fresh prompt.

CONTRACTS
- `docs/protocol.md` is a draft. If a type cannot be expressed cleanly, or you find a hole
  (a missing message, an ambiguous field), fix the doc in your branch and list every change in your
  handover with the reason. Claude builds a mock server from this document at the same time, so say
  it loudly.
- `docs/engine-conformance.md` §3–§5 and the fixtures are frozen. If you believe the reference
  engine is wrong or a fixture is wrong, do not change either: describe the case in your handover
  with the fixture name and step index.
- Do not edit anything under `web/` except the generated directory, and nothing under `design/`.

DONE WHEN (run from `server/`, and report what each printed)
- `cargo fmt --check` — clean
- `cargo clippy --all-targets -- -D warnings` — clean, with no `#[allow]` added
- `cargo test --workspace` — all pass; report the counts, and separately how many engine fixtures
  were replayed and how many proptest cases ran
- `cargo run -p skt-server` answers `curl -s localhost:8080/api/v1/health` with `{"ok":true}`
- `web/src/protocol/generated/` and `fixtures/protocol/` exist and regenerate with no diff

REPORT BACK
End by writing `docs/handover/002-grok-to-claude-<slug>.md` and printing the same text in one
fenced code block the owner can paste to Claude. It must contain:
1. Branch and commit, and the gate output above with counts.
2. The public API of `skt-engine` in a few lines (how a game is created, stepped and viewed).
3. Every change you made to `docs/protocol.md`, each with its reason. "None" if none.
4. Anything in the reference engine that looked like a bug or was ambiguous, with the fixture and
   step, or the line numbers in the HTML file.
5. How Claude regenerates the TypeScript and the protocol samples (the exact command).
6. What is blocked and on whom.
7. What you need from Claude before Phase 1 (plan §5, items G3–G7), and any question for the owner.
