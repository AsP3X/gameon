# 138 · Claude → Grok · the scorekeeper's bonus figure is readable in the light theme

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, then this file. You do not edit `web/` or a `.pen` file.

## State

- Branch `dev`. `origin/dev` is at `258f093`, so the web change is pushed (not by me); this file's
  own commits are not. The web change is one line of `web/src/styles/tavern.css`:
  `.disclose b` is now `color: var(--fg)`, it was `var(--gold-d)`. It is the `+30` on the
  "Bonus cards" button of the scorekeeper's tricks screen (`web/src/tableview/tracker.ts`).
- **The line is in commit `479ee5d`, not in a commit of its own.** I had it staged for the gate
  when another Claude session committed its design files without naming paths, so that commit
  (`BUGFIX: Draw the text on the pale gold in $fg in design/skt.pen, design/web.pen and
  design/gameon.pen.`) carries it and its message does not name it. Handover 137 says the same.
  Nothing was amended or rebased; giving the line its own `BUGFIX:` commit would rewrite pushed
  history, which only the owner can order.
- Protocol stays 1. No message, field or error code changed. Nothing under
  `web/src/protocol/generated/`, `fixtures/` or `server/` was touched.
- Why `--fg`: the figure was 2.03:1 on the button's `--soft` in the light theme, against the
  4.5:1 of `docs/agent-rules/web-quality.md`. No token changed and no hex value was added. Of the
  existing tokens, five are 4.5:1 on `--soft` in both themes (light / dark):
  `--fg` 10.30 / 13.67, `--muted` 4.97 / 5.63, `--green-ink` 5.65 / 8.07, `--red-ink` 5.58 / 5.77,
  `--blue-ink` 5.48 / 7.16. `--muted` is the colour of the button's own label, so the figure would
  not stand out. Green and red are the player card's colours for a bid made and a bid missed
  (`.pcard.hit`, `.pcard.miss`), and the bonus only counts if the bid is made, so neither fits a
  figure that is not scored yet; blue marks "you".
  No gold passes in both: `--gold-d` 2.03 / 6.78, `--gold` 1.45 / 9.50, `--gold-ink` 10.51 / 1.31.
  It is also what `be0ab97` did for the text on `--gold-bg`.
- Measured in headless Chrome, computed colours:
  - from the built CSS of the gated tree: the figure is `rgb(60, 60, 60)` on
    `rgb(247, 247, 247)`, 10.30:1, in the light theme and `rgb(241, 247, 251)` on
    `rgb(27, 42, 49)`, 13.67:1, in the dark one. The label next to it (`--muted`) is 4.97:1 and
    5.63:1.
  - in the running app at 360 px (`/skull-king/score`, start, bid, lock, open the bonus cards, one
    Pirate taken by the Skull King): the button reads "Bonus cards +30" with the same colours in
    both themes, the figure at weight 900, no horizontal scroll, no console error.
- The gate ran on a clean export of the tree with only this line on top of `2135f45`
  (`ad227a2`); the web tree of `479ee5d` is that tree: `vp check`: 154 files formatted, no
  warnings, lint or type errors in 142 files. `vp test`: 51 files, 726 passed. `vp build`: built.
- Not run: `npm run e2e`. One colour declaration changed.

## Designs

Nothing to change, and no save is needed for this package. `design/skt.pen` and `design/web.pen`
(as committed in `479ee5d`, read through the Pencil tools in scratchpad copies) draw the
"Bonus cards" button eight times each, four in `Scorekeeper · tricks` and four in
`Scorekeeper · tricks · dark`: the label in `$muted` on `$soft` and the chevron, without a figure.
The state with a bonus entered is not drawn. Neither file has a text node in `$gold-d` any more.

## Reported to the owner, not changed

Two crown icons are `--gold-d` on the page: 2.18:1 on `--bg` in the light theme, 7.72:1 in the
dark one (2.03 / 6.78 where the row is on `--soft`).

- `.go-crown` in `web/src/styles/gameon.css`: the crown over first place on the landing page's
  podium (`web/src/gameon/Landing.tsx`).
- `ol.on-lines .go-icon` in `web/src/styles/online.css`: the crown on the top tier in the ranked
  page's tier list (`web/src/online/Ranked.tsx`).

They are icons, not text, so the 4.5:1 rule for text does not cover them, and both say again what
the text next to them says ("Place 1", the tier's name on the first line). The 3:1 that WCAG asks
of a graphic that carries meaning would fail in the light theme. No existing gold token is 3:1
in both themes (`--gold` and `--gold-d` pass only in the dark one, `--gold-ink` only in the light
one), so a gold crown that passes in both needs a new value, which is the owner's decision.

## Your task

Nothing to build and nothing to answer. This is for your information only.

## Contracts

- Frozen and untouched: `docs/protocol.md`, `skt-protocol`, `web/src/protocol/generated/`,
  `fixtures/`.

## Done when

You have read this file.

## Report back

Nothing, unless server work of yours puts a figure or a text in gold in front of a player. Then
describe the screen, the state and the copy in a handover for Claude in `docs/handover/` (the next
free number), printed in one fenced code block.
