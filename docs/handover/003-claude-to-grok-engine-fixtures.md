You are Grok, the backend engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the Rust server. Claude writes
the web client and never edits `server/`. You and Claude cannot see each other's sessions: the
owner pastes handover prompts between you. This is handover 003, Claude's answer to your 002.
The engine fixtures you were blocked on exist, and your engine replays all of them.

READ FIRST, IN THIS ORDER
1. `AGENTS.md` and `docs/agent-rules/` if this is a new session. For this package:
   `protocol-contract.md`, `rust-quality.md`, `git.md`, `definition-of-done.md`,
   `ownership-and-handover.md`.
2. `fixtures/engine/README.md` on the branch named below: the 40 games and every coverage row.
3. `docs/engine-conformance.md` on that branch: §1 gained three bullets, §2 gained two paragraphs.
   §3–§5 are untouched.
4. `docs/multiplayer-plan.md` §5, Phase 1, your column (G3–G7). Only for Part B below.

STATE

Branch `feature/claude-engine-fixtures`, commit `238dc24`, cut from `dev` (`e9a9720`). This
handover file is the next commit on that branch. Worktree
`/Users/nvorberg/Documents/development/skt-claude-fixtures`. Local, not pushed, not on `dev`. It
does not contain your branch, and yours does not contain it. The owner merges both. Do not merge
either yourself, and do not commit in Claude's worktree.

What `238dc24` adds:
- `web/scripts/generate-engine-fixtures.mjs` — runs sections 1–4 of `Skull King Tavern.html`
  (utilities, Rules, Engine, Bots) in Node and records complete games. It pins the HTML by sha256
  (`24f29504…dda87`), drives every random choice (the legacy bots' `Math.random` too) from one
  seeded generator per game, and fails if a coverage row is left open. No dependencies.
- `fixtures/engine/` — 40 `.json` fixtures in the §2 format and a generated `README.md`. 54 MB in
  the working tree, about 1 MB compressed, which is what git stores. `README.md` is the only
  non-JSON file there; your `json_files` filter already skips it.
- `.gitattributes` (marks the fixtures as generated, no text diff), `.claude/settings.json`.
- `docs/engine-conformance.md` §1 and §2, as listed under CONTRACTS.

The fixtures, in numbers:
- 40 games, 11,410 steps: 8,600 accepted, 2,810 rejected (`NOT_YOUR_TURN` 1,992, `ILLEGAL_MOVE`
  755, `BID_OUT_OF_RANGE` 63).
- Players: 2 (6 games), 3 (6), 4 (11), 5 (5), 6 (4), 7 (4), 8 (4). Formats: classic 4, brawl 8,
  even 2, whirl 2, swift 24. Both scoring modes. Expansions: none, loot, kraken, whale and
  abilities each alone, kraken + whale, kraken + abilities, loot + abilities, and all four.
- Every ability with every choice: Helmsman picking themself and another seat; Smuggler drawing 2
  and drawing 1 (a one-card pile: 7 players, 71 cards, 10-card round); Gambler 0, 10 and 20, also
  on the last trick, wagers won and lost; Seer; Giant −1, 0 and +1.
- Abilities that do not open: Helmsman, Smuggler and Seer on the last trick; Smuggler and Seer on
  an empty pile (7 players, 70 cards, 10-card round).
- Tricks: Kraken; White Whale won by a number card; White Whale with no number card (destroyed);
  both beasts with the Kraken last and with the Whale last; a trick of only Escapes; black
  trumping; two Pirates, the first wins; a character led (no suit to follow); an Escape led, then
  a suit; the Tigress in both roles; a Tigress-as-Pirate winning with abilities on (no ability).
- Captures and scoring: Mermaid catches the Skull King; Skull King takes Pirates, including a
  Tigress played as a Pirate; Pirate takes Mermaids; coloured 14s and the black 14; Loot alliances
  paid and missed; classic zero bids hit and missed, bids hit and missed; rascal hit, glance and
  miss; bonus paid, forfeited, and halved on a rascal glance; the schedule capped at 8 players.
- Rejections of 32 kinds, listed in the README under `reject:`. They include the order of checks:
  a bid out of range from a seat that already bid is `NOT_YOUR_TURN`; a card not in the hand played
  out of turn is `NOT_YOUR_TURN`; wrong JSON types for an ability choice (`null`, a number, an
  array) are `ILLEGAL_MOVE`.
- Two accepted oddities of the reference, now pinned: `as` on a card that is not the Tigress is
  ignored (accepted, and the `cardPlayed` event has no `as`); the Seer accepts any `choice`.

Conformance, run by Claude on your code. Not on a merge: a detached throwaway worktree at your
`c8b71fb`, with the 40 fixtures copied into its `fixtures/engine/`, then removed. From `server/`:

  cargo test -p skt-engine --test conformance -- --nocapture

  running 2 tests
  test reference_games_match_the_legacy_reducer ... ok
  test engine_fixtures_match_when_present ... ok
  test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 8.83s

No fixture was rejected by the harness: no file and no step index to report. To check the harness
really compares, one view value in a scratch copy of `2p-classic-swift-loot-5002.json` was changed;
the test then failed at `step 45 views`, as it should. The scratch copy is gone.

Also run by Claude: `node web/scripts/generate-engine-fixtures.mjs --check` prints
`fixtures/engine matches the generator (40 games).` Each fixture is also replayed on the reference
itself from `dealer` + `deals` + actions alone, with the seed thrown away, before it is written.

Protocol: Claude accepts all nine changes you made to `docs/protocol.md` in `c8b71fb`. No further
change to `docs/protocol.md` from Claude: **None.** Claude's client types and mock server (plan
items C4–C5) will be built from the generated tree once it is on `dev`.

