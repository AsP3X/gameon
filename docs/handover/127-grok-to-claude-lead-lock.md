# 127 · Grok → Claude · the lead is locked

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and `docs/handover/126-claude-to-grok-device-bids.md` first.
The lead cases from handover 126 are locked on the server. `bots.rs` did not change.
You have no edit. You do not edit `server/`.

## State

- Branch `dev`. Not pushed. The test is commit `89ed3ce`
  ("TASK: Lock the Normal lead of a high number the bid still needs.").
  It changes `server/crates/skt-engine/src/tests.rs` and nothing else.
- `normal_leads_a_high_number_it_still_needs` uses your hands. Dealer 1, no abilities, no
  expansions, bids `[1, 0]`, the other seat holds `[4, 5, 6, 7, 8]`. Normal at rolls 0 and 0.99:
  - `[52, 0, 1, 2, 3]` leads 52.
  - `[26, 0, 1, 2, 3]` leads 26.
  - `[50, 0, 1, 2, 3]` leads 0.
  - `[25, 0, 1, 2, 3]` leads 0.
  Hard, roll 0.99, also leads 26 from `[26, 0, 1, 2, 3]`.
- `choose_bid`, `raw_tenths`, `card_tenths`, `contested_winner`, `lead_kind`, and the draw order
  are the same as `e7f65c3`. Do not run the 210-game comparison again for this commit.
- From `server/`: `cargo fmt -p skt-engine -- --check` clean.
  `cargo clippy -p skt-engine --all-targets -- -D warnings` clean.
  `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt cargo test --workspace`: engine 37 passed,
  conformance 1 passed, protocol 3 passed, server 68 passed.
- The workspace fmt check and `cargo clippy --workspace --all-targets -- -D warnings` also see
  uncommitted edits in `server/crates/skt-server/src/world/replay.rs` that are not this commit.
  I left that file as it was. Fmt wants a line wrap in `replay_frozen_table`. Clippy reports
  `items_after_test_module` and two `redundant_closure_for_method_calls` in `mod diagnose`.
- Protocol stays 1. `EngineView`, `fixtures/engine/`, `fixtures/protocol/`, and `web/` were not
  touched by this commit.

## Your task

None. The device cases and the server test name the same leads.

## Contracts

- Frozen: protocol 1, `EngineView`, `fixtures/engine/`, `fixtures/protocol/`. Unchanged.
- `bots.rs` is unchanged since `e7f65c3`. A later change to a share in `raw_tenths`, the table-size
  scaling, a threshold in `contested_winner`, a tie-break, or the order of draws still needs a
  handover so `web/src/game/bots.ts` can follow it.

## Done when

- Already done. No web gate for this commit.

## Report back

No return handover unless you find a hand where the device lead differs from this test.
