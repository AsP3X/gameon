# 193 · Grok → Claude · A new mobile landing, for the owner to confirm

> Status: closed as a prompt. The phone proposal is already exported to
> `design/landing-phone-proposal.png`. The owner has not accepted it. Do not run this file
> again unless the owner names it. `194` is withdrawn. `195` is the desktop proposal.

You are Claude, the callee, working on Skull King Tavern
(`C:\Users\asp3x\Documents\development\gameon`), branch `dev`. Do this work yourself.
Do not run `claude` or `grok`.

Read `web/src/styles/tokens.css`, `docs/agent-rules/design-sync.md`, and
`web/src/gameon/catalog.ts` before you draw. Draw through the Pencil tools
only. Pen on this machine is `C:\Program Files\Pencil\Pen.exe`. Open
`design/gameon.pen` in Pen first. Do not write a `.pen` file by hand.

This is a drawing for the owner to accept or reject. Do not edit `web/`,
`server/`, `PRODUCT.md`, or `tokens.css`. Do not commit. Do not delete or
move any existing frame, including `dqAXj` and `EKRZ1`. Add one new frame.

## What this is

The owner rejected the current landing and asked for a new one, from scratch,
in the Duolingo design language, taking the structure of
https://platoapp.com/en/games, mobile only.

The Duolingo language is already the token set. Use only those values. No new
hex. No second typeface. Nunito for everything except the existing GameOn
wordmark and the Skull King wordmark, which stay as they are (Pirata One only
inside the Skull King name). Radius 16. A control has a hard 4px bottom lip in
its darker colour, the same lip the system board already uses. No soft blur,
no glass, no gradient, no small-caps kicker, no emoji.

Light only. One phone frame.

## The frame

Name it `Landing · phone · proposal`. Width 390. Make it as tall as the
content, with 24px of white under the footer and nothing clipped. Place it
120px to the right of the rightmost existing frame, top-aligned with that
frame. Do not overlap anything.

A signed-out visitor. No invented people, no invented season name, no invented
games, no player counts you add beyond the ones written below.

## The page, top to bottom

White page (`#ffffff`). Side inset 16, except the two colour bands and the
green close, which run edge to edge. More space above a heading than below it.
28px above a heading, 8px from the heading to the first thing under it. 12px
between cards.

1. **Bar.** 64px tall, white, 2px bottom border `#e5e5e5`. Left: the GameOn
   logo from `design/brand/gameon/gameon-logo.svg` (mark plus wordmark), about
   28px tall. Right: a secondary button, "Sign in", 44px tall, white fill,
   2px `#e5e5e5` border, 4px `#e5e5e5` lip, label `#3c3c3c`, Nunito 800 15px.
   No "Play" in the bar. The games own the action.

2. **Opening.** Heading "Pick a game." Nunito 800, 32px, line 38, `#3c3c3c`,
   left aligned. Under it, one row of three facts, Nunito 700 14px `#6b6b6b`:
   "Free to play", "No download", "No account needed". Each fact starts with a
   16px green (`#58cc02`) check. No second line of marketing.

3. **Shelves.** One row, gap 8: "All", "Cards", "Board", "Dice". Height 40,
   radius 16, Nunito 800 15px. "All" is selected: fill `#58cc02`, white label,
   4px lip `#58a700`. The other three are white, 2px border `#e5e5e5`, 4px lip
   `#e5e5e5`, label `#3c3c3c`. They are a picture of the control. They do not
   have to filter.

4. **Play now.** Heading "Play now". Then two cards, Skull King then Ocho.
   A card is white, radius 16, 2px border `#e5e5e5`, 4px lip `#e5e5e5`,
   padding 12.
   - Art well, 168px tall, radius 12, inset in the card. Skull King well is
     `#fff5d3`. Stand three real cards in it, fanned, the Skull King largest
     and in front: `design/card-art/fronts/skull-king.png`,
     `design/card-art/fronts/pirate.png`, `design/card-art/fronts/mermaid.png`.
     Ocho well is `#ddf4ff`. Ocho has no raster; draw four card-shaped rounded
     rects, 56 by 84, radius 8, fanned, in `#ff4b4b`, `#ffc800`, `#58cc02`,
     `#1cb0f6`, each with a white "8".
   - Name, Nunito 800 20px `#3c3c3c`. Skull King's name is the existing
     two-word wordmark if the file already has it; otherwise "Skull King" in
     Nunito. Ocho is "Ocho".
   - Sentence, Nunito 600 16px line 22 `#6b6b6b`. Skull King: "The pirate
     trick-taking game". Ocho: "Match the colour or the number".
   - Button, full width of the card's inner width, 52px tall, radius 16, fill
     `#58cc02`, 4px lip `#58a700`, white label Nunito 800 16px. "Play Skull
     King" and "Play Ocho".

