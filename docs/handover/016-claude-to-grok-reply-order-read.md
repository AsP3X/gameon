You are Grok, the backend engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the Rust server, the Compose and
deploy files and CI. Claude writes the web client and never edits `server/` or `.github/`. You and
Claude cannot see each other's sessions: the owner pastes handover prompts between you. This is
handover 016, Claude's answer to your 015. The reply order is read and C5 will be built on it. C5
is not started and Phase 1 is not open. Three things in `docs/protocol.md` are asked of you, and
item 2 of handover 014 is still waiting for the owner's merge.

READ FIRST, IN THIS ORDER
1. `AGENTS.md` and `docs/agent-rules/` if this is a new session. For this package:
   `protocol-contract.md`, `ownership-and-handover.md`, `git.md`.
2. `docs/protocol.md` §5.1, §5.2 and §5.5 on your branch `feature/grok-reply-order` (`bf1b145`).
3. Your own handover 015, the paragraph that starts "A bot move, a timeout and `advance`".

STATE

Branch `feature/claude-table-async`, worktree
`/Users/nvorberg/Documents/development/skt-claude-table`. `4e0a90b` is the work of handover 014,
`e3f47c6` is handover 014, and this handover is the commit after it. Local, not pushed, not on
`dev`. `dev` is `02da4cc`. Do not merge it and do not commit in that worktree; the owner merges.
This branch does not contain `docs/handover/015-…`; that file is on `feature/grok-reply-order`
(`5cbe358`) only.

Nothing under `web/`, `design/`, `fixtures/` or `legacy/` changed since `4e0a90b`. No gate was run
for this handover. The numbers of 014 stand for `4e0a90b`: `npx vp check` clean, `npx vp test` 15
files and 129 tests, `npx vp build` 51 modules, `generate-engine-fixtures.mjs --check` 41 games.

What Claude checked of 015, reading only:
- `bf1b145` changes `docs/protocol.md` only: nine added lines in §5.5, and they say what 015 says.
- `5cbe358` adds `docs/handover/015-grok-to-claude-reply-before-update.md` only.
- `dev` is `02da4cc` and `feature/grok-reply-order` is not on it.

How C5 will use the rule. None of this is built:
- Input locks at the send. After `ok` the client takes the next message on the socket as the step's
  `game.update` and unlocks when that update has been presented. No other update unlocks it. That
  closes the first known gap of 014 ("any update that is presented unlocks the input").
- After `err` it unlocks at once and waits for no update for that intent.
- `game.emote` does not lock the table. The push after its `ok` is the sender's own `game.emote`.
- A bot move, a timeout and `advance` never arrive between `ok` and the sender's update. Claude
  reads that from your handover 015. §5.5 says it only by "one step at a time"; see item 1.
- If the socket closes while a reply is outstanding, the client forgets every outstanding `id`,
  takes `welcome` as §5.2 says, and unlocks when `welcome.game.update` has been presented. It does
  not send the intent again. Whether the server accepted it shows in that snapshot. See item 2.

`docs/protocol.md`: no change from Claude. **None.** Three requests, in "Your task".

Fixtures the Rust harness should replay again: **None.**

Design: no screen changed, so `design/web.pen` was not touched.

The owner, in this session:
- Phase 1: **not opened.**
- `feature/claude-table-async` on `dev`: **not merged.**
- Emote ids: **not named.** Keep `ServerConfig.emotes` empty.
- The recorded takes: **not confirmed by ear.**

YOUR TASK

Nothing in `server/` or `.github/` has to change for this package. Items 1 to 3 are text in
`docs/protocol.md`, on `feature/grok-reply-order` or a new branch of yours. Each is a
clarification, so `protocol` stays 1 and no Rust type, generated file or protocol fixture changes.

1. §5.5, after the paragraph of `bf1b145`: add what your handover 015 says and the doc does not.
   Proposed: "A bot move, a timeout and the server's `advance` are steps of their own. Each is its
   own `game.update`, written to a socket only after both frames of an earlier pair are queued on
   it." Change the wording if G5 will do something else, and say what.
2. §5.1 or §5.2: say what happens to a reply that was outstanding when the socket closed. The rule
   Claude will build on: a reply is written only to the socket its message arrived on. After a
   reconnect no `ok` or `err` for an `id` of the earlier socket arrives, and `welcome` shows whether
   the intent was accepted. If G5 will hold that, add it. If not, say what holds.
3. §5.5, `game.leave`: say what the leaver's socket receives after the `ok` and `game.update` pair.
   Claude needs one of these to be the rule: (a) nothing more for that game, and the client takes
   the table down on that update; or (b) the updates go on until `game.over`, which also reaches
   the leaver. Say too whether a later `welcome` for that user has `game: null`, and how a ranked
   leaver gets the `rating` of `GameResult`, since `forfeited` and `rating` are in the same
   message.
4. Item 2 of handover 014 stands as written. When the owner tells you `feature/claude-table-async`
   is on `dev`, on a new branch cut from that `dev`, run the five commands of
   `.github/workflows/web.yml` from `web/` and the three server gate commands. Expect 15 files and
   129 tests, 41 games, 31 passed and `replayed 41 engine fixtures`. If something under `web/` is
   wrong, do not edit it: report the command and its output.
5. Stop there unless the owner's message with this prompt says "Phase 1 is open". If it does, Part
   B of handover 007 stands as written (G3–G7, on `feature/grok-phase1-server`, with a handover of
   its own), on `docs/protocol.md` with items 1 to 3 in it.

CONTRACTS

- Frozen: `docs/engine-conformance.md` §3–§5, the 41 fixtures, `legacy/Skull King Tavern.html`, and
  every message name, field and error code in `docs/protocol.md`.
- Changed by Claude in this package: this handover only. No file under `web/`, no contract text, no
  generated file, no fixture.
- The seat of an online action comes from the session. `server-authority.md` stands as written.
- You may edit `server/`, `.github/`, Compose and deploy files, the two generated trees through
  `export-protocol`, and `docs/protocol.md` for items 1 to 3 as `protocol-contract.md` says. Not
  `web/` otherwise, not `design/`, not `fixtures/engine/`, not `legacy/`.

DONE WHEN

- Items 1 to 3 each have an answer in your handover, and `docs/protocol.md` says the same where you
  changed it.
- `cargo test -p skt-protocol` still reports no diff in the generated trees.
- If the branch is on `dev`: the five web commands pass with 15 files and 129 tests, the three
  server gate commands pass with `replayed 41 engine fixtures`, and you say which Node version ran
  the web ones.

REPORT BACK

Write `docs/handover/017-grok-to-claude-<slug>.md` and print the same text in one fenced code block
the owner can paste to Claude ("You are Claude…"), with who and where, state, a numbered task,
contracts, done when, and report back. Include:
1. For each of items 1 to 3: the answer, and the text you added to `docs/protocol.md`, or "None".
2. Branch and commit, whether `feature/claude-table-async` was on `dev`, and the output of both
   gates with counts if you ran them.
3. Anything you changed in `web.yml`, with the reason, or "None".
4. If Phase 1 was opened: which of G3–G7 are done, how to start the server and Postgres locally
   (exact commands, ports, environment variables), and what a client must do to get a guest session
   and open the socket.
5. What is blocked and on whom, and any question for the owner.
