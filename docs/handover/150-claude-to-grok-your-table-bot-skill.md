# 150 · Claude → Grok · bot skill on Your table

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/handover/148-grok-to-claude-your-table-bot-skill.md` and
`docs/protocol.md` §5.3 (`GameSettings` through the paragraph under the lobby table) first. This
answers 148. There is no server work in it.

## State

- Branch `dev`, not pushed. The web change is commit `260e68a`
  (`ADD: Let Your table pick the bots' skill, and name it on the rules plate.`), on top of your
  `f04a9c4`.
- Changed: `web/src/online/SettingsForm.tsx`, `OnlineScreens.tsx`, `LobbyRoom.tsx`, `settings.ts`,
  `web/src/skullking/rulesets.ts` (the three skills now live here as `LEVELS`, shared with solo),
  `web/src/skullking/Solo.tsx` (imports them, nothing visible changed), `web/src/styles/online.css`,
  `web/README.md`, and the tests `Tables.test.tsx`, `OnlineScreens.test.tsx`, `Accounts.test.tsx`.
  Nothing under `server/`, `docs/protocol.md`, `web/src/protocol/generated/` or `fixtures/`.
- **Your table sends the chosen `botLevel`.** A private `lobby.create` sends what the host picked,
  with `maxPlayers: 4` and `pace: 'standard'` still forced (`tableSettings` in `settings.ts`). The
  form starts on the device's last `botLevel`.
- A public `lobby.create` still sends `botLevel: 'normal'`, whatever the device remembers, and its
  form has no skill control. Opening a public table does not overwrite the skill the device
  remembers for Your table.
- Seat bots off hides the control. The last choice is still sent in `settings.botLevel`, with
  `allowBots: false`. Turning the switch back on shows the same choice.
- Change rules on an open private table offers the same three buttons when `allowBots` is not
  `false`, and `lobby.settings` sends the chosen `botLevel` with the table's own seats and pace.
  A table with `allowBots: false` has no skill control there.
- The waiting room's rules plate ends with `Easy bots`, `Normal bots` or `Hard bots` at a table that
  seats bots, private or public. A table with `allowBots: false` names no skill.
- Gate, from `web/`, on a clean export of exactly the committed tree:
  `vp check`: format clean (156 files), no lint or type errors (144 files);
  `vp test`: 52 files, 784 tests passed (this includes `src/net/mock/server.test.ts`, where the mock
  still moves a seated bot when `lobby.settings` changes `botLevel`);
  `vp build`: built (the usual chunk-size warning only).
- New tests in `web/src/online/Tables.test.tsx`:
  - Your table opened after the device remembered Hard sends `botLevel: 'hard'`, `maxPlayers: 4`,
    `pace: 'standard'`. A public table under the same memory sends `normal`, and the device still
    remembers `hard`.
  - Your table at Hard → plate `Classic scoring · Hard bots` → Change → Easy → `lobby.settings` with
    `botLevel: 'easy'`, `maxPlayers: 4`, `pace: 'standard'`. The plate then reads `Easy bots`, the bot
    is still seated, and ready is cleared.
  - Seat bots off hides the control, a hidden Hard is still sent, and that table's Change rules has
    no skill.
- Checked in headless Chrome against the mock: light and dark, 360 px (no horizontal scroll) and
  1440 px. A public new table has no skill control. Solo's skill control is unchanged.
- Design (`design/skt.pen`, edited in Pen only):
  - Bot skill row added under Seat bots in `Friends · new game`, in phone and desktop, light and dark.
  - New `Friends · table rules` frames in phone and desktop, light and dark, at y −3700 from x 14000.
  - `Classic scoring · Kraken · Normal bots` on the plates of `Friends · waiting` and
    `Public · waiting`.
  - `Public · new game` is unchanged.
  - `design/web.pen` has no `Friends · new game` frame, only the older `Online · new table` and
    `Online · table rules (host)`, so it was not changed.
  - The pen change is not committed: it reaches disk only when the owner saves it in Pen.

## Your task

Nothing on the server. Read the commit if you want to see how the page uses `botLevel`.

## Contracts

- Frozen and untouched: protocol 1, message names, `GameSettings` fields, `lobby.addBot` taking no
  level, `RULES_LOCKED`, casual `normal`, ranked with no bots, `solo.start`, the seat count and the
  pace of a friends or public table.
- The page relies on what 148 states: a private `lobby.settings` moves every seated bot to the new
  `botLevel` in the same `lobby.state`, and `lobby.addBot` seats at `settings.botLevel`.

## Done when

Nothing to do. If you change how `botLevel` behaves on a private table, run from `web/`:
`npx vp test run src/online src/net` and expect every test to pass.

## Report back

No return handover needed unless you change the behavior above. If you do, write it to
`docs/handover/NNN-grok-to-claude-<slug>.md` (next free number) as a paste-ready prompt for Claude,
and print the same text in one code block.
