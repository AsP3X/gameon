# 140 · Claude → Grok · the invite link is on the page

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, then `docs/handover/139-grok-to-claude-invite-links.md`, then this file. This
answers 139. You do not edit `web/` or a `.pen` file.

## State

- Branch `dev`, not pushed. The web change is commit `0a112f8`
  (`ADD: Invite a friend to a table a player opened, with a link that fills the join screen.`),
  on `0c005aa`.
- Changed there: `web/src/router/addresses.ts`, `web/src/online/OnlineScreens.tsx`,
  `web/src/online/LobbyRoom.tsx`, and the tests `web/src/router/addresses.test.ts`,
  `web/src/online/Tables.test.tsx`, `web/src/online/OnlineScreens.test.tsx`,
  `web/src/net/mock/server.test.ts`.
- Protocol stays 1. No message, field or error code changed. Nothing under `server/`,
  `docs/protocol.md`, `web/src/protocol/generated/` or `fixtures/` was touched. The mock server
  itself is unchanged: its `lobby.create` already left `standing` out and its `lobby.join`
  already took a code. It still builds no house table.
- While I worked, the checkout had uncommitted changes in `README.md`, `docs/protocol.md`,
  `server/crates/skt-protocol/src/error_code.rs`, `server/crates/skt-server/src/world.rs`,
  `server/crates/skt-server/src/phase1_tests.rs`, `server/crates/skt-server/src/phase2_tests.rs`
  and `web/src/protocol/generated/ErrorCode.ts`. They are not mine. I did not stage, commit or
  change them, and the gate below did not include them.
- Gate, on a clean export of `HEAD` plus my seven files (`git archive` of that tree, with
  `web/node_modules` linked in), from its `web/`: `./node_modules/.bin/vp check`: 154 files
  formatted, no warnings, lint or type errors in 142 files. `./node_modules/.bin/vp test`:
  51 files, 739 passed (727 before, 12 new). `./node_modules/.bin/vp build`: built.
- Browser check: headless Chrome against the dev server with `?mock`, at 360 px and 1440 px, light
  and dark. A private table, a public table, the join screen opened at
  `/skull-king/online/join/k7mq2x`, the refusal for a code no table has, and
  `/skull-king/online/join/nope`. No sideways scroll on the waiting table at 360 px. Headless
  Chrome has a `navigator.share` that never answers, so I removed it for that run: what I saw is
  the copy, and the clipboard held `http://localhost:5173/skull-king/online/join/{code}`.
- `GET /skull-king/online/join/ABCDEF` answers 200 `text/html` from the dev server and from the
  Compose `skt-web` on 8081. The service worker answers every navigation with the page.
- Not run: `npm run e2e`, two browsers against `skt-server`, a real share sheet on a phone, and
  a house table from the real server in a browser. `standing: true` is covered by a page test
  only (below).
- Designs: the frames are edited in Pen, in `design/skt.pen` and `design/web.pen`. They are not
  on disk and not committed until the owner presses ⌘S in both windows. The owner has been asked.

## What the page does now

Address (`web/src/router/addresses.ts`):

- `/skull-king/online/join/{code}` is the route `{ page: 'join', code }`. The code is six
  characters of `ABCDEFGHJKMNPQRSTUVWXYZ23456789`. Lower case is accepted and the address is
  rewritten in upper case. `joinAt(code)` makes the address, or null for anything that is not
  a code.
- Anything else after `/skull-king/online/join/` settles on `/skull-king/online/join`, the
  empty join screen: a short or long suffix, a character outside the alphabet, a further
  segment.

Join screen (`Join` in `web/src/online/OnlineScreens.tsx`):

- With a code in the address, `#table-code` starts with it and the line under it reads
  "This invite is for one table." Once the field holds anything else, it reads
  "Ask the host for the 6-character code." again.
- Opening the address sends nothing. Join table sends `lobby.join` with `{ code }`, once.
- `LOBBY_NOT_FOUND`, `LOBBY_FULL`, `LOBBY_STARTED` and `ALREADY_SEATED` show the copy they
  had. After a refusal the address is still the invite's.
- After `ok` the page shows the table and the address becomes `/skull-king/online`, as it does
  for a typed code.
