You are Grok, the server engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the Rust server, Compose, deploy
files and CI, and the generated protocol tree. Claude writes `web/`, `design/` and `fixtures/engine/`
and never edits `server/`. You and Claude cannot see each other's sessions: the owner pastes
handover prompts between you. This is handover 018, the answer to your 017. Plan items C5 and C6
are built against a mock server in the page. Nothing in `server/`, `.github/`, `fixtures/`,
`legacy/` or `docs/protocol.md` was touched.

READ FIRST, IN THIS ORDER
1. `AGENTS.md`, then `docs/agent-rules/protocol-contract.md`, `server-authority.md` and
   `ownership-and-handover.md`.
2. `docs/protocol.md` §5.2, §5.3 and §5.5 on your branch `feature/grok-reply-order` (`f9fc639`).
3. On `feature/claude-online-lobby`: `web/README.md`, section "Online". Then
   `web/src/net/mock/server.ts` (what the client was built against) and
   `web/src/net/mock/server.test.ts` (the same rules as checks on frames: they are the ones your
   table task has to pass).
4. `web/src/table/remoteTable.ts` and `web/src/net/socket.ts`, for how the client reads the frames.

STATE

Branch `feature/claude-online-lobby`, in the worktree
`/Users/nvorberg/Documents/development/skt-claude-online`. The code is commit `5058221`
(`ADD: Play a private table online: …`). This handover is the next commit on that branch. The
branch is local, not pushed, and not on `dev`. `dev` is still `02da4cc`.

Deviation from 017, which said "one branch cut from `dev`": the branch was cut from `dev` and then
fast-forwarded onto `feature/claude-table-async` (`78dc34f`). `RemoteTable` needs `Table.localSeats`
and the asynchronous `dispatch`, and those exist only there (C4, handover 014). So merging this
branch brings C4, and handovers 014 and 016, with it. `feature/claude-table-async` does not need a
merge of its own any more. Your `feature/grok-reply-order` still does: this branch does not contain
the three paragraphs of `f9fc639`, it only reads them.

The gate, run from `web/` on `5058221`:
- `npx vp check`: 71 files formatted, no warnings, lint errors or type errors in 64 files.
- `npx vp test`: 22 files, 270 tests passed. That includes the gate of handover 014 and the whole
  parity suite (solo, pass-and-play, scorekeeper, sound).
- `npx vp build`: passed. The production bundle does not contain the mock server.
- `node scripts/generate-engine-fixtures.mjs --check`: "fixtures/engine matches the generator (41 games)."

In a browser (`npm run dev`, then the page with `?mock` added, at 390 px dark and 360 px light):
- Online against the mock: home, "Play online", "Create a table", "Create table", "Add a bot",
  "I'm ready", "Start game", bid 1 at the existing table. The bot bid on the mock's clock, the bids
  were revealed, and it was this seat's turn. The X asked "Leave the table?", "Leave table" took the
  table down and landed on the hub. No console errors.
- Offline solo still passes: "Play", "Set sail", bid 0, played the one card, and the round result
  sheet came up ("Zero hero!", +10). A reload then offered "Continue · Round 1 of 10".

Not done:
- `design/web.pen` holds the new screens only in the running Pen app. They are not on disk, and so
  not in a commit, until the owner presses ⌘S in Pen. Drawn at y 9500–9600 under "Online · private
  tables", light and dark: hub, hub states, new table, table rules (host), join a table, join with a
  wrong code, table (host), table (guest), sheet "leave table", end of an online game. The four Home
  frames have the new "Play online" button.
- C7 and C8 are not started, as 017 said: no deadline ring, presence badges, waiting state after
  "ready", reconnect overlay, or browser test against a real server. A page reload does not
  reconnect by itself.

WHERE THINGS LIVE

