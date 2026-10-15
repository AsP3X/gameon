# 157 · Claude → Grok · the Ocho table is drawn (return)

You are Grok, working on Skull King Tavern (`/Users/niklas/Documents/development/gameon`). This is
the return handover for `docs/handover/156-grok-to-claude-ocho-table.md`. There is no server work
and no implementation task in it. Read it and tell the owner the drawing is ready for review in
Pen, and that it reaches disk only when they save it.

## State

- Branch `dev`, not pushed, started from `deaa191` (`git fetch origin` + `git merge --ff-only
  origin/dev`: already up to date). This file is committed alone, prefix `DOCS:`.
- `design/ocho.pen` is **not on disk yet**. The drawing exists only in the running Pen app, and it
  is written when the owner presses ⌘S in Pen with `design/ocho.pen` open. Until then the file on
  disk is a 259-byte blank document: Pen's own empty `untitled.pen`, copied into place so Pen
  could open the new path, because Pen cannot create a missing file from the MCP tools. It is
  untracked and not committed. Once saved, commit only `design/ocho.pen`, prefix `DOCS:`, after
  `git diff --stat` shows that no other file changed.
- No code was written. `design/web.pen`, `design/skt.pen`, `design/gameon.pen`, `web/` and `server/`
  are untouched. No images were generated, no ElevenLabs, nothing under `design/card-art/tools/`.
- Source: `docs/drafts/ocho/rules.md` only. Colours, type (Nunito), radius 16 and the button
  styles come from `web/src/styles/tokens.css` and `.btn` in `web/src/styles/tavern.css`. The
  file's variables carry those values, themed `mode: light | dark`.

## What is in `design/ocho.pen`

### Components · Cards (board top left)

Card layouts, 60 × 86, with no pictures. Each card shows a corner name and a large rank or
symbol (a lucide icon or text). The faces themselves are not illustrated.

- `Card · Number`, `Card · Skip`, `Card · Reverse`, `Card · Draw 2`. Each is shown in red, blue,
  green and yellow in the "Colour variants" grid. Red is `--red`, blue `--blue`, green `--c-green`,
  yellow `--c-yellow`, and yellow cards use `--gold-ink` text.
- `Card · Ocho Wild`, `Card · Wild Draw 4`, `Card · Shield`, `Card · X-Ray`: `--c-black` with a
  four-colour ring.
- `Card · Dead Red` (red), `Card · Boo Blue` (blue), `Card · Back` (`--c-black`, gold "8 OCHO").
- A line with the points: number = face value, Skip/Reverse/Draw 2 = 20, wilds and specials = 50.

### Components · Table (board to the right)

`Mini Card`, `Mini Back`, `Opponent Hand` (backs + count), `Seat` (avatar, name, card count, a
turn ring and an optional tag, compact enough for 8), `Piles` (draw pile with count + discard),
`Match` (colour dot + "Colour · number or symbol"), `Direction` (clockwise / counter-clockwise),
`Draw total` (open stack), `Button` (green, blue, gold, ghost, disabled), `Action Bar`,
`Color Choice` (red, blue, green, yellow), `Sheet`, `Top Bar`, `Your Hand` (fanned, up to 9
cards), and `Event Banner`.

### Frames

Every frame is drawn four times: `· Phone · Light` (390 × 844), `· Phone · Dark`,
`· Desk · Light` (1440 × 900), `· Desk · Dark`. That makes 60 frames, one row per state, below the
component boards. Eight seats unless noted.

1. `01 Opening`: the opening card is a blue Draw 2, with the banner "its effect does not fire".
   Clockwise, everyone holds 8, Ana (left of you, the dealer) starts.
2. `02 Your turn · a match`: discard yellow 4. Your yellow 7 is lifted and gold-outlined; the
   rest are dimmed. Play / Draw.
3. `03 Your turn · nothing plays`: everything dimmed; one action, "Draw one".
4. `04 Just drew`: the drawn yellow 2 is the ninth card, legal; Play it / End turn.
5. `05 Name a color`: Ocho Wild on the discard; the colour choice over a scrim.
6. `06 Stack of 6`: Fay played Draw 2 and Gus added Wild Draw 4, so the open total is +6. Your
   Draw 2, Wild Draw 4 and Shield are lifted; the action is "Take 6".
7. `07 Shield`: Shield on the discard. The +6 goes back to Gus, the last player who played a draw
   card. Gus has the ring and a "+6" tag.
8. `08 X-Ray`: a sheet, "Only you see these", with one card from each of the seven other hands.
9. `09 Dead Red`: you and Cleo have no red, and each gets "+2". Your Dead Red was your last red.
10. `10 Boo Blue`: Eli and Fay tied for fewest cards, and both get "+2".
11. `11 Reverse`: the direction chip reads counter-clockwise, and Ana is next.
12. `12 Two players`: two seats (you and Max). The Reverse cards in your hand and on the discard
    are labelled "SKIP"; the banner reads "Reverse is a Skip · Max loses the turn".
13. `13 Teams`: four seats, with Lu (partner) opposite and Kai and Max at the sides. Lu's five
    cards are face up for you, captioned "Only you see Lu's cards"; Kai and Max show backs. The
    banner says your opponents cannot see your cards.
14. `14 Hand over`: you are out. A sheet lists each other hand face up with its points: Ana 77,
    Ben 11, Cleo 70, Dev 4, Eli 78, Fay 51, Gus 79, sum 370. It has the points key and "Next
    hand".
15. `15 Reshuffle`: Fay, who was drawing, shuffled the discard into a new draw pile (Draw · 51).
    The top red 5 stays face up.

Every frame was drawn as specified. None was left out.

## Choices the owner may want to review

- The rules do not say whether a Draw 2 must match colour when it is stacked. In frame 6 the only
  Draw 2 in your hand is green (the named colour), so the frame takes neither reading.
- Frame 7 shows the +6 aimed at Gus. It does not say what Gus may answer, because the rules only
  say a Shield can be sent back at another Shield.
- Frame 14 shows the point sum and does not say who receives it, because the rules do not say.
- On desk, the cards are the same size as on phone (60 × 86).

## Contracts

Nothing frozen changed. There is no protocol, engine, fixture or server change.

## Done when

- The owner has pressed ⌘S in Pen with `design/ocho.pen` open, `ls -la design/ocho.pen` shows
  far more than 259 bytes, and that file is committed alone on `dev`.

## Report back

No return task. If the owner asks for changes to the drawing, write them as a new
`docs/handover/NNN-grok-to-claude-<slug>.md` prompt for Claude and print it in one fenced code
block.
