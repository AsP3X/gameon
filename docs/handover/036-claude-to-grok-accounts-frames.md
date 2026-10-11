You are Grok, the server engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the Rust server, Compose, deploy
files and CI. Claude writes `web/` and `design/web.pen` and never edits `server/`. You and Claude
cannot see each other's sessions: the owner pastes handover prompts between you. This is handover
036. It is about one file, `design/web.pen`: the Phase 2 account screens were lost from it on `dev`,
Claude has put them back on a branch, and you are asked to land that branch and to change how a
`.pen` conflict is settled from now on.

READ FIRST, IN THIS ORDER
1. `AGENTS.md`, then `docs/agent-rules/ownership-and-handover.md`, `git.md` and `design-sync.md`.
2. `git show --stat dd1ae21` and `git log --oneline dev -- design/`.

WHAT WENT WRONG

`design/web.pen` is an encrypted binary. Git cannot merge it. Two branches changed it from the same
base (blob `fab1872`, 76 top-level frames):
- `feature/claude-four-players`, commit `3611f58`: blob `081fcd3`, 89 frames. The 13 new ones are
  the section "Online · at the table" and its 12 screens. It also changed `Online · hub states`
  and its dark copy.
- `feature/claude-accounts`, commit `972e066`: blob `666c948`, 93 frames. The 17 new ones are the
  section "Online · accounts, public tables and quick play" and its 16 screens. It also changed
  `Online · hub` (identity card, quick play, public tables) and `Online · new table` (the
  "Who can join" row), and their dark copies.

The merge `dd1ae21` ("Merge the accounts client onto the current table") kept the first blob.
`git log dev -- design/` therefore does not list `972e066` although it is an ancestor of `dev`, and
`dev` at `6e91303` has the account screens in `web/` and not in the design.

STATE

Branch `feature/claude-accounts-frames`, worktree
`/Users/nvorberg/Documents/development/skt-claude-accounts-frames`, cut from `dev` at `6e91303`
(`origin/dev` is the same commit). Not pushed, not merged.

Done, in the running Pen app, through the Pencil tools only, on that worktree's `design/web.pen`:
- The 17 frames are back. `dev`'s file had the table section at y 11500 where the accounts section
  was drawn, so the accounts section now sits one row lower: the title at (0, 13500), the screens
  at y 13600, the same x as before (light at 0, 1000 … 7000, dark 450 to the right of each).
- `Online · hub` and `Online · new table` carry the accounts version. Their dark copies were made
  again from the light frames, as `972e066` had done.
- The file has 106 top-level frames: the 89 of `dev` and the 17.

Checked, by hashing each frame's node tree with the node ids left out:
- All 21 frames this touches (17 new, the hub, the new table, their two dark copies) are equal to
  the same frame in `feature/claude-accounts` at `04d670b`. Only `y` differs on the 17.
- The other 85 frames are equal, ids included, to `dev`'s file, and the variables are equal.
- No frame was changed on both branches, so nothing had to be chosen between them.
- The layout warnings the Pencil tools print for these frames (the footbar of quick play and of
  public tables, six rows of the new table) are the same ones the accounts file prints.

Not done:
- **The `.pen` is not on disk until the owner presses ⌘S in Pen** with
  `/Users/nvorberg/Documents/development/skt-claude-accounts-frames/design/web.pen` in front.
  Claude then commits it on this branch as `ADD:`. If
  `git log --oneline feature/claude-accounts-frames -- design/web.pen` still ends at `3611f58`,
  the save has not happened: stop and tell the owner.
- `web/` is not touched on this branch, so `npx vp check`, `npx vp test` and `npx vp build` were not
  run again; they are as on `dev`.
- The ranked screens. See task 3.

YOUR TASK

1. Once the `.pen` commit is on `feature/claude-accounts-frames` and the owner says to merge, merge
   the branch onto `dev`. `dev` has not changed `design/web.pen` since the branch was cut, so there
   is no conflict in it. After the merge, `git rev-parse dev:design/web.pen` must equal
   `git rev-parse feature/claude-accounts-frames:design/web.pen`.
2. From now on, do not settle a conflict in `design/*.pen` by taking one side. Stop the merge, name
   the two blobs and the two commits in a handover, and let Claude carry the frames across in Pen.
   Taking a side deletes the other side's screens without a trace in the diff.
3. `feature/claude-ranked` (tip `8182e2e`, not on `dev`) has the same problem waiting. Its
   `design/web.pen` grew from the accounts blob: it has the accounts frames and 13 ranked frames
   (the section "Online · ranked, ladder and leave warning" at y 13600 and 13700), and it does not
   have the 13 table frames. It is also modified and uncommitted in
   `/Users/nvorberg/Documents/development/skt-claude-ranked`. When the ranked client is merged, do
   not take that file and do not take `dev`'s over it without a word. Merge everything else, leave
   `design/web.pen` as `dev` has it, and say in your handover that the ranked frames are missing.
   Claude then draws them onto `dev`'s file on a branch of its own, one row below the accounts
   section (y 15600 and 15700). The ranked file also changed `Online · hub` and
   `Online · profile (account)` and, going by its re-made dark copy, `Online · pirate`; those
   changes come across with them.

CONTRACTS

- Nothing in `docs/protocol.md`, `skt-protocol`, the generated TypeScript or the fixtures is touched.
- Yours: `server/`, Compose, deploy, CI, the generated protocol tree.
- Frozen for you: `web/` except `web/src/protocol/generated/`, `design/`, `fixtures/engine/`.
- Proposed to the owner, not written by Claude: one line in `docs/agent-rules/design-sync.md` and
  in `git.md` saying what task 2 says.

DONE WHEN

- `git log --oneline dev -- design/web.pen` lists the `.pen` commit of this branch as its newest.
- `git rev-parse dev:design/web.pen` equals the blob on this branch.
- Your gate on `dev` after the merge prints what it printed before it: `cargo fmt --check`,
  `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`; from `web/`,
  `npx vp check`, `npx vp test`, `npx vp build`.

REPORT BACK

A paste-ready prompt for Claude, written to `docs/handover/NNN-grok-to-claude-<slug>.md` and
printed in one code block. It says: the merge commit, the blob of `dev:design/web.pen` after it,
what the gate printed, whether the ranked client has been merged and which blob `dev` kept for
`design/web.pen` when it was, and whether the owner took the rule change in task 2.
