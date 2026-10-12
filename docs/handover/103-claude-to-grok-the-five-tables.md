# 103 · Claude → Grok · the five tables are built, and your server still drops `allowBots`

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, the section "The tables" in `web/README.md`, `docs/protocol.md` §5.3
(`lobby.create`, `lobby.addBot`, `BOTS_DISABLED`, `Lobby.allowBots`, `LobbySummary.allowBots`), and
your own `docs/handover/075-grok-to-claude-platform-plan.md` (Package 2, and 071 questions 1 to 4)
first. This is W4. The owner said build. Nothing on the wire changed. One thing is yours to build:
Package 2. Until it is, a table opened with "Seat bots" off seats bots, and the page says so.

## State

- Branch `dev`. W4 is commit `954a689` ("ADD: Redraw the online screens as the five tables: three
  doors, a ranked page of its own, the Seat bots switch, and the public list that says Bots or No
  bots."). It sits on `e44632d`, and so on your `0d33a63`. Not pushed.
- No protocol change. I edited nothing under `server/`, `docs/protocol.md`,
  `web/src/protocol/generated/`, `fixtures/`, Compose or the nginx templates.
- From `web/`, with `./node_modules/.bin/vp`: `vp check`, 140 files formatted and 128 files with no
  warnings, lint or type errors. `vp test`, 43 files, 603 passed and 1 failed. `vp build` built.
  The one failure is `src/tableview/parity/sound.test.ts`, the menu-music failure from 088. It is
  the only one, and I did not touch what it compares.
- Browser smokes on the mock host, `SKT_E2E=1 SKT_E2E_TARGET=mock`: `four-players` 5 passed, `pwa`
  5 passed, `empty-seat` 3 passed, `solo` 4 passed. `ranked-smoke` cannot pass there: the mock host
  has no `POST /auth/register`.
- Against your server, the binary built from `72a73ff` (your tree is unchanged since `0d33a63`),
  run on `127.0.0.1:8090` with `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt`. Not the
  Compose image on 8080.
  - `SKT_E2E=1 SKT_E2E_TARGET=http://127.0.0.1:8090 ./node_modules/.bin/vp test e2e/ranked-smoke.e2e.ts`:
    1 file, 1 passed in 290 seconds. Four browsers signed up, went from Games to the ranked page,
    pressed "Find a ranked game", and played the ranked game to its end.
  - The same with `e2e/four-players.e2e.ts`: 1 file, 5 passed in 107 seconds. Four guests at a
    table of friends opened from the new page, with `maxPlayers: 4`, `pace: 'standard'` and
    `botLevel: 'normal'` in `game.start.settings`.
  - The boot applied no migration. The runs left accounts (`rk_…`), guests and the two games they
    played in the local database. I deleted no row. I stopped the server.
- The frames matched, in `design/skt.pen`, each with its dark twin: `Skull King · online`,
  `Skull King · ranked`, `Skull King · ranked · states`, `Friends · new game`,
  `Desktop · Friends · new game`, `Friends · waiting`, `Desktop · Friends · waiting`,
  `Friends · states`, `Public · new game`, `Desktop · Public · new game`, `Public · waiting`,
  `Desktop · Public · waiting`, `Public · list`, `Desktop · Public · list`, `Public · states`.
  I compared the built pages with them at 390 and 1440 wide, light and dark, and looked at 360 and
  1024. No page scrolls sideways at 360.
- `design/skt.pen` has edits of mine that are not on disk until the owner saves the file in Pen.
  They are not in `954a689`.

## Package 2 is not built: what your server does today

Asked over a socket of a script's own, on the server above:

- `GET /lobbies` on an empty tavern: two rows, `hostName` "Open table", no `hostColor`, `players`
  0, no `allowBots`, `format` classic, `maxPlayers` 4.
- `lobby.create` with `visibility: 'public'`, the fixed settings and `allowBots: false`: `ok`. The
  `lobby` in the answer has no `allowBots` key.
- Its row in `GET /lobbies`: `hostName`, `hostColor`, `players` 1, and no `allowBots` key.
- `lobby.addBot` on that table: `ok`. The next `lobby.state` has the members `human`, `bot`.
- `lobby.leave`: `ok`, and the row was gone.

So the field is read and dropped, as 075 says. On the page that means: a host who switches "Seat
bots" off gets a waiting table with "ADD A BOT", and the bot is seated when they press it. The
public list says "Bots" for that table. This is not a page bug, and I did not paper over it. The
page does not remember the switch: it draws `Lobby.allowBots` and `LobbySummary.allowBots` as they
came, and left out means the table seats bots.

## What W4 is

- **`/skull-king/online`** is three doors and a code. "Quick play" sends `queue.join` with
  `casual`. "Public tables" leads to `/skull-king/online/public`. "Your table" leads to
  `/skull-king/online/new`. "Join with a code" is under them.
- **`/skull-king/ranked`** is a page of its own. The address no longer leads to the index. It has
  one button, "Find a ranked game", which sends `queue.join` with `ranked` and no other field. It
  has no format picker, no bot switch and no ruleset cards. It lists `ServerConfig.standard` as
  "Four players", "Classic scoring", "Classic · 10 rounds", "No loot", "No kraken", "No whale",
  "No abilities", and the season from `ServerConfig.season`. A guest reads "Ranked needs a free
  account." and the button is disabled. An account whose `Me.cooldownUntil` is ahead of the
  server's clock reads "Ranked is closed for you." and the button is disabled. No time is drawn.
  The page looks again when that time has come. `QUEUE_COOLDOWN` is still shown if it arrives.
- **Friends (`/skull-king/online/new`) and public (`/skull-king/online/public/new`)** have no
  control for seats, pace or bot skill. `lobby.create` always has `maxPlayers: 4`,
  `pace: 'standard'` and `botLevel: 'normal'`, whatever the device remembers of an older table.
  "Seat bots" is on as the page opens. On, `allowBots` is left out. Off, `allowBots: false` is
  sent, and `botLevel` with it. The cards are the solo setup's: Classic, Brawl, Swift, Even,
  Whirl; Classic or Rascal; Loot, Kraken, Whale, Abilities. The buttons are "Open table" and
  "List table".
- **Waiting.** A private table shows its code. A public one does not. "ADD A BOT" and the mark
  that removes a bot are drawn for the host only at a table whose `Lobby.allowBots` is not
  `false`. At a table that seats no bots the page never sends `lobby.addBot`. If `BOTS_DISABLED`
  arrives all the same, the page says "This table does not seat bots." Start is enabled when two
  people are seated and every person is ready. A bot is not the second.
- **The public list.** A row with `hostColor` is "{hostName}'s table". A row without one is
  `hostName` and nothing else, so your two tables read "Open table", "0 of 4 seats · Classic",
  "Bots". `allowBots: false` reads "No bots". Empty is "No public tables right now."
- **A start without `table`** is drawn as every online table was. The page reads `table` only to
  know a solo game.
- **The mock** (`web/src/net/mock/server.ts`) does what `docs/protocol.md` says: `allowBots` on
  `lobby.create` is kept as it was sent, it is in `Lobby` and in `LobbySummary`, and
  `lobby.addBot` on a table with `allowBots: false` is `BOTS_DISABLED` with the message
  `This table does not seat bots.` Anything but a boolean there is `VALIDATION`.
  `web/src/net/mock/server.test.ts` checks each of them.

## Your task

1. Build Package 2 in `server/`: keep `allowBots` from `lobby.create` on the lobby, send it in
   `Lobby` (`ok { lobby }`, `lobby.state`, `welcome.lobby`) and in `LobbySummary`, and answer
   `lobby.addBot` on a table with `allowBots: false` with `BOTS_DISABLED` and the message
   `This table does not seat bots.` Ranked and casual do not read it. The samples
   `fixtures/protocol/lobby.create-no-bots.json` and `lobby-summary-no-bots.json` are already
   there.
2. Nothing in `web/` waits for a change of yours beyond that. If Package 2 changes a name or a
   meaning in `docs/protocol.md`, say so in the handover: the page is built against the text as it
   stands at `954a689`.

## For the owner, not for you

- `design/skt.pen` needs a save in Pen. What I changed there:
  - `Skull King · ranked` and its dark twin: "Brawl" is "Classic", and the "5 rounds" next to it
    is "10 rounds".
  - `Friends · states` and `Public · states`, and their dark twins: one new row each, "Seat bots
    off": the host alone, three open seats, no "ADD A BOT", no remove mark, Start disabled, the
    hint of that table.
  - `Public · list` and `Desktop · Public · list`, and their dark twins: the six rows are titled
    "{name}'s table", which is what a row with a host reads on the page.
- The frames' list rows have tables of 6, 5, 8 and 3 seats. A table opened from the page has 4. I
  left the samples as they are.
- "Seat bots" has no second line. The frame has a hidden placeholder there ("Supporting line.").
- On a phone the bar of these pages has no way to the profile: the frames draw the player only in
  a wide window's bar. Skull King's home has the chip on a phone.
- A guest has no ladder button on the ranked page: the guest's frame has none. The ladder is still
  at `/ladder`, and Back from it leads to the ranked page.
- After a ranked game, or a leave, the page is at the index, where the notice about the game is
  read. The ranked page is one tap away, with the cooldown.
- The line "These are placement games. Your tier is not settled yet." is gone. The season card
  says "Five placement games set your tier.", and the rating still has its "Placement" pill.
- The queue, "Join a table", the ladder and the profile have no new frame and are the screens they
  were. The profile is W5.
- The four-player smoke is now four people at a table of four, with no bot: a fifth seat no longer
  exists. The empty-seat smoke runs at the standard pace, which is the only one.
- Still open from 095, 099 and 102: the footer pages, GameOn's "How to play", "Suggest a game",
  the chevron on the player chip, the old account screens in `design/web.pen`, and no way to
  cancel a saved device game from the home.

## Contracts

- Nothing on the wire changed. Protocol stays 1.
- The page does not require `allowBots` in `Lobby` or `LobbySummary`, `byMode`, or
  `game.start.table` on a table that is not solo.
- You do not edit `web/` outside the generated folder, or a `.pen` file. I do not edit `server/`,
  Compose or the nginx templates.

## Done when

From `server/`: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`,
`cargo test --workspace`, with a test that a table made with `allowBots: false` answers
`lobby.addBot` with `BOTS_DISABLED`, that its `Lobby` and its `LobbySummary` carry
`allowBots: false`, and that a table made without the field still seats a bot. Then, with your
server on a port of its own and from `web/`:
`SKT_E2E=1 SKT_E2E_TARGET=http://127.0.0.1:<port> ./node_modules/.bin/vp test e2e/four-players.e2e.ts`
passes with 5 tests.

## Report back

Write `docs/handover/NNN-grok-to-claude-<slug>.md` (the next free number) and print the same text
in one fenced code block. Name the commit, the gate counts, and what `lobby.create` with
`allowBots: false`, `lobby.addBot` after it and `GET /lobbies` now answer on your server. Say
whether `welcome.lobby` carries `allowBots` after a reconnect. If anything in `docs/protocol.md`
changed, name the sentence. W5, the profile and the ladder, is my next package and waits for the
owner's word.
