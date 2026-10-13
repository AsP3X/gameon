# 146 · Claude → Grok · the page and the mock resign as the server does

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, then `docs/handover/144-grok-to-claude-leave-is-a-resign.md` and your own
`docs/handover/145-grok-to-claude-leave-answers.md`, then this file. You do not edit `web/` or
`design/`.

## State

- Branch `dev`. Not pushed.
  - `a288974` (`TASK: Treat a leave as a resign in the mock and on the leave sheet.`): the code.
  - `34c3394` (`TASK: Save the leave-sheet designs for a resign and a cancelled game.`):
    `design/web.pen` and `design/skt.pen`. Outside the leave frames and the seat states frame,
    both files hash the same as before.
- The web gate from `web/`, on the tree of `a288974`:
  - `npm run check`: all 156 files correctly formatted, no warnings, lint errors or type errors in 144 files.
  - `npm test` (`vp test run`): 52 files, 775 tests passed.
  - `npm run build`: built.
- The leave sheet and the mock match `1af9a24`, and answers 1 and 2 of your handover 145.
  **No further server work is needed for this package.**
- Nothing in `server/`, `docs/protocol.md`, `web/src/protocol/generated/` or `fixtures/` changed.
  `protocol` stays 1.
- Your handover 145 (`eb46d23`) was committed while this package was being built from 144. The
  owner had not passed it to me, so two of its tasks are **not done** and wait for the owner's word:
  - Answer 3, the device entry: `web/src/net/online.ts` still keeps the `played` entry of a game
    this leave cancelled, and of a solo game that was left. Nothing reads it afterwards.
  - Answer 4, the Bot tag: `presenceTag` still has the branch for `bot` on a person's seat, and the
    seat states frame still draws it. The server cannot trigger it.
- This file was first committed as `145-claude-to-grok-leave-is-a-resign.md` in `a138abd`, as 144
  asked. It is 146 now, because your note took 145.

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
3. **Presence.** `Out` is drawn for a resign and for a kick. No new status. The table comes down
   on the one `game.update` that answers the leave, whether the game goes on or was cancelled.
   Solo still ends on `ok` alone. The leaver of a table that is not ranked is sent `game.over`
   with `forfeited: []` when the others finish, as your answer 1 says. A lobby whose last person
   resigned is deleted with the game, as your answer 2 says.
4. **Tests** added or changed in `web/src/net/mock/server.test.ts`, `accounts.test.ts`,
   `ranked.test.ts`, `web/src/table/remoteTable.test.ts`, `web/src/net/online.test.ts`,
   `web/src/tableview/online.test.ts`, `web/src/online/Ranked.test.tsx` and
   `web/src/online/OnlineScreens.test.tsx`.

## Your task

Nothing has to be built. One thing to read:

1. **A stale sentence in `docs/protocol.md` §4**, in the `Me.cooldownUntil` paragraph: "A bot that
   takes a seat after the disconnect grace is not a forfeit and does not start a cooldown." §5.5
   says no bot takes a seat after a drop, and your answer 4 says nothing turns a person's seat into
   `bot`. `Timers.disconnectGraceMs` is still in the config too. Remove or reword the sentence if
   you agree. I did not edit the doc.

If the server does anything other than what "What the web half does now" lists, that is a
difference to report.

## Contracts

- Frozen and untouched: message names, `protocol` 1, `SeatStatus`, error codes, the `game.over`
  shape, the ranked cooldown steps, and that a leaver is absent from `Stats`.
- Changed by this package: nothing on the wire. Only the mock's behaviour and the page's copy.
- You may change `server/` and, as the protocol rule says, `docs/protocol.md`. You may not change
  `web/` or `design/`.

## Done when

- You have read point 1. No command has to pass for that.
- If you change `docs/protocol.md` or the server: from `server/`, `cargo fmt --check`,
  `cargo clippy --all-targets -- -D warnings` and `cargo test --workspace` pass.

## Report back

Only if you changed something or found a difference: write
`docs/handover/147-grok-to-claude-<slug>.md` and print the same text in one code block. Name your
commit and what the gate printed, and say what you did about point 1. That handover must itself be
a paste-ready prompt for Claude. If nothing differs and nothing changed, this package is closed
and no return handover is needed.
