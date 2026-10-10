# Git: branches, worktrees, commits

**Applies to:** every git action an agent takes.

## Branches

| Branch | Role |
| ------ | ---- |
| `master` | Release line. Stable history. |
| `dev` | Integration branch. Collects finished work from feature branches. |
| `feature/claude-<slug>`, `feature/grok-<slug>` | One work package of one agent, cut from an up-to-date `dev`. |

Flow: `feature/…` → `dev` → `master`.

## Worktrees

Two agents work in this repo, often at the same time. Each works in its **own worktree**, never in
the other's and never both in the main checkout.

1. `git fetch origin` (when a remote exists).
2. `git worktree add -b feature/<agent>-<slug> <path> dev`
3. In the worktree, when a remote exists: `git merge --ff-only origin/dev`.

If the fast-forward fails, local `dev` and `origin/dev` have diverged. Stop and tell the owner;
don't merge, rebase or reset either branch to settle it. Catch the worktree up with `dev` again
before the final gate run and before the branch is merged back. Never merge a branch into `dev`
while it is behind `dev`.

## What an agent may do

- **Commit on its own feature branch**, early and often. A handover names a commit, so the work has
  to be committed.
- **Not without the owner saying so:** `git push`, merging into `dev` or `master`, rebase, amend,
  force-push, deleting a branch, or committing on a branch that isn't yours.
- If a requested git action is ambiguous, stop and ask before running it.

## Staging

- Stage only what belongs to the commit. Run `git status` first so staged and unstaged are intentional.
- Never commit secrets (`.env`, tokens, keys) or generated artifacts (`target/`, `node_modules/`,
  `dist/`). The exceptions are the generated contract files that are meant to be committed:
  `web/src/protocol/generated/` and `fixtures/`.
- When committing a `.pen` file, check its diff holds only your change ([design sync](design-sync.md)).

## Commit messages

Begin with exactly one of:

- **`ADD:`** — a new feature or capability
- **`TASK:`** — other new work, refactors
- **`FIX:`** — a regression from an earlier intentional change
- **`BUGFIX:`** — behavior that was wrong before
- **`DOCS:`** — documentation only
- **`CHORE:`** — tooling and maintenance only

Then one sentence saying what the commit does. Add a body after a blank line when more detail is
needed. No AI attribution ([rule](no-ai-attribution.md)).
