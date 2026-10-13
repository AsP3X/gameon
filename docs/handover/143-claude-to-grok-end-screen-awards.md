# 143 · Claude → Grok · six more awards on the end screen

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, then this file. Nothing here asks for server work: it tells you what the web
client now reads from the round log, so a change to that log does not surprise the end screen.
You do not edit `web/` or a `.pen` file.

## State

- Branch `dev`, not pushed.
- The feature is commit `0390c47` (`ADD: Show more end-screen awards and keep a short phone to
  four.`). I wrote its files but did not make that commit: it was made in the shared checkout
  while my gate was still running, and at that commit `vp check` has one lint warning
  (`web/src/tableview/awards.test.ts`) and five parity tests fail (below).
- The commit after it, named in the chat next to this prompt
  (`FIX: Compare the legacy four awards in the parity run.`), fixes both. It changes
  `web/src/tableview/awards.test.ts` and `web/src/tableview/parity/harness.ts`, gives an award
  tile 2 px more room for its name on a phone under 375 px wide (`web/src/styles/tavern.css`),
  and adds this file.
- Designs: commit `514ab2e`, made by another Claude session from the owner's one save. It holds
  my award frames in `design/web.pen` and `design/skt.pen` next to that session's frames.
- Protocol stays 1. Nothing under `server/`, `docs/protocol.md`, `web/src/protocol/generated/`
  or `fixtures/` was touched. While I worked the checkout had uncommitted changes in
  `docs/protocol.md` and four files under `server/`. They are not mine; I did not stage, commit
  or change them, and the gate did not include them.
- Gate, on a clean export of `HEAD` (`74d8541`) plus the files of that commit (`git archive` of that tree,
  with `web/node_modules` linked in), from its `web/`: `vp check`: 156 files formatted, no
  warnings, lint or type errors in 144 files. `vp test run`: 52 files, 760 passed. `vp build`:
  built.
- Browser check: headless Chrome against the dev server with `?mock`, the end screen drawn from
  a hand-made score view of 2, 4 and 6 seats, at 360, 390, 412 and 1440 px wide, light and dark.
  No sideways scroll and no page error. Heights from 560 to 860 px: six awards from 660 px up,
  four below that when the solo note is on the screen, and the screen never scrolls where it did
  not scroll with four awards before (360 × 560 with four seats and the solo note did, and does).
- Not run: a full game played by hand to the finale in a browser (the parity tests play three
  whole games to it in jsdom), `npm run e2e`, and a browser against `skt-server`.

## What the page does now

`web/src/tableview/awards.ts` (new; the function moved out of `views.ts`):

- Ten awards can be earned, handed out in this order: Sharpshooter, Hot streak, Bounty hunter,
  Biggest haul (the four there were), then Kingslayer, Pirate hunter, Bold call, Ghost ship,
  Plunderer, Walk the plank.
- Every one is worked out on the client from the finished rounds of the log the scoreboard
  already shows (`RoundRecord`): `bids`, `tricks`, `ps`, `sm`, and the score of each seat from
  `Rules.scoreSeat`. Nothing is sent and nothing is asked of the server.
  - Kingslayer: the most rounds with `sm === seat`.
  - Pirate hunter: the largest sum of `ps[seat]`.
  - Bold call: the highest bid of three or more that was made exactly.
  - Ghost ship: the most zero bids made, two or more.
  - Plunderer: the largest sum of `tricks[seat]`.
  - Walk the plank: the lowest score of one round, below zero.
- The end screen shows six at most. When more are earned, an award for a seat that has none yet
  is kept before a second one for a seat that has, and the rest of the room goes to the others in
  order. On a phone where six would make the screen scroll it shows four, picked the same way
  (`fitAwards` in `web/src/tableview/render.ts`, also run when the rating line of a ranked game
  arrives).
- Six badge icons are new in `web/src/tableview/art.ts`: `skull`, `hook`, `flag`, `ghost`,
  `stack`, `anchor`.

Parity tests (`web/src/tableview/parity/harness.ts`): the legacy build has four awards, so the
port is handed those four for the run, as it is handed the legacy bots. The new ones are tested in
`web/src/tableview/awards.test.ts` and `web/src/tableview/tavern.test.ts`.

Designs: every `End · final scores` frame (phone and desktop, offline, online, ranked, light and
dark; in `design/skt.pen` the four `End · solo ·` frames with awards too) has a third row,
"Plunderer" and "Walk the plank". `End · awards (all ten)` and its dark twin show all ten. The six
icons are components next to `Icon / flame`.

## Your task

Nothing to build. Two things to keep in mind:

1. `ps` and `sm` of `RoundRecord` are now read by the end screen for every seat, not only for
   the score. They are public facts of a finished round already (`docs/protocol.md`, the engine
   view); they must stay filled in for all seats in the log of a finished game.
2. If you ever want an award the log cannot answer (a comeback, a trick won with a certain card),
   that is a protocol change: propose the field in a handover first.

## Contracts

- Frozen and unchanged: `RoundRecord`, the engine view, every message and error code.
- You may change nothing in `web/` or `design/`. Ask in a handover.

## Done when

Nothing to run for this package. If you want to see the gate: in `web/`, `npm run check`,
`npm test`, `npx vp build`; the results are the ones under State.

## Report back

No answer is needed. If something above is wrong about the log (a field that is not filled in for
every seat in a finished round, online or solo), say so in a handover written to
`docs/handover/NNN-grok-to-claude-<slug>.md` and printed in one fenced code block, as a
paste-ready prompt for Claude.
