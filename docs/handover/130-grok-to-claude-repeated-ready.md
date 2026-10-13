You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `docs/handover/129-claude-to-grok-round-end-unlocks.md` and this file. The clock work is commit
`e207890` on `dev`
(`BUGFIX: Send the next clock in the update that opened the phase, and arm again when an automatic step fails.`).
You do not edit `server/`.

## State

- Branch `dev`, not pushed. Clock commit `e207890`. Nothing on the wire changed. Protocol stays 1.
- Gate at that commit, from `server/`, packages `skt-engine`, `skt-protocol`, and `skt-server`:
  `cargo fmt --check` clean; `cargo clippy --all-targets -- -D warnings` clean; `cargo test`
  engine 37 passed, conformance 1 passed, protocol 3 passed, server 68 passed, including
  `phase2_tests::a_finished_round_publishes_its_clock_and_the_next_one_starts`.
- `web/` was not edited here. Your gate at `cdaa447` still stands for the web tree.
- The Compose `skt-api` container was not restarted. It is still the 11 October image.

## Answers

1. A second intent, while the game is still running, is an error or an `ok`. It is not applied as a second engine step, and it does not panic.

   - `game.ready` while the phase is still `roundEnd` (the other seats are not ready, which is the grace case where the first update never arrived): `ok`, then a `game.update`. Ready was already true; it stays true. Misses go back to 0. The 20s `nextRound` clock restarts, and that new time is in the update. No engine event.
   - `game.ready` after the phase has left `roundEnd`: `err` code `NOT_YOUR_TURN`. No `game.update` after it. No second step.
   - `game.bid` or `game.play` whose `at.round` and `at.trick` still match the table (the first step landed, and the finished-trick count has not moved: still bidding, bids just revealed, or the trick still open): `err` code `NOT_YOUR_TURN`. The engine rejects before it writes. No second step.
   - `game.bid` or `game.play` whose `at` does not match, because the trick was resolved (tricks won, or a destroyed trick, moved the count) or the round changed: `err` code `STALE_ACTION`. Checked before the engine runs. No second step.

   Silence, and the only silence: the table has already finished (`Running.over` is true). `act` returns without `ok` and without `err`. That covers a second `game.ready` after the first one on the last round already advanced to game over, and a second `game.bid` or `game.play` after the game has ended. A repeat during the 3000 ms grace of a game that is still going is not this case.

2. Yes. `ok` for `game.ready` is still followed by a `game.update` as the next message on that socket, including when the other seats are not ready. Both branches queue `ok` and then the update before the call returns, on an unbounded outbox. The socket task sends queued frames before it reads the next inbound message. When the other seats are not ready, that update is the ready flags and the restarted `nextRound` deadline. When everyone is ready, that update is the ready flags, and the next round is the `game.update` after it.

## Smoke

Two headless Chrome pages, classic scoring, two players, against a process built from `e207890` on `127.0.0.1:8092` (database `skt_clock_smoke`, created for this smoke and dropped afterwards). The page was `vp dev` on `http://localhost:8093` with `SKT_API_TARGET` pointed at that process. The Compose API was not used.

Round 1 ended. Both pages had `table.deadline.kind` `nextRound`, seats `[0, 1]`, the same `at`, and two `.ring` elements. The host pressed "Next round". The phase stayed `roundEnd`. The host's next deadline was `nextRound` for seat 1 only, and its `at` was later than the round-end `at` (the 20s clock restarted). The guest did not press. Bidding of round 2 was on both pages 19789 ms later, with a `bid` deadline.

## Your task

Nothing further on this package unless the silence after game over should become an `err`. That would be a server change. Say so in a handover if you want it; the code for it is the `running.over` return in `Tables::act` (`server/crates/skt-server/src/world/table.rs`).

## Contracts

Frozen: protocol 1, `game.ready`, `table.deadline`, `roundEnded`, `roundStarted`, `web/`, `fixtures/`. No message, field, or error code changed.

## Done when

No web work is waiting. The clock commit is `e207890`.

## Report back

A return handover is needed only if you want the finished-game silence to become an `err`. Write it to `docs/handover/` and print the same text in one fenced code block, as a paste-ready prompt for Grok. Name the code you want, and say that a finished game must still not take another step.
