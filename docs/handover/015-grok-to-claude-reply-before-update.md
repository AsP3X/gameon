You are Claude, the web engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the web client. Grok writes the
Rust server, Compose, deploy files and CI, and never edits `web/` except the generated protocol
tree. You and Grok cannot see each other's sessions: the owner pastes handover prompts between you.
This is handover 015, the answer to your 014. The reply comes before the update. Phase 1 is not
open.

READ FIRST, IN THIS ORDER
1. `AGENTS.md`, then `docs/agent-rules/protocol-contract.md` and `server-authority.md`.
2. `docs/protocol.md` §5.5 on the commit named below, the paragraph that starts "On the sender's
   socket".

STATE

Branch `feature/grok-reply-order`, commit `bf1b145`
(`bf1b145d65c165c841e114b7769499516e0e4134`). This handover is the next commit on that branch and
is not part of `bf1b145`. The branch is local, checked out in
`/Users/nvorberg/Documents/development/SkullKingTavern`. It is not pushed and it is not on `dev`.
`dev` is still `02da4cc`. Do not merge it.

`feature/claude-table-async` (`4e0a90b`, handover `e3f47c6`) is not on `dev`. Grok did not merge
it, so the web and server gates were not run on a tree that contains it.

Item 1. Yes. That is how G5 will write the socket. `protocol` stays 1. No Rust type, generated
file or protocol fixture changed: the sentences are ordering, not a new field.

On the sender's socket, an accepted `game.bid`, `game.play`, `game.ability`, `game.ready` or
`game.leave` is written as `ok` and then, as the next message on that socket, the `game.update`
for that step. No other server message is placed between them: not another seat's `game.update`,
not a `game.emote`, not a `ping` reply, not `game.over`. The table handles one step at a time and
finishes both writes before it takes the next step. An `err` is the whole answer for that intent
and is not followed by a `game.update`. Other seats receive the step as a `game.update` only.
When the step ends the game, `game.over` follows that `game.update`. An accepted `game.emote` is
the same pair with the `game.emote` push in place of `game.update`.

A bot move, a timeout and `advance` are their own steps. Each is its own `game.update`, written
after the pair above has both frames queued. The first message after `ok` on the sender's socket
is that step's `game.update`. Holding input from the send until that message is the right lock.

`web.yml`: None.

`docs/protocol.md`: the paragraph above, added to §5.5 after the sentence that `ok` only says the
intent was accepted. Reason: C5 and C7 need a rule for what may arrive between the reply and the
sender's own update, and the table task can keep that gap empty.

Phase 1 was not opened. G3–G7 are not started. `ServerConfig.emotes` is still empty. The recorded
takes are still unconfirmed by ear.

YOUR TASK

1. When the owner opens Phase 1, build C5 against this rule: after `ok`, the next message on that
   socket is the `game.update` for that step. Keep input locked from the send until that message.
   An `err` unlocks at once and is not followed by an update for that intent.
2. Do not start C5 from this handover. Leave `server/`, `.github/`, `fixtures/` and `legacy/`
   alone.

CONTRACTS

- Frozen: `docs/engine-conformance.md` §3–§5, the 41 fixtures, and `legacy/Skull King Tavern.html`.
- Changed by Grok in `bf1b145`: `docs/protocol.md` §5.5, the ordering paragraph only. `protocol`
  stays 1.
- The seat of an online action still comes from the session.
- You may edit `web/` except `web/src/protocol/generated/`, and `design/` through the Pencil tools.
  You may not edit `server/` or `.github/`.

DONE WHEN

- You have not started C5 from this handover.

REPORT BACK

When the owner opens Phase 1, write `docs/handover/016-claude-to-grok-<slug>.md` and print the
same text in one fenced code block. It must itself be a paste-ready prompt for Grok ("You are
Grok"), with who and where, state, a numbered task, contracts, done when, and report back.
Include any further `docs/protocol.md` change, with the reason, or "None".
