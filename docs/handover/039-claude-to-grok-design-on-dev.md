You are Grok, the server engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the Rust server, Compose, deploy
files and CI. Claude writes `web/` and `design/web.pen` and never edits `server/`. You and Claude
cannot see each other's sessions: the owner pastes handover prompts between you. This is handover
039, the answer to 038. The owner saved the design file, and it is on `dev`. Nothing is asked of
you but to know it; there is no task in `server/`.

READ FIRST, IN THIS ORDER
1. `AGENTS.md`, then `docs/agent-rules/ownership-and-handover.md`, `git.md` and `design-sync.md`.
2. `git log -2 --oneline dev -- design/web.pen`.

STATE

`dev` is `f3e78c0` "Merge the account and ranked design frames onto dev", plus the merge that
brings this handover. `origin/dev` is `44aafb1`: the merges after it are not pushed.
- `4468c6c` "Restore the account screens and draw the ranked screens in design/web.pen", on
  `feature/claude-accounts-frames`. It is the newest commit of `git log dev -- design/web.pen`;
  the one before it is `3611f58`.
- `git rev-parse dev:design/web.pen` is `f734c0d`. It was `081fcd3`.

How the saved file was checked before the commit. The owner pressed ⌘S at 20:09; the file on disk
went from 6475208 to 7070725 bytes. Claude copied that file out of the worktree, opened the copy in
Pen and read it with the Pencil tools:
- 119 top-level frames: the 89 `dev` had, the 17 account frames, the 13 ranked frames.
- The 34 frames the work touched hash, with node ids left out and `y` aside, to the same value as
  in the ranked branch's file (`d637305`).
- The other 85 frames hash, ids included, to the same value as in `dev`'s old file, and the
  variables are the same. So the save wrote nothing but this change.
- No frame is left marked as a placeholder.

Gate on `dev` at `f3e78c0`, from `web/`:
- `npx vp check`: clean. 95 files formatted, 87 with no lint or type errors.
- `npx vp test`: 30 files, 405 tests passed.
- `npx vp build`: built.
`web/` does not differ from `e1e6f92`, the tree you gated in 038. No Rust changed, and the Rust
gate was not run again.

Read from 038 and kept:
- The server has not changed `game.over` or `Me` since `6e91303`. The client reads nothing new.
- The owner did not take the rule change. You will still not settle a `design/*.pen` conflict by
  taking one side, and `design/.gitattributes` (`*.pen binary`) keeps git from writing markers
  into the file.

Not done, and nobody's task yet:
- The four-account ranked smoke against the Rust server has not been run on `dev` since the
  merges. The last one is in 033 and 035, on `feature/claude-ranked` before it was caught up.
- `GET /api/v1/games/{id}/log` has no screen. The plan gives it none.

YOUR TASK

None. If the owner asks you to push `dev`, that is theirs to say.

CONTRACTS

- Frozen: `docs/protocol.md`, protocol 1, the generated tree, both fixture trees.
- Yours: `server/`, Compose, deploy, CI, the generated protocol tree.
- Frozen for you: `web/` except `web/src/protocol/generated/`, `design/`, `fixtures/engine/`.

HOW THE MACHINE WAS LEFT

- Every Claude branch is an ancestor of `dev`. The branches are kept.
- Worktrees: `skt-claude-accounts-frames` is removed with the others. `skt-claude-design` and
  `skt-claude-sound` are still there, because a dev server of another session runs in each
  (ports 5174 and 5175).
- The design file to open from now on is `design/web.pen` of whichever worktree the work is in,
  cut from this `dev`.

DONE WHEN

- `git log -1 --oneline dev -- design/web.pen` prints `4468c6c`.

REPORT BACK

Only if something here is not as you find it: a paste-ready prompt for Claude, written to
`docs/handover/NNN-grok-to-claude-<slug>.md` and printed in one code block, naming the command and
what it printed.
