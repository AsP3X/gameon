# 192 · Grok → Claude · Build the reworked landing and Games into the app

You are Claude, the callee, working on Skull King Tavern
(`C:\Users\asp3x\Documents\development\gameon`), branch `dev`. Do this work yourself.
Do not run `claude` or `grok`.

Read `web/src/gameon/Landing.tsx`, `web/src/gameon/Games.tsx`, the Games and
landing rules in `web/src/styles/gameon.css`, and `web/src/gameon/GameOn.test.tsx`.
The drawings are already in `design/gameon.pen`. Build them. Do not edit the
pen file. Do not edit `server/`.

The names in the drawings (Anne, Round 4 of 10, six sample tables) are
fixtures. The app shows the real seat, the real saved game, and the real open
tables. Keep every state the page has now: disconnected, no season, guest,
account with and without a rating, jump back for a running game, a waiting
seat, and a game saved on this device, tables loading, failed, empty, and
listed. Same links. Same words, except where a drawing removed a kicker.

## Landing, from 1000px

The hero stays the two doors. Under it, match `dqAXj` and `EKRZ1`:

1. "Three ways to sit down" first. No "Alone or together" kicker.
2. Then "The ranked season is on", when the server has a season. No "Ranked"
   kicker and no "Seven tiers" kicker. The sentence and the account line on
   the left. The podium and the seven tier names on the right.
3. Then "Coming soon". No "The collection" kicker, no "Pick a game", no Skull
   King feature, no shelf filters. The announced games and Suggest a game, one
   row from 1600px and wrapping in threes below that, as they do now.
4. Then "Pull up a chair." One band. The sentence on the left, the button on
   the right.

Below 1000px, leave the landing as it is.

## Games, from 1000px

Match `UCTe9` and `p6mx6u`. This is not the column page.

Nav stays. Footer stays. Between them the page is one felt floor, edge to
edge, in both themes. No "Games" title. The filters All, Cards, Board, Dice
sit in the top right of the felt and still filter the live games and the
announced games.

The left two thirds is one table. When there is a game to resume, the table
shows that game's name, the line Jump back already builds, and one green
Continue that does what Jump back's button does now. A few of that game's
cards lie on the table. Four seat marks. The bottom one says "You" when the
visitor has an account. When there is nothing to resume, the same table shows
"Skull King" and "Ocho" as the two ways to start, with Play, instead of a
fake saved game.

The right third is the open tables, as up to six small felt tiles, not a text
list. Each tile shows the round line and how many seats are taken. Loading,
failure, and the empty line stay, inside that area. "All public tables" and
"Join with a code" stay under the tiles and do what they do now.

A dark bar along the bottom of the felt holds the account when there is one
(name, tier, rating) and two green buttons, "Play Skull King" and "Play
Ocho". A guest gets "Sign in" in that spot instead of a fake name. The two
Play buttons go where those buttons go now.

Under the felt, on the page colour, one line: "Coming soon" and the names of
the announced games that the shelf still shows, plus "Suggest a game". Not a
grid of tiles.

## Games, under 1000px

Match `I69lR` and `vk1Nh`. One screen, `100dvh`, no document scroll. Nav is
one short row. The felt fills the rest. The table fills the felt, with the
same resume-or-start content as the desktop table. A bar pinned to the bottom
has three buttons: Tables, You, and Play.

Each opens a dialog. Use a native `dialog`, closed with Escape, the close
control, and a click on the scrim. Focus moves into the dialog and back to
the button that opened it. The page behind does not scroll.

- Tables: "Open tables", the shelf filters, the real tables (loading, failed,
  empty, or the list), "All public tables", "Join with a code". The list
  scrolls inside the sheet.
- You: the real seat, or the guest's create-account block that Your seat
  shows now. Then one line of the announced games and "Suggest a game". Then
  the footer links that the Games footer has now. There is no footer on this
  screen.
- Play: "Play Skull King" and "Play Ocho", each with its one line, and only
  the games the shelf still shows.

From 1000px the footer returns and the dialogs are not used.

## Tests and the gate

Update `GameOn.test.tsx` where the structure changed. Do not drop a test that
covers a real state. Add a test that the phone bar opens the tables dialog
and Escape closes it.

From `web/`: `vp check`, `vp test`, `vp build`. If `vp check` fails only on
CRLF in files you did not touch, say so and show `vp check --no-fmt` plus a
format check of the files you changed. Open the app and click the landing and
both Games layouts, at a wide window and at 390px, in light and dark. A
dialog must open, close, and leave the table on screen.

Commit on `dev`. The message starts with `TASK:`. No `Co-Authored-By`. Do not
push. Do not create a branch. Stage only the files this task changed.

## Report back

The CLI result is the report. No return handover. Name the commit, what the
gate printed, and what you clicked in the browser.
