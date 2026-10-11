You are Claude, the web engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the web client. Grok writes the
Rust server and never edits `web/` except the generated protocol tree. You and Grok cannot see each
other's sessions: the owner pastes handover prompts between you. This is handover 006. Part A of
your 005 is done. Phase 1 is not open.

READ FIRST, IN THIS ORDER
1. `AGENTS.md`, then every file in `docs/agent-rules/`. The ones that govern what you do next:
   `ownership-and-handover.md`, `web-quality.md`, `design-sync.md`, `git.md`,
   `definition-of-done.md`.
2. `.github/workflows/web.yml` on the commit named below. That is the CI for `web/`.
3. `docs/multiplayer-plan.md` Phase 0, your remaining items: the UI lift inside C2, and C3
   (`design/web.pen`). Phase 1 stays closed until the owner opens it.

STATE

Branch `feature/grok-web-ci`, implementation commit `222d30b`
(`222d30b6d3bfb83e0b36e1635e6cdd0f576d1f62`). This handover file is the next commit on that branch
and is not part of `222d30b`. The branch is local, checked out in
`/Users/nvorberg/Documents/development/SkullKingTavern`. It is not pushed. It is not on `dev`.
`dev` is `bfb45eb` (`bfb45eb15951d71eb7f5e18a2790793c4450502c`), the merge of `feature/grok-gate0`,
`feature/claude-fixture-8p-classic`, and `feature/claude-web-scaffold`. The owner ran that merge
by telling Grok to. Do not merge `feature/grok-web-ci` yourself.

`222d30b` adds `.github/workflows/web.yml` and nothing else.

A1 ran on this branch, which contains that merged `dev`. From `server/`:

- `cargo fmt --check` — clean, no output, exit 0.
- `cargo clippy --all-targets -- -D warnings` — clean, exit 0. No `#[allow]` added.
- `cargo test --workspace -- --test-threads=8 --show-output` — 31 passed, 0 failed:
  - `skt-engine` lib: 23 passed (3.52s), including `leak::proptest_hidden_information` with
    `cases: 32` and `leak::every_player_count_hides_the_same_information`.
  - `skt-engine` conformance: 1 passed (9.65s). The test printed `replayed 41 engine fixtures`.
  - `skt-protocol`: 3 passed (0.46s). Error messages, fixture round-trip, TypeScript regeneration
    has no diff.
  - `skt-server`: 4 passed.
  - Doc-tests and the export binary: 0 tests.

A2 ran. The workflow uses Node 24 and, from `web/`, runs `npm ci`, `npx vp check`, `npx vp test`,
`npx vp build`, and `node scripts/generate-engine-fixtures.mjs --check`. It triggers on `web/**`,
`fixtures/**`, `legacy/**`, and the workflow file. Paths on push and on pull request.

The same five commands were run locally from `web/` on Node v25.2.0 (npm 11.6.2). Node 24 is not
installed on this machine. vite-plus 1.1.0 and vitest 5.0.3 warn that they do not support Node 25
(they want `^22.18.0 || ^24.11.0 || >=26.0.0`). The commands still passed:

- `npm ci` — added 135 packages, audited 136, found 0 vulnerabilities.
- `npx vp check` — all 15 files formatted; no warnings, lint errors, or type errors in 12 files.
- `npx vp test` — 2 files, 45 tests passed (3 reference, 42 fixture replays, including
  `8p-classic-classic-all-41000.json`). Duration 3.77s.
- `npx vp build` — built in 56ms. `dist/index.html` 0.34 kB, `dist/assets/index-JLKBz0yd.js`
  219.69 kB.
- `node scripts/generate-engine-fixtures.mjs --check` — `fixtures/engine matches the generator
  (41 games).`

A3 ran and changed nothing. `server/` does not name `Skull King Tavern.html`.
`docs/engine-conformance.md` §1 and `docs/multiplayer-plan.md` §1 already say
`legacy/Skull King Tavern.html`. `server.yml` does not list `legacy/**`, because nothing under
`server/` reads that file. Past handover files still describe the old path. They are records of
what was true when they were written, so they were left as they are.

`docs/protocol.md`: None.

Part B did not run. The owner's message did not say "Phase 1 is open". G3–G7 are not started.
`ServerConfig.emotes` is still empty.

YOUR TASK

1. Finish the rest of C2: lift the legacy UI into typed modules, with no behavior change. The
   engine port in `web/src/game/` stays the behavior reference for that lift. Keep
   `legacy/Skull King Tavern.html` byte-identical unless you mean to change the rules, in which
   case the fixture generator's pinned hash has to move in the same change and the fixtures are
   regenerated on purpose.
2. C3: `design/web.pen`, tokens, components, and the existing screens, through the Pencil tools.
3. When `222d30b` is on `dev`, a change under `web/`, `fixtures/`, or `legacy/` runs
   `.github/workflows/web.yml`. Do not edit that file. CI is Grok's.
4. Stop there. This handover does not open Phase 1.

CONTRACTS

- Frozen: `docs/engine-conformance.md` §3–§5, `docs/protocol.md`, the 41 fixtures, and
  `legacy/Skull King Tavern.html` until a deliberate rule change.
- Changed by Grok in `222d30b`: `.github/workflows/web.yml` only.
- You may edit `web/` except `web/src/protocol/generated/`, `design/`, and, when regenerating on
  purpose, `fixtures/engine/` through the generator. You may not edit `server/`, `.github/`, or
  `legacy/` to make a test pass.
- Regenerate TypeScript only if a protocol change lands, from `server/`:
  `cargo run -p skt-protocol --bin export-protocol`.

DONE WHEN

- The UI lift plays solo, pass-and-play, and the scorekeeper the way the legacy file does.
- `npx vp check`, `npx vp test`, and `npx vp build` pass from `web/`.
- A visible UI change is also in `design/web.pen`.
- `node scripts/generate-engine-fixtures.mjs --check` still prints that the fixtures match.

REPORT BACK

Write `docs/handover/007-claude-to-grok-<slug>.md` and print the same text in one fenced code
block. It must itself be a paste-ready prompt for Grok ("You are Grok"), with who and where,
state, a numbered task, contracts, done when, and report back. Include: what of C2 and C3 landed;
any `docs/protocol.md` change, with the reason, or "None"; any fixture the Rust harness should
replay again, or "None"; and whether the owner has named the emote ids.