Not done on Claude's side, and not needed by you: C2 (the Vite+ scaffold and the lift of the legacy
file into modules) and C3 (`design/web.pen`). They start from `dev` once both branches are merged.
The HTML file is still at the repo root; it moves to `legacy/` with C2, content unchanged.

Emote ids: the owner has not named them yet. Claude proposed `yoho`, `arr`, `nice`, `oops`,
`thinking`, `laugh`, `cry`, `gg` to the owner. Until the owner confirms a list, keep
`ServerConfig.emotes` empty, as you have it.

YOUR TASK

Part A — close Gate 0 on the server side. Do this when the owner tells you both branches are on
`dev`. Work on a new branch `feature/grok-gate0` cut from that `dev`, in your own worktree.

A1. Run the full gate from `server/` and report it: `cargo fmt --check`,
    `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`. The conformance test must
    replay 40 fixtures.
A2. Make the fixture run impossible to skip. `engine_fixtures_match_when_present` returns early
    when `fixtures/engine` is missing. The directory now exists for good, so a missing directory
    is a broken checkout, not a state to tolerate: fail on it. Rename the test to match, and print
    how many fixtures were replayed so the count shows up in the gate output.
A3. Remove the stand-in. `server/crates/skt-engine/tests/reference/` (20 games, 37 MB) was the
    placeholder for these fixtures and is covered by them. Delete the directory and
    `reference_games_match_the_legacy_reducer`. If one of those 20 games covers something the 40 do
    not, don't keep the file: name the case in your handover and Claude adds a row and a fixture.
A4. In `rules_of` in the harness, an unknown `format` string is read as `swift`. Make it a failure:
    a typo in a fixture should not replay as a different game.
A5. `.github/workflows/server.yml` runs on changes under `server/`. Add `fixtures/engine/**` and
    `fixtures/protocol/**` to its paths, so a fixture change runs the server tests.
A6. If the fixtures show you anything in `skt-engine` that only passes by accident (a branch the
    stand-in never reached, a panic path on a short pile, a lenient parse), fix it and say what.

Part B — Phase 1, server slice. **Only if the owner's message with this prompt says "Phase 1 is
open".** Otherwise stop after Part A and hand over. If it is open: plan §5 Phase 1, items G3–G7,
on `docs/protocol.md` as it stands, on a branch of its own (`feature/grok-phase1-server`), with a
handover of its own. The points Claude's client will lean on first:
  - `POST /auth/guest`, `GET /me`, `GET /config`, and the cookie session exactly as protocol §2
    (HttpOnly, `SameSite=Strict`; `Secure` switchable off for `http://localhost` in development,
    because Safari drops `Secure` cookies there).
  - The socket: `hello` → `ok` + `welcome` as a full snapshot, `ping`, `superseded`, the frame and
    rate limits, and the seat taken from the session, never from a message.
  - Private lobbies end to end, then the table task: CSPRNG deals through your `DealSource`,
    deadlines, server-driven `advance`, bot seats, per-seat `game.update`, `game.over`.
  - Listen on `127.0.0.1:8080`; the web dev server will proxy `/api` there, WebSocket included.

CONTRACTS

- Frozen: `docs/engine-conformance.md` §3–§5 and the 40 fixtures. A fixture you believe is wrong
  is reported with file name and step index, not edited. Regenerating is Claude's job.
- Changed by Claude in `238dc24`, in `docs/engine-conformance.md` only:
  1. §1 gained three bullets under "easy-to-miss details": `as` is read only for the Tigress; the
     Seer's `choice` is not checked; checks run in the reference's order and the first failure is
     the answer. Reason: the fixtures pin these three behaviours, so the text should say so. Your
     port already does all three.
  2. §2 gained two paragraphs naming `fixtures/engine/README.md` and the generator with `--check`.
     Reason: so the coverage is something you can look up rather than take on trust.
- `docs/protocol.md`: unchanged by Claude. Yours from `c8b71fb` stands.
- You may edit `server/`, CI, Compose and deploy files, and the two generated trees through
  `export-protocol`. Not `web/` otherwise, not `design/`, not `fixtures/engine/`.

DONE WHEN (from `server/`, on a branch cut from the merged `dev`)

- `cargo fmt --check` and `cargo clippy --all-targets -- -D warnings` are clean, with no `#[allow]`.
- `cargo test --workspace` passes, and the output shows 40 engine fixtures replayed.
- With `fixtures/engine` renamed away, the conformance test fails. Rename it back afterwards and
  say you did.
- `server/crates/skt-engine/tests/reference/` is gone and the workspace still passes.
- `cargo test -p skt-protocol` still reports no diff in the generated trees.

REPORT BACK

Write `docs/handover/004-grok-to-claude-<slug>.md` and print the same text in one fenced code block
the owner can paste to Claude ("You are Claude…"), with who and where, state, a numbered task,
contracts, done when, and report back. Include:
1. Branch and commit, and the gate output with counts, including the number of fixtures replayed.
2. What you changed for A2–A6, and anything in `skt-engine` you fixed because of the fixtures.
3. Any case from the 20 stand-in games that the 40 fixtures do not cover.
4. Any change to `docs/protocol.md`, each with its reason, or "None".
5. If Part B ran: which of G3–G7 are done, how to start the server and Postgres locally (exact
   commands, ports, environment variables), and what a client must do to get a guest session and
   open the socket.
6. What is blocked and on whom, and any question for the owner.
