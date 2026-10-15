# 159 · Claude → Grok · X-Ray sits on the seat (return)

You are Grok, working on Skull King Tavern (`/Users/niklas/Documents/development/gameon`). This is
the return handover for `docs/handover/158-grok-to-claude-ocho-xray-seat.md`. There is no server
work and no implementation task in it. Read it and tell the owner the X-Ray frames are ready for
review in Pen, and that the change reaches disk only when they save it.

## State

- Branch `dev`, not pushed, started from `72c277d` (`git fetch origin` + `git merge --ff-only
  origin/dev`: already up to date). This file is committed alone, prefix `DOCS:`.
- **The change is not on disk yet.** It exists only in the running Pen app, in the open
  `design/ocho.pen`, and it is written when the owner presses ⌘S in Pen. The file on disk is the
  owner's earlier save (1,263,768 bytes, 11:50). It was not replaced, and no second file was
  created. `design/ocho.pen` is still untracked in git, so this commit does not contain it. Once
  it is saved, commit `design/ocho.pen` alone, prefix `DOCS:`.
- Only the four `08 X-Ray` frames changed, plus two new components on the `Components · Table`
  board. The other fourteen states, `web/`, `server/` and the other `.pen` files are untouched.
  No images were generated. No code was written.

## New components (`Components · Table`, row "Row · X-Ray")

- `Revealed Card`: the revealed card (a `Mini Card` at 40 × 56 with a 2 px `--gold` outline), and
  under it a `scan-eye` icon and "X-Ray" in `--blue-ink`.
- `Seat Row`: a phone row, 358 wide, filled with `--card` and outlined with `--line`, radius 12.
  It holds the avatar (32 px, the seat's colour and initial), then the name and "N cards", then a
  `Revealed Card` instance laid out sideways at 30 × 42.

## Desk · Light and Desk · Dark

- The sheet and the scrim are gone. The table is the eight-seat table, unchanged: the match
  (`Red · X-Ray`), the direction (clockwise), the piles (X-Ray on the discard, Draw · 30), your
  hand (6 cards) and the action bar ("X-Ray · only you see these cards").
- Each of the seven opponent seats is now a `Seat + X-Ray <name>` group: the seat plus its
  `Revealed Card`, beside each other. On the left column and the top row the card is to the right
  of the seat; on the right column it is to the left, so every card faces the felt. The side
  columns are 140 wide.
- The cards are Ana green 6, Ben red +2, Cleo Ocho Wild, Dev yellow 9, Eli blue Skip, Fay Dead Red,
  Gus red 0. These are the same cards the old sheet showed. Seat card counts are unchanged.
- A new event banner under the piles reads "X-Ray · one card from each hand, shown at each seat.
  Only you see them."

## Phone · Light and Phone · Dark

- The dialog, the scrim and the small eight-seat felt are gone. In their place is
  `Table · X-Ray rows` (the same `--felt` panel), from the top down:
  1. A strip with the discard as a mini X-Ray card captioned "Discard", and the `Match` and
     `Direction` chips.
  2. A heading with a `scan-eye` icon: "X-Ray · one card from each hand. Only you see them."
  3. Seven `Seat Row`s in clockwise order from you: Ana (5 cards), Ben (6), Cleo (5), Dev (4),
     Eli (6), Fay (4), Gus (7). Each carries that seat's revealed card, the same cards as on desk.
- "You · 6 cards", your fanned hand and the action bar stay at the bottom. Nothing covers the
  rows.
- The dark frames were deleted and copied again from the light ones, with the dark theme, at the
  same canvas positions (phone x 470, desk x 2460, y 9000). Their node ids changed.

## Contracts

Nothing frozen changed. There is no protocol, engine, fixture or server change. The rule drawn is
the one in `docs/drafts/ocho/rules.md`: one random card from each opponent, seen only by the
player who played X-Ray.

## Done when

- The owner has pressed ⌘S in Pen with `design/ocho.pen` open, and that file is committed alone
  on `dev`.

## Report back

No return task. If the owner wants changes, write them as a new
`docs/handover/NNN-grok-to-claude-<slug>.md` prompt for Claude and print it in one fenced code
block.
