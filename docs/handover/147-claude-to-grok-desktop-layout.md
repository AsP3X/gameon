You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read first: `AGENTS.md`, `docs/agent-rules/ownership-and-handover.md`. This note is for your
information: it asks nothing of the server.

## State

Branch `dev`, commit `418e88b` ("BUGFIX: Line up the way cards, the round cards and the foot bar on a
wide window."). Web only, stylesheets only: `web/src/styles/{online,skullking,gameon,tavern,responsive}.css`
and `web/src/styles/classes.test.ts`. No message, DTO, endpoint, error code or fixture changed.

The owner asked for a check of every page at desktop widths (the landing page left out). Each page
was opened at 1024, 1280, 1366, 1440 and 1920 px against the in-page mock (`?mock`) and compared
with the desktop frames of `design/skt.pen`. Five defects were found and fixed:

1. `/skull-king/online`: the three doors (Quick play, Public tables, Your table) were 528, 415 and
   412 px wide from 1280 px. All three are 528 px now.
2. `/skull-king` and `/games`: the Solo and Online cards side by side could differ in height when
   one line wrapped further (92 against 112 px at 1280 px; 90 against 109 px on Games at 1024 px).
   They are as tall as each other.
3. `/skull-king` at 1280 to 1439 px: the Ranked row's "Sign up" pill left its line 59 px, so
   "Needs a free account." ran over three lines. The pill sits under the line in a row that narrow.
4. `/skull-king/solo`, `/skull-king/online/new`, `/skull-king/online/public/new`, the table rules:
   the five round cards wrapped ten rounds as nine and one, and centred a short card's text. They
   start at the top and run five to a line, as the frames draw them.
5. Every screen with a bar at its foot (`/skull-king/online/join`, the queue, `/skull-king/score`):
   the button was 560 px under a 528 px column. It is 528 px. On `/skull-king/one-screen` the
   Set sail button ended 24 px past the columns under 1360 px wide; it ends with them.

Gate, run in `web/` on the tree of that commit: `vp check` clean (156 files formatted, 144 files
without warnings); `vp test` 52 files, 777 tests passed; `vp build` built.

Not done, and not started: the end screen was left alone because another session was changing its
awards at the same time. `design/skt.pen` and `design/web.pen` are unchanged: the fixes bring the
page to what the frames already draw, and the frames have no 1280 px home.

## Your task

Nothing. If server work of yours changes what a way card, a round card or a foot bar must show,
describe the screen, the state and the copy in your handover.

## Contracts

Nothing changed. `docs/protocol.md`, `skt-protocol`, `web/src/protocol/generated/` and
`fixtures/` are as they were.

## Done when

Nothing to run for this note. To see the gate: `cd web && npx vp check && npx vp test && npx vp build`.

## Report back

Nothing is owed for this note. Your next handover is, as always, a paste-ready prompt for Claude,
written to `docs/handover/NNN-grok-to-claude-<slug>.md` and printed in one code block.
