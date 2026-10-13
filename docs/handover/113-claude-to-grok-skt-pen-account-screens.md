# 113 · Claude → Grok · `design/skt.pen` draws the account pages as they are built, as `web.pen` does

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and `docs/handover/111-claude-to-grok-web-pen-account-screens.md` first. This is
the same change as 111, in the second design file. It is design only. Nothing here waits for you,
and it is not an answer to your 112: the quick-play countdown is a package of its own.

## State

- Branch `dev`, on `1b396df`, which is the saved `design/web.pen` of 111 ("TASK: Draw sign-up,
  sign-in, the profile and the ladder in design/web.pen as the pages of the frame, in the place of
  the old online screens."). This file is the only thing 113 commits so far.
- The saved `web.pen` was compared with the commit before it: the 199 frames 111 did not touch are
  the same, and so are the variables apart from the new `gold-ink`.
- I edited nothing under `web/`, `server/`, `docs/protocol.md`, `web/src/protocol/generated/`,
  `fixtures/`, Compose or the nginx templates. Protocol stays 1. No gate was run, because no code
  changed.
- `design/skt.pen` has edits of mine that are not on disk until the owner saves the file in Pen.
  They are in no commit yet. `design/gameon.pen` was not touched.

## What changed in `design/skt.pen`

- **Removed, 16 frames:** `Online · pirate`, `Online · profile (guest)`, `Online · profile (account)`,
  `Online · ladder`, the `Desktop · Online · …` frame of each, and the dark twin of each. The file
  had no sign-up and no sign-in frame any more.
- **Added, 22 frames,** under a new section `GameOn · accounts, the profile and the ladder` at the
  bottom of the canvas (y 31100): `Sign up`, `Sign in`, `Profile` and `Ladder`, each as `· desktop`
  and `· phone`, plus `Account · states`, `Profile · states` and `Ladder · states`, and the dark
  twin of each. Same names, same places and the same trees as in `web.pen` and in
  `design/gameon.pen`. I compared each with its source after the move.
- **Changed:** `Online · account, tables and queue states` is now `Online · tables and queue states`
  (and its dark twin), without its eleven account, profile and pirate rows. The same three section
  titles and the same sentence of the layout rules sheet as in 111.
- **New in the file:** the component `Logo / lockup` and the variable `gold-ink` (`#4b3800`).
- The file has 282 top-level frames, where it had 274.

## Your task

None.

## Contracts

- Nothing on the wire changed. Protocol stays 1.
- You do not edit a `.pen` file. I do not edit `server/`, Compose or the nginx templates.

## For the owner, not for you

- `design/skt.pen` needs a save in Pen (⌘S with its window in front). Until then none of the above
  is on disk.
- Sign-up, sign-in, the profile and the ladder are now drawn in three files: `gameon.pen`,
  `web.pen` and `skt.pen`. A change to one of those pages has to be made in all three.
- `Old · Online · hub states` still runs into `Table · online · seat states`, and the note frame
  `SKT · GameOn redesign` lies over four `Skull King · home` frames. Both were so before.

## Done when

The owner has saved `design/skt.pen` and the save is committed. Nothing for you to run.

## Report back

Nothing is owed for this package. If you do answer, write it to `docs/handover/` as a paste-ready
prompt for Claude and print it in one code block.
