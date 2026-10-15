# 163 · Claude → Grok · Ocho's three missing screens (return)

You are Grok, working on Skull King Tavern (`/Users/niklas/Documents/development/gameon`). This is
the return handover for `docs/handover/162-grok-to-claude-ocho-three-screens.md`. There is no
server work and no implementation task in it. Read it and tell the owner the screens are ready
for review in Pen, and that they reach disk only when they save.

## State

- Branch `dev`, not pushed, started from `3dab2a6` (`git fetch origin` + `git merge --ff-only
  origin/dev`: already up to date). This file is committed alone, prefix `DOCS:`.
- **`design/ocho.pen` is not on disk with these changes** until the owner presses ⌘S in Pen with
  `design/ocho.pen` open. The file on disk is still the committed save from `d508205`. It was not
  replaced, and the pen file is not in this commit. After the save, check with
  `git diff --stat` that only `design/ocho.pen` changed, then commit it alone, prefix `DOCS:`.
- `design/gameon.pen` is open in Pen too, with the unsaved edits from handover 161. This work
  did not touch it, nor `design/web.pen`, `design/skt.pen`, `web/` or `server/`. No page code,
  no images, no Skull King art. The fifteen table states are unchanged.

## New components (`Components · Pages`, a board right of `Components · Table`)

- `Back Header`: a chevron-left and "Games" in `--blue-ink`, 44 px tall.
- `Stepper`: minus, the value, plus (48 px ghost buttons, `--line` edge). Locked state: soft
  disabled buttons with `--faint` icons and a lock icon. "Stepper · locked" shows that state.
- `Choice`: a 64 px option with a label and an optional sub-line. The selected state is
  `--blue-bg` with a `--blue` edge and `--blue-ink` label ("Choice · selected").
- `Rule Block`: a titled card for the How to play blocks.
- `Way Row`: a key (green `globe` or blue `users`), a title, a sub-line and a chevron-right. It
  matches the two Ocho ways on the Games shelf (handover 161).

The score lists reuse the existing `Seat Row` (avatar, name, a sub-line). Its revealed-card slot
is replaced with the total.

## Frames

Each is drawn in four sizes: `· Phone · Light` (390), `· Phone · Dark`, `· Desk · Light` (1440),
`· Desk · Dark`. They sit in rows below `15 Reshuffle`, at the same x columns as the table
states (0, 470, 940, 2460). That makes 20 frames:

- `16 Sit down · free-for-all`: Back "Games", title "Ocho". **Players** stepper at 4,
  "2 to 8 players". **Table**: "Free-for-all" (selected, "2 to 8 players") and "Teams"
  (available, "2v2 only"). **Match**: "One hand" (selected) and "First to 500". A green "Start"
  button. On desk the controls sit in a 520-wide card in the middle of the page; on phone,
  Start is at the bottom.
- `17 Sit down · teams`: the same, with Teams selected, the stepper locked at 4 ("Teams is
  2v2 · 4 players", with a lock), the line "Partners sit opposite and see each other's cards."
  under the Table choices, and "First to 500" selected.
- `18 How to play`: a page, not a dialog. Back "Games", title "How to play", and the lead from
  162. Then the blocks A hand, A turn, The specials and The score, with the words from 162
  verbatim. The specials are seven lines, each with a mini card (Skip, Reverse, Draw 2 and Wild
  Draw 4, Shield, X-Ray, Dead Red, Boo Blue). Under them, "Two ways to play": "A table"
  ("2 to 8 players") and "Teams" ("2v2"). The phone page is drawn at its full scrolling length,
  1377 tall. On desk (900) the blocks are in two columns: A hand, A turn and The score on the
  left, The specials on the right. The two ways sit side by side under them.
- `19 Between hands`: the Top Bar (OCHO · Hand 6), title "Match score", "Ana went out · 77 this
  hand", and a "First to 500" target pill. Eight `Seat Row`s, ranked: Ana 418 (gold row,
  "Leader" pill, "Went out · +77 this hand"), Fay 356, You 302, Gus 288, Ben 240, Cleo 197,
  Dev 151, Eli 96. A green "Next hand" button.
- `20 Match won`: Hand 7, title "Ana wins the match", "Ana went out · 94 this hand", the same
  target pill, and the same list with Ana at 512 and a "Winner" pill. There is no Next hand;
  the button is blue "Back to games".

## Choices the owner may want to review

- The names come from the hand-over frame: Ana, Ben, Cleo, Dev, Eli, Fay and Gus, plus You.
  The hand numbers (6, 7) and the totals were picked so that Ana leads and nobody reaches 500
  in frame 19.
- Rows after the leader read "2nd place" and so on.
- The rules do not say who receives the points. These frames show Ana, who went out, gaining
  the hand's points, as handover 162 implies.

## Contracts

Nothing frozen changed. There is no protocol, engine, fixture or server change.

## Done when

- The owner has pressed ⌘S in Pen with `design/ocho.pen` open, and that file is committed alone
  on `dev`.

## Report back

No return task. If the owner wants changes, write them as a new
`docs/handover/NNN-grok-to-claude-<slug>.md` prompt for Claude and print it in one fenced code
block.
