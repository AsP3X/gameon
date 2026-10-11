You are Claude, the web engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the web client. Grok writes the
Rust server, Compose, deploy files and CI, and never edits `web/` except the generated protocol
tree. You and Grok cannot see each other's sessions: the owner pastes handover prompts between you.
This is handover 019, the answer to your 018. The nine holes are in `docs/protocol.md`. Your next
package is C7 against the mock. C8 waits for the real server.

READ FIRST, IN THIS ORDER
1. `AGENTS.md`, then `docs/agent-rules/protocol-contract.md`, `server-authority.md`,
   `design-sync.md`, `web-quality.md` and `definition-of-done.md`.
2. `docs/protocol.md` §5.3 and §5.5 at commit `5655579`. That commit is on
   `feature/grok-reply-order`, not yet on `dev`. Read it there. Do not commit on that branch.
3. `docs/multiplayer-plan.md` §5, your row C7. C8 is not this package.

STATE

Branch `feature/grok-reply-order`, commit `5655579`
(`56555794300e84bf801e658ee9980ded6c61f5d5`). This handover is the next commit on that branch and
is not part of `5655579`. The branch is local, checked out in
`/Users/nvorberg/Documents/development/SkullKingTavern`. It is not pushed and it is not on `dev`.
`dev` is still `02da4cc`. Do not merge it. It contains `f9fc639` and `bf1b145`.

`feature/claude-online-lobby` (`5058221`, worktree
`/Users/nvorberg/Documents/development/skt-claude-online`) is not on `dev`. Grok did not merge it
and did not edit it. The web gate was run there, Node v25.2.0 (npm 11.6.2). Node 24 is not
installed here. vite-plus and vitest warn about Node 25. The worktree was left clean:

- `npm ci` — added 135 packages, found 0 vulnerabilities.
- `npx vp check` — all 71 files formatted; no warnings, lint errors or type errors in 64 files.
- `npx vp test` — 22 files, 270 tests passed. Duration 11.80s.
- `npx vp build` — 65 modules, built in 243ms. `dist/assets/index-DvOwLkXl.js` 372.65 kB,
  `dist/assets/index-CoZU_Zmy.css` 50.46 kB. The mock server is not in that bundle.
- `node scripts/generate-engine-fixtures.mjs --check` — `fixtures/engine matches the generator
  (41 games).`

`cargo test -p skt-protocol` on this branch passed 3 tests. Regeneration of the TypeScript and
the protocol fixtures was clean. No Rust type changed.

`web.yml`: None. The new tests run under `npx vp test`, which that workflow already runs.

`protocol` stays 1. No message, field or error code was added. No test in
`web/src/net/mock/server.test.ts` has to change for these answers: they are what the mock already
does, except the grace and away steps below, which the mock does not simulate and no current test
forbids.

The nine holes:

1. Opening update. §5.5. After `lobby.start`, every member including the host is sent
   `lobby.state` with `state: 'inGame'`. Each seated human's socket then gets `game.start` and,
   next, a `game.update` with `rev` 0 and `events: []`. The client draws the table from that
   update and does not present its events. The first accepted step is `rev` 1. The host's `ok`
   comes before the `lobby.state`.
2. `lobby.state` includes the sender. §5.3. `ok` for `lobby.ready`, `lobby.settings`,
   `lobby.addBot` and `lobby.removeBot` still carries no lobby.
3. `game.leave` removes the user from the lobby as well as the seat. §5.3. The members who remain
   get `lobby.state`. The leaver does not. A later `welcome` has `game: null` and no lobby. Host
   migration is unchanged: the longest-present human who remains.
4. `at.trick` is the sum of `won` plus `log[round].destroyed` on the sender's view. §5.5. A Kraken
   trick counts. During `trickEnd` the trick just played counts. The trick on the table during
   `playing` or `ability` does not.
5. `game.ready` is `ok` and then a `game.update` with `events: []` and the new `table.ready`.
   §5.5. `advance` is a later step, when every connected human is ready or the round-end deadline
   fires.
6. Any seated player with no socket when the game ends, leaver or not, is sent that `game.over`
   immediately after the next `welcome`. §5.5. `welcome.game` is null. The message does not put
   the table back.
7. `forfeited` is empty unless the game is ranked. In ranked it lists every seat that sent
   `game.leave`. `rating` is null unless the game is ranked. §5.5.
8. A socket that arrives or drops is its own step: `rev` increases by one, one `seatStatus`, sent
   to every seated socket. The returning socket gets it after `welcome`. `welcome.game.update` is
   a snapshot at the current `rev` with `events: []`, not a new step. A drop is `offline` at once.
   The 60s grace and the later change to `bot`, and two missed deadlines becoming `away`, are
   later steps. §5.5.
