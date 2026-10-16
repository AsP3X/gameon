# 183 · Grok → Claude · One shell for the landing, Ocho and Skull King

You are Claude, the callee, working on Skull King Tavern
(`C:\Users\asp3x\Documents\development\gameon`), branch `dev`. Do this work yourself.
Do not run `claude` or `grok`.

Read `PRODUCT.md` and `docs/agent-rules/design-sync.md`. Draw through the Pencil
tools only. Pen is `C:\Program Files\Pencil\Pen.exe`. Do not write a `.pen`
file by hand. Do not edit `web/` or `server/`. Do not commit.

## Why the last pass failed

`182` changed corner radii and turned icon buttons into ghost buttons. The
owner opened the pen files and saw no redesign. Landing, Ocho and Skull King
still look like three products. This pass replaces the frame they sit in. A
person opening the file must see that in the first frames, without comparing
pixels.

Keep the theme. Nunito. Pirata One only on the Skull King wordmark. Green
action, gold for a turn or a featured fact, felt for the play surface, radius
16, the 4px hard press, the colours in `web/src/styles/tokens.css`. No new hex.
No new face. The words already on the screens stay, including "Game night,
switched on."

## The shell

Draw it once, then use that same bar on every screen below. It is 72px tall.
Page colour, a 2px line under it.

- Left: the GameOn mark at 40px and the GameOn wordmark. Not "Ocho" in a
  tracked face. Not a close icon.
- Middle, only on a game: the game's name in Nunito 800, then the pills that
  screen already has. Ocho: "Hand 2" and a gold "Your turn". Skull King:
  "Round 1 of 5", "Trick 2 of 6", "Saved". Landing keeps its links: Games,
  Ways to play, Ladder.
- Right: one ghost button and one 44px icon button, the same pair on every
  screen. Landing: "Sign in" and "Play now". A game: "Games" and the menu.
  No blue square. No bare X.

Under the bar the page colour continues. The play surface is one felt panel,
radius 16, inset 24px from the window (16px at 390). It is the same panel the
landing uses for the featured game. A white card (2px line, radius 16, 4px
press) is the only other container: a scoreboard, a last trick, a way to play,
a seat.

## The twelve frames

Put them in a row at the top of the canvas, above everything that is already
there, starting at x = 0. Name them exactly. Do not hide the redesign inside an
old frame whose only change is a radius.

In `design/gameon.pen`:

- `Shell · Landing · 1440 · light` and `· dark`
- `Shell · Landing · 390 · light` and `· dark`

1440: the shell, then one row. The headline and the two buttons on the left. The
featured Skull King panel on the right, and that panel is the felt stage, the
same felt the tables use, with the fan of cards. 390: one column, shell, then
headline, then the felt stage.

In `design/ocho.pen`:

- `Shell · Ocho · 1440 · light` and `· dark`
- `Shell · Ocho · 390 · light` and `· dark`

1440: the shell with "Ocho", "Hand 2", gold "Your turn". One felt stage. The
discard and the pile in the middle. The other seats are white seat cards on
the felt. Your hand is a row along the bottom of the felt, the same tray Skull
King uses. 390: the felt fills the width inside 16px, the hand at the bottom
of the screen.

In `design/skt.pen`:

- `Shell · Skull King · 1440 · light` and `· dark`
- `Shell · Skull King · 390 · light` and `· dark`

1440: the same shell, with "Skull King" and the round pills. The felt stage on
the left holds the trick and the hand tray. On the right, two white cards:
Scoreboard, then Last trick. They are the same card as a landing panel. 390:
felt first, hand at the bottom, scoreboard under it.

A 390 frame does not scroll sideways. Buttons are at least 44px. Light and
dark both use the tokens. Leave every older frame where it is.

## Save

Save each of the three files from Pen so the bytes on disk change. The owner
is looking at the files, not at an unsaved editor buffer. If the Pencil tools
cannot save, say so, and name the menu action.

## Report back

The CLI result is the report. No return handover. Name the twelve frames and
confirm the three files were saved.
