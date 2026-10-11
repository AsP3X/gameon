You are Claude, the web engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the web client. Grok writes the
Rust server and never edits `web/` except the generated protocol tree. You and Grok cannot see each
other's sessions: the owner pastes handover prompts between you. This is handover 004. Gate 0 is
closed on the server side. Phase 1 is not open.

READ FIRST, IN THIS ORDER
1. `AGENTS.md`, then every file in `docs/agent-rules/`. The ones that govern this package:
   `ownership-and-handover.md`, `protocol-contract.md`, `design-sync.md`, `web-quality.md`,
   `git.md`, `definition-of-done.md`.
2. `fixtures/engine/README.md` and `docs/engine-conformance.md` §2. Your generator owns new rows.
3. `docs/multiplayer-plan.md` Phase 0, your remaining items C2 and C3. Phase 1 stays closed until
   the owner opens it.

STATE

Branch `feature/grok-gate0`, implementation commit `fc48729`
(`fc48729ce2a842633a8c0edc82ef8fea5aac5ba9`). This handover file is the next commit on that branch
and is not part of `fc48729`. The branch is local, checked out in
`/Users/nvorberg/Documents/development/SkullKingTavern`. It is not pushed. It is not on `dev`.
`dev` is `8affc9f` (`8affc9f918213723929e30fa1632394e50dda0ed`), which contains both earlier
branches: the engine and protocol (`c8b71fb`) and the forty fixtures (`238dc24`). The owner merged
those two into `dev`. Do not merge `feature/grok-gate0` yourself. Work in your own worktree. Your
current one, `/Users/nvorberg/Documents/development/skt-claude-fixtures`, is still on
`feature/claude-engine-fixtures` and does not contain `fc48729`.

Done in `fc48729`:
- `engine_fixtures_replay` fails when `fixtures/engine` is missing or has no JSON. It prints
  `replayed N engine fixtures`.
- `server/crates/skt-engine/tests/reference/` is deleted, and so is
  `reference_games_match_the_legacy_reducer`.
- A fixture whose `scoring`, `format`, or expansion flag is missing or mistyped fails the replay.
  Unknown `format` is no longer read as `swift`. Unknown `scoring` is no longer read as `classic`.
  A missing expansion flag is no longer read as false.
- `.github/workflows/server.yml` also runs on `fixtures/engine/**` and `fixtures/protocol/**`.
- No change to `skt-engine` rules, the reducer, or the view. The forty fixtures already matched
  this reducer. No panic path and no accidental pass turned up while replaying them.
- No change to `docs/protocol.md`. None.

Gate, from `server/`, on the tree that was committed:

- `cargo fmt --check` — clean, no output, exit 0.
- `cargo clippy --all-targets -- -D warnings` — clean, exit 0. No `#[allow]` added.
- `cargo test --workspace -- --test-threads=8 --show-output` — 31 passed, 0 failed:
  - `skt-engine` lib: 23 passed (3.61s), including `leak::proptest_hidden_information` with
    `cases: 32` and `leak::every_player_count_hides_the_same_information`.
  - `skt-engine` conformance: 1 passed (8.02s). The test printed `replayed 40 engine fixtures`.
  - `skt-protocol`: 3 passed (0.52s). Error messages, fixture round-trip, TypeScript regeneration
    has no diff.
  - `skt-server`: 4 passed.
  - Doc-tests and the export binary: 0 tests.
- With `fixtures/engine` renamed out of the tree, `cargo test -p skt-engine --test conformance`
  failed: `engine_fixtures_replay` panicked at `conformance.rs:30` with
  `fixtures/engine is missing; a checkout without it cannot pass` (exit 101). The directory was
  renamed back. A second run printed `replayed 40 engine fixtures` and passed (7.69s). The
  directory again holds 40 JSON files plus `README.md`.

Stand-in games the forty fixtures do not repeat. The files are deleted. Do not restore them.
Regenerate through `web/scripts/generate-engine-fixtures.mjs`.

One of them deals a schedule none of the forty deal. `8p-classic-capped.json` was 8 players,
classic scoring, classic format, loot, kraken, whale, and abilities. The full deck is 74 cards, so
`floor(74/8)` is 9 and the classic sequence becomes `1,2,3,4,5,6,7,8,9,9`. The coverage row
`schedule:capped` is `8p-classic-brawl-base-39000.json`: 8 players, brawl, base deck of 70 cards,
`floor(70/8)` is 8, so brawl becomes `6,7,8,8,8`. Add one generated game for the 74-card classic
schedule, and a row in the generator so a future run cannot drop it.

Seven other stand-in setting tuples also have no fixture with that same player count, scoring,
format, and expansion set. Each piece already has its own coverage row, and none of them changes
the dealt schedule:

- 2 players, classic, swift, all four expansions
- 2 players, rascal, swift, all four expansions
- 3 players, rascal, swift, all four expansions
- 4 players, classic, brawl, all four expansions
- 4 players, classic, even, all four expansions
- 4 players, classic, whirl, all four expansions
- 5 players, rascal, swift, all four expansions

Part B did not run. The owner's message did not say "Phase 1 is open". G3–G7 are not started.
`ServerConfig.emotes` is still empty.

YOUR TASK

1. Add the 8-player classic-format game above. One new file under `fixtures/engine/`, generated,
   plus the coverage row that keeps it. `node web/scripts/generate-engine-fixtures.mjs --check`
   must print that the files match. Do not edit a JSON file by hand. Do not edit
   `server/crates/skt-engine/tests/conformance.rs` to make it pass.
2. If C2 or C3 is still open, finish it on your own branch cut from `dev` once `fc48729` is on
   `dev`. C2 moves `Skull King Tavern.html` to `legacy/` with the same content. Design changes go
   through `design/web.pen`.
3. Stop there. This handover does not open Phase 1.

CONTRACTS

- Frozen: `docs/engine-conformance.md` §3–§5, `docs/protocol.md` as it stands on `dev`, and the
  existing 40 fixtures. A wrong fixture is reported with file name and step index, not edited.
- Changed by Grok in `fc48729`: the conformance harness and `.github/workflows/server.yml` only.
  `docs/protocol.md`: None. `skt-engine` library code: unchanged.
- You may edit `web/` except `web/src/protocol/generated/`, `design/`, `fixtures/engine/`, and the
  generator. You may not edit `server/`.
- Regenerate TypeScript only if a protocol change lands, and then only with, from `server/`:
  `cargo run -p skt-protocol --bin export-protocol`.

DONE WHEN

- `fixtures/engine/` contains the new 8-player classic-format game, and the generator `--check`
  command passes.
- The new coverage row names that file.
- You can say whether `cargo test -p skt-engine --test conformance -- --show-output` printed
  `replayed 41 engine fixtures`, or that you could not run it because `fc48729` was not on the
  branch you compiled.
- `vp check` is clean for whatever of C2 you touched. A visible UI change is also in
  `design/web.pen`.

REPORT BACK

Write `docs/handover/005-claude-to-grok-<slug>.md` and print the same text in one fenced code
block. It must itself be a paste-ready prompt for Grok ("You are Grok"), with who and where,
state, a numbered task, contracts, done when, and report back. Include: the new fixture name and
the schedule it records; any replay the harness rejected, with file name and step index, or
"None"; any `docs/protocol.md` change, with the reason, or "None"; and whether the owner has
named the emote ids.
