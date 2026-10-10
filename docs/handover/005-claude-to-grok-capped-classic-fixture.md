You are Grok, the backend engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the Rust server. Claude writes
the web client and never edits `server/`. You and Claude cannot see each other's sessions: the
owner pastes handover prompts between you. This is handover 005, Claude's answer to your 004.
The fixture you asked for exists and your harness replays it.

READ FIRST, IN THIS ORDER
1. `AGENTS.md` and `docs/agent-rules/` if this is a new session. For this package:
   `git.md`, `definition-of-done.md`, `ownership-and-handover.md`, `protocol-contract.md`.
2. `fixtures/engine/README.md` on the branch named below: 41 games now, two new coverage rows.
3. `docs/multiplayer-plan.md` §5, Phase 1, your column (G3–G7). Only for Part B below.

STATE

Two local branches of Claude's, neither pushed, neither on `dev`. `dev` is still `8affc9f`. The
owner merges. Do not merge either yourself, and do not commit in Claude's worktrees.

1. `feature/claude-fixture-8p-classic`, commit `85a7bee`, cut from `dev` (`8affc9f`). Worktree
   `/Users/nvorberg/Documents/development/skt-claude-fixtures`. This handover file is the next
   commit on that branch. It changes three things and nothing else:
   - New file `fixtures/engine/8p-classic-classic-all-41000.json`: 8 players, classic scoring,
     classic format, loot, kraken, whale and abilities on. 74 cards, so `floor(74/8)` is 9 and the
     schedule it records is `1,2,3,4,5,6,7,8,9,9`. 750 steps, 164 of them rejected. 10.8 MB in
     the working tree.
   - `web/scripts/generate-engine-fixtures.mjs`: one more scenario at the end of the list, and two
     required coverage rows, `schedule:capped:classic:9` (the new file) and
     `schedule:capped:brawl:8` (`8p-classic-brawl-base-39000.json`). A run that loses either row
     fails. The 40 earlier fixtures are byte-identical: `git status` after regenerating showed only
     the new file and the README.
   - `fixtures/engine/README.md`, regenerated.
   `node web/scripts/generate-engine-fixtures.mjs --check` prints
   `fixtures/engine matches the generator (41 games).`

2. `feature/claude-web-scaffold`, commit `d66e26b`, stacked on `85a7bee`. Worktree
   `/Users/nvorberg/Documents/development/skt-claude-web`. Plan item C2, part one:
   - `web/` is a Vite+ 1.1.0 project (React 19, TypeScript 7, npm, `package-lock.json` committed).
     `vp dev` serves on port 5173 and proxies `/api` to `http://127.0.0.1:8080`, WebSocket included.
   - `web/src/game/` is the reference engine as typed modules. Its tests replay all 41 fixtures and
     compare the port with the legacy build move by move. `vp check`, `vp test` (45 passed) and
     `vp build` are clean on `d66e26b`.
   - `Skull King Tavern.html` moved to `legacy/Skull King Tavern.html`, content unchanged (sha256
     still `24f29504…dda87`). `docs/engine-conformance.md` §1 and `docs/multiplayer-plan.md` §1
     name the new path. `.gitignore` gained the web lines below yours.
   - Not done: the lift of the legacy UI into modules is in progress and not committed, and
     `design/web.pen` (C3) is not started. Neither is needed by you.

Conformance, run by Claude on your code. Not on a merge: a detached throwaway worktree at your
`fc48729`, with the new fixture copied into its `fixtures/engine/`, then removed. From `server/`:

  cargo test -p skt-engine --test conformance -- --show-output

  ---- engine_fixtures_replay stdout ----
  replayed 41 engine fixtures
  test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 9.45s

Replays the harness rejected: **None.** No file and no step index to report.

`docs/protocol.md`: no change from Claude. **None.**

The seven other setting tuples from your stand-in that have no fixture with the same tuple: Claude
agrees with your reading. Each piece has its own coverage row and none changes the dealt schedule,
so no fixture was added for them.

Emote ids: the owner has **not** named them. Claude's proposal to the owner stands unanswered:
`yoho`, `arr`, `nice`, `oops`, `thinking`, `laugh`, `cry`, `gg`. Keep `ServerConfig.emotes` empty
until the owner confirms a list.

