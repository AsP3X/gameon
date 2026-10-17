# 202 · Grok → Claude · Look for open games

You are Claude, the callee, working on Skull King Tavern
(`C:\Users\asp3x\Documents\development\gameon`), branch `dev` at `b042611`.
Do this work yourself. Do not run `claude` or `grok`.

Read this file, `docs/ocho-protocol.md`, `docs/agent-rules/web-quality.md`,
`docs/agent-rules/design-sync.md`, `web/src/gameon/Games.tsx`,
`web/src/styles/gameon.css`, the Games tests in `web/src/gameon/GameOn.test.tsx`,
`web/src/ocho/wire.ts`, `web/src/ocho/client.ts`, and `web/src/ocho/wire.test.ts`.

## State

Grok listed Ocho's public tables. `ocho.create` takes optional `open`.
Absent or false stays a private friends table. `ocho.tables` answers with
waiting public tables, full ones included, oldest first, and the frame
arrives before `ok` for that id. A row is
`{ id, hostName, players, seated, teams, match }` where `match` is `one` or
`to500`. There is no join code on that frame, and a private table is not in
it. `ocho.join` is still the code. `ocho.joinOpen` takes `lobby` (the lobby
id) and sits there. A private or missing id is `NOT_FOUND`, "That table is
gone." A full or already dealt public table is `LOBBY_FULL`, "That table is
full."

Gates for that commit: `cargo fmt -p ocho-server --check` clean,
`cargo clippy -p ocho-server --all-targets -- -D warnings` clean,
`cargo test -p ocho-server` 10 passed. `cargo test --workspace` passed
ocho-engine (19), ocho-server (10), bot-pass (12), skt-engine (37) and the
engine fixtures. `skt-protocol`'s two output tests failed on CRLF against LF
in files this change did not touch. Leave them.

The Games page still has an inline list, "Open tables · Skull King", and a
phone sheet of the same list. Replace that with one dialog for both games.

## Your task

1. Teach the Ocho client the new frames, in `web/src/ocho/wire.ts` and
   `web/src/ocho/client.ts`.
   - `ocho.create` may include `open?: boolean`. Omitting it stays valid.
   - Intent `{ t: 'ocho.tables' }` and `{ t: 'ocho.joinOpen'; lobby: string }`.
   - `parseFrame` accepts `ocho.tables`. A row missing `id`, `hostName`,
     `players`, `seated`, `teams`, or `match` is not a frame. `match` is only
     `one` or `to500`.
   - `OchoState.tables` starts `null`. An `ocho.tables` frame sets it,
     including `[]`. `forget()` does not clear it.
   - Unknown `t` still parses as null. An older lobby without `open` still
     parses. Do not require `open` on `ocho.lobby`.
   - Cover this in `wire.test.ts` and `client.test.ts`. Push the tables frame,
     then `ok`, and the state holds the rows when the promise resolves.

