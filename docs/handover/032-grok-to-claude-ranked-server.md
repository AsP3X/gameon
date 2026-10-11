You are Claude, the web engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write `web/` and `design/web.pen`.
Grok writes the Rust server, Compose, deploy files and CI, and the generated protocol tree. You
and Grok cannot see each other's sessions: the owner pastes handover prompts between you. This is
handover 032, the answer to 031. The ranked server now speaks the queue, the ratings, the ladder
and the leave penalty. Your task is to make the mock and its tests follow those rules.

READ FIRST, IN THIS ORDER
1. `AGENTS.md`, then `docs/agent-rules/ownership-and-handover.md`, `git.md`, `design-sync.md`,
   `web-quality.md` and `definition-of-done.md`.
2. `docs/protocol.md` §4 (season, `Rating`, cooldown, `Stats`) and §5.4 and the ranked paragraphs
   of §5.5. Protocol stays 1. Do not edit `docs/protocol.md`. Do not regenerate
   `web/src/protocol/generated/`.
3. `web/src/net/mock/server.ts` and `web/src/net/mock/ranked.test.ts` on your branch.

STATE

Grok's checkout is `/Users/nvorberg/Documents/development/SkullKingTavern`, branch
`feature/grok-ranked`, cut from `feature/grok-accounts`. The ranked server is commit `04e79ea`
(`04e79ea3af664a7778751e405b775a3133c19652`). This handover is the commit on top of it. Not pushed.
Not merged. Do not commit in that checkout.

Your branch stays `feature/claude-ranked` in `/Users/nvorberg/Documents/development/skt-claude-ranked`.
Do not cut from `dev`. Do not merge `feature/claude-four-players` or `feature/claude-menu-music`.

Gate, from `server/` on `04e79ea`, with `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt`:
- `cargo fmt --check`: clean.
- `cargo clippy --all-targets -- -D warnings`: clean.
- `cargo test --workspace`: engine 23 passed; `engine_fixtures_replay` passed; protocol 3 passed,
  including a clean TypeScript regen; server 31 passed.

Not in this package: recent-lobby avoidance, and the audit endpoint over the action log. A ranked
queue can still seat two accounts that just shared a private lobby. `ServerConfig.emotes` is still
empty.

WHAT REPLACED THE SEVEN STAND-INS

1. `Rating.value` is the nearest integer of μ − 3σ, half away from zero. It may be negative. The
   prior is μ 25 and σ 25/3, so the first `before.value` is 0. After a game the number is whatever
   Weng-Lin produced, not +1 or −1. `delta` is `after.value − before.value`.
2. Tiers, sent as these strings: Deckhand below 8, Bosun below 16, Quartermaster below 24, First
   Mate below 32, Captain below 40, Pirate Lord below 48, Skull King from 48.
3. `provisional` is true while `games` is below 5. The fifth game's `after` has `games: 5` and
   `provisional: false`. The tier is still sent during placement.
4. Cooldown, from the moment ranked `game.leave` is accepted. Leaves this season: 15 minutes, then
   30, 60, 2 hours, 4, 8, 16, and 24 hours from the eighth leave on. A past `cooldownUntil` is
   null. The `QUEUE_COOLDOWN` message is `You cannot queue yet.` and has no time in it.
5. Season: the UTC calendar quarter. `id` 1 is 2026 Q1. `name` is `YYYY Qn` (`2026 Q4` on
   11 October 2026). `startsAt` is the first millisecond of the quarter. `endsAt` is the first
   millisecond of the next one. `config.season` is that season, not null.
6. Ladder cursor: `next` is the user id of the last row on the page. `after` is that id. It is not
   a row offset. `limit` is 1 to 100 and defaults to 25.
7. Matchmaking: a window of ±10 around the ordinal at join, growing by ±10 every 15 seconds. An
   unrated account uses 0. Two waiters match only when each is inside the other's window. The
   oldest compatible four among the oldest 12 are seated. Four accounts on 0 still sit at once, in
   join order. No bots and no fill timer.

THE 14 HOLES

All of these are now in `docs/protocol.md`. Protocol version is still 1. No message, field or
error code was added, so the generated TypeScript did not change.

1. `Active` for the ranked queue is `{ kind: 'queue', id: 'ranked' }`. §4.
2. Ranked join order is `ACCOUNT_REQUIRED`, then `QUEUE_COOLDOWN`, then `ALREADY_SEATED`. §5.4.
3. The cooldown closes ranked only. Casual and lobbies still work. §4.
4. The cooldown starts at ranked `game.leave`. A time that is not in the future is null. §4.
5. A forfeited seat's place is the seat count (both forfeits are 4). `totals` are the points as
   played. §5.5.
6. A bot after the disconnect grace is not a forfeit. A ranked game does not change `Stats`,
   including for a seat that stayed. `rating.games` still goes up for the leaver. §4 and §5.5.
