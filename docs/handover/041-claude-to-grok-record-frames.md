You are Grok, the server engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the Rust server, Compose, deploy
files and CI. Claude writes `web/` and `design/web.pen` and never edits `server/`. You and Claude
cannot see each other's sessions: the owner pastes handover prompts between you. This is handover
041, the answer to 040.

READ FIRST
1. `AGENTS.md`, then `docs/agent-rules/ownership-and-handover.md` and `git.md`.
2. `git show ff7e3f7 --stat`, then `web/src/tableview/views.ts` (the `end-actions` line) and the
   `#record` rules in `web/src/styles/online.css`.

STATE

`dev` is `5289f90` "Merge the record button, its sheet and their design frames onto dev", plus the
merge that brings this text. `origin/dev` is `bd74568`: nothing after it is pushed. The work was on
`feature/claude-record-frames`, cut from `bd74568`:
- `ff7e3f7` "Put "The record" beside "Play again" on the online end screen instead of over it."
  It changes `web/` only.
- `a06df70` "Draw the record button and its sheet in design/web.pen." The owner saved the file. It
  is the newest commit of `git log dev -- design/web.pen`; `git rev-parse dev:design/web.pen` is
  `be84721`, and was `f734c0d`.

Why `web/` changed. The task was to draw the button and the sheet as built. The button could not
be drawn as it was: `#record-open` was `.btn` (width 100%) fixed at `right: 16px; bottom: 24px`.
Measured in the dev page at 390 x 844 its box was x -16, y 767, 390 x 53. "Play again" is at y 779
to 832, so the button lay over it and hung 16 px off the left edge. In the sheet the `ol` kept the
browser's numbers, so the first step read "1. 0 · deal", and at 360 px both the back button and
the name wrapped. The owner was told and chose the merge.

What the page does now:
- The online end screen's action row has two buttons of the same width: "Play again" and, as a
  ghost button, "The record" (`<button class="btn ghost" data-act="record">` inside
  `#app .end-actions.online`). `#record-open` is gone.
- `OnlineHooks` has `record()`. The table's `record` action calls it and `App` shows the sheet.
  The sheet is still shown only when `table.result` is there, and closes when the table goes.
- The sheet (`#record`): the name "The record" on top, "Back to the scores" under it at full
  width, then the steps with no list numbers. Copy, the loading, empty and refused lines, and the
  ids `#record`, `#record li`, `#record .label` are as you wrote them.
- Places still come from `game.over`. The record decides nothing.

In `design/web.pen`, 123 top-level frames where it had 119:
- "The record" added to the action row of `End · final scores (online)` and
  `End · final scores (ranked)`, light and dark.
- New: `Online · the record`, `Online · the record states` (loading, empty, refused), and the dark
  copy of each.

How the saved file was checked before the commit. The file on disk went from 7070725 to 7117045
bytes. Claude copied it and the file of `bd74568` out of git, opened both copies in Pen and hashed
them with the Pencil tools:
- The 115 frames the work did not touch hash, ids included, to the same value in both, and so do
  the variables.
- Each of the four end frames, with the one added button taken out, hashes to its old value.
- The four new frames hold the copy above and no frame is left marked as a placeholder.

Gate on `dev` at `5289f90`, from `web/`:
- `npx vp check`: clean. 97 files formatted, 89 with no lint or type errors.
- `npx vp test`: 30 files, 405 tests passed. `src/online/Ranked.test.tsx` now opens the record at
  the end of a ranked game on the mock server, reads "0 · deal" and goes back to the scores;
  `src/tableview/online.test.ts` checks the two buttons and that "The record" calls the hook.
- `npx vp build`: built.
No Rust changed, and the Rust gate was not run.

Not done:
- `e2e/ranked-smoke.e2e.ts` was not run: nothing answered on `127.0.0.1:8080`. It finds the
  button by role and name, which still holds, but the button is now part of the end screen and can
  be clicked only when the finale is over (`.end.done`), a few seconds after the scores appear.
- No online game was played by hand in a browser. The geometry above was measured with the
  page's own CSS at 390 and 360 px wide.

YOUR TASK

1. Start the Rust server on `127.0.0.1:8080` and run the ranked smoke from `web/` on this `dev`,
   the way you ran it for 040. Report what it printed.
2. If the click on "The record" times out, do not move the button back. Report the line and the
   time-out, and Claude changes the script's wait or the page.

CONTRACTS

- Frozen: `docs/protocol.md`, protocol 1, the generated tree, both fixture trees. Nothing here
  touched them.
- Yours: `server/`, Compose, deploy, CI, the generated protocol tree.
- Claude's: `web/` except `web/src/protocol/generated/`, and `design/`. `GameRecord.tsx` and the
  `#record` rules came from your branch. From here on, a screen the server work needs is described
  in the handover, and Claude draws and builds it.

HOW THE MACHINE WAS LEFT

- Worktree `/Users/nvorberg/Documents/development/skt-claude-record` on
  `feature/claude-record-frames`, level with `dev`. The branch and the worktree are kept.
- No dev server of this session is running.

DONE WHEN

- `git log -1 --oneline dev -- design/web.pen` prints `a06df70`.
- The ranked smoke passes against the Rust server on this `dev`.

REPORT BACK

A paste-ready prompt for Claude, written to `docs/handover/NNN-grok-to-claude-<slug>.md` and
printed in one code block: the `dev` commit you ran on, the command, and what it printed.
