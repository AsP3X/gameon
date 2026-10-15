# 174 · Grok → Claude · Add Ocho bots in the list, and use the desk

You are Claude, the callee, working on Skull King Tavern
(`/Users/niklas/Documents/development/gameon`), branch `feature/game-ocho`, commit `6138a77`.
Do this work yourself. Do not run `claude` or `grok`. Do not edit `server/` or
`docs/ocho-protocol.md`.

Read `docs/ocho-protocol.md` (the new `ocho.addBot`, `ocho.removeBot`, and `ocho.bots`
rows). Then `web/src/online/LobbyRoom.tsx` (the crew list, "Add a bot", remove) and
`web/src/online/SettingsForm.tsx` (Bot skill). Then `web/src/ocho/Ocho.tsx` (`SitDown`,
`Waiting`), `web/src/ocho/wire.ts`, `web/src/styles/ocho.css` (`.oc-sit`), and
`web/src/ocho/Ocho.test.tsx`. Open `design/ocho.pen` in Pen and edit it only through the
Pencil tools. Do not commit a `.pen` file.

## State

The server can seat one bot at a time. The page still picks Easy, Normal, or Hard on
sit-down and sends `bots` on `ocho.create`, which fills every other seat. Sit-down and the
waiting room are a 520 px card in the middle of the desk.

## Your task

### The list, like Skull King

Take the Bots choice off sit-down. `ocho.create` omits `bots`. The host adds bots on the
waiting list.

Match `LobbyRoom`'s crew, in Ocho's own classes and tokens:

- Heading `Players · {n} of {players}`.
- Each person: avatar, name, small line (Host, or Player, or Team 1 / Team 2), Ready pill.
- Each bot: avatar, name (Nico, Luz, …), small line `Bot`. No Ready pill. The host gets a
  remove button, accessible name `Remove {name}`, which sends
  `{ t: 'ocho.removeBot', index }` where `index` is that member's place in `members`.
- Each empty seat is a row: an empty avatar, the words `Open seat`.
- While the host has an open seat, a ghost button `Add a bot` sends `{ t: 'ocho.addBot' }`.
- Under the list, when a seat is open: `Add a bot, or give them the code.`
- Bot skill, host only, the same three segments as Skull King: Easy / Makes mistakes,
  Normal / Solid play, Hard / Reads the table. It sends `{ t: 'ocho.bots', bots }`. The
  server then marks every person not ready. When `lobby.bots` is absent, Normal is shown
  and the first `ocho.addBot` is Normal without a prior message. A guest sees the skill as
  text, not buttons, and sees no Add or Remove.

A friends table with no bots still shows the code line
`Give this code to the others. They join from Ocho’s sit-down page.` Drop
`The other seats are Hard bots.`

### The desk

`.oc-sit > *` is `max-width: 520px`, so a wide window is an empty margin around one card.
From 720 px up, use the width, up to about 1040 px. Phone stays one column and holds at
360 px with no horizontal scroll.

- Sit-down: the table settings on the left, Join with a code on the right, side by side.
- Waiting: the player list on the left, the code, the skill, and Ready / Start on the right.
  Eight open seats have to fit without a skinny column.
- The table felt may grow with the window, up to about 1200 px, so eight seats are not
  crushed in a 960 px strip. The hand stays centred under it.

Draw the desk and the phone for sit-down (no Bots choice) and for the waiting list with an
open seat, one bot, Add a bot, Remove, and the skill. Light and dark.

## Done when

`vp check` is clean, `vp test` passes, and `vp build` passes. If `node` is not on `PATH`,
prepend `/tmp/node-v22.23.3-darwin-arm64/bin`. Commit only `web/` on `feature/game-ocho`,
prefix `ADD:`, author `Niklas Vorberg <services@vorberg-webmail.de>` if git would use a
hostname address. No AI attribution. Do not push. Do not create a branch.

## Report back

The CLI result is the report. No return handover unless the server is wrong. Include the
commit, the test count, and whether ⌘S is still required.
