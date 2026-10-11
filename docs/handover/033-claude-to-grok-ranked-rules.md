You are Grok, the server engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the Rust server, Compose, deploy
files and CI, and the generated protocol tree. Claude writes `web/` and `design/web.pen` and never
edits `server/`. You and Claude cannot see each other's sessions: the owner pastes handover prompts
between you. This is handover 033, the answer to 032. The mock and its tests now follow the ranked
rules of `docs/protocol.md`, and the four-account smoke against your server passed: no frame
disagreed with 032. The smoke found one bug in the client, which is fixed, and one thing about
ranked play that is for you and the owner to decide.

READ FIRST, IN THIS ORDER
1. `AGENTS.md`, then `docs/agent-rules/ownership-and-handover.md`, `git.md`, `server-authority.md`,
   `protocol-contract.md` and `definition-of-done.md`.
2. `docs/protocol.md` §4 and §5.6 on your branch: the tier and season paragraphs, and "A missed
   deadline plays the bot's move".
3. On branch `feature/claude-ranked`: `web/src/net/mock/ranked.test.ts`, only if you want to see
   how the client's mock states your rules.

STATE

Branch `feature/claude-ranked`, worktree `/Users/nvorberg/Documents/development/skt-claude-ranked`,
cut from `feature/claude-accounts` at `04d670b`:
- `724b05a` the ranked client and mock (031).
- `7c7f175` handover 031.
- `377279c` the mock follows the server's rules.
- `6fd4e6d` the ladder's class names (the bug the smoke found).
- This handover is the next commit.
Not pushed, not merged. Do not commit there and do not merge it.

Gate, from `web/` on `6fd4e6d`:
- `npx vp check`: clean. 86 files formatted, 79 with no lint or type errors.
- `npx vp test`: 29 files, 362 tests passed.
- `npx vp build`: succeeds.
- `npm run fixtures:check`: `fixtures/engine matches the generator (41 games).`

The pen was NOT saved. `design/web.pen` of this worktree still has every change since 031 only in
the running Pen app, and now also the ones below. The owner has to press ⌘S in Pen with
`/Users/nvorberg/Documents/development/skt-claude-ranked/design/web.pen` open; Claude commits it
after checking the diff.

Nothing in `server/`, `docs/protocol.md`, `web/src/protocol/generated/` or `fixtures/` changed.
Protocol stays 1.

WHAT THE MOCK NOW FOLLOWS

1. Rating shape: `value` a whole number that may be negative, `delta` equal to
   `after.value − before.value`, `tier` the band of `value` (Deckhand below 8 up to Skull King
   from 48), `provisional` equal to `games < 5`. The first `before` is
   `{ value: 0, tier: 'Deckhand', provisional: true, games: 0 }`.
2. Cooldown: from the accepted ranked `game.leave`, 15 minutes, then 30, 60, 120, 240, 480, 960,
   and 1440 from the eighth leave on. A time that is not ahead is null. `QUEUE_COOLDOWN` says
   `You cannot queue yet.`, before `ALREADY_SEATED`.
3. Season: the UTC calendar quarter, `id` 1 for 2026 Q1, `name` `YYYY Qn`, `endsAt` the first
   millisecond of the next quarter. `config.season` is that season.
4. Ladder: `next` is the user id of the page's last row and `after` is that id. Ranks keep
   counting on the next page. Order is value descending, then the display name in UTF-8 byte
   order, then user id. `limit` 1 to 100, default 25. Any other season is 404. A bad `limit`, an
   empty `after` or an id that is not on the ladder is 400.
5. `Stats`: a ranked game changes none, for a seat that stayed as for one that left.
   `rating.games` counts it.
6. `SeatInfo.tier`: at a ranked table, the tier of an account that has a rating at the deal, and
   null for one that has none. Outside ranked the mock sends null.
7. A forfeited seat is place 4 whatever the bot scored, two leavers are both 4, and `forfeited` is
   in the order they left.

What the mock does NOT do, on purpose:
- It does not rate. A place moves a rating by a fixed step (+6, +2, −2, −6). That step is not in
  any test. The tests check the shape in 1 and that a better place never earns less.
- It has no skill window. The first four in the ranked queue sit down.
- It never crosses a season boundary, so it has no soft reset and no restart of the leave count.
- It has no bot takeover after the disconnect grace, as before.

SENTENCES OF `docs/protocol.md` THE CLIENT COULD NOT RENDER

None of these is a disagreement. There was nothing to build them against.
- The soft reset at a season boundary, and "not on the ladder until it finishes a ranked game in
  the new season". The client shows whatever `Me.rating` and the ladder say.
- The matchmaking window and "the oldest compatible four among the oldest 12".
- "A ranked table that seats four and leaves others waiting sends those others a later
  `queue.status` with the reduced `found`". The mock cannot have a fifth waiter.
- "A bot that takes a seat after the disconnect grace is not a forfeit".
One sentence is missing: whether `SeatInfo.tier` is also sent at a casual or a custom table for an
account that has a rating. The mock sends null there. The client draws a tier only from a `Rating`.

WHAT CHANGED ON A SCREEN

- The hub's cooldown line counts in hours when there are any: "It opens again in 3 h 45 min.",
  "in 24 h". Before, it would have said "in 1440 min". It still reads only `cooldownUntil`.
- The ladder names a season's days in UTC, and its last day is the day before `endsAt`:
  `2026 Q4`, `1 Oct 2026 – 31 Dec 2026`. Before, it showed `endsAt` itself in local time, which
  would have read "1 Jan 2027".
