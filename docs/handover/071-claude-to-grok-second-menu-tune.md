# 071 · Claude → Grok · a second menu tune

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and `docs/agent-rules/ownership-and-handover.md` if this is a new session, and in
`web/README.md` the section "Menu music". This is a small web package the owner asked for in
between. It answers neither 069 nor 070: both are still open on Claude's side. Nothing here asks
for server work.

## State

- Branch `dev`, commit `09f3055` ("ADD: Play a second tavern tune under the home screen, a random
  one first and then in turn."). This file is the next commit. Local, not pushed.
- `design/skt.pen` is modified in the working tree and is not part of this package. It was not
  staged and not touched.

What landed, all under `web/`:

- `web/src/sound/music/tavern-b.mp3`: a second tune for the home screen. MP3, 48 kHz stereo,
  128 kbit/s, 1,245,696 bytes, the same size as `tavern.mp3`. Generated with ElevenLabs Music v2.5
  on the owner's account; the owner picked the take by ear. Its loop is 76.8 s.
- `web/src/sound/music.ts`: `TUNES` lists both files with their loops. `loadMusic()` fetches both
  at startup and hands the mixer the ones that came, in one call.
- `web/src/sound/sound.ts`: `Sound.tune(file, loop)` is gone; `Sound.tunes(list)` takes its place.
  The first tune to play is drawn at random on each page load. Every time the music starts again
  (back on the home screen, back in the tab, sound back on) it is the next tune's turn. Only one
  tune is kept decoded, about 30 MB; the next one is decoded when its turn comes. A tune that
  cannot be decoded is left out and the others go on.
- `web/README.md`: the "Menu music" section describes both tunes and the turn-taking.

Nothing a player sees changes: no new control, no new copy. `design/web.pen` and `design/skt.pen`
need no change for this.

The gate, from `web/`, Node v25.2.0:

- `npx vp check`: all 109 files formatted; no warnings, lint errors or type errors in 99 files.
- `npx vp test`: 34 files, 439 tests passed (432 before, 7 new: 5 in `sound.test.ts`, 2 in
  `music.test.ts`).
- `npx vp build`: `dist/assets/tavern-DseLFGY5.mp3` 1,245.69 kB and the new
  `dist/assets/tavern-b-b5ex0Bny.mp3` 1,245.69 kB; `dist/assets/main-ibKuo9z9.js` 411.58 kB.
- In a browser (`vp dev`, Chromium): both files answer 200. On the home screen one looping source
  started; leaving for the online hub and coming back twice started `tavern.mp3`, `tavern-b.mp3`,
  `tavern.mp3` in that order, each round its own loop (0.25 s to 77.058 s, 0.25 s to 77.05 s). The
  only console errors were 502s from the `/api` proxy, because no server was running.

Not done:

- The owner has heard the take, not yet the cut loop inside the app. The loop point and the level
  (-16.4 LUFS, as `tavern.mp3` measures) were set by measurement.
- Safari and Firefox were not tried.
- `npm run fixtures:check` was not run: nothing under `web/src/game/` or `fixtures/` changed.

`docs/protocol.md`: None. No message, DTO, endpoint or error code is touched.

Fixtures the Rust harness should replay again: None.

## Your task

Nothing changes in `server/`, `deploy/` or `.github/`. Two facts for the files you own:

1. `deploy/nginx/nginx.conf.template` already serves this file correctly: it is one more hashed
   file under `/assets/`, fetched whole with `fetch()` from the page's own origin, and `audio/mpeg`
   is outside `gzip_types`. `deploy/nginx/security-headers.conf` already allows it
   (`connect-src 'self'`; no `<audio>` element is used, so `media-src 'none'` stays right). The
   comment in `nginx.conf.template` that names `tavern-<hash>.mp3` could say there are two; that is
   yours to decide.
2. The service worker keeps every built file (`precache()` in `web/vite.config.ts`), so an install
   now fetches 2.5 MB of music instead of 1.2 MB. If a body-size or rate limit sits in front of
   static files, it has to let both through in one page load.

Stop there. This handover opens no new phase.

## Contracts

- Frozen, untouched: `docs/protocol.md`, `skt-protocol`, `web/src/protocol/generated/`,
  `fixtures/engine/`, `fixtures/protocol/`.
- Changed by this package: nothing shared. `Sound.tunes` and `TUNES` are internal to `web/`.
- You may change: nothing under `web/`.

## Done when

- You have read this. No command has to be run.
- If you run the web gate on a tree that contains `09f3055`: `npx vp check` is clean,
  `npx vp test` passes with at least 439 tests, `npx vp build` lists a `tavern-<hash>.mp3` and a
  `tavern-b-<hash>.mp3`.

## Report back

Nothing is owed for this package alone. When you next hand over to Claude, write
`docs/handover/072-grok-to-claude-<slug>.md` (or the next free number) and print the same text in
one fenced code block. It must itself be a paste-ready prompt for Claude ("You are Claude"), with
who and where, state, a numbered task, contracts, done when, and report back. Say there whether
item 2 raised a problem for the static serving, or "None".
