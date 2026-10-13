# 121 · Grok → Claude · deal from a face-down stack

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/agent-rules/server-authority.md`, `docs/agent-rules/design-sync.md`,
`docs/agent-rules/web-quality.md`, and this file first. Then read
`web/src/tableview/views.ts` (`gameView`), `web/src/tableview/motion.ts`, and
`web/src/tableview/actions.ts` (the `roundStarted` branch).
You do not edit `server/`, `docs/protocol.md`, `web/src/protocol/generated/`, or `fixtures/`.

## State

- Branch `dev` at `92c4ce4`. No stack animation exists yet.
- The working tree may hold an unfinished server logging change (`.env.example`, `deploy.sh`,
  `docker-compose.yml`, `server/Cargo.lock`, `server/Cargo.toml`,
  `server/crates/skt-server/Cargo.toml`, `server/crates/skt-server/src/lib.rs`,
  `server/crates/skt-server/src/main.rs`, untracked `server/crates/skt-server/src/logging.rs`).
  Do not stage, revert, or edit those files.
- Today, on `roundStarted`, `ui.deal` is set and the local hand flies in from the trick area
  (`data-anchor="deck"` on `.trick`, `data-from="deck"`, delay `k * 70`). The hand is already
  sorted by `sortHand`. Other seats receive no cards. There is no deck on the felt. The center
  copy is "Cards are dealt. Place your bids."
- The cards are already randomized before that paint. Online, `OsRandom::permutation` shuffles
  the whole deck once per round. Offline, `startRound` in `web/src/game/engine.ts` does the same
  with the device generator. Seat `i` then gets a contiguous slice. The suffix is the pile.
  That assignment stays. Do not change `web/src/game/engine.ts` `startRound`, the mock deal, or
  `web/src/game/bots.ts`.

## What the player should see

One face-down stack per round. It is shuffled, then dealt off the top, clockwise, like a table.
The shuffle the player watches is not a second randomization. The engine has already permuted
the deck. Every card back looks the same, so the riffle must not try to show an order.

Use only facts the seat already has:

- `dealer`, `cards`, `handCounts`, the receiver's own `hand`
- `deck.length` from the table view (the canonical list sent once in `game.start`)
- pile size = `deck.length - seats.length * cards`

Never read or invent another seat's cards, the pile order, a seed, or the permutation.
Do not add a protocol field. Version stays 1.

## Your task

1. Design the stack, the shuffle, the deal, and the leftover pile on the frame that already
   shows this table's felt, seats, and hand. `docs/agent-rules/design-sync.md` names
   `design/web.pen`. If those frames already live in `design/skt.pen`, edit that file instead.
   Do not draw a second table. Pencil MCP only. When the frames are done, ask the owner to press
   ⌘S and say the `.pen` file is not on disk until they do.
2. Build it in `web/src/tableview/` (and the tavern CSS that already styles this table). Tokens
   only. No new hex.
3. Sequence, on a live `roundStarted` only:
   - A face-down stack of the full deck sits on the felt. Draw a short stack of backs plus the
     count. Do not create one DOM node per card in the deck.
   - Shuffle for about 600ms: two face-down riffles. No faces.
   - Deal one back at a time, clockwise by seat index, starting at `(dealer + 1) % seats`.
     One lap per card this round. Launch gap is `clamp(1600 / flights, 28, 90)` milliseconds,
     where `flights = seats * cards`. Each flight lasts about 320ms. The gap is 90ms when few
     cards are dealt and 28ms when the table is full, so a long round stays under about two
     seconds of launches.
   - Other seats end with a face-down pile of `handCounts[i]` backs.
   - The local hand lands face down, then flips into the sorted hand the screen already shows.
     Pass-and-play (`handHidden`) never flips a hand the curtain is hiding. Do not flash another
     person's cards.
   - The remainder stays face down, off the trick, with its count. It must not cover the trick
     once play starts. No faces. The Seer sheet and the Smuggler's own drawn cards stay the only
     places those faces appear.
4. Move the deal anchor off `.trick` onto the stack. Played cards still come from the seat that
   played them. The empty-trick copy stays, and it is visible once the deal has finished, not
   while cards are still in flight.
5. Bidding stays available during the animation. A deadline must not be eaten by the shuffle.
   The bid sheet is not delayed and not disabled for the motion.
6. `prefers-reduced-motion`: no riffle and no flight. The hand and the remainder appear in their
   final places.
7. Do not replay the shuffle or the deal on a later `game.update`, a reconnect, or a welcome
   into a round that has already started. `ui.deal` stays tied to a `roundStarted` you just saw.
   If the pass-and-play curtain is already up when the round starts, skip the flight the same
   way reduced motion does. The felt is covered, and the hand is simply there when the curtain
   opens.
8. The existing deal sound may play. Do not fire one sample per card.
9. Smuggler: the public event already says cards were swapped. You may drop that many backs off
   the remainder pile. Only the Smuggler's own view shows the drawn faces, which it already has
   in `pending.drawn`.

## Contracts

- Frozen: protocol 1, `EngineView`, the slice rule, `fixtures/engine/`, `fixtures/protocol/`,
  `web/src/game/engine.ts` deal, bot policy.
- You may change: `web/src/tableview/**`, the tavern CSS for this table, tests under `web/`,
  and the one pen file from item 1.
- Grok is adding one bullet to `docs/protocol.md` §6 that restates this contract. You do not
  add it. If that bullet lands while you work, you do not rebuild the animation for it.

## Done when

From `web/`: `npm run check`, `npm test`, and `npm run build`. Report pass counts.
`npm test` must cover:

- a live `roundStarted` deals clockwise from the seat after the dealer, and the local hand ends
  as the sorted hand
- reduced motion does not fly cards
- an update that is not `roundStarted` does not start a second deal
- pass-and-play does not reveal a hidden hand during the deal

Smoke a solo round and a two-human one-screen round in the browser, light and dark, at desktop
width and at 360px. Exercise the deal, then a bid, then a played card. A reconnect into a round
that has already started must not shuffle again.

## Report back

Write the return handover to `docs/handover/` and print the same text in one fenced code block.
Name the pen file, whether the owner has saved it, the tests you added, and the gate counts.
No server change is waiting on this unless you found that the animation needs a fact the view
does not already carry. If you did, name the fact and stop. Do not invent a field.
