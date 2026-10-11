You are Grok, the server engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the Rust server, Compose, deploy
files and CI, and the generated protocol tree. Claude writes `web/`, `design/` and `fixtures/engine/`
and never edits `server/`. You and Claude cannot see each other's sessions: the owner pastes
handover prompts between you. This is handover 020, the answer to your 019. Plan item C7 is built
against the mock server. C8 was not started: it needs the real server. Nothing in `server/`,
`.github/`, `fixtures/`, `legacy/` or `docs/protocol.md` was touched.

READ FIRST, IN THIS ORDER
1. `AGENTS.md`, then `docs/agent-rules/protocol-contract.md`, `server-authority.md` and
   `ownership-and-handover.md`.
2. `docs/protocol.md` §5.5 and §5.6 on your branch `feature/grok-reply-order` (`5655579`).
3. On `feature/claude-online-table`: `web/README.md`, section "Online". Then
   `web/src/table/remoteTable.ts` (how the client reads `table.status`, `table.ready` and
   `table.deadline`) and `web/src/net/online.ts` (what a page does after a reload).

STATE

Branch `feature/claude-online-table`, in the worktree
`/Users/nvorberg/Documents/development/skt-claude-online`. It was cut from
`feature/claude-online-lobby`, as 019 said to do while that branch is not on `dev`, so it contains
C4, C5 and C6 as well. The C7 code is commit `f405f31`
(`ADD: Show the deadline, who is at the table and a lost connection online, …`). This handover is
the next commit on that branch. The branch is local, not pushed, and not on `dev`. `dev` is still
`02da4cc`.

Since 018, `feature/claude-online-lobby` has one more commit: `78a00c3`, `design/web.pen` with the
hub, the lobby screens and the leave sheet, saved by the owner. Before it was committed, the 55
frames that were in the file before were checked to be where and what they were. Merging
`feature/claude-online-table` brings everything; `feature/claude-online-lobby` does not need a merge
of its own any more.

The gate, run from `web/` on `f405f31`, Node as installed here:
- `npx vp check`: all 73 files formatted; no warnings, lint errors or type errors in 66 files.
- `npx vp test`: 22 files, 292 tests passed. That includes the whole parity suite: offline, the
  table's markup is the legacy page's to the letter.
- `npx vp build`: passed. The production bundle does not contain the mock server.
- `node scripts/generate-engine-fixtures.mjs --check`: "fixtures/engine matches the generator (41 games)."

In a browser against the mock (`npm run dev`, the page with `?mock` added, 390 px):
- A private table with one bot was started. The bid deadline showed as a ring around this seat's
  avatar and emptied (13 % gone six seconds in, of a 45 s clock). The bot's seat had none.
- Bid 2. On this seat's turn, with the bot's card on the table, the page was reloaded. It came back
  to the table without a tap: the same six cards, the same trick, "Your turn", and the play clock
  running on (26.7 s left of 30). No overlay, no console errors.
- The X asked "Leave the table?", "Leave table" took the table down and landed on the hub.
- Offline solo still passes: "New game", "Set sail", bid 0, played the one card, and the round
  result came up ("Zero hero!"). It has no ring, no tag and no online note.
- Not seen with two people in a browser, because every page has a mock of its own: the presence
  tags and the reconnect card on a live table. Both are covered by tests on the page's DOM, and the
  card's styling was looked at with its markup put into the page by hand.

