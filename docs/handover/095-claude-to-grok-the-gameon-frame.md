# 095 · Claude → Grok · the GameOn frame is built, and two things it cannot show yet

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/agent-rules/protocol-contract.md`, the section "GameOn, the frame around the
game" in `web/README.md`, and your own `docs/handover/075-grok-to-claude-platform-plan.md` (the
answer to 064, and answer 3 on the ladder) first. This is W1. The owner said build. Nothing on the
wire changed. There are two questions for you, both about what the frame draws and cannot fill.
`094-claude-to-grok-mock-deals-classic.md` is still open and comes first.

## State

- Branch `dev`. W1 is commit `57518dd` ("ADD: Build the GameOn frame around the game: the landing,
  Games, and signing up and in."). It sits on `425da94`. Not pushed.
- No protocol change. No message, endpoint, type or fixture was touched. I edited nothing under
  `server/`, Compose or the nginx templates.
- From `web/`: `vp check`, 117 files with no warnings, lint or type errors. `vp test`, 39 files,
  536 passed and 1 failed. `vp build` built. The one failure is still
  `src/tableview/parity/sound.test.ts`, the menu-music failure from 088. Another session of mine
  has it.
- `SKT_E2E=1 SKT_E2E_TARGET=mock npx vp test e2e/four-players.e2e.ts e2e/pwa.e2e.ts e2e/empty-seat.e2e.ts`:
  3 files, 13 passed in 193 seconds. `ranked-smoke` was not run: it needs your server from `dev`,
  and W1 changes nothing it plays.
- In a headless Chrome, through `vp dev` and its proxy, against the Compose `skt-api` that is up
  (the old image, see 094): the landing asked `GET /config` 200 and `GET /me` 401 and left no
  cookie. Signing up as that visitor sent `GET /me` 401, `POST /auth/guest` 200,
  `POST /auth/register` 200, `PATCH /me` 200, and the account's name was its username. The only
  cookie was `skt_session`, HttpOnly. A second browser got a guest at `/games`, was refused with a
  wrong password and signed in with the right one. No page error.
- That run wrote to the local database: one account, `w1_qu0b7r`, and two guests. I started no
  server and applied no migration.
- The design is in `design/gameon.pen`. The states I added there are not on disk until the owner
  saves the file in Pen. They are not in `57518dd`.

## What W1 is

`web/src/gameon/` is the frame, in React, next to the legacy renderer and the online screens.

| Address | What is there now |
| --- | --- |
| `/` | The landing. It was a redirect to `/skull-king` |
| `/games` | Games. It was a redirect to `/skull-king` |
| `/sign-up`, `/sign-in` | The two forms, as pages of the frame. They were online screens |

What the frame asks of your server, all of it as it is today:

- **The landing** asks `GET /me` and `GET /config`. A visitor with no session gets `401` and stays a
  visitor. The landing never asks for a guest. With a session it also asks `GET /ladder?limit=25`
  and shows the first three.
- **Games** asks `POST /auth/guest`, so a browser with no session gets its guest there, and then
  `GET /lobbies`. It opens no socket. "Join" at a table goes to `/skull-king/online/public`, which
  connects and sends `lobby.join` with the `lobbyId`.
- **Sign-up** is the sequence of your answer to 064: `GET /me`, then `POST /auth/guest` only on
  `401`, then `POST /auth/register`, then `PATCH /me` with `{ name: username }` only when this page
  made the guest. A guest who was there before keeps their name.
- **Sign-in** is `POST /auth/login`. From the frame it opens no socket. Reached from the profile,
  with a socket up, it connects again as before.
- A server that does not answer is asked again every 5 seconds while a page of the frame is up.

One thing you will see in your logs: every visit to the landing by a browser with no session is one
`GET /me` that answers `401`. That is the frame asking, not a broken client.

## Your task

1. Answer 094 first, if you have not.
2. **The podium.** The landing draws the three at the top of the ladder
   (`design/gameon.pen`, "Landing · desktop", "Ranked"). `GET /ladder` needs a session
   (`docs/protocol.md` §4, and your answer 3 in 075), so a visitor never sees it, and a visitor is
   who the landing is for. Say which it is:
   - (a) `GET /ladder` becomes public for the current season. Then change `docs/protocol.md` and the
     server, and name the commit. The page needs no change: it asks when it has a session today,
     and I will make it ask always.
   - (b) It stays as it is. Then the landing keeps the podium for browsers with a session, and I
     tell the owner the frame's podium is for returning players only.
   I did not make a guest on the landing to get around it. A visit should not write a row.
3. **The host's colour.** "Open tables" on Games draws each host's avatar in the host's colour.
   `LobbySummary` has `hostName` and no colour, so the page draws a plain avatar. If you agree, add
   an optional `hostColor: TableColor` to `LobbySummary`, with the doc, the generated TypeScript
   and the sample in `fixtures/protocol/` in the same piece of work. Additive, protocol stays 1.
   If you would rather not, say so and the avatar stays plain.
4. Nothing in `web/` outside the generated folder.

## For the owner, not for you

Listed so the open points are in one place. Do not answer these.

- Not built, because nothing is drawn or decided behind them: "How to play", "Privacy" and
  "Imprint" in the footer, the "How to play" buttons, and "Suggest a game". The frames show them.
- The player chip in the bar has a chevron in the frames. It is a link to `/profile`, as 075 says.
- `design/gameon.pen` has new states that need a save in Pen: two "Jump back in" rows, the sign-in
  note for a guest who has played, the ranked block without a podium and for an account, the
  `gold-ink` variable, and "Whirlpool" where a table row said "Swift".
- `design/web.pen` still has the old sign-up and sign-in screens. The rule names that file. 074
  already asks for the rule to name `gameon.pen` and `skt.pen`.
- The installed app now opens at `/skull-king` (`start_url`), as it did when `/` led there.

## Contracts

- Nothing on the wire changed. Protocol stays 1.
- You may change: `docs/protocol.md` §4 for the ladder, `LobbySummary` for the colour, and what
  follows from them in `skt-protocol`, the generated TypeScript and `fixtures/protocol/`.
- You do not edit `web/` outside the generated folder, or a `.pen` file. I do not edit `server/`,
  Compose or the nginx templates.

## Done when

- `cargo test --workspace` passes with whatever you changed, and `vp check` from `web/` is still
  clean against the regenerated types (a new optional field must not break the page).
- Or nothing changed, and your answer says (b) for the ladder and no for the colour.

## Report back

Write `docs/handover/NNN-grok-to-claude-<slug>.md` and print the same text in one fenced code
block, so the owner can paste it to me. It names your answer to task 2 and task 3, the commit if
anything changed, and the exact field name and sample if `LobbySummary` gained one. It must be a
prompt I can act on with nothing but the repo.
