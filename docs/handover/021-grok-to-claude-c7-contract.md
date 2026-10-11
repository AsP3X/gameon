You are Claude, the web engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the web client. Grok writes the
Rust server, Compose, deploy files and CI, and never edits `web/` except the generated protocol
tree. You and Grok cannot see each other's sessions: the owner pastes handover prompts between you.
This is handover 021, the answer to your 020. The three holes are closed. Your remaining client
work is below, so the server column can start without another protocol round. C8 against the real
server still waits for that server.

READ FIRST, IN THIS ORDER
1. `AGENTS.md`, then `docs/agent-rules/protocol-contract.md`, `server-authority.md`,
   `web-quality.md` and `definition-of-done.md`.
2. `docs/protocol.md` §5.5 and §5.6 at commit `c39c085`, and
   `web/src/protocol/generated/GameOver.ts` on that same commit. The field is `seat?`. Do not
   hand-edit the generated file. Do not commit on `feature/grok-c7-contract`.
3. `web/src/net/mock/server.test.ts` on your branch, the expectations that two seats' `game.over`
   frames are equal.

STATE

Branch `feature/grok-c7-contract`, commit `c39c085`
(`c39c08522d5f1c71e9d4ec7ccc8da92466b579ee`), cut from `dev` (`0a9fabd`). This handover is the
next commit on that branch and is not part of `c39c085`. The branch is local, checked out in
`/Users/nvorberg/Documents/development/SkullKingTavern`. It is not pushed and it is not on `dev`.
Do not merge it. `dev` already contains `feature/grok-reply-order` and
`feature/claude-online-lobby`.

`feature/claude-online-table` (`ab636c1`, worktree
`/Users/nvorberg/Documents/development/skt-claude-online`) is not on `dev`. It contains
`feature/claude-online-lobby` and `feature/claude-table-async`. Grok did not merge it and did not
edit it. The web gate was run there, Node v25.2.0 (npm 11.6.2). Node 24 is not installed here.
vite-plus and vitest warn about Node 25. The worktree already had an uncommitted `design/web.pen`;
that file was left as it was.

- `npm ci` — added 135 packages, found 0 vulnerabilities.
- `npx vp check` — all 73 files formatted; no warnings, lint errors or type errors in 66 files.
- `npx vp test` — 22 files, 292 tests passed. Duration 12.58s.
- `npx vp build` — 67 modules, built in 219ms. `dist/assets/index-Cgjm3IoQ.js` 377.05 kB,
  `dist/assets/index-h0c3N7AY.css` 52.08 kB. The mock server is not in that bundle.
- `node scripts/generate-engine-fixtures.mjs --check` — `fixtures/engine matches the generator
  (41 games).`

`cargo test -p skt-protocol` passed 3 tests. Regeneration was clean. `web.yml`: None.

`protocol` stays 1. One additive optional field: `game.over.seat`.

The three holes:

1. No length field on `Deadline`. §5.6. The whole of every deadline clock is the §5.6 length
   scaled by the game's `pace` (relaxed ×2, fast ×0.5; standard is the table). A client that
   meets a clock already running uses that scaled length, or the time remaining when that is
   longer. The ring you built matches this.
2. `game.over` carries `seat`, the receiver's seat. §5.5 and `GameOver`. The server always sends
   it. A message that omits it is still valid. The sample `fixtures/protocol/game.over.json` now
   has `"seat": 0`. Generated `GameOver.seat` is optional.
3. Round end waits for every human seat whose status is `online` or `away`. §5.5. `offline` and
   `bot` are not waited for. `away` is waited for. That is the reading you built.

What C7 reads, and what the server will write. These match:

- `timedOut` is in the same `game.update` as the move played for that seat, after the engine's
  events.
- `table.ready` is false for every bot seat and for a human who has not sent `game.ready`. The
  client does not wait for bots.
- During the 60s grace the seat is still that player's and `table.status` is `offline`. The step
  to `bot` is later. `away` is two missed deadlines, and that seat still has a socket.

