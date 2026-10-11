You are Grok, the backend engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the Rust server. Claude writes
the web client and never edits `server/` or `.github/`. You and Claude cannot see each other's
sessions: the owner pastes handover prompts between you. This is handover 007, Claude's answer to
your 006. The legacy UI is lifted into `web/`. Plan item C2 is done. C3 is not started.

READ FIRST, IN THIS ORDER
1. `AGENTS.md` and `docs/agent-rules/` if this is a new session. For this package:
   `git.md`, `definition-of-done.md`, `ownership-and-handover.md`, `protocol-contract.md`,
   `server-authority.md`.
2. `web/README.md` on the branch named below: the layout of `web/src`, what tests guard the port,
   and the commands your `web.yml` runs.
3. `docs/multiplayer-plan.md` §5, the Gate 0 sentence and Phase 1, your column (G3–G7).

STATE

Branch `feature/claude-web-scaffold`, commits `b1101cc` and `b355e23`, on top of `dev` (`bfb45eb`).
This handover file is the next commit on that branch. Worktree
`/Users/nvorberg/Documents/development/skt-claude-web`. Local, not pushed, not on `dev`. It does not
contain your `feature/grok-web-ci` (`222d30b`), and yours does not contain it. The owner merges
both. Do not merge either yourself, and do not commit in Claude's worktree.

What landed (C2, the rest of it):
- `web/src/table/` — `Table`, the seam between the renderer and whoever runs the game, and
  `LocalTable` (the offline one). Phase 1 adds a socket client behind the same interface.
- `web/src/tableview/` — the legacy renderer as typed modules: art, state, views, the scorekeeper,
  motion, actions, events. `mountTavern(app, fx)` is its only entry and returns a cleanup.
- `web/src/sound/`, `web/src/styles/` (`tokens.css`, `tavern.css`), a React shell in `App.tsx` that
  mounts the renderer and never renders inside it, bundled fonts (no request leaves the origin).
- `web/README.md` — layout, commands, the deliberate differences from the legacy page, and the
  legacy quirks that were carried over unchanged.
- No change to `web/src/game/`, `web/scripts/`, `fixtures/`, `legacy/`, `web/package.json`
  dependencies or `web/vite.config.ts` since `d66e26b`. `legacy/Skull King Tavern.html` is
  byte-identical (sha256 `24f29504…dda87`).

Gate, from `web/`, on `b355e23`, Node v25.2.0 (Vite+ warns about that version; Node 24 is not
installed on this machine):
- `npx vp check` — `All 44 files are correctly formatted`; `Found no warnings, lint errors, or type
  errors in 38 files`.
- `npx vp test` — 11 files, 92 tests passed, about 11 s. 45 are the engine tests you already ran.
  The 47 new ones include a parity harness (`src/tableview/parity/`) that runs the legacy page's
  own script next to the lifted renderer and compares markup, `localStorage`, animation calls, Web
  Audio calls and vibration step by step, through a solo game, pass-and-play, the scorekeeper and
  every sound. They need `jsdom`, which is in `package-lock.json`, so `npm ci` installs it.
- `npx vp build` — passes.
- `node scripts/generate-engine-fixtures.mjs --check` — `fixtures/engine matches the generator
  (41 games).`
- In a browser, against the legacy page side by side at 390 px: home, setup and the table look the
  same; a solo round (bid, play, trick, round score) works; reload offers "Continue"; the
  scorekeeper starts and escapes a name typed as `<b>Anne</b>`; pass-and-play shows the hand-over
  curtain; light mode and 360 px have no horizontal scroll; no console error; no request to another
  host.

Gate 0 as the plan words it is now met on both sides: the lifted app plays solo, pass-and-play and
the scorekeeper as the legacy file does, `vp check`, `vp test` and `vp build` pass, your engine
replays every fixture, and your leak tests pass. C3 (`design/web.pen`) is a Phase 0 item but not
part of that gate. It is not started: it is drawn from the running app and needs the owner at the
keyboard to save the file in Pen.

`docs/protocol.md`: no change from Claude. **None.**

Fixtures the Rust harness should replay again: **None.** No fixture and no generator code changed.

Emote ids: the owner has **not** named them. Claude's proposal stands unanswered: `yoho`, `arr`,
`nice`, `oops`, `thinking`, `laugh`, `cry`, `gg`. Keep `ServerConfig.emotes` empty until the owner
confirms a list.

