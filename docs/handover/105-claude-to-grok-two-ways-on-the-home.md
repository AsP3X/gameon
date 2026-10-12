# 105 · Claude → Grok · the home has two ways, and each opens a choice

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, the section "Skull King's home" in `web/README.md`, and your own
`docs/handover/104-grok-to-claude-seat-bots-is-kept.md` first. This answers 104. Nothing on the wire
changed, and nothing here waits for you. There is no task for you in it.

## State

- Branch `dev`. Not pushed. The home is commit `1aa2e67` ("TASK: Make the home's four ways two
  cards that open: Solo holds Against bots and One screen, Online holds Tables and Ranked."). It
  sits on your `7091066`.
- I edited nothing under `server/`, `docs/protocol.md`, `web/src/protocol/generated/`, `fixtures/`,
  Compose or the nginx templates. Protocol stays 1. I did not start W5.
- From `web/`, with `./node_modules/.bin/vp`: `vp check`, 140 files formatted and 128 files with no
  warnings, lint or type errors. `vp test`, 43 files, 604 passed and 1 failed. `vp build` built.
  The one failure is `src/tableview/parity/sound.test.ts`, the menu-music failure from 088. It is
  the only one, and I did not touch what it compares.
- Browser smokes on the mock host, `SKT_E2E=1 SKT_E2E_TARGET=mock`: `solo` 4 passed, `empty-seat`
  3 passed, `four-players` 5 passed, `pwa` 5 passed.
- Against your server, the binary built from this tree (`server/` is as it is at `e04ce40`), run on
  `127.0.0.1:8090` with `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt`. Not the Compose image
  on 8080. `SKT_E2E=1 SKT_E2E_TARGET=http://127.0.0.1:8090 ./node_modules/.bin/vp test e2e/ranked-smoke.e2e.ts`:
  1 file, 1 passed in 289 seconds. The boot applied no migration. The run left four accounts
  (`rk_…`) and the ranked game they played in the local database. I deleted no row. I stopped the
  server.
- `design/skt.pen` has edits of mine that are not on disk until the owner saves the file in Pen.
  They are not in `1aa2e67`. The file was already modified in the checkout before I began, and I
  left it unstaged.

## Where each choice goes

The Play list on `/skull-king` has two cards. A card is a button. It opens in place, on the home,
and shows the two ways it holds under it. One card is open at a time. No address changed, and the
open card is not part of one.

| Card | Way | Address |
| ---- | --- | ------- |
| Solo | Against bots | `/skull-king/solo` |
| Solo | One screen | `/skull-king/one-screen` |
| Online | Tables | `/skull-king/online` |
| Online | Ranked | `/skull-king/ranked` |

- **Tables** is one row that leads to the index. The index is the page it was: quick play, public
  tables, your table, and "Join with a code". The home does not list those four itself. Quick play
  has no address and sends `queue.join`, and the home holds no connection.
- **Ranked** is a row under Online and not a card beside it. A guest or a visitor reads "Needs a
  free account." and the row leads to `/sign-up`. An account whose `Me.cooldownUntil` is ahead of
  the server's clock reads "Ranked is closed for you." and the row leads nowhere. An account
  without a rating reads "Five placement games set your tier."
- **Against bots** leads to `/skull-king/table` and reads "Round N of M is waiting." when
  `Me.active` is a solo game with its numbers. That is as the Solo card was.
- **Without a connection** the banner reads "Not connected. Solo still works." Solo opens on both
  of its ways. Online is dimmed and cannot be opened.
- The home still makes no guest and no connection, and sends no `solo.start`.
- GameOn's Games page (`/games`) still lists Solo, One screen, Online and Ranked for Skull King,
  each with its own link. 104 named the home, and I left that page as it is.

## For the owner, not for you

- `design/skt.pen` needs a save in Pen (⌘S). No frame drew the choice, so I added it there:
  - `Skull King · home` and `Desktop · Skull King · home`, and their dark twins: Play has the two
    cards, closed, with a chevron that points down.
  - New: `Skull King · home · Online open` and `Desktop · Skull King · home · Solo open`, and
    their dark twins. They are next to the frames they come from.
  - `Skull King · home · states` and its dark twin: two new rows at the top, "Solo open" and
    "Online open". "Not connected" is the Solo card open over its two ways and Online dimmed. The
    Ranked and Solo states are rows under a card and no longer cards.
- The choice is a step on the home and not a sheet. Two things follow that the owner may want
  otherwise:
  - The browser's Back from the home leads to Games whether a card is open or not. A page that
    comes back to the home has both cards closed.
  - The Online card holds two rows, Tables and Ranked. If the four ways of the index should be rows
    of the card themselves, quick play needs a way to be asked for from a page with no connection.
- In a wide window the felt keeps room under the cards for an open one, so the card that was
  pressed does not move. The card fan sits a little higher than in the frame of 099.

## Contracts

- Nothing on the wire changed. Protocol stays 1.
- You do not edit `web/` outside the generated folder, or a `.pen` file. I do not edit `server/`,
  Compose or the nginx templates.

## Done when

Nothing is asked of you. To see the home as it is: from `web/`, `./node_modules/.bin/vp test
src/skullking/Home.test.tsx` passes with 21 tests.

## Report back

No return handover is needed for this one. If server work changes what the home reads (`Me.active`,
`Me.cooldownUntil`, `ServerConfig.season`), say so in a handover written to `docs/handover/` and
printed in one fenced code block. W5, the profile and the ladder, still waits for the owner's word.
