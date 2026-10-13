# 141 · Grok → Claude · a public table keeps its rules

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/protocol.md` §3 (`RULES_LOCKED`) and §5.3 (`lobby.settings`), and
`docs/agent-rules/git.md` first. The waiting room is `web/src/online/LobbyRoom.tsx`. The rules
form is opened from `OnlineScreens` in `web/src/online/OnlineScreens.tsx`. The mock is
`web/src/net/mock/server.ts`. Player-facing copy is `web/src/online/copy.ts`.

## State

- Branch `dev`, not pushed. The server change is commit `ef333c7`
  (`BUGFIX: Refuse a rules change on a public table.`).
- Changed there: `docs/protocol.md`, `README.md`, `server/crates/skt-protocol/src/error_code.rs`,
  `server/crates/skt-server/src/world.rs`, `server/crates/skt-server/src/phase1_tests.rs`,
  `server/crates/skt-server/src/phase2_tests.rs`, `web/src/protocol/generated/ErrorCode.ts`.
  Nothing else under `web/`, and no pen file.
- Protocol stays 1. New code `RULES_LOCKED`, HTTP 409. The message is
  `A public table keeps its rules.`
- `lobby.settings` on an open public table is `RULES_LOCKED` for the host and for anyone else
  at the table. The server writes nothing: the settings stay, ready flags stay, and there is
  no `lobby.state`. The same settings object sent again is still `RULES_LOCKED`.
- Checked in this order. `maxPlayers` outside 2..8 is `VALIDATION` before the table is looked
  at. An open public lobby is then `RULES_LOCKED`. Anything else falls through to the old
  checks: not in a lobby is `NOT_IN_LOBBY`, a lobby that is not `open` is `LOBBY_STARTED`
  (including a public game that has started), a private table's non-host is `NOT_HOST`, and
  a private host's `lobby.settings` is `ok`, clears every human's ready, and pushes
  `lobby.state`.
- `lobby.create` with `visibility: 'public'` still accepts the settings the table opens with.
  `solo.start` still accepts its settings. Solo is not a lobby, so it has no `lobby.settings`.
  A standing house table can no longer be moved off its format. Filling one, or starting one,
  still opens a fresh empty table of a format that has no free seat. `standing` is unchanged.
- Tests: `phase1_tests::a_private_table_changes_its_rules_and_a_public_one_does_not` (a private
  host's change to rascal, brawl and loot clears ready; a public host and a guest both get
  `RULES_LOCKED` and the swift rules stay) and
  `phase1_tests::a_player_table_omits_standing_and_a_house_table_sends_it` (the house table's
  `lobby.settings` is `RULES_LOCKED`). `phase2_tests::a_house_table_keeps_its_format` replaces
  `changing_a_house_table_off_its_format_opens_a_fresh_one`: the five-table list does not grow.
- Gate, from `server/`: `cargo fmt --check` clean, `cargo clippy --all-targets -- -D warnings`
  clean. `cargo test --workspace`: bot-pass 12, engine 37, conformance 1, protocol 3, server 73.
- From `web/`, on this tree: `npm run check` clean (154 formatted, 142 without warnings).
  `npm test` 51 files / 739 passed. The page still shows Change on a public table, so that
  button was not exercised against the new refusal.

## Your task

The waiting room of a public table shows the rules and does not offer to change them. A private
table and a solo game still do.

1. Waiting room. In `LobbyRoom.tsx`, the Change button is `host && open` today. Show it only
   when the lobby is also `visibility === 'private'`. A public table, house or player-created,
   keeps the rules plate and has no Change button. Guests already have no button.
2. Rules form. `OnlineScreens` opens `SettingsForm` when `rules === lobby.id` and the player is
   the host of an open lobby. Add `lobby.visibility === 'private'`. A public lobby never opens
   that form, including after a reload that still has the rules state set.
3. Copy. In `web/src/online/copy.ts`, `RULES_LOCKED` says `A public table keeps its rules.`
   The server sends that same sentence. A code without a line still shows the server message.
4. Mock. In `web/src/net/mock/server.ts`, an open public lobby answers `lobby.settings` with
   `RULES_LOCKED` and that message, for the host and for a guest, and does not change settings
   or ready flags and does not push `lobby.state`. `maxPlayers` outside 2..8 stays
   `VALIDATION`. A lobby that is not `open` stays `LOBBY_STARTED`. A private host still saves
   and clears ready. A private guest stays `NOT_HOST`. Add the code to `MESSAGES` next to
   `BOTS_DISABLED`.
5. Tests. A public host has no Change button. A private host still has it, and saving still
   clears ready. The mock refuses `lobby.settings` on a public lobby with `RULES_LOCKED` and
   leaves the rules and the ready flags as they were.
6. Pen. In the file that already holds `Public · waiting` and `Friends · waiting`
   (`design/skt.pen`; also `design/web.pen` if those frames are there), the public waiting
   room has no Change control. The private waiting room keeps Change. The solo setup keeps
   its rules. Do not draw a second way to edit a public table. Grok did not edit a pen file.
7. Leave the public create form. Listing a public table still sends `lobby.create` with the
   chosen settings once. The door can keep "You pick the rules." Those rules are then fixed.
   Solo still sends them on `solo.start`.

## Contracts

- Frozen: protocol 1, message names, `GameSettings` fields, `lobby.create`, `solo.start`,
  `standing`, and the meaning of `NOT_HOST`, `LOBBY_STARTED` and `VALIDATION`.
- You may change `web/` outside `web/src/protocol/generated/`, and the pen files. Do not change
  `server/`, `docs/protocol.md`, or the generated `ErrorCode`. `RULES_LOCKED` is already in it.

## Done when

- From `web/`: `npm run check` and `npm test` pass, including the new public-table cases.
- A public waiting room, house or player-created, shows the rules and no Change button, in
  light and dark, at 360 px and a wide window. A private waiting room still opens the rules
  form and saves them. Solo setup still starts with the rules the player chose.
- The mock matches the server order above.

## Report back

Write `docs/handover/NNN-claude-to-grok-public-rules-stay.md` and print the same text in one
code block. Say the commit, what the tests printed, and whether the public waiting room no
longer offers Change. No return server work unless the page needs a message this handover
does not name.
