# 200 · Grok → Claude · Draw the Games library again, from scratch

You are Claude, the callee, working on Skull King Tavern
(`C:\Users\asp3x\Documents\development\gameon`), branch `dev`. Do this work yourself.
Do not run `claude` or `grok`.

Read `PRODUCT.md`, `docs/agent-rules/design-sync.md`, and `web/src/styles/tokens.css`.
Draw through the Pencil tools only. Pen is `C:\Program Files\Pencil\Pen.exe`.
Open `design/gameon.pen`. Do not write the `.pen` file by hand. Do not edit
`web/`, `server/`, `tokens.css`, or `PRODUCT.md`. Do not commit. Do not export
a picture.

## What this is

The owner wants these four frames replaced. The old picture is not a starting
point. Delete the children of each frame and draw the library below.

The page is where a player picks a game and sits down. It is not a second
landing. Do not draw a felt floor, a table in the middle of the room, two
felt doors, or a felt panel with three white cards beside it. Those were
already rejected.

The words already in the product stay. Do not invent a person, a season, a
table, a rating, or a game. Before you delete a frame, write down the names,
numbers, and table rows it already shows, and use those. If a frame has no
sample tables, use the empty line from the product: "No open tables right
now. Open one and others can sit down." and the button "Create a table".

## Frames

Read each one first. Keep its id, name, x, y, width, and theme mode. If a
name or width does not match, the open document is stale. Do not save it.
Reopen `design/gameon.pen` from disk and read again. If it is still wrong,
stop.

| Id | Name | Width |
| --- | --- | --- |
| `UCTe9` | Games · desktop | keep the width you read, it is the wide frame |
| `p6mx6u` | Games · desktop · dark | the same width |
| `I69lR` | Games · phone | 390 |
| `vk1Nh` | Games · phone · dark | 390 |

Leave every other frame alone, including `dqAXj`, `EKRZ1`, `z8V6wL`, and
`h6hTpa`.

The desktop frames may grow taller. The phone frames are one screen: set
each phone frame's height to 844.

## Shared rules

Tokens only. No new hex. Nunito for text. Pirata One only inside the existing
Skull King wordmark. Radius 16 on cards and buttons, 12 on an art well.
A control has a hard 4px lip, zero blur, offset 4px down. No glass, no
gradient, no small-caps, no emoji. Targets are at least 44px tall. The dark
frames use their theme mode. Do not paste a light colour onto them.

Reuse art already in the file. Skull King's well is `$gold-bg` with the
existing three-card fan, Skull King in front. Ocho's well is `$blue-bg`
with four rounded rects, radius 8, fanned, fills `$red`, `$gold`, `$green`,
`$blue`.

## Desktop, both themes

Page fill `$bg`.

**Nav.** Height 72. Fill `$bg`, bottom stroke `$line` 2px, padding 0 48,
space-between, centered. Left: the GameOn logo, then three links, Nunito
800 16px, gap 28. "Games" is `$green`. "Ways to play" and "Ladder" are
`$fg`. Right: the account already on this frame, or "Sign in" if it has
no account. "Sign in" is a secondary button, height 44, fill `$bg`, stroke
`$line` 2px, lip `$line`, label `$fg`.

**Opening.** Padding 36px 48px 0. One row, space-between, centered. Left:
"Games", Nunito 800, 48px, `$fg`. Right: four chips, height 44, radius 16,
gap 8, Nunito 800 15px. "All" is selected: fill `$green`, label `$white`,
lip `$green-d`. "Cards", "Board", and "Dice" are fill `$bg`, stroke `$line`
2px, lip `$line`, label `$fg`.

**Live games.** Padding 28px 48px 0. Two rows, stacked, gap 16. Each row is
height 128, fill `$bg`, radius 16, stroke `$line` 2px, lip `$line`, padding
16, vertically centered, space-between.

- Left, a row, gap 16, centered: an art well 96 by 96, radius 12, clipped.
  Then the name and, under it, the line, then "How to play". Skull King
  uses the existing wordmark. Ocho is Nunito 800 28px `$fg`. The line is
  Nunito 700 16px `$muted`: "The pirate trick-taking game" and "Match the
  colour or the number". "How to play" is Nunito 700 15px `$blue`.
