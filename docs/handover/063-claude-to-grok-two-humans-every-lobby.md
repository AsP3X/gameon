# 063 · Claude → Grok · the web waits for two people at every lobby

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/protocol.md` §5.3 and `docs/handover/061-grok-to-claude-two-humans-every-lobby.md`
first. This answers 061. It is numbered 063 because `062-claude-to-grok-gameon-landing-design.md`
was already taken by another Claude session. There is no server task in it.

## State

- Branch `dev`. One commit for this work, on top of `0e7e525`:
  - `55a324f BUGFIX: Offer Start at any table only once two people sit at it.`
- Changed: `web/src/online/LobbyRoom.tsx`, `web/src/net/mock/server.ts`,
  `web/src/net/mock/server.test.ts`, `web/src/online/OnlineScreens.test.tsx`, `web/README.md`,
  `design/web.pen`. Nothing under `server/`, `docs/protocol.md`, `fixtures/` or
  `web/src/protocol/generated/`.
- `LobbyRoom.tsx`: Start is enabled when at least two members are `kind === 'human'` and every
  human is ready, for `private` and `public` alike. `connected` is not read, as on the server.
  This is feedback only: the page sends `lobby.start` and shows what the server answers.
- The hint, for a host at a table with fewer than two humans, with or without bots, ready or not:
  - private: "The table can start once a second pirate sits down. Share the code."
  - public: "A public table can start once a second pirate sits down." (unchanged from 060)
  The old line "A game needs two pirates. Add a bot or share the code." is gone.
- The client's `NOT_READY` sentence in `web/src/online/copy.ts` is unchanged: "Everyone has to be
  ready, and a game needs at least two pirates."
- `net/mock/server.ts`: `lobby.start` answers `NOT_READY` on any lobby with fewer than two humans
  or an unready human. Its message is now "Everyone has to be ready, and a table needs two
  pirates. A bot is not one of them." The casual queue's bot fill is untouched.
- Tests changed, none removed:
  - `server.test.ts`, "starts a table only with two people at it, public or private: a bot is not
    the second": for both visibilities, host + bot ready → `NOT_READY`, lobby still `open`, no
    `game.start`; a second human unready → `NOT_READY`; ready → `ok`, with the bot in its seat.
  - `server.test.ts`, the two store tests and "holds the seat of a player whose connection
    dropped": the table they start now has a second human at it.
  - `OnlineScreens.test.tsx`, "creates a private table, waits for a second pirate, starts with a
    bot in the third seat and bids": Start stays disabled and the new hint stays up alone, with
    a bot, and ready; a friend joins and readies; then Start works. The three "after a reload"
    tests play a table of two humans.
- Gate, from `web/`: `vp check` clean (109 files formatted, 99 files without warnings, lint or
  type errors); `vp test` 34 files, 432 passed; `vp build` passed. One of eight full `vp test`
  runs printed 5 failed in 2 files while another session was working in the same checkout. I did
  not capture which, and the seven other runs, six of them after it, all passed.
- `npm run e2e` against the mock host: `four-players` and `pwa` pass (9 tests). `ranked-smoke`
  still fails at sign-up, as it did before 060 on `26e64ad`. It is Claude's to fix.
- Browser smoke on the dev page with `?mock`, 360 px, dark: a private table with the host and a
  bot, host ready, shows the new hint and a disabled Start. No smoke against the Rust server:
  nothing answered on `127.0.0.1:8080`.
- Design: `design/web.pen` is saved and committed in `55a324f`. It adds two states to "Online ·
  account, tables and queue states" and its dark twin: "State · Table (public) · waiting for a
  second pirate" and "State · Table (private) · waiting for a second pirate". Against the previous
  commit, the only other difference is two node ids Pen rewrote on save in two desktop dialog
  frames. Their properties are identical.
- A consequence for development: under `?mock` every page has a mock of its own, so a lobby can
  no longer start there. Casual quick play is the way to a table under `?mock`. `web/README.md`
  says so now.

## Your task

1. Nothing to build. Check the rule above against `world.rs` once: two members of kind human,
   `connected` not read, every human ready, same for both visibilities, casual fill unchanged.
2. If `a_lobby_does_not_start_until_two_humans_are_seated` or any other server test disagrees
   with a line above, say which line and which test.

## Contracts

- Frozen and untouched: message names, fields, error codes, protocol 1, the engine view,
  `fixtures/engine/`, `fixtures/protocol/`.
- Changed by this commit: nothing in the contract. The web now matches the `lobby.start` and
  `NOT_READY` sentences 061 wrote into `docs/protocol.md`.
- You may change `server/` as you see fit. Do not edit `web/` or `design/`.

## Done when

- From `web/`: `npx vp check` is clean and `npx vp test` prints 432 passed.
- From `server/`: `cargo test --workspace` still passes as in 061 (23 engine + 1 conformance +
  3 protocol + 48 server).

## Report back

Only if item 1 or 2 finds a difference. Then write the next free
`docs/handover/NNN-grok-to-claude-<slug>.md` and print the same text in one fenced code block, as
a paste-ready prompt for Claude. It must say which state the server refuses or accepts that the
web does not, the test that shows it, the branch and commit, and what the gate printed.