7. `value` is a whole number. `delta` is `after.value − before.value`. §4.
8. Placement is the first five games. The tier string is shown while `provisional` is true. §4.
9. `User.tier` is set when `Me.rating` is present. `SeatInfo.tier` is that tier at `game.start`,
   or null when the account has no visible rating yet. The first game of a new account has null.
   §4 and §5.4.
10. No shared ladder ranks. Provisional accounts with at least one game this season are listed.
    `limit` is 1 to 100, default 25. Any season other than the current one is `404`. §5.4.
11. There is always a current season, so `GET /ladder` always has one. `config.season` is that
    season. §4 and §5.4.
12. The page does not add the caller's rank when their row was not loaded. §5.4.
13. The join that fills a table pushes `queue.status` with the new `found` to the other waiters,
    then `game.start`. No `queue.status` follows `game.start`. Casual does this too. §5.4.
14. A new season soft-resets: μ halfway back to 25, σ widened and capped at 25/3, `games` 0,
    provisional again, not on the ladder until they finish a game. A cooldown already running
    still applies. The leave count starts over. §4.

WHERE THE SERVER DIFFERS FROM THE MOCK IN 031

Change the mock and `ranked.test.ts` to the rules above. The screen already renders the strings it
is given. These are the behaviour changes:

- Do not keep +1/−1, a permanent `Deckhand`, or `provisional: true` after every game. A scripted
  test does not have to reproduce a Weng-Lin ordinal. Assert that `delta` equals
  `after.value − before.value`, that `tier` is the band for that `value`, and that `provisional`
  is `games < 5`. Do not port Weng-Lin into `web/`.
- The first `before` for an account with `rating: null` is still
  `{ value: 0, tier: 'Deckhand', provisional: true, games: 0 }`.
- Cooldown is the doubling schedule, not a flat 15 minutes. Search the client and the pen for a
  hardcoded 15 minutes, "one point", or "Season 1" stated as the rule. If you find one, change the
  copy in both places. The hub already reads `cooldownUntil`.
- `Stats.games` does not increase for a ranked game. Your mock currently increments it for a seat
  that stayed. Stop that. `rating.games` still increases, including for a leaver.
- `GET /ladder` and `config.season` use the calendar quarter, not `Season 1` from 30 days ago.
- `next` is a user id. Ranks on the second page keep counting (a `limit=2` second page starts at
  rank 3). Sort is value descending, then the display name in UTF-8 byte order, then user id.
- `SeatInfo.tier` is no longer always null. Keep drawing the badge from `Rating`. Update a test
  that requires the seat tier to be null after the account already has a rating.
- The completing join's `queue.status` with `found: 4` already matches your mock. Keep it.
- Four unrated accounts still start at once. A stored ordinal of 80 does not sit with three new
  accounts until both sides have waited long enough for the window. You do not have to build that
  window into the mock unless a test of yours was promising "first four, whatever their ratings".

YOUR TASK

On `feature/claude-ranked`:

1. Update `web/src/net/mock/server.ts` so the queue, the rating shape, the cooldown, the season
   and the ladder follow the list above. Keep guest `ACCOUNT_REQUIRED` before `QUEUE_COOLDOWN`
   before `ALREADY_SEATED`.
2. Update `web/src/net/mock/ranked.test.ts` so it states those frames. The old +1/−1, flat 15
   minutes and `Season 1` expectations go away.
3. If a screen or `design/web.pen` states one of those stand-ins as a fact, change the copy in
   the pen first, then in the client. If the copy only says that a cooldown starts and the time
   comes from `cooldownUntil`, leave it.
4. Casual queue, public tables, private tables and the account screens stay as they are.

CONTRACTS

- Frozen for you: `server/`, `docs/protocol.md`, `web/src/protocol/generated/`, `fixtures/`.
- Yours: `web/` except the generated protocol tree, and `design/web.pen` through the Pencil tools.
- `ServerConfig.emotes` stays empty.
- Protocol stays 1.

DONE WHEN

From `web/` on your branch: `npx vp check`, `npx vp test`, `npx vp build`, and
`npm run fixtures:check` (41 games). Say whether the pen was saved.

REPORT BACK

Write `docs/handover/033-claude-to-grok-<slug>.md` and print the same text in one fenced code
block. It must be a paste-ready prompt for Grok. Include your branch and commit, the gate counts,
which stand-ins the mock now follows, any sentence in `docs/protocol.md` you could not render,
and whether a screen's copy changed.

HOW TO SMOKE FOUR ACCOUNTS AGAINST THE SERVER

Postgres is the existing `skt-postgres` container. Do not recreate it and do not run
`docker compose down -v`. From `server/` in Grok's checkout, on `feature/grok-ranked`:

`DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt cargo run -p skt-server`

It listens on `127.0.0.1:8080`. If something else is bound there, stop that process first. Register
four accounts in the client pointed at that server, not at `?mock`. Each chooses ranked. They
should land in one table, `mode: 'ranked'`, no bot, `lobbyId: null`. One leave is place 4, starts
a cooldown of about 15 minutes, and does not block casual. When the table ends, each seat's
`game.over` has its own `rating`, and `GET /ladder?limit=25` lists them with no usernames.
