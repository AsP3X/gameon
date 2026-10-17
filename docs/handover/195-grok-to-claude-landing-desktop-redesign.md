# 195 · Grok → Claude · Redesign the two desktop landing frames

> Status: closed as a prompt. The desktop proposal is already exported to
> `design/landing-desktop-proposal.png` and `design/landing-desktop-dark.png`. The owner
> has not accepted it. Do not run this file again unless the owner names it. Do not run `194`.

You are Claude, the callee, working on Skull King Tavern
(`C:\Users\asp3x\Documents\development\gameon`), branch `dev`. Do this work yourself.
Do not run `claude` or `grok`.

The owner wants the desktop landing redesigned from scratch, in the Duolingo
design language, taking the structure of https://platoapp.com/en/games.
Draw it on the two frames they are looking at. Do not make a new frame.

Read `web/src/styles/tokens.css` and `docs/agent-rules/design-sync.md`. Draw
through the Pencil tools only. Pen is `C:\Program Files\Pencil\Pen.exe`.
Open `design/gameon.pen`. Do not write the `.pen` file by hand. Do not edit
`web/`, `server/`, `tokens.css`, or `PRODUCT.md`. Do not commit.

## Frames you may edit

Only these two, in place. Keep each id, name, x, y, width, and theme mode.
Replace their children. The page may grow taller. It may not get narrower.

- `dqAXj`, name `Landing · desktop`, x 0, y 1200, width 1440, theme light.
- `EKRZ1`, name `Landing · desktop · dark`, x 1540, y 1200, width 1440, theme dark.

Before you change either one, read it. If `dqAXj` is not width 1440, or is
not named `Landing · desktop`, the open document is a stale buffer. Do not
save it. Reopen `design/gameon.pen` from disk, then start.

Leave every other frame alone. In particular leave the phone frames:
`z8V6wL` (`Landing · phone`, width 390) and `h6hTpa` (`Landing · phone · dark`,
width 390). Do not delete them. Do not resize them. Do not copy them onto
the desktop frames.

## How to draw

Use the file's variables (`$bg`, `$fg`, `$muted`, `$faint`, `$line`, `$green`,
`$green-d`, `$green-bg`, `$blue`, `$blue-d`, `$blue-bg`, `$blue-ink`, `$gold`,
`$gold-d`, `$gold-bg`, `$gold-ink`, `$orange`, `$red`, `$purple`, `$white`,
`$f-ui`, `$f-logo`). No new hex. No second typeface. Nunito for text. Pirata
One only inside the existing Skull King wordmark. Radius 16. A button or card
has a hard 4px bottom lip, not a soft shadow. No glass, no gradient, no
small-caps letter-spacing, no emoji, no Duolingo owl.

The dark frame uses the same layout and the same variables. Its theme mode
already switches the colours. Do not paste a light colour onto it, and do
not rebuild it as a phone column.

This is a desktop catalog, 1440 wide, side inset 48. It is not the phone
page made wider. Live games sit two across. Announced games sit three
across. The three ways sit three across. Ranked is a split row. The close
is a split row.

Reuse the logo ref `SSeWf`. Reuse
`design/card-art/fronts/skull-king.png`, `pirate.png`, and `mermaid.png`.

## The page, top to bottom

1. **Nav.** Height 72, fill `$bg`, bottom stroke `$line` 2px, padding 0 48,
   space-between, centered. Left: the logo, then three links in `$fg`,
   Nunito 800 16px, gap 28: "Games", "Ways to play", "Ladder". Right: a
   secondary button "Sign in", height 44, fill `$bg`, stroke `$line` 2px,
   4px lip `$line`, label `$fg`, Nunito 800 15px. No Play button in the nav.

2. **Opening.** Padding 36px 48px 0. Left aligned. Heading "Pick a game."
   Nunito 800, 56px, line height 64, `$fg`. Under it, one row, gap 24, of
   three facts, Nunito 700 16px `$muted`, each with a 16px `$green` check:
   "Free to play", "No download", "No account needed".

3. **Shelves.** Padding 20px 48px 0. One row, gap 8. Height 44, radius 16,
   Nunito 800 15px. "All" is selected: fill `$green`, label `$white`, 4px
   lip `$green-d`. "Cards", "Board", "Dice" are unselected: fill `$bg`,
   stroke `$line` 2px, lip `$line`, label `$fg`.

4. **Play now.** Padding 36px 48px 0. Heading "Play now", Nunito 800 32px
   `$fg`. Then one row, gap 24, of two cards. Each card fills half of the
   row. Card: fill `$bg`, radius 16, stroke `$line` 2px, 4px lip `$line`,
   padding 16, vertical gap 12.
   - Art well height 240, radius 12, clipped. Skull King well fill
     `$gold-bg`, with the three card images fanned, Skull King largest and
     in front. Ocho has no raster: well fill `$blue-bg`, four rounded rects
     72 by 108, radius 8, fanned, fills `$red`, `$gold`, `$green`, `$blue`,
     each with a `$white` "8".
   - Name, Nunito 800 24px `$fg`. Skull King uses the existing wordmark if
     the file has it. Ocho is the word "Ocho".
   - Sentence, Nunito 600 16px, line 22, `$muted`. Skull King: "The pirate
     trick-taking game". Ocho: "Match the colour or the number".
   - Button, full width of the card, height 56, radius 16, fill `$green`,
     4px lip `$green-d`, label `$white` Nunito 800 16px. "Play Skull King"
     and "Play Ocho".

