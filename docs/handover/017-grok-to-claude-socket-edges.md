You are Claude, the web engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the web client. Grok writes the
Rust server, Compose, deploy files and CI, and never edits `web/` except the generated protocol
tree. You and Grok cannot see each other's sessions: the owner pastes handover prompts between you.
This is handover 017, the answer to your 016. The three socket rules are in `docs/protocol.md`.
Phase 1 is not open.

READ FIRST, IN THIS ORDER
1. `AGENTS.md`, then `docs/agent-rules/protocol-contract.md` and `server-authority.md`.
2. `docs/protocol.md` §5.2 and §5.5 on the commit named below.

STATE

Branch `feature/grok-reply-order`, commit `f9fc639`
(`f9fc639dbeba7d922086b472cd347664df193c40`). This handover is the next commit on that branch and
is not part of `f9fc639`. The branch is local, checked out in
`/Users/nvorberg/Documents/development/SkullKingTavern`. It is not pushed and it is not on `dev`.
`dev` is still `02da4cc`. It also contains `bf1b145`, the earlier reply-before-update paragraph.
Do not merge it.

`feature/claude-table-async` is not on `dev`. The web and server gates of handover 014 were not
run. `cargo test -p skt-protocol` on this tree passed 3 tests, including a clean regeneration of
the TypeScript and the protocol fixtures. No Rust type changed.

`web.yml`: None.

Phase 1 was not opened. G3–G7 are not started. `ServerConfig.emotes` is still empty. The recorded
takes are still unconfirmed by ear.

Item 1. Yes, and §5.5 now says it. Added after the paragraph from `bf1b145`:

A bot move, a timeout and the server's `advance` are steps of their own. Each is its own
`game.update`, written to a socket only after both frames of an earlier pair are queued on it.

Item 2. A reply is written only to the socket its message arrived on. After a reconnect, no `ok`
or `err` for an `id` of the closed socket arrives. `welcome` shows whether the intent was
accepted. Added to §5.2, after the `superseded` sentence:

A reply is written only to the socket its message arrived on. Closing that socket ends every `id`
still waiting on it. The next socket receives no `ok` or `err` for those ids. The client forgets
them and does not send the intent again. `welcome` shows whether it was accepted: a game intent
that landed is in `welcome.game`, and one that did not is absent from that snapshot.

That is a dropped connection, not `game.leave`. The grace period still holds the seat, so
`welcome.game` is the game when the player is still seated.

Item 3. Rule (a), plus `game.over` when the game ends so the forfeit can carry `rating`. Not (b):
the leaver does not keep receiving `game.update`. Added to §5.5:

`game.leave` uses the `ok` then `game.update` pair, and that socket then receives no further
`game.update` for the game. The client takes the table down when that update has been presented.
The seat is a bot from that step. A later `welcome` for that user has `game: null`, and the hand
cannot be resumed. In ranked the leave is a forfeit, recorded then and scored last. `forfeited`
and `rating` travel on `game.over`, sent to the leaver when the game ends. If the leaver has no
socket at that moment, that `game.over` is written immediately after the next `welcome`, which
still has `game: null`. It does not put the table back.

`protocol` stays 1. No message, field or error code was added.

YOUR TASK

1. When the owner opens Phase 1, build C5 on these three rules: the message after `ok` is that
   step's `game.update`; a closed socket's ids are forgotten and `welcome` is the snapshot; a
   `game.leave` update takes the table down, and a later `game.over` is the result, not a return
   to the hand.
2. Do not start C5 from this handover. Leave `server/`, `.github/`, `fixtures/` and `legacy/`
   alone.

CONTRACTS

- Frozen: `docs/engine-conformance.md` §3–§5, the 41 fixtures, `legacy/Skull King Tavern.html`, and
  every message name, field and error code.
- Changed by Grok in `f9fc639`: `docs/protocol.md` §5.2 and §5.5, the three paragraphs above.
  `protocol` stays 1.
- The seat of an online action still comes from the session.
- You may edit `web/` except `web/src/protocol/generated/`, and `design/` through the Pencil tools.
  You may not edit `server/` or `.github/`.

DONE WHEN

- You have not started C5 from this handover.

REPORT BACK

When the owner opens Phase 1, write `docs/handover/018-claude-to-grok-<slug>.md` and print the
same text in one fenced code block. It must itself be a paste-ready prompt for Grok ("You are
Grok"), with who and where, state, a numbered task, contracts, done when, and report back.
Include any further `docs/protocol.md` change, with the reason, or "None".
