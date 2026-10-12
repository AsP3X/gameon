# 101 · Claude → Grok · the two open tables are on Games under your name for them, and a whole game was played against `0d33a63`

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and your own
`docs/handover/100-grok-to-claude-plays-answered-and-two-open-tables.md` first. This closes 100.
There is nothing for you to build. One thing on the page did change because of the two tables, and
it rests on a sentence of `docs/protocol.md` that I now build against.

## State

- Branch `dev`. Not pushed. My change is commit `3e6c646` ("FIX: Call a table nobody hosts by the
  server's name for it on Games, not \"Open table's table\"."). It sits on `f0772d0`, which is the
  design file of W2, and on your `0d33a63`.
- No protocol change. I edited nothing under `server/`, the generated folder or `fixtures/`.
- From `web/`, with `./node_modules/.bin/vp`: `vp check`, 120 files with no warnings, lint or type
  errors. `vp test`, 40 files, 559 passed and 1 failed. `vp build` built. The one failure is still
  `src/tableview/parity/sound.test.ts`, the menu-music failure from 088.
- Against your server, built from a clean tree at `f0772d0` (so with `0d33a63`) and run on
  `127.0.0.1:8090` against `postgres://skt:skt@127.0.0.1:5432/skt`:
  - `SKT_E2E=1 SKT_E2E_TARGET=http://127.0.0.1:8090 ./node_modules/.bin/vp test e2e/four-players.e2e.ts`:
    1 file, 5 passed in 151 seconds. That is four browsers and a bot through a whole game at a
    private table, with a reload in the middle of a trick, a cheat probe and the way back to the
    lobby. No play went unanswered.
  - Games on an empty tavern listed two rows, each "Open table", "0 of 4 seats · Classic", with a
    plain avatar and the count 2. "Join" on the first sat that browser down, alone, as
    `Sailor 6a9d`. A second browser then saw "Sailor 6a9d's table · 1 of 4 seats" and one
    "Open table": two tables with room.
  - No page error. The boot applied no migration. The run left guests in the local database and no
    lobby of a player's making. I stopped the server.
- I did not test a house table that fills and starts itself. Nothing on the page is special for
  it: the fourth seat and two ready humans are yours to decide, and the page shows the table when
  `game.start` comes.

## What changed on the page

Games titled every row "{hostName}'s table". With your two tables that read "Open table's table".
Now a row that comes without `hostColor` has the name the server gave it as its whole title, and a
plain avatar. A row with `hostColor` is "{hostName}'s table" in that colour, as before.

That rests on this sentence of `docs/protocol.md`: "`LobbySummary.hostColor` is the host's table
colour. It is omitted when the row has no host". So on the page, no colour means no host. If a row
with a host can ever come without its colour from a server on `dev`, its title on Games would be
the host's bare name. An older server, which never sends the field, shows every row that way.

The public list in the online screens shows `hostName` as it comes, so it says "Open table" there
without a change.

## Your task

1. Nothing to build.

## For the owner, not for you

- `design/gameon.pen` has an unsaved change again: one more row in `Games · states` and its dark
  twin, for a table nobody hosts yet, and the Profile frames moved down to make room. It needs a
  save in Pen.
- `design/skt.pen` as saved is committed in `f0772d0`. Its diff held only the rows of W2.
- With two open tables always there, "No open tables right now" on Games is a state the Rust server
  no longer produces. The page still has it, for a list that is empty or full.

## Contracts

- Nothing on the wire changed. Protocol stays 1.
- You do not edit `web/` outside the generated folder, or a `.pen` file. I do not edit `server/`,
  Compose or the nginx templates.

## Done when

Nothing to run.

## Report back

No return handover, unless a row with a host can come without `hostColor` from a server on `dev`.
Then write `docs/handover/NNN-grok-to-claude-<slug>.md`, print the same text in one fenced code
block, and say when. W3, solo on the server, is my next package and waits for the owner's word.
