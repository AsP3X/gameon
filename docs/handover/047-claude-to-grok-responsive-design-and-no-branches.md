# 047 · Claude → Grok · the branch rule changed; tablet, desktop and wide layouts are on dev

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and then `docs/agent-rules/git.md` in full: the owner changed it on 2026-10-12 and
it changes how you work.

## State

- Branch `dev`. Three commits on top of your `c446e98`:
  - `f4310e6` `ADD: Draw the tablet, desktop and wide layouts in design/web.pen.`
  - `7a9eb47` `DOCS: Forbid new branches and worktrees unless the owner asks for them.`
  - the commit that adds this file.
- Changed: `design/web.pen`, `AGENTS.md`, `docs/agent-rules/git.md`, this file. Nothing under
  `web/`, `server/`, `docs/protocol.md` or the fixtures, so no gate command applies.
- The design package is the one you already answered (your reply: the contracts hold, 8 seats is
  the maximum, no return handover). It was first written as `046` on
  `feature/claude-desktop-design`; your `046-grok-to-claude-docker-migrations.md` took that number
  on `dev`, so the record is this file.
- In `design/web.pen`, each in light and dark, 50 new top-level frames below the phone frames:
  - `Responsive · layout rules`: breakpoints, sizes, layout rules and motion.
  - Tablet portrait 834 × 1194: Home, table bidding, table your turn, scoreboard dialog.
  - Tablet landscape 1194 × 834: Home, table bidding, table your turn.
  - Desktop 1440 × 900: Home, Setup, table bidding, your turn, trick won, round-results dialog,
    8 pirates, End, action zone states, online hub, online table (host).
  - Wide 1920 × 1080: Home, table bidding, table your turn.
- Known flaw in the committed file: one stray 1 × 2 px ellipse at the document root
  (x 9332, y 29395). It is not part of the design and goes with the next save.
- Not done: no code. The web client still renders the 560 px column at every width.
- Your handover 046 asked nothing of Claude. Nothing was changed for it.

## Your task

1. Read the new `docs/agent-rules/git.md`. In short:
   - Do not create a branch or a worktree unless the owner specifically asks for that branch in
     the current request. `git switch -c`, `git checkout -b`, `git branch <name>`,
     `git worktree add -b` and `git stash branch` all count.
   - Commit your work on `dev`, in the main checkout.
   - Both agents now share that checkout. Fetch and `git merge --ff-only origin/dev` before you
     start. Never stage, commit, stash, restore, reset or delete uncommitted files in Claude's
     paths (`web/`, `design/`, `fixtures/engine/`).
   - Still not without the owner saying so: `git push`, merging into `master`, rebase, amend,
     force-push, deleting a branch.
2. Leave the branches and worktrees that already exist (yours and Claude's) alone until the owner
   says to remove them. Do not start new work on them.

## Contracts

- Frozen and unchanged: `docs/protocol.md`, protocol 1, the engine view, every message and error
  code, the generated tree, both fixture trees.
- Changed by the owner's instruction: `docs/agent-rules/git.md` and its row in `AGENTS.md`. You may
  not change them; propose changes in a handover.

## Done when

- Nothing to run. You are done when your next work package is committed on `dev` without a new
  branch or worktree.

## Report back

No return handover is needed. If the shared checkout causes a problem you cannot solve inside the
rule, write a paste-ready prompt for Claude to `docs/handover/`, print it in one code block, and
name the command and the files involved.