- The ladder's rows were drawn wrong in a browser: shrunk, centred, the names faint. Its list was
  `.ladder` and its numbers `.rank`, and the table renderer's stylesheet already styles both for
  the how-to-play sheet and the standings. They are `.ranking` and `.place` now, and a test checks
  the ranked screens' class names against that stylesheet.
- In the pen: the ladder's sample season is `2026 Q4`, the sample ratings fit the tier bands, and
  the states frame has the cooldown in hours. No screen stated 15 minutes, one point or
  "Season 1" as a rule.

THE SMOKE AGAINST YOUR SERVER

Server: `cargo run -p skt-server` from your checkout on `feature/grok-ranked` at `bd16bce`, with
the existing `skt-postgres`. Page: Claude's worktree on `http://localhost:5179`, not `?mock`, as
the account `smoke_2qpk1v` from the 028 smoke. The other three seats were a script with three new
accounts that bid 0 and play the first legal card. Two games.

Game 1, nobody leaves:
- "Find a ranked game": `ok`, the screen went "1 of 4 found", "2", "3", "4 of 4 found", then the
  table. The script's frames: `queue.status` with `found: 4` to the waiters, then `game.start`
  with `mode: 'ranked'`, `lobbyId: null`, four humans, every `SeatInfo.tier` null.
- The leave sheet said "Leave this ranked game?" with "Leave and forfeit". "Keep playing" sent
  nothing: `Me.active` was still the game and `cooldownUntil` null.
- The page's seat was left idle. It went `away` after two missed deadlines and the server played
  it. `game.over` after about six minutes: `places [1,2,4,3]`, `forfeited: []`, each seat
  its own rating, `lobbyId: null`. The end screen showed `Rating 0 → 10 +10 Placement`.
- Back on the hub: `10`, `Bosun`, `Placement`. `Stats.games` still 0 for all four.
- `GET /ladder?limit=2` gave two rows and `next` equal to the second row's user id; the page after
  it started at rank 3.

Game 2, the page leaves:
- `game.start` announced the page's seat with `tier: 'Bosun'` and the three new accounts with null.
- "Leave and forfeit": back at the hub, `cooldownUntil` 15.0 minutes after the click, "Ranked is
  closed for you … It opens again in 15 min.", the ranked button disabled. "Find a game" (casual)
  queued and left normally during the cooldown.
- `game.over` reached the page as a notice: "You left before the end. Final place: 4th of 4. It
  counts as a forfeit. Rating −7." The others had `forfeited: [0]` and `places [4,2,3,1]`, although
  the bot in the left seat had the highest total.
- The ladder screen showed seven rows with `2026 Q4`, `1 Oct 2026 – 31 Dec 2026`, and the page's
  own row marked.

Not smoked: the doubling of the cooldown beyond the first step, the end of placement at the fifth
game, the skill window, and a second page in the ladder SCREEN (seven rows fit one page of 25; the
cursor was checked with `limit=2` from the script).

How the machine was left: Claude's `cargo run` and dev server are stopped, so nothing listens on
8080. `skt-api` is still stopped. `skt-postgres` and `skt-web` are up. Postgres now also holds six
accounts named `rk_…`, seven rows on the 2026 Q4 ladder, and one ranked leave for `smoke_2qpk1v`.
Nothing was deleted.

ONE THING FOR YOU AND THE OWNER

In game 1 the page's account never sent an intent. The server played its seat as an away seat,
against three scripts that bid 0. That account won the game and went from
unrated to 10, Bosun. §5.6 says a missed deadline plays the bot's move, and that is what happened.
In ranked it means an account can queue, walk away, and be rated on the bot's play, with no
forfeit and no cooldown. Whether that is acceptable is not the client's to decide.

YOUR TASK

1. Decide the away seat in ranked with the owner: leave it, or treat a seat that was away for most
   of a ranked game as a forfeit, or do not rate it. If the rule changes, write it into
   `docs/protocol.md` and say in your handover what the client has to show. The end screen and the
   hub notice already draw `forfeited` and a negative `delta`.
2. Write the missing sentence about `SeatInfo.tier` outside ranked into `docs/protocol.md`.
3. Nothing in the client waits on you for accounts, casual or ranked. If you agree, tell the owner
   which branches are ready to merge into `dev` and in which order. On the client side they are
   `feature/claude-accounts` (which `feature/claude-ranked` contains) and `feature/claude-ranked`,
   once the pen is saved and committed.

CONTRACTS

- Frozen for you: `web/` except `web/src/protocol/generated/`, `design/`, `fixtures/engine/`.
- Yours: `server/`, Compose, deploy files, `.github/`, `web/src/protocol/generated/`,
  `fixtures/protocol/`.
- Joint: `docs/protocol.md`. Nothing in this package added or changed a message, a field or an
  error code. Protocol stays 1.
- `ServerConfig.emotes` stays empty.

DONE WHEN

- `docs/protocol.md` has the sentence for task 2, and the decision of task 1 if there is one.
- From `server/`: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` and
  `cargo test --workspace` pass, with a test for whatever task 1 changed.

REPORT BACK

Write `docs/handover/034-grok-to-claude-<slug>.md` and print the same text in one fenced code
block. It must be a paste-ready prompt for Claude ("You are Claude"), with who and where, state, a
numbered task, contracts, done when, and report back. Include your branch and commit, the gate
counts, the decision on the away seat and anything the client has to draw for it, the
`SeatInfo.tier` sentence, and the merge order you propose to the owner.
