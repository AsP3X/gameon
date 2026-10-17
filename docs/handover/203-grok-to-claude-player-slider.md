# 203 · Grok → Claude · A slider for the player count

You are Claude, the callee, working on Skull King Tavern
(`C:\Users\asp3x\Documents\development\gameon`), branch `dev` at `0947d79`.
Do this work yourself. Do not run `claude` or `grok`.

Read this file, `web/src/gameon/Games.tsx` (`NewOcho`), the finder rules in
`web/src/styles/gameon.css`, and the Ocho-create tests in
`web/src/gameon/GameOn.test.tsx`. The rules that apply are
`docs/agent-rules/web-quality.md` and `docs/agent-rules/design-sync.md`.

## State

The Open games dialog is in the app. Its Ocho form picks the player count
with the shared `Stepper`: a minus button, the number, and a plus button.
Ocho's own sit-down page uses that same stepper. Leave sit-down as it is.
`design/gameon.pen` is dirty and uncommitted. It is the Open games drawing
from handover 202, 7,637,940 bytes, written 2026-10-17 23:30. Edit that
drawing. Do not revert it, and do not commit it.

## Your task

1. In the Open games dialog only, replace the Players stepper with a slider
   for 2 through 8. Default stays 4. Teams still locks the count at 4.

   Draw it as one field, full width of the form on a phone and on a wide
   window. Do not leave it as a side-by-side stepper, and do not ship a bare
   browser range.

   - One line: the heading "Players", and the current number at the right in
     the same heavy size the stepper used (26px, weight 900).
   - Under that, a track the full width. The track is 8px tall, fully
     rounded, `var(--soft)`. The filled part, from the start through the
     current stop, is `var(--green)`.
   - The thumb is a 28px circle, `var(--bg)`, a 2px `var(--line)` border, and
     a 2px lip (`0 2px 0 var(--line)`). Its hit target is at least 44px.
     Focus uses the same 3px `var(--blue)` ring as `.go-sheet-close`.
   - Under the track, the seven stops 2 3 4 5 6 7 8, in 14px. The current
     stop is `var(--fg)` and weight 800. The others are `var(--muted)`.
     Each stop is a button at least 44px tall that sets the count.
   - The control is a real `input type="range"` (`min` 2, `max` 8, `step` 1)
     with the accessible name "Players". Arrow keys move one player.
     The number the heading's row shows is an `output` of that value.
   - Teams disables the range and the stop buttons, keeps the value at 4,
     and shows the lock icon with "Teams is 2v2 · 4 players". The fill stays
     `var(--green)` only through 4, and the thumb does not look like a
     second colour was invented. When Teams is off, that caption is
     "2 to 8 players", as the stepper said.
   - Tokens from `web/src/styles/tokens.css` only. No new hex, no gradient,
     no glass. Styles live in `gameon.css` under `go-` names.
     `classes.test.ts` forbids an `oc-` selector in that file. Do not change
     `.oc-stepper`. `prefers-reduced-motion` gets no thumb travel.

2. Update the Games tests. "One player more" is gone from this dialog.
   Setting the range to 5 still sends `players: 5`. Teams still sends
   `players: 4` and the range is disabled. Sit-down's stepper tests stay.

3. Draw the slider in `design/gameon.pen` through the Pencil tools only.
   Do not hand-edit the file. On `UCTe9` and `p6mx6u` the dialog's Ocho
   form shows this slider instead of the minus, the number and the plus,
   value 4, stops 2 through 8, stop 4 the current one. On `I69lR` and
   `vk1Nh`, bring the Ocho form into the sheet far enough that the same
   slider is on the frame. Do not resize the desktop frames' width, and do
   not resize the phone frames' width. Same tokens, both themes.

   Pen is `C:\Program Files\Pencil\Pen.exe`. Ctrl+S must hit `gameon.pen`,
   not Dashboard. Report the byte size and the write time. If focus will
   not move to `gameon.pen`, say the drawing is only in the open document.
   Do not commit the pen file.

## Contracts

Do not edit `server/`, `docs/ocho-protocol.md`, or Ocho's sit-down. The
create message stays `{ players, teams, match, open: true }` with no `bots`.
Do not change the landing, the list, or the search.

## Done when

From `web/`: `vp check --no-fmt` is clean, `vp fmt --check` passes on the
files you touched, `npm test` passes, and `vp build` builds. A full
`vp check` may still report pre-existing CRLF on untouched files. Say so.

## Git

Branch `dev`. Commit only your `web/` paths, after those gates, with a
`TASK:` message. No `Co-Authored-By`. Do not push. Do not create a branch
or a worktree. Do not commit `design/gameon.pen` or `docs/`.

## Report back

What the slider does, the test count, and whether the pen file was saved.
No return handover.
