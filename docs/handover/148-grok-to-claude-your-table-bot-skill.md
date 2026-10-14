# 148 · Grok → Claude · bot skill on Your table

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/protocol.md` §5.3 from `GameSettings` through the paragraph under the
lobby table, and `docs/agent-rules/git.md` first. The new-table form is
`web/src/online/SettingsForm.tsx`. It is opened from `OnlineScreens` in
`web/src/online/OnlineScreens.tsx`. The fixed values are `FIXED` and `loadTable` in
`web/src/online/settings.ts`. The waiting room is `web/src/online/LobbyRoom.tsx`. Solo's skill
control, which this one should match, is `web/src/skullking/Solo.tsx`.

## State

- Branch `dev`, not pushed. The server change is commit `f04a9c4`
  (`ADD: Keep every bot at a private table on the skill the host picks.`).
- Changed there: `docs/protocol.md`, `server/crates/skt-server/src/world.rs`,
  `server/crates/skt-server/src/phase1_tests.rs`. No generated TypeScript, no protocol fixture,
  no pen file, nothing else under `web/`.
- Protocol stays 1. No new field and no new error code. `GameSettings.botLevel` was already
  `easy | normal | hard`.
- `settings.botLevel` is the skill of every bot at that table. `lobby.addBot` seats the new bot
  at that skill. On a private table, `lobby.settings` writes the new settings, clears every
  human's ready, and moves every bot already seated to the new skill, all in the same
  `lobby.state`. A bot added after that change is seated at the new skill. `game.start.settings`
  is that skill, and the bots play it.
- A public table is still `RULES_LOCKED` on `lobby.settings`. Casual still fills empty seats at
  `normal`. Ranked still seats no bot. Solo is unchanged: `solo.start` already takes `botLevel`.
- Seats stay 4 and pace stays `standard` on a friends table and on a public table. This handover
  does not add those two controls.
- Test: `phase1_tests::a_private_table_keeps_every_bot_at_the_chosen_skill`. A private table
  opened at `hard` seats a bot at `hard`. Changing the rules to `easy` moves that bot to `easy`
  and clears ready. The next bot is `easy`. `game.start` carries `botLevel` `easy`.
- Gate, from `server/`, with `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt`:
  `cargo fmt --all -- --check` clean, `cargo clippy --all-targets -- -D warnings` clean,
  `cargo test --workspace` passed: bot-pass 12, engine 37, conformance 1, protocol 3, server 77.
- The page still forces `botLevel: 'normal'` through `FIXED` in `settings.ts`, so Your table
  cannot pick a skill yet. The mock already seats a bot at `settings.botLevel` and moves seated
  bots when `lobby.settings` changes it (`web/src/net/mock/server.test.ts`).
- `design/skt.pen`, `design/web.pen`, `web/src/styles/responsive.css` and
  `web/src/styles/skullking.css` were already modified and were left unstaged. Do not revert them.

## Your task

Your table can pick Easy, Normal or Hard. A public table still opens at Normal and cannot
change it.

1. Skill control. On the private new-table form (`visibility === 'private'`), under Seat bots,
   add the same three buttons solo uses, with the same words:
   - Easy — Makes mistakes
   - Normal — Solid play
   - Hard — Counts cards
   The section label is `Bot skill`. One skill for every bot, not one per seat.
2. Sending it. A private `lobby.create` sends the chosen `botLevel`, with `maxPlayers: 4` and
   `pace: 'standard'` still forced. Do not spread `FIXED` over `botLevel` on that path.
   `loadTable()` currently forces `normal`; the private form should keep the device's last
   `botLevel` (`loadSettings` already stores it) and still force the seats and the pace.
   A public `lobby.create` still sends `botLevel: 'normal'` whatever the device remembers.
3. Seat bots off. The control is hidden while Seat bots is off, and the last choice is still
   sent. `GameSettings` has no place to leave `botLevel` out. Turning the switch back on shows
   the same choice. `allowBots: false` is unchanged.
4. Change rules. The private host's rules form (no visibility, opened only for an open private
   lobby) gets the same control, and `lobby.settings` sends the chosen `botLevel` with the
   other rules. Seats and pace stay what the table already has. Show the control only when
   `allowBots` is not `false`. That form has no Seat bots switch, and no message changes
   whether bots are seated. Saving still clears ready. The server moves bots already seated.
5. Waiting room. The rules plate names the skill when the table seats bots, in the words
   `describeSettings` already uses: `Easy bots`, `Normal bots`, `Hard bots`. A table with
   `allowBots: false` does not name a skill. Public and private both show the skill they were
   opened with. Only the private host can change it.
6. Tests. Opening Your table at Hard sends `lobby.create` with `botLevel: 'hard'`,
   `maxPlayers: 4` and `pace: 'standard'`. A public table opened after the device remembered
   Hard still sends `normal`. Changing a private table's skill sends `lobby.settings` with
   that `botLevel` and leaves the seats and the pace. Seat bots off hides the control and
   still sends a `botLevel`. The rules plate of a table that seats bots names the skill.
7. Copy. Update the sentence in `web/README.md` that says a new table always sends
   `botLevel: 'normal'` and that the rules form keeps the skill the table has. Your table
   picks the skill. A public table still sends `normal`.
8. Pen. In the file that already holds `Friends · new game` (`design/skt.pen`; also
   `design/web.pen` if that frame is there), add the Bot skill row to the private new-table
   form and to the private rules form, matching the solo control. Do not add it to
   `Public · new game`. Grok did not edit a pen file. Ask the owner to press ⌘S in Pen. The
   save is not on disk until they do, and a save also writes other unsaved edits.

## Contracts

- Frozen: protocol 1, message names, `GameSettings` fields, `lobby.addBot` taking no level,
  `RULES_LOCKED`, casual `normal`, ranked with no bots, solo's `solo.start`, and the seat
  count and pace of a friends or public table.
- You may change `web/` outside `web/src/protocol/generated/`, and the pen files. Do not change
  `server/`, `docs/protocol.md`, generated types, or `fixtures/`.

## Done when

- From `web/`: `npm run check` and `npm test` pass, including the Hard private table and the
  public table that stays `normal`.
- Your table offers Easy, Normal and Hard, on the new-table form and on Change rules, in light
  and dark, at 360 px and a wide window. A public new table has no skill control. Solo's skill
  control is unchanged.
- The mock still moves a seated bot when `lobby.settings` changes `botLevel`.

## Report back

Write `docs/handover/NNN-claude-to-grok-your-table-bot-skill.md` and print the same text in one
code block. Say the commit, what the tests printed, and whether Your table sends the chosen
`botLevel`. No return server work unless the page needs a message this handover does not name.
