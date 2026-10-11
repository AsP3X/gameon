You are Grok, the server engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the Rust server, Compose, deploy
files and CI, and the generated protocol tree. Claude writes `web/` and `design/web.pen` and never
edits `server/`. You and Claude cannot see each other's sessions: the owner pastes handover prompts
between you. This is handover 031, the answer to 030. The Phase 3 client (C12, C13, C14) is built
against the mock: the ranked queue, the ladder, and the leave warning with its cooldown. Your
package is the server side: G11, G12 and the leaver part of G13.

READ FIRST, IN THIS ORDER
1. `AGENTS.md`, then `docs/agent-rules/ownership-and-handover.md`, `git.md`, `server-authority.md`,
   `protocol-contract.md`, `rust-quality.md`, `api-and-migrations.md` and `definition-of-done.md`.
2. `docs/protocol.md` §4 (`Me.rating`, `Me.cooldownUntil`, `GET /ladder`), §5.4 and §5.5.
3. On branch `feature/claude-ranked`: `web/src/net/mock/server.ts` (search for `ranked`, `rate(`,
   `ladder(` and `cooldown`) and `web/src/net/mock/ranked.test.ts` (13 tests that state the frames
   case by case).

STATE

Branch `feature/claude-ranked`, cut from `feature/claude-accounts` at `04d670b`. Worktree
`/Users/nvorberg/Documents/development/skt-claude-ranked`. The code is commit `724b05a`
(`724b05af54be022ccf60728fbaba521193bd5631`); this handover is the next commit. Not pushed, not
merged. Do not commit there and do not merge it.

Gate, from `web/` on that branch:
- `npx vp check`: clean. 85 files formatted, 78 with no lint or type errors.
- `npx vp test`: 28 files, 356 tests passed. `feature/claude-accounts` had 25 files and 330 tests;
  they all still pass, two of them with an expectation changed for the new hub block.
- `npx vp build`: succeeds. The mock is not in the production bundle.
- `npm run fixtures:check`: `fixtures/engine matches the generator (41 games).`

Not done:
- `design/web.pen` of THIS worktree is drawn in the running Pen app and is NOT on disk and NOT
  committed. The owner has to press ⌘S in Pen with
  `/Users/nvorberg/Documents/development/skt-claude-ranked/design/web.pen` open. It adds 13
  top-level frames (ranked hub, ranked queue, ladder, the ranked leave sheet, the ranked end
  screen, a states frame, each light and dark, and a section title) and changes the hub, the
  account profile and the pirate profile.
- A ranked table, the ranked leave sheet and the rating line were not looked at in a browser. A
  `?mock` page has a mock of its own, so four accounts never meet there. The hub's ranked block,
  the ranked queue screen and the empty ladder were checked in a browser at 360 px, light and dark.
  The rest is covered by tests on the whole page.
- Nothing was run against the Rust server.

Nothing in `server/`, `docs/protocol.md`, `web/src/protocol/generated/`, `fixtures/` or `legacy/`
changed. Protocol stays 1.

The end-of-game screen DID change, by one line: in a ranked game, between the standings and "Play
again", it shows `Rating 1240 → 1252 +12`, with `Placement` behind it when `after.provisional` is
true. Casual, custom and offline games render exactly the markup they rendered before.

What the client now has:
- Hub, a "Ranked" block. A guest sees "Ranked needs an account.", "Create an account" and
  "Ladder", and nothing is sent. An account sees its rating (`value` rounded, the `tier` string,
  and "Placement" while `provisional` is true, or "Unrated" while `Me.rating` is null), "Find a
  ranked game" and "Ladder".
- The queue screen serves both queues. For ranked it says the table has no bots and that leaving
  scores last place and starts a cooldown.
- The ladder screen: season name and dates, rows, "Show more" while `next` is present.
- The leave sheet of a ranked game: "Leave this ranked game?", what it costs, "Leave and forfeit"
  and "Keep playing". Nothing is sent before "Leave and forfeit".
- While `Me.cooldownUntil` is later than the server clock, the hub says "Ranked is closed for you"
  with the minutes left, the button is disabled, and no `queue.join` is sent.
- The profile and another player's profile show the rating when there is one.

HOW THE MOCK BEHAVES

`queue.join { mode: 'ranked' }`. Checked in this order:
1. `mode` is not `'casual'` or `'ranked'`: `VALIDATION`.
2. The user is a guest: `ACCOUNT_REQUIRED`.
3. `Me.cooldownUntil` is later than now: `QUEUE_COOLDOWN`. The message has no number in it.
4. The user is in a lobby, in a game, or in either queue: `ALREADY_SEATED`.
Otherwise `ok` with `queue: { mode: 'ranked', since, found, needed: 4 }`. `since` is the server
time of this join. `found` counts the accounts waiting in the ranked queue, the joiner included.
Every OTHER ranked waiter is sent `queue.status` with their own `since`. The joiner is not.

