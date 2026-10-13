You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).

Read `web/src/tableview/actions.ts` (`present`, `act`), `web/src/tableview/views.ts` (`actionsView`, `resultsSheet`, `scored`), `web/src/tableview/render.ts` (`render`, `keepFocus`), and `web/src/table/remoteTable.ts` (`resync`, `take`). Server clock work is already in the working tree on `dev` at `3f6e842` plus uncommitted edits in `server/crates/skt-server/src/world/table.rs` and `server/crates/skt-server/src/phase2_tests.rs`. Do not edit `server/`.

## State

The table stopped accepting a bid or a card after the round-end ring. "See round results" is the round-end button (`data-act="results"`), drawn only when `phase === 'roundEnd'`. Round 4 of 10 is a normal round end, not the end of the game. The next round is supposed to start when every online or away human sends `game.ready`, or when the 20s `nextRound` deadline fires.

The server was publishing that update before it armed the clock, so `table.deadline` on the round-end update was null. An empty follow-up did not increase `rev`, and the client dropped it. A failed bot choice or a failed `advance` also cleared `step_at` and `bot_at` and never put them back, so the phase stayed `roundEnd` and there was no bid and no card.

Grok changed the server so the update carries the clock for the phase it opened, a failed automatic step plays a plain legal bid, card, or ability and otherwise arms the clock again, and a clock-only correction increases `rev`. Protocol stays 1. `table.deadline` still means the clock in force for that view. `docs/protocol.md` was not edited.

Not committed. Not pushed. The running Compose API is still the 11 October image (`skt-api` started 2026-10-12T16:43:19Z, `/usr/local/bin/skt-server` dated Oct 11 21:49). This fix is not in that process. Do not restart it.

Gate, from `server/`, packages `skt-engine`, `skt-protocol`, and `skt-server`: `cargo fmt --check` clean, `cargo clippy --all-targets -- -D warnings` clean, `cargo test` engine 37 passed, conformance 1 passed, protocol 3 passed, server 68 passed. New test: `phase2_tests::a_finished_round_publishes_its_clock_and_the_next_one_starts`. `cargo test --workspace` was not run: uncommitted `server/crates/skt-bot-pass` is a workspace member and has no `src/main.rs`. Leave that crate, `server/Cargo.toml`, and `server/Cargo.lock` alone.

## Your task

1. Close `ui.sheet` when it is `'results'` and the view's phase is not `roundEnd`. Do this even when the update has no `roundStarted`. `remoteTable.resync` emits an empty event list. A later `game.update` can also move the view forward without repeating `roundStarted` if an earlier frame was missed. `present` today clears the sheet only inside `if (has('roundStarted'))`.
2. `resultsSheet` and `scored` must not throw when `v.log[v.round]` has no score yet (`web/src/tableview/views.ts` throws `Error('This round has no score yet')`). `render` builds the sheet HTML before it assigns `innerHTML`. A throw leaves the previous DOM. `keepFocus` sets the table `inert` while a sheet is open, so the player cannot bid or pick a card. Escape does not close `results`.
3. Do not leave `ui.waiting` true across a phase change, or after `dispatchWithin` resolves `ok` with no later `present` that unlocks. `act` clears `waiting` only when the answer is not ok. An `ok` whose `game.update` never arrives stays locked, and `GAME_INPUT` clicks are swallowed. `DISPATCH_TIMEOUT_MS` (8000) already resolves the promise as `TIMEOUT` when nothing answers; the `ok` path is the hole.

No new message, field, or error code. Do not edit `server/` or `web/src/protocol/generated/`.

## Contracts

Frozen: protocol version 1, `game.ready`, `table.deadline`, `roundEnded`, `roundStarted`. The server now puts the new clock in the same `game.update` as the step that opened that phase. You may change only `web/` outside `web/src/protocol/generated/`, and `design/web.pen` if the round-results sheet or the locked state becomes visibly different. The copy "See round results" stays for `roundEnd`.

## Done when

`vp check` and `vp test` pass. Add a test that a results sheet open at `roundEnd` is gone after an update whose phase is `bidding` or `playing` and whose events do not include `roundStarted`. Add a test that drawing the results sheet does not throw when the current round has no bid yet. A manual smoke of one online round end, then the next bid, on desktop and a narrow viewport.

## Report back

Write the return handover to `docs/handover/` and print the same text in one fenced code block, as a paste-ready prompt for Grok. Include the branch and commit, the `vp` commands and counts, and whether the results sheet can still sit over a phase that is not `roundEnd`.
