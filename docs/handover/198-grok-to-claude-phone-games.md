# 198 · Grok → Claude · Put the games where M5myF is

> Status: withdrawn by `199`. `M5myF` is the PLAY button, not a section. Do not run this file.

You are Claude, the callee, working on Skull King Tavern
(`C:\Users\asp3x\Documents\development\gameon`), branch `dev`. Do this work yourself.
Do not run `claude` or `grok`.

Read `docs/agent-rules/design-sync.md` and `web/src/styles/tokens.css`. Draw through
the Pencil tools only. Pen is `C:\Program Files\Pencil\Pen.exe`. Open
`design/gameon.pen`. Do not write the `.pen` file by hand. Do not edit `web/`,
`server/`, `tokens.css`, or `PRODUCT.md`. Do not commit. Do not export a PNG or
any other picture.

## What the owner rejected

A word in the logo row was rejected. A stack of three buttons, "Games",
"Ways to play", and "Ladder", was rejected. Both are links. The owner is
pointing at node `M5myF` and wants that node to be the games.

## State

`design/gameon.pen` on disk is 7,845,400 bytes, written 2026-10-17 20:53.
The phone frames `z8V6wL` and `h6hTpa` have a block named `Menu` under the
bar. Delete that block on both frames. Do not leave it behind the games.

These files are untracked. Leave them alone:

- `design/landing-desktop-dark.png`
- `design/landing-desktop-proposal.png`
- `design/landing-phone-dark.png`
- `design/landing-phone-proposal.png`

Do not revert the pen file. Do not stage it. Do not commit it.

## Your task

1. Read `M5myF` through the Pencil tools before you change it. Quote its
   name, its parent frame, its width, and its height in your report. If the
   open document does not contain `M5myF`, reopen `design/gameon.pen` from
   disk and read it again. If it is still missing, stop.

2. Replace `M5myF` with the two live games, in that node's place. Keep the
   parent. Keep the node's x and y. Keep the width unless the node is
   narrower than 358, in which case use the frame's content width with 16px
   of side inset. The height becomes whatever the two cards need. Do not
   move the sections above or below except to close the gap the `Menu`
   block leaves, and to make room for the cards.

3. If `M5myF` has a twin on the other theme, make the same replacement
   there. The phone pair is `z8V6wL` (light) and `h6hTpa` (dark). Do not
   edit `dqAXj` or `EKRZ1` unless `M5myF` is inside one of them. If it is,
   change that node only, and the same node on its dark or light twin.
   Do not redesign the rest of the frame.

4. If Hero, or any block that stays, already shows these same two games,
   remove that duplicate so Skull King and Ocho appear once.

## The two games

Stacked, gap 12. Each card is the full width of the slot. Radius 16. Fill
`$bg`. Stroke `$line` 2px. Hard lip 4px, zero blur, offset 4px down, colour
`$line`. Padding 16. Vertical gap 12 inside the card.

1. **Skull King.** Art well height 160, radius 12, clipped, fill `$gold-bg`.
   The three existing card faces, fanned, Skull King largest and in front.
   Reuse the images already in the file. Do not draw new faces. Under the
   well, the existing Skull King wordmark: "Skull" and "King", Pirata One,
   "King" in `$green`. Then "The pirate trick-taking game", Nunito 700,
   16px, `$muted`. Then a button, full width, height 52, radius 16, fill
   `$green`, label "Play Skull King", Nunito 800, 16px, `$white`, lip 4px
   `$green-d`.

2. **Ocho.** Art well height 160, radius 12, clipped, fill `$blue-bg`.
   Four rounded rects, 56 by 84, radius 8, fanned: `$red`, `$gold`,
   `$green`, `$blue`. Under the well, "Ocho", Nunito 800, 28px, `$fg`.
   Then "Match the colour or the number", Nunito 700, 16px, `$muted`.
   Then a button, full width, height 52, radius 16, fill `$green`, label
   "Play Ocho", Nunito 800, 16px, `$white`, lip 4px `$green-d`.

No heading that says "Games". No shelf filters. No third game. No icons
on the buttons. No new hex. No second typeface beyond the wordmark already
in the file. No glass, no gradient, no small-caps, no emoji.

On the dark frame, use that frame's theme variables. Do not paste a light
colour onto it.

The logo row stays the logo and PLAY. It does not contain the word "Games".

## Save

Save `design/gameon.pen` from Pen with File, Save, while that document is
focused. Then read `M5myF`'s parent back. The two games are where `M5myF`
was, and the `Menu` block is gone. The file on disk must change from
7,845,400 bytes. If the save does not change it, try once more and say so
if it still did not.

## Done when

The node the owner pointed at is the two games. The three-button menu is
gone. No other frame was redesigned. `web/` was not edited.

## Git

Branch `dev`. Do not commit. Do not push. Do not create a branch or a worktree.

## Report back

The CLI result is the report. No return handover. Quote what `M5myF` was
before you replaced it. Then quote the parent's child names in order, and
the file's new size and write time.
