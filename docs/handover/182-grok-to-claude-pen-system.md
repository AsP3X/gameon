# 182 · Grok → Claude · One GameOn system, drawn in Pen

You are Claude, the callee, working on Skull King Tavern
(`C:\Users\asp3x\Documents\development\gameon`), branch `dev`. Do this work yourself.
Do not run `claude` or `grok`.

Read `PRODUCT.md`, `web/src/styles/tokens.css`, and
`docs/agent-rules/design-sync.md`. This pass is drawings only.

## The world, already chosen

Do not invent a new brand. The committed world is the one in `tokens.css`:

- Nunito for the interface. Pirata One only for the Skull King wordmark.
- Radius 16px. The pressed control is a 4px hard offset in the line colour. This
  world chose that shadow. Keep it. Do not switch it for a soft blur.
- Green is the primary action. Gold marks a turn, a win, and a featured fact.
  Felt is the table and the featured card. Red is a destructive or failing fact.
  Blue is a secondary fact, such as a team.
- Light is a white page. Dark is `#131f24`. Both already exist. Draw both.
- No new hex value. No second typeface. No glass, no gradient text, no kicker
  above a heading, no emoji standing in for an icon.

The words already on the screens stay. Do not rewrite a heading, a button, or a
rule to make a frame look better.

## Your task

Draw, through the Pencil tools only. Pen on this machine is
`C:\Program Files\Pencil\Pen.exe`. Do not write a `.pen` file by hand. Do not
edit `web/`, `server/`, or `PRODUCT.md`.

1. In `design/gameon.pen`, one system board named "System". It shows, in light
   and in dark: the wordmark, the nav, a primary button, a ghost button, a gold
   pill, a green pill, a game card, a felt panel, a text field, and the type
   steps used on the landing (the hero, a section heading, body, a muted line).
   Real copy, taken from the landing and from Games. A short note on the board,
   in the file, names the three motions and nothing else: a played card flies
   for 420ms and the discard stays hidden until it lands; a deal is one flight
   per card; your turn is a single breath on the avatar. A visitor who asked
   for less motion gets the settled frame and no flight.

2. Bring these screens onto that system. Update the frames that already exist.
   Do not add a second copy of a screen that is already there. Each is drawn at
   390px wide and at 1440px wide, light and dark.
   - The landing, in `design/gameon.pen`. At 1440 the page uses the window, with
     a 48px inset. The hero is one row: the words in a block, the featured card
     filling the rest. At 390 it is one column.
   - Games, in `design/gameon.pen`. At 1440, Skull King and Ocho sit side by side
     with the seat and the open tables in a rail, and Coming soon is one row.
     At 390 it is one column.
   - The Ocho table in the middle of a hand, in `design/ocho.pen`. Your hand,
     the discard, the pile, the other seats. At 1440 the table fills the window.
     At 390 the hand is the bottom of the screen.
   - The Skull King table in the middle of a trick, in `design/skt.pen`. The
     same chrome as Ocho: the same nav height, the same radius, the same pressed
     control, the same pill. The cards and the felt stay Skull King's.

3. Leave sign-up, the profile, the ladder, the rules, and the between-hands
   score as they are, unless a control on the system board makes one of them
   obviously wrong (a different radius, a different button). Do not redraw them
   in this pass.

4. A 390px frame does not scroll sideways. A 1440px frame does not sit in a
   1184px column with empty bands. Targets drawn as buttons are at least 44px.

## Done when

The system board and the four screens exist in the open Pen files, at both
widths, in both themes. You have not edited application code. You have not
committed. Tell the owner to press Ctrl+S in each Pen file you changed. The
drawing is not on disk until they do.

## Report back

The CLI result is the report. No return handover. Name each frame you added or
updated, and which files the owner must save.