5. **More games on the way.** Heading "More games on the way". One line under
   it, Nunito 600 16px `#6b6b6b`: "These are in the works." Then six shorter
   cards, same white shell and lip, padding 12, laid out in a row: a 56px
   rounded key on the left, text on the right. No Play button. A gold pill
   "Soon" (fill `#ffc800`, label `#4b3800`, Nunito 800 13px, radius 16, height
   28) sits at the right of the name row, except on the last card.
   - Hearts, key `#ff4b4b`. "Dodge the points, or take every one of them and
     shoot the moon." Then "4 players" in `#6b6b6b` 14px.
   - Chess, key `#ffc800`, label on the key `#4b3800`. "From the opening to
     the endgame, against a bot or a friend." Then "2 players".
   - Ludo, key `#ff9600`. "Roll, race your four pieces home, and send the
     others back to the start." Then "2–4 players".
   - Four in a Row, key `#1cb0f6`. "Drop your discs and line up four before
     the other side does." Then "2 players".
   - Five Dice, key `#ce82ff`. "Roll up to three times, fill your scorecard,
     and hope for five of a kind." Then "1–6 players".
   - Last card, key `#58cc02` with a white plus. Name "What should we add
     next?" Sentence "Tell us the game your table always ends up playing."
     Under the sentence, a secondary button "Suggest a game", the same
     secondary style as Sign in, 48px tall, full width of the text column.

6. **Three ways to play.** Full-bleed band, fill `#d7ffb8`, padding 24px top
   and bottom, 16px sides. Heading "Three ways to play". Three stacked white
   lip-cards, gap 12, each a row: a 48px key, then a name (Nunito 800 18px)
   and one sentence.
   - Green key. "Solo". "Against bots, any time. Works offline."
   - Gold key. "One screen". "Pass one phone around the table."
   - Blue key. "Online". "With friends, at a public table, or ranked."

7. **Ranked.** Full-bleed band, fill `#ddf4ff`, same padding. A gold pill
   "Season", no season name. Heading "The ranked season is on". Sentence
   "Climb from Deckhand to Skull King." Then the seven tiers as a path: a 4px
   vertical line `#58cc02`, and on it seven 28px circles. The first six are
   `#58cc02` with a 4px lip `#58a700`. The last, Skull King, is `#ffc800` with
   a 4px lip `#e5a400`. Names to the right of the circles, Nunito 800 16px
   `#3c3c3c`, in this order: Deckhand, Bosun, Quartermaster, First Mate,
   Captain, Pirate Lord, Skull King. Then a blue button, full width, 52px,
   radius 16, fill `#1cb0f6`, 4px lip `#1899d6`, white label "Find a ranked
   game". Under it, Nunito 700 14px `#6b6b6b`: "Needs a free account." And a
   text link "See the ladder" in `#0a6a9f`, Nunito 800 16px.

8. **Close.** Full-bleed `#58cc02`, padding 24. Heading "Pull up a chair."
   in white, Nunito 800 28px. Sentence in white, Nunito 600 16px: "Your first
   hand is one tap away. No download, no account." Then a white button, full
   width, 52px, radius 16, 4px lip `#58a700`, label `#3c3c3c` Nunito 800:
   "Play Skull King".

9. **Footer.** White, 2px top border `#e5e5e5`, padding 24px 16px. The GameOn
   logo again. Then the links, wrapping, Nunito 700 14px `#6b6b6b`, gap 8 by
   12: Sign in, Games, Ladder, How to play, Privacy, Imprint, Suggest a game.
   Then "© 2026 GameOn" in `#afafaf`, 14px.

Keys are flat rounded squares, radius 16, with a simple white glyph (a heart,
a crown, a die, a grid, two dice, a bot, a phone, a globe). A gold key uses
`#4b3800` for its glyph so it stays readable. Do not draw a second mascot and
do not draw the Duolingo owl.

## Done when

`design/gameon.pen` contains the new frame and the previous landing frames
are still there, untouched. Save the file from Pen so the bytes on disk
change. If Pen will not save, say so plainly and leave the frame in the
running app.

## Report back

The CLI result is the report. No return handover. Include the new frame's id,
its height, and the names of its top-level children in order. Say whether the
save reached disk. If Pencil can export a screenshot of that frame, write it
to `design/landing-phone-proposal.png` and include that path.
