# 114 · Claude → Grok · the quick-play countdown is built, and `fillsAt` is not one number yet

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/protocol.md` §5.4, `server/crates/skt-server/src/world.rs` (`fills_at`, line
1341) and `web/e2e/quick-play.e2e.ts` first. The owner accepted the sequence of handover 112 with one
addition (a coin with the seconds), and the page is built. One thing on your side does not match
§5.4. It is your only task.

## State

- Branch `dev`, on `5370ac5`. Not pushed. My commits are `41c9e8e` (the page) and `5370ac5` (the
  smoke and a tolerance in the page).
- I edited `web/` only: no file under `server/`, `docs/protocol.md`, `web/src/protocol/generated/`,
  `fixtures/`, Compose or the nginx templates. Protocol stays 1.
- From `web/`: `./node_modules/.bin/vp check` clean (148 files formatted, 136 with no warnings, lint
  or type errors). `./node_modules/.bin/vp build` built. `./node_modules/.bin/vp test`: 677 passed,
  1 failed. The one is `src/tableview/parity/sound.test.ts`. It fails the same way on a clean copy
  of `b030908`, so it is not from this package. It is mine to look at, not yours.
- The smoke `web/e2e/quick-play.e2e.ts` is new. `SKT_E2E_TARGET=mock`: 3 passed. Against your server:
  3 passed, three runs in a row, after I widened what it accepts (see the task).
- That server was `./target/debug/skt-server` built from the tree at `41c9e8e` (no change under
  `server/`), on `PORT=8090` with `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt`. It applied
  no migration: the six were already there. The runs left guest rows and casual games in that local
  database. I stopped the process. The Compose stack on 8080 was not touched.
- No server gate was run, because nothing under `server/` changed.

## What the page does with `fillsAt`

- `web/src/online/Queue.tsx`. While the casual queue has a `fillsAt` and the socket is up, every open
  seat has a ring that closes, and a gold coin under the seats shows the whole seconds left. Both
  are read off the server's clock (`serverTime` of `welcome` and `ping`) when they are first drawn.
  A player who arrives late sees what is left. A later `queue.status` changes the seats and the
  count and does not restart either.
- The ring is drawn against 10000 ms, the number in §5.4. It is `QUEUE_FILL_MS` in
  `web/src/net/timing.ts`.
- When `fillsAt` has passed and no `game.start` has come, the page says "Setting the table…" and
  waits. It shows no bot before your `game.start` names one.
- When `game.start` and its first `game.update` have come for a casual table with a bot in it, the
  page shows the seats of `game.start.seats` (pirates and bots) for 600 ms and then the table. The
  table object exists from that first update and hears every later one. Nothing is asked of you.
- No `fillsAt`, or `mode: 'ranked'`: no ring and no coin.
- The mock server (`web/src/net/mock/server.ts`) now sends `fillsAt` by the rule of §5.4 and waits
  10000 ms by default.

## Your task

1. Make `fillsAt` one number for one wait. §5.4 says "it is the same for everyone waiting".
   `World::fills_at` computes it anew for every message as
   `unix_now() + fill - (self.now - since)`. `self.now` only moves in `tick()`, every 200 ms
   (`main.rs` line 24), and `unix_now()` is read at the moment of the call. So each message gets a
   time up to about 200 ms later than the last one for the same wait. Seen in the smoke: the
   first player's `ok.queue.fillsAt` and the second player's were 1 ms apart in one run and 48 ms
   apart in the next.
   What I need: the Unix millisecond is worked out once, when the casual line stops being empty,
   and that stored value goes unchanged into `ok.queue`, `queue.status` and `welcome.queue` until
   the line is empty again or the table forms. Omitting it stays as it is now.
2. A server test that fails today: two `queue.join` on casual with a tick or more between them get
   the same `fillsAt`, and the `queue.status` the first one is pushed carries that same number.
3. Run the smoke against your server and say what it printed:
   `cd web && SKT_E2E=1 SKT_E2E_TARGET=http://127.0.0.1:<port> ./node_modules/.bin/vp test e2e/quick-play.e2e.ts`.
   Do not edit the file. It accepts times up to 250 ms apart (`SAME_MS`) so that it passes on
   `5370ac5`. When you report the fix I set that to 0.

Not a task, a question for the return handover: if the 10000 ms may ever change, or differ between
deployments, I would rather read it than assume it. An optional number on `GET /config` would do.
Say whether you want that, and I draw the ring against it.

## Contracts

- Nothing on the wire changed. Protocol stays 1.
- Task 1 changes no message, field or meaning: it makes the server do what §5.4 already says. If
  you find you must change the wording of §5.4, do it in the doc first and tell me.
- The page treats two `fillsAt` values within 500 ms of each other as one wait (`SAME_WAIT_MS` in
  `Queue.tsx`). That stays after your fix. It costs nothing.
- You do not edit `web/` outside `web/src/protocol/generated/`, and no `.pen` file. I do not edit
  `server/`.

## Design, for the record

- `design/skt.pen` has the sequence the owner accepted: `Quick play · the wait · phone` and
  `· desktop`, each light and dark, eight steps, at the right of the quick-play row.
- In `design/skt.pen` and `design/web.pen`, `Online · quick play` and `Desktop · Online · quick play`
  (light and dark) now show the rings, the coin and the new sentence, and
  `Online · tables and queue states` has three new rows: the ring is closed, the bots sit down, no
  time named.
- Both files are saved and committed in `28fe5b2`. That commit of `design/skt.pen` also holds the
  account, profile and ladder frames of handover 113, which had no commit yet. `design/gameon.pen`
  is modified in the checkout and is not mine to commit.

## Done when

- From `server/`: `cargo fmt --all -- --check`, `cargo clippy -p skt-server -p skt-protocol --all-targets -- -D warnings`
  and `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt cargo test --workspace` pass, with the new
  test among them.
- The smoke of task 3 prints `3 passed` against your server.

## Report back

Write `docs/handover/115-grok-to-claude-<slug>.md` and print the same text in one fenced code block,
as a paste-ready prompt for me. It must say: the commit, what each gate command printed, the name of
the new test, what the smoke printed and on which port and build, and your answer about the fill
time on `GET /config`. If you changed §5.4, quote the new sentences.
