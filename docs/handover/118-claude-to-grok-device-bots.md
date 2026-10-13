# 118 · Claude → Grok · the device bots follow bots.rs, and the Smuggler in bots.rs is backwards

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/handover/116-grok-to-claude-bot-levels.md`, `server/crates/skt-engine/src/bots.rs`
(`smuggler_discards`, `easy_slip`) and `web/src/game/bots.ts` first. You do not edit `web/`.

## State

- Branch `dev`, not pushed. The port is commit `3193841` ("TASK: Port the three bot levels of the server onto the device engine.").
- From `web/`: `vp check` clean (151 files formatted, 139 linted and type-checked). `vp test`: 49 files, 704 tests passed. `vp build` passes.
- Protocol stays 1. Nothing in `server/`, `fixtures/` or `web/src/protocol/generated/` was touched. No visible screen change, so no `.pen` edit.
- Done in `web/src/game/`:
  - `GameState` has `roundPlays` (every face-up play of the round, with the Tigress `as`) and `peeked` (per seat, the pile as it stood when that seat's Seer ability opened). Both clear when a round starts. Neither is on a view. `Engine.restore` gives a save without them empty lists, and `Store.loadGame` goes through it.
  - `bots.ts` is the policy of `bots.rs`. A bot decides from `Engine.view(state, seat)`, `roundPlays` and its own `peeked` list, and from nothing else. `bid`, `play` and `ability` take an optional third argument, the number source; it defaults to `Math.random`.
  - `reference.test.ts` compares the two reducers on games the new bots play, and the state without the two memory fields. It no longer runs the legacy bots.
  - `bots.test.ts` (22 tests) has the cases your tests lock, with the same hands and ids: Easy overbids a mermaid and a high roll matches Normal; five escapes bid 0; Normal does not lead the Skull King and Easy's zero roll does; Normal Krakens a trick it does not need and Easy takes it; Hard does not play the King on its own zero; Hard Krakens a must-win; Hard Whales a zero onto the next seat; Hard does not Kraken a zero that seat is already winning; the Giant steps onto the trick it took. Each level finishes games at 2 to 8 players under both scorings. A bot decides the same when every card it has not seen is dealt differently.
- Two more tests pinned the legacy bots, and I changed both:
  - `web/src/tableview/parity/harness.ts` plays whole games on the legacy page and on the port and compares the markup. The port is now handed the legacy bots for those runs, and the two memory fields are taken off its saved game before the saves are compared.
  - `web/src/net/mock/server.test.ts` expected a closed seat's card to be the only event of its step. The card can close the trick, so the test now reads the first event.
- How I checked the port against `bots.rs`: a scratch Rust binary outside the repo, depending on `skt-engine` by path. The device recorded 210 bot games (2 to 8 players, both scorings, every format, mixed expansions and abilities). At each decision it recorded what Easy, Normal and Hard chose and the numbers each drew. The binary replayed each game through `GameState`, called `choose_bid`, `choose_play` and `choose_ability` with the same numbers, and compared the answer and how many numbers were drawn.
  - 173,844 decisions other than the Smuggler: 0 different, 0 with a different draw count. That is 25,200 bids, 144,132 plays, 1,296 Gambler, 1,233 Giant, 1,032 Helm and 951 Seer answers.
  - 1,065 Smuggler answers: all 1,065 different. With the one flag on the device flipped for a second recording, 174,858 decisions of 174,858 matched, the Smuggler included. I flipped it back.
- Not done: a manual smoke of a solo game with the server unreachable. A Hard solo game on the in-page mock server (`?mock`, which plays the device bots) ran a first trick in the browser with no console error.

## Your task

1. **Fix the Smuggler in `bots.rs`.** `smuggler_discards` has `let discard_low = keep_winners == invert;`. With `keep_winners` true and no Easy slip that is false, so Normal and Hard throw away their most expensive cards while they still need tricks, and their escapes once the bid is safe. Handover 116 says the opposite, and so did the legacy bot. It should be `keep_winners != invert`. Online tables play this today.
2. **Add the Rust test that guards it.** The device test uses: swift, abilities on, no expansions, dealer 0, hands `[[0, 1, 2], [62, 67, 56]]`. Seat 1 plays 62 (the Smuggler), seat 0 plays 0, `advance`. The pile gives seat 1 the cards 3 and 4.
   - Bids `[0, 3]`, Normal, any roll: discard `[56, 3]`.
   - Bids `[0, 1]`, Normal, any roll: discard `[67, 4]`.
   - Bids `[0, 3]`, Easy, roll 0.0: discard `[67, 4]`.
3. **Decide three places where handover 116 and `bots.rs` say different things.** The device follows the code in all three, and the comparison above confirms it. If you change the code, tell me which lines; if the code is right, nothing changes for me.
   - 116 says Easy "draws one number per decision". `easy_slip` draws a new number for each slip that can happen.
   - 116 says the escape slip and the Kraken slip apply when the bot is "about to duck". `easy_slip` applies them whenever the chosen card is not already an escape or the Kraken, also when the plan was to take the trick.
   - 116 says a hand bids 0 "when every counted winner has an escape, loot, the Kraken, or the Tigress to cover it". `choose_bid` bids the counted tricks, and `duck_count` does not count the Tigress.
4. **Optional, your call and the owner's.** The comparison in "State" could become a fixture both sides replay (`fixtures/bots/*.json`: the deals, the actions, and for each decision the level, the numbers drawn and the answer). That is a new fixture kind, so it needs a section in `docs/engine-conformance.md` and a Rust test. Say in your return handover whether you want it; I would write the generator and the device test.

## Contracts

- Frozen: protocol 1, `EngineView`, `fixtures/engine/`, `fixtures/protocol/`. I changed none of them.
- Device only, not a contract: `GameState.roundPlays`, `GameState.peeked`, `Engine.restore`, the optional number source on `Bots.bid`, `Bots.play` and `Bots.ability`.
- You may change `bots.rs` and its tests. A change to a threshold or to the order of draws must come back to me in a handover, because `web/src/game/bots.ts` has to follow it.

## Done when

- From `server/`: `cargo fmt --all -- --check`, `cargo clippy --all-targets -- -D warnings` and `cargo test --workspace` pass, with the new Smuggler test.
- The three cases in task 2 give the discards listed there.

## Report back

Write the return handover to `docs/handover/` and print the same text in one fenced code block, as a paste-ready prompt for Claude. Name the commit and the test counts. Say what you decided for each of the three points in task 3, and whether you want the shared bot fixture of task 4. I will then run the comparison again against your commit and report the count.
