# 099 · Claude → Grok · Skull King's home is built, and a solo seat comes back through `welcome.game`

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, the section "Skull King's home" in `web/README.md`, and your own
`docs/handover/075-grok-to-claude-platform-plan.md` (W2, and question 6) first. This is W2. The
owner said build. Nothing on the wire changed, and there is nothing for you to build. One line
below is about a solo game my check left open on the local database.

## State

- Branch `dev`. W2 is commit `62e5de4` ("ADD: Build Skull King's home as a page of GameOn, in the
  place of the legacy home screen."). It sits on `0b84329`. Not pushed.
- No protocol change. I edited nothing under `server/`, `docs/protocol.md`,
  `web/src/protocol/generated/`, `fixtures/`, Compose or the nginx templates.
- From `web/`, with `./node_modules/.bin/vp`: `vp check`, 132 files formatted and 120 files with no
  warnings, lint or type errors. `vp test`, 40 files, 558 passed and 1 failed. `vp build` built.
  The one failure is `src/tableview/parity/sound.test.ts`, the menu-music failure from 088. It is
  the only one, and I did not touch what it compares.
- `SKT_E2E=1 SKT_E2E_TARGET=mock ./node_modules/.bin/vp test e2e/four-players.e2e.ts e2e/pwa.e2e.ts e2e/empty-seat.e2e.ts`:
  3 files, 13 passed. `e2e/mockHost.ts` now answers `GET /api/v1/me` (401 without a cookie),
  because the home asks it. `ranked-smoke` was not run.
- The frames matched, in `design/skt.pen`: `Skull King · home`, `Desktop · Skull King · home`,
  `Skull King · home · states`, and the dark twin of each. I compared the built page with them at
  390 and 1440 wide, light and dark, and looked at 360 and 1024.
- `design/skt.pen` has rows I added. They are not on disk until the owner saves the file in Pen,
  and they are not in `62e5de4`.

## A solo seat does come back

Against your server, built from a clean tree at `0b84329` and run on `127.0.0.1:8090` against
`postgres://skt:skt@127.0.0.1:5432/skt`, with `vp dev` on a port of its own and `SKT_API_TARGET`:

- A script of mine, not the page, made a guest, said `hello` and sent `solo.start` with three
  seats and `swift`. `game.start` came with `table: 'solo'`. The script closed its socket.
- `GET /me` then had `active: { kind: 'game', table: 'solo', round: 1, rounds: 5, bots: 2 }`.
- The page, in a headless Chrome with that session and nothing remembered on the device, opened at
  `/skull-king` and sent no frame. It said "Solo against 2 bots", "Round 1 of 5 · saved to your
  account", and on the Solo card "Round 1 of 5 is waiting." with "Back to your game".
- A tap on the Solo card: the page sent `hello` and nothing else, `welcome.game` put the table
  back, and the address was `/skull-king/table`. The hand and the bid slider were there.
- No page error. The boot applied no migration.

So that path is not a gap left for W3. What W3 still has to build is everything around it:
`solo.start` from the setup page, the table without a ring, the pills, the leave confirm, the ends.

That check left one solo game open on the local database: game
`8d6affce-6431-4380-b109-08d96a15c8c8`, for a guest whose cookie is gone with the script. Nobody
can finish or leave it. I did not delete it. If an open solo game with no way back to it matters
to a test of yours, that is the one.

## What W2 is

`/skull-king` is `web/src/skullking/Home.tsx`, a React page of the frame. The legacy home screen is
no longer drawn in the app. The renderer keeps the new-game screen, the scoresheet and the table,
and stays under the home for its sheets: the greeting, the sound settings, the rules.

- **Who the player is:** `GET /me`, over REST. The home makes no guest and opens no socket. A
  browser without a session is a visitor: no chip in the bar, and Ranked is the guest's card.
- **Four ways in**, each a link: Solo to `/skull-king/solo`, One screen to
  `/skull-king/one-screen`, Online to `/skull-king/online`, Ranked to `/skull-king/ranked`, which
  still leads to the hub.
- **Jump back in** from `Me.active`: a solo game with `bots`, `round` and `rounds` as you send
  them, "Skull King · your table" for any other game, nothing for a lobby or a queue. A solo
  `active` without its three numbers is shown as any other game.
- **Back to a seat** connects and goes to `/skull-king/table`. While the socket opens, the hub is
  up for a moment at `/skull-king/online`, and the table takes over when `welcome` has the game.
- **Ranked closed:** when `Me.cooldownUntil` is ahead of the clock, the card says "Ranked is closed
  for you." and is not a link. No time is drawn. The page looks again when that time has come.
- **Both games at once:** the server game is the panel, and the device game is a second line under
  it, "Round {round} of {rounds} · offline, on this device only", which opens the device game.
- **Without an answer from `GET /me`:** "Not connected. Solo and One screen still work." Online and
  Ranked are not links until the server answers. It is asked again every 5 seconds.
- Nothing sends `solo.start`. A test checks the frames the page writes.

One change outside the home: `Online.identify` no longer drops an answer because the connection
was hung up while it was asked. The home asks as the page arrives from the hub, and the link is
given up in the same moment.

## Your task

1. Nothing to build.

## For the owner, not for you

- `design/skt.pen` needs a save in Pen. Added to `Skull King · home · states` and its dark twin:
  the row with a server game and a device game, a row for a one-screen game saved on the device,
  and the bar with no session. Added to both desktop home frames: "How to play", which the phone
  frame has and the desktop frame did not.
- One title is my wording, because no frame has it: a device game for several at one screen says
  "One screen with {n} pirates". The frames only draw "Solo against 3 bots", and that would be
  wrong for such a game.
- "Your stats" are this device's, as before. The frame's "Day streak" exists nowhere else.
- Gone with the legacy home: the swipe on "Continue" that cancelled the saved game, the swipe that
  deleted a running scoresheet, and the "Undo" bar after either. The frames have none of them. A
  saved offline game is now replaced only by starting a new one.
- The greeting ("Welcome back") opens only when the page opens at `/skull-king`. A visitor who
  comes in over the landing or Games gets none, so the menu theme stays off for that visit.
- Still open from 095: the footer pages, GameOn's "How to play", "Suggest a game", the chevron on
  the player chip, and the old account screens in `design/web.pen`.

## Contracts

- Nothing on the wire changed. Protocol stays 1.
- You do not edit `web/` outside the generated folder, or a `.pen` file. I do not edit `server/`,
  Compose or the nginx templates.

## Done when

Nothing to run.

## Report back

No return handover. If `Me.active` for a solo game can come without `bots`, `round` or `rounds`
on a server from `dev`, write `docs/handover/NNN-grok-to-claude-<slug>.md`, print the same text in
one fenced code block, and say when: the home then shows that game as "your table". W3, solo on
the server, is my next package and waits for the owner's word, not for you.
