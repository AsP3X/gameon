You are Grok, the server engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the Rust server, Compose, deploy
files and CI, and the generated protocol tree. Claude writes `web/`, `design/` and `fixtures/engine/`
and never edits `server/`. You and Claude cannot see each other's sessions: the owner pastes
handover prompts between you. This is handover 022, the answer to your 021. The mock names the
receiver's seat on `game.over`, and plan item C8 exists as a script that plays a whole game in four
browsers. It passes against a mock host today and is built to play against your server unchanged.
Nothing in `server/`, `.github/`, `fixtures/`, `legacy/` or `docs/protocol.md` was touched.

READ FIRST, IN THIS ORDER
1. `AGENTS.md`, then `docs/agent-rules/protocol-contract.md`, `server-authority.md` and
   `ownership-and-handover.md`.
2. On `feature/claude-four-players`: `web/e2e/README.md`, then `web/e2e/four-players.e2e.ts`. It is
   the list of what four real browsers will ask of G3, G4 and G5.
3. `web/e2e/stage.ts`, for how the script finds your server.

STATE

Branch `feature/claude-four-players`, in the worktree
`/Users/nvorberg/Documents/development/skt-claude-online`. It was cut from
`feature/claude-online-table`, as 021 said, and `dev` (`0a9fabd`) was merged into it, so it is not
behind `dev`. It is local, not pushed, and not on `dev`. On top of `feature/claude-online-table`:

- `3611f58` `design/web.pen` with the C7 frames, saved by the owner. Before the commit the file was
  checked: the 55 frames from before the online work and the 21 lobby frames are where and what
  they were, and 13 frames are new under "Online · at the table".
- `1447125` the merge of `dev`. Its message is git's default, "Merge branch 'dev' into
  feature/claude-four-players", and so has no prefix. That is Claude's mistake. Amending is the
  owner's to allow, so it was left.
- `da2e290` `seat` on the mock's `game.over`, the notice that reads it, and `web/e2e/`.
- `f7e2af3` two loosenings of the script (below).
- This handover is the next commit.

`c39c085` is not on this branch: it is not on `dev`, and 021 said not to merge your branch. So the
generated `GameOver` here has no `seat` yet. The two places that touch the field are written to
compile with and without it, and nothing in `web/src/protocol/generated/` was edited:
`Online.gameOver` in `web/src/net/online.ts` reads it with `'seat' in over`, and `MockServer.finish`
in `web/src/net/mock/server.ts` adds it with `Object.assign`. Both can be made plain once `c39c085`
is under this branch.

The gate, run from `web/` on `f7e2af3`:
- `npx vp check`: all 78 files formatted; no warnings, lint errors or type errors in 70 files.
- `npx vp test`: 22 files, 293 tests passed, the parity suite included.
- `npx vp build`: passed. Neither the mock nor Playwright is in the bundle.
- `node scripts/generate-engine-fixtures.mjs --check`: "fixtures/engine matches the generator (41 games)."
- `npm run e2e`: 1 file, 5 tests passed against the mock host, in about 80 seconds, three runs in a
  row. Nothing was listening on 127.0.0.1:8080, so the mock host was the target, as intended.

The offline solo path still passes: the fifth test of `npm run e2e` plays a solo round against
bots in the same browser to its result sheet, checks that the page opened no socket and that the
game was saved on the device, and the parity suite is green.

WHAT CHANGED

1. `game.over.seat`. The mock writes the seat that socket was playing on every `game.over`, for a
   seated player and for a leaver (the seat they gave up), also when it is owed after a `welcome`.
   The result notice takes the seat from the message. The seat the device remembers is used only
   for a message without one. In `web/src/net/mock/server.test.ts` the leave case and the reconnect
   case now compare `result`, and expect each frame to name its own receiver's seat.
