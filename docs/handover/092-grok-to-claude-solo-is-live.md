# 092 · Grok → Claude · solo is live, and the default deal is classic

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/protocol.md` (the `standard` sentence in §4, `game.leave` in §5, and
`solo.start` at the end of §5.6), and `docs/handover/075-grok-to-claude-platform-plan.md` (deploy
order and W2 / W3). This is Package 1, plus the owner's correction to the default deal. I did not
edit `web/` or a `.pen` file.

## State

- Branch `dev`. Not pushed. `origin/dev` is still `2d5d72c`. Local `dev` is ahead of it by W0
  (`ee4d2af`, `b04a787`, `946595a`) and by the three commits below.
- `963a0ba` — BUGFIX: Deal the default game as classic, ten rounds of 1 through 10 cards.
- `16c3e9d` — FIX: Declare Tigress when a phase-1 test plays card 66. Test only. The 70-card
  deck's Tigress is id 66 and a play without `as` is illegal.
- `8738723` — ADD: Seat a solo game on the server, and pause it when the player drops.
- Protocol stays 1. No generated TypeScript changed. `fixtures/protocol/game-settings.json` and
  `fixtures/protocol/server-config.json` now say `"format": "classic"` inside `standard`. Every
  other protocol fixture is unchanged. `welcome-game.json` is still an explicit brawl sample.
  Leave `web/src/table/remoteTable.test.ts` asserting `format: 'brawl'` on that fixture.
- From `server/`: `cargo fmt --check` was clean. `cargo clippy --all-targets -- -D warnings` was
  clean. `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt cargo test --workspace`: engine 23
  passed, conformance 1 passed, protocol 3 passed, server 56 passed, 0 failed, finished in 21.68s.
- I did not run `vp check` or `vp test`. I did not restart the Compose stack. Migration
  `005_solo.sql` applies on the next boot. Do not wipe the database.
- Handover 091 asked me to curl three nginx paths. I have not done that. It is not this package.
  W1 does not wait on it. W3 does not wait on it.

## Default deal

`GameSettings::standard()` is classic. Quick play and ranked deal `[1,2,3,4,5,6,7,8,9,10]` at 4
players (the 70-card deck caps a round at 17, so nothing is cut). Round 1 is 1 card. Round 10 is
10 cards. `GET /api/v1/config` returns that as `standard.format`. Skip to the Brawl, Swift-n-Salty,
Even Keeled and Whirlpool are still choosable formats. They are not the default.

`docs/multiplayer-plan.md` D5 now records this. The owner set it.

Your mock is behind the server. `web/src/net/mock/server.ts` `STANDARD` still has
`format: 'brawl'`. `web/src/online/settings.ts` builds the queue plate from
`Rules.FORMATS[format].name`, so `web/src/online/Accounts.test.tsx` still expects
`Skull King's scoring · Skip to the Brawl`. After `STANDARD.format` is `classic`, that plate is
`Skull King's scoring · Classic`. The device-solo defaults in `web/src/tableview/state.ts` and
the settings-form default in `web/src/online/settings.ts` are already classic. Leave the explicit
brawl game in `web/src/tableview/tavern.test.ts` as it is.

## What is live

`solo.start` `{ id, settings }` from a player who is not seated:

1. `maxPlayers` outside 2..=8 is `err` `VALIDATION`. Nothing is seated.
2. A second start, or a start while that player is in a lobby, a queue, or a game, is `err`
   `ALREADY_SEATED`.
3. Otherwise `ok`, then `game.start`, then `game.update` rev 0.
   - `table: "solo"`, `mode: "custom"`, `lobbyId: null`.
   - The human is seat 0. Every other seat is `bot: true` at `settings.botLevel`.
   - `pace` is stored as `standard` even when the client sent another pace.
   - `deadline` is `null` on the human's bid, play, and ability. The round-end deadline is still
     set while the human is connected. Trick-end and round-end delays still run then.
   - No `timedOut`, no `away`, no second miss, and no bot seated for a drop.

A drop pauses that table. No card is played and the round does not advance until the same player
connects. On reconnect, `welcome` still shows seat 0 `offline` (it is sent before the socket is
marked online). The next `game.update` sets the human online, the bots catch up to the human's
turn, and then they wait. The hand is the same hand.

`game.leave` on `table: "solo"` answers `ok` and then nothing else on that socket. No
`game.update`. No `game.over`. The game is gone. The next `welcome` has `game: null`. No result,
no stats, no bot, no cooldown. `game.leave` on every other table is unchanged: `ok`, then
`game.update`, and that seat becomes a bot.

`GET /api/v1/me` for that game sets `active.table` to `"solo"`, `active.round` to the 1-based
deal index, `active.rounds` to the format length (10 for classic — the format length, not the
deck-capped schedule), and `active.bots` to the number of seated bots. Other games still omit
those four fields.

A finished solo game counts in the headline `Stats`, including a guest's. `games.mode` stays
`custom` and `games.table_kind` is `solo`. `byMode` is still omitted. `GET /api/v1/me/games` is
still not mounted. `allowBots` on `lobby.create` is still dropped. `game.start.table` is set only
for solo. Friends, public, casual, and ranked still omit `table`.

One unfinished solo game per player, with no expiry. A guest may start one. Registering that
guest keeps the game on the same user id. A solo game is not a lobby, not a queue, and never
ranked. Offline play on the device never reaches the server.

## Your task

1. Do not send `solo.start` from W2. W2 may keep showing the offline jump-back.
2. W3 is unblocked. It is the first package that sends `solo.start`. Use the replies above. Take
   the solo table down on `ok` alone after `game.leave`. Do not wait for `game.update`. If
   `solo.start` does not answer before the timeout `dispatchWithin` already uses, play on the
   device and show the Offline pill. Do not add a capability flag.
3. When you next touch the quick-play mock, set `STANDARD.format` to `'classic'` and update the
   plate expectation to `Skull King's scoring · Classic`. Live quick play and ranked already deal
   classic. The mock is the copy that is wrong.

## Contracts

- Protocol stays 1. You may send `solo.start`. You may not require `byMode`, `allowBots`, or
  `game.start.table` on a table that is not solo.
- You do not edit `server/`. I do not edit `web/` or a `.pen` file.
- `master` still waits for W0–W5 and Packages 0–3 plus 1b. Do not move it. Do not push.

## Done when

For the mock correction: from `web/`, `vp check` and `vp test`. The quick-play plate test expects
`Skull King's scoring · Classic`, and `GET /config` on the mock returns `standard.format`
`classic`.

For W3: your usual `vp check`, `vp test`, and `vp build`, plus the solo reload against the Rust
server once I have it up: same hand, and no card played while the socket was down.

## Report back

Write `docs/handover/NNN-claude-to-grok-<slug>.md` and print the same text in one fenced code
block. Name the commit, what you sent, and what the gate printed. The return handover must itself
be a paste-ready prompt.
