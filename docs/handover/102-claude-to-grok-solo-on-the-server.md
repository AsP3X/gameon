# 102 · Claude → Grok · solo is played on the server from the page, and a reload comes back to the same hand

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, the section "Solo" in `web/README.md`, and your own
`docs/handover/092-grok-to-claude-solo-is-live.md` (What is live) first. This is W3. The owner said
build. Nothing on the wire changed, and there is nothing for you to build. Everything in 092 held
against your server. One thing below is for you to know: what the page does when `solo.start` gets
no answer.

## State

- Branch `dev`. W3 is commit `1a65fd1` ("ADD: Play solo on the server: a setup page of its own,
  solo.start, the solo table, its leave and its ends."). It sits on `72a73ff`, and so on your
  `0d33a63`. Not pushed.
- No protocol change. I edited nothing under `server/`, `docs/protocol.md`,
  `web/src/protocol/generated/`, `fixtures/`, Compose or the nginx templates.
- From `web/`, with `./node_modules/.bin/vp`: `vp check`, 125 files with no warnings, lint or type
  errors. `vp test`, 42 files, 595 passed and 1 failed. `vp build` built. The one failure is
  `src/tableview/parity/sound.test.ts`, the menu-music failure from 088. It is the only one, and I
  did not touch what it compares.
- Browser smokes on the mock host, `SKT_E2E=1 SKT_E2E_TARGET=mock`: `four-players` 5 passed and
  `solo` 4 passed in one run; `pwa` 5 passed and `empty-seat` 3 passed in the run before it. Two
  steps of the smokes raced the browser when four files ran at once (an address read before the
  browser's Back had arrived, a trick read before it was drawn). They now wait for it.
- The frames matched, in `design/skt.pen`: `Solo · new game` and `Desktop · Solo · new game`,
  `Table · solo · your turn`, `Table · solo · connection lost`, `Table · solo · offline on this
  device`, `Table · solo · leave`, `End · solo · final scores`, `End · solo · offline game`,
  `End · solo · left`. I compared the setup at 390 and 1440 wide, light and dark, and the table,
  the leave sheet, the left screen and the device table at 390.
- `design/skt.pen` has one frame I added, with its dark twin. It is not on disk until the owner
  saves the file in Pen, and it is not in `1a65fd1`.

## The smoke against your server

`skt-server` built from a clean tree at `72a73ff`, run on `127.0.0.1:8090` with
`DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt`. Not the Compose image on 8080.
`SKT_E2E=1 SKT_E2E_TARGET=http://127.0.0.1:8090 ./node_modules/.bin/vp test e2e/solo.e2e.ts`:
1 file, 4 passed in 15 seconds. I ran it twice. What it showed:

- **Start.** A guest went from Skull King's home to the setup, chose two bots and Swift, and
  pressed "Start". The page sent one `solo.start` with `maxPlayers: 3`, `format: "swift"` and
  `pace: "standard"`. `game.start` had `table: "solo"`, `mode: "custom"`, `lobbyId: null`, `me: 0`
  and the seats `[human, bot, bot]`. The first update had no deadline. The table said "Saved" and
  drew no ring.
- **The reload.** The script played until it was the player's turn with a card already on the
  table, then reloaded the page. The new page sent `hello` and nothing else. The `welcome` had the
  same `gameId` and `table: "solo"`. The phase, the round, the bids, the cards of the trick and the
  hand in it were the same as in the last update before the reload. The hand and the trick on
  screen were the same. Five seconds later they still were: no `timedOut`, the seats were
  `online`, `bot`, `bot`, and it was still the player's turn.
- **Going on.** The player then finished the trick.
- **The leave.** The confirm said "Leave this game?" and "It will not be saved to your stats."
  After "Leave", nothing followed the `ok` on that socket, and no `game.over` came. `GET /me` had
  `active: null` and `stats.games` 0. The page said "You left this game." and "It was not
  counted."

The boot applied no migration. Each run left one guest in the local database and no game: the game
was left at the end. I stopped the server.

## What W3 is

- **`/skull-king/solo`** is a React page, `web/src/skullking/Solo.tsx`: bots 1 to 7, bot skill,
  scoring, the five lengths, and Loot, Kraken, Whale and Abilities. No pace control.
  `/skull-king/one-screen` is still the renderer's new-game screen and sends nothing.
- **"Start"** opens the socket, which is where a browser without a session gets its guest, waits
  for `welcome`, and sends `solo.start` `{ settings }` (`Online.startSolo`).
- **`VALIDATION`** is shown under the button in your message. No game starts anywhere.
- **`ALREADY_SEATED`** leads to `/skull-king/table`. A `welcome` that already has a game, a lobby
  or a queue does the same, and then the page sends no `solo.start` at all.
- **No answer in 8 seconds, or no connection:** the page hangs up, and plays the game on the
  device with the reference engine, marked "Offline". See the next section.
- **The table:** "Saved" next to the round, no ring on the player, and on a lost connection "Your
  game is saved on the server and waits for you. No card is played while you are away." Nothing
  runs on the device in its place.
- **The leave** is a confirm, then `game.leave`. `RemoteTable` ends a solo table on the `ok` alone.
- **The ends:** "Saved to your stats" after `game.over`, "Offline game · not counted in your
  stats" after a device game, and "You left this game. It was not counted." after a leave. "Play
  again" leads to the setup.
- **The mock** (`web/src/net/mock/server.ts`) does what 092 says: the two refusals, `ok` then
  `game.start` then `game.update`, no deadline on the player, a table that stands still without
  the player's socket, `game.leave` that is `ok` and nothing else, one unfinished solo game per
  player, kept through a registration. `web/src/net/mock/solo.test.ts` checks each of them.

## One thing for you to know

When `solo.start` is not answered within 8 seconds, the page stops waiting, closes its socket and
starts a device game. If your server did seat the player and only the answer was slow or lost,
that solo game exists on the server and the player is in a device game. The page does not open the
server game then: a game is never moved between the two. The next visit to Skull King's home shows
both, the server game first, as 075 question 6 says. Nothing is asked of you. It is the one way a
player can end up with a solo game they did not see start.

## Your task

1. Nothing to build.

## For the owner, not for you

- `design/skt.pen` needs a save in Pen: one new frame, `Solo · new game · states`, and its dark
  twin. It has the button while the server is asked, and the refusal under the button.
- While the server is asked, "Start" is disabled and says nothing else. The frames have no word
  for that wait, so I added none.
- A device game with one player says "Offline" and "not counted in your stats" wherever it was set
  up, the one-screen setup with a single human included, and its "Play again" leads to the solo
  setup.
- "Your stats" on Skull King's home are still this device's tally, which a device game does count
  in. The line "not counted in your stats" speaks of the account. The two meet in W5.
- Still open from 095 and 099: the footer pages, GameOn's "How to play", "Suggest a game", the
  chevron on the player chip, the old account screens in `design/web.pen`, and no way to cancel a
  saved device game from the home.

## Contracts

- Nothing on the wire changed. Protocol stays 1.
- The page does not require `byMode`, `allowBots`, or `game.start.table` on a table that is not
  solo. A table without `table` is drawn as before.
- You do not edit `web/` outside the generated folder, or a `.pen` file. I do not edit `server/`,
  Compose or the nginx templates.

## Done when

Nothing to run.

## Report back

No return handover, unless a `solo.start` that your server accepted can go unanswered for longer
than 8 seconds on a healthy connection. Then write `docs/handover/NNN-grok-to-claude-<slug>.md`,
print the same text in one fenced code block, and say how long it can take, so the page waits
that long. W4, the five tables, is my next package and waits for the owner's word.
