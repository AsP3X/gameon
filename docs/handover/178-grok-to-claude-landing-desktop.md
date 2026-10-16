# 178 · Grok → Claude · The landing fills the desktop

You are Claude, the callee, working on Skull King Tavern
(`C:\Users\asp3x\Documents\development\gameon`), branch `dev`, commit `4be448b`.
Do this work yourself. Do not run `claude` or `grok`.

Read these first: `web/src/gameon/Landing.tsx`, the landing rules in
`web/src/styles/gameon.css` (`.go-hero`, `.go-ranked`, `.go-ways`, `.go-shelf`,
`.go-pick`, `.go-cta`, and the `min-width: 1000px` block that sizes them), the
`.go-wide` rules added for Games, `web/src/styles/tokens.css`,
`docs/agent-rules/design-sync.md`, `docs/agent-rules/web-quality.md`,
`docs/agent-rules/git.md`, and `docs/agent-rules/no-ai-attribution.md`.

## State

`dev` is even with `origin/dev` at `4be448b`. Games already uses the window from
1000px up: its nav, main and footer carry `go-wide`, `.go-wide .go-in` has no
max-width, and the inset is 32px, then 48px from 1440px. The landing does not.
Every landing section still sits in `.go-in` at `max-width: 1184px`. Inside that
column the hero is two capped boxes (`minmax(0, 500px)` and `minmax(0, 564px)`)
pushed apart, and the ranked row is capped at 512px and 440px the same way. A wide
window is empty margin. The phone layout, under 1000px, is the one to keep.

These files are already dirty. They are someone else's uncommitted work. Leave them
byte for byte. Do not stage, commit, restore, or edit them:

- `server/crates/ocho-server/src/room.rs`
- `web/src/ocho/Ocho.test.tsx`
- `web/src/ocho/Ocho.tsx`
- `web/src/ocho/motion.ts`

## Your task

Make the landing use the desktop window the way Games does. Implement it. The phone
layout stays as it is. Games stays as it is. Profile, the ladder, account, the
document pages and Ocho keep the 1184px column.

1. From 1000px up, the landing is full width. That is its nav, every section, and
   its footer. Reuse `go-wide`. Do not invent a second cap-removal rule. The inset
   stays the one Games uses: 32px, and 48px from 1440px. Hang the class on the
   landing nav, on `<main>`, and on the landing footer. `Frame.tsx` already adds
   `go-wide` when the page is Games. Add the landing to that, and nowhere else.

2. Removing the cap is not enough. The hero and the ranked row are capped inside
   the column, and `justify-content: space-between` would leave a hole once the
   page is wide. Fill the inset:
   - The hero slide is one row across the inset. The copy is the left column and
     stops around 640px, so the headline and the lead stay a block. The featured
     card fills the rest. It stays at least as tall as it is now (540px) and grows
     on a large window, so the hero is the top of the page. The hand scales with
     the card, not with the viewport, and stays inside the card. Skull King and
     Ocho both. Do not write an `oc-` selector in `gameon.css`.
     `web/src/styles/classes.test.ts` forbids that. Size Ocho's hand by where it
     sits, as Games does.
   - The ranked panel fills the inset. The copy and the podium share one row. The
     copy takes the flexible side. The podium takes about 36 to 42 percent and
     stays a group of three, not three stretched bars. The seven tiers run the
     width of the panel. When the server has no season this section is absent, and
     the rest of the page still fills the width.
   - "Three ways to sit down" is three equal columns across the inset. The column
     is the measure of the text. Do not cap the section back to 1184px.
   - "Pick a game" fills the inset. The Skull King card's felt grows with the card
     instead of staying 440px wide. The blurb stays about 62 characters wide.
     Coming soon is the band under that card. Three columns from 1000px. One row
     of six from 1600px, while each tile is still at least 200px. Hearts, Chess,
     Ludo, Four in a Row, Five Dice, and Suggest a game are those six. A shelf
     that hides some of them reflows the rest across the band. Cards still shows
     the Skull King card.
   - "Pull up a chair" fills the inset. The sentence grows. The button stays at
     the end.

3. Keep the copy, the carousel, the links, and the behaviour. Light and dark both
   work. Tokens from `web/src/styles/tokens.css` only. No new hex value. Interactive
   targets stay at least 44px, focus stays visible, and motion respects
   `prefers-reduced-motion`. At 360px wide there is no horizontal scroll.

4. Mirror the desktop landing in `design/gameon.pen` if that is where its frames
   already are. Edit a `.pen` file only through the Pencil tools. Pen on this
   machine is `C:\Program Files\Pencil\Pen.exe`. Update the desktop landing to this
   layout at 1440 wide, and add the same screen at 1920 wide for the signed-out
   page with the ranked season showing. Light and dark, where the file already has
   both. Leave the phone frames as they are. If the Pencil tools are not
   connected, do the code anyway and say the design file was not updated. Do not
   write a `.pen` file by hand.

5. `web/src/gameon/GameOn.test.tsx` covers this page. Update a test only when a
   structure you changed makes a true assertion fail. Do not delete a test to make
   the gate pass.

## Contracts

You may change `web/src/styles/gameon.css`, `web/src/gameon/Landing.tsx`,
`web/src/gameon/Frame.tsx` (the `go-wide` class for the landing only),
`web/src/gameon/GameOn.test.tsx`, and `design/gameon.pen` through Pencil. You may
not change the phone layout, the Games layout, any other page, `server/`,
`web/src/protocol/generated/`, or the four dirty files listed above. Copy, routes,
and what the server sends stay as they are.

## Done when

From 1000px up, the landing uses the window as specified, and under 1000px it looks
as it does today. `vp check`, `vp test`, and `vp build` pass. This checkout has
`core.autocrlf=true`. A full `vp check` may already fail on CRLF in files you did
not touch. Do not reformat the tree to clear that. If that is the only failure,
say so, and show `vp check --no-fmt` plus a format check of the files you changed.
The work is committed on `dev`. The commit message starts with `TASK:`. No
`Co-Authored-By` trailer. Do not push. Do not create a branch or a worktree. Stage
only this task's paths. If you commit a `.pen` file, its diff is only this landing
change. Run the web gate from `web/`.

## Report back

The CLI result is the report. No return handover. List the files you changed, the
commit, and what the web gate printed. Say whether the owner still has to save in
Pen.
