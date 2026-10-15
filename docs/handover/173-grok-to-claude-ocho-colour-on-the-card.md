# 173 · Grok → Claude · Colour is picked on the real card

You are Claude, the callee, working on Skull King Tavern
(`/Users/niklas/Documents/development/gameon`), branch `feature/game-ocho`. Do this work
yourself. Do not run `claude` or `grok`. Do not edit `server/` or `docs/agent-rules/`.

Read `web/src/ocho/Ocho.tsx` (`Namer`, around the colour card), `web/src/ocho/cards.tsx`
(`Wheel`, `CardFace`), `web/src/styles/ocho.css` (`.oc-namer`, `.oc-wheel`), and the colour
tests in `web/src/ocho/Ocho.test.tsx`. `design/ocho.pen` already has uncommitted edits.
Open it in Pen and change the naming frames through the Pencil tools only. Do not commit
either `.pen` file.

## What is wrong

`Namer` builds a second card. The wheel is a grid of four labelled tiles (the words Red,
Blue, Green, Yellow) plus a Back button on the card. The card in the hand is different: a
black face, corner name, and the conic wheel (`.oc-wheel`) with the 8, +4, shield, or eye
in the black centre.

## Your task

Use that real card.

1. When a wild is played from the hand, or the opening card must be named, grow **that
   card**. Same face as `CardFace`: corner, black ground, the same wheel, the same mark in
   the middle. It may be larger so each colour can be pressed. It is not a new layout.

2. The four colour slices of that wheel are the buttons. They do not carry words on the
   card. Each button's accessible name is still Red, Blue, Green, or Yellow. The black
   centre is not a colour. Pressing a slice plays the card with that colour:
   `ocho.play` with `card` and `color` from the hand, `ocho.color` for the opening card.

3. A click on the dimmed table, outside the card, puts a hand card back in the hand and
   sends nothing. The opening card is not in a hand: the same click shrinks it back onto
   the discard and sends nothing. Remove the Back button from the card. Escape does the
   same as a click outside.

4. Update the tests that press "Back", "Green", and "Blue" as visible button text, and the
   Pen frames that show the labelled naming card (frame 05 and the motion board). The
   enlarged card in Pen is the real wild, wheel and all.

Leave the flights, the shuffle, the fan, and the pile thickness as they are.

## Done when

`vp check` is clean and `vp test` passes. If `node` is not on `PATH`, prepend
`/tmp/node-v22.23.3-darwin-arm64/bin`. Commit only `web/` after the gate, on
`feature/game-ocho`, prefix `FIX:`, author `Niklas Vorberg <services@vorberg-webmail.de>`
if git would use a hostname address. No AI attribution. Do not push. Do not create a branch.

## Report back

The CLI result is the report. No return handover. Include the commit and the test count.
Say that ⌘S is still required before `design/ocho.pen` is on disk.
