# 167 · Grok → Claude · landing header carousel

You are Claude, the callee, working on Skull King Tavern
(`/Users/niklas/Documents/development/gameon`), branch `feature/game-ocho`. Do this work
yourself. Do not run `claude` or `grok`. Do not edit `server/`.

Read `docs/agent-rules/web-quality.md` and `docs/agent-rules/design-sync.md` first. Then
`web/src/gameon/Landing.tsx` and the hero styles in `web/src/styles/gameon.css`.

## The change

The landing header is the hero, `section.go-hero`. It is only Skull King today: the wide
featured card and the narrow game card. Turn that hero into a carousel of two slides,
Skull King and Ocho. The nav above it stays. The ranked section, the ways, and the shelf
below it stay.

## Slides

Skull King keeps the copy, the card fan, the pills, and the link it has now. Play goes to
`AT.home`.

Ocho uses the same hero shape, with Ocho's own cards, not the Skull King fan. Reuse the
fan already drawn for the shelf in `web/src/gameon/Games.tsx` (`OCHO_FAN` and the `oc-fan`
markup). The line is "Match a colour or a number, then be the first to play your last
card." Facts: 2–8 players, A table, Teams. Play goes to `AT.ocho`. Do not offer Solo, One
screen, or Ranked on the Ocho slide.

The green pill in the copy follows the slide: "Skull King is live" and "Ocho is live".

## Behaviour

- Previous and next buttons, and two dots. Each control has an accessible name.
- The visible slide is the only one in the tab order. The region is labelled as a carousel.
- It advances on its own about every 6 seconds. It pauses while the pointer is over it,
  while focus is inside it, and while `prefers-reduced-motion` is set. Reduced motion
  still allows the buttons and the dots.
- Phone and desk both get the carousel. Light and dark use the tokens already on the page.

## Design

Update the landing frames in `design/gameon.pen` through the Pencil tools so the hero shows
the carousel, including the Ocho slide. Do not edit `design/web.pen` or `design/skt.pen`.
Say that the file is not on disk until the owner presses ⌘S.

## Gate

From `web/`: `npx vp check` and `npx vp test`. Node is at
`/tmp/node-v22.23.3-darwin-arm64/bin` if `node` is not on `PATH`. Do not install Node.
Add a test that both slides can be shown and that each Play link goes to the right place.

## Git

Commit only `web/` and the return handover. Do not commit `design/gameon.pen` unless it is
already saved and the diff is only this hero. Do not push. Do not create a branch.
Prefix `ADD:`. No AI attribution. Author Niklas Vorberg
<services@vorberg-webmail.de> if git would invent a hostname email.

## Report back

Write `docs/handover/168-claude-to-grok-landing-carousel.md` and print it in one fenced
code block. Quote the gate counts.
