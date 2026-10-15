# 168 · Claude → Grok · landing header carousel (return of 167)

You are Grok, the callee, working on Skull King Tavern
(`/Users/niklas/Documents/development/gameon`), branch `feature/game-ocho`. Do this work
yourself. Do not run `claude` or `grok`. Read `AGENTS.md` and
`docs/handover/167-grok-to-claude-landing-carousel.md` first.

## State

Handover 167 is done on the web side. It's committed on `feature/game-ocho` in the commit that
adds this file (`ADD: Turn the landing hero into a Skull King and Ocho carousel.`). Nothing
under `server/`, the protocol, or the fixtures changed.

- `web/src/gameon/Landing.tsx`: `section.go-hero` is now a carousel. It's labelled
  `aria-roledescription="carousel"`, `aria-label="Live games"`, and has two slides
  (`role="group"`, `aria-roledescription="slide"`, labelled "Skull King, 1 of 2" and
  "Ocho, 2 of 2"). The slide that isn't showing has `hidden`, so it is out of the tab
  order and the a11y tree. There are previous and next buttons ("Previous game", "Next game")
  and two dots ("Show Skull King", "Show Ocho", with `aria-current` on the dot that shows).
  Every control is 44 px.
- Skull King slide: the copy, card fan, pills and links it had before. The green pill now says
  "Skull King is live". Play goes to `AT.home` (`/skull-king`).
- Ocho slide: the same hero shape with Ocho's fan, pill "Ocho is live", Play Ocho going to
  `AT.ocho` (`/games/ocho`), line "Match a colour or a number, then be the first to play your
  last card.", and pills 2–8 players · A table · Teams. It has no Solo, One screen or Ranked.
  The wide lead is new copy that the owner may want to review: "Card and board games in your
  browser. Open a table and share the code, or play two against two." The phone lead is
  "Card and board games in your browser. Play with friends."
- Autoplay: the slides advance every 6 s (`SLIDE_MS`). They pause while the pointer is over
  the hero, while a tabbable control inside has focus, and while `prefers-reduced-motion` is
  set. With reduced motion, the buttons and dots still work. The page title h1 sits inside the
  slide and gets focus on load. That focus doesn't pause autoplay, because it marks where
  reading starts, not use of the carousel. The slides container is `aria-live="polite"` while
  paused and `off` while it plays.
- The Ocho fan and key moved from `Games.tsx` into `web/src/gameon/art.tsx` (`OchoFan`,
  `OchoKey`) so the shelf and the hero share them. The hero's larger Ocho fan is styled in
  `web/src/styles/ocho.css`, because `gameon.css` may not style `oc-` classes.
- `design/gameon.pen` was edited through Pencil. All four landing frames (desktop, phone, light
  and dark) now have the Skull King slide with the controls under it. Four new frames,
  "Landing · hero · Ocho slide · desktop / desktop · dark / phone / phone · dark", show the
  Ocho slide. **The file is not on disk until the owner presses ⌘S in Pen**, so it is not in
  this commit.

## Gate (from `web/`)

- `npx vp check`: all 166 files formatted; no warnings, lint errors or type errors in 153 files.
- `npx vp test`: 55 files, 813 tests passed. New in `src/gameon/GameOn.test.tsx`: "turns the
  hero from Skull King to Ocho and back, each slide with its own Play" and "moves the hero on
  by itself, but not under the pointer, with focus inside, or with less motion asked for".
- `npx vp build`: built (only the existing chunk-size notice).

Not done: no manual browser smoke at 360 px / light / dark. The design screenshots in Pencil
were checked.

## Your task

Nothing on the server side is needed for this change. Read the commit and confirm that nothing
in your paths depends on the old hero copy ("First game live: Skull King"), for example a deploy
smoke test or an e2e check that greps the landing. Fix any such reference in your own paths.

## Contracts

No protocol, DTO, endpoint or fixture changed. The client addresses used are `/skull-king` and
`/games/ocho`. Both are existing routes.

## Done when

Either `grep -rn "First game live" server/ .github/ docker-compose*.yml` prints nothing, or
you have updated the hit and its gate passes.

## Report back

Write `docs/handover/169-grok-to-claude-<slug>.md` only if you found or changed something.
Make it a paste-ready prompt for Claude and print it in one fenced code block.
