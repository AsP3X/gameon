# 128 · Claude → Grok · the deal from a face-down stack is built

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/handover/121-grok-to-claude-deal-from-the-stack.md` and this file first.
The code is in `web/src/tableview/deal.ts`; the tests are in `web/src/tableview/deal.test.ts`.
You do not edit `web/` or `design/`.

## State

- Branch `dev`, not pushed. The web half of 121 is commit `380d43e`
  (`ADD: Deal each round from a face-down stack on the felt, clockwise from the seat after the dealer.`).
  The design is commit `799e2a7` (`design/skt.pen`).
- Nothing on the server is waiting on this. The animation needs no fact the view does not carry.
  It reads `dealer`, `cards`, `handCounts`, the seat's own `hand`, `seats.length` and
  `deck.length`, and nothing else. No protocol field, no generated file and no fixture changed.
- What a player sees now, on a round that was dealt just now:
  1. The whole deck is one short stack in the middle of the felt (three backs and a count, never
     one element per card). It is riffled twice in 600 ms.
  2. One back at a time leaves it, clockwise by seat index from `(dealer + 1) % seats`, one lap
     per card. The gap is `clamp(1600 / flights, 28, 90)` ms and a flight is 320 ms.
  3. Every other seat ends with one back and its `handCounts[i]` as a count. That stays through
     the round and counts down as the seat plays.
  4. The hand on screen lands face down, slot by slot, and turns into the sorted hand when its
     last card is down.
  5. The stack goes to the felt's top-left corner as the pile, with the count
     `deck.length - seats * cards`. The felt's words ("Cards are dealt. Place your bids.") come
     back at that moment.
- The bid sheet is there from the first frame and takes a bid while cards are in the air.
- "Dealt just now" is three cases only: a `roundStarted` in the update being shown, a game the
  device itself just created, and an online table opened by `game.start`. A reload, a reconnect
  (`welcome`), a later `game.update`, a saved game and the pass-and-play curtain show the table as
  it stands. The curtain going up or a sheet opening mid-deal ends it at once.
- `prefers-reduced-motion`: nothing moves. The hand and the pile are in their places.
- The Smuggler: the cards that seat drew fly from the pile into its own hand (its own view only).
  The other seats see up to five backs go from the pile to that seat. The pile's count does not
  change, because as many cards go back as come out.
- A phone under 660 px high hides the felt while the bid sheet is open. There is no stack to deal
  from then, and the hands are simply there.
- Gate, from a clean export of `380d43e` (`git archive`, because other sessions were writing in
  the same checkout): `npm run check` clean (153 files formatted, 141 files without warnings or
  errors); `npm test` 50 files, 716 passed, 0 failed; `npm run build` built.
- Tests added in `web/src/tableview/deal.test.ts` (10):
  - the order: clockwise from the seat after the dealer, one lap per card
  - the pace: 90 ms for four cards, 28 ms for eighty
  - a live `roundStarted` is dealt from the stack in that order, and the hand ends as `sortHand`
  - a bid is taken while cards are in the air
  - reduced motion flies nothing and turns nothing
  - a bid during the deal, a bid after it and a snapshot do not start a second deal
  - a table opened without `dealt` (a `welcome`) is shown as it stands; one opened with it is dealt
  - the Smuggler's swap is backs to that seat and leaves the pile's count alone
  - pass-and-play: nothing is dealt under the curtain
  - pass-and-play: the curtain going up mid-deal removes every card in the air, and no hand turns
- Browser smoke (headless Chrome against the dev server, offline games and the in-page mock):
  solo round and two humans on one screen, light and dark, 360 × 800, 360 × 680, 360 × 640,
  820 × 1100 and 1280 × 800, with 4, 6 and 8 seats: the deal, a bid during it, two played cards.
  The pile, the suit pill and "Last trick" do not overlap, and no card of the trick lies under
  the pile. Mock server game: 24 flights after `game.start`, then a reload into the same round:
  0 flights, no riffle.
- Not done, and not claimed:
  - No smoke against the Rust server. The mock stood in for it.
  - The Smuggler's flights are covered by the unit test only. I did not reach one in a browser.
  - `SKT_E2E=1 vp test` was not run.
  - Under 360 px wide the longest suit pill ("Follow Jolly Roger") can touch "Last trick".

## What I changed outside the list in 121

- `web/src/table/remoteTable.ts`: `RemoteTable.opening`, the flag its constructor already took.
  `web/src/App.tsx` passes it on as `dealt`, and `OnlineHooks.dealt` in
  `web/src/tableview/state.ts` carries it. Without it a reload into a running round could not be
  told from a game that had just begun. Before this change `openOnlineTable` flew the hand in on
  every open, a reload included.
- `web/src/tableview/parity/harness.ts`: the legacy page has no deck. The pile, the seats' piles,
  the marks of a running deal and the legacy "new hand card comes in from the trick" animation are
  taken off both pages before they are compared. Everything else is compared as before.
- A hand that was not dealt just now (a table come back to, the hand after the curtain) no longer
  flies in from the middle of the felt. It rises in place.
- Both pen files, not one. `design/skt.pen` holds the same 38 table frames as `design/web.pen`
  under the same ids, and ten solo table frames more. Changing one would have left the other stale.

## Design

- Every table frame has the pile on the felt and a hand pile on each other seat: 48 frames in
  `design/skt.pen`, 38 in `design/web.pen`. Four new frames in each file, at x 10000 to 11450,
  y 3000: `Table · deal · 1 the riffle` and `Table · deal · 2 cards in the air`, light and dark.
- `design/skt.pen`: saved by the owner at 12:50:51 on 2026-10-13 and committed as `799e2a7`.
  I compared the saved file with the commit before it: the other 239 top-level frames and the
  variables are unchanged.
- `design/web.pen`: the frames are drawn in the running Pen app. They are **not on disk** until
  the owner presses ⌘S with that file in front, and they are not committed.
- The small backs in the frames are a plain navy card with a gold mark, in the back art's own
  colour (`#1c2b4a`). They are not the `Card / Back` component, which does not scale. In the
  riffle frame the other seats still say "Ready", copied from the bidding frame.

## Your task

1. Nothing has to be built. Read `web/src/tableview/deal.ts` (its header and `startDeal`) against
   the bullet you added to `docs/protocol.md` §6 and say whether the two agree.
2. `docs/handover/121-grok-to-claude-deal-from-the-stack.md` and
   `docs/handover/122-grok-to-grok-stack-stays-hidden.md` are still untracked. They are yours to
   commit.
3. For the owner, not for you to edit: `docs/agent-rules/design-sync.md` names only
   `design/web.pen`, while `design/skt.pen` carries the same frames. The rule could say which of
   the two is the one to draw in.

## Contracts

- Frozen and untouched: protocol 1, `EngineView`, the slice rule, `fixtures/engine/`,
  `fixtures/protocol/`, `web/src/game/engine.ts`, `web/src/game/bots.ts`, the mock deal.
- Changed: nothing on the wire. `OnlineHooks.dealt` is inside `web/`.
- You may change: nothing in `web/` or `design/`. Ask in a handover.

## Done when

- From `web/`: `npm run check`, `npm test` and `npm run build` pass on `dev` at or after
  `380d43e`. I had 716 tests passed in 50 files.
- From `server/`: your gate is as it was. Nothing here touches it.

## Report back

Only if item 1 finds a difference, or the smoke against the Rust server shows the deal on a
reconnect: say which update carried it (`game.start`, `welcome` or `game.update`, with its
`events`). Write that to `docs/handover/` as a paste-ready prompt for Claude and print the same
text in one fenced code block.
