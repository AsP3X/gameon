# 160 · Grok → Claude · Ocho on the Games shelf

You are Claude, the callee, working on Skull King Tavern
(`/Users/niklas/Documents/development/gameon`). Do this work yourself. Do not run `claude` or
`grok`. Do not ask the owner a question. Do not write any page code.

Read `web/src/gameon/Games.tsx`, `web/src/gameon/Landing.tsx`, `web/src/gameon/catalog.ts`,
and `docs/drafts/ocho/rules.md` first. Then this file. Draw in `design/gameon.pen` through the
Pencil tools. Open the file that is already there. Do not replace it. Do not edit
`design/ocho.pen`, `design/web.pen`, or `design/skt.pen`.

## What this is

Ocho is not playable. The Games page still has one live game, Skull King. This drawing shows
how Ocho joins that page, in two steps. Do not change the existing Games or Landing frames.
Add new frames beside them.

Use the type, colours, pills, and tiles already in `design/gameon.pen` and
`web/src/styles/tokens.css`. The Ocho mark is a small fan of the card layouts from
`design/ocho.pen`: the back and a number card. No new illustration, no Skull King cards on
the Ocho tile.

## Step 1, announced

Ocho is the first Coming soon tile. Kind is Cards. The Soon count is 6.

Copy, exactly:

- Name: Ocho
- Line: Match a colour or a number, then be the first to play your last card.
- Players: 2–8 players
- Pill: Soon

It shows under All and under Cards. It does not show under Board or Dice. Hearts, Chess,
Ludo, Four in a Row, and Five Dice stay, after Ocho. The subtitle stays "One game is live.
More are on the way." Skull King stays the only Live card.

Frames, each in light and dark:

- `Games · Ocho soon · desktop` at 1440. The Games page as it is, with that tile.
- `Games · Ocho soon · phone` at 390.
- `Games · Ocho soon · Cards` at 1440. The Cards shelf: Skull King, then Ocho and Hearts.
- `Landing · Ocho soon · desktop` at 1440. The collection section only, Ocho first in the
  soon list.
- `Landing · Ocho soon · phone` at 390. The same list as lines.

## Step 2, playable

A second live card, under Skull King's, same structure as that card. The subtitle becomes
"Two games are live."

Copy, exactly:

- Name: Ocho
- Facts: 2–8 players · Cards
- Line: Match a colour or a number, then be the first to play your last card.
- Pill: Live
- Ways, and only these two: "A table" (2 to 8 players, friends or a public table) and
  "Teams" (2v2, partners sit opposite and see each other's cards).
- Actions: Play, and How to play.

No bots, no ranked ladder, and no pass-and-play row. The rules do not have them.

Frames, each in light and dark:

- `Games · Ocho live · desktop` at 1440.
- `Games · Ocho live · phone` at 390.

## Done when

Those frames are in Pen. No React, no catalog change, no server change. Say that
`design/gameon.pen` is not on disk until the owner presses ⌘S.

## Git

Commit the return handover only. Do not commit `design/gameon.pen` unless the owner has
already saved it and the diff is only this work. Do not push. Do not create a branch.
Prefix `DOCS:`. No AI attribution. Author Niklas Vorberg
<services@vorberg-webmail.de> if git would invent a hostname email.

## Report back

Write `docs/handover/161-claude-to-grok-ocho-on-the-shelf.md` and print the same text in one
fenced code block. List the frame names. No implementation task.
