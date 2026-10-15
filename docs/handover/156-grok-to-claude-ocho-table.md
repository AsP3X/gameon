# 156 · Grok → Claude · draw the Ocho table

You are Claude, the callee, working on Skull King Tavern
(`/Users/niklas/Documents/development/gameon`). Do this work yourself. Do not run `claude` or
`grok`. Do not ask the owner a question. The readings below are locked.

Read `AGENTS.md`, `docs/agent-rules/design-sync.md`, `docs/agent-rules/git.md`, and
`docs/drafts/ocho/rules.md` first. Then this file. There is no server task and no client task.

## State

- Branch `dev`, not pushed. Start from the commit that adds this file. `git fetch origin` and
  `git merge --ff-only origin/dev` before you edit. If that fails, stop.
- `docs/drafts/ocho/rules.md` is the design source. Do not add a rule it does not contain.
- The official maximum is 8 players. Every play state is an eight-seat table.

## Your task

Draw `design/ocho.pen` through the Pencil tools only. Create the file if it does not exist.
Do not edit `design/web.pen`, `design/skt.pen`, `design/gameon.pen`, or anything under `web/`
or `server/`. Do not generate images. Do not use ElevenLabs. Do not run
`design/card-art/tools/`.

Use the colours, type, radius, and buttons of `web/src/styles/tokens.css`. The table is Ocho's.
No pirate mascot, no bid slider, no Skull King faces.

Build components, then build the screens from those components.

### Components

- A seat: avatar, name, card count, whose turn. Compact enough that eight of them fit.
- Your hand, fanned. An opponent's hand: backs and a count.
- Draw pile and discard.
- The match: current color, and the number or symbol.
- Direction of play.
- The open draw total, when a stack is running.
- The action bar.
- A color choice: red, blue, green, yellow.
- A sheet.
- Card layouts, no illustrations. One back. One number face (rank and a color). Skip, Reverse,
  and Draw 2, each with a color. Ocho Wild, Wild Draw 4, Shield, X-Ray, Dead Red, Boo Blue.
  Four color variants of the number face and of each action, because color is how a card matches.
  Not one frame per copy in the deck.

### Frames

Eight seats unless the name says otherwise. Phone width 390 and desk width 1440. Light and dark
for each.

1. **Opening.** First discard is a Draw 2. Its effect did not fire. Play is clockwise. Each
   player has 8 cards.
2. **Your turn, a match.** Discard is a yellow 4. Your hand has a yellow 7, which is legal.
3. **Your turn, nothing plays.** The action is draw one.
4. **Just drew.** The drawn card is legal. The actions are play it, or end the turn.
5. **Name a color.** An Ocho Wild was played. Four color choices.
6. **Stack of 6.** The next player may play Draw 2, Wild Draw 4, or Shield, or take 6 cards.
7. **Shield.** The 6 was sent back to the player who played the last draw card.
8. **X-Ray.** Only you see one card from each of the other seven hands. That look is a sheet.
9. **Dead Red.** You and one other player have no red left. Each of you draws 2.
10. **Boo Blue.** Two players are tied for fewest cards. Both draw 2.
11. **Reverse.** The direction arrow has flipped.
12. **Two players.** Reverse is labeled Skip. This frame is two seats, not eight.
13. **Teams.** Four seats. You can see your partner's cards. Your opponents cannot.
14. **Hand over.** You played your last card. The other hands are face up, with the point sum:
    numbers at face value, actions 20, wilds and specials 50.
15. **Reshuffle.** The discard has become the draw pile. The top card stays face up.

If a frame cannot be drawn as specified, leave it out and name it in the return handover. Do
not invent a substitute rule.

When the drawing is done, say plainly that `design/ocho.pen` is not on disk until the owner
presses ⌘S in Pen.

## Git

Commit only `design/ocho.pen` if it is on disk, and the return handover. If the pen file is
still only in Pen, commit the handover alone and say so. Do not push. Do not create a branch.
Prefix `DOCS:`. No AI attribution. Author Niklas Vorberg <services@vorberg-webmail.de> if git
would invent a hostname email.

## Done when

The components and the fifteen frames exist in Pen. No code was written. The summary lists the
frame names and says the pictures on the cards were not drawn.

## Report back

Write `docs/handover/157-claude-to-grok-ocho-table.md` and print the same text in one fenced
code block. No return implementation task. The owner reviews the drawing next.
