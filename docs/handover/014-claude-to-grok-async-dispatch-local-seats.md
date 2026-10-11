You are Grok, the backend engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the Rust server, the Compose and
deploy files and CI. Claude writes the web client and never edits `server/` or `.github/`. You and
Claude cannot see each other's sessions: the owner pastes handover prompts between you. This is
handover 014, Claude's answer to your 013. Plan item C4 is done: the table answers an action with a
promise, and it says which seats are played on this device. Nothing on the server follows from it.
One question about `docs/protocol.md` §5.5 is for you. Your column of Phase 1 is still closed.

READ FIRST, IN THIS ORDER
1. `AGENTS.md` and `docs/agent-rules/` if this is a new session. For this package: `git.md`,
   `definition-of-done.md`, `ownership-and-handover.md`, `protocol-contract.md`,
   `server-authority.md`.
2. On the branch named below: `web/src/table/table.ts` (the contract, about 90 lines), then `web/README.md`,
   the last two items of "Deliberate differences from the legacy page" and the two new items of
   "Carried over as it was, to fix on purpose later".
3. `docs/protocol.md` §5.1 and §5.5, for the question in "Your task".

STATE

Branch `feature/claude-table-async`, cut from `dev` (`02da4cc`), worktree
`/Users/nvorberg/Documents/development/skt-claude-table`. Commit `4e0a90b` is the work, all under
`web/`. The commit after it is this handover. Local, not pushed, not on `dev`. Do not merge it and
do not commit in that worktree; the owner merges. Your handover 013 is on `feature/grok-dev-gate`
only, so this branch does not contain `docs/handover/013-…`.

The new `dispatch` signature, in `web/src/table/table.ts`:

```ts
type DispatchCode = ErrorCode | 'REJECTED' | 'TIMEOUT';        // ErrorCode is the generated one
type DispatchResult = { ok: true } | { ok: false; code: DispatchCode; message: string };

interface Table {
  readonly localSeats: readonly Seat[];
  view(seat: Seat): TableView;
  dispatch(action: Action): Promise<DispatchResult>;
  subscribe(fn: TableListener): () => void;
  schedule(events?: EngineEvent[]): void;
  stop(): void;
}

function dispatchWithin(table: Table, action: Action, ms = 8000): Promise<DispatchResult>;
```

- The promise never rejects. `ok: true` only says the action was accepted. What it did arrives
  through `subscribe`, for the sender as for everyone else, which is what §5.5 says of `ok` and
  `game.update`. A failed result means nothing changed.
- `LocalTable` runs the reducer inside `dispatch` and returns a promise that is already resolved:
  the listeners have heard before `dispatch` returns. A refusal by the offline engine is
  `{ ok: false, code: 'REJECTED', message: <the engine's text> }`.
- The renderer sends every action through `dispatchWithin`. After 8 seconds without an answer the
  result is `{ ok: false, code: 'TIMEOUT', … }` and whatever the table says later is ignored. A
  table that throws or rejects is reported as `REJECTED`. A table that answers on the turn it was
  asked never starts the clock.
- In the renderer (`act` in `web/src/tableview/actions.ts`): input is locked the moment an action
  is sent. An accepted action unlocks it when its update has been presented, as before. A failed
  one unlocks it at once, draws the same view again and puts back what the player had picked: the
  card, the bid, the Smuggler's discards. A failure that arrives after a newer action was sent, or
  after the table was left, is ignored.

How a local seat is chosen:
- The table says so: `Table.localSeats`, in seat order. The renderer asks the table and no longer
  reads the `bot` flag for it.
- Offline, `openTable` in `actions.ts` hands `LocalTable` the human seats of the game
  (`humanSeats(state.seats)` in `web/src/table/localTable.ts`), for a new game and for a saved one.
  A save does not record who sat where, and offline it does not have to: nobody else is connected.
  `LocalTable` throws unless its local seats are exactly its non-bot seats. Solo has one,
  pass-and-play has one per human, and the hand-over curtain goes between them as before.
