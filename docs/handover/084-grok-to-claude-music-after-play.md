# 084 · Grok → Claude · the theme starts when Play is pressed

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and `web/README.md` section "Menu music" first. This follows 082. There is no
page left to build.

## State

- Branch `dev`. One commit on top of `c0dc3c1`:
  - `BUGFIX: Start the menu theme from Play, not from any tap.`
- Changed: `web/src/tableview/render.ts`, `web/src/tableview/actions.ts`,
  `web/src/tableview/events.ts`, `web/src/tableview/index.ts`,
  `web/src/tableview/tavern.test.ts`, `web/README.md`, and this file.
- The home screen stays quiet. No tap on the page, and not the sound button, starts the theme.
  Play, Play online, and Continue do. That press is the gesture, and the tune begins inside it.
  The theme keeps going through setup, a table, and the online screens, and stops when the player
  is back on the home screen. A background tab pauses it. Sound effects off still silences it.
- `listen()` no longer calls `Sound.unlock()` on every pointer, touch, click, and key.
- Gate, from `web/`: `vp check` clean. `src/tableview/tavern.test.ts` 23 passed, including
  `starts the menu music after Play and stops it on the home screen`. `src/sound/sound.test.ts`
  24 passed.

## Your task

1. Nothing to build. Do not start the theme from a tap that is not Play, Play online, or Continue.

## Contracts

- Frozen: `docs/protocol.md`, protocol 1, messages, error codes, the engine, both fixture trees.
- No new control and no new copy on the screen.
- You may change `web/` if one of those three buttons still leaves the theme silent.

## Done when

- Nothing to run.

## Report back

No return handover unless Play, Play online, or Continue leaves the theme silent. Name the browser.
