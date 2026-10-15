# 154 · Grok → Claude · do not redraw the results

You are Claude, the callee, working on Skull King Tavern
(`/Users/niklas/Documents/development/gameon`). Do this work yourself. Do not run `claude` or
`grok`.

Read `AGENTS.md`, `docs/agent-rules/web-quality.md`, `docs/agent-rules/design-sync.md`,
`docs/agent-rules/git.md`, and `docs/handover/153-claude-to-grok-round-results-stay.md` first.
Then this file. There is no server task.

## State

- Branch `dev`, not pushed. Start from the commit that adds this file
  (`git log -1 --oneline -- docs/handover/154-grok-to-claude-no-results-redraw.md`).
  `git fetch origin` and `git merge --ff-only origin/dev` before you edit. If that fails, stop.
- `abdbf96` already stops a ready update from leaving the points at 0. It still rebuilds the
  whole page. The owner wants that rebuild not to happen for the other players.
- Commit only your paths. Do not stage `server/`, `docs/agent-rules/`, `AGENTS.md` or `CLAUDE.md`.

## What still happens

`present()` in `web/src/tableview/actions.ts` calls `render()` for every update.
`render()` in `web/src/tableview/render.ts` sets `#app` innerHTML, so the Round results
sheet is thrown away and built again. A `game.ready` from another seat is one of those
updates: no engine events, phase still `roundEnd`, the sheet already open. The server
publish stays. Do not change it. The client must stop rebuilding the page from it.

## Your task

1. When this seat is looking at the round results and an update arrives with no events, the
   phase still `roundEnd` and the same round, do not call `render()`. The `.sheet` node and
   its `.res` rows stay the same DOM nodes. The count-up is left where it is.
2. That update still has to show two things, by editing only those nodes:
   - A seat that is ready shows `<span class="ready">Ready</span>` where its bid line was
     (`seatBid` in `web/src/tableview/views.ts`). Find the seat from
     `[data-anchor="seat-N"]` (the avatar). Other seats are inside `.seat`. This seat is
     inside `.mebar`.
   - The countdown rings match the new deadline. The server restarts the clock, and the seat
     that readied drops off it. Replace or remove only the `.ring` svg. Use the same markup
     `deadlineRing` already builds (`--gone`, `--left`, `--calm`, `--ticks`).
3. Do not touch the results sheet, the felt, or the hands.
4. If the results sheet is not open, keep today's `render()`. The seat that pressed Next
   round has already closed its sheet (`next()`), and the test "waits after ready until the
   others are" must still see `Ready · waiting for 1 more` after its own answer.
5. Keep the `data-count` fill in `render()` for redraws that are not a count-up. This task
   does not remove it. Offline parity stays.
6. Extend `keeps the round points on the results when somebody else is ready` in
   `web/src/tableview/online.test.ts`. After Remy readies (`ready: [false, true, false]`,
   `OTHERS`, no events): the `.sheet` element and each `.sheet .res` are the same nodes as
   before the update, the points are unchanged and not all `0`, and Remy's seat shows
   `Ready`. Remy is seat 1, the first `.seat` when this device is seat 0.
7. No new copy, layout or control. Do not edit `design/*.pen`. Say so in the summary.
8. From `web/`, with `PATH` starting `/tmp/node-v22.23.3-darwin-arm64/bin` (already
   installed; do not install Node): `npx vp check` and `npx vp test`. Both must pass.

## Contracts

Frozen: the wire, `game.ready`, the server's ready publish. You may change
`web/src/tableview/actions.ts`, `render.ts`, `views.ts` (only if a helper must be shared),
and `online.test.ts`. You may not change server code or the protocol.

## Git

Branch `dev`. Commit only your paths after the gate passes. Do not push. Do not create a
branch or a worktree. Prefix `BUGFIX:`. One sentence. No AI attribution. If git would invent
a hostname email, use Niklas Vorberg <services@vorberg-webmail.de>.

## Done when

The new assertions fail if `present()` still calls `render()` for that update, and pass
after. Quote the `vp check` and `vp test` counts.

## Report back

Write `docs/handover/155-claude-to-grok-no-results-redraw.md` (or the next free number) and
print the same text in one fenced code block. No server work. No return task unless the gate
fails.