- Online, the `RemoteTable` of C5 will have one local seat, `me` from `game.start`. This package
  does not read a seat out of anything that came from a network: there is no network code in it.
  The `seat` field of the offline `Action` type stays on the device. On the wire `game.bid`,
  `game.play` and `game.ability` carry no seat (§5.5), and C5 will not add one.
- What goes by the local seats now: whose eyes the screen shows, the curtain, hidden hands, the
  round-end sound, the title of the round results, "you" on the final scores, and the solo record
  (`recordGame(view, localSeats)`).
- What still reads `bot`: the setup screen, the default seat names, which seats `LocalTable` plays
  with its bots, and the "H" tag on the other human seats, which is shown in pass-and-play only.
- `showTable(table)` in `actions.ts` puts any `Table` on screen. `openTable` uses it; so will C5.

The gate, from `web/` in that worktree at `4e0a90b`, Node v25.2.0 (the version warning of your 013;
Node 24 is not installed here):
- `npm ci` — found 0 vulnerabilities.
- `npx vp check` — `All 49 files are correctly formatted`; `Found no warnings, lint errors, or type
  errors in 43 files`.
- `npx vp test` — 15 files, 129 tests passed. Duration 11.79s. That is the 110 on `dev` plus 19:
  - `src/table/localTable.test.ts`, 6: the local seats, the same-turn answer, a refusal that leaves
    every seat's view, the save and the listeners untouched.
  - `src/table/table.test.ts`, 6: `dispatchWithin`: the limit, an answer in time, a late answer, a
    table that throws.
  - `src/tableview/tavern.test.ts`, 6 new: a refused bid and an unanswered bid each leave the page
    byte for byte as it was and the view object the same; an unanswered card goes back into the
    hand, still picked; late news about an earlier action does not unlock a later one; solo has one
    local seat; pass-and-play hands the device from seat 0 to seat 1; and a human seat that is not
    local is never handed the device and its view is never asked for.
  - `src/tableview/stats.test.ts`, 1 new: the record goes by the local seat, not by who is human.
  Each of the renderer tests was seen failing with its behavior taken out.
- The parity suites (`src/tableview/parity/`: solo, pass-and-play, the scorekeeper, the sounds) are
  unchanged and pass. They still compare the lifted renderer with the legacy page step by step.
- `npx vp build` — 51 modules. `dist/assets/index-Catmhqf6.js` 343.41 kB,
  `dist/assets/index-C63JeaYZ.css` 48.03 kB, the same stylesheet hash as on `dev`.
- `node scripts/generate-engine-fixtures.mjs --check` — `fixtures/engine matches the generator
  (41 games).`
- In a browser (`vp dev`, Chromium, 360×740): a solo round of five cards played to its results in
  dark, "Next round", a reload, "Continue · Round 2 of 5" in light with the hand and the bid sheet
  back. A pass-and-play round with two humans and two bots: the curtain came down on every change
  of hands ("Pass to You", "Pass to Anne", twelve times), each reveal showed that seat's hand,
  and the results read "2 of 2 humans hit their bid". No horizontal scroll. The console showed only
  Chromium refusing `navigator.vibrate` because the clicks came from a script.
- Not done by hand: the scorekeeper (the parity suite plays it; nothing it uses changed) and a
  whole game to the final scores. There is no online table to smoke.

Design: no screen and no control changed, so `design/web.pen` was not touched.

Known gaps, written down in `web/README.md` under "Carried over as it was":
- Any update that is presented unlocks the input, not only the answer to the action that locked
  it. Offline those are the same update. Online another seat's bid can arrive first. Closing this
  needs the answer to the question below.
- A refused or unanswered action is not explained to the player; the input just comes back. The
  copy and its place on the table belong to C7 and will be drawn first.

`docs/protocol.md`: no change from Claude. **None.** One question, in "Your task".

Fixtures the Rust harness should replay again: **None.** `web/src/game/`, `web/scripts/`,
`fixtures/` and `legacy/` are untouched since `02da4cc`.

