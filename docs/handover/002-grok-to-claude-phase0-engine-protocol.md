You are Claude, the web engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). The owner is turning a single-file card
game into an online multiplayer game. You write the web client. Grok writes the Rust server and
never edits `web/` except the generated protocol tree. You and Grok cannot see each other's
sessions: the owner pastes handover prompts between you. This is handover 002. Phase 0 items G0,
G1 and G2 are done. Do not start Phase 1.

READ FIRST, IN THIS ORDER
1. `AGENTS.md`, then every file in `docs/agent-rules/`. The ones that govern this package:
   `ownership-and-handover.md`, `protocol-contract.md`, `design-sync.md`, `web-quality.md`,
   `git.md`, `definition-of-done.md`, `server-authority.md`.
2. `docs/protocol.md` at the commit named below. It is the wire contract. `dev` does not have
   these edits yet.
3. `docs/engine-conformance.md` §2 and §3. §3–§5 stay frozen.
4. `docs/multiplayer-plan.md` Phase 0, your column: C1 is the item this handover is waiting on.
   C2 and C3 are still yours if they are not already on `dev`.

STATE

Branch `feature/grok-engine-and-protocol`, implementation commit `c8b71fb`
(`c8b71fba0047ddbf3ab77d177a89dbd8f23298b6`). This handover file is the next commit on that
branch and is not part of `c8b71fb`. The branch is local, in the worktree
`/Users/nvorberg/Documents/development/skt-grok-engine`. It is not pushed. It is not on `dev`.
`dev` is still `e9a9720388b8fff7e875f27ce2ce0389335bbd0e`. Do not merge this branch. The owner
merges. Work in your own worktree, cut from `dev`. Read the worktree above if you need the
protocol text before that merge. Do not commit in it.

Done in `c8b71fb`:
- Cargo workspace under `server/` (edition 2024, `rust-toolchain.toml` on stable, clippy
  `all` and `pedantic` at warn, `unsafe_code = "forbid"`). Crates: `skt-engine` (pure library),
  `skt-protocol` (library plus `export-protocol`), `skt-server` (binary).
- `GET /api/v1/health` returns `{"ok":true}`. Errors use `{ "error": { "code", "message" } }`.
- The engine port: rules, reducer, per-seat view, events, scoring, three bot levels.
- Every protocol.md type, generated TypeScript, and one sample JSON per message and DTO.
- `.github/workflows/server.yml` runs fmt, clippy, and test. No Postgres and no Redis service.
- `server/migrations/postgres/` is empty. Compose and Postgres are not in this commit. Plan item
  G0 names them; the Phase 0 done-when list does not. They wait for G7.

Gate, run from `server/` on the tree that was committed (fmt and the tests after the protocol
prose edit; clippy on that same tree; the health process was the same server code):

- `cargo fmt --check` — clean, no output, exit 0.
- `cargo clippy --all-targets -- -D warnings` — clean, exit 0. No `#[allow]` in `server/`.
- `cargo test --workspace -- --test-threads=8` — 32 passed, 0 failed:
  - `skt-engine` lib: 23 passed (3.64s). Includes `leak::proptest_hidden_information` with
    `cases: 32`, and `leak::every_player_count_hides_the_same_information` (player counts 2
    through 8, classic and rascal).
  - `skt-engine` conformance: 2 passed (4.46s). `reference_games_match_the_legacy_reducer`
    replayed 20 games in `server/crates/skt-engine/tests/reference/` (37 MB).
    `engine_fixtures_match_when_present` found no `fixtures/engine` directory, printed
    `fixtures/engine is absent; conformance replay skipped`, and returned. Engine fixtures
    replayed: 0.
  - `skt-protocol`: 3 passed (0.49s). Error messages, fixture round-trip, TypeScript
    regeneration has no diff.
  - `skt-server`: 4 passed. Health, unknown path, wrong method, `Retry-After` on
    `RATE_LIMITED`.
  - Doc-tests and the export binary: 0 tests.
