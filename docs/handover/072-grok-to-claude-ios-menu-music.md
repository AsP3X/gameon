# 072 · Grok → Claude · the menu theme should start on the first tap on iOS

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `web/README.md` section "Menu music", and `docs/agent-rules/web-quality.md` first.
Grok does not edit `web/`. This is the fix for the owner's report: on iOS the home-screen theme
does not play until they tap the sound button at the top right.

## State

- Branch `dev`. One commit on top of `32cba20`:
  - `DOCS: Ask Claude to start the menu theme on the first iOS tap.`
- Changed: this file only. Nothing under `web/`, `server/`, or `design/`.
- Static serving of the second tune (`docs/handover/071-claude-to-grok-second-menu-tune.md`, item 2):
  None. `client_max_body_size 1m` limits uploads. The API rate limit is on `/api/` only. Both
  hashed MP3s are ordinary `GET`s of `/assets/`.
- What is wrong: `listen()` in `web/src/tableview/events.ts` calls `Sound.unlock()` once, on the
  first `pointerdown` and the first `pointerup` (`{ once: true }`). iOS Safari does not treat a
  pointer event as a user gesture for `AudioContext.resume()`. Those listeners then never run
  again. A tap on Play, or anywhere else, does not unlock audio. The sound button does, because
  its `click` runs `Sound.setLevel()` and `Sound.play()` (`sndToggle` in
  `web/src/tableview/actions.ts`), and `click` is a gesture iOS accepts. `Sound.unlock()` in
  `web/src/sound/sound.ts` is the right function: it builds the graph, calls `resume()`, and
  `syncMusic()`. It is just not called from an event iOS counts, and it is not called again
  after the first pointer event fails.

## Your task

1. In `web/src/tableview/events.ts`, keep asking `Sound.unlock()` on gestures until the audio
   context is actually running. Listen in the capture phase for `touchend` and `click` as well as
   `pointerdown`, `pointerup`, and `keydown`. Do not use `{ once: true }` on the pointer events:
   the first one fires, iOS ignores it, and the menu stays silent. Remove the listeners when
   unlock has succeeded, or when `listen()` is torn down.
2. Make `Sound.unlock()` report whether audio is running (`AudioContext.state === 'running'`, or
   there is no Web Audio at all). Call `ctx.resume()` from inside the gesture, with no `await`
   before it. When that promise resolves, call `syncMusic()` again so a tune that was decoded
   while the context was still suspended actually starts. A browser with no `AudioContext` stays
   silent and counts as done, so the listeners do not stay forever.
3. Cover it. A test may drive `Sound.unlock()` twice: the first while the context stays
   `suspended` must not be the last chance; a later `unlock()` starts the tune. Do not require a
   real iPhone in CI. Say in the report that Safari on iOS was or was not tried.
4. In `web/README.md`, "Menu music", say the theme starts on the first gesture the browser
   accepts, and that on iOS that is a tap's end or a click, not the pointer going down.

## Contracts

- Frozen: `docs/protocol.md`, protocol 1, messages, error codes, the engine, both fixture trees.
- No new control and no new copy on the screen. The sound button stays as it is.
- You may change `web/src/sound/sound.ts`, `web/src/tableview/events.ts`, their tests, and
  `web/README.md`. Do not change `server/` or `design/`.

## Done when

- From `web/`: `npx vp check` is clean and `npx vp test` passes.
- On iOS Safari, opening the home screen and tapping anywhere except the sound button starts the
  menu theme. Tapping the sound button is not required. Sound effects off still silences it.
  Desktop still starts the theme on the first tap or key.

## Report back

Write `docs/handover/073-claude-to-grok-<slug>.md` and print the same text in one fenced code
block. Say whether iOS was tried, and the `vp test` count. No server work unless the theme is
still silent with the context already `running`.
