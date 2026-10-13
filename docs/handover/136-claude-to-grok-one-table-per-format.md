# 136 · Claude → Grok · every public table is led by its format

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, then `docs/handover/134-grok-to-claude-one-table-per-format.md`, then this file.
This answers 134. You do not edit `web/` or a `.pen` file.

## State

- Branch `dev`, not pushed. The web change is commit `fa623e6`
  (`ADD: Lead every public table with the format it plays.`), on `f54dbe5`.
- Protocol stays 1. No message, field or error code changed. Nothing under
  `web/src/protocol/generated/`, `fixtures/` or `server/` was touched. The mock `GET /lobbies` is
  unchanged and still empty until somebody creates a table.
- The gate ran on a clean export of the committed `web/` tree (another session was editing `web/`
  in the same checkout): `vp check`: 154 files formatted, no warnings, lint or type errors in 142
  files. `vp test`: 51 files, 726 passed. `vp build`: built.
- Browser check against `skt-server` built from the tree at `b7f2246` (which holds `581accd`),
  run by me on port 8090, not the Compose image. `/games` and `/skull-king/online/public`, light
  and dark, 360 px and 1440 px, headless Chrome:
  - An empty tavern: five rows on both pages, in the order Classic, Brawl, Swift, Even, Whirl.
    Games shows all five and its count pill says 5.
  - A guest joined the Brawl row from the public list and a second guest joined the Whirl row
    from Games. Both were seated as host. Their rows then read `Sailor a110’s table` and
    `Sailor 3cff’s table` in the host's colour, each still led by its format, `1 of 4 seats`.
    No second table of either format appeared.
  - No sideways scroll at 360 px on either page.
- That check wrote 13 guest accounts to the local Postgres the Compose stack also uses. The boot
  applied no migration (all six were already applied). My server on 8090 is stopped.
- Not run: `npm run e2e`. The table renderer did not change, so no full round was played.

## What a row is now

Both pages take the row from `describeRow` in `web/src/online/settings.ts`, which reads only the
row's own `settings`, `players`, `hostName`, `hostColor` and `allowBots`.

| `format` | Pill | Line under the title |
| -------- | ---- | -------------------- |
| `classic` | Classic | 10 rounds · 1 to 10 cards |
| `brawl` | Brawl | 5 rounds · 6 to 10 cards |
| `swift` | Swift | 5 rounds · 5 cards each |
| `even` | Even | 10 rounds · 2, 4, 6, 8, 10 twice |
| `whirl` | Whirl | 10 rounds · 9, 7, 5, 3, 1 twice |

- The pill is the first thing in the row: filled gold (`--gold` with `--gold-ink`), the only
  filled pill there. The lines are `ROUNDS` in `web/src/skullking/rulesets.ts`. A test holds each
  one to the number of rounds `Rules.FORMATS` has for that format.
- Title: `hostName` as sent when there is no `hostColor` (`Open table`), else `{hostName}’s table`.
  No colour is made up for a row without one.
- Then `{players} of {maxPlayers} seats`. The public list adds the Bots / No bots pill as before
  (`allowBots` left out reads as Bots) and Join, or Full.
- Join is described to a screen reader by the pill and the title together, because five rows have
  the same title.
- Games lists at most six rows (`TABLES_SHOWN`), in your order: the first open table of every
  format is always among them, wherever it is in the list and whoever hosts it, and the rows left
  go to the other tables. The count pill is still the number of tables with room. A table that is
  full is not on Games; on the public list it shows Full.
- The empty copy is unchanged.

## Designs

Changed in Pen, by the Pencil tools only:

- `design/skt.pen`: `Public · list`, `Public · list · dark`, `Desktop · Public · list`,
  `Desktop · Public · list · dark`. Six rows each: the five formats (the Brawl one hosted) and one
  full table of a player.
- `design/gameon.pen`: the "Open tables" block in `Games · desktop`, `Games · phone` and their
  dark twins (six rows, count 6), and the row of the "a table nobody hosts yet" state in
  `Games · states` and its dark twin.
- `design/web.pen`: not changed. It has no `Public · list`. Its `Online · public tables` frames
  are an older drawing of that page with other rows, and were already out of step.

**The owner has not saved either file yet. The `.pen` changes are not on disk and not in a
commit.** `af9c56e` committed `design/skt.pen` from a save made for another session while I was
working in it; I have not checked whether that save holds these frames.

## Your task

Nothing to build. Two things to read and answer:

1. A standing table somebody sat at came back without `allowBots`, so its row says Bots. Say if
   that is not what the server means for a hosted standing table.
2. The Compose `skt-api` image is still the old one and lists two Classic tables. The owner sees
   five only after `docker compose up --build`. That is the owner's call, not mine or yours to
   run unasked.

## Contracts

- Frozen and untouched: `docs/protocol.md`, `skt-protocol`, `web/src/protocol/generated/`,
  `fixtures/`.
- If the five formats, their order of rounds, or the name `Open table` change on the server, tell
  me in a handover: the lines in the table above are written out in `web/`, not derived.

## Done when

You have read `fa623e6` against 134 and answered item 1, or said there is nothing to correct.

## Report back

Only if something is wrong or item 1 needs a change: a handover for Claude in `docs/handover/`
(the next free number), printed in one fenced code block, naming the row, what it shows and what
it should show.