9. While the lobby is not `open`, `lobby.join`, `lobby.leave`, `lobby.ready`, `lobby.settings`,
   `lobby.addBot`, `lobby.removeBot`, `lobby.kick` and `lobby.start` are `LOBBY_STARTED`. §5.3.

Where the mock is not the server G4 and G5 will be. None of these are frame-order or error-code
disagreements with the tests:

- Deals use a 32-bit seed, and the bots read the whole `GameState`. The server uses an OS-seeded
  CSPRNG and gives bots only the per-seat view. The mock's own header already says so.
- A dropped socket stays `offline`. The server then waits 60s and, if the player is still gone,
  takes another step to `bot` and lets the bot play. Two missed deadlines in a row are a step to
  `away`. The mock does neither.
- The mock has no ranked games, so `forfeited` is always `[]` and `rating` is always null. The
  server fills both in ranked, as §5.5 now says.
- `game.emote` is `VALIDATION` and `queue.*` is `INTERNAL`. The client sends neither. The server
  grows those in later phases. Emote ids are still unnamed, so the server will not invent a list.

Merge order, for the owner, not done here. The branches touch different files. Merge
`feature/grok-reply-order` first, so `dev` has the contract, then `feature/claude-online-lobby`,
which brings C4 with it. `feature/claude-table-async` does not need a merge of its own.

`design/web.pen` on that branch does not yet hold the online screens. They are drawn in the
running Pen app and land when the owner presses ⌘S.

G3–G7 are not started.

YOUR TASK

C7, on one branch cut from `dev` once the owner has merged `feature/claude-online-lobby`. Until
that merge, cut from `feature/claude-online-lobby` itself. Keep using the mock. Do not wait for
the Rust server. Read §5.5 at `5655579` for deadlines, `seatStatus`, `ready` and `game.over`.

1. Draw the new controls in `design/web.pen` with the Pencil tools before the code: the deadline
   ring on the seats named by `table.deadline`, presence on `table.status` (`online`, `offline`,
   `away`, `bot`), the waiting state after this seat has sent `game.ready` and others have not,
   the reconnect overlay, and the result notice when a stored `game.over` arrives after `welcome`.
   The leave sheet already exists. Do not redraw the lobby screens if the saved file already has
   them.
2. Show the ring from `table.deadline.at` and the server clock. When the deadline passes, the
   mock plays the move. The client only displays it.
3. A reload of an online page reconnects: `hello`, then `welcome`. If `welcome.game` is set, the
   table comes back at that snapshot and the following `seatStatus` update. If a `game.over` is
   the next message, show the result notice on the hub and do not open a table. Outstanding ids
   from the dead page are gone. Nothing is sent again.
4. Solo, pass-and-play and the scorekeeper stay on `LocalTable`. The parity suite stays green.
5. Do not build C8. No four-browser test against a real server. Leave `server/`, `.github/`,
   `fixtures/` and `legacy/` alone. If the protocol text is missing something you need, name it
   in the handover. Do not invent a message.

CONTRACTS

- Frozen: `docs/engine-conformance.md` §3–§5, the 41 fixtures, `legacy/Skull King Tavern.html`, and
  every message name, field and error code. `protocol` stays 1.
- Changed by Grok in `5655579`: `docs/protocol.md` §5.3 and §5.5, the answers above.
- The seat of an online action comes from the session. The client still does not send one.
- You may edit `web/` except `web/src/protocol/generated/`, and `design/` through the Pencil tools.
  You may not edit `server/` or `.github/`.

DONE WHEN

- From `web/`: `npx vp check`, `npx vp test` and `npx vp build` pass, and
  `node scripts/generate-engine-fixtures.mjs --check` still prints that the fixtures match. Report
  the test count.
- A test shows the ring, a seat going `offline`, the ready waiting state, a reload that returns
  to the same hand, and a `game.over` that arrives after `welcome` with `game: null`.
- In a browser against the mock: start a private table, see the bid deadline, reload mid-hand and
  land on the same hand, then leave and land on the hub. One offline solo round still reaches its
  result.
- The new controls are in `design/web.pen`.

REPORT BACK

Write `docs/handover/020-claude-to-grok-<slug>.md` and print the same text in one fenced code
block. It must itself be a paste-ready prompt for Grok ("You are Grok"), with who and where,
state, a numbered task, contracts, done when, and report back. Include: the test count; any hole
in `docs/protocol.md`, with the reason, or "None"; and whether the offline solo path still passed.
