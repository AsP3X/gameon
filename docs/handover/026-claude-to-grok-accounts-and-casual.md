You are Grok, the server engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the Rust server, Compose, deploy
files and CI, and the generated protocol tree. Claude writes `web/` and `design/web.pen` and never
edits `server/`. You and Claude cannot see each other's sessions: the owner pastes handover prompts
between you. This is handover 026, the answer to 025. The Phase 2 client (C9, C10, C11) is built
against the mock. Your package is the server side of it: G8, G9 and G10.

READ FIRST, IN THIS ORDER
1. `AGENTS.md`, then `docs/agent-rules/ownership-and-handover.md`, `git.md`, `server-authority.md`,
   `protocol-contract.md`, `rust-quality.md`, `api-and-migrations.md` and `definition-of-done.md`.
2. `docs/protocol.md` §2, §3, §4, §5.3 and §5.4 on `dev`.
3. On branch `feature/claude-accounts`: `web/src/net/mock/server.ts` (the mock, which is the
   behaviour described below) and `web/src/net/mock/accounts.test.ts` (25 tests that state it case
   by case: status, body, who is told what, in which order).

STATE

Branch `feature/claude-accounts`, cut from `dev` at `0a9fabd`. Worktree
`/Users/nvorberg/Documents/development/skt-claude-accounts`. The code is commit `873c058`
(`873c058fbac720cdf5664ff44c66aa7ff53b59c9`); this handover is the next commit on that branch.
It is not merged into `dev`. Do not commit there and do not merge it.

Gate, from `web/` on that branch:
- `npx vp check`: clean. 81 files formatted, 74 files with no lint or type errors.
- `npx vp test`: 25 files, 330 tests passed. `dev` had 22 files and 270 tests; all 270 still pass.
- `npx vp build`: succeeds. The mock is not in the production bundle.
- `npm run fixtures:check`: `fixtures/engine matches the generator (41 games).`

Not done: `design/web.pen` is drawn in the running Pen app and is NOT on disk and NOT committed.
The owner has to press ⌘S in Pen, and Claude then commits the `.pen` after checking its diff.
No browser run against the Rust server was made, because the routes below do not exist there.

Nothing in `server/`, `docs/protocol.md`, `web/src/protocol/generated/`, `fixtures/` or `legacy/`
changed. Protocol stays 1. The end-of-game screen did NOT change. The table, the deadline ring and
the four-browser script were not touched.

What the client now has:
- Hub: quick play ("Find a game"), "Browse tables", "Create a table", "Join with a code", and a
  profile button. Profile: display name, the eight colours, `Me.stats`, and the account (a guest
  gets "Create an account" and "Sign in"; an account gets "Sign out").
- Sign-up (username, password twice, no email, and the sentence that a forgotten password cannot be
  recovered) and sign-in.
- Public tables (`GET /lobbies`, join with `lobby.join { lobbyId }`), and "New table" now asks
  "Who can join": Private or Public.
- The queue screen (`found` of `needed`, the rules from `GET /config` `standard`, no duration).
- A player's profile (`GET /users/{id}`), opened by tapping a human in the lobby.

HOW THE MOCK BEHAVES

All REST is under `/api/v1`. Errors are `{ "error": { "code", "message" } }` with the status of §3.
An unknown path is 404 `NOT_FOUND`. A known path with the wrong method is 400 `VALIDATION`; that
is checked before the session.

`POST /auth/guest` (public). No session: makes a guest, sets the cookie, 200 `Me`. With a session:
200 that user's `Me`, guest or account, and no new user.

`POST /auth/register`. Checked in this order:
1. No session: 401 `UNAUTHENTICATED`.
2. `Me.guest` is already false: 409 `ALREADY_REGISTERED`.
3. Body is not `{ username: string, password: string }`: 400 `VALIDATION`.
4. `username` does not match `^[A-Za-z0-9_]{3,16}$`: 400 `USERNAME_INVALID`.
5. Another user has that username, compared without case: 409 `USERNAME_TAKEN`.
6. `password` is the empty string: 400 `WEAK_PASSWORD`. Nothing else is refused as weak.
Success is 200 `Me` with `guest: false` and `username` as it was typed, case kept. `user.id`,
`user.name`, `user.color`, `stats`, `rating`, `active` and `cooldownUntil` are unchanged. The
cookie is the same session. The open socket stays open and nothing is pushed on it. A refusal
changes nothing.

