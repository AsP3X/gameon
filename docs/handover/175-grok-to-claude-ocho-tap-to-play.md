# 175 · Grok → Claude · Tap a card again to play, tap the pile to draw

You are Claude, the callee, working on Skull King Tavern
(`/Users/niklas/Documents/development/gameon`), branch `feature/game-ocho`. Do this work
yourself. Do not run `claude` or `grok`. Do not edit `server/`.

Read `web/src/tableview/actions.ts` (`pick`, the second tap) and the hand button in
`web/src/tableview/views.ts` (`data-act="pick"`, "tap again to play"). Then
`web/src/ocho/Ocho.tsx` (`play`, the `actions` buttons, `Centre`, the hand) and the play
tests in `web/src/ocho/Ocho.test.tsx`. Open `design/ocho.pen` in Pen and edit the table
frames only through the Pencil tools. Do not commit a `.pen` file. The file on disk still
has the older waiting list ("Waiting for a player"); do not revert frames that are only in
the Pen app.

## What is wrong

Ocho plays through buttons: Play, Draw, Draw one, Play it, Take. Skull King does not. A
legal card is tapped to lift it, and tapped again to play it. A new card comes from the
pile, not from a button.

## Your task

Remove those buttons. The status line stays, and it says what the next tap will do.

1. **A card in the hand.** On your turn, the first tap on a legal card lifts it
   (`aria-pressed`, the lift it already has). The status says to tap it again. The second
   tap on that same card plays it: `ocho.play` with the card, or, for a wild, grows the
   real card so the wheel can name the colour. That growth is the confirm. A tap on a
   different legal card moves the lift. A tap on a card you cannot play does not lift it.
   Tapping the lifted card's neighbour is not a confirm.

2. **The draw pile.** It is the way to take a card. When `must` is `playOrDraw` and the
   hand has no legal card, the pile is a button named `Draw one` and a tap sends
   `ocho.draw`. When `must` is `answerStack`, the pile is a button named
   `Take {n}` and a tap sends `ocho.draw`. When a legal card can be played, the pile is
   not a button. There is no Draw button and no Take button beside the hand.

3. **The card just drawn.** It starts lifted. Tapping it plays it, the same confirm as a
   second tap. One control remains for declining it, named `Keep`, sending `ocho.keep`.
   That is the only button under the hand. `End turn` and `Play it` go away.

4. **Tests.** The ones that press Play, Draw, Draw one, Play it, or Take now tap the card
   twice, or tap the pile. A wild still grows on the confirming tap, and the colour is
   still chosen on the wheel.

5. **Pen.** On the table frames, the hand has no Play or Draw button. A chosen card is
   lifted, and the draw pile reads as the control when the hand cannot play. Phone and
   desk, light and dark. Leave the waiting list and sit-down as they are in the app.

## Done when

`vp check` is clean, `vp test` passes, and `vp build` passes. If `node` is not on `PATH`,
prepend `/tmp/node-v22.23.3-darwin-arm64/bin`. Commit only `web/` on `feature/game-ocho`,
prefix `ADD:`, author `Niklas Vorberg <services@vorberg-webmail.de>` if git would use a
hostname address. No AI attribution. Do not push. Do not create a branch.

## Report back

The CLI result is the report. No return handover. Include the commit, the test count, and
whether ⌘S is still required.
