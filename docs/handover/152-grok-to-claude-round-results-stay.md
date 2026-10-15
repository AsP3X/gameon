# 152 · Grok → Claude · round results stay put

You are Claude, the callee, working on Skull King Tavern
(`/Users/niklas/Documents/development/gameon`). Do this work yourself. Do not run `claude` or
`grok`.

Read `AGENTS.md`, `docs/agent-rules/agent-routing.md`, `docs/agent-rules/web-quality.md`,
`docs/agent-rules/design-sync.md` and `docs/agent-rules/git.md` first. Then this file. The
owner reported a multiplayer bug. There is no server task.

## State

- Branch `dev`, not pushed. Start from the commit that adds this file (`git log -1 --oneline -- docs/handover/152-grok-to-claude-round-results-stay.md`). `git fetch origin` and `git merge --ff-only origin/dev` before you edit. If that fast-forward fails, stop and say so. Do not merge, rebase or reset.
- Working tree was clean when this prompt was written. Commit only your own paths. Do not stage `server/`, `docs/agent-rules/`, `AGENTS.md` or `CLAUDE.md`.
- No protocol change. Do not edit `server/`, `web/src/protocol/generated/` or `fixtures/`.

## The bug

In a multiplayer game, the round-results sheet opens for every seat when the round ends. The points count up from 0 and finish on the real round score. The first player to press **Next round** sends `game.ready`. The server answers with a `game.update` that has no engine events: ready flags and a restarted `nextRound` clock (`server/crates/skt-server/src/world/table.rs`, `mark_ready`, the branch that publishes `&[]`).

That update redraws the page for the seats who have not pressed the button. Their sheet is still open. The redraw paints each point as the literal `0` and does not run the count-up, so every player on that sheet shows 0. The player who pressed the button already saw the right numbers, and `next()` closes their sheet before the update (`web/src/tableview/actions.ts`).

The log and the totals are intact. The seat labels on the felt (`N pts`) are not the bug. The zeros are the `.pts` figures inside the Round results dialog.

## Why

- `web/src/tableview/views.ts` `resultsSheet()` writes `<span class="pts …" data-count="${s.total}">0</span>`.
- `web/src/tableview/render.ts` `render()` replaces `#app` and calls `countUp()` only when `ui.anim || ui.enter`. `countUp` (`web/src/tableview/motion.ts`) is what replaces the `0`.
- `roundEnded`, and the "See round results" action, set `ui.anim`. A ready update does not. `present()` still calls `render()` (`actions.ts`).

`web/src/tableview/tracker.ts` `trkResultsSheet()` uses the same `>0</span>` placeholder. A redraw of that open sheet has the same defect. Fix it the same way.

## Your task

1. Keep the count-up when the results sheet first opens (`ui.anim` or `ui.enter`).
2. On a later redraw while that sheet stays open, paint each seat's finished round points. Use `sgn` from `web/src/tableview/dom.ts`, the same text `countUp` ends on. Do not start the count again, and do not leave `0`.
3. The sheet stays open for a seat that has not pressed Next round. Phase stays `roundEnd`. Do not close it because somebody else readied.
4. The seat that pressed Next round still closes its sheet and sends `{ type: 'advance' }`. The existing test "waits after ready until the others are" must keep passing.
5. No new copy, layout, colour or control. This is a bug fix with no visible design change, so do not edit `design/*.pen` and say that in your summary (`docs/agent-rules/design-sync.md`).
6. Add a test in `web/src/tableview/online.test.ts`. Play to round end the way `toResults` does. Read the `.sheet .pts` text (under the test's `matchMedia`, `reduced()` is true, so the first draw already shows `sgn`). Then `tell` an update from another seat: same phase, `ready` with that other seat true, `OTHERS`, no events. After `settle`, the sheet is still the Round results dialog and each `.pts` is still that same text, not `0`.
7. From `web/`: `npx vp check` and `npx vp test`. Both must pass. Do not start Compose.

## Contracts

- Frozen: the wire, `game.ready`, the server's ready publish, who owns which path.
- You may change `web/src/tableview/views.ts`, `web/src/tableview/tracker.ts`, `web/src/tableview/online.test.ts`, and a test next to the scorekeeper if the tracker sheet needs one. A smaller fix in `render.ts` is fine if the two sheets stay correct.
- You may not change server code or the protocol.

## Git

Current branch `dev`. Commit only your paths after the gate passes. Do not push. Do not create a branch or a worktree.

Message prefix `BUGFIX:`. One sentence on what the commit does. No AI attribution.

## Done when

- The new test fails on the old markup and passes after the fix.
- `npx vp check` and `npx vp test` from `web/` pass. Quote the counts.
- The summary says the `.pen` file was left alone because the screen does not change.

## Report back

Write `docs/handover/153-claude-to-grok-round-results-stay.md` (or the next free number) and print the same text in one fenced code block. You are reporting to Grok. Say the commit, the files, the gate output, and that there is no server work. No return implementation task unless you found one.
