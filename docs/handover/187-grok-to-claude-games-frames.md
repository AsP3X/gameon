# 187 · Grok → Claude · The Games frames, same problem as the landing

You are Claude, the callee, working on Skull King Tavern
(`C:\Users\asp3x\Documents\development\gameon`), branch `dev`. Do this work yourself.
Do not run `claude` or `grok`.

The owner is looking at two frames in `design/gameon.pen`. They have the same
problem the landing had: a column of blocks and a rail, dropped beside each
other. Edit these nodes in place. Do not add a frame. Do not edit `web/` or
`server/`.

- `UCTe9`, `Games · desktop`. The body is `R6x1x`.
- `p6mx6u`, `Games · desktop · dark`. The body is `DQviX`.

Open the file through the Pencil tools. Pen is
`C:\Program Files\Pencil\Pen.exe`. Do not write the file by hand.

## What is wrong

Each body is a header, then two columns. The left column is a jump-back card,
one Skull King card, and Coming soon broken into two rows. The right column is
Your seat and Open tables, a rail that does not share the page. The line still
says "One game is live." Ocho is not on the page. The landing the owner just
accepted already shows both games as two doors.

## The page

Nav stays. Footer stays. Same inset as the landing doors, 48px. One heading
size. No small-caps kicker.

1. The header row stays one row. "Games" on the left. The line under it
   becomes "Two games are live. More are on the way." The filters All, Cards,
   Board, and Dice stay on the right. They belong on this page.

2. Jump back is one bar the width of the inset, under the header. The words
   stay: "Skull King · solo against 3 bots" and "Round 4 of 10 · saved on this
   device." No "JUMP BACK IN" kicker. The bar is the heading.

3. Two equal felt doors, the same doors as the landing hero, side by side,
   the full width of the inset. Left: Skull King, its card fan, "The pirate
   trick-taking game", "Play Skull King". Right: Ocho, its card fan, "Match
   the colour or the number", "Play Ocho". Copy the door components from the
   landing hero (`Q0PReS` in `dqAXj`, `JtaGc` in `EKRZ1`) so the two pages
   match. Do not draw a second, different Skull King feature.

4. One row under the doors. Your seat is a card about 400px: Anne, the rating
   34, the tier Captain, 23 games. The words already there stay. Open tables
   fills the rest of the row: the six tables already listed, "All public
   tables", and "Join with a code". Heading "Open tables". No "OPEN TABLES ·
   SKULL KING" kicker.

5. "Coming soon" is one row of six tiles of one height: Hearts, Chess, Ludo,
   Four in a Row, Five Dice, and Suggest a game. Keep their lines. Same row
   as the landing's Coming soon band.

Do this in both frames. Light stays light. Dark stays dark. Use only colours,
type, and radius already in the file. Buttons stay at least 44px tall.

Save `design/gameon.pen` from Pen so the bytes on disk change.

## Done when

A read of `UCTe9` and of `p6mx6u` shows, under the nav: the header, the jump-back
bar, two doors (Skull King and Ocho), one row of Your seat and Open tables,
Coming soon as one row, then the footer. Neither frame still says "One game
is live" or still has a two-column body. Do not commit.

## Report back

The CLI result is the report. No return handover. Quote the child names of
the body of `UCTe9` and of `p6mx6u` after the save, in order.
