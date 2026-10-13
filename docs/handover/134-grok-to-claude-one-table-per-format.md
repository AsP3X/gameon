# 134 · Grok → Claude · one open public table for each format

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/protocol.md` §5.3 (`LobbySummary`, `GET /api/v1/lobbies`), and
`web/src/online/settings.ts` (`describeRow`) first. The owner wants the standing public tables to
be one per format, and the list to show which format a row is without the player having to read a
trailing word.

## State

- Branch `dev`. Not pushed. The server change is commit `581accd`
  (`TASK: Keep one open public table for each format.`), on `f0a5bcf`.
- Protocol stays 1. No new message, field, or error code. `LobbySummary.settings` already carries
  `format`. I did not edit `web/` or a `.pen` file.
- From `server/`: `cargo fmt --all -- --check` clean, `cargo clippy --all-targets -- -D warnings`
  clean, `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt cargo test --workspace`: bot-pass 12
  passed, engine 37 passed, conformance 1 passed, protocol 3 passed, server 71 passed.
- The Compose `skt-api` image was not rebuilt. It still keeps two classic tables until
  `docker compose up --build`.

## What the list is now

`GET /api/v1/lobbies` on an empty tavern is five public tables, in this order. Each is four
players, classic scoring, no loot, no kraken, no whale, no abilities, normal bots, standard pace.
`allowBots` is omitted (the table seats bots). `players` is 0. `hostName` is `"Open table"`.
`hostColor` is omitted. Nothing else about the five differs except `settings.format`:

| Order | `format` | Short name | Long name | Rounds |
| ----- | -------- | ---------- | --------- | ------ |
| 1 | `classic` | Classic | Classic | 10 rounds, 1 through 10 cards |
| 2 | `brawl` | Brawl | Skip to the Brawl | 5 rounds, 6 through 10 cards |
| 3 | `swift` | Swift | Swift-n-Salty | 5 rounds of 5 cards |
| 4 | `even` | Even | Even Keeled | 10 rounds, two each of 2, 4, 6, 8, 10 |
| 5 | `whirl` | Whirl | Whirlpool | 10 rounds, two each of 9, 7, 5, 3, 1 |

The short names are `formatName` in `web/src/skullking/rulesets.ts`. The long names and the round
lists are `Rules.FORMATS` in `web/src/game/rules.ts`.

Sitting at one does not open a second table of that format. The first person to sit becomes the
host and is ready, so that row then has `hostColor` and the host's name. `hostName` is no longer
`"Open table"`. When the fourth seat is taken, and two humans are ready, that table starts itself,
leaves the list, and a new empty table of the same format is appended. The other four stay where
they were. A house table does not reopen after its game. A table a player created is unchanged and
is listed in addition to the five, not instead of one.

If the host of a standing table changes its format, a fresh empty table of the format that no
longer has a free seat is opened. Draw whatever `settings` the row actually has. Do not assume a
hosted row is still the standing defaults.

The list is still pull-only. Refresh, and a join that fails because the table is gone, full, or
already started, are what load it again.

## Your task

1. On the public list (`web/src/online/PublicTables.tsx`, copy from `describeRow`) and on Games
   (`web/src/gameon/Games.tsx`), make the format the thing a player sees first. A pill or a leading
   label with the short name, and the round shape on the secondary line (the lists in the table
   above). Keep the seat count and the Bots / No bots pill.
2. An unhosted row stays titled with the server's `hostName` (`"Open table"`). Do not rename it to
   the format, and do not invent a `hostColor`. A hosted row stays `"{hostName}'s table"` in
   `hostColor`, and shows that table's format the same way.
3. Games currently keeps `TABLES_SHOWN = 3`, so Even and Whirlpool never appear on the preview.
   Show all five standing formats there. The count pill already uses the full list. Player-created
   rows are extra: do not drop one of the five to make room for a sixth row. The server lists the
   standing tables first and appends a replacement, so do not trust a fixed index after a game has
   started. Read `settings.format`.
4. Use the tokens already in `web/src/styles/tokens.css`. No new hex value. No new protocol field.
5. Update the frames to match, including the dark twins: `Public · list` and
   `Desktop · Public · list` in `design/skt.pen`, and the Games "Open tables" block in
   `design/gameon.pen`. If `design/web.pen` still has the same list, update that too. Pencil only.
   Ask the owner to press ⌘S. The `.pen` change is not on disk until they do.
6. Update `web/src/online/Tables.test.tsx` and `web/src/gameon/GameOn.test.tsx`. They still expect
   two identical `"Open table"` / Classic rows. The mock `GET /lobbies` stays empty until someone
   creates a table. Do not fake the five house rows in the mock unless a test needs them.
7. Leave the empty copy. `"No public tables right now."` and `"No open tables right now."` are for
   an empty answer. An empty tavern on this server is not empty.

## Contracts

- Protocol stays 1. `hostName` `"Open table"` is still the display name of a standing table nobody
  has sat at. It is not a new field.
- You do not edit `server/`, Compose, or the nginx templates. I do not edit `web/` outside the
  generated folder, or a `.pen` file.
- `f0a5bcf` is a separate change already on `dev`: a private table can start with the host and a
  bot, and a public table still needs two humans. Do not reopen it here. Standing public tables
  still start themselves when the last seat is taken. The player does not press Start for those.

## Done when

From `web/`: `npm run check`, `npm test`, and `npm run build`. Then, against a server built from
`581accd` (not the old Compose image), open `/games` and `/skull-king/online/public` in the
browser. Light and dark, 360 px wide and a wide window. Five rows, each format readable at a
glance, and joining one seats the player. A row somebody already hosts still shows their name and
colour, and its format.

## Report back

Write `docs/handover/NNN-claude-to-grok-<slug>.md` (the next free number) and print the same text
in one fenced code block. Name the commit, the `vp` counts, and the copy you used for each of the
five formats. Say whether Games shows all five when the tavern is empty, and which `.pen` frames
changed. If the owner has not saved the pen file, say so.
