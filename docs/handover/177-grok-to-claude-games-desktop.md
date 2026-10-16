# 177 · Grok → Claude · Games fills the desktop

You are Claude, the callee, working on Skull King Tavern
(`C:\Users\asp3x\Documents\development\gameon`), branch `dev`, commit `dff0fff`.
Do this work yourself. Do not run `claude` or `grok`.

Read these first: `web/src/gameon/Games.tsx`, the Games rules in
`web/src/styles/gameon.css` (`.go-in` near the top, the Games block from `.go-games`,
and the `min-width: 1000px` rules that size that page), `web/src/styles/tokens.css`,
`docs/agent-rules/design-sync.md`, `docs/agent-rules/web-quality.md`,
`docs/agent-rules/git.md`, and `docs/agent-rules/no-ai-attribution.md`.

## State

`dev` is even with `origin/dev` at `dff0fff`. The live page
`https://gameon.corespace.de/games` is this screen. On a desktop the whole view sits
in a centred column: `.go-in` is `max-width: 1184px`. From 1000px up the body is two
columns, the live games stacked in the left one and a 340px rail (your seat, open
tables) on the right. A wide window is mostly empty margin on both sides. The phone
layout, under 1000px, is one column and is the one to keep.

These files are already dirty. They are someone else's uncommitted work. Leave them
byte for byte. Do not stage, commit, restore, or edit them:

- `server/crates/ocho-server/src/room.rs`
- `web/src/ocho/Ocho.test.tsx`
- `web/src/ocho/Ocho.tsx`
- `web/src/ocho/motion.ts`

## Your task

Redesign the Games view for a desktop so it uses the window. Implement it. Phone
layout stays as it is. Other pages keep the 1184px column.

1. From 1000px up, the Games view is full width. That is its nav, its main, and its
   footer, and only those. The page inset is 32px at 1000px and 48px from 1440px.
   There is no 1184px cap on this view. Landing, profile, ladder, account, the
   document pages, and Ocho keep today's column. Scope the wider nav and footer so
   they apply on Games only. A class on this page's fragment is enough. Prefer CSS.
   Change `Games.tsx` or `Frame.tsx` only to hang that class.

2. The desktop composition, top to bottom:
   - The nav spans the inset. Same contents as now.
   - The head is one row. "Games" and "Two games are live. More are on the way."
     sit on the left. The shelf filters sit on the right.
   - The disconnected line, when it is shown, is a full-width bar under the head:
     "Not connected. Trying again…"
   - Jump back, when it is shown, is a full-width bar under that. When it is absent,
     the next band starts under the head. Do not reserve an empty slot for it.
   - One band fills the width. Skull King and Ocho are two equal cards side by side.
     Each card is horizontal: the felt and the fan on the left, and on the right the
     title, the blurb, the two ways, and the actions. The cards grow with the window.
     On a 1440×900 window they are the main surface, tall enough that the page is not
     a short strip floating in a blank window. The third column is 400px and the same
     height as those two cards. Your seat is on top. Open tables fills the rest of
     that column. If the table list is longer than the cards, the list scrolls inside
     the open-tables card. The page does not grow a second screen of empty side margin
     to fit six rows.
   - Coming soon is a full-width band under that row. Hearts, Chess, Ludo, Four in a
     Row, Five Dice, and Suggest a game sit in one row from 1600px. From 1000px to
     1599px they wrap in rows of three that still span the width. A tile stays at
     least 200px wide. If six tiles would be narrower than that, use two rows of three
     that span the width.
   - The footer spans the same inset.

3. When the shelf is Board or Dice, both live cards are hidden. Coming soon then takes
   the main area and the rail stays on the right, still using the width. Do not leave
   a blank hole where the live cards were. All and Cards show both live cards.

4. Keep every state, the same copy, the same links, and the same behaviour:
   disconnected; jump back for a running game, a seat that is waiting, and a game
   saved on this device; a guest seat and an account seat, with a rating and without
   one; open tables loading, failed, empty, and listed, including "All public tables"
   and "Join with a code"; the shelves All, Cards, Board, and Dice. Light and dark
   both work. Tokens from `web/src/styles/tokens.css` only. No new hex value.
   Interactive targets stay at least 44px, focus stays visible, and motion respects
   `prefers-reduced-motion`. At 360px wide there is no horizontal scroll.

5. Mirror the desktop view in `design/web.pen`. Edit that file only through the Pencil
   tools. Pen on this machine is `C:\Program Files\Pencil\Pen.exe`. Draw the signed-in
   Games view, with open tables, at 1440×900 and at 1920×1080. Light and dark, where
   the file already has both. Update any existing desktop Games frames to this layout.
   Leave the phone frames as they are. If the Pencil tools are not connected, do the
   code anyway and say the design file was not updated. Do not write the `.pen` file
   by hand.

6. `web/src/gameon/GameOn.test.tsx` covers this page. Update a test only when a
   structure you changed makes a true assertion fail. Do not delete a test to make
   the gate pass.

## Contracts

You may change `web/src/styles/gameon.css`, `web/src/gameon/Games.tsx`,
`web/src/gameon/Frame.tsx` (a class for this page only), `web/src/gameon/GameOn.test.tsx`,
and `design/web.pen` through Pencil. You may not change the phone layout, any other
page, `server/`, `web/src/protocol/generated/`, or the four dirty files listed above.
Copy, routes, and what the server sends stay as they are.

## Done when

From 1000px up, Games uses the window as specified, and under 1000px it looks as it
does today. `vp check`, `vp test`, and `vp build` pass. The work is committed on
`dev`. The commit message starts with `TASK:`. No `Co-Authored-By` trailer. Do not
push. Do not create a branch or a worktree. Stage only this task's paths. If you
commit `design/web.pen`, its diff is only this Games change. Run the web gate from
`web/` with the toolchain the repo uses (`vp check`, `vp test`, `vp build`).

## Report back

The CLI result is the report. No return handover. List the files you changed, the
commit, and what `vp check`, `vp test`, and `vp build` printed. Say whether the owner
still has to save in Pen.
