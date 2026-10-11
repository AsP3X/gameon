You are Claude, the web engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the web client. Grok writes the
Rust server, Compose, deploy files and CI, and never edits `web/` except the generated protocol
tree. You and Grok cannot see each other's sessions: the owner pastes handover prompts between you.
This is handover 023, the answer to your 022. The four-browser script matches what G3, G4 and G5
will do. Nothing in it has to change before the server exists.

READ FIRST, IN THIS ORDER
1. `AGENTS.md`, then `docs/agent-rules/protocol-contract.md` and `server-authority.md`.
2. `web/e2e/README.md` on your branch.

STATE

No server commit for this package. `docs/protocol.md` was not changed. `web.yml` was not changed.
`protocol` stays 1.

The web gate was run from `web/` in `/Users/nvorberg/Documents/development/skt-claude-online` on
`feature/claude-four-players` (`4d9c37e`), Node v25.2.0 (npm 11.6.2). Node 24 is not installed
here. vite-plus and vitest warn about Node 25. Chrome is installed. The worktree was left clean.

- `npm ci` — added 137 packages, found 0 vulnerabilities.
- `npx vp check` — all 78 files formatted; no warnings, lint errors or type errors in 70 files.
- `npx vp test` — 22 files, 293 tests passed. Duration 11.23s.
- `npx vp build` — 67 modules, built in 214ms. `dist/assets/index-5c_LWn68.js` 377.10 kB,
  `dist/assets/index-h0c3N7AY.css` 52.08 kB.
- `node scripts/generate-engine-fixtures.mjs --check` — `fixtures/engine matches the generator
  (41 games).`
- `npm run e2e` — 1 file, 5 tests passed in 78.81s. The first line was
  `Four players against the mock host, page at http://localhost:54659`. Nothing was listening on
  port 8080.

Expectations the server will not meet: **None.**

Checked against §2, §5.3 and §5.5, and they hold:

- Four guests, four different ids, cookie `skt_session`, `POST /api/v1/auth/guest`, then
  `/api/v1/ws`. The page never reads the cookie.
- A private lobby code is six characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`. The join field
  uppercases before it is sent, so the server matches that alphabet as written.
- `members` stay in join order. A bot added after the four humans is the fifth member. Which
  `Seat` each member receives is the server's choice. The script does not assume join order is
  seat order. G4 will seat them in member order anyway.
- `lobby.start` is `ok`, then `lobby.state` with `inGame`, then `game.start`, then `game.update`
  at `rev` 0 with `events: []` and a five-card hand. Swift is five rounds of five.
- An extra `seat` on `game.bid` is ignored (§5.1, unknown fields). A second bid from the host is
  `NOT_YOUR_TURN`. A `game.play` while the table is bidding is `NOT_YOUR_TURN`. `bid: 99` is
  `BID_OUT_OF_RANGE`. None of those writes a `game.update`.
- An accepted `game.bid`, `game.play` or `game.ready` is `ok` and the next frame on that socket is
  that step's `game.update`.
- A page reload closes the socket before the new `hello`. That close is a step to `offline`.
  `welcome.game.update` is a snapshot at the rev after that step, `events: []`, higher than the
  rev the page last saw. The return is the next step, `online`, written after `welcome`. No
  `seatStatus` is sent at the opening of the game for a seat that starts online, so those two are
  the first status events for the reloaded seat. A new socket that has already replaced the old
  one (`superseded`) does not also emit `offline`.
- One `game.over` per page, `totals` length 5 and the same on every seat, `seat` equal to that
  page's seat. `lobbyId` is set. "Play again" is the client leaving the table screen for the
  lobby, which `lobby.state` has already returned to `open` with nobody ready.
- The trick pause is 2.5s and a bot moves in 0.8–1.5s, slower than the mock host. A swift game
  of clicks still finishes inside the script's eight minutes.

Development `Origin` allow-list: `http://localhost` and `http://127.0.0.1`, any port. `Secure` is
off for those. Do not pin `SKT_E2E_PORT`. Production is the site's own origin only, and that list
is not this package.

CI does not run `npm run e2e` yet. The workflow stays `npm ci`, `vp check`, `vp test`, `vp build`
and the fixture check. The browser script joins CI when the server job can start the binary and
the web job can point at it. That is G7.

Merge order, for the owner, not done here. Merge `feature/grok-c7-contract` first (`c39c085`, the
`game.over.seat` field), then `feature/claude-four-players` (`4d9c37e`). The second contains the
online table, the lobby and the async table, and it is not behind `dev`. The other Claude
branches do not need merges of their own.

G3–G7 are not started. Nothing further on the client blocks them.

YOUR TASK

When `GET http://127.0.0.1:8080/api/v1/health` returns 200, run `npm run e2e` from `web/` with no
`SKT_E2E_TARGET`. The first line must name the Rust server. If a step fails, fix the client only
when the frame followed `docs/protocol.md`. When the server did not, leave the script and name
the frame in the handover. Do not start that run before the health check passes. Do not edit
`server/` or `.github/`.

CONTRACTS

- Frozen: `docs/engine-conformance.md` §3–§5, the 41 fixtures, `legacy/Skull King Tavern.html`, and
  every message name, field and error code. `protocol` stays 1.
- Changed by Grok in this package: this handover only.
- The seat of an online action comes from the session. The forged `seat` in the script stays a
  cheat probe.
- You may edit `web/` except by hand-editing `web/src/protocol/generated/`, and `design/` through
  the Pencil tools. You may not edit `server/` or `.github/`.

DONE WHEN

- `npm run e2e` has passed against the Rust server, or you have reported the frame that did not
  match the protocol.
- The offline solo test in that file still passes.

REPORT BACK

Write `docs/handover/024-claude-to-grok-<slug>.md` and print the same text in one fenced code
block. It must itself be a paste-ready prompt for Grok ("You are Grok"), with who and where,
state, a numbered task, contracts, done when, and report back. Include: whether `npm run e2e`
passed against the Rust server, and any frame that disagreed with `docs/protocol.md`, or "None".
