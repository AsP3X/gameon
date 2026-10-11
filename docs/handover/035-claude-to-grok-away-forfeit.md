You are Grok, the server engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the Rust server, Compose, deploy
files and CI, and the generated protocol tree. Claude writes `web/` and `design/web.pen` and never
edits `server/`. You and Claude cannot see each other's sessions: the owner pastes handover prompts
between you. This is handover 035, the answer to 034. Your away forfeit works against the client,
and it was looked at in a browser. But 034 asked Claude to confirm that the end screen already
draws it, and it did not: client files changed, and one sentence in 033 was wrong.

READ FIRST
1. `AGENTS.md`, then `docs/agent-rules/ownership-and-handover.md` and `definition-of-done.md`.
2. Nothing in `web/` is needed for your task. `web/src/tableview/views.ts`, the function
   `standings`, is where the end screen now takes the server's places, if you want to see it.

STATE

Branch `feature/claude-ranked`, worktree `/Users/nvorberg/Documents/development/skt-claude-ranked`:
- `8f631a4` the end screen follows the server's places and forfeits.
- `54ab811` the cooldown copy.
- This handover is the next commit.
Not pushed, not merged. Do not commit there and do not merge it.

Gate, from `web/` on `54ab811`:
- `npx vp check`: clean. 86 files formatted, 79 with no lint or type errors.
- `npx vp test`: 29 files, 368 tests passed.
- `npx vp build`: succeeds.
- `npm run fixtures:check`: `fixtures/engine matches the generator (41 games).`

The pen is NOT on disk and NOT committed. `design/web.pen` of this worktree has every change since
031 only in the running Pen app. The owner has to press ⌘S in Pen with
`/Users/nvorberg/Documents/development/skt-claude-ranked/design/web.pen` open; Claude then checks
the diff and commits it. Until then `feature/claude-ranked` is not ready to merge.

Nothing in `server/`, `docs/protocol.md`, `web/src/protocol/generated/` or `fixtures/` changed.
Protocol stays 1.

WHAT 033 GOT WRONG

033 said "The end screen and the hub notice already draw `forfeited` and a negative `delta`." The
hub notice did. The end screen drew the rating line and nothing else of `game.over`: it ranked the
seats by their points, as the offline game does. So a forfeited seat stood where the bot's points
put it. In the second smoke game of 033 the seat that left had the most points, and the three who
stayed would have seen it crowned. With your away rule the away player would have seen themselves
as the winner, with a falling rating under it.

WHAT CHANGED IN THE CLIENT

1. The end screen of an online game takes every seat's place from `result.places` and marks the
   seats in `result.forfeited` with "Forfeit". The winner shown is whoever has place 1. Offline,
   and in the moment before `game.over` arrives, it is still the order of the points. When the
   result moves a seat, the screen is drawn again from it and a finale that had begun starts over.
   A casual or custom game has the same places either way, so nothing visible changes there.
2. The hub's cooldown line said "You left a ranked game. It opens again in …". An away player did
   not leave. It says "You forfeited a ranked game." now, and so does the client's copy for
   `QUEUE_COOLDOWN`.
3. The ranked block on the hub and the ranked queue screen say "Leaving a ranked game, or staying
   away for most of it, scores last place and starts a cooldown." A penalty the player is never
   told about was the alternative. The leave sheet is unchanged.
4. The "You left before the end" notice is shown only for a seat this page gave up with
   `game.leave`, as before. A result that arrives at the open table makes no notice. There is a
   test for exactly that with the page's own seat in `forfeited`.
5. The mock announces a seat with its account's tier at any table, as §5.5 now says.
All of 1 to 3 are in the pen as well, unsaved like the rest.

The mock never marks a seat away. It has no away detection and no deadline engine was built for
it, so in the mock a forfeit is still only a `game.leave`. The away case is covered by a unit test
of the standings with a forfeited seat that has the most points, by a whole-page test where
another seat leaves a ranked game and the page's end screen has to place it last, and by the
browser run below.

THE BROWSER RUN AGAINST YOUR SERVER

Server: `cargo run -p skt-server` from your checkout at `1b9db62` (rule `e713d24`). Page: Claude's
worktree on `http://localhost:5179`, as the account `smoke_2qpk1v`, which had one ranked leave
this season. Three scripted accounts played the other seats. The page was left idle.
- The page's seat went `away` after the bid and the first play timed out, and stayed away.
- `game.over`: `totals [-400,-260,-260,60]`, `places [3,1,1,4]`, `forfeited: [3]`. The away seat
  had the most points and was last.
- The page's end screen: "Mary & Kidd" as the winners, then Calico third, then the page's own row,
  fourth, marked "Forfeit", with its 60 points. Below it `Rating 3 → −1 −4 Placement`.
- No "You left before the end" notice. `Me.active` null.
- Back on the hub: "Ranked is closed for you … It opens again in 30 min.", the ranked button
  disabled. 30 minutes is the second step, after the leave in 033.
No frame disagreed with 034.

How the machine was left: Claude's server and dev server are stopped, nothing listens on 8080,
`skt-api` is still stopped, `skt-postgres` and `skt-web` are up. Postgres has three more `rk_…`
accounts and a second forfeit for `smoke_2qpk1v`. Nothing was deleted.

YOUR TASK

1. Nothing in `server/` has to change for the client.
2. If you want `docs/protocol.md` to say it: the client draws the end screen from `result.places`
   and `result.forfeited` the moment `game.over` arrives, and until then from the points. That
   leans on §5.5, "When the step ends the game, `game.over` follows that `game.update`". Keep that
   order.
3. Tell the owner the merge order you propose. On the client side `feature/claude-ranked` contains
   `feature/claude-accounts`, and it is ready once the pen is saved and committed.

CONTRACTS

- Frozen for you: `web/` except `web/src/protocol/generated/`, `design/`, `fixtures/engine/`.
- Yours: `server/`, Compose, deploy files, `.github/`, `web/src/protocol/generated/`,
  `fixtures/protocol/`.
- Joint: `docs/protocol.md`. No message, field or error code changed. Protocol stays 1.
- `ServerConfig.emotes` stays empty.

DONE WHEN

You have told the owner the merge order, or written what still blocks it.

REPORT BACK

If anything is left for Claude, write `docs/handover/036-grok-to-claude-<slug>.md` and print the
same text in one fenced code block, a paste-ready prompt for Claude ("You are Claude") with who
and where, state, a numbered task, contracts, done when, and report back. If nothing is left, say
that to the owner in one line, with the merge order.
