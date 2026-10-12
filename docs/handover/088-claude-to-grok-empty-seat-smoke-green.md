# 088 · Claude → Grok · the empty-seat smoke is green on your server

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/agent-rules/ownership-and-handover.md` and your own
`docs/handover/087-grok-to-claude-empty-seat-counts.md` first. This closes Package 1b on my side.
There is nothing for you to build. Two things below are for you to know.

## State

- Branch `dev`. My change is commit `6e9b2b3` ("FIX: Close the Welcome back sheet in the browser
  smokes before they tap the home screen."). It sits on your `8fb4cbf`.
- Changed: `web/e2e/player.ts` (a player taps "Come in" when the home screen greets),
  `web/e2e/empty-seat.e2e.ts` (the same after the reload), `web/e2e/pwa.e2e.ts` (the same, and it
  now waits until it has heard of an answer under `/api` before it counts them).
- The mock needed no change. Your four sentences in §5.5 are what it already does.
- I built `skt-server` from `dev` at `8fb4cbf`, started it on `127.0.0.1:8080` against the local
  Postgres, and stopped it afterwards. It left guests and finished games in the local database.
- From `web/`, `SKT_E2E_TARGET=http://127.0.0.1:8080 npm run e2e`, with `player.ts` and
  `empty-seat.e2e.ts` as they are in `6e9b2b3`: `empty-seat` 3 passed, `four-players` 5 passed,
  `ranked-smoke` 1 passed, `pwa` 2 passed and 2 failed. Both failures were the Welcome back sheet
  over "Play online". `pwa.e2e.ts` runs on its own mock host and never reaches your server.
- After the fix to `pwa.e2e.ts`: 4 passed, four runs out of four. I did not run the whole suite
  again after that fix.
- `SKT_E2E=1 SKT_E2E_TARGET=mock npx vp test e2e/empty-seat.e2e.ts`: 3 passed.
- The one failure of `pwa.e2e.ts` I could not explain in 083 is explained: the script asked how
  many answers it had seen before Playwright had told it of the first one. It now waits.
- `vp check`: 110 files formatted, 100 files with no warnings, lint or type errors.
- `vp test`: 34 files, 454 passed, 2 failed. See the next section. My commit touches no file
  that `vp test` runs.

## Two tests are red on `dev`, and they came with the menu music

Both passed at `ddf3e7f` (456 of 456). Both fail at `8fb4cbf`, before my commit and after it.

1. `src/online/OnlineScreens.test.tsx`, "stops the menu music while the hub is where the home
   screen was, and brings it back with it". It expects the theme right after mount and silence on
   the hub. 085 and 086 made it the other way round.
2. `src/tableview/parity/sound.test.ts`, "makes the same Web Audio calls for every sound, the
   volume and the ambience". The two traces differ from the first step, `0 press .home`. The
   scenario's first touch no longer unlocks audio in the port, since 084 took `Sound.unlock()`
   out of `listen()`.

`src/game/reference.test.ts` also timed out once at 5 seconds while a browser suite and a cargo
build were running. Alone it passes. That one is load, as you saw in 081.

084, 085 and 086 changed files under `web/` and named one test file in their gate. `web/` is my
lane in `AGENTS.md`. If the owner asked you to work there, the gate for it is the whole
`vp test`, `vp check` and `vp build`, as `docs/agent-rules/web-quality.md` says. Do not fix the
two tests yourself. I fix them when the owner hands me that, and I have told the owner.

## Still open, and not yours

- The Welcome back sheet of 085 has no frame in `design/web.pen`. I looked: there is none. It is
  my task from 085 and it is not done.
- The restart: a kicked player can sit back down after a process restart, while a ranked forfeit
  and cooldown are already written. The owner decides before `master`.

## Contracts

- Nothing on the wire changed. Protocol stays 1.
- You do not edit `web/` outside the generated folder, or a `.pen` file. I do not edit `server/`.

## Done when

There is nothing to run. Package 1b is on `dev` on both sides: your `12bbbd5` and `ef55920`, my
`ddf3e7f`, `8197791` and `6e9b2b3`.

## Report back

No return handover, unless you disagree with a count above or with the lane. If you do, write
`docs/handover/NNN-grok-to-claude-<slug>.md` and print it in one fenced code block.
