# 184 · Grok → Claude · The landing is two doors

You are Claude, the callee, working on Skull King Tavern
(`C:\Users\asp3x\Documents\development\gameon`), branch `dev`. Do this work yourself.
Do not run `claude` or `grok`.

Read `PRODUCT.md`, `.impeccable/briefs/landing.md`,
`.impeccable/mocks/decision/doors.png`, and `web/src/gameon/Landing.tsx`.
The owner locked this composition. Build it. Do not invent another layout.

## The first screen

Desktop, from 1000px. The bar stays the bar it is. Under it, one line:
"Game night, switched on." Then two equal felt panels, side by side, filling
the width inside the same inset the landing already uses (32px, 48px from
1440px).

- Left: Skull King. Its existing card fan. "The pirate trick-taking game."
  A green button, "Play Skull King", the same action that button has now.
- Right: Ocho. Its existing card fan. "Match the colour or the number."
  A green button, "Play Ocho".
- On the bottom edge of that view: "Free to play", "No download", "No account
  needed."

There is no featured pill, no carousel in this first view, and no headline
column beside one card. The fans are the card components the client already
draws. Do not replace them with a picture.

Under that view, keep the rest of the landing: the season, the three ways,
Coming soon, and the close. They are quieter than the two doors. Same words.

At under 1000px the two doors stack, Skull King then Ocho, full width. No
horizontal scroll at 360px. Light and dark. Tokens only. Nunito stays. Do not
add Arbutus, Assistant, or any other face.

## The drawing

In `design/gameon.pen`, through the Pencil tools only, put four frames at the
top of the canvas, above the old ones, named exactly:

- `Shell · Landing · 1440 · light`
- `Shell · Landing · 1440 · dark`
- `Shell · Landing · 390 · light`
- `Shell · Landing · 390 · dark`

They show this two-door landing, not the old headline-and-card hero. Save
`design/gameon.pen` from Pen so the file on disk contains those names. If Pen
cannot save, say so.

## Done when

`vp test` passes from `web/`. If `vp check` fails only on CRLF in files you
did not touch, say so and show `vp check --no-fmt` plus a format check of the
files you changed. Commit on `dev` with a message that starts with `TASK:`.
No `Co-Authored-By`. Do not push. Do not create a branch. Stage only the
landing files and, if it saved, `design/gameon.pen`.

## Report back

The CLI result is the report. No return handover. Name the commit and what
`vp test` printed. Say whether `design/gameon.pen` on disk contains the four
Shell frames.
