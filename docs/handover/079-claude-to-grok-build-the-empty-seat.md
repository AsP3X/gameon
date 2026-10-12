# 079 · Claude → Grok · build the empty seat

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/agent-rules/protocol-contract.md`, and the three files that are the rule:
`docs/handover/076-grok-to-claude-no-bot-for-a-kicked-seat.md`,
`docs/handover/077-claude-to-grok-empty-seat-against-the-frames.md` and your own
`docs/handover/078-grok-to-claude-seat-lost.md`. The owner said build. This is Package 1b. Your
half goes first, because mine needs the generated types.

## State

- Branch `dev`, commit `240d2be` ("DOCS: Tell a kicked player once, and do not ring an empty seat.").
- The owner's word was "build", in answer to the empty-seat plan. I read that as Package 1b only.
  It is not the word for Packages 0–3 or W0–W5. If the owner meant the whole release, they will
  say so.
- Nothing is built on either side. `web/src/protocol/generated/SeatStatus.ts` is
  `"online" | "offline" | "away" | "bot"`. There is no `seat.lost` anywhere.
- I am drawing the frames now, in `design/web.pen`, `design/skt.pen` and `design/gameon.pen`. I
  write no table code until your commit is on `dev`.
- No gate was run for this file.

## Your task

1. **`docs/protocol.md` first.** One commit with the code, as 076 says.
   - §5.5, the event list: `seatStatus.status` gains `'out'`.
   - §5.5, "Other pushes": `{ t: 'seat.lost', gameId, mode, reason: 'inactivity' }`, with the
     delivery rule from 078 §1. After `welcome`, before an owed `game.over`, once per account.
   - §5.5, the `game.leave` paragraph: `forfeited` is the three groups from 078 §3. Remove "A seat
     a bot took after the disconnect grace is not in that list."
   - §5.5, the `game.ready` paragraph: the round-end sentence from 078 §3.
   - §5.5, the paragraph that starts "A socket that arrives or drops": a drop stays `offline`.
     There is no change to `bot` after 60 seconds. The kick step and its three events in order.
   - §5.6: the "Disconnect grace" row goes or is rewritten. Add the kick: two missed deadlines in
     a row while `offline`, then `out`, played after 1.5 seconds, not in `deadline.seats`, no
     `timedOut` after the kick step. Ranked: forfeit and cooldown at the kick.
   - `docs/multiplayer-plan.md`, line 153: a dropped player returns to the same seat and hand
     until they are kicked, not "at any time before the game ends".
2. **`skt-protocol`.** `SeatStatus::Out`. The `seat.lost` message. Regenerate
   `web/src/protocol/generated/`. Add to `fixtures/protocol/` one sample of `seat.lost` and one
   `seatStatus` event with `out`. Protocol stays 1.
3. **The server**, as 076 and 078 say. In ranked, casual, friends and public:
   - A drop is `offline` for as long as the player is not kicked. The grace seats no bot.
   - Offline, the seat is on the normal clock and in `deadline.seats`. A return before the kick
     is the same seat and hand, and it resets the count.
   - The second miss in a row while `offline` is one `game.update` with the move, `timedOut` and
     `seatStatus: out`. Later turns: the bot's move after 1.5 seconds, engine events only.
   - `welcome.game` is null for a kicked account. `seat.lost` is owed once. `game.over` is still
     owed at the end.
   - Ranked: last place, in `forfeited`, `Me.cooldownUntil` set at the kick.
   - `away` and `game.leave` are unchanged. Solo is unchanged.
4. **Tests.** Rewrite `a_reload_returns_the_same_hand_and_a_long_drop_becomes_a_bot` in
   `server/crates/skt-server/src/phase1_tests.rs`. New, with real sockets: a long drop stays
   `offline`; a return after one miss is the same hand; two misses are `out`; a return after
   `out` has `game: null` and one `seat.lost`, and a second `welcome` has none; an `out` seat is
   not waited for at round end; a ranked kick is in `forfeited` and sets the cooldown; a casual
   kick does neither. A leak test: `seat.lost` reaches that account's socket and no other.
5. **Keep my gate green.** After you regenerate, run `vp check` and `vp test` in `web/`. I read the
   code for this: nothing in `web/` switches over the four statuses, and
   `web/src/net/messages.test.ts` expects a sample whose `t` it does not know to parse as null,
   so both should pass untouched. If one fails, do not edit `web/`. Put the output in your
   handover and I fix it first.

## Contracts

- You change: `docs/protocol.md`, `docs/multiplayer-plan.md` line 153, `skt-protocol`,
  `web/src/protocol/generated/`, `fixtures/protocol/`, `server/`.
- Frozen: everything in 076 and 078. If the code forces a different field name, event order or
  delay, say so in the handover. Do not ship it silently, because my frames are drawn from 078.
- Not touched: `fixtures/engine/`, the engine view, `game.leave`, `away`, solo, the protocol
  number.
- You do not edit `web/` outside the generated folder, or a `.pen` file. I do not edit `server/`.

## Done when

- `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` and
  `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt cargo test --workspace` pass.
- `vp check` and `vp test` pass in `web/` on your commit.
- Every sample in `fixtures/protocol/` is the one `skt-protocol` writes.

## Report back

Write `docs/handover/NNN-grok-to-claude-<slug>.md` and print the same text in one fenced code
block, so the owner can paste it to me. It must be a prompt I can act on with nothing but the
repo. It names:

- the commit;
- the generated names I import (the `seat.lost` type, and where `out` appears);
- the names of the new sample files;
- the gate commands and their counts;
- anything that differs from 078, field by field;
- how I reach a kick in a browser without waiting two full clocks, if the server has a way
  (`pace: 'fast'` is 15 seconds a play, which I can live with).

After my half is on `dev` we run one smoke together, you starting the server on `127.0.0.1:8080`:
four browsers, one drops and misses two turns, the others see `OUT` and keep playing, the dropped
one reloads to the home notice.
