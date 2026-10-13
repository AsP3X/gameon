# 145 · Claude → Grok · the page and the mock resign as the server does

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, then `docs/handover/144-grok-to-claude-leave-is-a-resign.md`, then this file.
You do not edit `web/` or `design/`.

## State

- Branch `dev`, commit `a288974` (`TASK: Treat a leave as a resign in the mock and on the leave sheet.`),
  on top of your `1af9a24` and `7be5fcd`. Not pushed.
- The web gate from `web/`, on the tree of that commit:
  - `npm run check`: all 156 files correctly formatted, no warnings, lint errors or type errors in 144 files.
  - `npm test` (`vp test run`): 52 files, 775 tests passed.
  - `npm run build`: built.
- The leave sheet and the mock now match `1af9a24`. **No further server work is needed for this package.**
- Nothing in `server/`, `docs/protocol.md`, `web/src/protocol/generated/` or `fixtures/` changed.
  `protocol` stays 1.
- Not on disk yet: the design. The new sheet copy and the last-person frames are in `design/web.pen`
  and `design/skt.pen` inside the running Pen app. They are committed after the owner saves both
  files. No code depends on that commit.

## What the web half does now

1. **Mock** (`web/src/net/mock/server.ts`, `game.leave`).
   - A person still in the game is a seat with a player and status `online`, `offline` or `away`.
     A bot seat and a seat that is `out` do not count.
   - Another person remains: the seat is `out`, no seat becomes `bot`, the leaver is unseated and
     removed from the lobby, and its `ready` flag is false. The table plays the seat 1.5 s after a
     turn reaches it, with the engine's events only, no `timedOut`, and never in `deadline.seats`.
     Ranked forfeits and starts the cooldown at the leave. `game.over` reaches the leaver when the
     game ends, with the seat in `forfeited` in ranked.
   - Nobody else is a person: the game is cancelled. Solo is `ok` and then nothing. Every other
     table is `ok`, then one `game.update` with `rev` + 1, `events: [seatStatus out]` and
     `deadline: null`, then nothing: no further `game.update`, no `game.over`, no stored game, no
     `Stats`, no row in `GET /me/games`. A ranked cancel sets `Me.cooldownUntil` for the last
     leaver, keeps the cooldown of those who left before, and moves nobody's rating. A player who
     left earlier is sent no `game.over` for a cancelled game.
   - A game whose last person is removed by the inactivity kick, not by `game.leave`, is played out
     and its `game.over` is owed, as before. I read `world/table.rs` to check: `cancel_resigned` is
     only reached from the leave. The mock does the same.
2. **Leave sheet** (`web/src/tableview/views.ts`). Four texts. Which one is shown is read from the
   statuses of the last view the server sent. It is display only: the server decides.
   - Others still in: "You resign. The others play on without you, and you can't come back to your
     seat. The game will not be saved to your stats."
   - Last person: "You are the only person left at this table, so the game ends here. It will not
     be saved to your stats."
   - Ranked, others still in: "You resign. That scores last place and starts a cooldown before your
     next ranked game. The others play on without you, and you can't come back to your seat."
   - Ranked, last person: "You are the only person left at this table, so the game ends here with
     no place and no rating change. The cooldown before your next ranked game still starts."
   - Solo is unchanged: "It will not be saved to your stats."
3. **Presence.** `Out` is drawn for a resign and for a kick. No new status. The table comes down on
   the one `game.update` that answers the leave, whether the game goes on or was cancelled. Solo
   still ends on `ok` alone.
4. **Tests** added or changed in `web/src/net/mock/server.test.ts`, `accounts.test.ts`,
   `ranked.test.ts`, `web/src/table/remoteTable.test.ts`, `web/src/net/online.test.ts`,
   `web/src/tableview/online.test.ts`, `web/src/online/Ranked.test.tsx` and
   `web/src/online/OnlineScreens.test.tsx`.

## Your task

Nothing has to be built. Two things to read and answer only if the server differs:

1. **`bot` on a person's seat.** From `world/table.rs` I see `SeatStatus::Bot` only on seats that
   were bots at the deal. The page still draws a `Bot` tag on a seat that started as a person and
   later has status `bot`. If the server never sends that, say so, and I remove the tag and its
   design frame. If any path still sends it, name the path.
2. **A stale sentence in `docs/protocol.md` §4**, in the `Me.cooldownUntil` paragraph: "A bot that
   takes a seat after the disconnect grace is not a forfeit and does not start a cooldown." §5.5
   says no bot takes a seat after a drop. `Timers.disconnectGraceMs` is still in the config too.
   Remove or reword the sentence if you agree. I did not edit the doc.

If the server does anything other than what "What the web half does now" lists, that is a
difference to report.

## Contracts

- Frozen and untouched: message names, `protocol` 1, `SeatStatus`, error codes, the `game.over`
  shape, the ranked cooldown steps, and that a leaver is absent from `Stats`.
- Changed by this package: nothing on the wire. Only the mock's behaviour and the page's copy.
- You may change `server/` and, as the protocol rule says, `docs/protocol.md`. You may not change
  `web/` or `design/`.

## Done when

- You have checked points 1 and 2 against the server. No command has to pass for that.
- If you change `docs/protocol.md` or the server: from `server/`, `cargo fmt --check`,
  `cargo clippy --all-targets -- -D warnings` and `cargo test --workspace` pass.

## Report back

Only if you changed something or found a difference: write
`docs/handover/146-grok-to-claude-<slug>.md` and print the same text in one code block. Name your
commit and what the gate printed, answer point 1 with yes or no, and say what you did about point
2. That handover must itself be a paste-ready prompt for Claude. If nothing differs and nothing
changed, this package is closed and no return handover is needed.
