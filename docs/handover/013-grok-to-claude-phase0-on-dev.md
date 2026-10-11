You are Claude, the web engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the web client. Grok writes the
Rust server, Compose, deploy files and CI, and never edits `web/` except the generated protocol
tree. You and Grok cannot see each other's sessions: the owner pastes handover prompts between you.
This is handover 013, the answer to your 012. Both web branches are on `dev`. The gates passed.
The owner then asked for your next slice: plan item C4. Grok's column of Phase 1 stays closed.

READ FIRST, IN THIS ORDER
1. `AGENTS.md`, then `docs/agent-rules/ownership-and-handover.md`, `server-authority.md`,
   `web-quality.md`, `design-sync.md`, `git.md` and `definition-of-done.md`.
2. `docs/multiplayer-plan.md` §5, Phase 1, your row C4 only. The risk note in §8 names why C4 is
   its own package.
3. `web/src/table/table.ts` and `web/src/table/localTable.ts` on `dev`.

STATE

Both web branches are on `dev`. The owner told Grok to merge them. `dev` is `02da4cc`
(`02da4cc89d88b1d9900e5b4a5e2bdb27e74d7a45`):

- `1e1f26b` merges `feature/claude-design-pen` (`8f58249`: the bid sheet `e9657d4`, the design
  file `a4ee127`, and your handovers 009 and 012).
- `02da4cc` merges `feature/claude-card-play-samples` (`c758955`: the recorded takes in `dc0a27b`
  and `0a058dd`, and your handovers 009 and 010).

This handover is the next commit on `feature/grok-dev-gate`, cut from that `dev`, checked out in
`/Users/nvorberg/Documents/development/SkullKingTavern`. It is not part of `02da4cc`. It is not
pushed. Do not merge it. There is no server or workflow change in it.

Web gate, from `web/` on that merged tree, Node v25.2.0 (npm 11.6.2). Node 24 is not installed
here. vite-plus 1.1.0 and vitest 5.0.3 warn that they do not support Node 25 (they want
`^22.18.0 || ^24.11.0 || >=26.0.0`). The commands passed:

- `npm ci` — added 135 packages, audited 136, found 0 vulnerabilities.
- `npx vp check` — all 47 files formatted; no warnings, lint errors or type errors in 41 files.
- `npx vp test` — 13 files, 110 tests passed. Duration 11.19s. That is 92 plus the 5 bid-sheet
  tests plus the 13 sound tests.
- `npx vp build` — 50 modules, built in 217ms. `dist/assets/index-CDcrdwd5.js` 342.60 kB,
  `dist/assets/index-C63JeaYZ.css` 48.03 kB, and the seven hashed `.wav` files.
- `node scripts/generate-engine-fixtures.mjs --check` — `fixtures/engine matches the generator
  (41 games).`

Nothing failed, so `web/` was not edited.

Server gate, from `server/` on the same tree:

- `cargo fmt --check` — clean, no output, exit 0.
- `cargo clippy --all-targets -- -D warnings` — clean, exit 0. No `#[allow]` added.
- `cargo test --workspace -- --test-threads=8 --show-output` — 31 passed, 0 failed:
  - `skt-engine` lib: 23 passed (3.95s), including `leak::proptest_hidden_information` with
    `cases: 32` and `leak::every_player_count_hides_the_same_information`.
  - `skt-engine` conformance: 1 passed (10.83s). The test printed `replayed 41 engine fixtures`.
  - `skt-protocol`: 3 passed (0.45s). Error messages, fixture round-trip, TypeScript regeneration
    has no diff.
  - `skt-server`: 4 passed.
  - Doc-tests and the export binary: 0 tests.

`web.yml`: None. It names no test count, so the jump from 92 to 110 needs no edit.

`docs/protocol.md`: None.

Grok's G3–G7 are not started. `ServerConfig.emotes` is still empty. The recorded takes are still
unconfirmed by ear.

YOUR TASK

C4 only, on a branch of your own cut from `dev`. The server is not part of this package.

1. Make `Table.dispatch` asynchronous. `LocalTable` still answers from the local engine, and it
   resolves on that same turn. A rejection comes back as a failed result and changes no view. A
   dispatch that does not answer in time fails the same way and unlocks input. Cover both with
   tests.
2. A seat played on this device is an explicit local seat, not "every seat whose `bot` flag is
   false". Pass-and-play keeps several human seats on one device and still shows the hand-over
   curtain between them. Solo still has one local human. The scorekeeper is unchanged.
3. Solo, pass-and-play and the scorekeeper keep the behavior the parity suite already checks. If a
   visible control changes, draw it in `design/web.pen` with the Pencil tools before the code.
4. Do not build the socket client, the mock server, or the lobby screens. Those are C5 and C6.
   Leave `server/`, `.github/`, `fixtures/` and `legacy/` alone.

CONTRACTS

- Frozen: `docs/engine-conformance.md` §3–§5, `docs/protocol.md`, the 41 fixtures, and
  `legacy/Skull King Tavern.html` until a deliberate rule change.
- The seat still comes from the session once a server exists. This package must not teach the
  client to trust a seat number that arrived inside an action from the network. Local play may
  keep sending the seat because there is no session yet.
- Changed by Grok in this package: this handover only.
- You may edit `web/` except `web/src/protocol/generated/`, and `design/` through the Pencil tools.
  You may not edit `server/` or `.github/`.

DONE WHEN

- `Table.dispatch` is asynchronous, and a test shows a rejection and a timeout each leaving the
  view as it was.
- Pass-and-play still hands one device between its human seats. Solo and the scorekeeper still pass
  their existing tests.
- From `web/`: `npx vp check`, `npx vp test` and `npx vp build` pass, and
  `node scripts/generate-engine-fixtures.mjs --check` still prints that the fixtures match.
- Any screen you changed is also in `design/web.pen`.

REPORT BACK

Write `docs/handover/014-claude-to-grok-<slug>.md` and print the same text in one fenced code
block. It must itself be a paste-ready prompt for Grok ("You are Grok"), with who and where,
state, a numbered task, contracts, done when, and report back. Include: the new `dispatch`
signature; how a local seat is chosen; the test counts; any `docs/protocol.md` change, with the
reason, or "None"; and whether the owner has named the emote ids or confirmed the recorded takes
by ear.
