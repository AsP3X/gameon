# Ocho game server

The account API stays `skt-server` at `/api/v1`. Ocho's lobby and tables are a separate
process, `ocho-server`, at `/ocho/v1`. The page proxies that prefix. The browser sends the
same `skt_session` cookie. Ocho checks it against `sessions` and does not issue cookies.

A frame is one JSON object. `t` is the kind.

## Client

| `t` | Fields | Who |
| --- | --- | --- |
| `hello` | `id` | first frame. If this account is already at a table, the server then sends `ocho.lobby`, and `ocho.view` once a hand has been dealt. |
| `ocho.create` | `id`, `players` (2–8), `teams` (only with 4), `match` (`one` or `to500`), `bots` (`easy`, `normal`, or `hard`, optional) | anyone not seated |
| `ocho.join` | `id`, `code` | anyone not seated |
| `ocho.leave` | `id` | a member, before the deal, or after the match is over |
| `ocho.ready` | `id`, `ready` | a member, before the deal |
| `ocho.start` | `id` | the host, when every seat is filled and ready |
| `ocho.addBot` | `id` | the host, before the deal, while a seat is open. The bot is ready. Its level is `lobby.bots`, or `normal` when the table has not picked one yet |
| `ocho.removeBot` | `id`, `index` (index in `members`) | the host, before the deal. That member must be a bot |
| `ocho.bots` | `id`, `bots` (`easy`, `normal`, or `hard`) | the host, before the deal. Every bot already seated moves to that level, and every person is not ready |
| `ocho.play` | `id`, `card`, `color` (required for a wild) | the seat whose turn it is |
| `ocho.draw` | `id` | that seat, to draw one or take the stack |
| `ocho.keep` | `id` | that seat, to decline the card just drawn |
| `ocho.color` | `id`, `color` (`red`, `blue`, `green`, `yellow`) | that seat, when the opening card is a wild |
| `ocho.next` | `id` | the winner, between hands |

The acting seat is the session. The message does not carry a seat or a user id.

## Server

| `t` | Fields |
| --- | --- |
| `ok` | `re` |
| `err` | `re`, `code`, `message` |
| `ocho.lobby` | `lobby`: `id`, `code`, `host`, `players`, `teams`, `firstTo500`, `bots` (the level, omitted when the table has no bots), `members` (`user`, `name`, `ready`, `bot`), `started` |
| `ocho.view` | `view`: the per-seat view from `ocho-engine`. Another seat's hand is absent. X-Ray cards are present only for the seat who played X-Ray, and they stay until that seat's next intent. |

`bots` on `ocho.create` is optional. Leave it out: the host is the only seat, and bots are
added one at a time with `ocho.addBot`. Set it and the server still fills every other seat,
for an older page. `lobby.bots` is the one skill for every bot. It is omitted until the host
sets it or the first bot sits down.

After the deal, and after every accepted intent, the server plays each bot from that seat's own
view until a person must act. A bot who went out deals the next hand after 4 seconds, so the
score can be read. A person who went out still sends `ocho.next`.

A drawn card is in the hand. When it matches, that seat may play it or keep it.

`code` on an error is `NOT_YOUR_TURN`, `ILLEGAL_MOVE`, `VALIDATION`, `ALREADY_SEATED`,
`NOT_FOUND`, `LOBBY_FULL`, `NOT_SEATED`, `GAME_RUNNING`, `NOT_HOST`, `NOT_READY`,
`NOT_STARTED`, or `INTERNAL`.
