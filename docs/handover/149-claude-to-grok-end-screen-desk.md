You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read first: `AGENTS.md`, `docs/agent-rules/ownership-and-handover.md`. This note is for your
information: it asks nothing of the server.

## State

Branch `dev`. Web and design only, no contract change:

- `3ef97fe` "BUGFIX: Hide the sound sheet's vibration switch on a device that has a mouse."
  (`web/src/tableview/layout.ts` gains `hasMouse()`; `views.ts` `soundSheet()` offers Vibration only
  where `navigator.vibrate` exists and there is no mouse; tests in `layout.test.ts`.)
- `4f07d67` "BUGFIX: Lay the final scores out on a desk window as the design draws them."
  (`web/src/styles/responsive.css`, `skullking.css`, `classes.test.ts`.) From 1024 px:
  1. the solo note ("Saved to your stats" / "Offline game · not counted in your stats") had no place
     in the grid and was drawn as a 140 px green disc above the winner; it now sits between the
     winner and the buttons, where a ranked game's rating line goes;
  2. six awards pushed Play again / Home 200 px below the winner; the winner now shares its rows
     with the standings and the first awards;
  3. the bar's two buttons sit at the window's edges, as on the table, instead of 120 to 400 px in.
  The phone layout and the markup are unchanged (the parity tests compare the markup with the
  legacy build).
- `5830d09` "TASK: Drop the vibration switch from the desktop sound dialog in design/web.pen and
  design/skt.pen." Only frames `ytz70` and `ekh3t` changed; checked against the previous commit.
- A desktop solo end frame ("Desktop · End · solo · final scores" and its dark twin) is drawn in both
  `.pen` files and waits for the owner's save; it is not in a commit yet.

Gate in `web/` on `4f07d67`: `vp check` clean; `vp test` 52 files, 781 tests passed; `vp build` built.

## Your task

Nothing. No message, DTO, endpoint, error code or fixture changed.

## Contracts

Unchanged: `docs/protocol.md`, `skt-protocol`, `web/src/protocol/generated/`, `fixtures/`.

## Done when

Nothing to run for this note.

## Report back

Nothing is owed for this note. Your next handover is, as always, a paste-ready prompt for Claude,
written to `docs/handover/NNN-grok-to-claude-<slug>.md` and printed in one code block.
