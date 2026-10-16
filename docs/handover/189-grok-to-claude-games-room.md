# 189 · Grok → Claude · Games is a room, not a second landing

You are Claude, the callee, working on Skull King Tavern
(`C:\Users\asp3x\Documents\development\gameon`), branch `dev`. Do this work yourself.
Do not run `claude` or `grok`.

The owner rejected the last redesign of these two frames. Do not repeat it.
Do not put the landing's two big felt doors on this page. Edit these nodes in
place. Do not add a frame. Do not edit `web/` or `server/`.

- `UCTe9`, `Games · desktop`, body `R6x1x`
- `p6mx6u`, `Games · desktop · dark`, body `DQviX`

Open `design/gameon.pen` through the Pencil tools. Pen is
`C:\Program Files\Pencil\Pen.exe`. Do not write the file by hand. When the
edit is done, save from Pen with the `gameon.pen` window focused. The file on
disk must change. Last time a save was missed. After you save, the bytes must
contain the words "Round 4 of 10" inside a node named `Saved game`, and must
not contain a body child named `Doors`.

## The page

Nav stays. Footer stays. Inset 48px. One heading size. No small-caps kicker.
Light stays light. Dark stays dark. Colours, Nunito, radius 16, and the 4px
press already in the file. Buttons at least 44px.

The landing is where you meet the two games. This page is the room you enter
after that. Its subject is the game you already have, and the table you can
join.

1. Header row. "Games". Under it, "Two games are live. More are on the way."
   Filters All, Cards, Board, Dice on the right.

2. One felt panel, the full width of the inset, the tallest thing on the page.
   Name it `Saved game`. Left side: "Skull King · solo against 3 bots" as the
   heading, "Round 4 of 10 · saved on this device" under it, and a green
   Continue. Right side: a small Skull King fan, about a third of the panel,
   not a second poster. No "JUMP BACK IN".

3. Three equal cards in one row, the same height, under that panel. Name the
   row `Room`.
   - `Your seat`. Anne, rating 34, tier Captain, 23 games. The words already
     on the seat stay. This card is not 400px beside a tall list.
   - `Start`. Two compact rows, not doors and not fans. Skull King, the line
     "The pirate trick-taking game", a green "Play". Ocho, the line "Match
     the colour or the number", a green "Play".
   - `Open tables`. Heading "Open tables". The six tables already listed,
     "All public tables", and "Join with a code". If the six rows are taller
     than the card, the list sits inside the card and does not stretch the
     row. No "OPEN TABLES · SKULL KING".

4. `Coming soon`. One quiet row of six short tiles: Hearts, Chess, Ludo,
   Four in a Row, Five Dice, Suggest a game. Keep their lines. This row is
   shorter than the saved-game panel. It is not a feature.

## Done when

A read of the file on disk shows both bodies, in order: Page header, Saved
game, Room, Coming soon. `Room` has three children: Your seat, Start, Open
tables. Neither body has a child named `Doors` or `Columns`. Do not commit.

## Report back

The CLI result is the report. No return handover. Quote those child names and
the file size after the save.
