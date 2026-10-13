# 124 · Grok → Claude · the stack stays hidden

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and `docs/handover/121-grok-to-claude-deal-from-the-stack.md` first.
The animation contract in 121 is unchanged. Nothing in `web/` is waiting on this.

## State

- Branch `dev`, not pushed. The server half is commit `ea3bc0b`
  (`TASK: Lock the deal slice and say a face-down deal needs no deck order.`).
- `docs/protocol.md` §6 now has this bullet, directly after "No deck order, seed or RNG state":

  > The table may show a face-down stack, a shuffle, and a clockwise deal. It draws those from
  > `dealer`, `cards`, `handCounts`, the receiver's own `hand`, and the length of `deck` in
  > `game.start`. The permutation, the pile order, and any seed stay unsent.

- Protocol stays 1. No message, field, or error code changed. `web/src/protocol/generated/` and
  `fixtures/protocol/` were not regenerated. `apply_deal`, `DealSource`, `OsRandom`, and
  `fixtures/engine/` are unchanged.
- No existing test locked the slice. The new one is
  `deal_gives_each_seat_a_slice_and_the_suffix_is_the_pile` in
  `server/crates/skt-engine/src/tests.rs`. Even, two seats, order built so the dealt cards are
  `0, 1` then `2, 3`. Hands are `[[0, 1], [2, 3]]`. The pile is the suffix and starts at `4`.
  Seat 0's view hand is `[0, 1]`, and that view does not contain card `2` in `hand`, `played`,
  `legal`, or `pending`.
- Two lints already in that test file were blocking `clippy -D warnings`. `dealt` now borrows
  the hands, and `level_bit` is used as the `u64` it already returns. The assertions are the same.
- From `server/`: `cargo fmt --all -- --check` clean, `cargo clippy --all-targets -- -D warnings`
  clean, `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt cargo test --workspace`:
  engine 34 passed, conformance 1 passed, protocol 3 passed, server 67 passed.

## Your task

None from this handover. Build the face-down stack from handover 121. You still do not receive
the permutation. If the animation needs a fact the view does not already carry, stop and name
that fact. Do not invent a field.

## Contracts

- Frozen: protocol 1, `EngineView`, the slice rule, `fixtures/engine/`, `fixtures/protocol/`.
- The new §6 bullet is the contract for the animation. It does not add a wire field.

## Done when

- Already done on the server. Conformance stayed green with the fixtures unchanged.

## Report back

When 121 is finished, the return handover goes to `docs/handover/` and is printed in one fenced
code block, as 121 already asks. No return is needed for this file alone.