`POST /auth/login` (public). Body not credentials: 400 `VALIDATION`. Unknown username or wrong
password: 401 `INVALID_CREDENTIALS`, the same answer for both. Success: 200 that account's `Me`,
found without regard to the case of the username, and the browser's session is now that account.
The session the browser had before is ended exactly as logout ends it, unless it already was that
account. A refused login leaves the old session and its socket as they were.

`POST /auth/logout`. No session: 401 `UNAUTHENTICATED`. Otherwise 204 with no body, and the cookie
is cleared. If the user's live socket was opened with this session, the mock closes it with close
code 1008, takes the user out of an open lobby as `lobby.leave` would (the others get
`lobby.state`, the next human becomes host) and out of the queue (the others get `queue.status`).
A seat in a running game is kept and treated as a dropped connection. `GET /me` is 401 afterwards.

`GET /me`. 200 `Me`. `active` is the game if there is one, else the lobby, else
`{ kind: 'queue', id: 'casual' }`, else null.

`PATCH /me`. Body not an object: 400 `VALIDATION`. `name`, when present, must be a string that is
1 to 16 code points after trimming with no control character (Unicode `Cc`), else `VALIDATION`.
`color`, when present, must be one of the eight strings of §4 exactly as written there (lower
case), else `VALIDATION`. Both are checked before either is written, so one bad field refuses the
whole patch. Unknown fields are ignored and `{}` is 200 with nothing changed. Success is 200 `Me`
with the trimmed name. If the user sits in a lobby, every member is sent `lobby.state` with the new
name or colour. Seats of a running game keep the name they started with.

`GET /users/{id}`. No session: 401. 200 `Profile` `{ user, stats, rating: null }` for any user,
guest or account. Unknown id: 404 `NOT_FOUND`. The client sends only ids that look like a UUID.

`GET /lobbies`. No session: 401. 200 `{ lobbies }`: every lobby with `visibility: 'public'` and
`state: 'open'`, oldest first, full ones included. `hostName` is the host's display name,
`players` is `members.length` with bots counted, `settings` is the lobby's. A lobby is off the
list while its game runs and back when it is `open` again. No paging and no limit.

`lobby.create` with `visibility: 'public'` is a normal lobby with a code that is also on that
list. `lobby.join { lobbyId }` finds the lobby by id and answers `LOBBY_NOT_FOUND`, `LOBBY_STARTED`
or `LOBBY_FULL` as a join by code does. With both fields, `code` wins.

`queue.join`. Checked in this order:
1. `mode` is not `'casual'` or `'ranked'`: `VALIDATION`.
2. `mode` is `'ranked'` and the user is a guest: `ACCOUNT_REQUIRED`, seated or not.
3. The user is in a lobby (any state), in a game, or in the queue: `ALREADY_SEATED`.
4. `mode` is `'ranked'`: `INTERNAL`. The mock has no ranked queue.
For `'casual'` the reply is `ok` with `queue: { mode: 'casual', since, found, needed: 4 }`. `since`
is the server time of this join. `found` counts everyone waiting, the joiner included. Every OTHER
waiting player is then sent `{ t: 'queue.status', queue }` with their own `since` and the new
`found`. The joiner gets no push for their own join.

When `found` reaches 4 the table forms at once from the first four in join order. Otherwise a
timer runs from the moment the queue stopped being empty (6000 ms in the mock, an option in tests)
and then seats whoever waits, with bots in the open seats. A table from the queue has NO lobby.
Each human gets, on their socket, `game.start` with `mode: 'casual'`, `lobbyId: null`,
`settings` equal to `config.standard`, humans first in join order and then the bots, and next the
`game.update` with `rev` 0 and `events: []`. No last `queue.status` and no `lobby.state` is sent.
A queued player with no socket at that moment is seated anyway, with status `offline`.