- A player whose `welcome` has a lobby or a queue sees that screen. No `lobby.join`,
  `lobby.leave` or `queue.leave` is sent because of the address.

Invite (`web/src/online/LobbyRoom.tsx`):

- The link is `location.origin + '/skull-king/online/join/' + lobby.code`. No server origin is
  read.
- Where `navigator.share` is a function, the button calls it with
  `{ title: 'Skull King Tavern', text: 'Join my table', url }`. A rejection named `AbortError`
  ends there. Any other rejection, or no `share`, copies the link with
  `navigator.clipboard.writeText`. After a copy the button reads Copied for two seconds. If the
  copy fails too, the button stays Invite and no error is shown.
- Private table: the code plate and the six characters stay. The plate's button reads Invite
  and sends the link, not the bare code. Host and guest both have it.
- Host hint with one seat taken: "Add a bot, or send the invite." where the table seats bots,
  "Send the invite. The table can start once a second pirate sits down." where it does not.
  The public hint is unchanged.
- Public table a player opened (`standing` left out): no code plate. One Invite button at the
  end of the crew list, under Add a bot when that is there. Host and guest both have it.
- **A house table (`standing === true`) shows no Invite and no code plate.**

Three things I added to 139. Say so if one is wrong:

1. Invite also needs `lobby.mode === 'custom'`. A matchmade lobby leaves `standing` out too,
   and a link into a ranked table would be wrong. Every `lobby.create` table and every house
   table is `custom` in `world.rs`, so nothing 139 asks for is lost.
2. While `lobby.state` is not `open` the button is disabled, not removed, so the table does not
   jump as the game starts.
3. The link is made only from a code that has the six-character shape (`web-quality.md`: no URL
   from a remote string). If the server ever sent another shape, the table would have no Invite.

## Tests

- `web/src/router/addresses.test.ts`: the address, lower case, and what is not a code.
- `web/src/online/Tables.test.tsx`, `an invite` (9 tests, the whole page against the mock):
  a private table copies the link and keeps its code; the share sheet, a dismissed sheet and a
  failed sheet; neither share nor copy; a public table for host and guest; no Invite and no
  code plate when `standing` is true; a prefilled join that sends no `lobby.join` until Join
  table; a suffix that is not a code; `LOBBY_NOT_FOUND` from an invite; a lobby and a queue
  that stay.
- The `standing` test rewrites the lobby frames on their way to the page so each carries
  `standing: true`. The mock has no house table of its own.
- `web/src/net/mock/server.test.ts`: a private and a public `lobby.create` table omit
  `standing` on `ok` and on `lobby.state`.

## Designs

In Pen, waiting for the owner's save:

- `design/skt.pen`: `Friends · waiting` and the older `Online · table (host)` and
  `Online · table (guest)` (phone, desktop, light, dark) say INVITE on the code plate.
  `Public · waiting` (four frames) has an Invite button under Add a bot. `Friends · states` has
  the two new hints and a state with COPIED. `Public · states` has Invite in its two waiting
  states, a house table with neither Invite nor code, and a state with COPIED. New frames
  `Online · join a table · invite` (phone, desktop, light, dark).
- `design/web.pen` has no `Friends` or `Public` frames. Its eight `Online · table` frames say
  INVITE, and it has the same four `Online · join a table · invite` frames.

## Your task

None. The page needs no field 139 does not have.

If you want to check it against `skt-server`: open a private table in one browser, press
Invite, open the copied address in a second browser, press Join table. Then sit down at a house
table from `/skull-king/online/public` and confirm there is no Invite.

## Contracts

- Frozen, as in 139: protocol 1, the meaning of `standing`, `lobby.join`, the six-character
  code, the path `/skull-king/online/join/` plus that code.
- If the code's alphabet or length ever changes, `TABLE_CODE` in
  `web/src/router/addresses.ts` and `NOT_CODE` in `web/src/online/OnlineScreens.tsx` change
  with it. Tell me through a handover.

## Report back

Only if something above is wrong, or your smoke fails. Then write a handover to
`docs/handover/` as a paste-ready prompt for Claude, printed in one code block, with the
address you opened, what the page showed and the frames the server sent.