The tests 019 asked for:
- The ring: `web/src/tableview/online.test.ts` ("draws a ring on every seat the deadline names …")
  and `web/src/online/OnlineScreens.test.tsx` ("shows the bid deadline as a ring on both people …",
  which also lets the deadline pass and sees the server's bid and "Time ran out").
- A seat going `offline`: `OnlineScreens.test.tsx` ("tags the friend as offline when their
  connection drops …") and `online.test.ts` (offline, away, bot, and back).
- The ready waiting state: `online.test.ts` ('waits after "ready" until the others are …').
- A reload that returns to the same hand: `OnlineScreens.test.tsx` ("goes straight back to the
  table and the same hand, without being asked"), with a mock that is made anew from its store, and
  `web/src/net/mock/server.test.ts` ("finds the table where it was after it is made anew …").
- A `game.over` after a `welcome` with `game: null`: `OnlineScreens.test.tsx` ("shows the result of
  a game that ended while the page was away, and opens no table for it", and the same for a seat
  that was left) and `web/src/net/online.test.ts`.

Not done:
- `design/web.pen` holds the C7 controls only in the running Pen app. They are not on disk, and so
  not in a commit, until the owner presses ⌘S in Pen. Drawn at y 11500–11600 under "Online · at the
  table", light and dark: the table with the bid on the clock, the seat states (on the clock, last
  five seconds, offline, away, a bot took the seat, ready), the action panel states (waiting after
  ready, time ran out), the table with the reconnect card, the three cards of that overlay, and the
  round results with the online note. "Online · hub states" has one more notice.
- C8.

WHAT C7 READS FROM THE WIRE

Nothing new is sent. From every `game.update` and from `welcome.game.update` the client now reads
`table.status`, `table.ready` and `table.deadline`, and the events `seatStatus` and `timedOut`.

- `table.deadline`: a ring on each seat in `seats`, from `at` and the server clock (`serverTime` on
  `welcome` and on every `ping`). When it is empty the page does nothing: the move is the server's.
- `table.status`: `offline`, `away`, and `bot` on a seat whose `SeatInfo.bot` was false, each get a
  tag. `online`, and `bot` on a seat that started as a bot, get none.
- `table.ready`: during `roundEnd`, a ready seat shows "Ready". After this seat's `game.ready` the
  page counts the seats that are not ready and whose status is `online` or `away`, and says
  "waiting for N more".
- `timedOut`: "Time ran out · the table played for you" for the receiver's seat, "<name> ran out of
  time" for another.
- After a reload the page sends `hello` and nothing else, and goes where `welcome` says.

HOLES IN `docs/protocol.md`

No message is missing and nothing stopped the work. Three places where the client had to decide
something the text does not say:

1. How long a deadline's clock runs. `Deadline` has `at` and no start, and a ring is a share of a
   whole. The client takes the whole to be what is left when the step that brought the deadline
   arrives. For a clock it meets while it runs (the snapshot in `welcome`) it assumes the standard
   length of §5.6, scaled by `settings.pace`, or what is left if that is more. If the running
   server's timers are not the standard ones, the ring is wrong after a reconnect until the next
   deadline. `GET /config` has the timers, but the page does not fetch it, and the mock has no REST.
   Either say that the timers of a game are always §5.6 scaled by `pace`, or consider an additive
   field later (the clock's length on `Deadline`). The client works without either.
2. Whose seat a `game.over` is about. `GameResult` has `places` per seat and does not say which
   seat the receiver had. At an open table the client knows. For a result that arrives after a
   `welcome` with `game: null` it knows only if the same device remembers the seat (it keeps that in
   localStorage). On another device, or with storage cleared, the notice says the game is over and
   cannot say the place. An additive `seat` on `game.over` would close it.
3. Who is waited for at the end of a round. §5.5 says the advance comes "when every connected human
   is ready". The client reads `away` as connected and `offline` as not, and counts the first as
   waited for. The mock waits for every seat that has a socket. Say whether `away` is waited for.

Read, not a hole: `timedOut` is taken to travel in the same `game.update` as the move the server
made, after the engine's events. That is what the mock writes.

WHERE THE MOCK IS NOT THE SERVER, NEW IN THIS PACKAGE

- It keeps its lobbies and games in a store (sessionStorage behind `?mock`) and is made anew from it
  after a reload. On the way back every seated player is `offline`, one step per seat, without the
  socket ever having closed. A deadline that passed in between is played at once.
- `transport(session)` names a player the way the cookie does. Without a session it is a new guest.
- Still none of: the 60 s grace and the step to `bot`, `away` after two missed deadlines, ranked.

YOUR TASK

Your column of Phase 1 (G3–G7) stays closed unless the owner opens it.

1. Answer the three holes: write the answer into `docs/protocol.md` on your branch, or say in the
   return handover why it stays open. For 1 and 2, say whether you want the additive field, and if
   so in which package. `protocol` stays 1 either way.
2. Check the reading under "What C7 reads from the wire" against what G5 and G6 will write: the
   order of `timedOut` within an update, what `table.ready` holds for bot seats (the client expects
   `false` and does not wait for them), and what `table.status` holds for a seat during the grace
   period. Report differences. Do not edit `web/`.
3. Run the web gate from `web/` on `feature/claude-online-table` and report the counts.
4. Tell the owner the merge order again, now with three branches: `feature/grok-reply-order`, then
   `feature/claude-online-table`, which contains `feature/claude-online-lobby` and
   `feature/claude-table-async`. Do not merge without the owner saying so.
5. Say what C8 needs from you before Claude can start it: which of G3–G7, and how the browser test
   reaches the server (Compose service, port, how four guests get four sessions).

CONTRACTS

- Frozen: every message name, field and error code; `docs/engine-conformance.md` §3–§5; the 41
  fixtures; `legacy/Skull King Tavern.html`. `protocol` stays 1.
- Changed by Claude in this package: nothing in `docs/protocol.md`, `skt-protocol`,
  `web/src/protocol/generated/` or `fixtures/`.
- Changed in `web/`, for your information and not on the wire: `TableView` has an optional
  `online` (`status`, `ready`, `deadline` with the clock's length), a table's listener is handed
  `GameEvent`s instead of `EngineEvent`s, and the page keeps `skullking-tavern.online.v1` in
  localStorage (whether it was seated, and the seat it had in a running game). No token is stored.
- You may change `docs/protocol.md` as the protocol rule says, with a handover. You may not edit
  `web/` (except the generated tree) or `design/`.

DONE WHEN

- From `web/` on `feature/claude-online-table`: `npx vp check`, `npx vp test` (292 passed) and
  `npx vp build` pass, and `node scripts/generate-engine-fixtures.mjs --check` prints that the
  fixtures match.
- From `server/` on your branch: `cargo test -p skt-protocol` still passes with a clean
  regeneration, unless you add a field, in which case the generated TypeScript and
  `fixtures/protocol/` change in the same commit.
- Each of the three holes has an answer in `docs/protocol.md` or a reason in the handover.

REPORT BACK

Write `docs/handover/021-grok-to-claude-<slug>.md` and print the same text in one fenced code
block. It must itself be a paste-ready prompt for Claude ("You are Claude"), with who and where,
state (branch, commit, what the gates printed), a numbered task, contracts, done when, and report
back. Include: the answer to each of the three holes, with the section it went into; every
difference between what C7 reads and what the server will write; the merge order; and what Claude
does next, C8 or something else, with what it needs to exist first.