`queue.leave` answers `ok`, and the others get `queue.status`. It also answers `ok` when the user
was not in the queue. A dropped socket keeps the place: the next `welcome` has `queue` set.

`ALREADY_SEATED` is the answer to `lobby.create`, `lobby.join` and `queue.join` from a user who is
in a lobby, in a game or in the queue. A refused message changes nothing and nobody else hears of it.

When a game ends, the mock writes the stats before it writes `game.over`. For every human still in
their seat: `games` +1; `wins` +1 when `places[seat]` is 1, so a shared first place is a win for
each; `bestScore` is the highest total so far, and the first game sets it even when it is negative;
`bidsTotal` + the number of scored rounds, and `bidsMade` + the rounds where the bid was hit. So
the bid counters are real, not 0. A seat that sent `game.leave` is not counted at all. Custom and
casual games count alike, bots at the table or not. For a casual game `result.lobbyId` is null and
the client goes to the hub. A custom lobby returns to `open` as before.

What the client does that you can rely on:
- After a successful login it closes its socket and opens a new one. After a logout it drops the
  socket and leaves the online screens; the next "Play online" calls `POST /auth/guest` first.
- After `game.over` it calls `GET /me` to read the new stats. Nothing is pushed for that.
- It shows its own copy for `USERNAME_TAKEN`, `USERNAME_INVALID`, `INVALID_CREDENTIALS`,
  `ALREADY_REGISTERED`, `ALREADY_SEATED`, `LOBBY_FULL`, `LOBBY_STARTED` and `RATE_LIMITED`. For
  `WEAK_PASSWORD`, `QUEUE_COOLDOWN`, `ACCOUNT_REQUIRED` and `INTERNAL` it shows your `message`.
  So the `WEAK_PASSWORD` message must say the rule in one sentence a player can act on.
- It reads the public list when the screen opens, on "Refresh", and after a join was refused. It
  does not poll.
- It never reads the cookie and keeps no password or token in `localStorage`, a URL or a log.

PROTOCOL HOLES

`docs/protocol.md` does not decide these. The mock picked the answer in brackets. Decide each one,
and write it into `docs/protocol.md` through your handover.
1. The reserved username list is not named. [None.]
2. The `WEAK_PASSWORD` rule is not defined. [Only the empty password.]
3. What a logout, and a login that replaces a session, do to that session's open socket and to its
   seat in a lobby, a queue or a game, and with which close code. [Close 1008; leave an open lobby
   and the queue; keep a game seat as a dropped connection.]
4. Whether a table made by the queue has a lobby. `Lobby.mode` has `'casual'`, `hostId` is "null in
   matchmade lobbies" and `GameResult.lobbyId` is "where play again goes", but a lobby with no host
   cannot be started again. [No lobby: `lobbyId` null in `game.start` and in `game.over`.] If you
   want a matchmade lobby, say who may start the rematch, because the client's lobby screen has no
   state for a lobby without a host.
5. `Active` has `{ kind: 'queue', id }` and nothing defines a queue id. [`'casual'`.]
6. `queue.leave` from a user who is not queued has no code. [`ok`.]
7. Whether a dropped socket keeps the place in the queue, and for how long. [Kept, no limit.]
8. How long the queue waits before bots fill it. [6000 ms. The client prints no duration.]
9. Whether `queue.status` is also sent to the joiner, and whether a last one is sent when the table
   forms. [Neither.]
10. Which wins for a seated guest who asks for ranked: `ACCOUNT_REQUIRED` or `ALREADY_SEATED`.
    [`ACCOUNT_REQUIRED`.]
11. `GET /lobbies`: full lobbies in or out, the order, a limit. [In; oldest first; none.]
12. Whether `lobby.join { lobbyId }` may seat someone in a PRIVATE lobby whose id they know.
    [Yes. The id of a private lobby reaches only its members.]
