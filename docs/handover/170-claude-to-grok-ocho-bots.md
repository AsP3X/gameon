# 170 · Claude → Grok · Ocho bot levels on sit down (return for 169)

You are Grok, the callee, working on Skull King Tavern
(`/Users/niklas/Documents/development/gameon`), branch `feature/game-ocho`. Do this work
yourself. Do not run `claude` or `grok`. Do not edit `web/` or `design/`.

Read `docs/ocho-protocol.md`, then `web/src/ocho/wire.ts` (`parseLobby`, `Intent`) and
`server/crates/ocho-server/src/room.rs` (`create`, `bot_name`).

## State

Commit `f99535b` on `feature/game-ocho`: `ADD: Offer Easy, Normal, and Hard bots on Ocho's
sit-down page and name the bot seats in the waiting room.` It touches only `web/src/ocho/`
(`Ocho.tsx`, `wire.ts`, `fake.ts`, `Ocho.test.tsx`, `wire.test.ts`).

Gate, run in `web/` with `/tmp/node-v22.23.3-darwin-arm64/bin` on `PATH`:

- `vp check`: clean (166 files formatted; no warnings, lint errors or type errors in 153 files).
- `vp test`: 55 files, 818 tests passed. Five of those are new: two sit-down cases, two
  waiting-room cases, one wire case.
- `vp build`: passes.

### What the sit-down sends

A **Bots** choice now sits under Match with four options. The default is No bots.

| Picked | `ocho.create` |
| --- | --- |
| No bots | `{ t, id, players, teams, match }`, no `bots` key (same as before) |
| Easy / Normal / Hard | the same plus `bots: "easy"` / `"normal"` / `"hard"` |

Teams still sends `players: 4`. Free-for-all sends 2 to 8. After `ok`, the page sends
`ocho.ready { ready: true }` as before. The host deals with `ocho.start`.

### What the page reads

- `lobby.bots`: `"easy" | "normal" | "hard"`. If it is absent or `null`, the table has no bots.
  Any other value drops the frame.
- `members[].bot`: a boolean. Absent means `false`. A non-boolean value drops the frame.
- Unknown fields are ignored.

The waiting room shows `… · Hard bots` on the settings line and `Hard bot` (or
`Hard bot · Team 1/2`) under a bot seat. Instead of the "give this code" line it says
"The other seats are Hard bots." Ready and Start are unchanged.

### Design

`design/ocho.pen` was edited in Pen through the Pencil tools:

- Frames 16 and 17 (sit-down, all eight variants) have the Bots choice under Match, with No bots
  selected. Phone frames grew to 900/930 px and desk frames to 1040 px to fit it.
- New frames 22 `Your table · bots` (phone and desk, light and dark) show the waiting room with
  Hard bots Nico, Luz and Sol, named as `bot_name` assigns them.

**The `.pen` change is not on disk until the owner presses ⌘S in Pen.** It is not committed.
After saving, the owner (or Claude) checks that the `.pen` diff holds only this change, then
commits it with `ADD:`.

Not my change, but noticed: on frame 17 Phone, the stepper row is 356 px wide inside a 350 px
column, so the "Teams is 2v2 · 4 players" caption is clipped by 6 px.

## Your task

1. Confirm the server matches what the page reads. `lobby.bots` is omitted (or `null`) for a
   friends table, and `members[].bot` is always a boolean. If `ocho.lobby` serialises `bots`
   differently, say so. Do not change the frozen names.
2. Nothing else is needed from you for 169. If you agree, reply with a short return handover.

## Contracts

Frozen and unchanged: message names, `easy` / `normal` / `hard`, seat order (host is seat 0,
bots fill the rest), and that a friends create omits `bots`. `docs/ocho-protocol.md` was not
edited.

## Done when

`cargo test -p ocho-engine -p ocho-server` passes, and you have stated that the lobby's
serialised shape matches the "What the page reads" list above.

## Git

Branch `feature/game-ocho`. Commit only your own paths. Do not push. Do not create a branch or
a worktree. No AI attribution.

## Report back

Write `docs/handover/171-grok-to-claude-<slug>.md` and print the same text in one fenced code
block. Make it a paste-ready prompt for Claude. Include the commit (if any), the commands and
counts, and any shape mismatch you found.
