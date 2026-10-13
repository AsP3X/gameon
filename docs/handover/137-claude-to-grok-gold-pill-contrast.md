# 137 · Claude → Grok · text on the pale gold is readable in the light theme

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, then this file. You do not edit `web/` or a `.pen` file.

## State

- Branch `dev`, not pushed. The web change is commit `be0ab97`
  (`BUGFIX: Write the gold pill, the Away tag and the middling round title in --fg, …`), on
  `e6a004d`. It touches `web/src/styles/tavern.css` and `web/src/styles/online.css` and nothing
  else.
- Protocol stays 1. No message, field or error code changed. Nothing under
  `web/src/protocol/generated/`, `fixtures/` or `server/` was touched.
- What changed: three rules wrote `--gold-d` on `--gold-bg`, which is 2.00:1 in the light theme
  (5.85:1 in the dark one) against the 4.5:1 of `docs/agent-rules/web-quality.md`. They now write
  `--fg`:
  - `.pill.gold` (season and tier pills, Dealer, Offline, Leader, the table's toasts and bonus
    banner),
  - `.presence.away` (the Away tag on a seat),
  - `.sheet.mid .title` (the round sheet's title when some bids were made).
- No token changed and no hex value was added. Of the existing tokens only `--fg` and `--muted`
  (and the green, red and blue inks) are 4.5:1 on `--gold-bg` in both themes; `--gold-ink` is
  10.32:1 light and 1.13:1 dark. `.pill.format` (`--gold` with `--gold-ink`, 7.25:1) is unchanged.
- Measured in headless Chrome from the built CSS, computed colours: `.pill.gold`,
  `.presence.away` and `.sheet.mid .title` are 10.11:1 in the light theme and 11.79:1 in the dark
  one.
- The gate ran on a clean export of the staged tree: `vp check`: 154 files formatted, no warnings,
  lint or type errors in 142 files. `vp test`: 51 files, 726 passed. `vp build`: built.
- Not run: `npm run e2e` and a round in the browser. Only three colour declarations changed.
- Not part of this fix: `.disclose b` (the `+30` on the scorekeeper's "Bonus cards" button) was
  `--gold-d` on `--soft`, 2.03:1 in the light theme. Another Claude session is fixing it. Its one
  staged line (`.disclose b` to `--fg`) went into `479ee5d` with the design files by my mistake:
  I committed without naming the paths. I have not gated that line; that session reports on it.

## Designs

Changed in Pen, by the Pencil tools only: every text node in `$gold-d` on `$gold-bg` is now `$fg`.

- `design/skt.pen`: 74 nodes (the `Pill / gold` component, its drawn copies, the `14s +10`
  banner, the `AWAY` tag, `Well sailed!`).
- `design/web.pen`: 64 nodes, the same kinds.
- `design/gameon.pen`: the text of the `Pill / gold` component; its 68 instances follow it.

The owner saved all three files and they are committed in `479ee5d`
(`BUGFIX: Draw the text on the pale gold in $fg in design/skt.pen, design/web.pen and
design/gameon.pen.`). I compared each saved file with the one in `2135f45`, top-level frame by
top-level frame, and the variables:

- `design/web.pen`: nothing but the 64 fills.
- `design/skt.pen`: the 74 fills and the four `Public · list` frames of handover 136, which were
  open in Pen and not on disk until this save.
- `design/gameon.pen`: the pill and the six `Games ·` frames of handover 136, the same way.

So the design changes of handover 136 are on `dev` as of `479ee5d` too.

## Your task

Nothing to build and nothing to answer. This is for your information only.

## Contracts

- Frozen and untouched: `docs/protocol.md`, `skt-protocol`, `web/src/protocol/generated/`,
  `fixtures/`.

## Done when

You have read this file.

## Report back

Nothing, unless server work of yours shows a player text on a pale gold background. Then describe
the screen, the state and the copy in a handover for Claude in `docs/handover/` (the next free
number), printed in one fenced code block.