One thing the lift surfaced that touches the contract, for your side to keep true: the renderer
puts a seat's colour into a `style` attribute. The client now refuses anything that is not a
six-digit hex value, but the server must go on sending only `TableColor` values in `User.color`,
`SeatInfo.color` and a bot member's `color`, and must reject any other value in `PATCH /me`.

YOUR TASK

Part A. Do this when the owner tells you `feature/claude-web-scaffold` and your
`feature/grok-web-ci` are both on `dev`. Work on a new branch cut from that `dev`.

A1. From `web/`, run the five commands of `.github/workflows/web.yml` on the merged tree and report
    them: `npm ci`, `npx vp check`, `npx vp test` (expect 11 files, 92 tests),
    `npx vp build`, `node scripts/generate-engine-fixtures.mjs --check`. If a step fails only in CI
    conditions (a clean checkout, no cache), fix the workflow, not `web/`, and say what you changed.
    If something under `web/` is wrong, do not edit it: report the command and its output.
A2. The parity tests read `legacy/Skull King Tavern.html` and the fixture test reads
    `fixtures/engine/`. Confirm the workflow's checkout brings both (no sparse checkout, no path
    filter on the checkout step). Your trigger paths already cover them.
A3. Run the server gate once on the merged tree (`cargo fmt --check`,
    `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`) and report the counts,
    including `replayed 41 engine fixtures`.

Part B — Phase 1, server slice. **Only if the owner's message with this prompt says "Phase 1 is
open".** Otherwise stop after Part A and hand over. If it is open: plan §5 Phase 1, items G3–G7,
on `docs/protocol.md` as it stands, on a branch of its own (`feature/grok-phase1-server`), with a
handover of its own. What Claude's client will lean on first is unchanged from handover 005:
  - `POST /auth/guest`, `GET /me`, `GET /config`, and the cookie session exactly as protocol §2
    (HttpOnly, `SameSite=Strict`; `Secure` switchable off for `http://localhost` in development,
    because Safari drops `Secure` cookies there).
  - The socket: `hello` → `ok` + `welcome` as a full snapshot, `ping`, `superseded`, the frame and
    rate limits, and the seat taken from the session, never from a message.
  - Private lobbies end to end, then the table task: CSPRNG deals through your `DealSource`,
    deadlines, server-driven `advance`, bot seats, per-seat `game.update`, `game.over`.
  - Listen on `127.0.0.1:8080`. The web dev server proxies `/api` there from port 5173, so the
    `Origin` allow-list needs `http://localhost:5173` in development.
  - Claude starts C4 and C5 in parallel: `Table.dispatch` becomes asynchronous, a socket client and
    a mock server are built from `docs/protocol.md`. A hole you find in that document while
    building the real server goes into your handover loudly, because the mock is built from the
    same text.

CONTRACTS

- Frozen: `docs/engine-conformance.md` §3–§5, `docs/protocol.md` as it stands on `dev`, the 41
  fixtures, and `legacy/Skull King Tavern.html` until a deliberate rule change.
- Changed by Claude in `b1101cc` and `b355e23`: files under `web/` only, plus one line in the root
  `.gitignore` (`/.claude/launch.json`, a local preview config). No contract text.
- You may edit `server/`, `.github/`, Compose and deploy files, and the two generated trees through
  `export-protocol`. Not `web/` otherwise, not `design/`, not `fixtures/engine/`, not `legacy/`.

DONE WHEN

- A1: the five web commands pass on the merged `dev`, with 92 tests, and you say which Node version
  ran them.
- A3: the three server gate commands pass and the output shows `replayed 41 engine fixtures`.
- `cargo test -p skt-protocol` still reports no diff in the generated trees.

REPORT BACK

Write `docs/handover/008-grok-to-claude-<slug>.md` and print the same text in one fenced code block
the owner can paste to Claude ("You are Claude…"), with who and where, state, a numbered task,
contracts, done when, and report back. Include:
1. Branch and commit, and the output of A1 and A3 with counts.
2. Anything you changed in `web.yml`, with the reason, or "None".
3. Any change to `docs/protocol.md`, each with its reason, or "None".
4. If Part B ran: which of G3–G7 are done, how to start the server and Postgres locally (exact
   commands, ports, environment variables), and what a client must do to get a guest session and
   open the socket.
5. What is blocked and on whom, and any question for the owner.
