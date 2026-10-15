# 153 · Claude → Grok · round results stay put (return)

You are Grok, working on Skull King Tavern (`/Users/niklas/Documents/development/gameon`). This is
the return handover for `docs/handover/152-grok-to-claude-round-results-stay.md`. There is no
server work and no task for you in it. Read it and tell the owner the bug is fixed on `dev`.

## State

- Branch `dev`, not pushed. The fix is the commit `BUGFIX: Keep the round points on an open results
  sheet when another seat readies.` (`git log -1 --oneline -- docs/handover/153-claude-to-grok-round-results-stay.md`).
- Files in the commit (Claude's paths only):
  - `web/src/tableview/render.ts` — `render()`: a redraw that is not a count-up
    (`!(ui.anim || ui.enter)`) sets every `[data-count]` element's text to its finished value, in the
    format `countUp` ends on (`sgn`, or `String` with `data-plain`). A count-up redraw is unchanged:
    the markup's `0` stays and `countUp()` runs.
  - `web/src/tableview/online.test.ts` — new test "keeps the round points on the results when
    somebody else is ready": plays to the results with `toResults`, reads every `.sheet .pts` (and
    checks they are not all `0`), `tell`s `ready: [false, true, false]` with `OTHERS` and no events,
    settles, and expects phase `roundEnd`, `ui.sheet === 'results'`, the Round results dialog still
    up, and the same `.pts` texts. It fails on the old `render.ts` (`expected [ '0', '0', '0' ] to
    deeply equal [ '+20', '+30', '-20' ]`) and passes now.
  - `web/src/tableview/parity/harness.ts` — new `withoutCounts()`, listed with "the places the port
    is drawn differently on purpose": the text of `[data-count]` elements is taken off both pages
    before they are compared; the `data-count` value is still compared.
  - `docs/handover/153-claude-to-grok-round-results-stay.md` — this file.
- `resultsSheet()` (`views.ts`) and `trkResultsSheet()` (`tracker.ts`) still write the literal `0`,
  as the legacy page does. They are unchanged from `2aa57f6`.

## Why the parity harness changed

The first attempt (put the number in the markup) broke parity on the sheet's first drawing. That is
reverted. With the fix in `render()`, three parity steps still differed (pass-and-play reduced and
full motion, solo): `click .actions [data-act="ability"]:last-child` when a Giant choice ends the
round offline. That click draws twice: `present()` opens the sheet with `ui.anim` (count-up), then
`act()` calls `render()` again (`web/src/tableview/actions.ts`, `act`) with no `ui.anim`. The legacy
page does the same and leaves `0` on every seat: the same bug as the online report, offline. Matching
legacy there would keep that bug, so the harness now compares count-up figures by their
`data-count` value, not their text.

## Gate (from `web/`, Node 22.23.3)

- `npx vp check`: all 156 files correctly formatted; no warnings, lint errors or type errors in 144 files.
- `npx vp test`: 52 test files passed, 785 tests passed (including the four parity tests and the new one).

## Design

No visible design change (same copy, layout and controls; only a wrong `0` is gone), so
`design/web.pen` was left alone.

## Contracts

Nothing changed: no wire, protocol, server or fixture edits.

## Report back

Nothing to return. If you see a failure in this area, route it back to Claude with a new handover
under `docs/handover/`, printed in one code block.
