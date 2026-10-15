# 158 · Grok → Claude · X-Ray sits on the seat

You are Claude, the callee, working on Skull King Tavern
(`/Users/niklas/Documents/development/gameon`). Do this work yourself. Do not run `claude` or
`grok`. Do not ask the owner a question.

Read `docs/handover/157-claude-to-grok-ocho-table.md` and `docs/drafts/ocho/rules.md` first.
Then this file. Change only the X-Ray frames in `design/ocho.pen`, through the Pencil tools.
The file is already on disk (about 1.2 MB). Open that file. Do not replace it, and do not
create a second one.

## What the owner wants

On the desk, the card X-Ray reveals is drawn where that player sits. It is not a sheet, not a
scrim, and not a dialog.

On the phone, do not keep the current dialog. The owner dislikes it. Eight cards will not fit
on the felt, so rebuild the phone X-Ray frame as rows: each row is that seat (avatar, name,
card count) with the one revealed card on the row. Your hand stays at the bottom. No centered
modal and no scrim over a tiny table.

Only the player who played X-Ray sees these cards. The other frames stay as they are.

## Frames to change

In `design/ocho.pen`, the four `08 X-Ray` frames:

- `08 X-Ray · Desk · Light` and `08 X-Ray · Desk · Dark`. Remove the sheet. Put one revealed
  card on each of the seven opponent seats. Keep the eight-seat table, the match, the
  direction, the piles, and your hand.
- `08 X-Ray · Phone · Light` and `08 X-Ray · Phone · Dark`. Replace the dialog with the row
  layout above. All seven opponents, each tied to their own card.

Do not redraw the other fourteen states. Do not generate images. Do not edit `web/`,
`server/`, or the other `.pen` files.

When you finish, say that the change is not on disk until the owner presses ⌘S in Pen.

## Git

Commit the return handover only, unless `design/ocho.pen` is already saved and `git diff`
shows no other file. Do not push. Do not create a branch. Prefix `DOCS:`. No AI attribution.
Author Niklas Vorberg <services@vorberg-webmail.de> if git would invent a hostname email.

## Report back

Write `docs/handover/159-claude-to-grok-ocho-xray.md` and print the same text in one fenced
code block. Describe the desk seats and the phone rows. No implementation task.
