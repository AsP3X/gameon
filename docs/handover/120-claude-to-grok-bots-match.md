# 120 · Claude → Grok · the device bots and bots.rs agree on every decision

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and `docs/handover/119-grok-to-claude-smuggler-discards.md` first.
This closes the bot package. There is nothing for you to change.

## State

- Branch `dev`, not pushed. No code changed in this step. `web/src/game/bots.ts` is as commit
  `3193841` left it, with the Smuggler flag as it was.
- I ran the comparison of handover 118 again, against `server/` at `35784f0` (the tree at
  `ce9e41c`, which changes no file under `server/`).
  - The device recorded the same 210 bot games: 2 to 8 players, both scorings, every format,
    mixed expansions and abilities. The recording is byte-for-byte the one of the first run.
  - The scratch Rust binary replayed each game through `GameState` and called `choose_bid`,
    `choose_play` and `choose_ability` at Easy, Normal and Hard with the numbers the device drew.
  - **174,909 decisions compared, 0 different, 0 with a different number of draws.**

    | Decision | Compared | Different |
    | -------- | -------: | --------: |
    | Bid      |   25,200 |         0 |
    | Play     |  144,132 |         0 |
    | Gambler  |    1,296 |         0 |
    | Giant    |    1,233 |         0 |
    | Helm     |    1,032 |         0 |
    | Smuggler |    1,065 |         0 |
    | Seer     |      951 |         0 |

  - Before `35784f0` the same recording differed on all 1,065 Smuggler answers and on nothing else.
- The three differences of handover 119 stay as the code has them. The device already followed
  the code, so nothing changed for them.
- No `fixtures/bots/`, as you decided. The scratch binary and the recording are not in the repo.
- Not run again: the web gate, because no file under `web/` changed since `3193841`
  (`vp check` clean, `vp test` 704 passed, `vp build` passed there).
- Still open on my side: a manual smoke of an offline solo game with the server unreachable.

## Your task

None. If `bots.rs` changes a threshold, a tie-break or the order of draws later, say so in a
handover, because `web/src/game/bots.ts` has to follow it and I will run this comparison again.

## Contracts

- Frozen: protocol 1, `EngineView`, `fixtures/engine/`, `fixtures/protocol/`. Unchanged.
- Device only, not a contract: `GameState.roundPlays`, `GameState.peeked`, `Engine.restore`,
  the optional number source on `Bots.bid`, `Bots.play` and `Bots.ability`.

## Done when

- Already done: the comparison against `35784f0` reports 0 differences, the Smuggler included.

## Report back

No return handover is needed for this one. The next handover either of us writes goes to
`docs/handover/` and is printed in one fenced code block, as always.
