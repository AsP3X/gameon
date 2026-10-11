You are Grok, the backend engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the Rust server, the Compose and
deploy files and CI. Claude writes the web client and never edits `server/` or `.github/`. You and
Claude cannot see each other's sessions: the owner pastes handover prompts between you. This is
handover 024. It is not an answer to your 023: the owner asked for a small web package in between
(music on the home screen). Nothing in it asks for server work now.

READ FIRST, IN THIS ORDER
1. `AGENTS.md` and `docs/agent-rules/` if this is a new session. For this package:
   `ownership-and-handover.md`, `git.md`, `definition-of-done.md`, `web-quality.md` (Network).
2. `web/README.md` on the branch named below: the section "Menu music" and the new line under
   "Deliberate differences from the legacy page".

STATE

Branch `feature/claude-menu-music`, commit `2b36620`, cut from `dev` (`0a9fabd`). This handover file
is the next commit on that branch. Worktree `/Users/nvorberg/Documents/development/skt-claude-sound`.
Local, not pushed, not on `dev`. Do not merge it and do not commit in that worktree; the owner
merges. Handovers 020 to 023 live on other feature branches and are not on `dev`, so this branch
does not contain them.

What landed, all under `web/`:
- `web/src/sound/music/tavern.mp3` — the tune: MP3, 48 kHz stereo, 128 kbit/s, 77.8 s, 1,245,696
  bytes. Generated with ElevenLabs Music v2.5 on the owner's account. How the loop was cut, and why
  it survives the silence MP3 puts at the front of a file, is in `web/README.md`.
- `web/src/sound/music.ts` — `loadMusic()` fetches the file (bundled, same origin) and hands it to
  the mixer with the place of its loop. `web/src/main.tsx` calls it once at startup and waits for
  nothing.
- `web/src/sound/sound.ts` — `Sound.tune(file, loop)` and `Sound.music(on)`. The tune is decoded
  when the music is first wanted with sound on, plays through the master gain (so the volume slider
  and "Sound effects" off apply), loops inside the buffer, fades in and out, and starts only once
  the audio graph exists, which is after the first tap or key. `Sound.hush()` stops it too.
- `web/src/tableview/` — `tuneMenu()` in `render.ts` asks for the music on every redraw: wanted
  while the renderer is mounted, on the home screen, not covered, and the tab is visible.
  `coverTavern(covered)` in `index.ts` is new; `web/src/App.tsx` calls it while the online screens
  are shown in the renderer's place. `events.ts` also unlocks audio on the first `pointerup` and
  `keydown` (it was `pointerdown` only) and listens for `visibilitychange`.
- Tests: 12 new, in `sound.test.ts` (7), `music.test.ts` (3), `tavern.test.ts` (1) and
  `OnlineScreens.test.tsx` (1).

Nothing a player sees changes: no new control, no new copy. `design/web.pen` needs no change.
`legacy/` and `fixtures/` are untouched. The parity suite is unchanged and passes.

The gate, from `web/` in that worktree, Node v25.2.0:
- `npx vp check` — all 73 files formatted; no warnings, lint errors or type errors in 66 files.
- `npx vp test` — 23 files, 282 tests passed (270 before, 12 new).
- `npx vp build` — 67 modules. `dist/assets/index-CjmxLIl0.js` 373.85 kB,
  `dist/assets/index-CoZU_Zmy.css` 50.46 kB, and the new `dist/assets/tavern-DseLFGY5.mp3`
  1,245.69 kB.
- `npm run fixtures:check` — `fixtures/engine matches the generator (41 games).`
- In a browser (`vp dev`, Chromium): `/src/sound/music/tavern.mp3` answers 200. After the first
  click on the home screen one looping source started (loop 0.25 s to 77.058 s, from 0.5 s, decoded
  length 77.808 s). It stopped on the setup screen and on the online hub and started again on the
  way back to the home screen each time. Rendered across the loop point, the largest step between
  two samples was 0.043, the 99th percentile of the steps the tune makes anyway. No console errors.

Not done:
- The owner has not yet confirmed the tune, its loop and its level by ear. All three were set by
  measurement only.
- Safari and Firefox were not tried. Both decode MP3; the loop does not depend on how they treat
  the encoder's leading silence.
- Whether the owner's ElevenLabs plan allows this file in a public release is the owner's check.
- There is no switch for the music alone. It would be a visible change (a row on the sound sheet,
  and `design/web.pen`), and the owner has not asked for one.

`docs/protocol.md`: None. No message, DTO, endpoint or error code is touched.

Fixtures the Rust harness should replay again: None.

YOUR TASK

Nothing in `server/` changes for this package. Three things to keep in mind where you own the files:

1. `.github/workflows/web.yml`: no change needed. `web/**` already triggers it and the job needs no
   audio tooling: the tests stand in for Web Audio and `fetch`, and one test reads the MP3's frame
   headers from disk with Node. If you run the web gate on the merged tree, expect the counts above
   plus whatever the other merged branches add.
2. When you write the production static serving for `web/dist` (the nginx in the Compose setup, plan
   Phase 4), the client fetches `/assets/tavern-<hash>.mp3` with `fetch()` from its own origin and
   decodes the bytes itself, exactly as it does for the `.wav` takes of handover 010:
   - A Content-Security-Policy must allow it: `connect-src 'self'`. `media-src` is not involved; no
     `<audio>` element is used.
   - The content type does not matter to the client. Range requests are not needed: the file is
     fetched whole, once.
   - Do not gzip or brotli it: MP3 does not shrink. Leave `audio/mpeg` out of the compressed types.
   - The name is content-hashed like the other assets, so it can get the same long `Cache-Control`.
   - It is 1.2 MB, by far the largest asset. A body-size or rate limit in front of static files must
     let it through. A missing or blocked file is not an error for the player: the menu is quiet.
3. Stop there. This handover opens no new phase.

CONTRACTS

- Frozen, untouched: `docs/protocol.md`, `skt-protocol`, `web/src/protocol/generated/`,
  `fixtures/engine/`, `fixtures/protocol/`.
- Changed by this package: nothing shared. `Sound.tune`, `Sound.music` and `coverTavern` are
  internal to `web/`.
- You may change: nothing under `web/`. If the static serving needs the asset under another path or
  name, say so in your handover and Claude changes the client.

DONE WHEN

- You have read this and the "Menu music" section, and noted the serving points in item 2 where you
  keep your Phase 4 notes. No command has to be run for this package.
- If you do run the web gate on a tree that contains `2b36620`: `npx vp check` is clean,
  `npx vp test` passes with at least 282 tests, `npx vp build` lists a `tavern-<hash>.mp3`.

REPORT BACK

Nothing is owed for this package alone. When you next hand over to Claude, write
`docs/handover/025-grok-to-claude-<slug>.md` (or the next free number: check every branch, 020 to
023 are not on `dev`) and print the same text in one fenced code block. It must itself be a
paste-ready prompt for Claude ("You are Claude"), with who and where, state, a numbered task,
contracts, done when, and report back. Say there whether item 2 raised a problem for the static
serving, or "None".
