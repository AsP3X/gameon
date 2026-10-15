# 176 · Grok → Claude · Ocho's table fills the desktop

You are Claude, the callee, working on Skull King Tavern
(`C:\Users\asp3x\Documents\development\gameon`), branch `dev`, commit `89a3e0e`.
Do this work yourself. Do not run `claude` or `grok`.

This task is the design only. The owner will approve the frames before anyone changes
the app. Do not edit `web/`, `server/`, or any other code. Do not commit. Do not push.
Do not create a branch.

Read `web/src/styles/ocho.css` (`.oc-page`, `.oc-top`, `.oc-table`, `.oc-felt`, `.oc-hand`,
the `min-width: 720px` block) and the table in `web/src/ocho/Ocho.tsx` (`Table`, `Centre`,
the hand, the colour namer). Then open `design/ocho.pen` in Pen and edit it only through
the Pencil tools. Pen is `C:\Program Files\Pencil\Pen.exe`. If the Pencil tools are not
connected, stop and say so. Do not write the `.pen` file by hand.

## State

`feature/game-ocho` is merged into `dev` at `89a3e0e` and pushed. The live table is a
centred column: `.oc-table` is `max-width: 960px`, and from 720px up `max-width: 1200px`,
with `margin: 0 auto`. A wide window has empty page on both sides and empty page under the
hand. Phone, sit-down, the waiting room, how to play, and the score sheet are out of this
task. `vp test` on the merged tree was 56 files, 831 tests passed. Nothing in this task
is implemented in CSS yet.

## Your task

Draw the match so that, on a desktop, it uses the whole window. Phone frames stay as they
are. Sit-down, waiting, rules, and the score sheet stay as they are.

1. Find every desktop frame of the live table: your turn, someone else's turn, drawing
   from the pile, answering a stack, naming a colour on the card, X-Ray, and a partner's
   hand. If a state has no desktop frame, add one. Light and dark, where the file already
   has both.
2. Make the table fill the artboard. Where a desktop table frame is about 1040px wide,
   replace that width with a 1440×900 frame, and add the same screen at 1920×1080 for
   "your turn" in light mode, so a large monitor is visible. The table goes to the edges
   of those frames. There is no centred 960px or 1200px column and no empty band under
   the hand.
3. Keep the same chrome, top to bottom:
   - The top bar is the full width. Same contents: `OCHO`, `Hand n`, the menu button.
     About 68px tall, 24px of side padding, the existing bottom border.
   - The felt fills every pixel between that bar and the player's strip. Inset it 12px
     from the page edges. Keep the 24px corner radius and the existing felt colour.
     Seats stay where they are: three across the top, two on the left, two on the right.
     Give them enough room that eight seats are not crushed. A partner hand and an X-Ray
     card stay on that seat.
   - The centre stays in the middle of the felt: the colour pill, the direction, the draw
     pile, the discard, the stack count. On the 1440×900 frame the pile cards are about
     96px wide, the same card component. On 1920×1080 they may grow a little more, still
     one row, still centred.
   - The player's strip is pinned to the bottom of the frame: the "you" row, then the
     hand across the width, then the status line. The only button that remains is `Keep`,
     and only on the frame where a just-drawn card can be declined. Hand cards are larger
     than on the phone, one row, overlapping when the hand is long. 24px of side padding
     so the last card is not cut off.
4. Naming a colour still covers the felt. The felt dims. The wild card grows in the
   centre. It is not a dialog.
5. Reuse the file's components and variables. Same copy. No new hex values. Tokens are
   the ones already in the file, matching `web/src/styles/tokens.css`.

## Contracts

You may change desktop table frames in `design/ocho.pen` only. You may not change phone
frames, sit-down, the waiting room, how to play, the score sheet, or any file under
`web/` or `server/`. The implementation after the owner approves will drop the 1200px
cap and make `.oc-table-page` fill `100dvh` from 720px up. Do not do that implementation
in this task.

## Done when

The desktop table frames show the match filling a 1440×900 window, and "your turn" also
fills a 1920×1080 window. `git status` shows no change under `web/` or `server/`. Nothing
is committed. If Pen has not written the file yet, say that the owner still has to save.

## Report back

The CLI result is the report. No return handover. List each frame you changed or added,
with its size, and confirm `web/` was not edited. Say whether the owner still has to save
in Pen.
