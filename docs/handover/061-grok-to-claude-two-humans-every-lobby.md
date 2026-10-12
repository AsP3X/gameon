# 061 · Grok → Claude · every lobby waits for two people

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/protocol.md` §5.3 and `docs/agent-rules/git.md` first.

## State

- Branch `dev`. One commit on top of `57c622b`:
  - `BUGFIX: Refuse to start a lobby until two people are seated.`
- Changed: `server/crates/skt-server/src/world.rs`, `server/crates/skt-server/src/phase1_tests.rs`,
  `docs/protocol.md`, and this file. Nothing under `web/` or `design/`.
- `lobby.start` is `NOT_READY` on a public lobby and on a private lobby until two humans are
  seated and every human is ready. A bot fills a seat and does not count. A dropped socket stays
  a human (`connected` is not read). Test: `a_lobby_does_not_start_until_two_humans_are_seated`
  in `phase1_tests.rs`. The public half was already refused. The private half used to start with
  the host and a bot; it now returns `NOT_READY` and does not send `game.start`.
- Casual quick play is unchanged. One person in the casual queue still starts a game after the
  fill wait, and the empty seats are bots. That path is not a lobby.
- `NOT_READY` is the same code. `docs/protocol.md` now says every lobby needs ≥ 2 humans. No new
  message, field, or error code. Protocol stays 1.
- Gate, from `server/`: `cargo fmt --check` clean, `cargo clippy --all-targets -- -D warnings`
  clean, `cargo test --workspace` 23 engine + 1 conformance + 3 protocol + 48 server, all passed,
  on a throwaway Postgres.

## Your task

1. In `web/src/online/LobbyRoom.tsx`, count humans for Start on a private lobby as well as a
   public one. `canStart` still uses `members.length` for `visibility === 'private'`, so one
   person plus a bot enables Start and the server answers `NOT_READY`. Require at least two
   `kind === 'human'` for both visibilities, and every human ready.
2. The private hint "A game needs two pirates. Add a bot or share the code." is wrong once a bot
   is seated and the second person is still missing. Use the same idea as the public line: the
   table starts when a second pirate sits down. Adding a bot does not meet the two.
3. In `web/src/net/mock/server.ts`, `lobby.start` must refuse a private lobby with fewer than two
   humans the same way it refuses a public one. `NOT_READY` stays the code.
4. Update the tests that start a private table with the host and a bot and expect `ok` or a
   game. Known ones: `web/src/net/mock/server.test.ts` ("a private one with the host and a bot")
   and `web/src/online/OnlineScreens.test.tsx` ("creates a private table, adds a bot, readies,
   starts"). A private table with two humans and a bot still starts. Two ready humans with no
   bot still start.

## Contracts

- Frozen: message names, fields, error codes, protocol 1, the engine view, both fixture trees.
- Changed sentence: `docs/protocol.md` `lobby.start` and `NOT_READY`. Every lobby needs ≥ 2
  humans and every human ready. Bots do not count. Casual fill is unchanged.
- You may change `web/` and `design/web.pen` for the hint. The server will not add an error code.

## Done when

- `vp check` and `vp test` pass.
- A private lobby with one human and a bot does not enable Start and the mock answers
  `NOT_READY`. With two ready humans, Start works, with or without a bot. The public case from
  060 still holds.

## Report back

Write `docs/handover/062-claude-to-grok-<slug>.md` and print the same text in one code block.
Say the hint you used, and the `vp test` count. No server work unless a test shows a lobby
starting with one human.
