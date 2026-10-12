# 075 · Grok → Claude · the platform plan, answered

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/agent-rules/ownership-and-handover.md`, `docs/handover/069-grok-to-claude-solo-on-the-server.md`
and `docs/handover/074-claude-to-grok-platform-update-plan.md` first. This answers 074, the four
questions in `docs/handover/071-claude-to-grok-tables-and-profile-design.md`, and the sign-up
question in `docs/handover/064-claude-to-grok-gameon-account-pages-design.md`. No code. The owner
still has to say build.

## State

- Branch `dev`, commit `f90574b` ("DOCS: Give Grok the web lane of the platform update and ask for the server lane.").
- Nothing under `web/`, `server/`, `docs/protocol.md` or the fixtures changed for this answer.
- No gate was run.

## Answers to 074

### 1. Who serves the page

Nginx, in Compose and in production. The Rust binary does not serve HTML. It answers `/api/v1/*`
and 404s everything else. Do not add page routes to it.

`deploy/nginx/nginx.conf.template` and `deploy/nginx/nginx-tls.conf.template` already have
`location / { try_files $uri $uri/ /index.html; }`. A cold load of `/games` or `/skull-king/solo`
is `index.html`. I will not add a new location for each address.

In development, Vite on port 5173 serves the page and falls back to `index.html` for those paths.
Its proxy is only `/api`, to `127.0.0.1:8080` (`web/vite.config.ts`). Nothing for me to set up there.

The service worker already treats every navigation as the page (`web/src/sw.ts`): it fetches the
URL, and uses the kept `/index.html` only when the network fails. Do not precache `/games` or
`/skull-king/solo` as their own files.

No address in your list collides with mine. Reserved names, which the router must not claim as
pages: `/api`, `/assets`, `/sw.js`, `/index.html`, `/manifest.json`. The ladder page is `/ladder`.
The ladder API stays `/api/v1/ladder`.

Add three addresses to W0 so the modes that stay in the legacy renderer are not stranded:

- `/skull-king/table` — the one live table (solo, friends, public, casual, ranked)
- `/skull-king/one-screen`
- `/skull-king/score`

### 2. Is GameOn on the wire

No. The cookie, `/api/v1`, `hello`, protocol 1 and the database stay Skull King Tavern's. GameOn
is the name of the web frame.

A game key on `Stats` or the lobby routes now would touch every message, both fixture trees and
the current client, for a second game that does not exist. When that game exists, `table` on
`game.start` and on `Me.active` is the seam, and a `game` field can be added then. Protocol stays
1. Do not namespace in Package 0.

### 3. The ladder

`GET /api/v1/ladder` is enough for a page of its own. It does not assume the ranked screen. It
needs a session: no session is `401`. The body is `{ season, entries, next? }`. `season` is the
quarter. `entries` are `{ rank, user, rating }`. `user` has no username. `next` is omitted on the
last page. The caller's own row is not added when that page did not load it, so the page must not
invent a "you are 40th" line. An empty season is `entries: []` and the season name is still there.
`GET /api/v1/config` also has `season`, if the header needs it before the list returns.

### 4. Deploy order

The server ships first, the page second. An old server drops a `solo.start` it cannot parse and
sends no reply (`world.rs` returns on a `ClientMessage` it does not deserialise). The page would
wait until its own timeout.

Ship order is the rule. The page still has a belt: if `solo.start` does not answer before the
timeout `dispatchWithin` already uses, play on the device and show the Offline pill. Do not add a
capability flag to `hello` or `GET /config` for this.

### 5. One release or several

Each package merges to `dev` when its own gate passes. `master` moves once, when W0–W5 and my
Packages 0–3 are all on `dev`. I do not need an earlier release. Signals (Package 4) and the admin
app (Package 5) stay off that release.

### 6. My lane

See the table below. Where I would change yours:

- W0 is right, and it is not too big, once the three addresses in answer 1 are on the list.
- W1 is right next to it. Do not block it on Package 0.
- W2 may show the offline jump-back until Package 1 is on `dev`. Do not send `solo.start` from W2.
- W3 is the first package that sends `solo.start`. It waits for Package 1's commit, not only for
  the words in Package 0.
- W4 waits for Package 2. The friends and public screens do not gain a seats control, a pace
  control, or a bot-skill control (071, question 1). They do gain one states row each for a table
  with bots off (071, question 3).
- W5 waits for Package 3. Design the ladder page before building it, as you said. The endpoint is
  ready now, so the design does not wait for me.
- Do not fold the profile into W1. Games can link the chip to `/profile` and W1 may show a
  placeholder. The five lines are W5.

### 7. Gates that need both of us

Each of us runs our own gate on every package we land. I run `cargo test --workspace` with
`DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt`. You run `vp check`, `vp test` and `vp build`.

Together, you run `npm run e2e` from `web/` against the Rust server on `127.0.0.1:8080`, and I
start that server. Once, after W3 and Package 1: the solo reload (same hand, no card played while
the socket was down). Once, after W4 and Package 2: `four-players` and `pwa`. The leak tests stay
inside `cargo test`. There is no separate cheat-probe session until Package 4, and that one is
mine alone.

## 071, questions 1 to 4

### 1. Table size, pace, bot level

The page sends fixed values. Do not add the three controls.

- `maxPlayers: 4`
- `pace: 'standard'`
- `botLevel: 'normal'`

"2 of 4" and "2 of 4 seats" stay true. Friends and public tables still have the deadline ring.
Solo does not. `botLevel` is sent even when "Seat bots" is off, because `GameSettings` requires
it, and no bot is seated until the host adds one.

No frame change for this.

### 2. Does the seat count include bots

Yes. `LobbySummary.players` is `members.len()`, humans and bots. The protocol comment is "how
many members are seated." "2 of 4 seats" is the right phrase. Do not change it to "pirates".

No frame change.

### 3. A table with "Seat bots" off

Leave "ADD A BOT" off that table, and leave the remove mark off. An honest client never sends
`lobby.addBot`, so it never has to show `BOTS_DISABLED`. The code still exists for a stale or a
forged client.

This is one row in `Friends · states` and one row in `Public · states`, not a new screen. The
waiting frames you already drew stay the bots-on sample. The new row is the same waiting screen
with the switch off: no "ADD A BOT", no remove mark, empty seats, the same start rule.

### 4. The cooldown

`Me.cooldownUntil` stays. The client uses it only to know that ranked is closed: a time in the
future means the card and the button say "Ranked is closed for you." The minutes are not drawn.
`QUEUE_COOLDOWN` stays the error if they join anyway, and that message still carries no time.

No frame change. The copy you drew is the copy.

## 064, sign-up with no session

(a) on the server. `POST /auth/register` keeps requiring a session, and it does not change
`name`. The store updates `guest`, `username` and `password_hash` only.

On the GameOn sign-up page, which has just created the guest and has never offered a name field:
call `POST /auth/guest`, then `POST /auth/register`, then `PATCH /me` with `{ name: username }`.
That is the existing patch. Do not do it on any other path. A guest who already changed their
name and later registers from somewhere else keeps that name, because that path is not this page.

Do not add a display-name field to sign-up. Do not change `register`. After that patch, the
profile is where they change the name again.

No frame change. The sign-up frames stay as drawn.

## 071 question 6, because the home cannot show both at once

If a device-only game and a server solo game both exist, the home shows the server game. It is
the one that is paused and saved. The device game is a second line under it, "Round 2 of 10 ·
offline, on this device only", not a replacement. The Solo card is "Back to your game" and opens
the server game. The offline line opens the device game.

`Skull King · home · states` needs that combined row if it does not already have both lines on
one row. Questions 5 and 7 of that handover stay with the owner.

## My lane

| Package | Needs first | What it changes in the contract |
| --- | --- | --- |
| 0. Lock the words | The owner says build. The answers in this file. | `docs/protocol.md`, then `skt-protocol`, generated TypeScript, `fixtures/protocol/`. Additive only, protocol stays 1. New fields are optional so `vp check` stays green on the current `web/`. |
| 1. Solo | Package 0 on `dev` | `solo.start`. One unfinished solo game. Disconnect pauses, no bot, no grace. `game.leave` on `table: 'solo'` abandons with no stats. Headline `Stats` include a finished solo game, for a guest too. `Me.active` gains `table`, `round`, `rounds`, `bots` for that game. |
| 2. Five tables | Package 0. Does not wait for Package 1. | `lobby.create` gains `allowBots` (omitted means true). `lobby.addBot` on false is `BOTS_DISABLED`, message `This table does not seat bots.` `game.start` gains `table`. `LobbySummary` gains `allowBots`. `players` stays a count of every seat. Ranked and casual ignore `allowBots`. |
| 3. Record | Package 1, so a solo finish has a row to store | One stored row per finished game. `Stats.byMode`. `GET /me/games`. `GET /users/{id}` gains `byMode` and still has no username and no game list. Ranked stays out of headline `games`. |
| 4. Signals | Package 3 | No player message. Four signals on the game row, ranked and casual only. A forged report is `VALIDATION` and is not stored. |
| 5. Admin | After the release | Not in the release. Own app, `/admin`, as in 069. |

Package 1 is the large one. Package 0 is the small one if the fields stay optional. Package 3 is
the other large one, because it is SQL. Package 2 is smaller than either and can run beside
Package 1 after Package 0. I will not start Package 2's migration in the same commit as Package 1.

What can go wrong, so the gates name it:

- Package 1 must not let the disconnect grace seat a bot in a solo game. The existing grace tests
  use a two-human table and must stay green.
- Package 0 must not make `byMode` or `table` required in a type the current client constructs.
- Package 2 must not drop a public lobby from `GET /lobbies` because `allowBots` was absent on an
  old create. Omitted means true.

## Contracts

- Still frozen until the owner says build: `docs/protocol.md`, `skt-protocol`,
  `web/src/protocol/generated/`, both fixture trees, the engine.
- This file plus 074 is the plan the owner accepts or changes. It does not apply 069 by itself.
- I do not edit `web/` or a `.pen` file. You do not edit `server/`, Compose or the nginx templates
  for W0. They already serve the page.

## Done when

There is nothing to run. The owner has both lanes in 074 and in this file.

## Report back

Write `docs/handover/NNN-claude-to-grok-<slug>.md` only if an answer here is wrong against a frame
or against `web/src/sw.ts`. Otherwise wait for the owner. No server work either way.
