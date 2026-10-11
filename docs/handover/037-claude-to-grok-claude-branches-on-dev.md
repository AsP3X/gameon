You are Grok, the server engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the Rust server, Compose, deploy
files and CI. Claude writes `web/` and `design/web.pen` and never edits `server/`. You and Claude
cannot see each other's sessions: the owner pastes handover prompts between you. This is handover
037. It replaces 036, which was never pasted: the owner asked Claude to merge every Claude branch
onto `dev`, so the merges 036 asked you for are done. What is left for you is small: a gate run on
`dev`, and one way of working with `design/web.pen` that has to change.

READ FIRST, IN THIS ORDER
1. `AGENTS.md`, then `docs/agent-rules/ownership-and-handover.md`, `git.md` and `design-sync.md`.
2. `git log --oneline --first-parent 6e91303..dev`.
3. `web/README.md`, the paragraph "The mock server".

STATE

`dev` was `6e91303`. Claude merged onto it, each branch caught up with `dev` first and its gate run
in its own worktree before the merge:
- `f8df238` "Merge the menu music onto dev" (`feature/claude-menu-music`, caught up in `9283278`).
- `e1e6f92` "Merge the ranked client onto dev" (`feature/claude-ranked`, caught up in `0d9bdb5`).
- `feature/claude-accounts-frames`: this handover, 036 and `design/.gitattributes`.
Nothing is pushed. `origin/dev` is still `6e91303`. Nothing under `server/`, `deploy/`, Compose or
`.github/` changed, and nothing in `docs/protocol.md`, `skt-protocol`, the generated TypeScript or
the fixtures.

Gate on `dev` at `e1e6f92`, from `web/`:
- `npx vp check`: clean. 95 files formatted, 87 with no lint or type errors.
- `npx vp test`: 30 files, 405 tests passed.
- `npx vp build`: built.
- `npm run fixtures:check`: `fixtures/engine matches the generator (41 games)` (run on the ranked
  branch at `0d9bdb5`, whose tree is the tree of `e1e6f92`).
Looked at in a browser on that tree with `?mock`: the hub with its ranked row, quick play into a
table with three bots, a reload back to the same seat and hand. No console errors.
The Rust gate was not run: no Rust changed.

What the two catch-up merges had to decide in `web/`:
1. `App.tsx` hands the table `now`, `ranked` and `result` together, and covers the home screen for
   the menu music beside the table overlay.
2. `Online.serverNow` is the arrow function `dev` had. The method the ranked branch added is gone.
3. The mock (`web/src/net/mock/server.ts`): `game.over` carries `seat` and, in ranked, the rating.
   `Me` is built by `profile`, which also ends a cooldown that has run out. What the mock writes
   down for a reload now includes an account's `leaves` and a table's `tiers`; without them a
   ranked table could not be found again. `ranked.test.ts` has the test: "a ranked table and a
   mock that is made anew".
4. `web/README.md`: the mock paragraph says ranked and the reload in one piece.

THE DESIGN FILE

`design/web.pen` on `dev` is still blob `081fcd3`: 89 frames, no account screens and no ranked
screens. That is the one thing not done, and it waits for the owner, not for you.
- Why: the merge `dd1ae21` kept one side of a file git cannot merge and dropped the 17 account
  frames. The ranked branch's file had the same gap the other way round (no table frames). When
  Claude merged `dev` into the ranked branch, git treated the file as text and wrote conflict
  markers into the working copy.
- Claude carried both sets of frames onto `dev`'s file in the Pen app, through the Pencil tools:
  119 top-level frames, the 89 of `dev`, the 17 account frames at y 13500 and 13600, the 13 ranked
  frames at y 15600 and 15700, and the accounts and ranked versions of `Online · hub`,
  `Online · new table`, `Online · profile (account)` and `Online · pirate`. Every one of the 34
  frames this touches hashes equal to the same frame in the ranked branch's file (node ids left
  out, `y` aside); the other 85 hash equal to `dev`'s.
- **It is not on disk until the owner presses ⌘S in Pen** with
  `/Users/nvorberg/Documents/development/skt-claude-accounts-frames/design/web.pen` in front.
  Claude then commits it on `feature/claude-accounts-frames` and merges that onto `dev`. Until
  `git log --oneline dev -- design/web.pen` shows a commit newer than `3611f58`, the design is
  behind the client.
- The ranked branch's own file is kept in `d637305` (blob `96b2823`), which is on `dev`'s history.
- `design/.gitattributes` now says `*.pen binary`. A conflict in it leaves the file as it is and
  says so, with no markers.

YOUR TASK

1. Run your gate on `dev` once the owner says it is the `dev` to gate: `cargo fmt --check`,
   `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`; from `web/`,
   `npx vp check`, `npx vp test`, `npx vp build`. The web numbers above are what it should print.
2. From now on, do not settle a conflict in `design/*.pen` by taking one side. Stop the merge, name
   the two blobs and the two commits in a handover, and let Claude carry the frames across in Pen.
   Taking a side deletes the other side's screens without a trace in the diff.
3. The ranked smoke against your server with four accounts was last run before these merges
   (handover 033 and 035). If your server changed what `game.over` or `Me` says since
   `feature/grok-phase3-audit`, name the field in your reply; do not edit `web/`.

CONTRACTS

- Frozen: `docs/protocol.md`, protocol 1, the generated tree, both fixture trees. Nothing here
  touched them.
- Yours: `server/`, Compose, deploy, CI, the generated protocol tree.
- Frozen for you: `web/` except `web/src/protocol/generated/`, `design/`, `fixtures/engine/`.
- Proposed to the owner, not written by Claude: one line in `docs/agent-rules/design-sync.md` and
  in `git.md` saying what task 2 says.

HOW THE MACHINE WAS LEFT

- Claude's worktrees `skt-claude-accounts`, `-fixtures`, `-online`, `-ranked`, `-table` and `-web`
  are removed. Their branches are kept. `skt-claude-design` and `skt-claude-sound` are still there:
  a dev server of another session runs in each (ports 5174 and 5175).
  `skt-claude-accounts-frames` stays until the `.pen` is saved and committed.
- `npm ci` was run in `web/` of the main checkout to gate `dev` there.

DONE WHEN

- Your gate on `dev` prints what it printed before these merges for Rust, and the web numbers above.
- No `design/*.pen` conflict is ever again resolved with `--ours` or `--theirs`.

REPORT BACK

A paste-ready prompt for Claude, written to `docs/handover/NNN-grok-to-claude-<slug>.md` and
printed in one code block. It says: the commit of `dev` you gated and what each command printed,
whether `design/web.pen` on that commit is newer than `3611f58`, anything your server says in
`game.over` or `Me` that the client does not read, and whether the owner took the rule change.
