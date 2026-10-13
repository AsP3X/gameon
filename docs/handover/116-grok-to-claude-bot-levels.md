# 116 · Grok → Claude · port the three bot levels

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `server/crates/skt-engine/src/bots.rs`, and `web/src/game/bots.ts` first.
The server bots are done. You port that policy onto the device engine. You do not edit `server/`.

## State

- Branch `dev`. Not pushed. The server change is commit `cd3a2fc` ("TASK: Rework Easy, Normal, and Hard so a hard bot leans on the next seat.").
- Protocol stays 1. `EngineView` did not gain a field. Fixtures were not edited.
- `design/gameon.pen` and `docs/drafts/` were already dirty in the checkout. I left them unstaged.
- From `server/`: `cargo fmt --all -- --check` clean, `cargo clippy --all-targets -- -D warnings` clean.
  `cargo test -p skt-engine`: 32 passed, conformance 1 passed.
  `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt cargo test --workspace` before the last engine test was added: protocol 3 passed, server 60 passed. That last test is engine-only.
- Online tables, including solo on the server, already use the Rust bots. A takeover stays Normal. The delay is still 800–1500 ms.
- Offline play still uses `web/src/game/bots.ts`, which is the old power table. That is the gap.

## What the server does

`bots.rs` is the spec. All three levels share one plan. Easy leaves it on the slips below. Normal plays it every card. Hard plays the same card Normal would, unless another card in that same pool leans on the next clockwise seat (`seat.next`) without changing the bot's own plan.

A bot may read its own hand, the deck, the rules, the bids and tricks already shown, the face-up plays of this round (seat and Tigress `as` included), and the pile cards the Seer showed this seat. It must not read another hand or the undealt pile.

The server keeps that extra memory off the wire: `GameState::shown_plays()` and `GameState::seer_memory(seat)`. The peek is copied when the Seer ability opens and kept after the ability ends. Both lists clear at the start of the next round. Another seat's peek is empty. The leak tests still pass.

Counting, before the bid and again on every play:

- Every pirate and the Tigress counts as a trick. The Skull King counts only when no mermaid is expected in the other hands. At 3 or fewer players, Hard still counts the King if at most one mermaid is expected.
- A black number counts when nothing higher is expected and no pirate, Tigress, King, or mermaid is expected. If a special is expected and nothing higher is, that special is spent and the black does not count.
- The best card of one side suit counts only when no higher card of that suit, no black number, and no such special is expected.
- Expected means "in an opponent's hand", not "anywhere unseen". Unseen is the deck minus this hand, minus cards already played, minus this seat's peek. `holders` is the sum of the other hand counts. Expected count is `(matches * holders + unseen / 2) / unseen`, with `holders` clamped to `unseen`.
- Bid 0 when every counted winner has an escape, loot, the Kraken, or the Tigress to cover it. A black 12 or higher with no duck bids 1.

Play:

- Need is bid minus tricks taken. Target is that need, clamped to the cards left. Classic, when the need is past the cards left, plays for the cards left. Rascal, when the need is exactly one past the cards left, plays for a glance. Rascal, when the miss is already worse than a glance and a glance is out of reach, plays for nothing (doomed).
- While the target is still open, take with the cheapest safe card. A safe take is one that wins and that nobody still to play can beat with an unseen card they could legally hold. An unknown void is treated as "they might have anything". A known void (an off-suit number earlier this round, or in this trick) means they cannot play the lead suit. Specials are not a void.
- Escapes, loot, Tigress-as-escape, the Kraken, and the Whale are ducks. On the lead, a threatened ordinary card is a duck; a threatened King, pirate, mermaid, or black 12+ is a risky take.
- Once the counted cards cover the target, duck. Do not cash the King or a pirate while a cheaper card wins. Spend order, cheapest first: escape, side rank, black, mermaid, Whale, pirate, Kraken, King.
- Shed order when ducking, most dangerous first: characters, then black, then side ranks, then the Kraken, then an escape, then the Whale. While the target is still open, a counted card or a stopper is kept.

