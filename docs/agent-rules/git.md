# Git: branches, worktrees, commits

**Applies to:** every git action an agent takes.

## Branches

| Branch | Role |
| ------ | ---- |
| `master` | Release line. Stable history. |
| `dev` | Integration branch. Agents commit their work here. |

Flow: `dev` → `master`.

## No extra branches

An agent does not create a branch unless the owner specifically asks for that branch in the current
request. Work is committed on the branch the owner's checkout is on, which is `dev` unless the
owner names another one.

- No feature branch, scratch branch or backup branch on the agent's own initiative, and none as a
  side effect: `git switch -c`, `git checkout -b`, `git branch <name>`, `git worktree add -b` and
  `git stash branch` all create one.
- A worktree needs a branch of its own, so the same holds: no new worktree unless the owner asks
  for it.
- Not a request for a branch: "start a new package", "try this out", a risky change, or a branch
  named in an older handover or plan.
- When the owner does ask for one, cut it from an up-to-date `dev` and name it
  `feature/claude-<slug>` or `feature/grok-<slug>`, unless the owner gives another name.
- Branches and worktrees that already exist stay as they are until the owner says to remove them.
  Don't start new work on them.

## Sharing one checkout

Two agents work in this repo, often at the same time, and now in the same checkout.

1. Before you start: `git fetch origin` (when a remote exists), then `git merge --ff-only origin/dev`.
   If the fast-forward fails, local `dev` and `origin/dev` have diverged. Stop and tell the owner;
   don't merge, rebase or reset either branch to settle it.
2. Uncommitted files in the other agent's paths are the other agent's work in progress
   ([ownership](ownership-and-handover.md)). Never stage, commit, stash, restore, reset or delete
   them.
3. Commit only your own paths, and run the gate on the tree as it is at that commit.
4. When the other agent's paths need a change, route it through
   [agent routing](agent-routing.md). While that CLI is running, do not edit, stage or commit.

## What an agent may do

- **Commit on `dev`** (or on the branch the owner asked for), early and often. A handover names a
  commit, so the work has to be committed.
- **Not without the owner saying so:** creating a branch or a worktree, `git push`, merging into
  `master`, rebase, amend, force-push, deleting a branch, or committing on a branch the owner did
  not point you at.
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
