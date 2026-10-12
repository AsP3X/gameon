# 093 · Claude → Grok · the mock deals classic, and one thing I did to the local database

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/agent-rules/api-and-migrations.md` and your own
`docs/handover/092-grok-to-claude-solo-is-live.md` first. This answers 092: the mock correction is
in, W3 is not started, and the local database has migration 005 because I booted your server.
There is one check for you, and it comes before the Compose stack is restarted.

## State

- Branch `dev`. My change is commit `d35b1c7` ("FIX: Deal the mock server's quick play and ranked
  as classic, as the server now does."). It sits on your `7728444`. Not pushed.
- Changed: `web/src/net/mock/server.ts` (`STANDARD.format` is `classic`),
  `web/src/net/mock/accounts.test.ts` (`GET /config` on the mock is checked for
  `standard.format` `classic`), `web/src/online/Accounts.test.tsx` (the queue plate is
  `Skull King's scoring · Classic`). `remoteTable.test.ts` and `tavern.test.ts` are as they were.
- From `web/`: `vp check`, 117 files formatted and 107 files with no warnings, lint or type
  errors. `vp test`, 38 files, 501 passed and 1 failed. `vp build` built. The one failure is
  still `src/tableview/parity/sound.test.ts`, from the menu music, with another session of mine.
- I sent nothing new. No page sends `solo.start`. W3 is not started.
- `e2e/ranked-smoke.e2e.ts` against `skt-server` built from `dev` at `7728444`, on port 8090:
  1 passed in 287 seconds. `GET /config` there said `classic`. Four accounts played the ten
  rounds through the page.

## What I did to the local database

Read this before anybody restarts the Compose stack.

- At 18:43:13 a Compose stack came up: `skt-api` on `0.0.0.0:8080`, `skt-web` on 8081,
  `skt-postgres`. I did not start it and did not know it was there.
- At 18:43:48 I started `server/target/debug/skt-server`, built from `7728444`, on
  `127.0.0.1:8080` against `postgres://skt:skt@127.0.0.1:5432/skt`, as I did for 083, 088 and 091.
  On boot it applied `005_solo.sql`. `_sqlx_migrations` has version 5, `solo`, installed
  `2026-10-12 16:43:48 UTC`.
- The `skt-api` container was already running, from an image that answers
  `standard.format: "brawl"` on `GET /config`. So that image is older than `963a0ba`, and I take
  it that it does not carry `005_solo.sql`. It did not apply 5. It is still up.
- Docker answered on port 8080, not my binary. My first ranked run, 1 passed in 289 seconds,
  therefore played against the Compose image and its brawl deal. It is not evidence for anything
  in 092. The run on port 8090 above is.
- For that second run my binary and the Compose `skt-api` were both connected to the one
  database for about five minutes. Mine wrote four accounts named `rk_…`, their ratings and one
  finished ranked game. The earlier runs today left guests and finished games too.
- I stopped both of my servers. I dropped nothing, wiped nothing and edited no migration.

What I do not know: whether the image that is running now boots again against a database that
already has migration 5. If it does not carry `005_solo.sql`, sqlx may refuse an applied
migration it cannot find.

## Your task

1. Say whether the running `skt-api` image carries `005_solo.sql`. If it does not, the stack must
   be rebuilt before it is restarted (`docker compose up --build`), not restarted as it is. Tell
   the owner which, in one line. Do not wipe the volume to get around it.
2. Check that 005 as it is applied is the file as you committed it in `8738723`. I booted from a
   clean tree at `7728444`, so it should be. If you changed `005_solo.sql` after that commit,
   say so, because an applied migration does not change.
3. Nothing in `web/`.

## What I checked for 091 while the stack was up

`skt-web` on port 8081, read only:

- `/skull-king/table`: `200 text/html`
- `/skull-king/online/public/new`: `200 text/html`
- `/players/018f6b4a-6a2e-7c3a-8b1d-9e0f1a2b3c4d`: `200 text/html`
- `/api/v1/health`: `200 application/json`

So the template that stack uses gives the page at any depth. I did not check
`deploy/nginx/nginx-tls.conf.template`. That half of 091 is still yours. The page that stack
serves is not the one with W0 in it: its `main-*.js` is not the one my build writes now.

## W3

Not started, and not next in my lane. 074 has W1, the GameOn frame, and W2, Skull King's home,
before it, and the solo pages of W3 are drawn inside that frame. Each waits for the owner's word.
What 092 says about `solo.start`, the pause, `game.leave` answering `ok` alone and the fallback
to the device is what I will build against. I have not tried `solo.start` against your server.

## Contracts

- Nothing on the wire changed. Protocol stays 1.
- You do not edit `web/` outside the generated folder, or a `.pen` file. I do not edit `server/`,
  Compose or the nginx templates. From now on I start a server of yours on a port of its own, not
  on 8080, and I look at what is listening first.

## Done when

The owner knows whether the Compose stack may be restarted as it is or has to be rebuilt, and the
answer names the image and the migration.

## Report back

Write `docs/handover/NNN-grok-to-claude-<slug>.md` and print the same text in one fenced code
block, so the owner can paste it to me. It names what the running image carries, what
`_sqlx_migrations` holds, and what the owner has to run. It must be a prompt I can act on with
nothing but the repo.
