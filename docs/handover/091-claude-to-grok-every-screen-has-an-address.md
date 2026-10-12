# 091 · Claude → Grok · every screen has an address

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/handover/074-claude-to-grok-platform-update-plan.md` (the web lane), your
own `docs/handover/075-grok-to-claude-platform-plan.md` (answer 1) and the section "Addresses" in
`web/README.md` first. This is W0. The owner said build. There is one check for you, in your lane.

## State

- Branch `dev`. W0 is commit `ee4d2af` ("ADD: Give every screen an address, so a reload, Back and
  Forward land where the player was."). It sits on `2d5d72c`.
- No protocol change. No message, endpoint, type or fixture was touched. I edited nothing under
  `server/`, and I left your uncommitted work in `server/`, `docs/` and `fixtures/` alone.
- No screen looks different, so no `.pen` file changed.
- From `web/`: `vp check`, 117 files formatted and 107 files with no warnings, lint or type
  errors. `vp test`, 38 files, 501 passed and 1 failed. `vp build` built.
- The one failure is `src/tableview/parity/sound.test.ts`, "makes the same Web Audio calls for
  every sound, the volume and the ambience". It is the menu-music failure from 088. It failed
  before W0 and another session of mine has it.
- `SKT_E2E_TARGET=http://127.0.0.1:8080 npm run e2e`: 4 files, 14 passed. I built `skt-server`
  from the working tree at 18:11 and started it myself against the local Postgres, then stopped
  it. That tree may have held uncommitted work of yours. `005_solo.sql` was not there yet: the
  local database has migrations 1 to 4.
- On the mock host: `four-players` 5 passed, `empty-seat` 3 passed, `pwa` 5 passed.
  `ranked-smoke` cannot pass there. The mock host has no `POST /auth/register`.
- In a browser, by hand, against `?mock`: the address changes with every screen, a typed address
  opens its screen, a reload at `/skull-king/table` is the same online table, and Back at that
  table stays at it. No console error.

## What W0 is

`web/src/router/` holds the address list, a small router and the browser's history behind it.
`App.tsx` reads the address. The legacy renderer tells the page when a tap changed its screen, and
is told when the address changed by itself.

| Address | What is there |
| --- | --- |
| `/skull-king` | The home screen |
| `/skull-king/solo`, `/skull-king/one-screen` | The new-game screen. One screen for both until W3 |
| `/skull-king/table` | The table: an offline game, or a seat on the server |
| `/skull-king/score` | The scoresheet |
| `/skull-king/online` | The hub. A lobby or a queue is shown here |
| `/skull-king/online/new`, `/skull-king/online/join` | New table, join by code |
| `/skull-king/online/public`, `/skull-king/online/public/new` | The public list, and a new public table |
| `/ladder`, `/profile`, `/sign-up`, `/sign-in` | As named |
| `/players/{id}` | Another player. `{id}` must be a user id as the server makes them |

Three of these are in neither 074 nor 075: `/skull-king/online/new`, `/skull-king/online/join`
and `/skull-king/online/public/new`. They are the existing form pages. Without an address, Back
from them left the online screens. W4 may rename them. The three you added in 075 are in.

`/`, `/games` and `/skull-king/ranked` have no page yet. `/` and `/games` are replaced by
`/skull-king`, and `/skull-king/ranked` by `/skull-king/online`. Any other path is replaced by
`/skull-king`. `/api`, `/assets`, `/sw.js`, `/index.html` and `/manifest.json` are not pages.

What the page relies on:

- Every path that is not `/api` answers with `index.html`, at any depth. The deepest are
  `/skull-king/online/public/new` and `/players/018f6b4a-6a2e-7c3a-8b1d-9e0f1a2b3c4d`.
- The connection opens at an online address and closes at `/skull-king`, `/skull-king/solo` and
  `/skull-king/score`. A device that was seated opens online wherever it comes in. So a reload at
  `/skull-king/table` first says `hello`, and `welcome.game` puts the table back. That is 5.2 as
  it stands.
- A page that reloads at `/skull-king/online` connects by itself now. Before W0 it opened on the
  home screen and waited for a tap. You will see one more `hello` per reload of the hub.

## Your task

1. With the production Compose stack up, ask nginx for three addresses and say what it answers:
   `/skull-king/table`, `/skull-king/online/public/new` and
   `/players/018f6b4a-6a2e-7c3a-8b1d-9e0f1a2b3c4d`. Each must be `200` with the page, by
   `try_files`, on both `deploy/nginx/nginx.conf.template` and `nginx-tls.conf.template`. If one
   is not, fix the template. That is your lane.
2. Nothing else. Do not edit `web/`.

## For the owner and for you to know

- The Welcome back sheet opens only when the page opens on the home screen. A page that opens on
  another address, a bookmarked `/skull-king/score` for one, gets no sheet, so the menu theme stays
  off for that visit even when the player then goes to the home screen. I did not change that:
  the sheet and the theme came with 084 to 090. W2 replaces the legacy home screen anyway.
- An offline game is saved with its first step. A reload at `/skull-king/table` before anybody has
  bid is the home screen, as closing the tab at that moment always was.
- The sheet of 085 still has no frame in `design/web.pen`.

## Contracts

- Nothing on the wire changed. Protocol stays 1.
- You change: the nginx templates, if the check in task 1 fails. I change: `web/`.
- You do not edit `web/` outside the generated folder, or a `.pen` file. I do not edit `server/`,
  Compose or the nginx templates.

## Done when

`curl -s -o /dev/null -w '%{http_code} %{content_type}\n'` against the three addresses of task 1
prints `200 text/html` for each, on the stack you deploy.

## Report back

Write `docs/handover/NNN-grok-to-claude-<slug>.md` and print the same text in one fenced code
block, so the owner can paste it to me. It names the three answers of nginx, and the commit if a
template changed. W1, the GameOn frame, is my next package and waits for the owner's word, not
for you.
