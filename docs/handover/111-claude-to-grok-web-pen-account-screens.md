# 111 · Claude → Grok · `design/web.pen` draws the account pages as they are built

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and `docs/agent-rules/design-sync.md` first. This package is design only. Nothing
here waits for you, and there is no code for you in it.

## State

- Branch `dev`, on `6e23c44`. This file is the only thing the package commits so far.
- I edited nothing under `web/`, `server/`, `docs/protocol.md`, `web/src/protocol/generated/`,
  `fixtures/`, Compose or the nginx templates. Protocol stays 1. No gate was run, because no code
  changed.
- `design/web.pen` has edits of mine that are not on disk until the owner saves the file in Pen.
  They are in no commit yet. `design/gameon.pen` and `design/skt.pen` were not touched.

## What changed in `design/web.pen`

The file still drew sign-up, sign-in, the profile, another player and the ladder as the old online
screens of `src/online/`. Those screens are gone from the app: the pages are `src/gameon/Account.tsx`,
`Profile.tsx` and `Ladder.tsx`, and `design/gameon.pen` draws them.

- **Removed, 24 frames:** `Online · create an account`, `Online · sign in`, `Online · pirate`,
  `Online · profile (guest)`, `Online · profile (account)`, `Online · ladder`, the `Desktop · Online · …`
  frame of each, and the dark twin of each.
- **Added, 22 frames,** under a new section `GameOn · accounts, the profile and the ladder` at the
  bottom of the canvas (y 31100): `Sign up`, `Sign in`, `Profile` and `Ladder`, each as `· desktop`
  and `· phone`, plus `Account · states`, `Profile · states` and `Ladder · states`, and the dark
  twin of each. They carry the names they have in `design/gameon.pen`, and each one is the same
  tree as there, node for node. I compared them after the move.
- **Changed:** `Online · account, tables and queue states` is now `Online · tables and queue states`
  (and its dark twin). The eleven account, profile and pirate rows left it; the eight table and
  queue rows stay. Three section titles lost the words "accounts" and "ladder". The layout rules
  sheet says "Setup and online screens" where it said "Setup, online and account screens".
- **New in the file:** the component `Logo / lockup` (the GameOn mark in the bar of every new
  frame) and the variable `gold-ink` (`#4b3800`, as in `web/src/styles/tokens.css`).
- The buttons, pills and avatars of the new frames are instances of the components `web.pen`
  already had.

## Your task

None. If server work changes what a player sees on sign-up, sign-in, the profile or the ladder,
describe the screen, the state and the copy in a handover as before. I draw it.

## Contracts

- Nothing on the wire changed. Protocol stays 1.
- You do not edit a `.pen` file. I do not edit `server/`, Compose or the nginx templates.

## For the owner, not for you

- `design/web.pen` needs a save in Pen (⌘S with its window in front). Until then none of the above
  is on disk.
- The window `gameon-src.pen` is a scratch copy I read the frames from. Close it without saving.
- `design/skt.pen` still has the old `Online · pirate`, `Online · profile (…)`, `Online · ladder`
  and `Online · account, tables and queue states` frames and their desktop twins. I did not touch
  that file.
- The old states frame had a row "This pirate already has an account." The new frames have none:
  an account that opens `/sign-up` is sent to Games.
- The rest of `web.pen` was not checked against the app in this package. `Online · hub` and its
  states predate Skull King's home.
- `Online · hub states` runs 57 px into `Table · online · seat states` below it, and so do their
  dark twins. That was so before this package.
- The rule still names only `design/web.pen` (asked in 074).

## Done when

The owner has saved `design/web.pen` and the save is committed. Nothing for you to run.

## Report back

Nothing is owed for this package. If you do answer, write it to `docs/handover/` as a paste-ready
prompt for Claude and print it in one code block.
