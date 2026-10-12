# 060 · Claude → Grok · the web follows the public-lobby start rule

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/protocol.md` §5.3 and `docs/handover/059-grok-to-claude-public-lobby-two-humans.md`
first. This answers 059. There is no server task in it.

## State

- Branch `dev`. One commit on top of `26e64ad`:
  - `69e77bf BUGFIX: Offer Start at a public table only once two people sit at it.`
- Changed, all under `web/src/`: `online/LobbyRoom.tsx`, `net/mock/server.ts`,
  `net/mock/server.test.ts`, `net/mock/accounts.test.ts`, `online/Accounts.test.tsx`.
  Nothing under `server/`, `docs/protocol.md`, `fixtures/` or `web/src/protocol/generated/`.
- `LobbyRoom.tsx`: Start is enabled when every human is ready and, on a public lobby
  (`visibility === 'public'`), at least two members are `kind === 'human'`; on a private lobby,
  at least two members of any kind. This is feedback only. The page still sends `lobby.start`
  only from the host's button and shows whatever the server answers.
- The public-table hint changed. A host at a public table with fewer than two humans, with or
  without bots, now reads: "A public table can start once a second pirate sits down." It comes
  before the "say you are ready" line, because being ready does not help yet. A private table
  with one seat keeps "A game needs two pirates. Add a bot or share the code."
- The client's own `NOT_READY` sentence in `web/src/online/copy.ts` is unchanged: "Everyone has to
  be ready, and a game needs at least two pirates." It is true for both kinds of table.
- `net/mock/server.ts`: `lobby.start` answers `NOT_READY` on a public lobby with fewer than two
  humans, and on any lobby with fewer than two seats or an unready human. The mock's `NOT_READY`
  message is now "Everyone has to be ready, a game needs at least two seats, and a public table
  needs two pirates."
- Tests added or changed:
  - `server.test.ts`, "starts a public table only with two people at it, and a private one with
    the host and a bot": public host + bot, host ready → `NOT_READY`, lobby still `open`, no
    `game.start`; second human joins unready → `NOT_READY`; ready → `ok`; private host + bot → `ok`.
  - `Accounts.test.tsx`, "offers Start at a public table only once a second pirate sat down and
    is ready": the screen with one human and a bot shows the new hint and a disabled Start; with
    a second ready human Start is enabled and starts the game.
  - `accounts.test.ts`, "takes a lobby off the list while its game runs…": it started a public
    table with the host and a bot, which the rule now refuses. It seats a second human instead.
- Gate, from `web/`: `vp check` clean (109 files formatted, 99 files without warnings, lint or
  type errors); `vp test` 34 files, 432 passed (430 before, 2 new); `vp build` passed.
- `npm run e2e` against the mock host: `four-players` and `pwa` pass (9 tests).
  `ranked-smoke` fails at sign-up, line 47, before any lobby exists. It fails the same way on
  `26e64ad` without this commit, so it is not from this work. It is Claude's to fix (`web/e2e/`).
- Design: `design/web.pen` has a new state, "State · Table (public) · waiting for a second
  pirate", in "Online · account, tables and queue states" and its dark twin. It is in the
  running Pen app only. It is not on disk and not committed until the owner saves the file.
- Not done: no browser smoke against the Rust server. Nothing answered on `127.0.0.1:8080`, so
  the page was only exercised against the mock.

## Your task

1. Nothing to build. Read the rule above against `world.rs` and say if the two disagree
   anywhere: who counts as a human (a seated human whose socket dropped still counts on the
   web side, because the web counts `members` of `kind: 'human'`, not `connected`), and whether
   the server checks "two humans" before or after "every human ready". The web shows the
   two-humans hint first; the code is `NOT_READY` either way.
2. If the server treats a disconnected human differently for this rule, say which way, with the
   test name in `phase1_tests.rs`, so the hint and the button can follow.

## Contracts

- Frozen and untouched: message names, fields, error codes, protocol 1, the engine view,
  `fixtures/engine/`, `fixtures/protocol/`.
- Changed by this commit: nothing in the contract. The web now matches the `lobby.start` and
  `NOT_READY` sentences 059 wrote into `docs/protocol.md`.
- You may change `server/` as you see fit. Do not edit `web/` or `design/`.

## Done when

- From `web/`: `npx vp check` is clean and `npx vp test` prints 432 passed.
- From `server/`: `cargo test --workspace` still passes as in 059 (23 engine + 1 conformance +
  3 protocol + 48 server).

## Report back

Only if item 1 or 2 finds a difference. Then write `docs/handover/061-grok-to-claude-<slug>.md`
and print the same text in one fenced code block, as a paste-ready prompt for Claude. It must say
which state the server refuses or accepts that the web does not, the test that shows it, the
branch and commit, and what the gate printed.
