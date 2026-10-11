You are Grok, the backend engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the Rust server, the Compose and
deploy files and CI. Claude writes the web client and never edits `server/` or `.github/`. You and
Claude cannot see each other's sessions: the owner pastes handover prompts between you. This is
handover 012, Claude's answer to your 011. C3 has landed. A second web branch that you have not
been told about holds it, together with one UI change. Phase 1 is not open.

READ FIRST, IN THIS ORDER
1. `AGENTS.md` and `docs/agent-rules/` if this is a new session. For this package: `git.md`,
   `definition-of-done.md`, `ownership-and-handover.md`, `server-authority.md`.
2. `web/README.md` on the branch `feature/claude-design-pen`, section "Deliberate differences from
   the legacy page", last item: the bid sheet.
3. `docs/multiplayer-plan.md` §5, Phase 1, your column (G3–G7). It stays closed until the owner
   opens it.

Do not read `docs/handover/009-claude-to-grok-design-and-bid-sheet.md` on that branch. It was
written before the sound package and never reached you; this handover replaces it. Two files carry
the number 009, one on each web branch (`…-design-and-bid-sheet.md` and `…-card-play-samples.md`).
Their names differ, so they do not conflict in a merge. Both are superseded, by this handover and
by 010.

STATE

Two web branches are open. Both are cut from `dev` (`4845b2e`), both are local, neither is pushed,
neither is on `dev`. Do not merge them and do not commit in their worktrees; the owner merges.

| Branch | Worktree | Holds |
| ------ | -------- | ----- |
| `feature/claude-design-pen` | `/Users/nvorberg/Documents/development/skt-claude-design` | the bid sheet, `design/web.pen`, this handover |
| `feature/claude-card-play-samples` (`c758955`) | `/Users/nvorberg/Documents/development/skt-claude-sound` | the recorded sounds of handover 010, which your 011 checked |

Your handovers 008 (`629bfb2`) and 011 (`6ce0792`) are on `feature/grok-ui-gate` only. Neither web
branch contains them.

`feature/claude-design-pen`, in order:
- `e9657d4` — the bid sheet (below). Files under `web/` only.
- `a4db182` — the superseded handover 009.
- `a4ee127` — `design/web.pen`. **C3 has landed.** `git log --oneline -- design/web.pen` prints
  that one line.
- The commit after it is this handover.

C3, `design/web.pen` (Claude only, through the Pencil tools; you never open it). Counted in the
open document in this session:
- 46 variables: every colour of `web/src/styles/tokens.css` with its light and dark value, the two
  fonts, the radius and the rise, and two colours `tavern.css` derives with `color-mix()`.
- 74 components: buttons, icon buttons, chips, pills, toggles, steppers, avatars, the mascot, stat
  tiles, the undo bar, the 14 icons, all 22 card faces, and the two states of the bid sheet.
- 55 top-level frames. Every screen of the app as it runs, each in light and in dark: home (first
  run and with a game in progress), setup, the table (bidding untouched and with a value chosen,
  your turn, trick won, the states of the action panel), the pass-and-play curtain, final scores,
  the sheets (round results, scoreboard, empty scoreboard, last trick, the Seer's undealt cards,
  how to play, sound), and the scorekeeper (setup, bids, tricks, round results, scoreboard). Two
  token boards and two component boards sit above them.
- The owner pressed ⌘S in Pen at 04:04 on 2026-10-11. The file it wrote has the same bytes as the
  save of 03:39, so nothing was pending. That file is what `a4ee127` holds.
- Known gaps, for whoever reads the file later: the screens are layers drawn from the running app,
  not instances of the components; a sentence with one bold word in it is one plain text layer; the
  sunburst behind the winner on the final scores is not drawn.

The bid sheet (`e9657d4`), asked for by the owner: at the table the bid is no longer a row of
chips. A sheet rises from the bottom edge under the hand, with a slider from 0 to the cards dealt,
the value in a bubble over the thumb, and the button that sends the bid. The scorekeeper keeps its
chips. It was drawn in `design/web.pen` first, then built.
- What the client sends is unchanged: one `bid` intent with a number from 0 to the cards dealt, and
  only when the player presses the button. Moving the slider sends nothing.
- The slider's upper end is `cards` from the seat's own view. It is feedback only. The server goes
  on rejecting a bid outside `0..=cards`, a second bid and a bid in the wrong phase
  (`server-authority.md`).

The gate, run in this session from `web/` in `skt-claude-design` at `a4ee127`, Node v25.2.0 (the
same version warning as in your 008; Node 24 is not installed here):
- `npx vp check` — `All 44 files are correctly formatted`; `Found no warnings, lint errors, or type
  errors in 38 files`.
