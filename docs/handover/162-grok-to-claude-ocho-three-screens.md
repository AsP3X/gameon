# 162 · Grok → Claude · Ocho's three missing screens

You are Claude, the callee, working on Skull King Tavern
(`/Users/niklas/Documents/development/gameon`). Do this work yourself. Do not run `claude` or
`grok`. Do not ask the owner a question. Do not write page code.

Read `docs/drafts/ocho/rules.md` and `docs/handover/157-claude-to-grok-ocho-table.md` first.
Then this file. Draw in the existing `design/ocho.pen` through the Pencil tools. Open that
file. Do not replace it. Do not edit `design/gameon.pen`, `design/web.pen`, or
`design/skt.pen`.

Use the components already in `design/ocho.pen` and the colours, type, and buttons from
`web/src/styles/tokens.css`. No new illustration. No Skull King art.

Each frame below is phone 390 and desk 1440, light and dark. Add them beside the existing
frames. Do not redraw the fifteen table states.

## 1. Sit down

The screen Play, A table, and Teams open.

Title: Ocho. A back button reads Games.

Three controls, in this order:

- **Players.** A stepper from 2 to 8. The free-for-all frame shows 4.
- **Table.** Two choices: "Free-for-all" and "Teams". Teams is 2v2 only. On the free-for-all
  frame, Free-for-all is selected and Teams is available. On the teams frame, Teams is
  selected, the stepper is locked at 4, and the line under it reads "Partners sit opposite
  and see each other's cards."
- **Match.** Two choices: "One hand" and "First to 500". The free-for-all frame has One hand
  selected. The teams frame has First to 500 selected.

The action is a green button, "Start". No bots, no ranked, no pass-and-play, no custom score.

Frames:

- `16 Sit down · free-for-all`
- `17 Sit down · teams`

## 2. How to play

A page, not a dialog. Title: How to play. Lead: "Match a colour or a number, then be the first
to play your last card."

Blocks, in this order, with these words:

- **A hand.** "Each player is dealt 8 cards. Match the discard by colour, number, or the same
  action. The first player with no cards wins the hand. You do not call out a last card."
- **A turn.** "Play one legal card, or draw one. A card you drew may be played at once if it
  matches. Ocho Wild, Wild Draw 4, Shield, and X-Ray may be played on anything."
- **The specials.** One line each: Skip (the next player loses a turn). Reverse (direction
  flips; with two players it skips). Draw 2 and Wild Draw 4 (the next player draws that many
  unless they add another draw card; the total adds up). Shield (sends the whole total back).
  X-Ray (you alone see one card from each opponent). Dead Red (anyone with no red draws 2).
  Boo Blue (everyone tied for fewest cards draws 2).
- **The score.** "A number is its face value. Skip, Reverse, and Draw 2 are 20. A wild or a
  special is 50. A match is one hand, or first to 500."

Under the blocks, two ways and only these: "A table" (2 to 8 players) and "Teams" (2v2).
No other ways.

Frames:

- `18 How to play`

## 3. Between hands

Eight players, the same names as the hand-over frame if it has names. Reuse the seat row.

`19 Between hands`. Ana went out. The list is the running match total for all eight, Ana
marked as the leader. A line reads "Ana went out · 77 this hand". The button is "Next hand".
The totals are whatever makes Ana first and nobody at 500. Show the target: "First to 500".

`20 Match won`. The same list, with one player at 500 or more. Title: "Ana wins the match".
No Next hand button. The button is "Back to games".

Frames:

- `19 Between hands`
- `20 Match won`

## Done when

The four sizes of each of those five frames are in Pen. Say that `design/ocho.pen` is not on
disk until the owner presses ⌘S.

## Git

Commit the return handover only. Do not commit the pen file. Do not push. Do not create a
branch. Prefix `DOCS:`. No AI attribution. Author Niklas Vorberg
<services@vorberg-webmail.de> if git would invent a hostname email.

## Report back

Write `docs/handover/163-claude-to-grok-ocho-three-screens.md` and print the same text in one
fenced code block. List the frame names. No implementation task.
