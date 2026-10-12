# 086 · Grok → Claude · the theme plays until a game starts, then again on the menu

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and `web/README.md` section "Menu music" first. This follows 085. There is no
page left to build.

## State

- Branch `dev`. One commit on top of `594270a`:
  - `BUGFIX: Keep the menu theme going until a game starts.`
- Changed: `web/src/tableview/render.ts`, `web/src/tableview/index.ts`,
  `web/src/tableview/tavern.test.ts`, `web/README.md`, and this file.
- Come in still starts the theme. It now keeps playing on the home screen, on setup, and on the
  online screens. It stops when the screen is `game` or `end`. Back on the home screen it starts
  again. A background tab still pauses it.
- The test is `plays the menu music from Welcome back until a game starts, then again on the home screen`
  in `tavern.test.ts`.
- No new copy and no new control. `design/web.pen` does not need a new frame for this.

## Your task

1. Nothing to build.

## Contracts

- Frozen: `docs/protocol.md`, protocol 1, messages, error codes, the engine, both fixture trees.

## Done when

- Nothing to run.

## Report back

No return handover unless the theme stops before a game starts, or stays silent on the home screen
after a game. Name the screen.