| What | File |
| ---- | ---- |
| Socket client: hello, ok then welcome, one reply per id, server clock, backoff | `web/src/net/socket.ts` |
| The union of server frames, from the generated types | `web/src/net/messages.ts` |
| The real transport: `POST /api/v1/auth/guest` once, then `/api/v1/ws` | `web/src/net/transport.ts` |
| The dev switch (`?mock`, development builds only) | `web/src/net/connect.ts` |
| Online state: link, `me`, lobby, table, notice. The lobby intents | `web/src/net/online.ts` |
| `RemoteTable implements Table` | `web/src/table/remoteTable.ts` |
| Mock server | `web/src/net/mock/server.ts` |
| A bare frame-by-frame client for tests | `web/src/net/mock/raw.ts` |
| Lobby screens (React) | `web/src/online/` |
| The renderer's online hooks (leave sheet, lock, take-down) | `web/src/tableview/actions.ts`, `state.ts`, `views.ts` |

The tests 017 asked for, all in `web/src/net/mock/server.test.ts` unless named:
- The pair order: every accepted `game.bid`, `game.play` and `game.ready` of two humans through a
  whole game is `ok` and then, as the next frame, that step's `game.update`. Revisions count up by
  one on every socket. `game.over` follows the final update once.
- An `err` with no update: `NOT_YOUR_TURN`, `BID_OUT_OF_RANGE`, `STALE_ACTION`, `ILLEGAL_MOVE`,
  `VALIDATION`. Nothing follows on the sender's socket and nothing reaches the other seat. A bid
  that names another seat lands on the sender's seat.
- A reconnect that drops old ids: `web/src/net/socket.test.ts` (ids end with the socket, nothing is
  sent again, ids are never reused) and `web/src/table/remoteTable.test.ts` (a bid whose answer was
  lost is in `welcome.game`; a bid the server never read is absent, and is still not sent again).
- A leave that stops `game.update` and still delivers `game.over`: with a socket, and without one
  (then right after the next `welcome`, which has `game: null`).
- A second seat that never receives the first seat's hand: every update of a whole game, key by key.

WHAT THE CLIENT RELIES ON

It sends `hello`, `ping`, `lobby.create`, `lobby.join` (by `code`), `lobby.leave`, `lobby.ready`,
`lobby.settings`, `lobby.addBot`, `lobby.removeBot`, `lobby.start`, `game.bid`, `game.play`,
`game.ability`, `game.ready` and `game.leave`. It never sends a seat, `lobby.kick`, `queue.*` or
`game.emote`. It reads `ok`, `err`, `welcome`, `superseded`, `lobby.state`, `lobby.closed`,
`game.start`, `game.update` and `game.over`, and ignores `queue.status` and `game.emote`.

HOLES IN `docs/protocol.md`

No message is missing: nothing stopped the work. These are places where the text does not say what
the server does. For each one the mock does what is written here, and the client works either way
unless it says otherwise.

1. The first `game.update` after `game.start`. The text does not say that one follows, nor its `rev`
   or `events`. The client cannot draw a table from `game.start` alone, so it waits for the first
   `game.update` with that `gameId`, opens the table with its view, and does not present its events.
   The mock writes `lobby.state` (`inGame`), `game.start`, `game.update` with `rev: 0, events: []`.
   The client needs this one: without an update after `game.start` no table opens.
2. `lobby.state` to the sender. §5.3 says "to every member on any change". The client reads that as
   including the member who caused the change: `ok` for `lobby.ready`, `lobby.settings`,
   `lobby.addBot` and `lobby.removeBot` carries no lobby, so the sender's screen changes only with
   that push. The client needs this one.
3. The lobby after `game.leave`. §5.5 says the seat is a bot and a later `welcome` has `game: null`.
   It does not say whether the leaver is still a member of the lobby, or what tells them. The client
   drops its lobby when the table comes down. The mock removes the member, makes the next human host
   and pushes `lobby.state` to those who stay. If the server keeps the leaver in the lobby, its next
   `lobby.state` puts the lobby screen back, which also works.
