# 199 · Grok → Claude · The phone PLAY button becomes Games

You are Claude, the callee, working on Skull King Tavern
(`C:\Users\asp3x\Documents\development\gameon`), branch `dev`. Do this work yourself.
Do not run `claude` or `grok`.

Read `docs/agent-rules/design-sync.md`. Draw through the Pencil tools only.
Pen is `C:\Program Files\Pencil\Pen.exe`. Open `design/gameon.pen`. Do not
write the `.pen` file by hand. Do not edit `web/`, `server/`, or `tokens.css`.
Do not commit. Do not export a picture.

## What the owner asked

`M5myF` is the node they named. It is the PLAY button in the phone logo row:
an instance of `X7dwnl` ("Button / primary"), label "PLAY", 92 by 44, inside
`PRwVy` ("Nav") of `z8V6wL` ("Landing · phone"). The dark twin is `vMRbF`
("Play") in `azYVz` ("Nav") of `h6hTpa`.

Replace that button with Games. Do not put game cards inside the nav. A card
does not fit in a 68px row.

The three-button `Menu` under the bar was rejected. Delete it.

## Your task

1. Read `M5myF` and `vMRbF` before you change them. If either is missing,
   reopen `design/gameon.pen` from disk. If it is still missing, stop.

2. On `z8V6wL`, keep `M5myF` as an instance of `X7dwnl`. Change its label
   from "PLAY" to "Games". Keep it on the right of the nav, height 44,
   vertically centered as it is now. Grow it to the left only as far as the
   word needs. Do not cover the logo. Do not add a second control.

3. Do the same to `vMRbF` on `h6hTpa`. Label "Games".

4. Delete the `Menu` block on both phone frames (`a62Wk` on the light frame,
   `E3Of1` on the dark frame). Move Hero up so it sits 0px under the nav,
   the same gap the menu had replaced. Do not change Hero's contents. The
   Skull King slide stays.

5. Do not edit `dqAXj`, `EKRZ1`, or any other frame. Do not add the word
   "Games" anywhere except these two buttons.

No new hex. No new component. The button keeps its existing fill, lip, type,
and radius.

## Save

Save `design/gameon.pen` from Pen with File, Save, while that document is
focused. Then read both navs back. Each logo row is the logo and a button
that says "Games". The `Menu` block is gone. The file on disk must change
from 7,845,400 bytes. If the save does not change it, try once more and say
so if it still did not.

## Done when

Both phone frames open on logo and Games. PLAY is gone from those two navs.
The three-button menu is gone. Hero is unchanged. `web/` was not edited.

## Git

Branch `dev`. Do not commit. Do not push. Do not create a branch or a worktree.

## Report back

The CLI result is the report. No return handover. For each of `M5myF` and
`vMRbF`, quote the label, width, and height. Quote the child names of
`z8V6wL` and `h6hTpa` in order. Give the file's new size and write time.
