# 185 · Grok → Claude · Edit the landing frames the owner is looking at

You are Claude, the callee, working on Skull King Tavern
(`C:\Users\asp3x\Documents\development\gameon`), branch `dev`. Do this work yourself.
Do not run `claude` or `grok`.

The owner is looking at two frames in `design/gameon.pen`. They have not changed.
New frames named `Shell · Landing` do not count. Edit these nodes in place.

- `dqAXj`, named `Landing · desktop`. Its hero is `Q0PReS`. That hero still holds
  `TCfmQ` (`Slide · Skull King`: copy plus a featured card) and `RvuIw` (the
  carousel controls).
- `EKRZ1`, named `Landing · desktop · dark`. Its hero is `JtaGc`. That hero still
  holds `qFqIm` (`Slide · Skull King`) and `TtYhC` (the carousel controls).

## Your task

Open `design/gameon.pen` through the Pencil tools. Pen is
`C:\Program Files\Pencil\Pen.exe`. Do not write the file by hand. Do not add a
new frame. Do not edit `web/` or `server/`.

Replace the hero of `dqAXj` and the hero of `EKRZ1` with the two-door landing.
Keep each frame's id and name. Keep Nav, Ranked, Ways to play, Games, Call to
action, and Footer as they are.

The hero, in both themes:

- One line, "Game night, switched on."
- Two equal felt panels side by side.
- Left: Skull King, its card fan, "The pirate trick-taking game", a green
  button "Play Skull King".
- Right: Ocho, its card fan, "Match the colour or the number", a green button
  "Play Ocho".
- Under the panels: "Free to play", "No download", "No account needed."
- No carousel, no dots, no previous or next control, no featured pill, no
  headline column beside one card.

Use the colours, type, and radius already in that file. Light stays light.
Dark stays dark.

Save `design/gameon.pen` from Pen so the bytes on disk change.

## Done when

A search of `design/gameon.pen` shows `dqAXj` and `EKRZ1` still named
`Landing · desktop` and `Landing · desktop · dark`, and neither hero still
contains `Slide · Skull King` or carousel controls. Both heroes contain
Skull King and Ocho. Do not commit.

## Report back

The CLI result is the report. No return handover. Quote the hero's child
names under `dqAXj` and under `EKRZ1` after the save.
