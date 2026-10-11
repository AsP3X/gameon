You are Grok, the backend engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the Rust server. Claude writes
the web client and never edits `server/` or `.github/`. You and Claude cannot see each other's
sessions: the owner pastes handover prompts between you. This is handover 009, Claude's answer to
your 008. Plan item C3 is drawn. One UI change the owner asked for during the package is built.
Phase 1 is not open.

READ FIRST, IN THIS ORDER
1. `AGENTS.md` and `docs/agent-rules/` if this is a new session. For this package:
   `git.md`, `definition-of-done.md`, `ownership-and-handover.md`, `server-authority.md`.
2. `web/README.md` on the branch named below, section "Deliberate differences from the legacy
   page", last item: the bid sheet.
3. `docs/multiplayer-plan.md` §5, Phase 1, your column (G3–G7). It stays closed until the owner
   opens it.

STATE

Branch `feature/claude-design-pen`, cut from `dev` (`4845b2e`), worktree
`/Users/nvorberg/Documents/development/skt-claude-design`. Local, not pushed, not on `dev`. Do not
merge it and do not commit in that worktree. It does not contain your `629bfb2` (handover 008),
which is only on `feature/grok-ui-gate`.

- `e9657d4` — the bid sheet (below). Files under `web/` only.
- The commit after it is this handover.
- `design/web.pen` is a commit of its own after that. A `.pen` file is on disk only once the owner
  has pressed ⌘S in Pen, so run `git log --oneline -- design/web.pen` on the branch: one line means
  C3 has landed, no line means the drawing is finished but not saved yet.

C3, `design/web.pen` (Claude only, through the Pencil tools; you never open it):
- 46 variables: every colour of `web/src/styles/tokens.css` with its light and dark value, the two
  fonts, the radius and the rise, and two colours `tavern.css` derives with `color-mix()`.
- 74 components: buttons, icon buttons, chips, pills, toggles, steppers, avatars, the mascot, stat
  tiles, the undo bar, the 14 icons, all 22 card faces, and the two states of the new bid sheet.
- Every screen of the app as it runs, each in light and in dark: home (first run and with a game in
  progress), setup, the table (bidding, your turn, trick won, the ten states of the action bar
  including all five pirate abilities and the Tigress), the pass-and-play curtain, final scores,
  the sheets (round results, scoreboard, empty scoreboard, last trick, the Seer's undealt cards,
  how to play, sound), and the scorekeeper (setup, bids, tricks, round results, scoreboard).
- Known gaps, for whoever reads the file later: the screens are layers drawn from the running app,
  not instances of the components; a sentence with one bold word in it is one plain text layer; the
  sunburst behind the winner on the final scores is not drawn.

The bid sheet (`e9657d4`), asked for by the owner in this package: at the table the bid is no
longer a row of chips. A sheet rises from the bottom edge under the hand, with a slider from 0 to
the cards dealt, the value in a bubble over the thumb, and the button that sends the bid. The
scorekeeper keeps its chips. It is drawn in `design/web.pen` first, then built.
- What the client sends is unchanged: one `bid` intent with a number from 0 to the cards dealt, and
  only when the player presses the button. Moving the slider sends nothing.
- The slider's upper end is `cards` from the seat's own view. It is feedback only. The server goes
  on rejecting a bid outside `0..=cards`, a second bid and a bid in the wrong phase
  (`server-authority.md`).

Gate, from `web/` on `e9657d4`, Node v25.2.0 (Vite+ warns about that version; Node 24 is not
installed on this machine):
- `npx vp check` — `All 44 files are correctly formatted`; `Found no warnings, lint errors, or type
  errors in 38 files`.
- `npx vp test` — 11 files, 97 tests passed (92 before, 5 new for the bid sheet), about 12 s. The
  parity suites still run the legacy page next to the renderer through whole games. They now
  compare the two bid controls on what they offer and what their button says, and everything around
  them as markup. Changing the button's copy in the port makes `parity/solo.test.ts` fail, as it
  should.
- `npx vp build` — passes: `index-Db0VjBwj.js` 341.18 kB, `index-C63JeaYZ.css` 48.03 kB.
- `node scripts/generate-engine-fixtures.mjs --check` — `fixtures/engine matches the generator
  (41 games).`
- In a browser: bidding by drag and by keyboard at 390×844, 360×740 and 360×640, light and dark,
  no horizontal scroll and the hand never under the sheet; a solo round played to its results, the
  sheet back in round 2, and back again after a reload and "Continue". Pass-and-play was run by the
  parity suite, not by hand. There is no online table to smoke yet.

`docs/protocol.md`: no change from Claude. **None.**

Fixtures the Rust harness should replay again: **None.** No fixture and no generator code changed.
`web/src/game/`, `web/scripts/`, `fixtures/` and `legacy/` are untouched since `4845b2e`.

Emote ids: the owner has **not** named them. Claude's earlier proposal stands unanswered: `yoho`,
`arr`, `nice`, `oops`, `thinking`, `laugh`, `cry`, `gg`. Keep `ServerConfig.emotes` empty until the
owner confirms a list.

YOUR TASK

Nothing in `server/` or `.github/` follows from this package. Do this when the owner tells you
`feature/claude-design-pen` is on `dev`, on a new branch cut from that `dev`:

1. From `web/`, run the five commands of `.github/workflows/web.yml` on the merged tree and report
   them: `npm ci`, `npx vp check`, `npx vp test` (expect 11 files, 97 tests), `npx vp build`,
   `node scripts/generate-engine-fixtures.mjs --check` (expect 41 games). `web.yml` names no test
   count, so it needs no edit. If something under `web/` is wrong, do not edit it: report the
   command and its output.
2. Run the server gate once on the same tree and report the counts (`cargo fmt --check`,
   `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`). Expect what 008
   reported: 31 passed and `replayed 41 engine fixtures`.
3. Stop there unless the owner's message with this prompt says "Phase 1 is open". If it does, Part B
   of handover 007 stands as written (G3–G7 on `docs/protocol.md` as it is, on
   `feature/grok-phase1-server`, with a handover of its own).

CONTRACTS

- Frozen: `docs/engine-conformance.md` §3–§5, `docs/protocol.md` as it stands on `dev`, the 41
  fixtures, and `legacy/Skull King Tavern.html` until a deliberate rule change.
- Changed by Claude in this package: files under `web/` (`e9657d4`), `design/web.pen`, and this
  handover. No contract text, no generated file.
- You may edit `server/`, `.github/`, Compose and deploy files, and the two generated trees through
  `export-protocol`. Not `web/` otherwise, not `design/`, not `fixtures/engine/`, not `legacy/`.

DONE WHEN

- The five web commands pass on the merged `dev` with 97 tests, and you say which Node version ran
  them.
- The three server gate commands pass and the output shows `replayed 41 engine fixtures`.
- `cargo test -p skt-protocol` still reports no diff in the generated trees.

REPORT BACK

Write `docs/handover/010-grok-to-claude-<slug>.md` and print the same text in one fenced code block
the owner can paste to Claude ("You are Claude…"), with who and where, state, a numbered task,
contracts, done when, and report back. Include:
1. Branch and commit, and the output of both gates with counts.
2. Anything you changed in `web.yml`, with the reason, or "None".
3. Any change to `docs/protocol.md`, each with its reason, or "None".
4. If Phase 1 was opened: which of G3–G7 are done, how to start the server and Postgres locally
   (exact commands, ports, environment variables), and what a client must do to get a guest session
   and open the socket.
5. What is blocked and on whom, and any question for the owner.
