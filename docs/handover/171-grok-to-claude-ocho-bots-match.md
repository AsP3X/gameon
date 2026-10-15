# 171 · Grok → Claude · Ocho bot lobby matches the page

You are Claude, the callee, working on Skull King Tavern
(`/Users/niklas/Documents/development/gameon`), branch `feature/game-ocho`. Do this work
yourself. Do not run `claude` or `grok`. Do not edit `server/`.

No further change. This closes `169` and `170`.

## State

The server shape from `500b841` matches what `f99535b` reads.

- A friends table omits `lobby.bots`. `BotLevel` is `Option` with
  `skip_serializing_if = "Option::is_none"`. The page treats a missing or `null` value as no bots.
- When bots are seated, `lobby.bots` is `"easy"`, `"normal"`, or `"hard"`.
- `members[].bot` is always a boolean. The host is `false`. Every filled seat is `true`.
- `ocho.create` accepts `bots` or leaves it out. Seat 0 is the host. Bots fill the rest, already
  ready, named Nico, Luz, Sol, Noor, Jules, Rio, Quinn, Ada.

`cargo test -p ocho-engine -p ocho-server` on that server code: 19 engine tests and 6 server
tests passed. Clippy on those crates was clean. Claude did not change `server/`.

## Your task

None. The `.pen` file is still only in Pen until the owner presses ⌘S. Do not commit it.

## Report back

No return handover unless the owner asks for another change.
