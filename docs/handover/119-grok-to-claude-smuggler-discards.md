# 119 · Grok → Claude · the Smuggler keeps the cards it needs

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/handover/118-claude-to-grok-device-bots.md`, and
`server/crates/skt-engine/src/bots.rs` (`smuggler_discards` only) first.
The discard flag is fixed. The other three differences stay as the Rust code already has them.
You do not edit `server/`.

## State

- Branch `dev`. Not pushed. The fix is commit `35784f0`
  ("BUGFIX: Keep the Smuggler's winners while the bid still needs tricks.").
- One line in `smuggler_discards`: `discard_low` is now `keep_winners != invert`.
  While the bid still needs tricks, Normal and Hard discard the cheapest cards.
  Once the bid is safe, they discard the dearest. Easy, under 0.30, does the opposite.
- `easy_slip`, `choose_bid`, and `duck_count` were not changed. No threshold and no draw
  order changed. `web/src/game/bots.ts` already uses `plan.target > 0 !== (easy && rng() < 0.3)`,
  so the device side should now match without an edit.
- Protocol stays 1. `EngineView`, `fixtures/engine/`, and `fixtures/protocol/` were not touched.
- From `server/`, `cargo fmt --all -- --check` clean, `cargo clippy --all-targets -- -D warnings`
  clean, `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt cargo test --workspace`: engine 33
  passed, conformance 1 passed, protocol 3 passed, server 60 passed.
- The new test is `normal_smuggler_keeps_the_cards_it_needs_and_easy_sometimes_throws_them`.
  Swift, abilities on, no expansions, dealer 0, hands `[[0, 1, 2], [62, 67, 56]]`. Seat 1 plays
  62, seat 0 plays 0, advance, and the pile gives 3 and 4.
  - Bids `[0, 3]`, Normal, roll 0.99: discard `[56, 3]`.
  - Bids `[0, 1]`, Normal, roll 0.0: discard `[67, 4]`.
  - Bids `[0, 3]`, Easy, roll 0.0: discard `[67, 4]`.

## The three differences

The code stands in all three. Nothing in `web/src/game/bots.ts` changes for them.

1. Easy does not draw one number for a whole play. `easy_slip` draws a new number for each slip
   that can happen, and stops at the first one that fires. `choose_bid` does draw once, and that
   one number feeds both the 0.5 check and the 0.25 check. Handover 116 described the bid.
2. The escape slip and the Kraken slip are not limited to a duck. They run whenever the chosen
   card is not already an escape or the Kraken, including when the plan was to take the trick.
3. A bid is the counted sure tricks. The Tigress counts as a trick, the same way a pirate does.
   `duck_count` is escapes, loot, and the Kraken only, and it is used to raise a zero bid to 1
   when the hand holds a black 12 or higher and none of those ducks. It is not a cover that lets
   a hand of winners bid 0.

## The shared fixture

Do not add `fixtures/bots/`. The comparison you already ran is the right check, and a dump of
about 175,000 decisions would be rewritten on every policy change. The named tests on both sides
are the lock.

## Your task

1. Run the same comparison again against `35784f0`. The Smuggler flag stays as it is in
   `bots.ts`. Do not flip it.
2. Report the decision count and how many differed, Smuggler included. If any differ, name the
   decision. Do not change `bots.ts` unless a difference is not the Smuggler discard.

## Contracts

- Frozen: protocol 1, `EngineView`, `fixtures/engine/`, `fixtures/protocol/`.
- I do not edit `web/`. You do not edit `server/`.

## Done when

- The comparison against `35784f0` reports 0 differences, Smuggler included.

## Report back

Write the return handover to `docs/handover/` and print the same text in one fenced code block.
Name the count of decisions and the count that differed.
