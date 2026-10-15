# 161 · Claude → Grok · Ocho on the Games shelf

You are Grok, the callee, working on Skull King Tavern
(`/Users/niklas/Documents/development/gameon`). Do this work yourself. Do not run `claude` or
`grok`. This is a report. There is no implementation task in it.

Read `docs/handover/160-grok-to-claude-ocho-on-the-shelf.md` first, then this file.

## State

Branch `dev`. Claude drew handover 160 in `design/gameon.pen` through the Pencil tools. No
React, catalog, server, or protocol change. `design/ocho.pen`, `design/web.pen`, and
`design/skt.pen` are untouched. The existing Games and Landing frames are unchanged.

`design/gameon.pen` is **not on disk** until the owner presses ⌘S in Pen. This commit holds
this handover only.

## What was drawn

New components, in the Components frame under a new "OCHO" label:

- `Ocho / back` and `Ocho / number` (60 × 86), the layouts from `design/ocho.pen` (back: dark
  card, gold 8 and OCHO; number: red 7), on the gameon tokens (`$c-black`, `$gold`, `$red`,
  `$white`, `$f-ui`).
- `Ocho / key 38`, `Ocho / key 48`, `Ocho / key 56`, `Ocho / key 64`: the Ocho mark. A gold key
  (`$gold`, same radius and bottom edge as the other keys) holding a small fan of the back and a
  red 7. No Skull King art.

Step 1, announced (each frame in light and dark; the dark one ends in `· dark`):

- `Games · Ocho soon · desktop` (1440): Ocho is the first Coming soon tile, then Hearts, Chess,
  Ludo, Four in a Row, Five Dice, Suggest a game. Count pill 6. Subtitle unchanged. Skull King
  is the only Live card.
- `Games · Ocho soon · phone` (390): the same list, two per row.
- `Games · Ocho soon · Cards` (1440): Cards filter active, count 2, row: Ocho, Hearts, Suggest
  a game.
- `Landing · Ocho soon · desktop` (1440): the collection section only, Ocho first, with the line
  "Match a colour or a number, then be the first to play your last card." and
  "2–8 PLAYERS · CARDS".
- `Landing · Ocho soon · phone` (390): the same list as lines, Ocho first.

Step 2, playable (light and dark):

- `Games · Ocho live · desktop` (1440): a second live card under Skull King's, same structure.
  Fan of an Ocho back and four number cards. Name Ocho, "2–8 PLAYERS · CARDS", Live pill, the
  line above, two ways ("A table": "2 to 8 players. Friends, or a public table." and "Teams":
  "2v2. Partners sit opposite and see each other’s cards."), Play and How to play. Subtitle
  "Two games are live." Coming soon goes back to the five other games, count 5.
- `Games · Ocho live · phone` (390): the same card under Skull King's, Play full width, "How to
  play" as a text link, as Skull King's phone card.

No bots, no ranked, no pass-and-play anywhere on the Ocho card.

## Notes for whoever builds it later

- The two Ocho ways carry a chevron-right, not Skull King's chevron-down: each goes straight to
  its place, there is nothing to open in place.
- "Teams" uses the lucide `users` icon on a blue key. `web/src/gameon/icons.ts` has no such icon
  yet. "A table" uses `globe` on green.
- Desktop soon grid with seven tiles leaves two empty cells after Suggest a game; that is the
  CSS grid's own behaviour.

## Done when

Nothing to run. The frames are in Pen; the owner saves `design/gameon.pen` with ⌘S.

## Report back

No return handover is needed unless you want the drawing changed. If you do, write
`docs/handover/162-grok-to-claude-<slug>.md` as a paste-ready prompt for Claude, print it in one
fenced code block, and name the frames by the names above.
