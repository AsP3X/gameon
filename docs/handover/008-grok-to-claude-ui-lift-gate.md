You are Claude, the web engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the web client. Grok writes the
Rust server and never edits `web/` except the generated protocol tree. You and Grok cannot see each
other's sessions: the owner pastes handover prompts between you. This is handover 008. Part A of
your 007 is done. Phase 1 is not open.

READ FIRST, IN THIS ORDER
1. `AGENTS.md`, then every file in `docs/agent-rules/`. The ones that govern what you do next:
   `ownership-and-handover.md`, `design-sync.md`, `web-quality.md`, `git.md`,
   `definition-of-done.md`.
2. `docs/multiplayer-plan.md` Phase 0, item C3 (`design/web.pen`). Phase 1 stays closed until the
   owner opens it.

STATE

Branch `feature/grok-ui-gate`. The tree that passed the gates is `4845b2e`
(`4845b2e6ccd333c4ca4006cc1b6e9388182686c3`), which is also `dev`: the merge of
`feature/grok-web-ci` and `feature/claude-web-scaffold` (`b1101cc`, `b355e23`, and your handover
`c49d3b9`). This handover file is the next commit on `feature/grok-ui-gate` and is not part of
`4845b2e`. The branch is local, checked out in
`/Users/nvorberg/Documents/development/SkullKingTavern`. It is not pushed. Do not merge it. There
is no server or workflow change in it.

A1, from `web/`, on that merged tree, Node v25.2.0 (npm 11.6.2). Node 24 is not installed here.
vite-plus 1.1.0 and vitest 5.0.3 warn that they do not support Node 25 (they want
`^22.18.0 || ^24.11.0 || >=26.0.0`). The commands still passed. CI stays on Node 24.

- `npm ci` — added 135 packages, audited 136, found 0 vulnerabilities.
- `npx vp check` — all 44 files formatted; no warnings, lint errors, or type errors in 38 files.
- `npx vp test` — 11 files, 92 tests passed. Duration 10.71s. That includes the parity files under
  `src/tableview/parity/` and the 42 fixture replays.
- `npx vp build` — 42 modules, built in 186ms. `dist/index.html` 0.42 kB,
  `dist/assets/index-CiHR08xm.js` 338.50 kB, `dist/assets/index-Ds6jq9VY.css` 45.00 kB.
- `node scripts/generate-engine-fixtures.mjs --check` — `fixtures/engine matches the generator
  (41 games).`

Nothing failed, so `web/` was not edited and `web.yml` was not edited.

A2. The checkout step is `actions/checkout@v4` with no `sparse-checkout` and no path list. The
`paths` lists on the workflow only decide when it runs. When it runs, the job receives every file
at that commit, including `legacy/Skull King Tavern.html` and `fixtures/engine/`. Fetch depth
stays the action's default; a shallow fetch still contains those files.

A3, from `server/`, on the same tree:

- `cargo fmt --check` — clean, no output, exit 0.
- `cargo clippy --all-targets -- -D warnings` — clean, exit 0. No `#[allow]` added.
- `cargo test --workspace -- --test-threads=8 --show-output` — 31 passed, 0 failed:
  - `skt-engine` lib: 23 passed (5.00s), including `leak::proptest_hidden_information` with
    `cases: 32` and `leak::every_player_count_hides_the_same_information`.
  - `skt-engine` conformance: 1 passed (10.12s). The test printed `replayed 41 engine fixtures`.
  - `skt-protocol`: 3 passed (0.47s). Error messages, fixture round-trip, TypeScript regeneration
    has no diff.
  - `skt-server`: 4 passed.
  - Doc-tests and the export binary: 0 tests.

`web.yml`: None.

`docs/protocol.md`: None.

Colours. `User.color`, `SeatInfo.color`, a bot member's `color`, and `ProfilePatch.color` are
already `TableColor`, the eight hexes. A `PATCH /me` body whose `color` is anything else fails to
deserialise. The route itself is Phase 1. It will use that type.

Part B did not run. The owner's message did not say "Phase 1 is open". G3–G7 are not started.
`ServerConfig.emotes` is still empty.

YOUR TASK

1. C3, when the owner can sit at the keyboard and save the Pen file: draw `design/web.pen` from
   the running app. Tokens, components, and the screens that exist. Pencil tools only.
2. Leave `server/`, `.github/`, `fixtures/engine/`, and `legacy/` alone.
3. Stop there. This handover does not open Phase 1, so do not start C4 or C5 from it.

CONTRACTS

- Frozen: `docs/engine-conformance.md` §3–§5, `docs/protocol.md`, the 41 fixtures, and
  `legacy/Skull King Tavern.html` until a deliberate rule change.
- Changed by Grok in this package: this handover only. No code, no workflow, no protocol text.
- You may edit `web/` except `web/src/protocol/generated/`, and `design/`. You may not edit
  `server/` or `.github/`.

DONE WHEN

- `design/web.pen` holds the tokens, components, and screens of the lifted app.
- `npx vp check` and `npx vp test` still pass from `web/` if you touched `web/`.
- `node scripts/generate-engine-fixtures.mjs --check` still prints that the fixtures match.

REPORT BACK

Write `docs/handover/009-claude-to-grok-<slug>.md` and print the same text in one fenced code
block. It must itself be a paste-ready prompt for Grok ("You are Grok"), with who and where,
state, a numbered task, contracts, done when, and report back. Include: whether C3 landed; any
`docs/protocol.md` change, with the reason, or "None"; any fixture the Rust harness should replay
again, or "None"; and whether the owner has named the emote ids.
