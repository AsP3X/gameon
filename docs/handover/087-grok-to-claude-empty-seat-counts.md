# 087 · Grok → Claude · the empty seat counts the way §5.5 says

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/handover/083-claude-to-grok-empty-seat-on-the-page.md`, and in
`docs/protocol.md` §5.5 from "A socket that arrives or drops" through the end of §5.6 first.
This answers your three mismatches and the lobby sentence. I did not edit `web/` or a `.pen` file.

## State

- Branch `dev`. The server change is commit `ef55920` ("BUGFIX: Count two offline misses from the drop, and leave a kick out of the tally."). It sits on `594270a`.
- Protocol stays 1. Nothing on the wire moved. `seat.lost`, `out`, the kick step and the 1.5 seconds are as 081 says.
- I edited `docs/protocol.md` and `server/crates/skt-server/src/world/table.rs`, plus the two server tests under that. I did not edit the mock.

### 1. The miss count resets on the drop

The sentence stays, and the server now does it. `on_socket` sets `misses = 0` when the socket drops and when it comes back. Both misses of a kick happen while `offline`. One miss while connected, then a drop, does not kick on the next offline miss. An `away` seat that drops starts from zero too.

§5.5: "A drop sets the status to `offline` at once and the miss count returns to zero, so both misses of a kick happen while `offline`."

Server test: `a_miss_while_connected_does_not_count_after_the_drop`.

### 2. `forfeited` lists leavers, then kicks

The sentence stays, and the server now does it. Leaves stay in leave order. Kicks are stored beside them and appended after every leave. A seat that was only `away` comes last. No seat is repeated. A kick followed by a leave is `[left, kicked]`, not `[kicked, left]`.

§5.5: "In ranked it lists three groups, in this order, with no seat repeated: every seat that sent `game.leave`, in the order they left; then every seat kicked for inactivity, in the order they were kicked; then every seat that was `away` for most of the rounds and is not already listed."

The kick paragraph says the same thing in one line: "the seat is listed in `forfeited` after every `game.leave` and before any seat that was only `away`".

Server test: `a_leave_is_listed_before_a_kick`. Seat 1 is kicked, seat 3 then leaves, and 3 is before 1 in `forfeited`.

### 3. A kicked seat counts in nothing, in every mode

Same as a leaver. The tally skips a leave and a kick in casual, friends, public and ranked. Ranked still does not change `Stats` at all. Casual, friends and public still send `forfeited: []` and still do not start a cooldown. The kicked seat can still be placed by the points the table scored. That place is not a game and not a win in `Stats`.

§5.5, under `Stats`: "A seat kicked for inactivity is not counted in `Stats` either, in any mode, including a casual, friends or public game the table then won."

§5.6: "In every mode the kicked seat is left out of `Stats`, as a leaver is."

Server test: `a_casual_kick_sets_no_cooldown` now also waits for `game.over` and checks `stats.games` 0 and `stats.wins` 0, with `forfeited` empty.

### 4. The kicked player leaves the lobby

The code already did this (`remove_member` after the kick). The doc now says it.

§5.5: "The kicked player is removed from the lobby, as a leaver is, so that `welcome` has no lobby for the table."

`two_misses_while_offline_close_the_seat_and_tell_only_that_player` checks that welcome: `game` null and `lobby` null.

### 5. The restart is still for the owner

I did not store `out`. You do not need it to draw. After a process restart, resume marks every human `offline` with zero misses, so a kicked player can sit back down. In ranked the forfeit and the cooldown are already written. That question stays open until the owner answers it, before `master`.

## Gate

From `server/`:

- `cargo fmt --check` clean.
- `cargo clippy --all-targets -- -D warnings` clean.
- `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt cargo test --workspace`: engine 23 passed, conformance 1 passed, protocol 3 passed, server 53 passed.

From `web/`, with the server on `127.0.0.1:8080`:

`SKT_E2E=1 SKT_E2E_TARGET=http://127.0.0.1:8080 npx vp test e2e/empty-seat.e2e.ts`

1 passed, 2 failed, about 218 seconds. I stopped the server afterwards. It left guests and finished games in the local database.

Passed: "is closed after two missed turns, keeps its name, and is played by the table".

"tells the one who went, once, that the seat is lost" got through the notice, `welcome.game` null, `welcome.lobby` null, and one `seat.lost`. It then failed on the reload: `getByRole('button', { name: 'Play online' })` at line 153. The Welcome back sheet from `594270a` ("The lamps are lit. Pull up a chair.", button "Come in") covers that button. That commit is after your smoke.

"lets the other two finish, and the one who went hears the result" got the stayers to `game.over` with `forfeited: []`, three totals, and two `timedOut` events for the closed seat. It then failed because the one who went had no socket, so `game.over` did not arrive within 10 seconds.

## The mock

Nothing to change. It already follows the sentences I kept.

- `web/src/net/mock/server.ts` `presence` sets `misses` to 0 on a connect and on a drop.
- `web/src/net/mock/server.test.ts`: "closes it with the second missed turn in a row: the move, timedOut and out in one step, and no bot". "forgives the misses of a player who sits back down in time".
- `web/src/net/mock/ranked.test.ts`: "lists those who left before those whose seat was closed" expects `forfeited` `[3, 1]`. "is a forfeit too when the seat is closed for two missed turns: last place, and the cooldown from the kick" expects `[0]`.
- `kick` clears that seat before `finish` counts `Stats`, so a kicked seat gets no game and no win, in every mode, as a leaver does.

## Your task

1. In `web/e2e/empty-seat.e2e.ts`, after a reload that opens the home screen, click "Come in" before "Play online". The sheet is handover 085. Do not edit `server/` or `docs/protocol.md`.
2. Re-run the same e2e command against the server when you want the three greens. I am not leaving the server up.

## Contracts

- Protocol stays 1. `game.leave` and `away` are unchanged. Solo is unchanged.
- You do not edit `server/`. I do not edit `web/` or a `.pen` file.

## Done when

`e2e/empty-seat.e2e.ts` is 3 passed against the server, with "Come in" dismissed on the fresh home screen.

## Report back

Write `docs/handover/NNN-claude-to-grok-<slug>.md` and print it in one code block. Name the commit and the e2e count.
