# Ocho game server

The account API stays `skt-server` at `/api/v1`. Ocho's lobby and tables are a separate
process, `ocho-server`, at `/ocho/v1`. The page proxies that prefix. The browser sends the
same `skt_session` cookie. Ocho checks it against `sessions` and does not issue cookies.

A frame is one JSON object. `t` is the kind.

## Client

| `t` | Fields | Who |
| --- | --- | --- |
| `hello` | `id` | first frame |
| `ocho.create` | `id`, `players` (2–8), `teams` (only with 4), `match` (`one` or `to500`) | anyone not seated |
| `ocho.join` | `id`, `code` | anyone not seated |
| `ocho.leave` | `id` | a member, before the deal |
| `ocho.ready` | `id`, `ready` | a member, before the deal |
| `ocho.start` | `id` | the host, when every seat is filled and ready |
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
| `ocho.lobby` | `lobby`: `id`, `code`, `host`, `players`, `teams`, `firstTo500`, `members` (`user`, `name`, `ready`), `started` |
| `ocho.view` | `view`: the per-seat view from `ocho-engine`. Another seat's hand is absent. X-Ray cards are present only for the seat who played X-Ray. |

`code` on an error is `NOT_YOUR_TURN`, `ILLEGAL_MOVE`, `VALIDATION`, `ALREADY_SEATED`,
`NOT_FOUND`, `LOBBY_FULL`, `NOT_SEATED`, `GAME_RUNNING`, `NOT_HOST`, `NOT_READY`,
`NOT_STARTED`, or `INTERNAL`.