The two queues are separate. A casual waiter is not counted in the ranked `found` and gets no
ranked `queue.status`. `Active` for a ranked waiter is `{ kind: 'queue', id: 'ranked' }`.
`queue.leave` is `ok`, and the other ranked waiters get `queue.status`. A dropped socket keeps the
place, and the next `welcome` has `queue` with `mode: 'ranked'`.

No bots, and no timer. Three accounts wait for as long as it takes. When the fourth joins, its
`ok` says `found: 4`, the three who waited are sent `queue.status` with `found: 4` (the push for
that join, as in the casual queue), and then each of the four gets `game.start` with
`mode: 'ranked'`, `lobbyId: null`, `settings` equal to `config.standard`, the four humans in join
order with their `userId`, and next `game.update` with `rev` 0 and `events: []`. No lobby, no
`lobby.state`, no accept step, and no `queue.status` after `game.start`. `SeatInfo.tier` is null.
The mock seats the first four. It has no rating window and no recent-lobby avoidance.

Ranked `game.leave`. `ok`, then the last `game.update`, as in any game, and the seat is a bot from
that step. At that moment the mock sets `Me.cooldownUntil` to now plus 15 minutes. `welcome` after
it has `game: null`. When the game ends, the leaver is sent `game.over` (or is owed it after the
next `welcome`) like everyone else.

`game.over` of a ranked game, per receiver:
- `forfeited` lists every seat that sent `game.leave`, in the order they left.
- `places`: a forfeited seat has the place equal to the number of seats (4), whatever the bot
  scored in it; two leavers both have 4. Every other seat is 1 plus the number of non-forfeited
  seats with a higher total. `totals` are the totals as played.
- `rating` is the receiver's own `{ before, after, delta }`. `before` is `Me.rating`, or
  `{ value: 0, tier: 'Deckhand', provisional: true, games: 0 }` when it was null. `delta` is +1
  for place 1 and -1 for every other place. `after` is `{ value: before.value + delta,
  tier: 'Deckhand', provisional: true, games: before.games + 1 }`.
- `lobbyId` is null.
The mock writes `Me.rating` (from `after`) and `user.tier` before it writes `game.over`, so a
`GET /me` right after it already has them. `Stats` count as before: not for a seat that left. Its
`rating.games` goes up all the same.

The cooldown. `Me.cooldownUntil` is a server time. Once it has passed, `GET /me` gives null. It
closes the ranked queue only: `queue.join { mode: 'casual' }` and every lobby message work during it.

`GET /ladder`. No session: 401 `UNAUTHENTICATED`. Query:
- `season`: omitted is the current season. `1` is that season. Anything else: 404 `NOT_FOUND`.
- `limit`: an integer from 1 to 100, 25 when omitted. Anything else: 400 `VALIDATION`.
- `after`: the `next` of the page before. In the mock it is the number of rows already given, as
  a decimal string. Anything that is not a non-negative integer: 400 `VALIDATION`.
200 `{ season, entries, next? }`. `season` is `{ id: 1, name: 'Season 1', startsAt, endsAt }`.
`entries` are all users whose `Me.rating` is not null, highest `value` first, then by name. `rank`
is the position, counted from 1, with no shared ranks. Each entry is `{ rank, user, rating }` and
`user` is `{ id, name, color, tier }`: no username, no stats, no guest flag. `next` is absent on
the last page, not null. With nobody rated, `entries` is `[]` and the season is still there.
`GET /config` has the same season in the mock; the ladder screen does not read it.

What the client does that you can rely on:
- It asks `GET /ladder?limit=25`, and then `GET /ladder?limit=25&after=<next>` with `next`
  URL-encoded and otherwise untouched. It never sends `season`. It marks the row whose `user.id`
  is its own.
- It calls `GET /me` after `game.over`, after it left a ranked table, and after a
  `QUEUE_COOLDOWN` answer. Nothing is pushed for any of those.
- It compares `cooldownUntil` with the server clock it keeps from `welcome` and `ping`, and
  counts down by the minute. It never sends a ranked join while that time is ahead.
- It shows `Math.round` of `value`, of `before.value`, of `after.value` and of `delta`, each on its
  own. It does not work out a delta, a tier or a placement count.
- It shows the rating line only when `game.start.mode` was `'ranked'`, and only once `game.over`
  has arrived with `rating` set.
- For `QUEUE_COOLDOWN` and `ACCOUNT_REQUIRED` it shows its own copy, not your `message`.

STAND-INS YOU MUST REPLACE

None of these is a proposal. They exist so the screens had something to draw.
1. The rating numbers: a first rating of 0, +1 for first place, -1 for everything else.
2. The tier: `'Deckhand'` for everybody, always.
3. `provisional`: true after every game, for ever. The mock never ends placement.
4. The cooldown: 15 minutes, the same every time. The plan says it grows with repeats.
5. The season: one season, `Season 1`, starting 30 days before the mock was made and lasting 92.
6. The ladder cursor: a row offset. The limit of 100 and the default of 25 are the mock's.
7. Matchmaking: the first four in the queue.

PROTOCOL HOLES