- `npx vp test` — 11 files, 97 tests passed (92 on `dev`, 5 new for the bid sheet). Duration 11.74s.
- `npx vp build` — passes: `dist/assets/index-Db0VjBwj.js` 341.18 kB,
  `dist/assets/index-C63JeaYZ.css` 48.03 kB.
- `node scripts/generate-engine-fixtures.mjs --check` — `fixtures/engine matches the generator
  (41 games).`

Not run in this session: a browser smoke. The earlier session that built the bid sheet reported
bidding by drag and by keyboard at 390×844, 360×740 and 360×640 in light and dark, and a solo round
played to its results. This session changed nothing under `web/`, so it was not repeated.

The two web branches together: `git merge-tree --write-tree feature/claude-design-pen
feature/claude-card-play-samples` exits 0 with no conflict (both change `web/README.md`, in
different places). The merged tree was not built or tested. By addition it should hold 13 test
files and 110 tests (92 + 5 + 13), 47 formatted and 41 linted files, and a script and a stylesheet
whose hashes match neither branch.

`docs/protocol.md`: no change from Claude. **None.**

Fixtures the Rust harness should replay again: **None.** `web/src/game/`, `web/scripts/`,
`fixtures/` and `legacy/` are untouched since `4845b2e` on both branches.

The owner, in this session:
- Emote ids: **not named.** Claude's earlier proposal stands unanswered: `yoho`, `arr`, `nice`,
  `oops`, `thinking`, `laugh`, `cry`, `gg`. Keep `ServerConfig.emotes` empty until the owner
  confirms a list.
- The recorded takes: **not confirmed by ear.** Their levels are still matched to the synthesised
  sounds by measurement only. Whether the owner's ElevenLabs plan allows the files in a public
  release is also still the owner's check.

With C3, Claude's column of Phase 0 (C0–C3) is done. What is left before Gate 0 can be called on
`dev` is the owner's merge of the two web branches.

YOUR TASK

Nothing in `server/` or `.github/` follows from this package. Do this when the owner tells you
which web branches are on `dev`, on a new branch cut from that `dev`:

1. From `web/`, run the five commands of `.github/workflows/web.yml` on the merged tree and report
   them: `npm ci`, `npx vp check`, `npx vp test`, `npx vp build`,
   `node scripts/generate-engine-fixtures.mjs --check` (expect 41 games). Expect from `vp test`:
   11 files and 97 tests with only `feature/claude-design-pen` merged, 13 files and 105 tests with
   only `feature/claude-card-play-samples`, 13 files and 110 tests with both. `web.yml` names no
   test count, so it needs no edit. If something under `web/` is wrong, do not edit it: report the
   command and its output.
2. Run the server gate once on the same tree and report the counts (`cargo fmt --check`,
   `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`). Expect what your 008
   reported: 31 passed and `replayed 41 engine fixtures`.
3. Stop there unless the owner's message with this prompt says "Phase 1 is open". If it does, Part B
   of handover 007 stands as written (G3–G7 on `docs/protocol.md` as it is, on
   `feature/grok-phase1-server`, with a handover of its own). The bid sheet changes nothing in it.

CONTRACTS

- Frozen: `docs/engine-conformance.md` §3–§5, `docs/protocol.md` as it stands on `dev`, the 41
  fixtures, and `legacy/Skull King Tavern.html` until a deliberate rule change.
- Changed by Claude on `feature/claude-design-pen`: files under `web/` (`e9657d4`),
  `design/web.pen` (`a4ee127`), and the handovers 009 and 012. No contract text, no generated file.
- You may edit `server/`, `.github/`, Compose and deploy files, and the two generated trees through
  `export-protocol`. Not `web/` otherwise, not `design/`, not `fixtures/engine/`, not `legacy/`.

DONE WHEN

- The five web commands pass on the merged `dev` with the test count that matches what was merged,
  and you say which Node version ran them.
- The three server gate commands pass and the output shows `replayed 41 engine fixtures`.
- `cargo test -p skt-protocol` still reports no diff in the generated trees.

REPORT BACK

Write `docs/handover/013-grok-to-claude-<slug>.md` and print the same text in one fenced code block
the owner can paste to Claude ("You are Claude…"), with who and where, state, a numbered task,
contracts, done when, and report back. Include:
1. Branch and commit, which web branches were on `dev`, and the output of both gates with counts.
2. Anything you changed in `web.yml`, with the reason, or "None".
3. Any change to `docs/protocol.md`, each with its reason, or "None".
4. If Phase 1 was opened: which of G3–G7 are done, how to start the server and Postgres locally
   (exact commands, ports, environment variables), and what a client must do to get a guest session
   and open the socket.
5. What is blocked and on whom, and any question for the owner.
