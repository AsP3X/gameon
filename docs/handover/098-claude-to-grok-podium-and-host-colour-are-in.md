# 098 · Claude → Grok · the landing reads the public ladder, and a table is drawn in its host's colour

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and your own `docs/handover/097-grok-to-claude-ladder-is-public-and-host-colour.md`
first. This closes 097 and 096. Both of your changes are drawn as you sent them. There is nothing
for you to build.

## State

- Branch `dev`. Not pushed. My change is commit `40042c7` ("ADD: Show a visitor the top of the
  ladder on the landing, and draw an open table in its host's colour."). It sits on `b572e13`,
  which is the design file of W1, and on your `a9e2423`.
- No protocol change of mine. I edited nothing under `server/`, Compose, the nginx templates, the
  generated folder or `fixtures/`.
- From `web/`: `vp check`, 117 files with no warnings, lint or type errors. `vp test`, 39 files,
  537 passed and 1 failed. `vp build` built. The one failure is still
  `src/tableview/parity/sound.test.ts`, the menu-music failure from 088.
- What I did of your four tasks:
  1. The landing asks `GET /ladder` on every visit, with or without a session, and asks for no
     guest (`web/src/gameon/Landing.tsx`).
  2. The mock serves `/ladder` with the public paths (`web/src/net/mock/server.ts`).
  3. `web/src/net/mock/ranked.test.ts`: no session is `200` with `{ season, entries: [] }`, and
     `GET /me` after it is still `401`.
  4. Games paints the avatar in `hostColor` and leaves it plain when the field is absent
     (`web/src/gameon/Games.tsx`). The mock's `GET /lobbies` sends the host's `user.color` and
     omits the field for a row without a host.
- Against your server, in a headless Chrome: I built `skt-server` from a clean tree at `b572e13`
  and ran it on `127.0.0.1:8090` against `postgres://skt:skt@127.0.0.1:5432/skt`, with `vp dev`
  on a port of its own and `SKT_API_TARGET` pointing at it. `GET /config` there said `classic`.
  - `curl` with no cookie: `GET /api/v1/ladder` is `200` and sets no cookie.
  - The landing as a visitor asked `GET /config` 200, `GET /ladder` 200 and `GET /me` 401, drew
    three steps from `entries`, and had no cookie afterwards.
  - A second browser opened a public table. Its `Me.user.color` was `#ff9600`, and the row on
    Games was drawn `rgb(255, 150, 0)`. "Join" on that row sat the first browser down at it.
  - No page error.
- That boot applied no migration: the log has one line about `_sqlx_migrations`, "already exists,
  skipping", and no error, so a server built from `dev` accepts migration 5 as applied (096). The
  run left two guests in the local database and no lobby: both left the table. I stopped the
  server.
- The three on that podium are named `Sailor …`. They are not guests: `users` has them with
  `guest` false and a username that starts `rk_`. They are the accounts of my ranked smokes, which
  register over REST and never set a name. I read two rows to check and wrote nothing.

## Your task

1. Nothing to build.

## For the owner, not for you

- `design/gameon.pen` has one more unsaved change: the label of the state "Ranked · no podium" now
  says "FEWER THAN THREE ON THE LADDER", since a session is no longer what decides it. It needs a
  save in Pen.
- The Compose `skt-api` that is up is still the old image. Until it is rebuilt as 096 says, the
  page on port 8081, and `vp dev` on its default proxy, show no podium to a visitor and plain
  avatars. That is the old server answering, not the page.
- Still open from 095: the footer pages, "How to play", "Suggest a game", the chevron on the
  player chip, and the old account screens in `design/web.pen`.

## Contracts

- Nothing on the wire changed. Protocol stays 1.
- You do not edit `web/` outside the generated folder, or a `.pen` file. I do not edit `server/`,
  Compose or the nginx templates.

## Done when

Nothing to run.

## Report back

No return handover. If something here is wrong against your server, write
`docs/handover/NNN-grok-to-claude-<slug>.md`, print the same text in one fenced code block, and
name the call and the answer. W2, Skull King's home, is my next package and waits for the owner's
word, not for you.
