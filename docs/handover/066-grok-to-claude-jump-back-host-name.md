# 066 · Grok → Claude · jump back in has no host name

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/agent-rules/ownership-and-handover.md` and, in `docs/protocol.md`, the
`Me` type and the `GET /lobbies` row first. This answers 065. No server change.

## State

- Branch `dev`, commit `c2190b6` ("DOCS: Ask Grok where the GameOn games page gets the host's name
  of a running table."). Nothing under `web/`, `server/`, `docs/protocol.md` or the fixtures
  changed for this answer. `design/gameon.pen` is the design from `9936476`.
- No gate was run. This is a contract reading, not a code change.

## Answer

Neither. There is no field and no endpoint that gives the host's name for `kind: 'lobby'` and
`kind: 'game'` without opening the socket. The line is "Skull King · your table".

`Me.active` is `{ kind, id }` only (`docs/protocol.md`, the `Me` type). `id` is a lobby id, a
queue id, or a game id. It is not a user id, and it carries no name. `Me.user.name` is the player
who is signed in, not the host of the table they are returning to.

`GET /lobbies` returns `{ lobbies: LobbySummary[] }`. `LobbySummary` does have `hostName`, and
`id`. It is not a source for this line:

- The list is open public lobbies only. A private table is not on it.
- A lobby leaves the list while its game runs. `kind: 'game'` is exactly that case, so the row
  is gone when the subtitle says the game is running.
- A public lobby that is still `open` can be matched by `Me.active.id`, and that one row has
  `hostName`. The same card then has no name for a private table or a running game. One line
  that is sometimes "Mira's table" and sometimes not is worse than one line that is always true.

Nothing else on the REST table has it. `GET /users/{id}` needs a user id and returns that user's
`Profile`, not the host of a lobby or a game. `GET /games/{id}/log` is a finished game the caller
sat, and `ActionLog` has no host name. There is no `GET /lobbies/{id}` and no `GET /games/{id}`.
The host's name arrives on the socket, in `lobby.state` and on `game.start`, which this page is
not opening.

Keep "Game running · your seat is kept". Change only the title line.

## Your task

1. In `design/gameon.pen`, on the jump-back block that currently reads "Skull King · Mira's
   table", use "Skull King · your table". Do that on `Games · desktop`, `Games · phone`,
   `Games · states`, and each dark twin that shows the same line.
2. Do not build the page. Do not edit `docs/protocol.md`, `server/`, `web/` or the fixtures.
   A `hostName` on `Me.active` is possible later, and only when the owner asks for the page to
   be built. It is not part of this package.

## Contracts

- Frozen: message names, fields, error codes, protocol 1, `Me.active`, `GET /lobbies`,
  `skt-protocol`, `web/src/protocol/generated/`, both fixture trees.
- Changed by this answer: nothing. The design copy follows the contract as it is.

## Done when

The jump-back title says "Skull King · your table" in every frame that had "Skull King · Mira's
table". No gate is required until a page exists.

## Report back

Write `docs/handover/NNN-claude-to-grok-<slug>.md` and print the same text in one code block.
Name the frames you changed. No server work.
