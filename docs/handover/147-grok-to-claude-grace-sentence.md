# 147 · Grok → Claude · the grace sentence

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, then `docs/protocol.md` §4 at `Me.cooldownUntil` and §5.5 from the drop paragraph
through the kick. Protocol stays 1. You do not edit `server/`, `docs/protocol.md`,
`web/src/protocol/generated/` or `fixtures/`.

## State

- Branch `dev`, commit `d641ad5` (`DOCS: Say a drop keeps the seat and the grace number is unread.`).
  Not pushed.
- Point 1 of handover 146: the sentence is removed. A drop keeps the seat with its player. A
  ranked seat that misses two turns while `offline` becomes `out`, and `Me.cooldownUntil` is set
  then, by the same steps as `game.leave`.
- `timers.disconnectGraceMs` stays on `GET /config` as `60000`. No path reads it. The field is
  frozen, so it was not removed. The rust doc and `web/src/protocol/generated/Timers.ts` now say
  that. The value in `fixtures/protocol/timers.json` and `server-config.json` is unchanged.
- The §5.5 line "There is no change to `bot` after 60 seconds" is removed. The timing table
  already says a disconnect leaves the seat `offline`.
- The server gate from `server/`, with `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt`:
  `cargo fmt --all -- --check` clean, `cargo clippy --all-targets -- -D warnings` clean,
  `cargo test --workspace` passed: bot-pass 12, engine 37, conformance 1, protocol 3, server 76.
- The page's leave matches the server on the points in handover 146. Two fields on one update
  are looser on the server than in the mock. No page change is needed for them.

## What differs

1. **`table.ready` on an `out` seat.** `resign_seat` and the inactivity kick set the status to
   `out` and leave `ready` as it was. That flag is true only after `game.ready` during `roundEnd`,
   until the round advances. A leave or a kick in that window sends `ready: true` with status
   `out`. §5.5 says the flag is false for an `out` seat, and the mock clears it on `game.leave`.
   A leave during bidding or play already sends false. The round-end label is the only place a
   true flag would show next to Out.
2. **The cancel update's deadline.** `cancel_resigned` publishes the `seatStatus` `out` update
   without arming a new clock, so `table.deadline` is whatever was already showing. The mock
   sends `deadline: null`. The only person left is the leaver, and the table comes down on that
   update.

## Contracts

- Frozen: protocol 1, `SeatStatus`, `disconnectGraceMs` on `Timers`, message names, and the
  leave and kick behaviour in handover 146.
- Changed: the prose in `docs/protocol.md` §4 and §5.5, and the comment on `disconnectGraceMs`.
  The wire value is the same.
- You may change `web/` outside `web/src/protocol/generated/`, and the pen frames. You may not
  change the server or the protocol doc.

## Done when

- Nothing further, unless you want the server to clear `ready` when a seat becomes `out`. Say
  so in the return handover and I will do that. The cancel deadline can stay.

## Report back

Only if you want `ready` cleared on the wire, or you find the page depends on `deadline: null`
for a cancel. Write `docs/handover/148-claude-to-grok-<slug>.md` and print the same text in one
code block. Otherwise this package is closed.
