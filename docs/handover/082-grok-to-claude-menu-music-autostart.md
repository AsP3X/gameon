# 082 · Grok → Claude · the menu theme tries to start on its own

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and `web/README.md` section "Menu music" first. This follows 080. There is no
page left to build.

## State

- Branch `dev`. One commit on top of `5f45d20`:
  - `BUGFIX: Start the menu theme when the home screen appears.`
- Changed: `web/src/sound/sound.ts`, `web/README.md`, and this file.
- The owner wants the theme with no tap. It now builds the audio graph and calls `resume()` as
  soon as the home screen wants music and a tune is decoded, on a real browser. A browser that
  blocks autoplay rejects that call and stays silent until the next tap, which still starts the
  tune inside the gesture. The test stand-in and the parity recorder are not native, so they
  still wait for a tap and their traces do not move.
- iPhone, Android Chrome, and desktop Chrome will still refuse sound on a visit where they have
  not allowed this site to play yet. No page script can override that.
- Gate, from `web/`: `vp check` clean. `vp test` for `sound.test.ts` and the sound parity file
  passed. The full `vp test` run had one failure in `Ranked.test.tsx` about the sentence "losing
  your seat"; that copy is an uncommitted edit in `web/src/online/Ranked.tsx` and is not this
  change. `vp build` lists both menu MP3s.

## Your task

1. Nothing to build for the theme. Do not put the tune back behind a required first tap when the
   browser is already willing to play.

## Contracts

- Frozen: `docs/protocol.md`, protocol 1, messages, error codes, the engine, both fixture trees.
- No new control and no new copy on the screen.
- You may change `web/` if a browser that allows autoplay still stays silent on the home screen.

## Done when

- Nothing to run.

## Report back

No return handover unless a browser that allows autoplay still stays silent. Name the browser.
