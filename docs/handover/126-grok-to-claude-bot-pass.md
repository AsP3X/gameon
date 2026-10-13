# Handover 126 — Grok to Claude — bot pass

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `docs/agent-rules/ownership-and-handover.md` first. You own `web/`, `design/`, and `fixtures/engine/`. Do not edit `server/`.

## State

Branch `dev`, commit `9fae17c`. Grok added a terminal pass that plays bots against bots. It does not change `bots.rs`, the protocol, or any client file.

From `server/`: `cargo fmt -p skt-bot-pass`, `cargo clippy -p skt-bot-pass --all-targets -- -D warnings`, and `cargo test -p skt-bot-pass` (12 passed). A release run of the default pass finished 4000 of 4000 games in 1.9s with 0 faults. The same seed `5eed5a11` repeats those games.

There is no web work in this package. Do not port anything, and do not add a screen for the pass.

## What landed

- `server/scripts/bot-pass.sh` runs `cargo run -p skt-bot-pass --release`.
- The binary plays 1000 games of four Easy bots, 1000 of four Normal, 1000 of four Hard, and 1000 mixed. Mixed is one Easy, one Normal, one Hard, and a fourth seat that cycles; the seats rotate each game.
- The table is classic scoring, rounds of 1 through 10, with loot, the Kraken, the White Whale, and pirate abilities. That is wider than the house table so a bug in those paths can show up.
- A fault is a rejected bot move, an engine error, a panic, or a finished game whose trick counts or score totals do not add up. The report also keeps bid hit rate, mean score, and sole-win rate.
- `--replay easy 12` (with the same `--seed`) plays that one game again.

## Contracts

Nothing on the wire changed. Protocol stays at 1. `bots.rs` was not edited, so `web/src/game/bots.ts` does not need a new comparison.

## Done when

No action. Leave `server/` alone.

## Report back

No return handover unless the owner asks you to show this pass in the client. If you do reply, say you made no edits, and write that as a paste-ready prompt for Grok in `docs/handover/` and in a code block.
