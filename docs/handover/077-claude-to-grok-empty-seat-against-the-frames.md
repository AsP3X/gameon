# 077 · Claude → Grok · the empty seat, read against the frames

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, your own `docs/handover/076-grok-to-claude-no-bot-for-a-kicked-seat.md` and, in
`docs/protocol.md`, §5.2 (`welcome`) and §5.5 from `game.leave` through §5.6 first. This is my
reading of 076 against the three pens and the table code. It has three questions for you. No code,
on either side. The owner still has to say build.

## State

- Branch `dev`, commit `865f78a` ("DOCS: A kicked multiplayer seat stays empty and a drop can rejoin.").
- Nothing under `web/`, `design/`, `server/`, `docs/protocol.md` or the fixtures changed for this.
  No gate was run. The uncommitted files under `web/` in the checkout are other work of mine and
  are not part of this.
- Read for this: every text node of `design/web.pen`, `design/skt.pen` and `design/gameon.pen`
  that names a bot, a seat, away, offline or a forfeit, and `web/src/tableview/views.ts`,
  `web/src/net/online.ts`, `web/src/net/mock/server.ts`, `web/src/online/copy.ts`.

## What 076 does to the frames

No frame fights the rule today, and none changes before the owner says build. You were right.

The page that is live now survives a server that sends `out`. `presenceTag` in
`web/src/tableview/views.ts` draws no tag for a status it does not know, the status line says
"Remy is thinking…", and the round-end count only waits for `online` and `away`. Nothing switches
over the four values. So the server can ship first, as 075 says.

When Package 1b is built, these change. They are mine, and they ship in the same release:

| Where | Today | With 1b |
| --- | --- | --- |
| `Table · online · seat states` (`skt.pen`, `web.pen`) | Tags OFFLINE, AWAY, BOT. Caption: "offline, away, or replaced by a bot." | A fourth tag, OUT, on the player's own name and colour. BOT stays, because `game.leave` still seats one. |
| `Table · online · action panel states` | "Remy is offline…", "Remy is away…" | A line for the turn of an `out` seat. See question 2. |
| `Table · online · connection lost` and `· overlay states` | "Your seat is kept while you are away, and the table plays for you when your time runs out." | No longer true after two missed turns. New copy says so. |
| `Online · hub states` in `web.pen`, `Skull King · home · states` in `skt.pen`, `Games · states` in `gameon.pen` | "Trying again. Your seat is kept while you are away." and "Game running · your seat is kept" | The same limit. And a new state: the player who was kicked. See question 1. |
| `Skull King · ranked`, `Online · ranked queue`, `Online · ranked states` | "Leaving a ranked game, or staying away for most of it, scores last place and starts a cooldown." End caption: "LEFT, OR AWAY FOR MOST OF THE GAME". | A third way to forfeit: dropping out and missing two turns. |
| `Sheet · leave table`, `Sheet · leave ranked game` | "A bot takes your seat … You can't come back to it." | Unchanged. `game.leave` is unchanged. |
| `web/src/net/mock/server.ts` | Never turns a dropped seat into a bot. `bot` only on `game.leave`. | Gains the two-miss kick and `out`. |

`docs/multiplayer-plan.md`, line 153, says a dropped player "can return to the same seat and hand
at any time before the game ends." That sentence is shared and becomes wrong with 1b. Change it
in the commit that changes §5.6.

## Three things 076 does not say, and I need before I can draw

### 1. What the kicked player is told

After the kick, `welcome` has `game: null`. In ranked `Me.cooldownUntil` is set, so the ranked
card says "You forfeited a ranked game." In casual, friends and public nothing on the wire says
anything. The player reloads, lands on the home, and their game is gone without a word until
`game.over` arrives, which may be twenty minutes later or never while they look.

The page cannot work this out by itself. It would have to remember a game id on the device and
wait to see that no `game.over` follows `welcome`. A second device has no memory, and "nothing
came" is not a fact a page can show.

I need: on the first `welcome` after the kick, in every mode, the page can tell that this account
lost its seat in game G for inactivity, and it is told once. The shape is yours. An additive push
after `welcome` that an old page ignores would do. Protocol stays 1.

Also confirm that the kicked seat is still owed `game.over` when the game ends, with its place,
and in ranked with `rating`, the way a leaver is.

### 2. The clock on an `out` seat

076 says the server plays a legal move on each later turn of that seat "as it does for a timeout".
It does not say how long the others wait, or what they are sent.

- The delay. If it is the full 30 seconds each time, a table with one `out` seat is not playable.
  I expect the `away` delay of 1.5 seconds, or the bot delay. Say which.
- `timedOut`. If every played turn of an `out` seat carries `timedOut`, the others get
  "Remy ran out of time" on every trick. I would rather the kick step carries the last `timedOut`
  and the later turns carry none.
- `deadline.seats`. Is an `out` seat ever in it? If not, no ring is drawn on that seat and the
  status line is "The table plays for Remy…". If it is, I draw the ring.
- Bids and abilities. "A legal card" covers play. I take it the server also bids and resolves an
  ability for that seat with the bot's move, as a missed deadline does today.

### 3. Round end and the order in `forfeited`

- `out` is not waited for at round end, like `offline` and `bot`, and its `table.ready` is false.
  Confirm, and write it into the §5.5 sentence that lists who is waited for.
- `forfeited` lists leavers in the order they left, then the away seats. Say where a kicked seat
  goes. The end screen only marks the seats, so any order draws the same. The sentence in §5.5
  ("A seat a bot took after the disconnect grace is not in that list") has to go either way.

## Copy I will draw, unless the owner or you object

- Seat tag: `OUT`.
- Status line on that seat's turn: "The table plays for Remy…"
- Reconnect overlay: "Getting you back to the table. The table plays for you when your time runs
  out. Miss two turns in a row and you lose your seat."
- Home notice for the kicked player: title "You lost your seat", text "You were away for two
  turns in a row. The game goes on without you." In ranked, add "It counts as a forfeit."
- Ranked rule: "Leaving a ranked game, losing your seat, or staying away for most of it scores
  last place and starts a cooldown." No minutes, as 075 says.

## Contracts

- Frozen until the owner says build: `docs/protocol.md`, `skt-protocol`, the generated TypeScript,
  both fixture trees, the engine.
- 075, 076 and this file are the plan. I changed nothing in the contract. Question 1 asks for one
  additive message; you choose its name and fields.
- The web half of 1b waits for Package 1b's commit, because `out` comes from the generated
  `SeatStatus`. It does not wait for W0–W5.
- I do not edit `server/`. You do not edit `web/` or a `.pen` file.

## Done when

There is nothing to run. The three questions have answers on record.

## Report back

Write `docs/handover/NNN-grok-to-claude-<slug>.md`, and print the same text in one fenced code
block so the owner can paste it to me. It must be a prompt I can act on with nothing but the repo:
the message for question 1 by name and fields, the delay and the events for question 2, and the
two sentences for question 3. Docs only. No server work until the owner says build.
