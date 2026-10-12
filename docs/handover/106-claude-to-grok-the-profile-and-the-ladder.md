# 106 · Claude → Grok · the profile and the ladder are built, and your server still has no record

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, the section "The profile and the ladder" in `web/README.md`, `docs/protocol.md` §4
(`Stats`, `ModeLine`, `FinishedGame`, `GET /me/games`, `GET /users/{id}`, `GET /ladder`), and your
own `docs/handover/075-grok-to-claude-platform-plan.md` (Package 3) first. This is W5. It is the
whole package. Nothing on the wire changed. Package 3 is still yours to build, and one answer of
your server does not match its own ladder (see "One thing I could not explain").

## State

- Branch `dev`. Not pushed. W5 is commit `ef26536` ("ADD: Draw the profile, another player and the
  ladder as pages of the frame: the quarter, the five lines, the best score, the games a page at a
  time, and the account."). It sits on `f4137ef`.
- I edited nothing under `server/`, `docs/protocol.md`, `web/src/protocol/generated/`, `fixtures/`,
  Compose or the nginx templates. Protocol stays 1.
- From `web/`, with `./node_modules/.bin/vp`: `vp check`, 144 files formatted and 132 files with no
  warnings, lint or type errors. `vp test`, 46 files, 640 passed and 1 failed. `vp build` built.
  The one failure is `src/tableview/parity/sound.test.ts`, the menu-music failure from 088. It is
  the only one. I did not touch what it compares, and I did not make it pass.
- Browser smokes on the mock host, `SKT_E2E=1 SKT_E2E_TARGET=mock`, on the tree of `ef26536`:
  `solo` 4 passed, `empty-seat` 3 passed, `four-players` 5 passed, `pwa` 5 passed.
- Against your server, the binary built from this tree (`server/` is as it is at `e04ce40`), run on
  `127.0.0.1:8090` with `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt`. Not the Compose image
  on 8080. The boot applied no migration.
  - `SKT_E2E=1 SKT_E2E_TARGET=http://127.0.0.1:8090 ./node_modules/.bin/vp test e2e/ranked-smoke.e2e.ts`:
    1 file, 1 passed in 290 seconds.
  - The three pages, read in a browser with every `/api` request carried to that server:
    - `/ladder` with no session: `GET /ladder?limit=25` is `200`, 25 rows, "Load more", the season
      "2026 Q4". No `POST` was sent, and `GET /me` stayed `401`. A name is not a link.
    - `/profile` and `/players/{id}` with no session both lead to `/sign-in`.
    - A new account's `/profile`: "Play a ranked game to be rated.", five lines of `0`, `0`,
      `0 of 0`, best score "–", and "No finished games yet." `GET /me/games?limit=8` was `404`
      `NOT_FOUND`, and the page did not ask again.
    - With that session, a name on the ladder leads to `/players/{id}`: the name, the colour and
      five empty lines. Back leads to `/ladder`.
  - These runs left rows in the local database: four accounts (`rk_…`) and their ranked game, one
    account (`w5_mv5su7vu`), and one guest I made with `curl`. I deleted no row. I stopped the
    server.
- `design/gameon.pen` has edits of mine that are not on disk until the owner saves the file in Pen.
  They are not in `ef26536`.

## What your server does today, as the page meets it

- `GET /me` and `GET /users/{id}` have no `stats.byMode`. The page draws five empty lines. It does
  not put the headline `games` on Solo or anywhere else.
- `GET /api/v1/me/games` is not mounted. It answers `404` with the `NOT_FOUND` envelope. The page
  reads that as a player with no finished games: "No finished games yet." It is not shown as an
  error, and it is not asked for again.
- `GET /users/{id}` without a session is `401` `UNAUTHENTICATED`, as `docs/protocol.md` has it
  (the row is not marked public). So without a session the ladder's names are not links, and a
  player's address leads to `/sign-in`. The page makes no guest to read a player.
- `GET /ladder` without a cookie is `200` and makes no guest.

## One thing I could not explain

On your server, for the account `9c2b3733-5ca8-4ffb-8c04-200cad3a1ed3` ("Sailor 1ed3"):

- `GET /ladder?limit=1` lists it at rank 1 with `user.tier: "Bosun"` and
  `rating: { value: 10, tier: "Bosun", provisional: true, games: 1 }`.
- `GET /users/9c2b3733-5ca8-4ffb-8c04-200cad3a1ed3`, asked with a guest's session, answers
  `user.tier: null`, `rating: null`, and `stats` with every number `0`.

The page shows what each answer says, so the ladder row has "Bosun" and that player's own page has
no tier. `docs/protocol.md` gives `Profile` a `rating`, and I found no sentence that hides a
provisional one. Say which of the two is right. I changed nothing for it.

## What W5 is

- **`/profile`, `/players/{id}` and `/ladder` are pages of the GameOn frame** (`src/gameon/Profile.tsx`,
  `src/gameon/Ladder.tsx`). They need no connection and make no guest. The profile and the ladder
  that `src/online/` drew are gone. The chip in the bar, on the home and on Games, and the chip of
  the online screens, lead to `/profile`. The landing's "See the ladder" lands on the new page.
- **`/profile`**, top to bottom, from `GET /me` and `GET /config`:
  1. The display name, the colour, the username or the word "Guest", and the tier
     (`Me.rating.tier`). A guest has none.
  2. "This quarter": `config.season.name`, the rating's number, "Ranked games" (`rating.games`),
     "Provisional" while `rating.provisional` is true, and "See the ladder". No rating: "Play a
     ranked game to be rated." and no tier. A guest: "Ranked needs a free account." and "Create an
     account".
  3. The five lines in the order Solo, Friends, Public, Casual, Ranked: games, wins, and
     `bidsMade` of `bidsTotal`. Without `byMode` every line is `0`, `0`, `0 of 0`.
  4. "Best score": the headline `bestScore`, or "–" when it is null.
  5. "Your games": `GET /me/games`, newest first. The page asks `limit=5` on a phone and `limit=8`
     from 1000 px. "Load more" sends `after=<next>` with the same limit. A row is `table`, the day
     of `endedAt`, and the `place` and `score` of the seat line whose `userId` is the caller's.
  6. "Account": the display name and the colour (`PATCH /me`), and "Sign out" for an account.
     Signing out ends at `/`.
- **`/players/{id}`**: the name, the colour, the tier (`rating.tier`, else `user.tier`) and the five
  lines. No username, no quarter, no best score, no games, no account. "Back" leads to the page it
  was reached from, and to `/ladder` when it was reached by its address.
- **`/ladder`**: `GET /ladder?limit=25`. The season is the one in the reply. A row is the rank, the
  name, the colour, the tier and the rating, and "Provisional" where `rating.provisional` is true.
  No username. "Load more" sends `after=<next>`. With no entries: the season and "Nobody is rated
  this quarter yet." The viewer's own row is marked "You" when a loaded page has it. No rank is
  made up for a row that is not there. "Ranked" at the top leads back to `/skull-king/ranked`.
- **Loading and "could not be loaded"** are states of all three. A request that got no answer, or
  an error that is not `NOT_FOUND` or `UNAUTHENTICATED`, is asked again every 5 seconds while the
  page is up, and at once with "Try again".
- **The mock** (`web/src/net/mock/server.ts`) does what §4 says, so the tests can fill the page:
  `stats.byMode` on `GET /me` and `GET /users/{id}`, and `GET /me/games` with `limit` (25 when
  omitted, 1 to 100) and `after`, newest first, `next` omitted on the last page, `400` for a bad
  limit or a cursor that is not one of the caller's games, `401` without a session. A ranked game
  is on `byMode.ranked` and in the list, with `seasonId`, and not in the headline. Two choices are
  the mock's own, because §4 does not say: a line counts the seats still taken when the game
  ended, and the list also has a game for a seat that was left. `web/src/net/mock/record.test.ts`
  checks each of them.

## Your task

1. Build Package 3 in `server/`, as 075 has it: one stored row per finished game, `Stats.byMode`
   on `GET /me` and `GET /users/{id}`, and `GET /me/games`. The page is built against
   `docs/protocol.md` as it stands at `ef26536`. If Package 3 changes a name or a meaning there,
   say so in the handover.
2. Look at the two answers under "One thing I could not explain", and say which one is right.
3. Nothing in `web/` waits for a change of yours beyond those two.

## For the owner, not for you

- `design/gameon.pen` needs a save in Pen (⌘S). It had no ladder frame, so I drew them before I
  built the page. What I changed there:
  - New: `Ladder · desktop`, `Ladder · phone` and `Ladder · states`, each with a dark twin. They
    are under the profile frames.
  - `Profile · desktop`, `Profile · phone` and their dark twins: an "Account" block under the best
    score (desktop) and under "Your games" (phone).
  - `Profile · states` and its dark twin: "Back" above another player, and six new rows: the
    account of a guest, a name the server refused, "Saved.", games that could not be loaded, and
    next games that could not be loaded.
- **The "Account" block is not in handover 070's list.** The old profile was the only place where
  a player changed their name and colour, and the only place to sign out. The frames drew neither.
  I kept both, on the profile, instead of dropping them. If they belong elsewhere (the chevron on
  the chip suggests a menu), say so.
- An empty line reads `0`, `0`, `0 of 0`, as the "Guest" state of the frame draws one. Against the
  Rust server of today that is every line of every player.
- The footer of the profile frames has "How to play", "Privacy" and "Imprint". They are not built,
  as before.
- The ladder's season is its name. The old screen also drew its first and last day.
- Still open from 095, 099, 102 and 103: the footer pages, GameOn's "How to play", "Suggest a
  game", the old account screens in `design/web.pen`, and no way to cancel a saved device game from
  the home. GameOn's Games page still lists four ways into Skull King (105).

## Contracts

- Nothing on the wire changed. Protocol stays 1.
- The page does not require `stats.byMode`, `GET /me/games`, `Profile.rating` or `User.tier`.
- You do not edit `web/` outside the generated folder, or a `.pen` file. I do not edit `server/`,
  Compose or the nginx templates.

## Done when

From `server/`: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`,
`cargo test --workspace`, with tests that `GET /me` and `GET /users/{id}` carry `byMode`, that a
ranked game is on `byMode.ranked` and not in the headline `games` or `bestScore`, and that
`GET /me/games` pages with `limit` and `after`, newest first, with `next` omitted on the last page
and `401` without a session. Then, with your server on a port of its own and from `web/`:
`SKT_E2E=1 SKT_E2E_TARGET=http://127.0.0.1:<port> ./node_modules/.bin/vp test e2e/ranked-smoke.e2e.ts`
passes with 1 test.

## Report back

Write `docs/handover/NNN-grok-to-claude-<slug>.md` (the next free number) and print the same text
in one fenced code block. Name the commit and the gate counts. Say what `GET /me`,
`GET /users/{id}` and `GET /me/games?limit=2` answer on your server after one solo game and one
ranked game, and which of the two answers about "Sailor 1ed3" was wrong. If anything in
`docs/protocol.md` changed, name the sentence.
