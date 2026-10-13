# 122 · Grok · the shuffled stack stays hidden

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/agent-rules/server-authority.md`, `docs/agent-rules/protocol-contract.md`,
`docs/engine-conformance.md` (the deal bullet in §1), and `docs/protocol.md` §6 first.
This is the server half of a table animation. Claude's half is
`docs/handover/121-grok-to-claude-deal-from-the-stack.md`. You do not edit `web/` except
`web/src/protocol/generated/`, and this task must not need a generated-file change.

## State

- Branch `dev` at `92c4ce4` (`TASK: Keep the open design/gameon.pen edits on dev.`). Not pushed
  for this task. No stack work is in the tree yet.
- The working tree already has an unfinished logging change. Leave it untouched. Do not stage,
  revert, or edit any of these:
  - `.env.example`
  - `deploy.sh`
  - `docker-compose.yml`
  - `server/Cargo.lock`
  - `server/Cargo.toml`
  - `server/crates/skt-server/Cargo.toml`
  - `server/crates/skt-server/src/lib.rs`
  - `server/crates/skt-server/src/main.rs`
  - `server/crates/skt-server/src/logging.rs` (untracked)
- Each round is already one shuffle of the whole deck. `OsRandom::permutation` in
  `server/crates/skt-server/src/random.rs` is Fisher-Yates from the OS generator. `Recall` stores
  that order for the action log. Index 0 is first.
- `GameState::apply_deal` in `server/crates/skt-engine/src/game.rs` gives seat `i` the slice
  `order[i*cards .. (i+1)*cards]`. The suffix is the pile. The Smuggler draws the front of that
  suffix. The Seer is shown that suffix, on their own view only, while the ability is open.
- A seat's `EngineView` already has `dealer`, `cards`, `hand` (that seat, deal order), and
  `handCounts`. `game.start.deck` is the canonical card list, not the shuffle. Its length is the
  stack size. The pile size is `deck.length - players * cards`.
- `docs/protocol.md` §6 already forbids sending the deck order, a seed, or the pile.

## Do not change the deal

A clockwise deal of the same permutation would give each seat different cards. That breaks
`fixtures/engine/`, replay of stored games, and any bot choice that walks the hand in order.
The odds are already the same as a physical deal. This package does not change them.

Do not change `apply_deal`, `DealSource`, `OsRandom`, the reference engine, or the fixtures.
Do not bump the protocol version. Do not add a field, a message, or an error code.

## Your task

1. In `docs/protocol.md` §6, immediately after the bullet that starts "No deck order, seed or RNG
   state", add this bullet and nothing else:

   > The table may show a face-down stack, a shuffle, and a clockwise deal. It draws those from
   > `dealer`, `cards`, `handCounts`, the receiver's own `hand`, and the length of `deck` in
   > `game.start`. The permutation, the pile order, and any seed stay unsent.

2. Search `server/crates/skt-engine/src/tests.rs` and `leak.rs` for a test that already asserts
   the slice and the suffix. If none does, add one engine test: a known permutation, two seats,
   two cards each, hands `[[0, 1], [2, 3]]`, pile starting at `4`, and seat 0's view contains
   hand `[0, 1]` and not card `2`. Do not add a second test when one already locks that.
3. Do not regenerate `web/src/protocol/generated/` or `fixtures/protocol/`. No message changed.

## Contracts

- Frozen: protocol version 1, message names, `EngineView`, the slice rule in
  `docs/engine-conformance.md`, `fixtures/engine/`, `fixtures/protocol/`.
- You may change: the one new bullet in `docs/protocol.md` §6, and an engine test only as item 2
  says.
- Claude may not receive the permutation. If the animation seems to need it, stop and say so.
  Do not send it.

## Done when

From `server/`:

- `cargo fmt --all -- --check` clean
- `cargo clippy --all-targets -- -D warnings` clean
- `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt cargo test --workspace` — report the engine,
  conformance, protocol, and server pass counts. Conformance stays green with the fixtures unchanged.

## Report back

Write `docs/handover/NNN-grok-to-claude-stack-stays-hidden.md` (next free number) and print the
same text in one fenced code block. Name the protocol bullet, the test you cited or added, and
the gate counts. Tell Claude the animation contract in handover 121 is unchanged and no web edit
is waiting on you.
