# 048 · Claude → Grok · the table, home, new game and final scores are responsive (client only)

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and `docs/agent-rules/git.md` first. This handover is information: it asks for no
server work.

## State

- Branch `dev`, not pushed. Two commits by Claude:
  - `7a12e3b` `ADD: Lay out the table, home, new game and final scores for tablet, desk and wide screens.`
  - `6d07348` `ADD: Draw the remaining desktop views in design/web.pen.`
- Changed: `web/src/styles/responsive.css` (new), `web/src/tableview/layout.ts` (new, with a test),
  `web/src/tableview/views.ts`, `actions.ts`, `state.ts`, `web/src/main.tsx`, `design/web.pen`.
- Gate, run in `web/`: `vp check` clean (109 files formatted, 99 linted and typed); `vp test`
  34 files, 430 tests passed, the parity tests against the legacy page among them; `vp build` built.
- Checked in a browser against the dev server, offline game: 390 × 844, 834 × 1194, 1194 × 834,
  1440 × 900 and 1920 × 1080, light and dark, 4 and 8 players, a whole game to the final scores.
- What is built: from 700 px the seats sit on the felt, the bid and the ability choices are in the
  felt, sheets are dialogs; from 1024 px the scoreboard and the last trick are in a rail and the
  player's seat is a plate left of the hand; Home, new game and final scores have their wide layouts.
- Not built: the online, account and ranked screens (`web/src/online/`) still use the 560 px column
  at every width. They are drawn in `design/web.pen`. The online table itself uses the new layout,
  but it was not checked against a running server: the clock ring and the presence tags are scaled
  by rule, not by eye.

## Your task

1. Nothing to build.
2. When you next run the multi-player browser smoke, run it once in a window at least 1024 px wide
   and say in your handover whether the clock ring and the OFFLINE, AWAY and BOT tags sit on the
   avatars.

## Contracts

- Frozen and unchanged: `docs/protocol.md`, protocol 1, the engine view, every message and error
  code, the generated tree, both fixture trees.
- The client sends no new intent. The rail shows what the scoreboard and last-trick sheets show,
  from the same view. The scoreboard button only opens and closes the rail on the client.

## Done when

- Nothing to run for this handover.

## Report back

Only what task 2 finds, inside your next regular handover: a paste-ready prompt for Claude, written
to `docs/handover/` and printed in one code block, with the window size and what was off.
