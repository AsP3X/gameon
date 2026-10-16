# 191 · Grok → Claude · The phone Games page fits one screen

You are Claude, the callee, working on Skull King Tavern
(`C:\Users\asp3x\Documents\development\gameon`), branch `dev`. Do this work yourself.
Do not run `claude` or `grok`.

The owner is looking at two phone frames. They are a long stack: a header, a
jump-back card, a Skull King card, open tables, coming soon, and a footer.
They do not want that scroll. Edit these nodes in place. Do not add a frame.
Do not edit `web/` or `server/`.

- `I69lR`, `Games · phone`, 390 wide
- `vk1Nh`, `Games · phone · dark`, 390 wide

Open `design/gameon.pen` through the Pencil tools. Pen is
`C:\Program Files\Pencil\Pen.exe`. Do not write the file by hand. Save from
Pen with the `gameon.pen` window focused. The file on disk must change.

## The screen

Set each frame to 390 by 844. That is the whole phone. Nothing on this screen
sits below 844. Delete the footer from these two frames. Delete the page
header. The nav stays, one row, about 60px: the GameOn mark and one 44px menu
button.

Under the nav, `Floor` fills the rest of the 844. It is felt, edge to edge.
The same felt as the desktop Games floor (`UCTe9` / `p6mx6u`). No white page.
No card stack.

On the felt, one table, inset 16px, filling the space above a bottom bar.
In the middle: "Skull King", "solo against 3 bots", "Round 4 of 10 · saved on
this device", and one green button "Continue". Four seat marks. The bottom
one is filled and says "You". A few cards lie on the table. This is the only
thing the thumb sees.

`Bar` is pinned to the bottom of the floor, 72px, dark. Three equal buttons,
each at least 44px:
- "Tables"
- "You"
- "Play"

No other section on the screen. No coming-soon tiles. No list of tables. No
"Games" title.

## The dialogs

The three buttons open dialogs. Draw each dialog as a child of the frame,
390 by 844, covering the floor. Name them `Dialog · Tables`, `Dialog · You`,
and `Dialog · Play`. After they are drawn, hide them (visible false, or
opacity 0, whichever this file uses) so the frame the owner sees is the
table, not a covered page. They must remain in the layer list so a click
shows one.

Each dialog is a sheet, not a new page. A scrim, then a panel from the
bottom that covers about three quarters of the screen, radius 16 on the top
corners, and a 44px close control.

- `Dialog · Tables`. Heading "Open tables". The filters All, Cards, Board,
  Dice in one row. Then the six tables already on this frame, as six compact
  rows. The lines stay: "10 rounds · 1 to 10 cards" with "0 of 4", "5 rounds
  · 6 to 10 cards" with "1 of 4", "5 rounds · 5 cards each" with "0 of 4",
  "10 rounds · 2, 4, 6, 8, 10 twice" with "0 of 4", "10 rounds · 9, 7, 5, 3,
  1 twice" with "0 of 4", and "5 rounds · 5 cards each" with "2 of 3". Under
  them, "All public tables" and "Join with a code". The list may scroll
  inside the sheet. The page does not.
- `Dialog · You`. Anne, Captain, rating 34, 23 games, and the words already
  on the seat. Under that, one line: "Coming soon · Hearts, Chess, Ludo,
  Four in a Row, Five Dice" and "Suggest a game". Then the old footer links
  in one wrap: Games, Ladder, How to play, Privacy, Imprint. No big footer.
- `Dialog · Play`. Two large green buttons, "Play Skull King" and "Play
  Ocho". One line under each: "The pirate trick-taking game" and "Match the
  colour or the number". Nothing else.

Light frame stays light. Dark frame stays dark. No new hex. Nunito. Radius
16. Green buttons.

## Done when

A read of the file shows both frames at height 844. The body has `Floor` and
the three dialogs. The visible design is the table and the three-button bar.
The words "Jump back in", "Coming soon" as a section title, and "Pick a game"
are not on the visible floor. Do not commit.

## Report back

The CLI result is the report. No return handover. Quote each frame's height
and the names of its body children after the save, and the file size.
