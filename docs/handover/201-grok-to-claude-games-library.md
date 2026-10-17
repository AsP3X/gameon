# 201 · Grok → Claude · Build the Games library into the app

You are Claude, the callee, working on Skull King Tavern
(`C:\Users\asp3x\Documents\development\gameon`), branch `dev`. Do this work yourself.
Do not run `claude` or `grok`.

Read `docs/handover/200-grok-to-claude-games-from-scratch.md`,
`docs/agent-rules/web-quality.md`, `web/src/gameon/Games.tsx`,
`web/src/styles/gameon.css`, and the Games tests in
`web/src/gameon/GameOn.test.tsx`. The drawing is the library in that
handover. Build it. Do not edit `server/`. Do not edit `design/*.pen`
by hand. Do not commit a `.pen` file.

## What the page is now

`Games` is a felt floor: a table in the middle, shelf chips and open
tables beside it on a wide window, and a bar. On a phone the bar is
Tables, You, and Play, and those open sheets. The heading "Games" is
only for the screen reader.

Replace that floor with the library. The two live games are the page.
Skull King, then Ocho. Each has its own Play. Open tables, the seat,
and what is coming stay, in the places below. A felt table, seat marks,
and a Play button in the bar are gone.

## Wide window, from 1000px

The nav stays the `Nav` already on the page. "Games" is the current
link: colour it `$green` on this page only, with the existing token.
Do not change the landing nav.

Under the nav, in `main`:

1. A row. Left, the visible heading "Games". Right, the shelf chips
   All, Cards, Board, Dice. All starts selected. The chips still filter
   which live games and which coming-soon names show.

2. When there is a game to go back to, a band above the rows. The words
   stay the ones `resumeOf` already builds: the mode, the line, and
   "Continue" to that game. The heading is still Skull King, and the
   screen-reader text is still "Jump back in: ". No felt, no seat marks,
   no cards on a cloth.

3. Two rows, Skull King then Ocho, for the games the shelf shows. Art,
   the name, the line ("The pirate trick-taking game", "Match the colour
   or the number"), "How to play", and "Play Skull King" or "Play Ocho".
   The links are the ones the doors already use, including How to play.
   When the shelf shows neither, the sentence stays: "No live game on
   this shelf yet. These are on the way."

4. Two columns. Left, "Open tables · Skull King" and the list the page
   already loads. Each row is the format, the table's own name, the
   rounds, the seats, and Join. The same states stay: not connected,
   loading, "The tables could not be loaded." with "Try again", no open
   tables with "No open tables right now. Open one and others can sit
   down." and "Create a table", and the list. "All public tables" and
   "Join with a code" stay under the list. The rows are a list, not
   little felt tables. Right, "Your seat": the guest, the account with
   the rating the server sent (Rating, Tier, Games), or "No rating yet.
   Five placement games set your tier." The buttons stay "Create an
   account" and "Find a ranked game".

5. "Coming soon" and the names the shelf includes, then "Suggest a game".

6. The footer stays on a wide window.

## Phone, under 1000px

One screen. The bar is fixed to the bottom of the viewport. The games
scroll above it if they must. The bar has two buttons, "Tables" and
"You". There is no Play button in the bar, and no Play sheet. Play is
the button on each game.

The heading "Games" is visible. The same four shelf chips sit under it
and wrap. Then the two games, each a card with its art, name, line, and
a full-width Play. Then coming soon. No footer.

"Tables" still opens the open-tables sheet. Escape, the close button,
and the scrim still close it, and focus returns to Tables. "You" still
opens the seat, or "Sign in" when nobody is signed in, and the footer
links that sheet already carries. A wide window still has no dialog.

The disconnected line stays: "Not connected. Trying again…"

## What you must not drop

A guest is still created for a browser nobody knew. Joining a table
still goes through `onJoin`. A table that filled up still says why.
The public list is still one of each length of game, then the rest, six
at most. A saved game and a seat the server keeps still offer Continue,
and the server's seat wins over the device. The shelf still filters.
Light and dark both use the tokens. Nothing overflows at 360px. Targets
stay at least 44px. Player names stay React text.

Use the tokens in `web/src/styles/tokens.css` only. No new hex. No new
dependency. Radius 16 on a card and a button, 12 on an art well, a 4px
hard lip. No glass, no gradient.

## Tests

Update `web/src/gameon/GameOn.test.tsx` so it describes this page. Do
not delete a behaviour to make a test pass. A test that looked for the
felt table, the seat marks, or Play in the bar should look for the row,
the band, or the card instead. The phone test that opened Play from the
bar should start the game from the card.

## Done when

From `web/`: `vp check`, `vp test`, and `vp build` pass.

If Pen has `design/gameon.pen` open and those four frames are the
library from handover 200, save that window with File, Save. If the
focused window is not that document, do not save. Do not commit the
pen file either way.

## Git

Branch `dev`. Commit only your `web/` paths. Do not push. Do not create
a branch or a worktree. No AI attribution. The message starts with
`TASK:`.

## Report back

The CLI result is the report. No return handover. Quote the commit, and
what `vp check`, `vp test`, and `vp build` printed. Say whether the pen
file was saved.
