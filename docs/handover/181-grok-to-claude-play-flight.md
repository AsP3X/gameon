# 181 · Grok → Claude · A played Ocho card flies, and stays until it can be read

You are Claude, the callee, working on Skull King Tavern
(`C:\Users\asp3x\Documents\development\gameon`), branch `dev`. Do this work yourself.
Do not run `claude` or `grok`.

Read `web/src/ocho/Ocho.tsx` (`play`, `name`, the layout effect that calls
`acceptPlayed` and `motion.view`), `web/src/ocho/motion.ts` (`view`, `stop`,
`fly`, `hold`, `acceptPlayed`, `FLIGHT`), and `web/src/styles/ocho.css`
(`.oc-hand li.oc-away`). The server pause is already changed. Do not edit
`server/`.

## Why the card does not move

Playing a card calls `setPending`. That paints the card on the discard at once
and hides it in the hand (`.oc-away`). Nothing flies. When the server view
arrives, the layout effect calls `acceptPlayed`, which copies that card onto
`motion.last.top`, and then `view()`. `view()` starts with `stop()`, which
cancels whatever is in flight, and `changes()` then sees the same discard, so
`c.played` is null. The box stored in `launched` for a wild is never used.
The card pops. A bot's view, 1500ms later, replaces it. `BOT_PLAY_PAUSE` in
`server/crates/ocho-server/src/room.rs` is now 1500ms: the 420ms flight plus
about a second to read the card. Do not change that number.

## Your task

1. When the player plays a card, plain or a wild with its colour, read the hand
   card's box with `handBox` before the card is hidden. After the pending card
   is on the discard, fly a ghost from that box to the discard and hold the
   discard transparent until the ghost lands. `FLIGHT` stays 420ms. Use the
   `fly` and `hold` that are already there.
2. When the server view is that same card, do not cancel that flight and do not
   fly the card a second time. `acceptPlayed` stays the way the second flight
   is avoided. `view()` must not `stop()` the flight it is confirming. The
   other cards in the hand may still close up.
3. A later view, the bot's card, still flies from that seat, as it does now.
   If it arrives while your flight has not landed, do not `stop()` your flight.
   Start the bot's flight when yours has landed. Do not add a second wait on
   top of the server's 1500ms. The sit is the server's. The client only
   protects a flight that has not landed.
4. Reduced motion, and a browser without `animate`, still show the card on the
   discard with no flight. A refused play still puts the card back and plays
   `nope`. Sounds stay as they are: `cardPlay` once when you play, not again
   when the view arrives.
5. Cover it with a test. The existing tests that the discard shows the card
   and the hand card is `.oc-away` must still pass. Add one that a play asks
   the motion to fly from the hand box, and that the confirming view does not
   fly that card again. A fake element is enough. Do not require a real
   animation timeline.

## Contracts

You may change `web/src/ocho/` and `web/src/styles/ocho.css`. You may not
change `server/`, the mixer, or the 1500ms pause. `server/crates/ocho-server/src/room.rs`
may be dirty with that pause. Leave it byte for byte. Do not stage it.

## Done when

`vp test` passes from `web/`. If `vp check` fails only on CRLF in files you
did not touch, say so and show `vp check --no-fmt` plus a format check of the
files you changed. Commit on `dev` with a message that starts with `FIX:`.
No `Co-Authored-By`. Do not push. Do not create a branch. Stage only your
files.

## Report back

The CLI result is the report. No return handover. Name the commit, what flies,
and what `vp test` printed.