Where the mock is still not the server, unchanged from 019: a 32-bit seed and bots that read
`GameState`; no grace step to `bot` and no `away`; no ranked `forfeited` or `rating`. New: the
mock's `game.over` has no `seat`, so two seats' frames compare equal. The server's will not.
`web/src/net/mock/server.test.ts` compares those frames with `toEqual` in the leave case and in
the reconnect case. Those two expectations change when the mock sends `seat`. Compare `result`,
not the whole frame.

Merge order, for the owner, not done here. Merge `feature/grok-c7-contract` first, then
`feature/claude-online-table`. The second branch brings C4, C5, C6 and C7. The lobby branch and
the table-async branch do not need merges of their own.

G3–G7 are not started. The contract they need is on `c39c085`.

YOUR TASK

One package, on a branch cut from `feature/claude-online-table` until that branch is on `dev`.
This is the client work that does not need the Rust server. Do not wait for it, and do not edit
`server/` or `.github/`.

1. Send `seat` on every `game.over` from the mock: the seat that socket was playing. The result
   notice uses that seat when the message has one, and the remembered seat only when `seat` is
   absent. Fix the two `toEqual` expectations in `web/src/net/mock/server.test.ts` that treat two
   seats' `game.over` frames as the same object.
2. C8's script, run against the mock for now. Four browser contexts. One creates a private lobby,
   the others join by code, one bot fills a seat if you need four players with three humans, they
   play a full game, one context reloads mid-trick and is back on the same hand, and a bid for
   another seat is `NOT_YOUR_TURN` on the sender's seat. Keep the offline parity suite green.
3. Shape that script so the same steps can later target the real server without being rewritten.
   The real target, once G3, G4 and G5 are up, is the Vite dev server: `POST /api/v1/auth/guest`
   with `credentials: 'same-origin'`, then the WebSocket at `/api/v1/ws`. The page never reads the
   cookie. The dev proxy sends `/api` to `http://127.0.0.1:8080`. Four contexts are four guests.
   Until that process is listening, the script keeps using the mock. Do not fail the suite because
   the Rust server is absent.
4. If the owner has pressed ⌘S, the C7 frames in `design/web.pen` belong in this branch. Do not
   redraw the lobby screens.
5. Leave `fixtures/` and `legacy/` alone. If `docs/protocol.md` is missing a message, name it.
   Do not invent one.

CONTRACTS

- Frozen: `docs/engine-conformance.md` §3–§5, the 41 fixtures, `legacy/Skull King Tavern.html`, and
  every message name and error code. `protocol` stays 1.
- Changed by Grok in `c39c085`: `docs/protocol.md` §5.5 and §5.6, and optional `game.over.seat`
  in `skt-protocol`, `web/src/protocol/generated/GameOver.ts` and
  `fixtures/protocol/game.over.json`.
- The seat of an online action still comes from the session. `game.over.seat` is the server
  telling the receiver which seat they held. It is not a seat the client may send.
- You may edit `web/` except by hand-editing `web/src/protocol/generated/`, and `design/` through
  the Pencil tools. You may not edit `server/` or `.github/`.

DONE WHEN

- From `web/`: `npx vp check`, `npx vp test` and `npx vp build` pass, and
  `node scripts/generate-engine-fixtures.mjs --check` still prints that the fixtures match. Report
  the test count.
- The mock's `game.over` frames carry `seat`, and the two equality checks no longer require two
  seats' frames to be identical.
- The four-context script passes against the mock, and the file says how it will point at
  `127.0.0.1:8080`.
- One offline solo round still reaches its result.

REPORT BACK

Write `docs/handover/022-claude-to-grok-<slug>.md` and print the same text in one fenced code
block. It must itself be a paste-ready prompt for Grok ("You are Grok"), with who and where,
state, a numbered task, contracts, done when, and report back. Include: the test count; any hole
in `docs/protocol.md`, with the reason, or "None"; whether the four-context script passed against
the mock; and whether the offline solo path still passed.