4. `at.trick`. "Tricks already completed" is taken as the sum of `won` plus `destroyed` of the
   current round's record, so a trick the Kraken took counts, and so does the trick on the table
   during `trickEnd`. A different count makes every play after the first destroyed trick
   `STALE_ACTION`. The client needs the two sides to agree.
5. `game.ready` before everybody is ready. The mock answers `ok`, then a `game.update` with
   `events: []` and the new `table.ready`. The `advance` is a later step of its own.
6. `game.over` for a seat that was not left but had no socket when the game ended. §5.5 owes it to a
   leaver. The mock owes it to this seat too, right after the next `welcome`. The client shows it as
   a notice on the hub in both cases.
7. `forfeited` outside ranked. The mock writes `forfeited: []` when a seat was left in a custom game.
8. A socket that comes or goes during a game. The mock writes it as a step of its own: `rev + 1`,
   one `seatStatus` event, to every seated socket, the returning one included after its `welcome`.
9. `lobby.leave` while the lobby is `inGame`. The mock answers `LOBBY_STARTED`.

YOUR TASK

Your column of Phase 1 (G3–G7) stays closed unless the owner opens it. This package is a review
and the contract.

1. Read the holes above. For each, either write the answer into `docs/protocol.md` (§5.3 or §5.5)
   on your branch, or say in the return handover why it stays open. Additive wording only:
   `protocol` stays 1, and no message, field or error code changes. Where your answer differs from
   what the mock does, name the test in `web/src/net/mock/server.test.ts` that has to change.
2. Check the mock against what you intend for G4 and G5. Report every place where
   `web/src/net/mock/server.ts` does something the real server will not: order of frames, error
   codes, what `welcome` holds. Report it. Do not edit `web/`.
3. Run the web gate from `web/` on `feature/claude-online-lobby` and report the counts. If
   `.github/workflows/` needs a change for the new tests (they need nothing but `npm ci`), say so.
4. Tell the owner the order in which `feature/grok-reply-order` and `feature/claude-online-lobby`
   should reach `dev`. They touch different files: yours `docs/protocol.md` and `docs/handover/`,
   this one `web/` and `docs/handover/`. Do not merge either without the owner saying so.

CONTRACTS

- Frozen: every message name, field and error code; `docs/engine-conformance.md` §3–§5; the 41
  fixtures; `legacy/Skull King Tavern.html`. `protocol` stays 1.
- Changed by Claude in this package: nothing in `docs/protocol.md`, `skt-protocol`,
  `web/src/protocol/generated/` or `fixtures/`.
- Changed in `web/`, for your information: `Table`'s listener takes a third argument
  (`UpdateInfo { unlock, last }` in `web/src/table/table.ts`), and `DispatchCode` gained `OFFLINE`.
  Both are the client's own and are not on the wire.
- You may change `docs/protocol.md` as the protocol rule says, with a handover. You may not edit
  `web/` (except the generated tree) or `design/`.

DONE WHEN

- From `web/` on `feature/claude-online-lobby`: `npx vp check`, `npx vp test` (270 passed) and
  `npx vp build` pass, and `node scripts/generate-engine-fixtures.mjs --check` prints that the
  fixtures match.
- From `server/` on your branch: `cargo test -p skt-protocol` still passes with a clean
  regeneration, since no Rust type changes.
- Every hole above has an answer in `docs/protocol.md` or a reason in the handover.

REPORT BACK

Write `docs/handover/019-grok-to-claude-<slug>.md` and print the same text in one fenced code
block. It must itself be a paste-ready prompt for Claude ("You are Claude"), with who and where,
state (branch, commit, what the gates printed), a numbered task, contracts, done when, and report
back. Include: the answer to each of the nine holes, with the section of `docs/protocol.md` it
went into; every difference between the mock and the server you intend; the merge order you
recommend to the owner; and whether Claude's next package is C7 and C8 against the mock, or waits
for G3–G7.
