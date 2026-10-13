# 126 · Claude → Grok · the device bids and leads the way bots.rs does

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and `docs/handover/125-grok-to-claude-normal-bids.md` first.
The port of handover 125 is done. There is one optional task for you, a Rust test for the lead.
You do not edit `web/`.

## State

- Branch `dev`, not pushed. The port is commit `ff6ee38`
  ("BUGFIX: Device bots bid the tricks a hand is likely to win."). It changes
  `web/src/game/bots.ts` and `web/src/game/bots.test.ts` and nothing else.
- `bid` adds each card's tenths, adds 5, divides by 10 and clamps to the hand. Pirates and the
  Tigress add 10 at every table size. Every other card adds `min(10, floor(raw * 4 / players))`,
  the Skull King included. The floor to 1 and Easy's two slips are as they were. `sureCount` is
  unchanged, and play, the Smuggler and the Gambler still read it.
- On the lead, a threatened black 10 or higher, or a threatened side 13 or 14, is a risky take.
  Following a trick is unchanged.
- The gate ran on a `git archive` copy of the committed tree, because `web/` has another session's
  uncommitted work in this checkout. From `web/`: `vp check` clean (151 files formatted, 139 linted
  and type-checked). `vp test`: 49 files, 706 tests passed. `vp build` passes.
- New tests in `bots.test.ts`:
  - The three bid cases of handover 125, Normal, at rolls 0, 0.5 and 0.99: `[61, 62, 0, 1, 2]`
    bids at least 2, `[55, 54, 27, 0, 1]` bids at least 2, `[0, 1, 2, 3, 4]` bids 0.
  - The lead. Two seats, swift, no expansions, dealer 1, seat 1 holds `[4, 5, 6, 7, 8]`, bids
    `[1, 0]`, seat 0 leads. Normal, any roll: `[52, 0, 1, 2, 3]` leads 52 (black 11),
    `[26, 0, 1, 2, 3]` leads 26 (yellow 13), `[50, 0, 1, 2, 3]` leads 0, `[25, 0, 1, 2, 3]` leads 0.
    Hard also leads 26 from `[26, 0, 1, 2, 3]`.
- Both new tests fail on the device code before `ff6ee38`: the bid of `[55, 54, 27, 0, 1]` is 1,
  and `[52, 0, 1, 2, 3]` leads 0.
- I ran the comparison of handovers 118 and 120 again, against `skt-engine` at `e7f65c3`.
  - The device recorded 210 new bot games with the same 210 table settings as before: 2 to 8
    players, both scorings, every format, mixed expansions and abilities. The applied level rotates
    Easy, Normal, Hard from game to game.
  - The scratch Rust binary replayed each game through `GameState` and called `choose_bid`,
    `choose_play` and `choose_ability` at Easy, Normal and Hard with the numbers the device drew.
  - **175,023 decisions compared, 0 different, 0 with a different number of draws.**

    | Decision | Compared | Different |
    | -------- | -------: | --------: |
    | Bid      |   25,200 |         0 |
    | Play     |  144,132 |         0 |
    | Gambler  |    1,305 |         0 |
    | Giant    |    1,218 |         0 |
    | Helm     |    1,029 |         0 |
    | Smuggler |    1,080 |         0 |
    | Seer     |    1,059 |         0 |

  - Control: the recording of handover 120, made by the device before this port, differs from
    `e7f65c3` on 10,246 of 25,200 bids and 5,597 of 144,132 plays. The comparison does see the change.
  - At the four-player tables of the recording the mean Normal bid is 1.31. It was 0.56 in the old
    recording. Both cover every format and every round length.
- No hand is known where the device bid or lead differs from `bots.rs`.
- Protocol stays 1. Nothing in `server/`, `fixtures/` or `web/src/protocol/generated/` was touched.
  No visible screen change, so no `.pen` edit.
- Not done: a browser smoke of an offline solo game. The working tree holds another session's
  uncommitted table work, so a smoke there would not test this commit.
- The scratch binary and the recordings are not in the repo.

## Your task

1. **Optional: lock the lead in `server/crates/skt-engine/src/tests.rs`.** `e7f65c3` added tests
   for the bid and none for `lead_kind` or `contested_winner`. The device cases above use hands and
   ids that work with your `dealt` helper: dealer 1, no abilities, no expansions, bids `[1, 0]`,
   Normal, any roll.
   - `[[52, 0, 1, 2, 3], [4, 5, 6, 7, 8]]`: seat 0 leads 52.
   - `[[26, 0, 1, 2, 3], [4, 5, 6, 7, 8]]`: seat 0 leads 26.
   - `[[50, 0, 1, 2, 3], [4, 5, 6, 7, 8]]`: seat 0 leads 0.
   - `[[25, 0, 1, 2, 3], [4, 5, 6, 7, 8]]`: seat 0 leads 0.

   On the device code before `ff6ee38` the first hand led 0.

Nothing else. If `bots.rs` changes a share in `raw_tenths`, the table-size scaling, a threshold in
`contested_winner`, a tie-break or the order of draws, say so in a handover, because
`web/src/game/bots.ts` has to follow it and I will run the comparison again.

## Contracts

- Frozen: protocol 1, `EngineView`, `fixtures/engine/`, `fixtures/protocol/`. Unchanged.
- Device only, not a contract: `GameState.roundPlays`, `GameState.peeked`, `Engine.restore`, the
  optional number source on `Bots.bid`, `Bots.play` and `Bots.ability`.
- You may change `bots.rs` and its tests. I do not edit `server/`.

## Done when

- Already done on my side: the web gate passes and the comparison against `e7f65c3` reports 0
  differences.
- If you take the optional task: from `server/`, `cargo fmt --all -- --check`,
  `cargo clippy --workspace --all-targets -- -D warnings` and `cargo test --workspace` pass with
  the new lead test.

## Report back

A return handover is needed only if you add the lead test or change `bots.rs`. Write it to
`docs/handover/` and print the same text in one fenced code block, as a paste-ready prompt for
Claude. Name the commit and the test counts.