2. Replace the inline open-tables list. `GameOn` already keeps one
   `OchoClient`. Pass it into `Games`. Do not open that socket until the
   dialog opens.

   On a wide window the left column is no longer a list. It is a short panel:
   heading "Open games", the line "Skull King and Ocho, in one list.", and a
   button "Look for open games". Your seat stays in the right column. The
   phone bar stays Tables and You. Tables opens the same dialog. The page
   itself does not list rows, on either width.

   The dialog is one overlay for both widths. Title "Open games".
   - A search field, label "Search tables", placeholder "A name or a game".
     Focus it when the dialog opens.
   - Chips All, Skull King, Ocho. All starts pressed. They filter the rows
     already loaded. They do not ask the server again.
   - Search is case-insensitive and matches the host name, the game name
     ("Skull King" or "Ocho"), and the row's visible detail. No match says
     "No table matches that."
   - Escape, the close button, and a click on the scrim close it and return
     focus to the button that opened it. A click on the panel does not.
   - Growing the window wide closes the You sheet, as it does now. It does
     not close this dialog. The You sheet still does not open on a wide window.

   On a phone the dialog is the existing bottom sheet (class `go-sheet` so
   the tests' opener still finds it). On a wide window it is centered, max
   width 560, radius 16, a 2px `var(--line)` border and a 4px lip
   (`0 4px 0 var(--line)`), not a bottom sheet. Tokens from
   `web/src/styles/tokens.css` only. Targets at least 44px. Contrast at least
   4.5:1. Green text on the page background stays `--green-ink`. Do not
   change the landing, the nav, or the Games link colour.

3. The list is both games, in one list.
   - Skull King still comes from `online.publicLobbies()`. Keep a row only
     when `players < settings.maxPlayers`. Copy stays `describeRow`: the
     format pill, the title, the rounds, the seats. Join still calls `onJoin`.
     A table that fills in the meantime still lands on the public list with
     "That table is full."
   - Ocho comes from `ocho.tables` after `ocho.open()` and
     `{ t: 'ocho.tables' }`. Hide a row when `seated >= players`. The pill is
     "Ocho". The title is `{hostName}'s table` with the same apostrophe
     `describeRow` uses (`’`). The detail is "Teams" or "Free-for-all", then
     "One hand" or "First to 500", then `{seated} of {players} seats`.
   - Ocho sends no host colour. The avatar is plain, the initial of the host
     name, and no colour is invented. A Skull King avatar stays the host
     colour the server sent, and plain when it sent none.
   - Host names are React text.
   - Join on an Ocho row sends `ocho.joinOpen` with that row's `id`, then on
     `ok` goes to `/games/ocho`. `NOT_FOUND` shows "That table is gone."
     `LOBBY_FULL` shows "That table is full." Either one asks for the list
     again. Do not send the code.
   - There is no six-row cap. Do not link "All public tables" from Games.
     Keep "Join with a code" to `/skull-king/online/join`.
   - Order: Skull King rows in the order `publicLobbies` returned, then Ocho
     rows in the order `ocho.tables` returned. The chips and the search hide
     rows. They do not reorder them.
   - The count pill is the number of rows after the free-seat filter and
     before search and chips.

4. Loading, failure, empty, disconnected. Do not hide one game because the
   other is late.
   - While a side has not answered, `role="status"` and
     `aria-label="Looking for open games"`. Rows already in hand stay visible.
   - Skull King failed: alert "Skull King’s tables could not be loaded." and
     Try again, which refetches only that list. Ocho's rows stay.
   - Ocho failed, including `OFFLINE`: alert "Ocho’s tables could not be
     loaded." and Try again, which sends `ocho.tables` again. Skull King's
     rows stay.
   - Both failed: "The tables could not be loaded." Try again does both.
   - Both ready and no row has a free seat: "No open tables right now. Open
     one and others can sit down."
   - When `who` is unknown, do not offer the dialog. The page banner
     "Not connected. Trying again…" stays, and there is no table control.

5. Create stays in the dialog, under the list, including when the list is
   empty.
   - "Open a Skull King table" links to `/skull-king/online/public/new`.
     Do not rebuild that form.
   - Ocho is a short form, the same choices as sit-down: players 2 to 8
     (default 4), Free-for-all or Teams (Teams locks 4 players), One hand or
     First to 500 (default One hand). The button is "Open an Ocho table".
     It sends `ocho.create` with those fields and `open: true`, and no
     `bots`, then `ocho.ready` with `ready: true`, then goes to
     `/games/ocho`. Show the server's error sentence and do not navigate on
     it. Disable the button while the Ocho link is not online or a send is
     in flight.

6. Draw it in `design/gameon.pen` through the Pencil tools only. Do not
   hand-edit the file. The frames are `UCTe9` (Games · desktop, 1440, light),
   `p6mx6u` (desktop, dark), `I69lR` (Games · phone, 390), and `vk1Nh`
   (phone, dark). Do not resize the desktop frames. Do not add a frame
   somewhere else and call that the change.

   On each frame the library stays: heading, shelf, the two live games,
   Your seat on the desktop, Coming soon, the footer on desktop, the Tables
   and You bar on the phone. The open-tables list is gone. The desktop left
   column is the Open games panel and the button. Draw the dialog open on
   top of all four frames, scrim behind it, so the overlay is what the frame
   shows.

   Sample rows, and no other person: a Skull King house row "Open table",
   Swift, plain avatar, "5 rounds · 5 cards each", "0 of 4 seats"; Anne's
   Skull King row, Swift, "Anne’s table", "1 of 3 seats", her avatar a table
   colour the file already uses; Anne's Ocho row, plain avatar, "One hand",
   "1 of 4 seats". Chips with All pressed. The search field. Under the rows,
   "Open a Skull King table" and the Ocho choices with "Open an Ocho table".
   Light and dark use the same tokens. Nunito. Pirata One only if the Skull
   King wordmark is already in the frame. No new hex, no glass, no gradient,
   no emoji, no small-caps. No felt floor.

   Pen on this machine is `C:\Program Files\Pencil\Pen.exe`. Two windows are
   often open. Ctrl+S must hit `gameon.pen`, not Dashboard. After a real
   save, report the file's byte size and last write time. If you cannot put
   focus on `gameon.pen`, stop and say the drawing is only in the open
   document. Do not commit a `.pen` file.

7. Tests in `GameOn.test.tsx`. Update the ones that read the inline list.
   Do not weaken an assertion that is still true.
   - The library test looks for the Open games panel and the button, not
     `.go-tables` on the page. The phone bar is still Tables and You.
   - Empty, the failed list, Mary's row, the house formats, and the long
     list are asserted inside the dialog. The long list shows every row that
     has a seat, not six of them.
   - Add an Ocho row beside a Skull King row and check the chip, the search,
     the plain avatar, and that Join sends `ocho.joinOpen` and lands on
     `/games/ocho`.
   - A private Ocho table is not a row you invent on the client. If the
     frame did not include it, it is not shown.
   - Escape, close, and the scrim still close the dialog and return focus.
   - Replace "uses no dialog on a wide window": the You sheet stays closed
     on a wide window, and "Look for open games" opens this dialog.
   - `openAt` passes `ochoSocket` from `fakeOcho()` into `App`. `openFrame`
     passes that client into `GameOn` as `ocho`. Opening the dialog must not
     dial a real WebSocket. Push `ocho.tables` (then `ok` for the id the page
     sent) when a test needs Ocho rows. A test that never opens the dialog
     does not need a frame.

## Contracts

Do not edit `server/`, `docs/ocho-protocol.md`, `web/src/protocol/generated/`,
`fixtures/`, `tokens.css`, or `PRODUCT.md`. Do not change the landing. Do not
change sit-down's create: it still omits `open`. Skull King's public list
and `onJoin` stay the way into a Skull King seat.

## Done when

From `web/`: `vp check --no-fmt` reports no warnings or type errors. `vp fmt
--check` passes on the files you touched. `npm test` passes. `vp build`
builds. A full `vp check` may still report pre-existing CRLF formatting on
untouched files. Say so if it does. Do not reformat the repo to silence it.

## Git

Branch `dev`. Commit only your `web/` paths, after those gates, with a
`TASK:` message. No `Co-Authored-By` trailer. Do not push. Do not create a
branch or a worktree. Do not commit the pen file, and do not commit
`server/` or `docs/`.

## Report back

In the CLI result: what the dialog does, the test counts, the build, and
whether `design/gameon.pen` was saved (size and write time) or is only in
the open Pen document. No return handover. This task ends with you.
