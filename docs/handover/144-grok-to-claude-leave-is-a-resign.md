# 144 · Grok → Claude · leaving a table is a resign

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, then `docs/protocol.md` §5.5 from `game.leave` through the cancel paragraph,
and the `solo.start` leave sentence in §5.6. Protocol stays 1. You do not edit `server/`,
`docs/protocol.md`, `web/src/protocol/generated/` or `fixtures/`.

## State

- Branch `dev`, commit `1af9a24` (`TASK: Treat a manual leave as a resign and cancel a bots-only table.`).
  Not pushed.
- The server gate from `server/`, with `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt`:
  `cargo fmt --all` applied, `cargo clippy --all-targets -- -D warnings` clean,
  `cargo test --workspace` passed: bot-pass 12, engine 37, conformance 1, protocol 3, server 76.
- No generated TypeScript and no protocol fixture changed. `seatStatus` `out` was already on the wire.
- Not done: the page and the mock still say a bot takes the seat. That is your half.

## Your task

1. **Mock** (`web/src/net/mock/server.ts`, `game.leave`). Follow the server.
   - A human still in the game has status `online`, `offline` or `away`. A started bot, and a seat
     already `out`, do not count.
   - If another human remains: set that seat to `out`, not `bot`. Unseat the leaver. The game
     continues. Later turns of the `out` seat are the same 1.5s play as a kick: engine events only,
     no `timedOut`. Ranked still forfeits and starts the cooldown at the leave. `game.over` still
     arrives when the game ends, and that seat is in `forfeited` with the leavers.
   - If no other human remains: cancel the game. Do not store a result and do not count `Stats`.
     Solo stays `ok` and then nothing. Every other table is `ok` and then one `game.update` whose
     event is `seatStatus` `out`, and then nothing: no further `game.update` and no `game.over`.
     A ranked cancel still sets `Me.cooldownUntil` and does not move a rating.
2. **Leave sheet** (`web/src/tableview/views.ts`). It still says a bot takes the seat. It does not.
   The player resigns. If anyone else is still a person at the table, the others play on and this
   seat is Out. If this player is the only person, the game is cancelled and nothing is saved.
   Ranked still starts the cooldown at the resign. A place and a rating exist only when the game
   is played out, not when it is cancelled.
3. **Presence.** `presenceTag` already draws Out. The comment that `out` means two missed turns is
   now also a resign. Adjust that comment, and any "a bot took it over" copy that a leave still
   triggers. Do not invent a new status.
4. **Tests.** `web/src/net/mock/server.test.ts`, `web/src/table/remoteTable.test.ts`, and the leave
   sheets in `web/src/online/Ranked.test.tsx` and `web/src/net/online.test.ts`. A non-solo leave
   that cancels the game must take the table down on that one `game.update`, the same as a leave
   that leaves other humans in. Solo still ends on `ok` alone.

## Contracts

- Frozen: message names, `protocol` 1, `SeatStatus` (`out` already existed), error codes,
  `game.over` shape, ranked cooldown steps, and the rule that a leaver is absent from `Stats`.
- Changed, in `1af9a24`: `game.leave` no longer seats a bot. Other humans: the seat is `out`.
  Last human: the game is deleted, including a friends, public or casual table that was one person
  plus bots. Solo's `ok`-only answer is unchanged.
- You may change `web/` outside `web/src/protocol/generated/`, and the pen frames for the leave
  sheet if the copy changes there. You may not change the server or the protocol doc.

## Done when

- From `web/`: `npm run check` and `npm test` pass. `npm run build` if you touch a screen.
- A mock game with one human and bots: `game.leave` answers `ok` and one update with
  `"status":"out"`, then the game is gone and `Stats` did not move.
- A mock game with two humans: the leaver's seat is `out`, the other human is still in the game,
  and no seat became `bot` because of the leave.

## Report back

Write `docs/handover/145-claude-to-grok-leave-is-a-resign.md` and print the same text in a code
block. Name your commit, what the web gate printed, and whether the leave sheet and the mock now
match `1af9a24`. If they do, say no further server work. The return handover must itself be a
paste-ready prompt for Grok.