The mock picked the answer in brackets. Decide each and write it into `docs/protocol.md`.
1. `Active` for the ranked queue. [`{ kind: 'queue', id: 'ranked' }`, kept as 030 said.]
2. The order of `ACCOUNT_REQUIRED`, `QUEUE_COOLDOWN` and `ALREADY_SEATED` on a ranked join.
   [In that order.]
3. Whether the cooldown also closes the casual queue or lobbies. [No. Ranked only.]
4. When the cooldown starts: at `game.leave` or when the game ends. [At `game.leave`.] And whether
   `cooldownUntil` becomes null when it has passed. [Yes. The client accepts a past time too.]
5. `places` and `totals` of a forfeited seat, and of two forfeited seats. [Place 4 for each; the
   totals as played.]
6. Whether a seat a bot took over after the disconnect grace is a forfeit. [The mock has no
   takeover.] Whether a ranked leave counts in `Stats.games`. [No.]
7. Whether `Rating.value` is a whole number, and whether `delta` is always `after.value` minus
   `before.value`. [Whole. The client rounds each of the three by itself and shows what was sent.]
8. How many games are placement games, and whether `tier` means anything while `provisional` is
   true. [No count. The client shows the tier string with "Placement" behind it.]
9. Whether `User.tier` and `SeatInfo.tier` are set for a rated player. [`User.tier` after the
   first ranked game; `SeatInfo.tier` always null.] The client draws a tier only from a `Rating`.
10. The ladder: shared ranks, whether provisional players are listed, the bounds and default of
    `limit`, the answer to an unknown season, and whether a past season can be asked for.
    [No shared ranks; listed; 1 to 100 and 25; 404 `NOT_FOUND`; only the current one.]
11. `LadderPage.season` is not nullable, and `config.season` is. What `GET /ladder` answers when
    there is no season at all. [The mock always has one.]
12. There is no way to ask for the player's own rank when their row is not on the page. The screen
    marks its own row only if it was loaded.
13. Whether the join that completes a table is pushed to the waiters as `queue.status` before
    `game.start`. [Yes, `found: 4`. The casual queue in the mock does the same.]
14. What `Me.rating` is at the start of a new season. [The mock has one season.]

YOUR TASK

Work in your own worktree on a branch cut from `feature/grok-accounts`.
1. G11, the ranked queue: account only, solo only, no bots at the start, the rating window that
   widens with waiting, and the frames above. `ALREADY_SEATED` across both queues.
2. G12, ratings and the ladder: Weng-Lin, tiers, placement, seasons, `result.rating` per receiver,
   `Me.rating`, and `GET /ladder`, all written in the result transaction.
3. G13, the leaver part: a ranked `game.leave` is a forfeit placed last, `Me.cooldownUntil` that
   grows with repeats, and `QUEUE_COOLDOWN` with a message that carries no time.
4. Replace all seven stand-ins and decide the 14 holes. Where you differ from the mock, say so in
   your handover so Claude changes the mock and the client.
5. Leak tests: `GET /ladder` shows no username and no session data; `result.rating` on
   `game.over` is the receiver's own and nobody else's.

CONTRACTS

- Frozen for you: `web/` except `web/src/protocol/generated/`, `design/`, `fixtures/engine/`.
- Yours: `server/`, Compose, deploy files, `.github/`, `web/src/protocol/generated/`,
  `fixtures/protocol/`.
- Joint: `docs/protocol.md`. This package added or changed no message, field or error code. If
  closing a hole changes one, regenerate the TypeScript and the samples in the same piece of work.
  An additive change keeps `protocol` at 1.
- `ServerConfig.emotes` stays empty.
- The mock is not a reference for the rating model, for security, or for the rules.

DONE WHEN

From `server/` on your branch:
- `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` and `cargo test --workspace`
  pass against Postgres, with the migrations applied from empty.
- Integration tests with real sockets cover: a guest is refused ranked with `ACCOUNT_REQUIRED`;
  four accounts reach `game.start` with `mode: 'ranked'`, no bot and `lobbyId: null`; three
  accounts are never filled up with bots; each seat's `game.over` carries its own rating change;
  a ranked leave is in `forfeited`, placed last, and sets `cooldownUntil`; a ranked join during the
  cooldown is `QUEUE_COOLDOWN`; `GET /ladder` pages with `next` and has no usernames.
- Gate 3 of the plan: scripted ranked games move the ratings as the model predicts.
- Every file in `fixtures/engine/` still replays exactly.

REPORT BACK

Write `docs/handover/032-grok-to-claude-<slug>.md` and print the same text in one fenced code
block. It must be a paste-ready prompt for Claude ("You are Claude"), with who and where, state, a
numbered task, contracts, done when, and report back. Include your branch and commit, the gate
counts, what replaced each of the seven stand-ins (the range of `value`, the tier names as the
server sends them, when `provisional` ends, the cooldown steps, the season dates, the cursor),
your decision on each of the 14 holes with the `docs/protocol.md` section it landed in, every
place the server differs from the mock described here, whether `protocol` changed, and how to
start the server and get four accounts into one ranked game for a browser smoke.
