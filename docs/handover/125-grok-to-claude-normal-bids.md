# 125 · Grok → Claude · port the normal bid

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `server/crates/skt-engine/src/bots.rs` (`choose_bid`, `likely_bid`, `raw_tenths`,
`lead_kind`), and `web/src/game/bots.ts` first.
The server bid is fixed. You port that bid, and one lead change, onto the device engine.
You do not edit `server/`.

## State

- Branch `dev`. Not pushed. The server change is commit `e7f65c3`
  ("BUGFIX: Normal bots bid the tricks a hand is likely to win.").
- Online tables and solo on the server already use the Rust bid. Offline solo still uses
  `web/src/game/bots.ts`, which still bids the sure-trick count. That is the gap.
- A Normal bid was the count of tricks nothing left in the deck can beat. At the deal the rest of
  the deck is unseen, so that count is a pirate or the Tigress, or 1 for a black 12+ with no
  escape, loot, or Kraken. Everything else bid 0. On a 4-player deal of 10 cards, about three
  quarters of those bids were 0 or 1. The same sample now averages about 2.3, and about a quarter
  of the bids are 0 or 1.
- Play still uses the sure-trick count to decide which card is safe to cash. The bid does not.
- Protocol stays 1. `EngineView`, `fixtures/engine/`, and `fixtures/protocol/` were not touched.
- From `server/`: `cargo fmt --all -- --check` clean, `cargo clippy --workspace --all-targets -- -D warnings`
  clean. `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt cargo test --workspace`: engine 36
  passed, conformance 1 passed, protocol 3 passed, server 67 passed.
- `web/` was already dirty in this checkout. I did not stage it.

## What to port

`bots.rs` is the spec. Normal and Hard bid the same number. Easy still draws one number and adds
its slips on top of that number. The draw is unchanged.

1. In `web/src/game/bots.ts`, `bid` must use the per-card total below instead of `plan.sure`.
   Keep the floor: a 0 with no escape, loot, or Kraken, and a black 12 or higher, becomes 1.
   Keep Easy's two slips. Do not change `sureCount`. Play, the Smuggler, and the Gambler still
   read that count.

   Each card adds tenths. Pirates and the Tigress add 10 at every table size. Every other card
   adds `min(10, floor(raw * 4 / players))`, and `raw` 0 stays 0. `players` is the seat count.
   Sum the tenths, add 5, divide by 10, and clamp to the hand.

   `raw` at a four-player table:

   | Card | Tenths |
   | --- | --- |
   | Pirate, Tigress, Skull King | 10 |
   | Mermaid | 6 |
   | Black 14, 13, 12, 11, 10, 9, 8 | 10, 8, 7, 5, 4, 2, 1 |
   | Any other black | 0 |
   | Side 14, 13, 12 | 6, 4, 2 |
   | Side 11 or 10 | 1 |
   | Any other card | 0 |

2. On the lead, a threatened black 10 or higher, or a threatened side card of 13 or higher, is a
   risky take. A stopper already covers black 12+, pirates, the Tigress called as a pirate, the
   mermaid, and the Skull King. This adds black 10, black 11, and a side 13 or 14. Pass the card
   into `kindOf`. An escape, the Kraken, and the Whale stay ducks. Following a trick is unchanged.

## Tests

Add these next to the bid tests in `web/src/game/bots.test.ts`. Hands are card ids, dealer 1,
no expansions, two seats, swift. Normal, any roll:

- `[61, 62, 0, 1, 2]` bids at least 2.
- `[55, 54, 27, 0, 1]` bids at least 2.
- `[0, 1, 2, 3, 4]` bids 0.

The locks that are already there still hold: Easy overbids the mermaid hand and a high roll matches
Normal; five escapes bid 0; Normal and Hard draw no number; Normal does not lead the Skull King;
Normal Krakens a trick it does not need; the Hard cases and the ability cases are unchanged.

## Contracts

- Protocol stays 1. Do not add a field to `EngineView`. Do not edit `fixtures/engine/`,
  `fixtures/protocol/`, or `server/`.
- I do not edit `web/` except `web/src/protocol/generated/`, and this package did not touch that.
- No visible screen change, so no `.pen` edit.

## Done when

- From `web/`: `vp check` and `vp test` pass, including the three new bid cases.
- Offline solo at Easy, Normal, and Hard bids and leads the way `bots.rs` does on these hands.
- Do not treat a replay of the old 210-game recording as a failure. Those bids were the sure-trick
  count. The device copy should follow `e7f65c3`.

## Report back

Write the return handover to `docs/handover/` and print the same text in one fenced code block.
Name the commit, the test counts, and any hand where the device bid or lead still differs from
`bots.rs`.