- `cargo run -p skt-server` listens on `127.0.0.1:8080`. `curl -s localhost:8080/api/v1/health`
  returned `{"ok":true}` with HTTP 200. `GET /api/v1/missing` returned HTTP 404 and
  `{"error":{"code":"NOT_FOUND","message":"Not found."}}`. The process was stopped. It is not
  left running.
- `web/src/protocol/generated/` has 84 `.ts` files. `fixtures/protocol/` has 70 `.json` files.
  Both regenerate with no diff (`cargo test -p skt-protocol`).

The twenty reference games are a stand-in recorded from the legacy reducer. They do not meet
plan item C1. Gate 0 still needs `fixtures/engine`.

Public API of `skt-engine` (create, step, view):

```
DealSource::deal_order(&mut self, round: usize) -> Vec<CardId>
```

Index 0 is dealt first. Seat 0 receives the front of that slice. `create` and `advance` reject
an order that is not a permutation of the canonical deck. No seed is stored on the state.

```
GameState::create(rules, players, dealer, deals) -> Result<GameState, CreateError>
GameState::bid(&mut self, seat, bid: i64) -> Result<Vec<GameEvent>, StepError>
GameState::play(&mut self, seat, card, played_as: Option<PlayedAs>) -> Result<Vec<GameEvent>, StepError>
GameState::ability(&mut self, seat, choice: &AbilityChoice) -> Result<Vec<GameEvent>, StepError>
GameState::advance(&mut self, deals) -> Result<Vec<GameEvent>, StepError>
GameState::view(&self, seat) -> Result<EngineView, StepError>
GameState::views(&self) -> Result<Vec<EngineView>, StepError>
```

`advance` is the server timer. A client never sends it. `CreateError` is `PlayerCount` (not 2
to 8), `Dealer`, or `Deal`. `StepError` is `Rejected(Rejection)` or `Broken`. `Rejection::code()`
is `NOT_YOUR_TURN`, `ILLEGAL_MOVE`, or `BID_OUT_OF_RANGE`. `STALE_ACTION` is not an engine
rejection; the server will check `at` before it calls the engine. Also public, and safe to show:
`deck()`, `schedule()`, `player_count()`, `rules()`, `phase()`, `totals()`, `scores()`. Every
field of `GameState` is `pub(crate)`. `GameState` does not implement `Serialize`. Do not log a
`GameState`.

Bots, in the same crate: `choose_bid`, `choose_play`, `choose_ability`. Each takes `&EngineView`,
the canonical deck, a `BotLevel`, and (for bid and play) `&mut impl Rng`. They never take
`GameState`. `Rng::next_f64` returns a value in `[0, 1)`.

Changes to `docs/protocol.md` in `c8b71fb` (nine). `docs/engine-conformance.md` was not edited.

1. `TableColor` is the closed set of eight legacy hexes from `Skull King Tavern.html` line 1421:
   `#1cb0f6`, `#ff9600`, `#ce82ff`, `#ff4b4b`, `#58cc02`, `#e5a400`, `#2b70c9`, `#ff5fbf`.
   `User.color`, a bot member's `color`, `SeatInfo.color`, and `ProfilePatch.color` use it.
   Reason: the draft said "a colour string", so a client could invent one.
2. `standard` `GameSettings` is spelled out: 4 players, classic scoring, format `brawl`, loot,
   kraken, whale and abilities off, `botLevel` `normal`, `pace` `standard`. The timer comment
   names 45s bid, 30s play, 30s ability, 2.5s trick end, 20s round end, 60s grace.
   Reason: "standard" was a word with no values.
3. `lobby.removeBot` `index` is the index into `members` (join order), not a seat.
   Reason: seat and member were both plausible for a bot.
4. `lobby.join` sends `code`, or `lobbyId`, or both. If both are present, `code` wins.
   Reason: the draft listed both and gave no rule. The type still allows both; the server
   enforces the rule in Phase 1.
5. `ok` always has `t` and `re`. It includes `lobby` when a lobby action returns the lobby,
   `queue` when the player joins the queue, and `serverTime` on `ping` and any other reply that
   carries the clock. Those three fields are omitted when they do not apply. Welcome still sends
   `lobby`, `queue`, and `game` as `null` when the player is not in one.
   Reason: optional and null were easy to mix up.
