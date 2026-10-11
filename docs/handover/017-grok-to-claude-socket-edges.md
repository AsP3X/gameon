You are Claude, the web engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the web client. Grok writes the
Rust server, Compose, deploy files and CI, and never edits `web/` except the generated protocol
tree. You and Grok cannot see each other's sessions: the owner pastes handover prompts between you.
This is handover 017, the answer to your 016. The three socket rules are in `docs/protocol.md`.
The owner then asked for the next client slice in one package: plan items C5 and C6. Grok's
column of Phase 1 stays closed.

READ FIRST, IN THIS ORDER
1. `AGENTS.md`, then `docs/agent-rules/protocol-contract.md`, `server-authority.md`,
   `design-sync.md`, `web-quality.md`, `git.md` and `definition-of-done.md`.
2. `docs/protocol.md` §2, §5.1, §5.2, §5.3 and §5.5 at commit `f9fc639`. Those sections are not on
   `dev` yet. Read them from `feature/grok-reply-order`. Do not commit on that branch.
3. `docs/multiplayer-plan.md` §5, your rows C5 and C6. C7 and C8 are the package after this one.
4. `web/src/table/table.ts` on `dev`, and `web/src/protocol/generated/`. Import the generated
   types. Do not hand-edit them.

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

C5 and C6, on one branch cut from `dev`. The Rust server is not part of this package. Speak
protocol v1 as `f9fc639` writes it, including the three paragraphs in STATE.

1. Socket client. Connect, send `hello`, take `ok` then `welcome`, and keep a server-clock offset
   from `serverTime` on `welcome` and on `ping`. One reply per client `id`. Reconnect with
   backoff. On a new socket, forget every outstanding `id`, do not send the intent again, and
   replace online state with `welcome`. A dropped connection is not `game.leave`: `welcome.game`
   is the game while the player is still seated.
2. `RemoteTable` implements `Table`. `localSeats` is the one seat `game.start` calls `me`.
   `dispatch` sends `game.bid`, `game.play` or `game.ability` with no seat field. Input stays
   locked from the send until the next message after `ok`, which is that step's `game.update`.
   An `err` unlocks at once and is not followed by an update for that intent. `game.leave`'s
   update takes the table down. A later `game.over` is the result, including a forfeit, and does
   not put the table back. Put the table on screen with the existing `showTable`.
3. A mock server in `web/`, used by tests and by a dev switch. It speaks the same messages. The
   table task handles one step at a time and writes `ok` then that step's `game.update` with
   nothing between them. Drive accepted play through the engine already in `web/src/game/`. Do
   not write a second copy of the rules. Each seat is sent only its own view. Cover with tests:
   the pair order, an `err` with no update, a reconnect that drops old ids, a leave that stops
   `game.update` and still delivers `game.over` when the game ends, and a second seat that never
   receives the first seat's hand.
4. Lobby screens, drawn in `design/web.pen` with the Pencil tools before the code: the online
   hub, create, join by code, and the lobby room (members, ready, add and remove a bot, settings,
   start). Wire them to the mock. From the hub a player can create a private lobby, add one bot,
   ready, start, and bid once at the existing table. Solo, pass-and-play and the scorekeeper stay
   on `LocalTable` and keep the behavior the parity suite already checks.
5. Do not build C7 or C8. No deadline ring, presence badges, reconnect overlay, or browser test
   against a real server. Leave `server/`, `.github/`, `fixtures/` and `legacy/` alone. If the
   protocol text is missing a message you need, stop on that message and name it in the handover.
   Do not invent one.

CONTRACTS

- Frozen: `docs/engine-conformance.md` §3–§5, the 41 fixtures, `legacy/Skull King Tavern.html`, and
  every message name, field and error code. `protocol` stays 1.
- Changed by Grok in `f9fc639`: `docs/protocol.md` §5.2 and §5.5, the three paragraphs in STATE.
- The seat of an online action comes from the session. The mock enforces that. The client must
  not send a seat on `game.bid`, `game.play` or `game.ability`.
- You may edit `web/` except `web/src/protocol/generated/`, and `design/` through the Pencil tools.
  You may not edit `server/` or `.github/`.

DONE WHEN

- From `web/`: `npx vp check`, `npx vp test` and `npx vp build` pass, and
  `node scripts/generate-engine-fixtures.mjs --check` still prints that the fixtures match. Report
  the test count.
- The tests in task 3 pass.
- In a browser, against the mock: create a private lobby, add a bot, ready, start, and bid once.
  Then play one offline solo round and confirm it still reaches the round result.
- The new screens are in `design/web.pen`.

REPORT BACK

Write `docs/handover/018-claude-to-grok-<slug>.md` and print the same text in one fenced code
block. It must itself be a paste-ready prompt for Grok ("You are Grok"), with who and where,
state, a numbered task, contracts, done when, and report back. Include: where the socket client,
`RemoteTable` and the mock live; the test count; any hole in `docs/protocol.md`, with the reason,
or "None"; and whether the offline solo path still passed.
