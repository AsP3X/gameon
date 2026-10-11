You are Claude, the web engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write `web/` and `design/web.pen`.
Grok writes the Rust server. You and Grok cannot see each other's sessions: the owner pastes
handover prompts between you. This is handover 034, the answer to 033. The owner decided that a
ranked seat away for most of the game is a forfeit. The screens you already have can draw it.

READ FIRST
1. `AGENTS.md`, then `docs/agent-rules/ownership-and-handover.md` and `definition-of-done.md`.
2. `docs/protocol.md` §5.5, the paragraph under `SeatInfo`, and §5.6, the paragraph that starts
   "In a ranked game, a seat that is `away`".

STATE

Grok's checkout is `/Users/nvorberg/Documents/development/SkullKingTavern`, branch
`feature/grok-ranked`. The rule is commit `e713d24`
(`e713d2455c09a65095ad18aa28129a3eddc929b6`). This handover is the commit on top of it. Not pushed.
Not merged. Do not commit in that checkout.

Your branch stays `feature/claude-ranked` in
`/Users/nvorberg/Documents/development/skt-claude-ranked`.

Gate, from `server/` on `e713d24`, with `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt`:
- `cargo fmt --check`: clean.
- `cargo clippy --all-targets -- -D warnings`: clean.
- `cargo test --workspace`: engine 23 passed; `engine_fixtures_replay` passed; protocol 3 passed;
  server 32 passed.

Protocol stays 1. No message, field or error code was added.

THE AWAY SEAT

The owner chose a forfeit. In a ranked game, a seat that is `away` when more than half of the
rounds end is a forfeit. A round is counted at the moment it ends. Coming back to `online` before
that moment keeps the round off the count. Two rounds out of five is not a forfeit. Three out of
five is.

When the game ends, that seat's place is last, it is appended to `forfeited` after any
`game.leave` seats, and `Me.cooldownUntil` is set by the same steps as a leave (15 minutes the
first time, then doubling, cap 24 hours). A seat that already sent `game.leave` is not penalised
again. Casual and custom games do not do this. A bot after the disconnect grace is still not a
forfeit.

The away player is still seated. `game.over` arrives on the open table. They see the normal end
screen: their place, their seat in `forfeited`, and the rating line, including a negative delta.
They do not see the "You left before the end" notice. That notice stays for `game.leave` only.
After the end screen, the hub reads `cooldownUntil` as it already does.

YOUR TASK

1. No new screen and no new copy. Confirm the end screen is the one an away player gets, and that
   the leave notice is only shown after `game.leave`. If a mock test marks a ranked seat away for
   more than half the rounds, expect the forfeit above. If the mock never marks a seat away, say
   so and do not build a deadline engine to do it.
2. `SeatInfo.tier` is the account's tier at the deal on a custom table, a casual table and a
   ranked table, and null when the account has no visible rating. A bot seat is null. Your mock
   may keep sending null outside ranked. The client keeps drawing a tier from `Rating` only.
3. The pen from 031 and 033 is still unsaved. The owner presses ⌘S in Pen with
   `/Users/nvorberg/Documents/development/skt-claude-ranked/design/web.pen` open. You then check
   the diff and commit it. That is what makes `feature/claude-ranked` ready to merge.

CONTRACTS

- Frozen for you: `server/`, `docs/protocol.md`, `web/src/protocol/generated/`, `fixtures/`.
- Yours: `web/` except the generated protocol tree, and `design/web.pen` through the Pencil tools.
- Protocol stays 1. `ServerConfig.emotes` stays empty.

DONE WHEN

From `web/` on your branch: `npx vp check`, `npx vp test` and `npx vp build` pass, or you report
that no file changed. Say whether the pen was saved and committed.

REPORT BACK

Write `docs/handover/035-claude-to-grok-<slug>.md` and print the same text in one fenced code
block, a paste-ready prompt for Grok. Include your branch and commit, whether any client file
changed, and whether the pen is on disk.
