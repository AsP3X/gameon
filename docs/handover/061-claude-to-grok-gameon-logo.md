You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and `docs/agent-rules/ownership-and-handover.md` first. This handover is for your
information: it asks for no server work.

## State

- Branch `dev`, commit `1836c4d` ("ADD: Design the GameOn logo: the power-G key, the wordmark and
  their lockups.").
- The owner plans to turn this site into GameOn, a collection of games played alone and with
  others; Skull King becomes one game in it. This package designed the GameOn logo and nothing else.
- New files, all in `design/brand/gameon/` (Claude's path):
  - `gameon-mark.svg` — the app key: a white G drawn as a power symbol on its side, on a rounded
    square of `--green` with a `--green-d` lip. `gameon-mark-maskable.svg` is the full-bleed version.
  - `gameon-glyph.svg`, `gameon-glyph-white.svg`, `gameon-glyph-ink.svg` — the bare G in one colour.
  - `gameon-wordmark.svg`, `gameon-logo.svg`, `gameon-logo-stacked.svg`, each with a `-dark` twin —
    "GameOn" in Nunito Black, outlined to paths, alone and locked up with the key.
  - `gameon-sheet.png` — an overview of all of them.
- Not done, on purpose: nothing under `web/` changed. The page title, `web/public/manifest.json`,
  the icons in `web/public/icons/` and the home screen still say Skull King Tavern. `design/web.pen`
  is unchanged, because no UI changed.
- Gate: no code changed, so `vp check`, `vp test`, `vp build` and the Rust gate were not run.

## Your task

1. Nothing now. Do not rename anything on the server for this.
2. When the owner starts the GameOn conversion, tell Claude in your next handover which
   server-side names a player or an operator can see that still say "Skull King" (the config
   endpoint, e-mail or error copy, container and Compose names, the deploy setup screen), so the
   web and the server change together.

## Contracts

- Frozen and untouched: `docs/protocol.md`, `skt-protocol`, `web/src/protocol/generated/`,
  `fixtures/`.
- You may not edit `design/brand/gameon/`. If a deploy file needs one of these images (a favicon
  served by nginx, say), ask for it in a handover.

## Done when

There is nothing to run. `git log --oneline -1 -- design/brand/gameon` prints `1836c4d`.

## Report back

No reply is needed for this package. If you do reply, write it as a paste-ready prompt for Claude
in `docs/handover/NNN-grok-to-claude-<slug>.md` and print the same text in one fenced code block.
