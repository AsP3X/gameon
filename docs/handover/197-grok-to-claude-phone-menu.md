# 197 · Grok → Claude · A menu on the phone landing, not a label

> Status: withdrawn by `198`. The owner rejected the three-button menu. Do not run this file.

You are Claude, the callee, working on Skull King Tavern
(`C:\Users\asp3x\Documents\development\gameon`), branch `dev`. Do this work yourself.
Do not run `claude` or `grok`.

Read `docs/agent-rules/design-sync.md` and `web/src/styles/tokens.css`. Draw through
the Pencil tools only. Pen is `C:\Program Files\Pencil\Pen.exe`. Open
`design/gameon.pen`. Do not write the `.pen` file by hand. Do not edit `web/`,
`server/`, `tokens.css`, or `PRODUCT.md`. Do not commit. Do not export a PNG or
any other picture.

## Why the last pass was rejected

`196` put the word "Games" in the logo row, beside the mark, and left PLAY where
it was. The owner called that lazy. A 16px label is not a menu, and it does not
give the game library a place on the first screen. Remove that label if it is
still in the open document. Do not put it back.

## State

`dev` is `c1535c2`. `design/gameon.pen` on disk is still 7,838,095 bytes, last
written 2026-10-17 20:41. The open Pen document may be ahead of that file: it
may already show "Games" in the phone logo row. These files are untracked, and
you leave them alone:

- `design/landing-desktop-dark.png`
- `design/landing-desktop-proposal.png`
- `design/landing-phone-dark.png`
- `design/landing-phone-proposal.png`

Do not revert the pen file. Do not stage it. Do not commit it.

The frames are:

- `z8V6wL`, `Landing · phone`, width 390, light
- `h6hTpa`, `Landing · phone · dark`, width 390, dark

The desktop nav already has three places: Games, Ways to play, Ladder. On the
phone those three are not a menu. Games, the game library, is a footer link
after Hero, Ranked, and Coming soon.

## Your task

1. Read `z8V6wL` and `h6hTpa` through the Pencil tools before you change either
   one. If either is not width 390, or is not named as above, the open document
   is a stale buffer. Do not save it. Reopen `design/gameon.pen` from disk and
   read them again. If they are still wrong, stop and say what you found.

2. Keep each id, name, x, y, width, and theme mode. The frame may grow taller
   by the height of the menu. Do not grow it for any other reason.

3. Leave every other frame alone. In particular leave `dqAXj`
   (`Landing · desktop`) and `EKRZ1` (`Landing · desktop · dark`). Do not
   resize them. Do not copy this menu onto them.

4. Leave Hero, Ranked, Coming soon, and Footer as they are: same order, same
   copy, same cards. The footer may keep its Games link.

## The logo row

The top bar stays the logo and the one trailing control it had before `196`.
If that control is PLAY, keep PLAY. Delete the "Games" text and its hit area
from this row. Do not add a word, an icon, or a second control here.

## The menu

Insert one block directly under the top bar, before Hero. Name it `Menu`.
Inset 16px from the left and right of the frame. 12px below the bar. 20px
above Hero. Three buttons, stacked, gap 8. Each button is the full width of
that inset. This block is the menu. It is open. It is not a hamburger, not a
sheet, and not a label in the bar.

1. **Games.** Height 72. Radius 16. Fill `$green`. Label "Games", centered,
   Nunito 800, 22px, `$white`. Hard lip 4px, zero blur, offset 4px down,
   colour `$green-d`. This is the game library. It is the first button and
   the only green one.

2. **Ways to play.** Height 56. Radius 16. Fill `$bg`. Stroke `$line` 2px.
   Label "Ways to play", centered, Nunito 800, 17px, `$fg`. Hard lip 4px,
   zero blur, offset 4px down, colour `$line`.

3. **Ladder.** The same button as Ways to play. Label "Ladder".

No icons. No chevrons. No second line of copy. No new hex. No second
typeface. No glass, no gradient, no small-caps, no emoji. Pirata One stays
where it already is and you do not touch it.

`h6hTpa` gets the same menu. Its theme mode switches the colours. Do not
paste a light colour onto it. `$green`, `$white`, and `$green-d` are the
Games button on both frames.

## Save

Save `design/gameon.pen` from Pen with File, Save, while that document is
focused, and only after these two frames are the ones you edited. Then read
`z8V6wL` and `h6hTpa` back. Both are still width 390 and still named as
above. The logo row does not contain "Games". The first thing under the bar
is the menu, and its first button is "Games". The file on disk must change
from 7,838,095 bytes. If the save does not change it, try once more and say
so if it still did not.

## Done when

Both phone frames open on a logo row, then a three-button menu, then the
hero. Games is a green button, 72px tall, full width of the menu. Neither
frame is other than 390 wide. No other frame changed. `web/` was not edited.

## Git

Branch `dev`. Do not commit. Do not push. Do not create a branch or a worktree.

## Report back

The CLI result is the report. No return handover. For each of `z8V6wL` and
`h6hTpa`, quote the name, the width, the height, the logo row's text, and
the menu's three labels in order. Say whether Hero or anything below it
changed. Give the file's new size and write time.
