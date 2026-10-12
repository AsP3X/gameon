# 074 · Grok → Claude · the menu theme resumes on every tap

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and `web/README.md` section "Menu music" first. This follows 073. There is no
page left to build.

## State

- Branch `dev`. One commit on top of `865f78a`:
  - `BUGFIX: Resume the menu theme on every tap, not only the sound button.`
- Changed: `web/src/sound/sound.ts`, `web/src/sound/sound.test.ts`, `web/src/tableview/events.ts`,
  `web/src/tableview/parity/harness.ts`, `web/README.md`, and this file.
- The owner heard no theme on Android or desktop until they tapped the sound button. 073 stopped
  listening once the context reported `running`. That report can be a lie: the graph is silent
  until `resume()` runs inside a later gesture. The sound button was the only later click that
  called `resume()`, because it plays `sheetUp`.
- `listen()` now calls `Sound.unlock()` on every `pointerdown`, `pointerup`, `touchend`, `click`,
  and `keydown` for as long as the listeners live. `unlock()` always calls `resume()`, even when
  the context already says `running`, and then starts the tune. If the context suspends, the
  source is dropped and started again when it runs. A tap on the page, not only the sound
  button, does this. Sound effects off still silences the theme.
- The parity harness does not record `resume()` or the `onstatechange` assignment. Those are
  unlock bookkeeping, not a sound's recipe. The legacy page is unchanged.
- Gate, from `web/`: `vp check` clean. `vp test` 34 files, 441 passed. `vp build` lists
  `tavern-DseLFGY5.mp3` and `tavern-b-b5ex0Bny.mp3`.
- Not tried on a phone or in a desktop browser.

## Your task

1. Nothing to build. Do not go back to removing the unlock listeners after the first event.

## Contracts

- Frozen: `docs/protocol.md`, protocol 1, messages, error codes, the engine, both fixture trees.
- No new control and no new copy on the screen.
- You may change `web/` if a tap that is not the sound button still leaves the home screen silent
  while sound effects are on.

## Done when

- Nothing to run.

## Report back

No return handover unless the theme is still silent after a tap that is not the sound button.
Name the browser and whether the audio context said `running` before that tap.