5. **More games on the way.** Padding 36px 48px 0. Heading "More games on
   the way", same heading style. One line under it, Nunito 600 16px
   `$muted`: "These are in the works." Then six cards, three per row, gap
   16. Same card shell, padding 16, laid out as a row inside the card: a
   56px key, radius 16, then the text. A gold pill "Soon" (fill `$gold`,
   label `$gold-ink`, Nunito 800 13px, height 28, radius 16) at the right
   of the name, except on the last card.
   - Hearts, key `$red`. "Dodge the points, or take every one of them and
     shoot the moon." Then "4 players", `$muted` 14px.
   - Chess, key `$gold`, glyph `$gold-ink`. "From the opening to the
     endgame, against a bot or a friend." Then "2 players".
   - Ludo, key `$orange`. "Roll, race your four pieces home, and send the
     others back to the start." Then "2–4 players".
   - Four in a Row, key `$blue`. "Drop your discs and line up four before
     the other side does." Then "2 players".
   - Five Dice, key `$purple`. "Roll up to three times, fill your scorecard,
     and hope for five of a kind." Then "1–6 players".
   - Suggest, key `$green` with a `$white` plus. Name "What should we add
     next?" Sentence "Tell us the game your table always ends up playing."
     Secondary button "Suggest a game", same style as Sign in, height 44,
     full width of the text column.
   Keys use a simple white glyph, except the gold key. No second mascot.

6. **Three ways to play.** Full-bleed band, fill `$green-bg`, padding 48.
   Heading "Three ways to play". One row, gap 16, of three white lip-cards.
   Each card is a row: a 48px key, then a name (Nunito 800 18px `$fg`) and
   one sentence (`$muted` 16px).
   - `$green` key. "Solo". "Against bots, any time. Works offline."
   - `$gold` key, glyph `$gold-ink`. "One screen". "Pass one phone around
     the table."
   - `$blue` key. "Online". "With friends, at a public table, or ranked."

7. **Ranked.** Full-bleed band, fill `$blue-bg`, padding 48. One row, gap
   48, two columns. Left column, about 520 wide: gold pill "Season" with
   no season name, heading "The ranked season is on", sentence "Climb from
   Deckhand to Skull King.", a blue button full width of that column,
   height 56, fill `$blue`, lip `$blue-d`, label `$white`: "Find a ranked
   game". Under it, `$muted` 14px "Needs a free account." and a text link
   "See the ladder" in `$blue-ink`, Nunito 800 16px. Right column: the seven
   tiers in one horizontal row. A 4px line `$green` runs through seven 36px
   circles. The first six are `$green` with a 4px lip `$green-d`. Skull
   King is `$gold` with a 4px lip `$gold-d`. The name sits under each
   circle, Nunito 800 14px `$fg`, wrapping if needed: Deckhand, Bosun,
   Quartermaster, First Mate, Captain, Pirate Lord, Skull King.

8. **Close.** Full-bleed `$green`, padding 48. One row, space-between,
   centered. Left: heading "Pull up a chair." in `$white`, Nunito 800 40px,
   and under it "Your first hand is one tap away. No download, no account."
   in `$white`, Nunito 600 16px. Right: a button width 320, height 56,
   radius 16, fill `$white`, 4px lip `$green-d`, label `$fg` Nunito 800:
   "Play Skull King".

9. **Footer.** Fill `$bg`, top stroke `$line` 2px, padding 32px 48px. One
   row, space-between, centered. Logo. Then the links in one row, gap 20,
   Nunito 700 14px `$muted`: Sign in, Games, Ladder, How to play, Privacy,
   Imprint, Suggest a game. Then "© 2026 GameOn" in `$faint` 14px.

## Save

Save `design/gameon.pen` from Pen with File, Save, while that document is
focused. Then read `dqAXj` and `EKRZ1` back through the Pencil tools. Both
must still be width 1440, still named as above, and the opening heading on
each must be "Pick a game." The file on disk must change from 8,080,748
bytes, last written 2026-10-17 19:12. If the save does not change the file,
try once more and say so if it still did not.

Export `dqAXj` to `design/landing-desktop-proposal.png` and `EKRZ1` to
`design/landing-desktop-dark.png`.

## Done when

Both frames are the desktop catalog above. Neither frame is 390 wide.
Neither phone frame was edited. The file on disk has a new size or time.

## Report back

The CLI result is the report. No return handover. Quote, for each of
`dqAXj` and `EKRZ1`, the name, the width, the height, and the child names
in order. Give the file's new size and write time, and the two screenshot
paths.
