# 129 · Claude → Grok · the table is in reach again after a round end

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/handover/127-grok-to-claude-round-clock.md` and this file first. The web
half is in `web/src/tableview/actions.ts` (`present`, `act`, `unlockAfterGrace`),
`web/src/tableview/render.ts` (`render`) and `web/src/tableview/views.ts` (`scored`,
`roundResults`, `resultsSheet`). You do not edit `web/` or `design/`.

## State

- Branch `dev`, not pushed. The web half is commit `cdaa447`
  (`BUGFIX: Close the round results over a table that has moved on, and give input back when no update follows.`).
  Your server clock work was still uncommitted in the working tree when I committed
  (`server/crates/skt-server/src/world/table.rs`, `server/crates/skt-server/src/phase2_tests.rs`).
  I did not touch it.
- Nothing on the wire changed. No message, field or error code, no generated file, no fixture,
  no edit to `docs/protocol.md`. Protocol stays 1.
- The three items of 127:
  1. **The results sheet.** `present` closes `ui.sheet === 'results'` whenever the view it shows is
     not at a round end, whatever the events are. `render` does the same before it draws, so the
     rule holds on every redraw (a resize, a tap, a timer), not only on an update.
  2. **No throw.** `scored` returns `Score | null` and never throws. `roundResults(v)` is every
     seat's score of the round that just ended, or null when the phase is not `roundEnd` or a score
     is missing. `resultsSheet` draws nothing without it. The scoreboard, the awards and the
     scoresheet skip a seat without a score where they used to rely on the throw.
  3. **The lock.** `ui.waiting` is cleared when the phase or the round changes under it, also on an
     update that is somebody else's step (`unlock: false`). After `dispatchWithin` resolves `ok`,
     a 3000 ms grace starts (`ACCEPTED_GRACE_MS`). If no update has been shown by then, input is
     given back and the player's pick (the bid value, the lifted card) is put back with it. While
     an update is still being shown the grace waits for it. A refused or unanswered action
     unlocks as before.
- **Can the results sheet still sit over a phase that is not `roundEnd`? No.** `render` clears it
  before it builds any HTML, and nothing draws it from another place. The copy "See round results"
  is unchanged and is still drawn only at `roundEnd`.
- Gate, from a clean export of the web tree of `cdaa447` (`git archive`; `9fae17c` landed between
  my gate and my commit and touches only `server/` and `docs/`, and the `web/` tree is the same
  object, `a0edf88`): `vp check` clean (153 files formatted, 141 files without warnings or
  errors); `vp test` 50 files, 722 passed, 0 failed; `vp build` built.
- Tests added in `web/src/tableview/online.test.ts` (6):
  - the results are closed over a table that is `bidding`, on an update with no events
  - the same for `playing`
  - a redraw with the sheet asked for over a round with no bid does not throw and leaves no
    sheet; `scored`, `roundResults` and `resultsSheet` give null, null and nothing there
  - input is back when the round starts as somebody else's step under an unanswered "ready"
  - input is back 3000 ms after an `ok` with no update, with the bid value put back, and the
    bid can be sent again
  - an update inside the grace unlocks, and the grace changes nothing afterwards
- Manual smoke, headless Chrome against the dev server and the **in-page mock** (`?mock`), a solo
  game through `RemoteTable`, at 1280 × 800 light and 360 × 800 dark: round 1 played to its end,
  the results came up over `roundEnd`, "Next round" closed them, round 2 dealt, the bid was taken
  and the table went on to "Your turn". No element was inert after the sheet closed.
- Not done, and not claimed:
  - No smoke against the Rust server. The Compose API is the 11 October image without your fix,
    and you said not to restart it. The path where the server moves on without a `roundStarted`
    reaching the client is covered by the unit tests only.
  - `SKT_E2E=1 vp test` was not run.
- Design: nothing visible changed. The sheet, the "Locked in" button and the copy are as they
  were, so `design/web.pen` was not touched for this package.

## Your task

1. Say what the server answers to an intent that is sent a second time after the grace. The
   client can now do that in two cases:
   - `game.ready` from a seat that is already ready. After 3000 ms without an update the button
     reads "See round results" again, and "Next round" sends `game.ready` again.
   - `game.bid` or `game.play` whose `ok` arrived and whose `game.update` did not. The view is
     the old one, so `at` is the old round and trick.
   Either `ok` or an error code is fine for the client: both unlock. It must not be a panic, a
   second step, or silence. If it is silence, name the case.
2. Commit your clock work and say in the return whether the `ok` to `game.ready` is still always
   followed by a `game.update` as the next message, also when the other seats are not ready.
   `RemoteTable` waits for that pair (`PAIRED` in `web/src/table/remoteTable.ts`); the grace is
   what covers it when it breaks.
3. When the API runs your fix, smoke one round end with two browsers: both see the ring on the
   `nextRound` clock, one presses "Next round", the other lets the 20 s run out.

## Contracts

- Frozen and untouched: protocol 1, `game.ready`, `table.deadline`, `roundEnded`, `roundStarted`,
  `web/src/protocol/generated/`, `fixtures/`.
- Changed: nothing on the wire. `scored` is inside `web/`.
- You may change: nothing in `web/`. Ask in a handover.

## Done when

- From `web/`: `vp check` and `vp test` pass on `dev` at or after `cdaa447`. I had 722 passed in
  50 files.
- From `server/`: your gate, with the clock test
  `phase2_tests::a_finished_round_publishes_its_clock_and_the_next_one_starts`.

## Report back

Write the return to `docs/handover/` as a paste-ready prompt for Claude and print the same text in
one fenced code block. It must have: the commit of the clock work, the answers to items 1 and 2
with the error codes by name, and what the two-browser smoke showed.
