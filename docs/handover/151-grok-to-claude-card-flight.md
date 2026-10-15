# 151 · Grok → Claude · the played card never flies

You are Claude, working on Skull King Tavern (`C:\Users\asp3x\Documents\development\gameon`).
Read `AGENTS.md`, `docs/agent-rules/design-sync.md`, `docs/agent-rules/web-quality.md`,
`docs/agent-rules/definition-of-done.md`, and this file first. Then read
`web/src/tableview/actions.ts` (`act`), `web/src/tableview/render.ts` (`render`), and
`web/src/tableview/motion.ts` (`snapshot`, `flip`).
You do not edit `server/`, `docs/protocol.md`, `web/src/protocol/generated/`, or `fixtures/`.

## State

- Branch `dev`. Web and server are unchanged since `b2c78f2`. The commit you start from adds the
  rule that Grok delivers this file by running `claude`. Run `git log -1`. Not pushed.
- Grok traced the bug and left `web/` untouched. Do not look for a half-applied patch. `web/` is
  yours; the fix is this request.
- No `.pen` change. This restores motion the table already has. Pencil was disconnected.

## The bug

On device solo and pass-and-play, the card a player plays pops onto the trick. It does not fly
from the hand. Opponent cards played by a bot, and a card played at a remote table, already fly.
Deal flights (`.dealfly`) are a different animation and are not this bug.

`act` locks input, calls `dispatchWithin`, then always `render()`s. `LocalTable.dispatch` runs
the listeners before it returns (`Promise.resolve(this.apply())` calls `apply` on the spot).
`present` reaches `render()` with no `await` on a plain `cardPlayed`. That draw snapshots the
hand, paints the card on the trick, and `flip()` starts the flight. `act`'s second `render()`
then snapshots the card already on the trick, replaces `#app`'s HTML, and detaches the flying
node. `flip()` sees no movement. The player sees a pop.

The second draw has to stay. It is what drops the one-shot marks (`just`, `reveal`, `deal`,
`bump`, `enter`, `justSel`) after they have been painted, and the parity harness compares that
settled picture. Skipping it leaves `pop` on a bid and fails parity. Do not move `act`'s render
onto a microtask. An unanswered remote action must still draw "Locked in" on this turn
(`web/src/tableview/tavern.test.ts`).

`legacy/Skull King Tavern.html` `act()` (near line 2326) does the same double draw. The parity
harness records `element.animate` even when that node is then detached, so parity stays green
while the player sees nothing.

A present that awaits first (`trickCollected`, `bidsRevealed`, `abilityStarted`) has not drawn
when `dispatchWithin` returns. `act`'s render is then the pre-update picture, and the update
draws once afterwards. Leave that order alone. `RemoteTable` is the same shape: the update
arrives later, so one draw flies. Do not break it.

## Your task

1. In `web/src/tableview/render.ts`, remember where the cards were for the draw a player's action
   makes after its update.
   - `armPlayerDraw()` marks the next `render()` as the update's draw.
   - That draw snapshots and flips as it does now, and keeps the snapshot.
   - `renderPlayerDraw()` is the action's following draw. If the update never drew (the hold is
     still only armed: a banner was awaited, or the table has not answered), drop the hold and
     `render()` as usual. If the update did draw, `render()` again from a merged snapshot:
     start from the fresh snapshot, and for any key that is also in the held snapshot use the
     held rect. Keep the fresh snapshot's anchors.
   - A held snapshot that is null (the update's draw was `go('end')`, which is not the game
     screen) falls back to a fresh snapshot. That second end-screen draw already exists.
   - Clear the hold at the end of the draw so a later bot tick is an ordinary draw.

   The merge is required. A new round's hand exists only after the update's draw. The legacy
   page's second draw snapshots those new cards and flips them as
   `translate(0px,0px) scale(NaN)` under jsdom. Using only the held snapshot drops those
   animates. Full-motion parity then fails on a `wait` shot (seen at shot 128, `1809 wait`,
   in pass-and-play with motion on). Keys in both snapshots are the cards that moved, including
   the one that left the hand. On a laid-out page the held rect is the hand and the fresh rect
   is the trick, so the draw that stays is the one that flies. Under jsdom every rect is 0, so
   the keyframes stay `scale(NaN)` and match the recording.

2. In `act` (`web/src/tableview/actions.ts`), call `armPlayerDraw()` immediately before
   `dispatchWithin`, and `renderPlayerDraw()` where `render()` is called now. The grace unlock
   and a refused action still call `render()` with no hold.

3. Add a regression test in `web/src/tableview/tavern.test.ts`, next to the solo-play test.
   The file stubs `matchMedia` to reduced motion, so this test must turn motion on
   (`matches: false`) before the click. Stub `getBoundingClientRect` with a non-arrow function:
   `.hslot` → `DOMRect(80, 640, 72, 100)`, `.slot` → `DOMRect(180, 280, 58, 110)`,
   `[data-anchor]` → `DOMRect(40, 80, 48, 48)`, anything else → `DOMRect(0, 0, 20, 20)`.
   Stub `Element.prototype.animate` the same way and record a `.slot` whose first keyframe
   transform contains `translate(-100px,360px)`. Play one legal card that is not a Tigress
   (click it twice; if the only legal card is a Tigress, confirm Pirate). The update's draw
   animates a node the action's draw then detaches. Assert the connected flight:
   `flown.filter((el) => el.isConnected)` has length 1, its `data-key` is `c${card}`, and that
   node is `.trick .slot[data-key="c${card}"]`. Delete `animate` at the end of the test
   (`Reflect.deleteProperty`); `afterEach` restores spies and globals but not that property.
   On current `dev` this test fails because the animated slot is disconnected.

## Contracts

Frozen: message shapes, the engine, bot policy, `LocalTable`'s synchronous listeners, the
remote "Locked in" path, reduced motion (`flip` returns immediately), and the legacy parity
recordings. You may change `render.ts`, `actions.ts`, and `tavern.test.ts` only as above.

## Done when

From `web/`, with `node_modules/.bin/vp` (not `npx vp`):

- `vp check` — format, lint, and types clean
- `vp test` — the new test passes, and full-motion parity stays green
  (`src/tableview/parity/passAndPlay.test.ts`, `src/tableview/parity/solo.test.ts`)
- `vp build` — built

Play one card in device solo and confirm the trick slot's `getAnimations()` is non-empty on
the node that stays. A live server is a different path; do not "fix" it by drawing twice.

## Report back

Write the return handover to `docs/handover/` and print the same text in one code block.
Name the commit, and paste what `vp check`, `vp test`, and `vp build` printed. Say whether a
played card stayed on the flying node in the browser, and what you could not smoke (full round,
online, light and dark, 360px).
