# 090 · Grok → Claude · the theme starts again on the way back from a game

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `web/README.md` section "Menu music", and
`docs/handover/086-grok-to-claude-music-through-the-menus.md` first. The owner asked for the
theme to start again when the player leaves a game for the play selection. This is that fix.
It follows 086. 089's protocol lock is untouched.

## State

- Branch `dev`. The fix is commit `74a67db` ("BUGFIX: Start the menu theme again when the player returns from a game."), parent `552478f`.
- Changed: `web/src/sound/sound.ts`, `web/src/sound/sound.test.ts`, `web/src/tableview/actions.ts`,
  `web/src/tableview/tavern.test.ts`, `web/src/online/OnlineScreens.test.tsx`, `web/README.md`.
  No server file, no protocol file, no generated type, no `.pen` file.
- From `web/`, on this tree:
  - `./node_modules/.bin/vp check`: 110 files formatted, 100 files with no warnings, lint or type errors.
  - `./node_modules/.bin/vp test`: 33 files passed, 1 failed; 465 passed, 1 failed. The failure is
    `src/tableview/parity/sound.test.ts`. The first differing step is `0 press .home`, the HTML
    trace. That is the same failure 088 named. This commit did not add it.
  - `./node_modules/.bin/vp build`: built in 130ms. `main-DQEQC8AG.js` is 413.48 kB (gzip 129.77 kB).
    `tavern-DseLFGY5.mp3` and `tavern-b-b5ex0Bny.mp3` are both in the build.
- Headless Chrome, real page, after Come in, then a solo game, then Home: the next tune's
  `start()` is at the same context time as the sample taken in that click (`1.556`). Offset
  `0.5`, loop end `77.058`, duration `77.808`, context `running`. The peak over the next 800 ms
  is 21. The `ended` event just after Home is the previous tune, stopped when the game began.
  The new source does not end.
- Not tried on a phone, in headed Safari, or in iOS Safari.

## What was wrong

`Sound.music(true)` already ran when the screen came back to home (086). The next tune was
decoded only then. `decodeAudioData` of the MP3 finishes after the tap. A desktop context that
is already running still starts the source. On a phone, nothing is playing in that gap, the
context suspends, and `start()` in the decode callback is dropped. `mus` then points at that
dead source, so a later `resume()` does not start another.

## What the commit does

- While a tune is playing, the mixer decodes the next one (`prefetch` in `web/src/sound/sound.ts`).
  Coming back starts that buffer in the same call as `Sound.music(true)`, inside the tap.
- If the next tune is not decoded yet and another decoded buffer is already held, that held tune
  starts in the same call. `turn` is set to its index first, so the increment leaves `turn` on
  the tune that is still decoding.
- A suspended context is poked and `resume()` is asked in that same call (`wake`). `start()`
  stays in the call. It is not moved into the `resume()` promise (080).
- Gain is set to `MUSIC_V` (0.3) before `start()`. A ramp up from silence is lost when the clock
  is not running, and the tune then stays at zero.
- `home()`, `leaveTable()` and online `again()` in `web/src/tableview/actions.ts` call
  `Sound.unlock()` in the tap. An online leave reaches the home screen from an effect, after
  the tap, and a phone drops a tune started out there.
- The hub still keeps the theme (086). The old test in `OnlineScreens.test.tsx` expected silence
  on the hub. 089 still described that failure as yours. It is updated here, because it
  contradicted 086 and failed `vp test`. The test is now `plays the menu music on the hub, where
  the home screen was, and keeps it on the way back`. It arms Welcome back first: jsdom does not
  open that sheet. Do not put the silence expectation back.
- Two decoded buffers exist only while one tune is fading out and the next is already decoded.
  After the fade, one.

## Your task

1. Nothing to build.
2. Do not move `s.start()` into the `resume()` promise. A source started there is outside the
   gesture, and a phone throws it away (080).
3. Do not remove the prefetch. Do not start a second copy when the prefetch finishes while `mus`
   is already set.
4. Do not put `Sound.unlock()` back on every pointer and key in `listen()`. 084 took it out.
   Come in, Escape, and the three leave taps above are the gestures that arm or wake the theme.
5. Leave `src/tableview/parity/sound.test.ts` until the owner asks you to repair that harness.
   Do not make it pass by unlocking on every tap, or by dropping the prefetch.
6. The Welcome back sheet from 085 still has no frame in `design/web.pen`. That remains your
   task from 085. This commit does not change the sheet, and it needs no new frame.

## Contracts

- Frozen: `docs/protocol.md`, protocol 1, messages, error codes, the engine, both fixture trees.
  `74a67db` changes none of them. 089's lock stands.
- Frozen in the mixer: start inside the tap; gain `MUSIC_V` set before the clock runs; one
  decoded slot plus the playing buffer during the fade; loop from `starts / 2` to
  `starts / 2 + repeats`; start offset `starts`.
- The theme plays on home, setup and the online screens, including the hub. It stops on `game`
  and `end`. A background tab pauses it. Sound-effects off silences it.

## Done when

- Nothing to run.

## Report back

No return handover unless the theme stays silent on the home screen or the hub after a game, or
starts during a game or on the end screen. Name the screen, and say whether it was a phone.
