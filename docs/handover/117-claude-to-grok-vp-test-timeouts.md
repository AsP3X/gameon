# 117 · Claude → Grok · `vp test` no longer times out on a busy machine

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/agent-rules/definition-of-done.md` and `docs/agent-rules/web-quality.md`
first. Handover 115 said the "Test timed out in 5000ms" failures of `vp test` were mine to look
at. They are fixed. There is nothing for you to build; there is one thing to know about CI.

## State

- Branch `dev`, on `bb101d6`. Not pushed. My commit is
  `BUGFIX: Stop vp test from timing out on a busy machine, and stop one timeout from failing the tests after it.`
- I edited `web/vite.config.ts`, `web/src/online/Accounts.test.tsx`,
  `web/src/online/Ranked.test.tsx` and `web/src/game/reference.test.ts`, and added
  `web/src/online/steps.ts` and `web/src/online/steps.test.ts`. No file under `server/`, `.github/`,
  `docs/protocol.md`, `web/src/protocol/generated/` or `fixtures/`. Protocol stays 1. No file in
  `design/`: nothing on screen changed. No assertion was removed or loosened.
- The cause. The four tests that timed out play whole games: one in `Accounts.test.tsx`, two in
  `Ranked.test.tsx`, one in `reference.test.ts`. They run under fake timers and wait for nothing.
  Measured alone, each uses 1.9 to 2.5 s of CPU in 1.4 to 1.8 s of wall time; the profile is
  jsdom building the table's markup. So their time is the machine's load. Vitest runs one file
  per core but one: ten at once on the owner's Mac, which has five performance and six efficiency
  cores. Run on the efficiency cores alone (`taskpolicy -b`), the three page tests ran past the
  5 s and the reference test took 10 s.
  With ten workers they took 4.1 to 5.7 s and failed in two full runs of three; with five they
  took 2.2 to 2.9 s.
- The fix, in three parts.
  1. `web/vite.config.ts` sets `test.maxWorkers` to the number of performance cores on a Mac
     (`sysctl -n hw.perflevel0.logicalcpu`). On Linux, and on a Mac without that value, it is
     `undefined` and Vitest's own count stands. The whole suite takes 25 to 30 s either way: it is
     as long as `src/tableview/parity/solo.test.ts`.
  2. The four whole-game tests have a timeout of 60 s. The parity tests, which are whole games
     too, already had 120 s.
  3. A test that timed out used to go on running into the tests after it: on their fake clock,
     in their page, inside an `act()` the teardown had cut across. That is why the tests after
     the quick-play game in `Accounts.test.tsx` failed within milliseconds. Every wait of the
     Accounts and Ranked tests now goes through `step()` in `web/src/online/steps.ts`, and
     `afterEach` calls `endSteps()` first: the step that is running ends, the test that made it
     stops there, and only then is the page unmounted. `steps.test.ts` guards it.
- The gate, from `web/`, on a `git archive` copy of the tree of `bb101d6`:
  `./node_modules/.bin/vp check` clean (150 files formatted, 138 with no warnings, lint or type
  errors). `./node_modules/.bin/vp test`: 48 files, 682 passed, six runs in a row. Three of them
  had 16 busy loops running next to them (load average 30 to 146 on 11 cores); the whole-game
  tests took 5.8 to 8.7 s there and passed. `./node_modules/.bin/vp build` built.
- With the timeouts forced down to 150, 400, 800, 1200 and 1500 ms, only the tests that timed out
  failed, and every other test of both files passed. Before the fix, a forced timeout of the
  quick-play game failed four more tests in `Accounts.test.tsx`.
- The gate was run on a copy because another session was editing `web/src/game/` in the same
  checkout at the time (the bot levels of handover 116). Its files are not in `bb101d6`.
- Not done. The eleven other page test files (`OnlineScreens.test.tsx`, `Tables.test.tsx`,
  `src/gameon/*.test.tsx`, `src/skullking/*.test.tsx`, `App*.test.tsx`) still have the old
  teardown: a timeout there can still fail the tests after it in the same file. None of them
  plays a whole game, and none timed out in any run. Under the 16 busy loops
  `parity/solo.test.ts` took up to 93 s of its 120 s, and
  `src/net/mock/ranked.test.ts` ("ends placement with the fifth game") up to 3.7 s of its 5 s.

## Your task

1. Nothing to build.
2. `.github/workflows/web.yml` needs no change: on `ubuntu-latest` the worker count is Vitest's
   own, as before. If a CI run ever shows "Test timed out" in `web/`, put the test name and its
   duration in a handover; do not raise a timeout in `web/` yourself.

## Contracts

- Frozen: `docs/protocol.md`, protocol 1, messages, error codes, the engine, both fixture trees.
  Nothing on the wire changed.
- `--maxWorkers=<n>` on the command line still overrides the count in `vite.config.ts`.

## Done when

- Nothing to run for this handover. To see it: from `web/`, `./node_modules/.bin/vp test` prints
  no "Test timed out" line. Other sessions' uncommitted work in `web/` may fail tests of its own.

## Report back

No return handover is needed for this one. Your next handover is the one you owe already. Like
every handover it is a paste-ready prompt for Claude, written to `docs/handover/` and printed in
one code block.
