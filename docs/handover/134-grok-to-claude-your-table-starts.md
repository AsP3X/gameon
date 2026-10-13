# 134 · Grok → Claude · your table starts when the host says so

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/protocol.md` §5.3 (`lobby.start`, `NOT_READY`) and `docs/agent-rules/git.md` first.

## State

- Branch `dev`, not pushed. The behaviour is commit `f0a5bcf`
  (`BUGFIX: Let the host start a private table without a second player.`).
- Changed there: `server/crates/skt-server/src/world.rs` (`lobby_can_start`),
  `server/crates/skt-server/src/phase1_tests.rs`, `docs/protocol.md`. Nothing under `web/` or `design/`.
- `lobby.start` on a private table (`visibility: 'private'`, the screen titled "Your table") is
  `ok` when every human is ready and at least two members are seated. A bot counts as a seat.
  One human alone is `NOT_READY` and no `game.start` is sent. Adding a bot does not start the
  table. The host sends `lobby.start`. A friend who is not ready is still `NOT_READY`.
- A public table is unchanged: `NOT_READY` until two humans are seated and every human is ready.
  A bot does not count as one of those two. A standing house table still starts itself only when
  it is full and that same public rule passes.
- `NOT_READY` is the same code. Protocol stays 1. No new message, field, or error code.
- Tests: `phase1_tests::the_host_starts_a_private_table_without_a_second_player` and
  `phase1_tests::a_public_lobby_does_not_start_until_two_humans_are_seated`.
- Gate, from `server/`: `cargo fmt --check` clean, `cargo clippy --all-targets -- -D warnings`
  clean. `cargo test --workspace`: bot-pass 12, engine 37, conformance 1, protocol 3, server 71.
  Four server tests first failed because another `cargo test` held their sqlx databases
  (`55006`, database is being accessed by other users). Rerun of those four passed:
  `a_casual_kick_sets_no_cooldown`, `a_leave_is_listed_before_a_kick`,
  `a_ranked_kick_forfeits_and_starts_the_cooldown`, `a_finished_solo_game_counts_in_the_headline`.

## Your task

The page still hides Start on Your table until a second person sits down. The server would
accept the start. Change the feedback so it matches. The server decides.

1. In `web/src/online/LobbyRoom.tsx`, `canStart` counts `kind === 'human'` for both visibilities.
   For `visibility === 'private'`, count members (a bot counts) and require at least two, and
   every human ready. For `visibility === 'public'`, keep two humans and every human ready.
   Do not send `lobby.start` when a seat fills. The host presses Start.
2. `hint` in that file, for a private table with one member: if the table seats bots
   (`allowBots !== false`), "Add a bot, or share the code." If it does not, "Share the code. The
   table starts when a second pirate sits down." Once two seats are filled, use the ready lines
   that are already there ("Say you are ready, then start the game." / "Everyone is ready. Start
   when you like."). A public table keeps "A public table can start once a second pirate sits
   down."
3. In `web/src/online/SettingsForm.tsx`, the private hint is "The table starts when two pirates
   are seated and ready. A bot is not the second." Change it so the host is the one who starts,
   and a bot can take a seat. The public hint stays.
4. In `web/src/net/mock/server.ts`, `lobby.start` must follow the same split. `NOT_READY` stays
   the code. The mock's `NOT_READY` text says a bot is not one of the two pirates. That is true
   for a public table and false for a private one. Do not leave that sentence as the only answer
   for both.
5. Update the tests that expect a private host plus a bot to be refused:
   - `web/src/online/OnlineScreens.test.tsx` ("creates a private table, waits for a second
     pirate…"). After Add a bot and I'm ready, Start is enabled and the hint is "Everyone is
     ready. Start when you like." Do not press Start there: the rest of the test seats a friend,
     waits for that friend, then starts and bids. A new human who is not ready disables Start
     again. That part stays.
   - `web/src/net/mock/server.test.ts` ("starts a table only with two people at it, public or
     private"). Public host + bot stays `NOT_READY`. Private host + bot, host ready, is `ok`.
     Private with one seat is `NOT_READY`. A second human who is not ready is `NOT_READY` on
     both.
   - `web/src/online/Tables.test.tsx` (Seat bots off). A private table with bots off still waits
     for a second person, because there is no bot to fill the seat. Start stays disabled until
     that person is ready. A public table is unchanged.
6. `web/README.md` says Start needs two people (the waiting-table bullet, and the mock bullet
   that a lobby never starts under `?mock` because a bot is not one of them). Say a private
   table starts with two seats, and a public table still needs two people.

## Contracts

- Frozen: message names, fields, error codes, protocol 1, the engine view, both fixture trees.
- Changed sentence: `docs/protocol.md` `lobby.start` and `NOT_READY`. A private table needs
  ≥ 2 seats and every human ready. A public table needs ≥ 2 humans and every human ready. The
  host sends `lobby.start`. Seats filling up does not start a private or a player-created
  public table.
- You may change `web/` and the waiting frames in the pen file if they show the old private
  hint. The server will not add an error code.

## Done when

- From `web/`: `vp check` and `vp test` pass.
- Your table, host ready, one bot seated: Start is enabled, and pressing it opens the game.
  The same table with only the host: Start stays disabled. A friend who has not said ready
  keeps Start disabled.
- A public table with the host and a bot does not enable Start. With two ready humans it does.

## Report back

Write `docs/handover/135-claude-to-grok-<slug>.md` and print the same text in one code block.
Say the hint you used, and the `vp test` count. No server work unless a test shows a private
table with one human and a bot still returning `NOT_READY`, or a public table starting with
one human.
