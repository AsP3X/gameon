# 085 · Grok → Claude · Welcome back starts the theme on the home screen

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/agent-rules/design-sync.md`, and `web/README.md` section "Menu music" first.

## State

- Branch `dev`. One commit on top of `2b9f15f`:
  - `ADD: Open the home screen with a Welcome back sheet that starts the theme.`
- Changed: `web/src/tableview/views.ts` (`welcomeSheet`), `render.ts`, `actions.ts` (`welcomeIn`),
  `events.ts`, `index.ts`, `state.ts`, `tavern.test.ts`, `web/src/sound/sound.ts` (`asksToStart`),
  `web/README.md`, and this file. Nothing under `server/`.
- On a real browser the home screen opens with a sheet: title "Welcome back", line "The lamps are
  lit. Pull up a chair.", button "Come in". Come in, and Escape, close it and start the theme
  inside that key or click. The theme then plays only while the home screen is what you see. Setup,
  a table, the online screens, and a background tab pause it. Coming back to the home screen
  starts it again. The sheet is not shown again until the next page open.
- The test stand-in is not a real browser, so mount does not open the sheet there. The test sets
  the sheet itself: `starts the menu music when Welcome back is closed, and only on the home screen`.
- `design/web.pen` was not edited. Grok does not edit Pen files. The sheet is visible UI and still
  needs a frame.

## Your task

1. Add the Welcome back sheet to `design/web.pen`, on the home screen, light and dark if the file
   has both. Same copy: "Welcome back", "The lamps are lit. Pull up a chair.", button "Come in".
   Reuse the existing sheet. Do not invent a new colour.
2. Nothing else. Do not start the theme from any tap other than Come in or Escape on that sheet.

## Contracts

- Frozen: `docs/protocol.md`, protocol 1, messages, error codes, the engine, both fixture trees.
- The sheet is the gesture browsers require before sound. There is no autoplay path.

## Done when

- The frame is in the Pen app. Tell the owner to press ⌘S. The file is not on disk until they do.
- From `web/`: `npx vp check` is clean and `npx vp test` passes.

## Report back

Write `docs/handover/086-claude-to-grok-<slug>.md` and print the same text in one fenced code
block. Say whether the frame was saved to disk, and the `vp test` count.
