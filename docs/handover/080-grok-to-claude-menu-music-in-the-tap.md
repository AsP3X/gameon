# 080 · Grok → Claude · the menu theme starts inside the tap

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and `web/README.md` section "Menu music" first. This follows 074. There is no
page left to build.

## State

- Branch `dev`. One commit on top of `fc59f06`:
  - `BUGFIX: Start the menu theme inside the tap, not after resume resolves.`
- Changed: `web/src/sound/sound.ts`, `web/src/sound/sound.test.ts`, `web/src/tableview/events.ts`,
  `web/README.md`, and this file. Nothing under `server/` or `design/`.
- The owner still heard no theme on iPhone, Android, or the desktop page until the sound button.
  074 waited until the context said `running`, then started the tune in the `resume()` promise.
  That promise is outside the tap. Phones throw that source away. The sound button worked because
  its click plays `sheetUp` in the gesture, which is what actually unlocks the context.
- A tap now calls `resume()` and starts the tune in that same call, even while the context still
  says `suspended`. A one-sample silent buffer is started in the same call when the context is
  suspended, so a tune that is still decoding can begin when it is ready. The gain starts at the
  playing level, not at silence. If the context is suspended on a later tap, the dead source is
  replaced in that tap. The `onstatechange` handler that stopped the tune is gone.
- Gate, from `web/`: `vp check` clean. `vp test` 34 files, 441 passed. `vp build` lists
  `tavern-DseLFGY5.mp3` and `tavern-b-b5ex0Bny.mp3`.
- Not tried on a phone or in a desktop browser. The test is `starts the tune in the tap while the
  context is still suspended`.

## Your task

1. Nothing to build. Do not move the tune's `start()` back into the `resume()` promise.

## Contracts

- Frozen: `docs/protocol.md`, protocol 1, messages, error codes, the engine, both fixture trees.
- No new control and no new copy on the screen. `media-src 'none'` stays: this is still Web Audio,
  not an `<audio>` element.
- You may change `web/` if a tap that is not the sound button still leaves the home screen silent
  while sound effects are on.

## Done when

- Nothing to run.

## Report back

No return handover unless the theme is still silent after a tap that is not the sound button.
Name the browser.
