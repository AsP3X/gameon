# 115 · Claude → Grok · the first touch unlocks audio again, and the sound parity test passes

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/agent-rules/definition-of-done.md` and `web/README.md` ("Deliberate
differences from the legacy page", "Menu music") first. Handover 114 said
`src/tableview/parity/sound.test.ts` fails and is mine. It is fixed. There is nothing for you to
build; there are two things to keep to.

## State

- Branch `dev`, on `bfde1e5`. Not pushed. My commit is
  `BUGFIX: Unlock audio on the first touch again, as the legacy page does.`
- I edited `web/src/tableview/events.ts`, `web/src/tableview/tavern.test.ts` and `web/README.md`.
  No file under `server/`, `docs/protocol.md`, `web/src/protocol/generated/`, `fixtures/`, Compose
  or the nginx templates. Protocol stays 1. No file in `design/`: nothing on screen changed.
- The cause. The first commit that fails is `2b9f15f` ("Start the menu theme from Play, not from
  any tap", handover 084); its parent `c0dc3c1` passes. Checked by running the one test on a
  `git archive` copy of each. That commit took every `Sound.unlock()` listener out of `listen()`.
  The legacy page unlocks on the first `pointerdown`
  (`addEventListener('pointerdown',()=>Sound.unlock(),{once:true,capture:true})`), and the sound
  scenario begins with that press. So the legacy side built its audio graph at step
  "0 press .home" and the port built none until the first sound. The harness was recording
  correctly.
- The fix. `listen()` calls `Sound.unlock()` on `pointerdown`, `pointerup` and `keydown`, in the
  capture phase, and takes the three listeners off once `unlock()` answers that the graph runs.
  It does not start the theme: `Sound.unlock()` starts a tune only when `Sound.music(true)` was
  asked for, and that is still `armMenuMusic()` alone (the welcome's close).
- What a player hears. On a page that opens without "Welcome back" (any address but
  `/skull-king`), a player who has the sea switched on hears it from the first touch. Since
  `2b9f15f` it only came in after the sound settings were touched. Nothing else is audible or
  visible.
- From `web/`: `./node_modules/.bin/vp check` clean (148 files formatted, 136 with no warnings,
  lint or type errors). `./node_modules/.bin/vp test`: 47 files, 680 passed.
  `./node_modules/.bin/vp build` built.
- In Chrome, against `vp dev`: on `/skull-king` the graph is built in the first `pointerdown`, the
  sheet stays and no tune starts; "Come in" starts the tune. On `/skull-king/solo` with the sea
  switched on, the sea's looped source starts in the first `pointerdown`.
- Not from this package, and not fixed: on a busy machine `vp test` sometimes fails with
  "Test timed out in 5000ms" in `src/online/Ranked.test.tsx`, `src/online/Accounts.test.tsx` or
  `src/game/reference.test.ts`. Each of those tests takes 1.2 to 1.7 s alone. The same timeouts
  show on a clean copy of `3882e3c` (one run in six, load average above 20 on 11 cores). It is
  mine to look at.

## Your task

1. Nothing to build.
2. If the owner has you change `web/` again: leave the three unlock listeners in `listen()`, and
   run the whole `./node_modules/.bin/vp test` from `web/` before you report. Handover 084 ran
   `tavern.test.ts` and `sound.test.ts` only, and the parity test that would have caught this is
   in neither.

## Contracts

- Frozen: `docs/protocol.md`, protocol 1, messages, error codes, the engine, both fixture trees.
  Nothing on the wire changed.
- `web/src/tableview/parity/` compares the port with `legacy/Skull King Tavern.html`. A difference
  it reports is fixed in the port, or written into `web/README.md` as a deliberate difference
  together with the one place in `parity/harness.ts` that accounts for it. It is not switched off.

## Done when

- Nothing to run for this handover. To see it: from `web/`,
  `./node_modules/.bin/vp test src/tableview/parity/sound.test.ts` prints `1 passed`.

## Report back

No return handover is needed for this one. Your next handover is the one handover 114 asks for
(`fillsAt` as one number). Like every handover it is a paste-ready prompt for Claude, written to
`docs/handover/` and printed in one code block.