6. The generated TypeScript name `GameEvent` is the wire union: every engine event, plus
   `seatStatus` and `timedOut`. The engine-only enum is generated as `EngineEvent`. Rust
   re-exports it as `EngineEvent` so the wire union can be called `GameEvent`.
   Reason: one name cannot mean both the engine enum and the wire union.
7. `Credentials` is `{ username, password }`, the body of register and login. `ProfilePatch` is
   `{ name?: string, color?: TableColor }`, the body of `PATCH /me`. Omitted fields stay as they
   are. Reason: the REST table named anonymous objects, and ts-rs needs a type for each.
8. `ServerConfig.emotes` is the list the running server accepts. This draft does not name the
   ids. The sample config has `"emotes": []`. The `game.emote` sample uses `"example"`, which is
   not an accepted id. Reason: the legacy file has no emote list, and inventing ids would freeze
   one.
9. An unknown path under `/api/v1` is `NOT_FOUND`. A known path called with the wrong method is
   `VALIDATION`, because the code table has no 405. Reason: the HTTP status has to come from the
   code table.

Generated shapes worth knowing while you type the client. Do not "fix" these by hand:

- `web/src/protocol/generated/GameEvent.ts` is `OnlineEvent | EngineEvent`.
- `AbilityChoice` is `Array<CardId> | number | null`.
- `GameSettings` flattens the three expansion flags. In the TypeScript type those three fields
  sit after `pace`, because flatten merges them at the end. The JSON objects still use the field
  names from the doc (`loot`, `kraken`, `whale` beside `format`). Compare by structure.
- `ok` samples omit `lobby`, `queue`, and `serverTime`. `fixtures/protocol/ok.json` is
  `{ "t": "ok", "re": 1 }`. `welcome.json` keeps those keys and sets them to `null`.
- Samples are shapes, not a recording of a legal game. Fixed ids in the samples:
  user `018f6b4a-6a2e-7c3a-8b1d-9e0f1a2b3c4d`, lobby `018f6b4a-6a2e-7c3a-8b1d-9e0f1a2b3c4e`,
  game `018f6b4a-6a2e-7c3a-8b1d-9e0f1a2b3c4f`, time `1700000000000`, lobby code `ABCDEF`.
  The password sample is the string `example-password`. It is not a real credential.

Reference engine, `Skull King Tavern.html` at the repo root (it has not moved to `legacy/`).
No fixture name: `fixtures/engine` does not exist yet. No rules bug found. The port follows the
code, including these behaviours:

- Helmsman, lines 762–764. The failure text is `Pick a pirate to lead`. `seatOk` accepts any
  seat index, so any seat may be chosen to lead. The port does the same.
- Standing winner, lines 558–563. `indexOf` picks the first matching play. Several pirates, or
  several mermaids, give the win to the earliest in play order.
- Mermaid catches the Skull King, lines 561 and 596, and that trick does not also count pirates.
  A Skull King winner counts pirates (line 597), and a Tigress declared pirate counts as a pirate
  there (role, line 534). A pirate winner counts mermaids (line 598).
- A pirate ability opens only when the winning card's `kind` is `pirate` (line 731). A Tigress
  declared as a pirate keeps kind `tigress`, so she does not open a pirate ability.
- The Seer arm, lines 758–782, has no check on `choice`. Any choice is accepted and nothing is
  stored.
- End of the round, line 740: `last` is `hands[0].length===0`. With equal deals that is the same
  as every hand being empty.
- White Whale, lines 586–599. Character captures are skipped when the effect is `whale`. On a
  trick that contains a number card the winner is that highest number, so those capture branches
  would not apply. The skip is still in the port. A whale trick with no number card is destroyed
  (line 589).
- Table colours, line 1421, are the eight hexes in change 1 above.
- The legacy file contains no emote id list.

Regenerate TypeScript and the protocol samples from `server/`:

```
cargo run -p skt-protocol --bin export-protocol
```

That writes `web/src/protocol/generated/` and `fixtures/protocol/`. Do not hand-edit either tree.
`cargo test -p skt-protocol` fails if a committed file differs from a fresh run.

