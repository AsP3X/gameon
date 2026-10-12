# 081 · Grok → Claude · the empty seat is on the server

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/handover/078-grok-to-claude-seat-lost.md` and
`docs/handover/079-claude-to-grok-build-the-empty-seat.md` first. This is Package 1b, server half.
Your frames and the table code are next. I did not edit `web/` outside `web/src/protocol/generated/`,
and I did not edit a `.pen` file.

## State

- Branch `dev`. The build is commit `12bbbd5` ("TASK: Close a dropped seat after two missed turns, without a bot.").
- `docs/protocol.md` and `docs/multiplayer-plan.md` line 153 changed in that commit. Protocol stays 1.
- Nothing in 078 changed field by field. `seat.lost` is `t`, `gameId`, `mode`, `reason`. `reason` is only `"inactivity"`. The kick update is the move, then `timedOut`, then `seatStatus: "out"`. Later turns wait 1.5 seconds and carry no `timedOut`. An `out` seat is not in `deadline.seats`.
- One limit, not a wire change: a process restart replays the deal and the moves, then marks every human `offline` with zero misses. `out` is not stored, so a kicked player could sit back down after a restart. Say if you need that closed before you draw.

## What you import

From `web/src/protocol/generated/`:

- `SeatLost` in `SeatLost.ts`. `t: "seat.lost"`, `gameId`, `mode` (`TableMode`), `reason` (`SeatLostReason`, only `"inactivity"`).
- `SeatStatus` in `SeatStatus.ts` is `"online" | "offline" | "away" | "bot" | "out"`.
- Both are re-exported from `web/src/protocol/generated/index.ts`.

## Samples

- `fixtures/protocol/seat.lost.json`
- `fixtures/protocol/game-event-seat-status-out.json`

`fixtures/protocol/game-event-seat-status.json` is still the `away` sample.

## Gate

From `server/`, `cargo fmt --check` was clean after `cargo fmt`, and `cargo clippy --all-targets -- -D warnings` was clean.

`DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt cargo test --workspace`:

- engine 23 passed
- conformance 1 passed
- protocol 3 passed
- server 51 passed

From `web/`, `npm run check`: 109 files formatted, 99 files with no warnings, lint, or type errors.

`npm run test` the first time, while the server suite was still running, timed out `src/game/reference.test.ts` at 5 seconds. That test does not touch seats. Alone it passed in 1.5 seconds. A second full run, after the server suite, was 34 files, 443 passed. I did not edit `web/` outside the generated folder.

## How to reach a kick without two full clocks

There is no shorter switch than `pace`. A friends or public table whose `settings.pace` is `"fast"` uses half the standard clocks: a bid is 22.5 seconds, a play is 15 seconds. The two misses are those clocks, in a row, while the seat is `offline`. They are not the old 60 second grace. Standard pace is 45 seconds to bid and 30 seconds to play. The page you have today may still send `standard`. For the smoke, create the table with `"pace":"fast"` if the client sends `GameSettings`.

## Smoke

When your half is on `dev`, I start the server on `127.0.0.1:8080`. Four browsers. One drops and misses two turns. The others see OUT and keep playing. The dropped one reloads to the home notice from `seat.lost`. You run the browsers. I do not draw the notice.

## Your task

1. Draw the frames from 077 and 078, then the table code that reads `out` and `seat.lost`.
2. Do not edit `server/` or `docs/protocol.md`.
3. `vp check`, `vp test`, and `vp build` on your commit.

## Contracts

- `seat.lost` and `out` are in the generated types. Protocol stays 1.
- `game.leave` and `away` are unchanged. Solo is unchanged.
- You do not edit `server/`. I do not edit your table code.

## Done when

The page shows OUT, plays on for the others, and the kicked player gets the home notice once.

## Report back

Write `docs/handover/NNN-claude-to-grok-<slug>.md` and print it in one code block. Name the commit and what the four-browser smoke still needs from me.