- Right: a button, height 52, padding 0 24, fill `$green`, label `$white`,
  Nunito 800 16px, lip `$green-d`. "Play Skull King" on the first row.
  "Play Ocho" on the second.

**Tables and seat.** Padding 36px 48px 0. One row, gap 24, top aligned.
The left column takes the remaining width. The right column is 360px.

Left column. Heading "Open tables · Skull King", Nunito 800 24px `$fg`.
Under it, the table rows you copied off the frame before deleting it. Each
row is height 72, fill `$bg`, radius 16, stroke `$line` 2px, lip `$line`,
padding 0 16, centered, space-between. A format pill, the table's name in
Nunito 800 16px `$fg`, two lines in Nunito 700 14px `$muted` for the rounds
and the seats, and a "Join" button, height 44, fill `$bg`, stroke `$line`
2px, lip `$line`, label `$fg`. Under the rows, one line, gap 24: "All
public tables" and "Join with a code", Nunito 700 15px `$blue`.

Right column. One card, fill `$bg`, radius 16, stroke `$line` 2px, lip
`$line`, padding 16. The person you copied off the frame. If they have a
rating, the labels are "Rating", "Tier", and "Games", with the numbers
that were already there, and the button "Find a ranked game", full width,
height 48, fill `$blue`, label `$white`, lip the darker blue already used
on ranked buttons in this file. If the frame's person is a guest, use the
sentences already on that frame and the button "Create an account". Do not
swap in a new person.

**Coming soon.** Padding 28px 48px 0. One line, space-between. "Coming soon
· Hearts, Chess, Ludo, Four in a Row, Five Dice", Nunito 700 16px `$muted`,
with "Coming soon" in `$fg` Nunito 800. "Suggest a game", Nunito 700 15px
`$blue`.

**Footer.** Padding 32px 48px. Top stroke `$line` 2px. The GameOn logo, the
links already on the landing footer (Sign in, Games, Ladder, How to play,
Privacy, Imprint, Suggest a game) in Nunito 700 14px `$muted`, and
"© 2026 GameOn" in `$faint` 14px.

## Phone, both themes

Page fill `$bg`. Height 844. No footer.

**Nav.** Height 64, padding 0 16, bottom stroke `$line` 2px. Logo left.
Right: the same account or "Sign in" as the desktop frame of that theme.

**Title.** Padding 20px 16px 0. "Games", Nunito 800 32px `$fg`.

**The two games.** Padding 16px 16px 0. Stacked, gap 12. Each card fills
the width, fill `$bg`, radius 16, stroke `$line` 2px, lip `$line`, padding
12, vertical gap 8. Art well height 112, radius 12, clipped. Then the name,
Nunito 800 22px `$fg` (the Skull King wordmark on that card). Then the same
one-line description, Nunito 700 14px `$muted`. Then "Play Skull King" or
"Play Ocho", full width, height 48, fill `$green`, label `$white`, lip
`$green-d`.

**Coming soon.** Padding 16px 16px 0. "Coming soon", Nunito 800 14px `$fg`.
Under it the five names, Nunito 700 14px `$muted`, wrapping. "Suggest a
game" on the next line, `$blue`.

**Bar.** Pinned to the bottom of the frame, height 72, fill `$bg`, top
stroke `$line` 2px. Two equal buttons, gap 8, inset 16, each height 48.
"Tables" and "You". Fill `$bg`, stroke `$line` 2px, lip `$line`, label
`$fg`, Nunito 800 15px. No Play button in this bar.

## Save

Save `design/gameon.pen` from Pen with File, Save, while that document is
focused. Then read all four frames back. The file on disk must change.
If the save does not change it, try once more and say so if it still did not.

## Done when

`UCTe9` and `p6mx6u` are the desktop library: title, two game rows, open
tables, the seat, coming soon. `I69lR` and `vk1Nh` are 390 by 844 and open
on the two games. None of the four is a felt floor. No other frame changed.
`web/` was not edited.

## Git

Branch `dev`. Do not commit. Do not push. Do not create a branch or a worktree.

## Report back

The CLI result is the report. No return handover. For each frame quote the
name, width, height, and the child names in order. Name the person and the
table rows you kept, or say the frame had none. Give the file's new size
and write time.
