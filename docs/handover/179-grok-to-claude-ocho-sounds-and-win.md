# 179 · Grok → Claude · Ocho card sounds and a win screen

You are Claude, the callee, working on Skull King Tavern
(`C:\Users\asp3x\Documents\development\gameon`), branch `dev`, commit `a0c74ef`.
Do this work yourself. Do not run `claude` or `grok`.

Read these first: `web/src/ocho/Ocho.tsx` (`play`, `name`, `Table`, `Score`),
`web/src/ocho/motion.ts` (`changes`, `acceptPlayed`), `web/src/ocho/Ocho.test.tsx`
(the score and match-won tests), `web/src/sound/sound.ts` (`Sound.play`, the
recipes `cardPlay`, `deal`, `yourTurn`, `whoosh`, `roundGood`, `roundBad`,
`fanfare`, `tap`, `nope`), `web/src/styles/ocho.css` (`.oc-score` and the
`min-width: 720px` table block), `docs/agent-rules/design-sync.md`,
`docs/agent-rules/web-quality.md`, `docs/agent-rules/git.md`, and
`docs/agent-rules/no-ai-attribution.md`.

## Plan

Ocho never calls `Sound.play`. A card leaving the hand is silent. The match ending
uses the same narrow score list as the pause between hands: a heading, a gold
Winner pill, and Back to games, capped at 640px.

Do both of the following. The between-hands score sheet stays a score sheet. The
match ending becomes its own screen. Sounds use the mixer that already exists.
No new sound files, no new recipes, and no Skull King-only sounds (`kraken`,
`whale`, `yoho`, `coins`, `gong`, `harp`, `clash`).

### Sounds

`Sound.play` already follows mute and volume. Call it. Do not add a settings sheet.

Play each of these once for the event, never again because the same view rendered
twice:

1. A card is played onto the discard. `Sound.play('cardPlay', seat)`. Your own
   card plays when `setPending` runs in `play` and in `name`, because the card is
   already the discard. When the server view arrives with that same top,
   `acceptPlayed` runs and `changes` must not play `cardPlay` again for that card
   id. Another seat plays when `changes` reports `played`. A rejected play
   (`send` not ok, pending cleared) plays `nope` once. Naming a colour on the
   opening card is not a new card on the discard: no `cardPlay`.
2. Cards are dealt at the start of a hand (`changes.deal`). `Sound.play('deal', n)`
   with `n` the size of your hand. No `cardPlay` on top of that.
3. You draw one card, or one card is dealt to you outside a new hand.
   `Sound.play('cardPlay', view.you)` once. Several cards arriving together that
   are not a new hand (a penalty draw) play `deal` once with that count, not one
   sound per card. The same for cards added to another seat: one `cardPlay` when
   the count grows by one, `deal` when it grows by more.
4. The direction flips (`changes.turned`). `Sound.play('whoosh')` once.
5. It becomes your turn to play or draw, and it was not already. `Sound.play('yourTurn')`
   once. Staying on that turn does not play it again.
6. Next hand, Back to games, and a tap that draws from the pile play `tap` once.
   Lifting a card in the hand does not.
7. The between-hands sheet appears for a hand. If you went out, `roundGood`. If
   someone else went out, `roundBad`. Once per hand number.
8. The win screen appears. If you are one of the winners, `fanfare`. If there is a
   winner and you are not, `roundBad`. If there is no winner, no sound. Once per
   match, not on a re-render.

### Win screen

`view.phase === 'over'` is no longer the score list with a different heading.
`view.phase === 'between'` stays the score list it is now, including its copy.

The win screen:

- Phone: one column, no horizontal scroll at 360px. From 720px it fills the window
  the way `.oc-table-page` does, with the same side inset. It is not a 640px
  column in a blank page.
- The heading stays the sentence `Score` already builds: "You win the match",
  "Ben wins the match", "You and Ana win the match", or "The match is over" when
  there is no winner. The document title stays `GameOn · Ocho · Match won`.
- Under the heading, one line: who went out and the points of that hand, when
  `handWinner` is set, and the pill "First to 500" when `target` is set. Same
  words the score sheet uses.
- The scores are the server's `view.scores`, highest first, the same order as now.
  Each row is the initial, the name, the place, and the total. Winners carry the
  pill "Winner". A team win marks both partners. You are in the list either way.
- One button, "Back to games". It still sends `ocho.leave`, forgets the table, and
  goes to `/games`.
- The winner is the subject of the page: the heading is large, and the winner's
  row is the one the eye hits first. A loss still names the winner. Do not invent
  a trophy, a new illustration, or new copy.
- Tokens from `web/src/styles/tokens.css` only. No new hex. Targets at least 44px.
  Focus stays visible. Motion respects `prefers-reduced-motion`. Sounds still play
  when motion is reduced.

## Your task

1. Implement the sounds and the win screen as the plan says. Prefer a small
   helper next to the table for "play this once", tested without a real audio
   graph. `web/src/ocho/Ocho.test.tsx` spies on `Sound.play`.
2. Update the match-won test for the new screen. Keep the heading "Ben wins the
   match", the Winner pill, and Back to games leaving the seat. Do not delete a
   test to make the gate pass. Add the tests that lock the plan: one play sounds
   once, the server view of that same card does not sound again, a deal sounds
   `deal`, the win screen sounds `fanfare` or `roundBad` once.
3. Draw the win screen in `design/ocho.pen` through the Pencil tools only. Pen is
   `C:\Program Files\Pencil\Pen.exe`. One phone frame and one 1440 frame, light
   and dark where the file already has both. A win for you, with the scores and
   Back to games. Leave the between-hands score frames as they are. If Pencil is
   not connected, build the screen anyway and say the design file was not updated.
   Do not write the `.pen` file by hand.

## Contracts

You may change `web/src/ocho/`, `web/src/styles/ocho.css`, and `design/ocho.pen`
through Pencil. You may not change `server/`, `web/src/sound/sound.ts`,
`web/src/sound/samples.ts`, the recorded takes, `web/src/protocol/generated/`, or
the between-hands copy. The server remains the authority: the screen shows
`matchWinner`, `handWinner`, and `scores` as they arrived.

## Done when

`vp check`, `vp test`, and `vp build` pass, run from `web/`. This checkout has
`core.autocrlf=true`. A full `vp check` may already fail on CRLF in files you did
not touch. Do not reformat the tree to clear that. If that is the only failure,
say so, and show `vp check --no-fmt` plus a format check of the files you changed.
The work is committed on `dev`. The commit message starts with `TASK:`. No
`Co-Authored-By` trailer. Do not push. Do not create a branch or a worktree.
Stage only this task's paths. If you commit a `.pen` file, its diff is only this
win screen.

## Report back

The CLI result is the report. No return handover. List the files, the commit, and
what the web gate printed. Name each sound you hooked and the screen you drew.
Say whether the owner still has to save in Pen.
