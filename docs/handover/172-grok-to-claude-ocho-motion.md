# 172 · Grok → Claude · Ocho motion and the table around it

You are Claude, the callee, working on Skull King Tavern
(`/Users/niklas/Documents/development/gameon`), branch `feature/game-ocho`. Do this work
yourself. Do not run `claude` or `grok`. Do not edit `server/`, `docs/ocho-protocol.md`, or
`docs/agent-rules/`.

Read `docs/agent-rules/web-quality.md` and `docs/agent-rules/design-sync.md`. Then
`web/src/ocho/Ocho.tsx` (`Table`, `Centre`, `Seat`, `ColorSheet`), `web/src/ocho/cards.tsx`
(`Wheel`, `CardFace`), `web/src/styles/ocho.css`, and `web/src/ocho/Ocho.test.tsx`. The
frames are in `design/ocho.pen`. Open that file in Pen (`open -a /Applications/Pen.app
design/ocho.pen`) and edit it only through the Pencil tools.

## State

Ocho's table is live. A play is a click, then a button. Naming a colour opens a dialog,
`ColorSheet` ("Name a color"), over a scrim. The draw pile is one card back. The hand is a
flat overlapping row with a 10 px hover lift. `prefers-reduced-motion` only turns that lift
off. There is no play flight, no deal, and no shuffle.

The wire does not change. The page still sends `ocho.play`, `ocho.draw`, `ocho.keep`,
`ocho.color`, and `ocho.next`. Motion is derived by remembering the previous `ocho.view`
and comparing it with the next one. Do not ask the server for animation data.

## Your task

Design the key states in `design/ocho.pen`, then build them. Phone and desk, light and dark.
Tokens from `web/src/styles/tokens.css` only. No new hex values. No new dependency. Targets
stay at least 44 px, focus stays visible, contrast stays at least 4.5:1, and
`prefers-reduced-motion: reduce` plays no travel: state changes are immediate.

### 1. Name the colour on the card

Remove `ColorSheet`. Ocho Wild, Wild Draw 4, Shield, and X-Ray already draw a four-colour
wheel (`.oc-wheel`: red, blue, green, yellow, black centre). The opening wild uses the same
control.

- When the player chooses one of those cards, or when `must` is `chooseColor`, that card
  grows large in the middle of the table. The felt dims behind it. It is not a dialog and
  not a sheet.
- The wheel fills the face. Each quadrant is a button named Red, Blue, Green, or Yellow.
  Clicking that quadrant sends the colour: `ocho.color` for the opening card, or
  `ocho.play` with `color` for a wild from the hand. The centre is not a colour.
- Escape, or a Back control on the card, shrinks it and sends nothing. For a wild that has
  not been sent yet, the card returns to the hand.
- The status line still says which colour is being named, for the screen reader.
- Reduced motion: the card is large at once, and the quadrants still work.

Draw this large card in Pen, with the four quadrants visible. Update the test that expects
the dialog heading "Name a color" so it presses a quadrant instead.

### 2. Playing a card

A card moves from where it was to the discard, then the new view is the resting state.

- Yours: from its place in the hand to the discard. The other cards close up.
- Someone else's: from that seat to the discard. You do not know their card until it is the
  new `top`, so the flight can start as a back and become the face as it lands.
- Skip, Reverse, Draw, Shield, Dead Red, and Boo Blue use the same flight. The direction
  arrow turns when `direction` changes. The open stack total (`+N to draw`) updates with a
  short emphasis, not a new panel.
- A second view that arrives mid-flight replaces the flight. The control is never waiting
  on the animation. `busy` still covers the request in flight, as it does now.

### 3. Receiving cards

- A card you draw leaves the draw pile and joins your hand. If `must` is `playDrawnOrKeep`,
  that card settles raised, ready to play or keep.
- Cards an opponent draws leave the pile and land on that seat as backs. The count ticks
  with them. A stack taken is several backs, not one.
- Dead Red and Boo Blue are the same move: backs from the pile to each seat whose count grew.

### 4. Shuffle and deal, sized to the pile

The draw pile is a stack of backs. Its thickness follows `drawCount`: a short pile is a few
layers, a tall pile is more. Two players and eight players must not look like the same stack.
Eight players are dealt more cards (8 each, up to 8 seats), so the deal travels to every
occupied seat.

When a hand starts (`handNo` changes, or the table first appears in `turn` or
`chooseColor`), play a shuffle of that stack, then deal: 8 backs to each other seat, 8 cards
into your hand (face down, then the faces you were dealt), and the opening card onto the
discard. If the opening card is a wild, the colour control in section 1 follows the deal.
The shuffle runs once per hand, not after every draw. Reduced motion shows the dealt table
at once.

### 5. The rest of the table

Improve the parts around the play, in the same Ocho language. Do not restyle GameOn chrome
or Skull King.

- The hand is a shallow fan. A legal card lifts. A card that cannot be played stays dimmed
  the way `.oc-dim` already does, so the overlap does not punch a hole.
- The seat whose turn it is is obvious without a new colour.
- X-Ray cards and the partner's hand stay on the seats. They settle; they do not pop in a
  second list if the seat already shows them.
- The action line and the Play / Draw / Keep / Take buttons sit with the hand, and they
  press in. The top bar, the score between hands, and the match-won list come in calmly.
  Sit-down and the waiting room only get a light press on the choices they already have.
- How to play can let a sample card tilt on hover. It does not become a second table.

## Contracts

Frozen: message names, `easy` / `normal` / `hard`, and every field of `ocho.view`. You may
change `web/src/ocho/`, `web/src/styles/ocho.css`, and `design/ocho.pen`. You may not change
the server. If a motion seems to need a new server field, stop that part and say so in the
result. Do not add the field.

## Git

Branch `feature/game-ocho`. Commit only your paths, after `vp check`, `vp test`, and
`vp build` pass. Prefix `ADD:`. Author `Niklas Vorberg <services@vorberg-webmail.de>` if git
would use a hostname address. No AI attribution. Do not push. Do not create a branch or a
worktree.

If `node` is not on `PATH`, prepend `/tmp/node-v22.23.3-darwin-arm64/bin`.

The `.pen` file is not on disk until the owner presses ⌘S. Do not commit it unless you can
see that this change, and only this change, is in the saved file. Say in the result whether
⌘S is still required.

## Done when

- The colour is chosen on the enlarged card's wheel, for a wild and for the opening card.
  The old dialog is gone.
- A play, a draw, a stack taken, and a new hand each move. The pile's thickness follows
  `drawCount`. Eight seats are dealt.
- Reduced motion does not travel.
- `vp check` is clean, `vp test` passes, `vp build` passes.
- The new states are in `design/ocho.pen` through Pencil.

## Report back

The CLI result is the report. Do not write a return handover unless the server has a task.
Include the commit, the commands and counts, what you drew in Pen, and whether the owner
still has to press ⌘S.
