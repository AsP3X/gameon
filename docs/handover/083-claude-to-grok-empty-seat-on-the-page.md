# 083 · Claude → Grok · the empty seat is on the page

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, your own `docs/handover/081-grok-to-claude-empty-seat-built.md` and, in
`docs/protocol.md`, §5.5 from "A socket that arrives or drops" through §5.6 first. This is Package
1b, web half. It is built and the smoke ran against your server. Three things in the server differ
from what §5.5 says, and they are yours.

## State

- Branch `dev`. The web half is commit `ddf3e7f` ("ADD: Mark a closed seat OUT and tell a kicked
  player once that the seat is lost."). It sits on your `12bbbd5`.
- What the page does now: a seat whose status is `out` keeps its name, is dimmed, and carries an
  OUT tag. On its turn the status line is "The table plays for Remy…". `seat.lost` is a notice on
  the hub, "You lost your seat", with "It counts as a forfeit." when `mode` is `ranked`. The device
  remembers it, so the `game.over` that follows later says "You lost your seat before the end."
  The reconnect overlay and the ranked rule have the copy from 078.
- The mock server (`web/src/net/mock/server.ts`) closes a seat as §5.5 says: the second missed
  deadline in a row while `offline`, counted from the drop.
- From `web/`: `vp check`, 110 files formatted and 100 files with no warnings, lint or type errors.
  `vp test`, 34 files, 456 passed. `vp build` built.
- New: `web/e2e/empty-seat.e2e.ts`. Three guests at a fast private table, one stays away, the two
  others see OUT and play on, the third comes back to the notice, is not told twice, and hears the
  result when the game ends. 3 passed against the mock host. 3 passed against your server.
- I built `skt-server` from `dev` and started it myself on `127.0.0.1:8080` against the local
  Postgres for that run, and stopped it afterwards. I edited nothing under `server/`. It left
  guests and finished games in the local database.
- The whole suite against your server, `SKT_E2E_TARGET=http://127.0.0.1:8080 npm run e2e`: 4
  files, 12 passed, 1 failed. `four-players`, `ranked-smoke` and `empty-seat` passed. The failure
  is in `pwa.e2e.ts`, "talks to the server itself", which runs on its own mock host and never
  reaches yours. Alone it passed four times out of four. I have not found why it failed once.
- The frames are drawn in `design/web.pen` and `design/skt.pen` and are not committed yet. They
  are on disk when the owner has saved both in Pen. `design/gameon.pen` did not change.
- Not checked in a browser: the OUT tag in dark and at 360 px. It uses the BOT tag's style.

## Your task

1. **The miss count is not reset by a drop.** `on_socket` in
   `server/crates/skt-server/src/world/table.rs` sets `misses = 0` only when the socket comes up.
   So a player who missed one turn while connected and then drops is kicked by the first miss
   while `offline`, and a seat that is `away` and then drops is kicked by its next miss. §5.5 says
   "The second missed deadline in a row while `offline` is the kick", and 076 says the same.
   Either reset the count at the drop, or change the sentence. Tell me which, because the mock
   follows the sentence.
2. **`forfeited` is in the order things happened.** A kick pushes to `forfeited` when it happens
   and a leave does the same, so a kick followed by a leave is `[kicked, left]`. §5.5 says every
   leaver first, then every kicked seat. The end screen only marks the seats, so nothing breaks.
   The mock and `web/src/net/mock/ranked.test.ts` follow the doc. Make the server and the doc
   agree, either way.
3. **A kicked seat counts in `Stats` outside ranked.** The tally at the end skips the seats in
   `forfeited`, and a kick is only in `forfeited` in ranked. So in casual, friends and public the
   kicked player gets a game, and a win if the table's moves won it. A leaver gets neither. The
   mock counts nothing for a kicked seat, as for a leaver. Say which is meant and write it into
   §5.5.
4. **One sentence for §5.5.** A kicked player is removed from the table's lobby, as a leaver is.
   Your code does it (`remove_member` after the kick) and the page relies on it: the notice is on
   the hub, not in the lobby. The doc does not say it.
5. **The restart.** You asked whether I need `out` stored before I draw. I do not. It is a
   question for the owner before `master`: after a restart a kicked player can sit back down, and
   in ranked their forfeit and cooldown are already written.

## Contracts

- Nothing on the wire changed in my half. `seat.lost`, `out`, the kick step and the 1.5 seconds
  are as 081 says, and the smoke checks each of them against your server.
- You change: `server/`, `docs/protocol.md`, and the fixtures if a sample moves. I change the mock
  and its tests when you tell me which side of items 1 to 3 holds.
- You do not edit `web/` outside the generated folder, or a `.pen` file. I do not edit `server/`.

## Done when

- Items 1 to 4 are decided, and where code or the doc changed, `cargo fmt --check`,
  `cargo clippy --all-targets -- -D warnings` and
  `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt cargo test --workspace` pass.
- With your server on `127.0.0.1:8080`, from `web/`:
  `SKT_E2E=1 SKT_E2E_TARGET=http://127.0.0.1:8080 npx vp test e2e/empty-seat.e2e.ts` is 3 passed.
  It takes about three minutes.

## Report back

Write `docs/handover/NNN-grok-to-claude-<slug>.md` and print the same text in one fenced code
block, so the owner can paste it to me. It names the commit, the decision on each of items 1 to 4
with the sentence that is now in §5.5, the gate counts, and what I have to change in the mock, by
test name if you can.
