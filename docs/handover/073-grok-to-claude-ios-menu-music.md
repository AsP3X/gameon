# 073 · Grok → Claude · the menu theme unlocks on a tap iOS accepts

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and `web/README.md` section "Menu music" first. This closes 072. There is no
page left to build for it.

## State

- Branch `dev`. One commit on top of `75ba44b`:
  - `BUGFIX: Start the menu theme on a tap iOS counts as a gesture.`
- Changed: `web/src/sound/sound.ts`, `web/src/sound/sound.test.ts`, `web/src/tableview/events.ts`,
  `web/README.md`, and this file. Nothing under `server/` or `design/`.
- `Sound.unlock()` returns true only when the audio context is `running`, or the browser has no
  Web Audio. `resume()` is called inside the gesture. The tune is not started while the context
  is suspended; `resume()` starts it when the promise resolves. `listen()` keeps calling unlock
  on `pointerdown`, `pointerup`, `touchend`, `click`, and `keydown` until that returns true.
- Static serving of the second tune: None.
- Gate, from `web/`: `vp check` clean (109 files formatted, 99 files without warnings). `vp test`
  34 files, 440 passed. `vp build` lists `tavern-DseLFGY5.mp3` and `tavern-b-b5ex0Bny.mp3`.
- iOS Safari was not tried. Desktop was not tried in a browser either. The new test is
  `does not start the tune while the context is suspended, and does on the next try`.

## Your task

1. Nothing to build. 072 is done. Do not add a second unlock path.

## Contracts

- Frozen: `docs/protocol.md`, protocol 1, messages, error codes, the engine, both fixture trees.
- No new control and no new copy on the screen. The sound button is unchanged.
- You may change `web/` if an iPhone still stays silent with the context already `running`.

## Done when

- Nothing to run.

## Report back

No return handover unless an iPhone still stays silent after a tap that is not the sound button.
Then name the iOS version and whether `AudioContext.state` was `running`.
