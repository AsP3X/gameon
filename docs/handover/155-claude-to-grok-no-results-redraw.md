# 155 · Claude → Grok · do not redraw the results (return)

You are Grok, working on Skull King Tavern (`/Users/niklas/Documents/development/gameon`). This is
the return handover for `docs/handover/154-grok-to-claude-no-results-redraw.md`. There is no server
work and no task for you in it. Read it and tell the owner the change is on `dev`.

## State

- Branch `dev`, not pushed, started from `111bb54` (`git fetch origin` + `git merge --ff-only
  origin/dev`: already up to date). The change is the commit `BUGFIX: Stop a ready update from
  rebuilding the open round results for the other seats.`
  (`git log -1 --oneline -- docs/handover/155-claude-to-grok-no-results-redraw.md`).
- Files in the commit (Claude's paths only):
  - `web/src/tableview/actions.ts` — `present()`: an update with no events, while this seat has
    the Round results open (no curtain), with the phase `roundEnd` before and after and the same
    round, no longer calls `render()`. The new `markReady(v)` edits only each seat's bid line
    (`seatBid`, so a ready seat shows `<span class="ready">Ready</span>`) and its `.ring` (removed,
    then `deadlineRing` inserted after the avatar when the seat is on the new deadline). Seats are
    found from `[data-anchor="seat-N"]`, in `.seat` or `.mebar`. If a seat is not found where the
    table drew it, `present()` falls back to `render()`. Every other update renders as before.
  - `web/src/tableview/views.ts` — `deadlineRing` and `seatBid` are exported, unchanged.
  - `web/src/tableview/online.test.ts` — "keeps the round points on the results when somebody
    else is ready" now also checks, after Remy readies (`ready: [false, true, false]`, a
    `nextRound` deadline on seat 0 only, `OTHERS`, no events): the `.sheet` and every
    `.sheet .res` are the same nodes as before, the points are unchanged and not all `0`, Remy's
    seat shows `Ready` and has no ring, this seat keeps its ring and shows no `Ready`. A second
    update that puts Remy back on the clock gives Remy a ring again, still on the same `.sheet`.
  - `docs/handover/155-claude-to-grok-no-results-redraw.md` — this file.
- The `data-count` fill in `render()` (from `abdbf96`) and the parity harness are unchanged.
- With `present()` forced to call `render()` for that update, the test fails:
  `expected <div class="sheet good" …> to be <div class="sheet good" …> // Object.is equality`.
  With the change it passes.

## Limits

Only the ready marks and the rings are patched. A no-event update in that state that changes
something else (a presence tag, say) is not drawn until the next full render; such changes arrive
with a `seatStatus` event today, and an update with events still renders in full. The `.actions`
bar under the sheet is not patched; `next()` closes the sheet and renders it.

## Gate (from `web/`, Node 22.23.3)

- `npx vp check`: all 156 files correctly formatted; no warnings, lint errors or type errors in 144 files.
- `npx vp test`: 52 test files passed, 785 tests passed (including "waits after ready until the
  others are" and the parity tests).

## Design

No new copy, layout or control, so `design/web.pen` was left alone.

## Contracts

Nothing changed: no wire, protocol, server or fixture edits.

## Report back

Nothing to return. If a failure shows up in this area, route it back to Claude with a new handover
under `docs/handover/`, printed in one code block.
