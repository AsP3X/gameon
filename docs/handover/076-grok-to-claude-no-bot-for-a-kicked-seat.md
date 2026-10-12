# 076 · Grok → Claude · a kicked seat stays empty

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/handover/075-grok-to-claude-platform-plan.md` and, in `docs/protocol.md`,
§5.5 from `game.leave` through §5.6 first. This adds one rule to that plan. No code. The owner
still has to say build.

## State

- Branch `dev`, commit `d99965b` ("DOCS: Answer the platform plan and name the server lane.").
- The rule is the owner's: in a ranked game and in every multiplayer game, a player who is kicked
  for inactivity is not replaced by a bot. A player who only disconnected, and has not been kicked
  yet, sits back down in the same seat.
- Today the server does the opposite after a long drop. `a_reload_returns_the_same_hand_and_a_long_drop_becomes_a_bot`
  in `server/crates/skt-server/src/phase1_tests.rs` reconnects into the same hand, then after 61
  seconds expects `seatStatus: bot`. §5.6 says the disconnect grace is 60 seconds and then the
  status becomes `bot`. That sentence changes when this package is built. It does not change now.

## The rule

Ranked, casual, friends and public. Solo is already covered: a dropped solo game pauses and no
bot is seated.

**Disconnected, not kicked.** The socket drops and the status becomes `offline` at once, as it
does today. The seat stays that player. A later `welcome` puts them back in the same game, in
the same seat, for as long as they have not been kicked. The 60 second grace no longer turns
the seat into a bot. There is no new pirate, no new name and no new colour.

While they are offline the table does not freeze. A missed deadline still plays that one turn
for their seat and emits `timedOut`. The seat is still theirs. Coming back before the kick
clears `offline` and they play the next turn themselves.

**Kicked for inactivity.** Two missed deadlines in a row while the status is `offline` are the
kick. The seat is not given to a bot. `seatStatus` becomes `out`, which is new. The name and
the colour stay. `welcome` for that player has `game: null`. They cannot sit back down in that
match.

The other players still finish. On each later turn of that seat the server plays a legal card,
as it does for a timeout, and the seat stays `out`. That play is not a bot joining the table.

In ranked the kick is a forfeit: last place, the seat is listed in `forfeited`, and
`Me.cooldownUntil` is set then, by the same steps as `game.leave`. Casual, friends and public
do not start a cooldown and do not fill `forfeited`.

Two missed deadlines while the player still has a socket stay what they are: `away`, the server
plays quickly, and the next accepted intent sets `online`. That is not a kick. They were never
disconnected.

`game.leave` is unchanged. The player chose to leave, a bot takes the seat, and in ranked it is
a forfeit. This package does not redo that.

## Where it sits in the plan

It is Package 1b in the lane from 075. It starts when the owner says build. It does not wait for
solo. It does not wait for Package 0, except that `out` is written into `docs/protocol.md` in
the same commit as the code, because it is a new status.

| Package | Needs first | What it changes in the contract |
| --- | --- | --- |
| 1b. Empty seat | The owner says build | Disconnect grace no longer sets `bot` in ranked, casual, friends or public. New status `out` after two missed deadlines while `offline`. That player cannot rejoin. Ranked: forfeit and cooldown at the kick. `game.leave` unchanged. Protocol stays 1. |

The release in 075 grows by this package. `master` waits for W0–W5, Packages 0–3, and Package 1b.

What can go wrong:

- `a_reload_returns_the_same_hand_and_a_long_drop_becomes_a_bot` must be rewritten. A long drop
  stays `offline`. A return before two missed deadlines is the same hand. A return after `out`
  has `game: null`.
- The grace tests that use a two-human table must not start expecting a bot at 61 seconds.
- An old page that only knows `online`, `offline`, `away` and `bot` will not know `out`. The
  server still ships first. The page that draws `out` ships in the same release, before `master`.

## What you draw, when that package is built

Not in this package. When Package 1b is on `dev`:

- A dropped seat keeps the player's name and shows offline. It does not become a bot.
- After the kick the same name stays, marked out, not a bot. No "ADD A BOT" and no new pirate
  in that chair.
- Ranked copy can say they forfeited. It does not show the minutes. That part of 075 stands.

No frame in the current pens has to change before the owner says build.

## Contracts

- Frozen until the owner says build: `docs/protocol.md`, `skt-protocol`, the generated
  TypeScript, both fixture trees, the engine.
- 075 plus this file is the plan. `game.leave` is not part of the change.
- You do not edit `server/`. I do not edit `web/` or a `.pen` file.

## Done when

There is nothing to run. The empty-seat rule is in the plan next to 075.

## Report back

Wait for the owner. Write a handover only if this rule fights a frame you have already drawn.
No server work either way.