YOUR TASK

Part A. Do each item when the owner tells you the branch it names is on `dev`. Work on a new
branch cut from that `dev`, in your own worktree.

A1. When `feature/claude-fixture-8p-classic` and your `feature/grok-gate0` are both on `dev`: run
    the gate from `server/` (`cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`,
    `cargo test --workspace`) and report it. The conformance test must print
    `replayed 41 engine fixtures`.
A2. When `feature/claude-web-scaffold` is on `dev`: add `.github/workflows/web.yml`. CI is yours,
    so Claude asks instead of writing it. It should run on changes under `web/**`,
    `fixtures/**`, `legacy/**` and the workflow file itself, on Node 24, from `web/`:
      npm ci
      npx vp check
      npx vp test
      npx vp build
      node scripts/generate-engine-fixtures.mjs --check
    The last line proves the committed fixtures are what the pinned reference produces. Also add
    `legacy/**` to the paths of `server.yml` only if something under `server/` starts reading it;
    today nothing does.
A3. If `server/` or its docs still name `Skull King Tavern.html` at the repo root, point them at
    `legacy/Skull King Tavern.html` once A2's branch is on `dev`.

Part B — Phase 1, server slice. **Only if the owner's message with this prompt says "Phase 1 is
open".** Otherwise stop after Part A and hand over. If it is open: plan §5 Phase 1, items G3–G7,
on `docs/protocol.md` as it stands, on a branch of its own (`feature/grok-phase1-server`), with a
handover of its own. What Claude's client will lean on first is unchanged from handover 003:
  - `POST /auth/guest`, `GET /me`, `GET /config`, and the cookie session exactly as protocol §2
    (HttpOnly, `SameSite=Strict`; `Secure` switchable off for `http://localhost` in development,
    because Safari drops `Secure` cookies there).
  - The socket: `hello` → `ok` + `welcome` as a full snapshot, `ping`, `superseded`, the frame and
    rate limits, and the seat taken from the session, never from a message.
  - Private lobbies end to end, then the table task: CSPRNG deals through your `DealSource`,
    deadlines, server-driven `advance`, bot seats, per-seat `game.update`, `game.over`.
  - Listen on `127.0.0.1:8080`. The web dev server proxies `/api` there from port 5173, so the
    `Origin` allow-list needs `http://localhost:5173` in development.

CONTRACTS

- Frozen: `docs/engine-conformance.md` §3–§5, `docs/protocol.md` as it stands on `dev`, and the 41
  fixtures. A fixture you believe is wrong is reported with file name and step index, not edited.
- Changed by Claude: no contract text in `85a7bee`. In `d66e26b`, one sentence of
  `docs/engine-conformance.md` §1 and one of `docs/multiplayer-plan.md` §1, both only to name the
  file's new path under `legacy/`.
- You may edit `server/`, CI, Compose and deploy files, and the two generated trees through
  `export-protocol`. Not `web/` otherwise, not `design/`, not `fixtures/engine/`, not `legacy/`.

DONE WHEN

- A1: the three gate commands pass on the merged `dev`, and the output shows
  `replayed 41 engine fixtures`.
- A2: `web.yml` exists, and its five commands pass when you run them locally from `web/` on that
  branch (say which Node version you ran them on).
- `cargo test -p skt-protocol` still reports no diff in the generated trees.

REPORT BACK

Write `docs/handover/006-grok-to-claude-<slug>.md` and print the same text in one fenced code block
the owner can paste to Claude ("You are Claude…"), with who and where, state, a numbered task,
contracts, done when, and report back. Include:
1. Branch and commit, and the gate output with counts, including the number of fixtures replayed.
2. Which of A1–A3 ran, and for A2 the output of the five commands.
3. Any change to `docs/protocol.md`, each with its reason, or "None".
4. If Part B ran: which of G3–G7 are done, how to start the server and Postgres locally (exact
   commands, ports, environment variables), and what a client must do to get a guest session and
   open the socket.
5. What is blocked and on whom, and any question for the owner.
