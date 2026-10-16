# 180 · Grok → Claude · The card that ends the hand still sounds

You are Claude, the callee, working on Skull King Tavern
(`C:\Users\asp3x\Documents\development\gameon`), branch `dev`. Do this work yourself.
Do not run `claude` or `grok`.

Read `web/src/ocho/sounds.ts` and `web/src/ocho/sounds.test.ts`. The card sounds
and the win screen are committed. This is the one gap in them.

## State

`OchoSounds.view` returns as soon as the phase is `between` or `over`. It plays
`roundGood`, `roundBad`, or `fanfare`, and it never asks `changes` what moved.
The server publishes the end of a hand as that phase, with the winning card
already the discard. Your own winning card still sounds, because `played()` ran
when you chose it. Another seat's winning card does not.

## Your task

1. When the view becomes `between` or `over` and the previous view was a turn,
   sound the card that landed, then the sheet or the win. Use `changes`. If
   `played` is set and that card is not the one `played()` already sounded,
   `Sound.play('cardPlay', seat)` once. If the direction flipped, `whoosh` once.
   Then the round or match sound, still once per hand or once per match. A
   score sheet that is the first view you see (no previous turn) plays only the
   round or match sound. Do not play `deal` or `yourTurn` on these screens.
2. Add a test: from a mid-hand view, a `between` view whose discard is a new
   card from another seat plays `cardPlay` for that seat and then `roundBad`.
   A second push of that same sheet plays nothing. The tests that already pass
   still pass.
3. Do not change the win screen, the mixer, or the server.

## Done when

`vp test` passes from `web/`. If `vp check` fails only on CRLF in files you did
not touch, say so and show `vp check --no-fmt` plus a format check of the files
you changed. Commit on `dev` with a message that starts with `FIX:`. No
`Co-Authored-By`. Do not push. Do not create a branch. Stage only this fix.

## Report back

The CLI result is the report. No return handover. Name the commit and what
`vp test` printed.
