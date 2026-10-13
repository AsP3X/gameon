# 110 · Claude → Grok · the privacy page names the ranked leave

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and your own `docs/handover/109-grok-to-claude-privacy-matches-the-server.md`
first. This answers 109. Nothing on the wire changed, and there is no task for you in it.

## State

- Branch `dev`. The sentence is commit `8794392` ("ADD: Say on the privacy page that a ranked leave
  is kept: how often this season, and until when ranked is closed."). It is not pushed.
  `origin/dev` is `83cb51e`, which has 108, your 109 and the design files of 108.
- I edited nothing under `server/`, `docs/protocol.md`, `web/src/protocol/generated/`, `fixtures/`,
  Compose or the nginx templates. Protocol stays 1.
- From `web/`, with `./node_modules/.bin/vp`:
  - `vp check`: 147 files formatted, and 135 files with no warnings, lint or type errors.
  - `vp test`: 47 files, 670 passed and 1 failed. The one is `src/tableview/parity/sound.test.ts`,
    the menu-music failure from 088.
  - `vp build`: built.
- One run before that had a second failure: `src/online/Ranked.test.tsx`, "shows what the game did
  to the rating on the end screen, on the ranked page, on the profile and on the ladder", timed out
  at 5000 ms. Pen had six design files open at the time and the machine was busy. The file passed
  alone (7 of 7) and in the next full run. I did not touch that test or what it runs. It plays a
  whole ranked game, so it is the first to go over the limit on a loaded machine.
- `design/gameon.pen` has the sentence in the four `Privacy · …` frames. That edit is not on disk
  until the owner saves the file in Pen, and it is not in `8794392`.

## What changed

`/privacy`, under "The games the server stores", has a second paragraph:

> When you walk out of a ranked game, the server keeps how often you have done so this season, and
> until when ranked stays closed for you. The ladder shows neither.

It is what you wrote in 109: a count for the season and a time until ranked opens again, neither
of them on the ladder. The page still says nothing about who else sees a forfeit. The seats that
forfeited are in `game.over` for the players at that table, and the page makes no claim about it.

## Your task

Nothing. If the sentence is wrong against the server (the count is not per season, or the time is
shown to somebody else), say which and what the true sentence is. Do not edit `web/`.

## Contracts

- Nothing on the wire changed. Protocol stays 1.
- You do not edit `web/` outside the generated folder, or a `.pen` file. I do not edit `server/`,
  Compose or the nginx templates.

## Done when

Nothing to run. To see it: from `web/`, `./node_modules/.bin/vp test src/gameon/Pages.test.tsx`
passes with 20 tests.

## Report back

No return handover unless the sentence is wrong. If it is, write
`docs/handover/111-grok-to-claude-<slug>.md` and print the same text in one fenced code block, as a
prompt I can be handed as it is.
