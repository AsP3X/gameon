# 169 · Grok → Claude · Ocho bot levels on sit down

You are Claude, the callee, working on Skull King Tavern
(`/Users/niklas/Documents/development/gameon`), branch `feature/game-ocho`, commit `500b841`.
Do this work yourself. Do not run `claude` or `grok`. Do not edit `server/`,
`docs/ocho-protocol.md`, or `server/crates/`.

Read `docs/agent-rules/web-quality.md`, `docs/agent-rules/design-sync.md`, and
`docs/ocho-protocol.md`. Then `web/src/ocho/Ocho.tsx`, `web/src/ocho/wire.ts`,
`web/src/ocho/fake.ts`, and `web/src/ocho/Ocho.test.tsx`. Skull King's three skills are
the model: `web/src/skullking/rulesets.ts` (`LEVELS`).

## State

Grok seated the bots on the server in `500b841`. `cargo test -p ocho-engine -p ocho-server`:
19 engine tests and 6 server tests passed. Clippy on those crates is clean. The page does
not offer a level yet, so a table still opens with no bots.

## Your task

1. On Ocho's sit-down screen, under Match, add a **Bots** choice. Four options, one selected:

   | Label | Sub | Sent |
   | --- | --- | --- |
   | No bots | Friends join with the code | omit `bots` |
   | Easy | Makes mistakes | `bots: "easy"` |
   | Normal | Solid play | `bots: "normal"` |
   | Hard | Reads the table | `bots: "hard"` |

   Default is No bots. Teams still locks the count at 4. Free-for-all stays 2 to 8.
   Start still sends `ocho.create` and then `ocho.ready`. When a level is selected, create
   includes `bots`. When No bots is selected, the field is absent, as it is today.

2. Teach the parser in `web/src/ocho/wire.ts`.

   - `ocho.create` may include `bots`.
   - `lobby.bots` is `"easy" | "normal" | "hard"` or absent. Absent means a friends table.
   - `members[].bot` is a boolean. Absent means false, so an older lobby still parses.
   - Extra fields stay ignored. A bad `bots` value fails the parse.

3. Waiting room, when `lobby.bots` is set:

   - The settings line gains the level: `Free-for-all · 4 players · One hand · Hard bots`.
   - A member with `bot: true` is not "Player". The small line is `Hard bot`, or
     `Hard bot · Team 1` / `Team 2` when the table is teams. The host line stays Host.
   - Replace "Give this code to the others. They join from Ocho's sit-down page." with
     "The other seats are Hard bots." (use the level). The table is already full.
   - Ready and Start stay as they are. Bots are already ready. The host readies, then deals.

4. Update `web/src/ocho/Ocho.test.tsx` and the fakes. Cover No bots (field omitted), a level
   on create, and a waiting room that names a bot seat.

5. Draw the choice on the sit-down frames in `design/ocho.pen` (frames 16 and 17: phone and
   desk, light and dark, free-for-all and teams). Edit only through the Pencil tools. Reuse
   the choice buttons already on that screen. Do not redraw the table, the cards, or the
   score. When the frames are done, the `.pen` file is not on disk until the owner presses
   ⌘S. Say that in the return handover. Do not commit a `.pen` you did not see saved.

## Contracts

Frozen: message names, `easy` / `normal` / `hard`, seat order (host is seat 0, bots fill the
rest), and that a friends create omits `bots`. You may change `web/` and `design/ocho.pen`.
You may not change the server or the protocol doc.

## Git

Branch `feature/game-ocho`. Commit only your paths, after `vp check` and `vp test` pass.
Prefix `ADD:`. Author `Niklas Vorberg <services@vorberg-webmail.de>` if git would use a
hostname address. No AI attribution. Do not push. Do not create a branch or a worktree.

If `node` is not on `PATH`, prepend `/tmp/node-v22.23.3-darwin-arm64/bin`.

## Done when

`vp check` is clean and `vp test` passes, including the new sit-down cases. The waiting
room names a bot. The design frames are updated in Pen, or the return says Pencil could
not open them.

## Report back

Write `docs/handover/170-claude-to-grok-ocho-bots.md` and print that same text in a code
block. It is a paste-ready prompt for Grok. Include the commit, the commands and counts,
what the sit-down sends, and whether the owner still has to press ⌘S.
