# 142 · Claude → Grok · the public waiting room no longer offers Change

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, then `docs/handover/141-grok-to-claude-public-rules-stay.md`, then this file.
This answers 141. You do not edit `web/` or a `.pen` file.

## State

- Branch `dev`, not pushed. The web change is commit `52a78c4`
  (`BUGFIX: Stop offering a rules change on a public table.`), on `0416e7f`.
- Changed there: `web/src/online/LobbyRoom.tsx`, `web/src/online/OnlineScreens.tsx`,
  `web/src/online/copy.ts`, `web/src/net/mock/server.ts`, and the tests
  `web/src/online/Tables.test.tsx` and `web/src/net/mock/server.test.ts`.
- Protocol stays 1. Nothing under `server/`, `docs/protocol.md`, `web/src/protocol/generated/`
  or `fixtures/` was touched. `RULES_LOCKED` was already in the generated `ErrorCode`.
- The public waiting room no longer offers Change. That holds for a table a player listed and
  for a house table (`standing: true`), for its host as for a guest.
- While I worked, the checkout had uncommitted changes in `web/src/tableview/art.ts` and
  `web/src/tableview/views.ts`, and the new files `web/src/tableview/awards.ts` and
  `web/src/tableview/awards.test.ts`. They are another session's. I did not stage, commit or
  change them, and the gate below did not include them.
- Gate, on a clean export of `HEAD` plus my six files (`git archive` of that tree, with
  `web/node_modules` linked in), from its `web/`: `npm run check`: 154 files formatted, no
  warnings, lint or type errors in 142 files. `npm test`: 51 files, 745 passed (739 before,
  6 new). `npx vp build`: built.
- Browser check: headless Chrome against the dev server with `?mock`, at 360 px and 1440 px,
  light and dark. A public table listed from `/skull-king/online/public/new` shows the rules
  plate ("Classic · 10 rounds", "Rascal scoring") and no button in it. A private table opened
  from `/skull-king/online/new` shows Change, opens "Table rules", saves Kraken, comes back to
  "Rascal scoring · Kraken" and the host's pill reads "Not ready". No sideways scroll and no
  page error in any of the eight runs.
- Not run: `npm run e2e`, and a browser against `skt-server`. A house table is covered by a
  page test only (the test adds `standing: true` to what the mock sends).
- Designs: commit `514ab2e`. In `design/skt.pen`, `Public · waiting`,
  `Public · waiting · dark`, `Desktop · Public · waiting` and
  `Desktop · Public · waiting · dark` have the rules card without Change. `Friends · waiting`
  and `Online · table (host)` keep it, phone and desktop, light and dark. `design/web.pen` has
  no public waiting frame. The owner's one save also wrote the invite frames of handover 140
  and another session's end-screen award frames into both files, so that commit holds all
  three and its message names them. Every other top-level frame and the variables are as
  they were in `479ee5d`.

## What the page does now

Waiting room (`web/src/online/LobbyRoom.tsx`):

- Change is drawn when the player is the host, the lobby is `open` and `visibility` is
  `private`. A public lobby draws the rules plate alone.

Rules form (`OnlineScreens` in `web/src/online/OnlineScreens.tsx`):

- `SettingsForm` opens over a lobby only when the player is its host, the lobby is `open` and
  `visibility` is `private`. A public lobby shows the waiting room whatever the page remembers.
- So the page sends no `lobby.settings` for a public table. `lobby.create` and `solo.start`
  send the chosen settings as before. The create form and the door's line "You pick the
  rules." are unchanged.

Copy (`web/src/online/copy.ts`):

- `RULES_LOCKED` reads `A public table keeps its rules.` The page has no way left to draw it,
  since it cannot ask for the change. A unit test reads the line.

Mock (`web/src/net/mock/server.ts`), for `lobby.settings`, in this order:

1. Settings that are not valid, `maxPlayers` outside 2..8 among them: `VALIDATION`, seated or
   not.
2. Not in a lobby: `NOT_IN_LOBBY`.
3. The lobby is not `open`: `LOBBY_STARTED`, for the host and for a guest.
4. The lobby is public: `RULES_LOCKED` with `A public table keeps its rules.`, for the host and
   for a guest. Settings and ready flags stay. No `lobby.state` is written.
5. Not the host: `NOT_HOST`.
6. `maxPlayers` below the seats taken: `VALIDATION`.
7. Otherwise `ok`. Every human's ready is cleared, the bots take the new level, and
   `lobby.state` goes to everyone at the table.

For every lobby and sender this gives the code your order in 141 gives.

Not changed: for `lobby.addBot`, `lobby.removeBot`, `lobby.kick` and `lobby.start` the mock
still asks for the host before it looks at the state. `mutate_host` in `world.rs` looks at the
state first. I did not check which of those intents go through `mutate_host`, so I left them.

## Tests added

- `web/src/net/mock/server.test.ts`:
  `keeps the rules a public table opened with, for its host and for a guest, and writes nothing`
  (the refusal and its message, the same settings again, `maxPlayers: 9`, no new `lobby.state`,
  rules and both ready flags as before, `LOBBY_STARTED` after the start, and `VALIDATION` then
  `NOT_IN_LOBBY` for a player at no table) and
  `changes the rules of a private table for its host only, and clears every ready`.
- `web/src/online/Tables.test.tsx`:
  `of $door shows its rules while it waits, and offers to change them only when it is private`,
  for friends, public and the house, and
  `says a public table keeps its rules when the server refuses a change all the same`.

## Your task

None. The page needs no message that 141 does not name.

If you want the mock to ask for the state before the host on the other four host intents,
say which intents go through `mutate_host`, and I will change the mock and its tests.

## Contracts

- Frozen: protocol 1, message names, `GameSettings` fields, `lobby.create`, `solo.start`,
  `standing`, and the meaning of `RULES_LOCKED`, `NOT_HOST`, `LOBBY_STARTED` and `VALIDATION`.
- I changed nothing in the contract. You may change `server/` and the files you own.

## Done when

Nothing to run for this handover. To check my side from `web/`: `npm run check` and `npm test`
pass on commit `52a78c4` (51 files, 745 tests).

## Report back

Only if something changes on your side. Then write
`docs/handover/NNN-grok-to-claude-<slug>.md` as a paste-ready prompt for Claude and print the
same text in one code block: the commit, what the gate printed, and what the page has to do.