Blocked: replaying `fixtures/engine`. That is on you (plan item C1). The harness is already in
`server/crates/skt-engine/tests/conformance.rs`. It reads
`server/crates/skt-engine/../../../fixtures/engine/*.json`. If that directory is missing, the test
skips. If the directory exists and holds zero `.json` files, the test fails. A present file is
replayed as engine-conformance §2: `deals[round]` is the full deck order, `initial.views` and
each accepted step's `views` are `EngineView` JSON from §3 (camelCase, optional keys omitted),
and a rejected step carries `reject` and must leave every view unchanged. The legacy `view()`
still includes `seats`, `cfg`, and `deck`. Those three keys are not part of `EngineView`. Strip
them in the generator. Format strings the harness accepts by name: `classic`, `brawl`, `even`,
`whirl`, `swift`. Any other string is read as `swift`.

What Grok needs from you before Phase 1 (plan §5, G3–G7):

- `fixtures/engine` on a branch the owner can merge to `dev`: at least 40 games, covering every
  player count, every format, both scoring modes, each expansion alone and all together, every
  ability with every choice, both beasts in one trick, and a rejected action of every kind
  (`NOT_YOUR_TURN`, `ILLEGAL_MOVE`, `BID_OUT_OF_RANGE`). One file is one complete game. Do not
  edit the harness, and do not edit a fixture by hand to make the Rust side pass. If a replay
  disagrees with the reference, name the file and the step index in your handover.
- Leave `server/`, `web/src/protocol/generated/`, and `fixtures/protocol/` unread for writing.
- Do not merge `feature/grok-engine-and-protocol`.

Question for the owner: what is the official list of emote ids? Until you name it, the server
will not invent one. The sample config accepts none.

YOUR TASK

1. Finish C1. Add `fixtures/engine/*.json` as `docs/engine-conformance.md` §2 specifies, at least
   40 games, generated from `Skull King Tavern.html`. Views in those files are `EngineView` (§3),
   which means no `seats`, no `cfg`, and no `deck` on the view. `deck` belongs on `game.start`
   later, not on the fixture view.
2. Point your client types and your mock server at `docs/protocol.md` from commit `c8b71fb`,
   including the nine changes listed above. When the generated tree is on your branch, import it.
   Do not retype it and do not hand-edit it.
3. If C2 or C3 is still open on your side, finish it on your own branch off `dev`. Design changes
   go through `design/web.pen` with the Pencil tools.
4. Stop there. This handover does not open Phase 1. Grok does not start G3–G7 until a later prompt.

CONTRACTS

- Frozen: `docs/engine-conformance.md` §3–§5, and any fixture once it is generated. A wrong
  fixture is reported, not edited, by either agent.
- Changed by Grok, in `c8b71fb` only: `docs/protocol.md`, as the nine items above. You may propose
  a further protocol change in your handover. You may not edit `server/` to match it.
- You may edit: `web/` except `web/src/protocol/generated/`, `design/`, `fixtures/engine/`, and
  `docs/` when the protocol rule says a contract change is yours to draft.
- `GameState` stays off the wire. The client sends intents. The seat comes from the session, not
  from the message.

DONE WHEN

- `fixtures/engine/` holds at least 40 `.json` files and the directory is not empty.
- Each file matches the `EngineFixture` shape in engine-conformance §2, and each view matches §3.
- You can say how many games you wrote and which coverage rows from §2 they fill.
- If the owner has merged `c8b71fb` onto the branch you can compile, run from `server/`:
  `cargo test -p skt-engine --test conformance -- --nocapture`
  and paste the result. Until that merge, say that you could not run the harness.
- `vp check` is clean for whatever of C2 you touched. A visible UI change is also in
  `design/web.pen`.

REPORT BACK

Write `docs/handover/003-claude-to-grok-<slug>.md` and print the same text in one fenced code
block. It must itself be a paste-ready prompt for Grok ("You are Grok"), with who and where,
state, a numbered task, contracts, done when, and report back. Include: the fixture count and
the coverage; any fixture the Rust harness rejected, with file name and step index; any further
`docs/protocol.md` change, with the reason, or "None"; whether you ran the conformance harness;
and what you still need from the owner on emote ids.
