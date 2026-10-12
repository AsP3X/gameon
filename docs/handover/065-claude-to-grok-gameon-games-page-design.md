You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/agent-rules/ownership-and-handover.md` and, in `docs/protocol.md`, the
`Me` type and the `GET /lobbies` row first. This handover asks one question and no code.

## State

- Branch `dev`, commit `9936476` ("ADD: Design the GameOn games overview page for desktop and
  phone."). Nothing under `web/`, `server/`, `docs/protocol.md` or the fixtures changed.
- New frames in `design/gameon.pen`, each with a dark twin: `Games · desktop` (1440 wide),
  `Games · phone` (390 wide) and `Games · states`.
- The Games page is the overview of GameOn for a player with a session, guest or account. Top to
  bottom: navigation with the player's name and tier; the title with filters (All, Cards, Board,
  Dice); "Jump back in"; the Skull King card with its four ways in (Solo, One screen, Online,
  Ranked), Play and How to play; the coming games; the footer. Desktop has a rail on the right
  with "Your seat" (name, username, rating, tier, ranked games of the season, "Find a ranked
  game") and "Open tables" (host, seats taken of `maxPlayers`, format, Join, "All public tables",
  "Join with a code"). The phone page has the open tables as a card and no "Your seat".
- What each block reads, all from the contract as it is: the navigation and "Your seat" from `Me`
  (`user.name`, `user.tier`, `username`, `rating`); "Open tables" from `GET /lobbies`
  (`hostName`, `players`, `settings.maxPlayers`, `settings.format`); "Jump back in" from the
  offline save on the device, or from `Me.active`.
- `Games · states` shows: jump back in to an online table, open tables loading, none and could
  not load, not connected, the navigation of a guest, "Your seat" of a guest and of an account
  with no rating yet.
- Design only. No page was built, so no gate was run.

## Your task

1. Do not build anything for this yet.
2. Answer one question in your next handover. "Jump back in" for an online game reads
   "Skull King · Mira's table" and "Game running · your seat is kept". `Me.active` is
   `{ kind, id }` only. For `kind: 'lobby'` and `kind: 'game'`, where would you have the page get
   the host's name without opening the socket: a field on `Me.active`, or an existing endpoint I
   have missed? If neither, say so, and the line becomes "Skull King · your table".

## Contracts

- Frozen and untouched: `docs/protocol.md`, `skt-protocol`, `web/src/protocol/generated/`,
  `fixtures/`. A new optional field on `Me.active` would be an additive change; it goes through
  `docs/protocol.md` first, in a handover, when the owner asks for the page to be built.
- You may not edit `design/gameon.pen` or `design/brand/gameon/`.

## Done when

There is nothing to run. Your reply answers item 2.

## Report back

A paste-ready prompt for Claude in `docs/handover/NNN-grok-to-claude-<slug>.md`, also printed in
one fenced code block, holding the answer to item 2.
