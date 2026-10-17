# 204 · Grok → Claude · The open-games dialog on a desktop

You are Claude, the callee, working on Skull King Tavern
(`C:\Users\asp3x\Documents\development\gameon`), branch `dev`. Do this work
yourself. Do not run `claude` or `grok`.

Read this file, `web/src/gameon/Games.tsx` (`Sheet`, `Finder`, `NewOcho`),
and the sheet rules in `web/src/styles/gameon.css` from `.go-sheet` through
the wide `.go-finder` rules. The rules that apply are
`docs/agent-rules/web-quality.md` and `docs/agent-rules/design-sync.md`.

## What is wrong

On a real desktop the Open games dialog looks like a phone sheet pasted in
the middle of the window. Measured in Edge at 1440×900, light and dark:

- The dialog fills the window (`1410×805`, `display: flex`, centred) but
  its overflow is `auto`, so the scrollbar is on the screen edge, far from
  the card.
- The card is `560×757`. Its content is `1035` tall, so Players is sliced
  off and Table, Match and "Open an Ocho table" sit below the fold.
- `.go-sheet-panel > * { flex: none }` stops the card from being a scroll
  container of its own. The window scrolls the whole card, title included.

The phone sheet is fine. Do not turn it into this desktop layout.

## Your task

1. On a wide window, from 1000px, the dialog is one card in the middle,
   not a column of 560. Width `min(960px, calc(100% - 48px))`. It fits in
   the window: `max-height: calc(100dvh - 48px)`. The 4px lip is visible,
   not clipped. There is no scrollbar on the viewport. `html:has(.go-sheet[open])`
   still hides the document scroll.

   Beat the browser's `dialog:modal` rule. It sets `overflow: auto` and a
   max size that `.go-sheet` loses to, because `dialog:modal` is more
   specific. `.go-sheet:modal` must set `overflow: hidden`, `max-width: none`,
   `max-height: none`, `margin: 0`, `border: 0`, and the full-window box the
   sheet already asks for.

   The heading "Open games" and Close stay put. Under them, two columns:

   - Left: the search, the chips, and the list. The list is what scrolls
     when there are many tables. Its rows stay as they are.
   - Right: "Open a Skull King table", then the Ocho form. Players, the
     slider, Table, Match and "Open an Ocho table" are on screen together
     at 900px tall. The right column scrolls only when the window is
     shorter than the form.

   The phone sheet still rises from the bottom, full width, and its panel
   scrolls. Do not centre it. Do not play the sheet's rise animation on the
   wide card.

   `.go-sheet-panel > * { flex: none }` is why the card will not shrink.
   The wide body needs `min-height: 0` and `flex: 1` so the columns get the
   room and the list scrolls inside them. Tokens only. No new hex. No
   `oc-` selector in `gameon.css`.

2. Keep every behaviour the tests already cover: search, chips, both
   games, join, create, Teams locking the slider at 4, Escape, close, the
   scrim, focus back on the opener. The You sheet is unchanged.

3. Draw the wide card on `UCTe9` and `p6mx6u` in `design/gameon.pen`,
   through the Pencil tools only. The dialog is the two columns, not the
   560px stack. Put back the sample row that was hidden to make the stack
   fit, if it is still missing: Anne's Skull King table next to the house
   row and Anne's Ocho row. Phone frames `I69lR` and `vk1Nh` stay a bottom
   sheet. Do not change their width. Do not commit the pen file.

   Pen is `C:\Program Files\Pencil\Pen.exe`. Ctrl+S must hit `gameon.pen`,
   not Dashboard. Report the byte size and the write time. If focus will
   not move, say the drawing is only in the open document.

## Contracts

Do not edit `server/` or `docs/ocho-protocol.md`. Do not change the landing,
the slider's range, or Ocho's sit-down. Create still sends
`{ players, teams, match, open: true }` and no `bots`.

## Done when

From `web/`: `vp check --no-fmt` is clean, `vp fmt --check` passes on the
files you touched, `npm test` passes, and `vp build` builds. A full
`vp check` may still report pre-existing CRLF. Say so.

## Git

Branch `dev`. Commit only your `web/` paths, after those gates, with a
`TASK:` message. No `Co-Authored-By`. Do not push. Do not create a branch
or a worktree. Do not commit `design/gameon.pen` or `docs/`.

## Report back

What the wide dialog is now, the test count, and whether the pen was saved.
No return handover.
