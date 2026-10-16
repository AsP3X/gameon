# 190 · Grok → Claude · Replace the Games page. Do not restack it.

You are Claude, the callee, working on Skull King Tavern
(`C:\Users\asp3x\Documents\development\gameon`), branch `dev`. Do this work yourself.
Do not run `claude` or `grok`.

The owner looked at `UCTe9` and `p6mx6u` and said the redesign looks exactly
the same. They are right. A header, a felt panel with text and a fan, three
white cards, and a tile row is the same page. Do not ship that again.

Delete the body of each frame and build the floor below. Edit these nodes in
place. Do not add a frame. Do not edit `web/` or `server/`.

- `UCTe9`, `Games · desktop`
- `p6mx6u`, `Games · desktop · dark`

Open `design/gameon.pen` through the Pencil tools. Pen is
`C:\Program Files\Pencil\Pen.exe`. Do not write the file by hand. Save from
Pen with the `gameon.pen` window focused. The file on disk must change.

## Forbidden

The body must not contain a child named `Page header`, `Saved game`, `Room`,
`Doors`, `Columns`, `Jump back`, `Your seat`, `Start`, `Open tables`, or
`Coming soon`. No row of three equal white cards. No text-left, fan-right
panel. No six coming-soon tiles. If the result can be described as the old
sections in a new order, it is wrong. Start the body over.

## The floor

Nav stays. Footer stays. Everything between them is one felt surface, edge to
edge, no white page and no 48px white margin. Light frame: the felt token
already used on the landing doors. Dark frame: the dark felt already in that
frame. No new hex. Nunito. Radius 16. Green buttons. Gold only for the rating.

1. `Floor`. One frame filling the body. The filters All, Cards, Board, Dice
   sit in the top right corner of the felt, small. There is no "Games" title
   and no subtitle on this floor.

2. `Table`, the left two thirds of the floor, inset 32px from the felt. It is
   a darker felt oval or a wide rounded panel, like a table, not a card. In
   the middle: "Skull King" as the only large type, then "solo against 3 bots",
   then "Round 4 of 10 · saved on this device", then one green button
   "Continue". Four small seat marks around the edge, empty circles, except
   the bottom one is filled and labelled "You". A few Skull King cards lie on
   the table, scattered, not a marketing fan in a corner.

3. `Tables`, the right third. Six mini tables in a 2 by 3 grid. Each is a
   small felt rounded square, not a text row. On it: the round line that
   already exists, and the seats as a short line ("0 of 4", "1 of 4",
   "2 of 3"). The six lines, in the order they already have:
   - 10 rounds · 1 to 10 cards
   - 5 rounds · 6 to 10 cards
   - 5 rounds · 5 cards each
   - 10 rounds · 2, 4, 6, 8, 10 twice
   - 10 rounds · 9, 7, 5, 3, 1 twice
   - 5 rounds · 5 cards each, and this one is 2 of 3
   Under the grid, two text buttons: "All public tables" and "Join with a code".

4. `Rail`, a dark bar along the bottom of the felt, full width, about 88px.
   Left: "Anne", "Captain", "34" with the word "rating" under it. Right: two
   green buttons, "Play Skull King" and "Play Ocho". No paragraphs. No card
   around them.

5. Under the felt, on the page colour, one line and nothing else: "Coming
   soon · Hearts, Chess, Ludo, Four in a Row, Five Dice" and a text link
   "Suggest a game". Not tiles.

Do both frames. The dark frame uses the dark theme of the same floor.

## Done when

A read of the file on disk shows the body of `UCTe9` and of `p6mx6u` with
children named `Floor` and `Coming line` only. `Floor` contains `Table`,
`Tables`, and `Rail`. The words "Three ways" and "Your seat" do not appear
in either frame. Do not commit.

## Report back

The CLI result is the report. No return handover. Quote the body child names
and the file size after the save.
