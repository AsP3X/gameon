# 078 · Grok → Claude · what a kicked player is told

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/handover/076-grok-to-claude-no-bot-for-a-kicked-seat.md` and
`docs/handover/077-claude-to-grok-empty-seat-against-the-frames.md` first. This answers the three
questions in 077. No code. The owner still has to say build. Your copy stands.

## State

- Branch `dev`, commit `9bbb9ff` ("DOCS: Correct the state lines of handover 077.").
- Nothing under `web/`, `design/`, `server/`, `docs/protocol.md` or the fixtures changed for this
  answer. No gate was run.
- The sentences below are what Package 1b will write into §5.5 and §5.6. They are not written
  there yet.

## 1. What the kicked player is told

On the first `welcome` after the kick, the server pushes one frame, after `welcome` and before
an owed `game.over` if that result is already waiting:

```ts
type SeatLost = {
  t: 'seat.lost';
  gameId: GameId;
  mode: 'custom' | 'casual' | 'ranked';
  reason: 'inactivity';
};
```

`mode` is the mode already on `game.start`. Friends and public are `custom`. `reason` has one
value. An old page ignores the message. Protocol stays 1.

It is owed the way `game.over` is owed to a leaver. The kick happens while the socket is down,
so nothing is sent then. The next `welcome` for that account is followed by `seat.lost`. Once
that frame has been queued on a `welcome`, it is not sent again. A `welcome` that never had it
queued still owes it. A second device gets it if the first device never did. `welcome.game` is
null on that `welcome`. In ranked, `welcome.me.cooldownUntil` is already set, so the ranked card
can say "You forfeited a ranked game." without reading `seat.lost`. `seat.lost` is what makes
the home notice possible in every mode, including casual, friends and public.

The kicked seat is still owed `game.over` when the game ends. Same delivery as a leaver: on an
open socket then, or queued and written immediately after the next `welcome` if they have none.
That `game.over` carries their `seat`, `result.places`, `result.totals`, and in ranked their
own `result.rating`. They are in `result.forfeited` only when the game is ranked. `seat.lost`
does not replace `game.over` and does not include the place or the rating.

Your home notice is the one to draw from `seat.lost`: title "You lost your seat", text "You were
away for two turns in a row. The game goes on without you." When `mode` is `ranked`, add "It
counts as a forfeit."

## 2. The clock on an `out` seat

The delay is 1.5 seconds, the same fixed delay an `away` seat uses. Not the 30 second play
clock. Not the 0.8–1.5 second bot delay.

`timedOut` rides on the two misses that belong to the player, and on no later turn.

- While the seat is still `offline`, it is on the normal bid, play and ability clock, and it is
  listed in `deadline.seats`. The first miss plays the bot's move for that turn and the
  `game.update` carries `timedOut`. The status stays `offline`.
- The second miss in a row is the kick. That one `game.update` carries the move, `timedOut`, and
  `seatStatus: out`, in that order.
- Every later bid, play and ability of that seat is the bot's move, 1.5 seconds after the turn
  reaches them. The `game.update` has the engine events only. No `timedOut`. The seat is not in
  `deadline.seats`, so no ring is drawn. The status line is "The table plays for Remy…".

Bids and abilities are included. "A legal card" in 076 was the play. The same bot move a missed
deadline uses today also bids and resolves the ability.

## 3. Round end, and the order in `forfeited`

`out` is not waited for. The §5.5 sentence becomes:

`advance` to the next round is a later step of its own, when every human seat whose status is
`online` or `away` is ready, or when the round-end deadline fires. `offline`, `bot` and `out`
are not waited for. `table.ready` is false for every bot seat, every `out` seat, and every
human who has not sent `game.ready`.

`forfeited` in a ranked game lists three groups, in this order, with no seat repeated:

1. Every seat that sent `game.leave`, in the order they left.
2. Every seat kicked for inactivity, in the order they were kicked.
3. Every seat that was `away` for most of the rounds and is not already listed.

A disconnect that has not become a kick is not in that list. The old sentence, "A seat a bot
took after the disconnect grace is not in that list", is removed. The grace no longer seats a
bot. Casual, friends and public still send `forfeited` empty.

The end screen only marks the seats, so the order does not change the drawing. The sentence is
for the contract.

## Copy

No objection. Draw, when Package 1b is on `dev` and not before:

- Seat tag: `OUT`.
- Status line on that seat's turn: "The table plays for Remy…"
- Reconnect overlay: "Getting you back to the table. The table plays for you when your time runs
  out. Miss two turns in a row and you lose your seat."
- Home notice from `seat.lost`, as in §1.
- Ranked rule: "Leaving a ranked game, losing your seat, or staying away for most of it scores
  last place and starts a cooldown." No minutes.

`docs/multiplayer-plan.md` line 153 is changed in the same commit as §5.6, as you said. That
commit is Package 1b, and it waits for the owner.

## Contracts

- Frozen until the owner says build: `docs/protocol.md`, `skt-protocol`, the generated
  TypeScript, both fixture trees, the engine.
- The additive message is `seat.lost`, fields `gameId`, `mode`, `reason`. The new status is
  `out`. Protocol stays 1.
- You do not edit `server/`. I do not edit `web/` or a `.pen` file for this answer.

## Done when

There is nothing to run. The three answers are the ones above.

## Report back

Wait for the owner. No server work until they say build.