Easy draws one number per decision and takes the first slip that applies. It does not draw for a slip that cannot happen:

- Bid: under 0.5, add one for a mermaid and one for a side card of rank 13 or 14. Under 0.25, a zero bid on a non-empty hand becomes 1.
- Lead, still needing a trick, under 0.33: lead the strongest stopper.
- About to duck, under 0.25: take with the most expensive winner instead.
- About to duck with a plain card, under 0.20: spend an escape that would also lose.
- About to duck, under 0.50: throw the Kraken away.
- About to play the Tigress as an escape, under 0.33: call it a pirate.
- One legal card is played as it is. No slip can play an illegal card.

Hard, only inside the pool the plan already chose:

- The neighbour is the next seat. Pressure is used only when this seat leads a duck into a suit that seat is known to be void in, or when this seat is last.
- Last, and they still need every remaining chance: Kraken (they miss). Last, and their bid is already made or is zero and they are winning: leave them the trick. Do not Kraken that trick; wiping it saves them. A Whale that hands them the high number is the "give them a trick" play.
- A doomed Rascal round is the only time Hard may take a trick purely to hurt that seat. Any other extra take would bust Hard's own bid, and it must not.
- There is no search and no sampling. Do not add one.

Abilities follow the same plan. Helm names the next seat, so this seat plays last. Easy, under 0.40, names itself. Smuggler discards the lowest cards while tricks are needed and the highest once the bid is safe. Easy, under 0.30, does the opposite. Gambler stakes 20 only when the counted tricks and the ducks cover the need exactly. Hard may stake 10 when the count is exact and the ducks are one short. Easy, under 0.25, stakes 20 on a stake that is not clearly right. Giant steps the bid by `clamp(won - bid, -1, 1)` and stays inside 0..=cards. Easy, under 0.50, flips that step when the flip is still legal.

## Your task

1. In `web/src/game/`, remember the face-up plays of the round (seat and Tigress `as`) and the cards each seat was shown by the Seer. Clear both when a round starts. A saved game that has no such fields loads them empty. `played` is only card ids, and `lastTrick` is only the previous trick, so neither one is enough: a Tigress declaration changes who won and who is void.
2. Port `bid`, `play`, and `ability` in `web/src/game/bots.ts` to the policy above. Read `bots.rs` for the thresholds. The bot may use its own hand, `roundPlays`, and its own peek. It must not use another hand or the pile beyond that peek.
3. `web/src/game/reference.test.ts` compares every bot decision, and then the whole state, with `legacy/Skull King Tavern.html`. Do not edit that HTML file. Stop requiring the new decisions to equal the legacy bots. Keep the reducer comparison on shared actions, and ignore the new memory fields in the state compare (or compare them only on the device side). The legacy draw order is no longer the contract.
4. Add device tests for the same cases the Rust tests lock: Easy overbids a mermaid and a high roll matches Normal; five escapes bid 0; Normal does not lead the Skull King and Easy's zero roll does; Normal Krakens a trick it does not need and Easy takes it; Hard does not play the King to sink the next seat on its own zero; Hard Krakens a must-win; Hard Whales a zero onto the next seat; Hard does not Kraken a zero that seat is already winning; the Giant steps onto the trick it took. Each level still finishes a game.

## Contracts

- Protocol stays 1. Do not add a field to `EngineView`. Do not edit `fixtures/engine/` or `server/`.
- I do not edit `web/` except `web/src/protocol/generated/`, and this package did not touch that.
- No visible screen change, so no `.pen` edit for this package.

## Done when

- From `web/`: `vp check` and `vp test` pass, including the new bot tests and a reference test that no longer pins the legacy bot formula.
- Offline solo at Easy, Normal, and Hard follows the same decisions as `bots.rs`.

## Report back

Write the return handover to `docs/handover/` and print the same text in one fenced code block. Name the commit, the test counts, and any case where the device bot still differs from `bots.rs`.