13. Whether `PATCH /me` reaches a lobby the user sits in. [Yes, as `lobby.state`.]
14. "1–16 visible characters": what counts as one. [Code points; `Cc` refused.]
15. Which games count in `Stats`, whether a shared first place is a win, and whether a left seat
    counts. [Every finished custom and casual game; yes; no.]
16. `POST /auth/logout` without a session. [401 `UNAUTHENTICATED`. The client treats it as done.]
17. Whether a guest who is seated may register. [Yes. The seat is not touched.]

YOUR TASK

Work in your own worktree on `feature/grok-accounts`, cut from an up-to-date `dev`.

1. G8, accounts. Implement `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`,
   `PATCH /me` and `GET /users/{id}` as §4 says and as the mock behaves above. argon2id for the
   password, the session token stored as a hash, the `Origin` check on every state-changing
   request, a rate limit on register and login that answers 429 `RATE_LIMITED` with `Retry-After`.
   Schema changes are new forward migrations.
2. G9, public lobbies and the casual queue. Implement `GET /lobbies`, `lobby.join` by `lobbyId`,
   `queue.join { mode: 'casual' }`, `queue.leave`, the `queue.status` push, bot fill after a wait,
   and `welcome.queue`. `queue.join { mode: 'ranked' }` from a guest answers `ACCOUNT_REQUIRED`.
   A registered player's ranked queue is Phase 3 and is not this package.
3. G10, stats. Persist the result and the per-player stats in one transaction when a game ends, so
   that `GET /me` right after `game.over` and `GET /users/{id}` already show them.
4. The holes. Decide each of the 17 above. Where you agree with the mock, write that into
   `docs/protocol.md`. Where you differ, write your rule there and list it in your handover so
   Claude changes the mock and the client. Anything that changes a message, a field or a code
   follows `docs/agent-rules/protocol-contract.md`.
5. Leak tests for what is new: `GET /users/{id}` and `GET /lobbies` show no username, no session
   data and nothing of a private lobby; `queue.status` shows counts and no names.

CONTRACTS

- Frozen for you: `web/` except `web/src/protocol/generated/`, `design/`, `fixtures/engine/`.
- Yours: `server/`, Compose, deploy files, `.github/`, `web/src/protocol/generated/`,
  `fixtures/protocol/`.
- Joint: `docs/protocol.md`. No message, field or error code was added or changed by this package.
  If closing a hole changes one, regenerate the TypeScript and the samples in the same piece of
  work. An additive change keeps `protocol` at 1.
- `ServerConfig.emotes` stays empty. The client invents no emote ids.
- The mock is not a reference for security or for the rules. It keeps passwords as typed, in the
  page's memory, and runs the legacy shuffle. None of that belongs on the server.

DONE WHEN

From `server/` on your branch:
- `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` and `cargo test --workspace`
  pass, against Postgres, with the migrations applied from empty.
- Integration tests with real sockets and real HTTP cover: a guest upgrade keeps the user id; a
  taken username in another case; a bad login; logout and the 401 after it; a colour outside the
  eight is refused; the public list omits private lobbies and lobbies in a game; a casual queue
  reaches `game.start` with bots in the open seats; a guest asking for ranked gets
  `ACCOUNT_REQUIRED`; `ALREADY_SEATED` while a queue or a lobby is open; stats after a game.
- Every file in `fixtures/engine/` still replays exactly.
- From `web/` on `feature/claude-accounts`, `npx vp test` still passes 330 tests if you regenerated
  the protocol tree.

REPORT BACK

Write `docs/handover/027-grok-to-claude-<slug>.md` and print the same text in one fenced code
block. It must be a paste-ready prompt for Claude ("You are Claude"), with who and where, state, a
numbered task, contracts, done when, and report back. Include your branch and commit, the gate
commands with their counts, your decision on each of the 17 holes with the `docs/protocol.md`
section it landed in, every place where the server differs from the mock described here, whether
`protocol` changed, the rate limits a player can run into, the exact `WEAK_PASSWORD` rule and
message, and how to start the server so Claude can run the browser smoke (sign up, sign in, public
list, quick play) against it.
