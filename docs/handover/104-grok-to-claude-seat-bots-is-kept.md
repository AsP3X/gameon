# 104 · Grok → Claude · Seat bots is kept, and the home menu changes next

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/protocol.md` (`lobby.create`, `lobby.addBot`, `BOTS_DISABLED`,
`Lobby.allowBots`, `LobbySummary.allowBots`), and
`docs/handover/103-claude-to-grok-the-five-tables.md` first. This closes Package 2. The owner
also set the next change on Skull King's home. That is your task below. W5 still waits.

## State

- Branch `dev`. Not pushed. Package 2 is commit `e04ce40` ("TASK: Keep Seat bots off on the table, and refuse a bot there."). It sits on `27ac0a7`.
- `docs/protocol.md` did not change. No sentence moved. Protocol stays 1. I did not edit `web/`
  or a `.pen` file. `design/skt.pen` is modified in the checkout and I left it unstaged.
- From `server/`: `cargo fmt --all -- --check` clean, `cargo clippy --all-targets -- -D warnings`
  clean, `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt cargo test --workspace`: engine 23
  passed, conformance 1 passed, protocol 3 passed, server 58 passed.
- `skt-server` from this tree, `127.0.0.1:8090`,
  `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt`. From `web/`:
  `SKT_E2E=1 SKT_E2E_TARGET=http://127.0.0.1:8090 ./node_modules/.bin/vp test e2e/four-players.e2e.ts`:
  1 file, 5 passed in 107 seconds. I stopped that server.

## What the server answers now

- `lobby.create` with `allowBots: false`: `ok`, and the `lobby` in that answer has
  `"allowBots": false`. A create that leaves the field out has no `allowBots` key, and
  `lobby.addBot` there is `ok` and seats a bot.
- `lobby.addBot` on the table with `allowBots: false`: `err` `BOTS_DISABLED`, message
  `This table does not seat bots.` The members do not change.
- `GET /api/v1/lobbies`: that public row carries `"allowBots": false`. The two standing tables
  still omit the field.
- A new socket for the same session, `hello` then `welcome`: `welcome.lobby` carries
  `"allowBots": false`.
- Ranked and casual do not read the field.

## Your task

1. On Skull King's home, the four ways in become two, each opening a choice.
   - Solo is no longer one card that goes straight to `/skull-king/solo`, and One screen is no
     longer its own card. Solo opens a choice between real solo play (`/skull-king/solo`, against
     bots, saved to the account) and one screen (`/skull-king/one-screen`, pass the phone).
   - Ranked is no longer its own card on the home. Online opens a choice that holds the ways the
     index already has (quick play, public tables, your table, join with a code) and Ranked
     (`/skull-king/ranked`).
   - The addresses do not change. `/skull-king/ranked` stays the ranked page. `/skull-king/online`
     stays the index. A choice may be a sheet or a short step on the home. Match a frame in
     `design/skt.pen` when one already shows it. If none does, add the choice in that file through
     the Pencil tools, and tell the owner it is not on disk until they press ⌘S.
2. Do not start W5. Do not edit `server/`.

## Contracts

- Protocol stays 1. `allowBots` omitted still means the table seats bots. `false` is kept and
  sent on `Lobby`, on `lobby.state`, on `welcome.lobby`, and on `LobbySummary`.
- You change `web/` except the generated folder. I do not edit that, or a `.pen` file.

## Done when

- From `web/`: `vp check`, `vp test`, and `vp build`. The home shows the two choices, and each
  one lands on the address it names. Ranked is not a card beside Online.

## Report back

Write `docs/handover/NNN-claude-to-grok-<slug>.md` and print the same text in one fenced code
block. Name the commit and where each choice goes. No return handover if the home matches this
task. W5 still waits for the owner's word.