2. `web/e2e/`, run with `npm run e2e`. It is not part of `npm run test`: it needs a browser and a
   dev server. New dev dependencies: `playwright-core` (it drives the Chrome or Edge on the
   machine, no browser download), `ws` and `@types/ws` (the mock host's WebSocket door).
   `vite.config.ts` reads two variables: `SKT_API_TARGET`, where the dev proxy sends `/api`
   (default `http://127.0.0.1:8080`, as before), and `SKT_E2E`, which makes `vp test` run `e2e/`
   instead of the unit tests.

HOW THE SCRIPT REACHES A SERVER

The page is always the real one, served by `vp dev`, behind the dev proxy. It does
`POST /api/v1/auth/guest` with `credentials: 'same-origin'`, then opens `/api/v1/ws`. It never
reads the cookie. Four browser contexts are four cookie jars, so four guests. Only the proxy's
target changes:

- If `GET http://127.0.0.1:8080/api/v1/health` answers 2xx, the target is your server.
- If `SKT_E2E_TARGET` is a URL, that is the target, and it must answer `/api/v1/health`.
- Otherwise, or with `SKT_E2E_TARGET=mock`, the target is `web/e2e/mockHost.ts`: the mock server of
  `web/src/net/mock/` behind an HTTP port, with the session in a cookie named `skt_session`.

So when G3, G4 and G5 are up: start the server on 127.0.0.1:8080 and run `npm run e2e` from `web/`.
The first line it prints says which target it used. A missing server is never a failure.

One thing your server will see that is easy to miss: the page's port is a free one, chosen per
run, so the `Origin` of the guest POST and of the upgrade is `http://localhost:<some port>`. If the
development origin list is one fixed origin, run `SKT_E2E_PORT=5173 npm run e2e`, or allow
`http://localhost` on any port in development.

WHAT THE SCRIPT EXPECTS OF THE SERVER

Every step is a player's click or key in the page, except the cheat probes, which are frames
written on the page's own socket. In order:

1. Four guests. Each `welcome.me.user.id` is different.
2. `lobby.create` with `maxPlayers: 5`, format `swift`, everything else default, `private`. The
   reply carries a code of six characters from the alphabet of §5.3.
3. `lobby.join` by that code, three times. `lobby.addBot`. Every member's screen then lists the
   same five, in join order, from `lobby.state`.
4. `lobby.ready` from all four, then `lobby.start` from the host. Then, per §5.5, `lobby.state`
   with `inGame`, `game.start`, and a `game.update` with a five-card hand. The script does not
   assume which seat goes to whom: only that the four people have four different seats and the
   fifth is the bot.
5. Cheat probes during the first bidding, each wrong in exactly one way:
   - after the host has bid, `game.bid` again with a `seat` field naming the next seat and the
     right `at`: `err` `NOT_YOUR_TURN`;
   - `game.play` with a card of the sender's hand and the right `at`, while everyone is bidding:
     `err` `NOT_YOUR_TURN`;
   - `game.bid` with `bid: 99` and the right `at`, from a seat that has not bid: `err`
     `BID_OUT_OF_RANGE`.
   After them the host's bid is unchanged, the second seat still has its bid to make, and no
   `game.update` anybody received has a `bidPlaced` of the second seat.
6. A whole game: five rounds of five cards. For every `game.bid`, `game.play` and `game.ready` a
   page sent and got `ok` for, the next frame on that socket is a `game.update`. After a page's
   last `welcome` its `rev`s count up by one.
7. In the second round, on its turn with a card already on the table, one page reloads. It sends
   `hello` and nothing else, gets a `welcome` whose `game.update` has `events: []` and a `rev`
   above the last one it saw, and shows the same hand and the same trick without a tap. The other
   pages see `seatStatus` `offline` and then `online` for that seat, as the first two status events
   of that seat.
8. At the end every page shows the final scores, has received exactly one `game.over` with
   `totals` of length 5 that are the same for all, and with `seat` equal to its own seat.
9. "Play again" on each page lands in the lobby, open again with nobody ready.

No page may log an error on the way.

HOLES IN `docs/protocol.md`

None. Two things the script found that are not holes, for your information:
- §5.5 does not say how seats follow from `members`. The client does not need to know. The mock
  seats in join order, and the script does not rely on it.
- §2 lists the `Origin` check. What the development allow-list holds is yours to choose. See the
  port above.

WHERE THE MOCK IS NOT THE SERVER, NEW IN THIS PACKAGE

- `web/e2e/mockHost.ts` checks no `Origin`, never expires a session, and answers
  `POST /auth/guest` with the mock's own `Me`. It has `/health`, `/auth/guest` and the socket, and
  404 for every other path.
- Behind the mock host the pause after a trick is 0.7 s and a bot moves after 0.25 to 0.5 s, so a
  game takes a minute. The deadlines are the standard ones. Against your server the script takes
  as long as your clocks do. Its limit for the game is eight minutes.

YOUR TASK

G3–G7 are yours to start when the owner opens them. This package asks for no server code.

1. Read "What the script expects of the server" against what G3, G4 and G5 will do. Name every
   expectation the server will not meet as written, with the section of `docs/protocol.md` that
   says otherwise, so the script or the contract is changed before the two meet. Do not edit
   `web/`.
2. Say what the development `Origin` allow-list will be, and whether the script should pin its
   port.
3. Decide whether CI runs `npm run e2e`. It needs a browser on the runner
   (`npx playwright-core install --with-deps chromium`) and, for the real target, your server
   started first. `.github/` is yours. If it should not run in CI yet, say so.
4. Tell the owner the merge order: `feature/grok-c7-contract`, then `feature/claude-four-players`.
   The second contains `feature/claude-online-table`, `feature/claude-online-lobby` and
   `feature/claude-table-async`, and is not behind `dev`. Do not merge without the owner saying so.
5. Run the web gate from `web/` on `feature/claude-four-players` and report the counts, and
   `npm run e2e` if a Chrome or Edge is installed where you run it.

CONTRACTS

- Frozen: every message name, field and error code; `docs/engine-conformance.md` §3–§5; the 41
  fixtures; `legacy/Skull King Tavern.html`. `protocol` stays 1.
- Changed by Claude in this package: nothing in `docs/protocol.md`, `skt-protocol`,
  `web/src/protocol/generated/` or `fixtures/`.
- The seat of an online action still comes from the session. The client never sends `seat`. The
  script sends one once, as a cheater would, and expects it not to be read.
- You may change `docs/protocol.md` as the protocol rule says, with a handover. You may not edit
  `web/` (except the generated tree) or `design/`.

DONE WHEN

- From `web/` on `feature/claude-four-players`: `npx vp check`, `npx vp test` (293 passed) and
  `npx vp build` pass, and `node scripts/generate-engine-fixtures.mjs --check` prints that the
  fixtures match.
- `npm run e2e` passes against the mock host where a browser is installed, or the handover says
  there is none.
- Each expectation of the script is confirmed, or named with what the server will do instead.

REPORT BACK

Write `docs/handover/023-grok-to-claude-<slug>.md` and print the same text in one fenced code
block. It must itself be a paste-ready prompt for Claude ("You are Claude"), with who and where,
state (branch, commit, what the gates printed), a numbered task, contracts, done when, and report
back. Include: every expectation of the script the server will not meet, or "None"; the
development origin list; whether CI runs the script; the merge order; and what Claude does next.
