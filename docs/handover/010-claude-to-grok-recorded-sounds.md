You are Grok, the backend engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the Rust server, the Compose and
deploy files and CI. Claude writes the web client and never edits `server/` or `.github/`. You and
Claude cannot see each other's sessions: the owner pastes handover prompts between you. This is
handover 010. It replaces 009 (same branch, one more sound): read this one only. It is not the
answer to your 008: the owner asked for a small web package in between (recorded sounds). C3 has
not landed. Phase 1 is still closed.

READ FIRST, IN THIS ORDER
1. `AGENTS.md` and `docs/agent-rules/` if this is a new session. For this package:
   `ownership-and-handover.md`, `git.md`, `definition-of-done.md`, `web-quality.md` (Network).
2. `web/README.md` on the branch named below, the section "Recorded sounds" and the new line under
   "Deliberate differences from the legacy page".

STATE

Branch `feature/claude-card-play-samples`, commits `dc0a27b` and `0a058dd` (and the handover 009
commit `086100b` between them), cut from `dev` (`4845b2e`). This handover file is the next commit on
that branch. Worktree `/Users/nvorberg/Documents/development/skt-claude-sound`. Local, not pushed,
not on `dev`. Do not merge it and do not commit in that worktree; the owner merges.

Your handover 008 is commit `629bfb2` on `feature/grok-ui-gate`. It is not on `dev`, so this branch
does not contain `docs/handover/008-…`.

What landed, all under `web/`:
- `web/src/sound/samples/` — seven recorded takes, 16-bit mono WAV at 44.1 kHz, 107 kB together:
  `card-play-a.wav` … `card-play-d.wav` (a card being played, 16.8 to 21.2 kB each) and `tap-a.wav`
  … `tap-c.wav` (a plain button press, 8.9 to 10.6 kB each). Generated with ElevenLabs Sound Effects
  on the owner's account; how they were cut and levelled is in `web/README.md`.
- `web/src/sound/samples.ts` — `loadSamples()` fetches the seven files (bundled, same origin) and
  hands them to the mixer. `web/src/main.tsx` calls it once at startup and waits for nothing.
- `web/src/sound/sound.ts` — `Sound.samples(name, files)`. The takes are decoded as soon as they
  arrive, with an `OfflineAudioContext`, so they are ready before the first tap; a browser without
  one decodes when the audio graph is built. A sound with decoded takes plays one of them: never the
  one it played last, and a little faster or slower each time (cards up to 6 %, the tap up to 4 %).
  With no takes (not loaded yet, a failed request, a file the browser cannot decode) the
  synthesised recipe plays exactly as before.
- Tests: `web/src/sound/sound.test.ts` (10) and `web/src/sound/samples.test.ts` (3).

The parity suite is unchanged and still passes. Its test page never loads takes, so it keeps
comparing the synthesiser with the legacy page, call for call. `legacy/` is untouched.

The gate, from `web/` in that worktree, Node v25.2.0 (the same version warning as in your 008):
- `npm ci` — found 0 vulnerabilities.
- `npx vp check` — all 47 files formatted; no warnings, lint errors or type errors in 41 files.
- `npx vp test` — 13 files, 105 tests passed (92 before, 13 new).
- `npx vp build` — 50 modules. `dist/assets/index-BPSUDFHJ.js` 339.92 kB,
  `dist/assets/index-Ds6jq9VY.css` 45.00 kB (unchanged), and seven `dist/assets/*-<hash>.wav`.
- `node scripts/generate-engine-fixtures.mjs --check` — `fixtures/engine matches the generator
  (41 games).`
- In a browser (`vp dev`, Chromium): all seven files answer 200. In a solo game the four cards of a
  trick played four different card takes at four different speeds. The first button press after a
  page load, and the four after it, each played a tap take and no synthesised voice. No console
  errors or warnings.

Not done:
- The owner has not yet confirmed the takes and their level by ear. The levels were matched to the
  synthesised sounds by measurement only.
- Whether the owner's ElevenLabs plan allows these files in a public release is the owner's check.
- C3 (`design/web.pen`) from your 008 is not started. This package changes nothing a player can
  see, so the design file needs no change for it.

`docs/protocol.md`: None. No message, DTO, endpoint or error code is touched.

Fixtures the Rust harness should replay again: None. `fixtures/` is untouched.

Emote ids: the owner has not named them in this session.

YOUR TASK

Nothing in `server/` changes for this package. Two things to keep in mind where you own the files:

1. `.github/workflows/web.yml`: no change needed. `web/**` already triggers it, and the job needs no
   audio tooling: the tests stand in for Web Audio and `fetch`. If you run the web gate on the
   merged tree, expect the counts above.
2. When you write the production static serving for `web/dist` (the nginx in the Compose setup, plan
   Phase 4), the client fetches `/assets/card-play-*-<hash>.wav` and `/assets/tap-*-<hash>.wav` with
   `fetch()` from its own origin and decodes the bytes itself:
   - A Content-Security-Policy must allow it: `connect-src 'self'`. `media-src` is not involved; no
     `<audio>` element is used.
   - The content type does not matter to the client (`application/octet-stream` is fine, also with
     `X-Content-Type-Options: nosniff`). nginx's stock `mime.types` has no entry for `.wav`; adding
     `audio/wav wav;` is tidy but optional.
   - The file names are content-hashed like the other assets, so they can get the same long
     `Cache-Control` as the scripts and fonts.
   - A missing or blocked file is not an error for the player: that take is left out, and with none
     the synthesised sound plays.
3. Stop there. This handover does not open Phase 1.

CONTRACTS

- Frozen, unchanged: `docs/engine-conformance.md` §3–§5, `docs/protocol.md`, the 41 fixtures,
  `legacy/Skull King Tavern.html`.
- Changed by Claude in this package: `web/` only (the files listed above and `web/README.md`), and
  the handovers 009 and 010.
- You may change `server/`, the Compose and deploy files and `.github/`. You may not edit `web/`
  except `web/src/protocol/generated/`.

DONE WHEN

- Nothing is required of you for this package to be complete.
- If you check the merged tree: from `web/`, `npm ci`, `npx vp check`, `npx vp test` (13 files, 105
  tests) and `npx vp build` pass, and `node scripts/generate-engine-fixtures.mjs --check` prints
  that the fixtures match.

REPORT BACK

Your next handover to Claude is `docs/handover/011-grok-to-claude-<slug>.md`, also printed in one
fenced code block. It must itself be a paste-ready prompt for Claude ("You are Claude"), with who
and where, state, a numbered task, contracts, done when, and report back. For this package it only
needs to say: whether the web gate passed on the merged tree if you ran it, with the counts; and,
once the static serving exists, which CSP and cache headers `/assets/*.wav` gets.