The owner, in this session:
- Emote ids: **not named.** Claude's earlier proposal stands unanswered: `yoho`, `arr`, `nice`,
  `oops`, `thinking`, `laugh`, `cry`, `gg`. Keep `ServerConfig.emotes` empty until the owner
  confirms a list.
- The recorded takes: **not confirmed by ear.**

YOUR TASK

Nothing in `server/` or `.github/` has to change for this package.

1. Answer this, for `game.bid`, `game.play` and `game.ability`, as G5 will build it: is the reply
   (`ok` or `err`) written to the sender's socket before the `game.update` that carries the
   action's effect, and can a `game.update` caused by another seat reach that socket between the
   two? The rule Claude would like to build C5 and C7 on: the reply comes first, the sender's own
   update is the next `game.update` on that socket, and nothing for that table comes between them.
   Then the client keeps the input locked from the send to the first update after `ok`, and no
   other seat's update can unlock it early. If that is what the table task will do, add it to §5.5
   of `docs/protocol.md` on a branch of yours and say so in your handover; it is a clarification,
   so `protocol` stays 1. If it will not hold, say what does, and Claude will go by the view
   instead (the seat's own bid is set, the card has left the hand, the pending ability is gone).
2. When the owner tells you `feature/claude-table-async` is on `dev`, on a new branch cut from that
   `dev`: from `web/`, run the five commands of `.github/workflows/web.yml` and report them
   (`npm ci`, `npx vp check`, `npx vp test`, `npx vp build`,
   `node scripts/generate-engine-fixtures.mjs --check`). Expect 15 files and 129 tests, and 41
   games. `web.yml` names no test count, so it needs no edit. If something under `web/` is wrong,
   do not edit it: report the command and its output. Run the server gate once on the same tree
   (`cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`);
   expect what your 013 reported, 31 passed and `replayed 41 engine fixtures`.
3. Stop there unless the owner's message with this prompt says "Phase 1 is open". If it does, Part B
   of handover 007 stands as written (G3–G7 on `docs/protocol.md` as it is, on
   `feature/grok-phase1-server`, with a handover of its own).

CONTRACTS

- Frozen: `docs/engine-conformance.md` §3–§5, `docs/protocol.md` as it stands on `dev`, the 41
  fixtures, and `legacy/Skull King Tavern.html` until a deliberate rule change.
- Changed by Claude in this package: files under `web/` (`4e0a90b`) and this handover. No contract
  text, no generated file, no fixture.
- The seat of an online action comes from the session. The client has no code that takes a seat
  from a network message, and `server-authority.md` stands as written.
- You may edit `server/`, `.github/`, Compose and deploy files, the two generated trees through
  `export-protocol`, and `docs/protocol.md` for item 1 as `protocol-contract.md` says. Not `web/`
  otherwise, not `design/`, not `fixtures/engine/`, not `legacy/`.

DONE WHEN

- Item 1 has an answer in your handover, and §5.5 says the same if you changed it.
- If the branch is on `dev`: the five web commands pass with 15 files and 129 tests, the three
  server gate commands pass with `replayed 41 engine fixtures`, and you say which Node version ran
  the web ones.
- `cargo test -p skt-protocol` still reports no diff in the generated trees.

REPORT BACK

Write `docs/handover/015-grok-to-claude-<slug>.md` and print the same text in one fenced code block
the owner can paste to Claude ("You are Claude…"), with who and where, state, a numbered task,
contracts, done when, and report back. Include:
1. The answer to item 1, and the text you added to `docs/protocol.md`, or "None".
2. Branch and commit, whether `feature/claude-table-async` was on `dev`, and the output of both
   gates with counts if you ran them.
3. Anything you changed in `web.yml`, with the reason, or "None".
4. If Phase 1 was opened: which of G3–G7 are done, how to start the server and Postgres locally
   (exact commands, ports, environment variables), and what a client must do to get a guest session
   and open the socket.
5. What is blocked and on whom, and any question for the owner.
