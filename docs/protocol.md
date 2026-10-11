# Skull King Tavern — wire protocol v1 (draft)

The contract between `web/` and `server/`. Changing it follows
`docs/agent-rules/protocol-contract.md`. Status: **draft until Gate 0**; Grok may propose
corrections while building `skt-protocol`, through a handover.

Types are written as TypeScript. The Rust crate `skt-protocol` is the executable form; the
TypeScript in `web/src/protocol/generated/` is generated from it.

## 1. Conventions

- Base path `/api/v1`. REST is JSON over HTTPS; the socket is `/api/v1/ws`, JSON text frames.
- Field names are **camelCase**. Message types are dotted lowercase (`lobby.join`). Enum values are
  the strings the legacy engine uses (`trickEnd`, `roundEnd`, `gameOver`).
- Ids: `UserId`, `LobbyId`, `GameId` are UUID strings. `Seat` is `0..n-1`, clockwise. `CardId` is an
  index into the game's `deck` array.
- Times are Unix milliseconds on the server's clock.
- Both sides ignore unknown fields and unknown message types.
- `PROTOCOL = 1`.

## 2. Session

- The session is the cookie `skt_session`: HttpOnly, `SameSite=Strict`, `Path=/`, `Secure` outside
  local development. The value is an opaque random token; the server stores only its hash. It
  expires 30 days after last use. Each use slides that window.
- Logout, and a login that replaces a different session, closes that session's socket with close
  code 1008. An open lobby is left as `lobby.leave` would leave it. A place in the queue is left.
  A seat in a running game is kept and treated as a dropped connection. Logging in as the account
  that already holds the browser's session does not close its socket. Register does not close the
  socket.
- The page never reads the token. REST and the socket upgrade both carry the cookie.
- Every state-changing REST request and the socket upgrade are checked against an `Origin`
  allow-list.

## 3. Errors

REST: the HTTP status plus `{ "error": { "code": string, "message": string } }`.
Socket: `{ "t": "err", "re": number, "code": string, "message": string }`.

An unknown path under `/api/v1` is `NOT_FOUND`. A known path called with the wrong method is
`VALIDATION`, because this table has no separate status for that.

The client branches on `code`. `message` is safe to show but not meant to be parsed.

| Code | Status | Meaning |
| ---- | ------ | ------- |
| `UNAUTHENTICATED` | 401 | No valid session |
| `FORBIDDEN` | 403 | Not allowed (wrong origin, banned) |
| `NOT_FOUND` | 404 | No such user, lobby or game |
| `VALIDATION` | 400 | Malformed or out-of-range input |
| `RATE_LIMITED` | 429 | Too many requests; REST adds `Retry-After` |
| `PROTOCOL_UNSUPPORTED` | 426 | The client's protocol version is not spoken; reload |
| `USERNAME_TAKEN` | 409 | |
| `USERNAME_INVALID` | 400 | Length, characters or a reserved name |
| `WEAK_PASSWORD` | 400 | |
| `INVALID_CREDENTIALS` | 401 | |
| `ALREADY_REGISTERED` | 409 | The session's user is not a guest |
| `LOBBY_NOT_FOUND` | 404 | Unknown code or id |
| `LOBBY_FULL` | 409 | |
| `LOBBY_STARTED` | 409 | The game is running |
| `ALREADY_SEATED` | 409 | The user is in another lobby, queue or game |
| `NOT_IN_LOBBY` | 409 | |
| `NOT_HOST` | 403 | |
| `NOT_READY` | 409 | Start with unready players or fewer than two seats |
| `ACCOUNT_REQUIRED` | 403 | Ranked needs a registered account |
| `QUEUE_COOLDOWN` | 403 | Leaver penalty; `message` carries no time, `GET /me` does |
| `NOT_IN_GAME` | 409 | |
| `NOT_YOUR_TURN` | 409 | Wrong seat or wrong phase |
| `STALE_ACTION` | 409 | `at` does not match the current round and trick |
| `ILLEGAL_MOVE` | 409 | Card not in hand, must follow suit, bad ability choice, Tigress without `as` |
| `BID_OUT_OF_RANGE` | 409 | |
| `INTERNAL` | 500 | Anything else; details are in the server log only |

## 4. REST

All bodies are JSON. Unless marked *public*, a session is required.

| Method and path | Body | Returns | Notes |
| --------------- | ---- | ------- | ----- |
| `GET /health` | | `{ ok: true }` | *public* |
| `GET /config` | | `ServerConfig` | *public* |
| `POST /auth/guest` | | `Me` | *public*; creates a guest and sets the cookie. With a valid session it returns that user. |
| `POST /auth/register` | `Credentials` | `Me` | With a guest session, upgrades that guest in place. A seated guest may register; the seat is not touched. No session is `401`. An account is `ALREADY_REGISTERED`. |
| `POST /auth/login` | `Credentials` | `Me` | *public*; replaces the session. A bad body is `VALIDATION` before the password is checked. |
| `POST /auth/logout` | | `204` | Revokes the session, clears the cookie. No session is `401`. |
| `GET /me` | | `Me` | |
| `PATCH /me` | `ProfilePatch` | `Me` | Omitted fields are left unchanged. A bad field refuses the whole patch. If the user sits in a lobby, every member is sent `lobby.state`. A running game keeps the names it started with. |
| `GET /users/{id}` | | `Profile` | No username and no session data. Unknown id is `404`. |
| `GET /lobbies` | | `{ lobbies: LobbySummary[] }` | Open public lobbies, full ones included, oldest first, no limit. A lobby leaves the list while its game runs and returns when it is `open` again. |
| `GET /ladder?season=&limit=&after=` | | `{ season: Season, entries: LadderEntry[], next?: string }` | Session required. See below. |

```ts
type ServerConfig = {
  protocol: number;                 // 1
  build: string;                    // server build id
  timers: Timers;                   // the defaults: 45s bid, 30s play, 30s ability, 2.5s trick end, 20s round end, 60s grace
  standard: GameSettings;           // quick play and ranked, spelled out below
  season: Season | null;
  emotes: string[];                 // ids this process accepts; this draft does not fix the list
};
type TableColor =
  | '#1cb0f6' | '#ff9600' | '#ce82ff' | '#ff4b4b'
  | '#58cc02' | '#e5a400' | '#2b70c9' | '#ff5fbf';
type Timers = { bidMs: number; playMs: number; abilityMs: number; trickEndMs: number; roundEndMs: number;
                disconnectGraceMs: number };
type Me = {
  user: User; guest: boolean; username: string | null;
  active: { kind: 'lobby' | 'queue' | 'game'; id: string } | null;   // where a reconnect lands
  cooldownUntil: number | null;
  stats: Stats; rating: Rating | null;
};
type User = { id: UserId; name: string; color: TableColor; tier: string | null };
type Profile = { user: User; stats: Stats; rating: Rating | null };
type Stats = { games: number; wins: number; bidsMade: number; bidsTotal: number; bestScore: number | null };
type Rating = { value: number; tier: string; provisional: boolean; games: number };
type Season = { id: number; name: string; startsAt: number; endsAt: number };
type LadderEntry = { rank: number; user: User; rating: Rating };
type Credentials = { username: string; password: string };   // register and login
type ProfilePatch = { name?: string; color?: TableColor };   // omitted fields are left unchanged
```

`standard` is the quick-play and ranked ruleset: 4 players, classic scoring, format `brawl`, loot,
kraken, whale and abilities off, `botLevel` `normal`, `pace` `standard`.

`emotes` is the list the running server accepts. This draft does not name the ids. An empty list
means the server currently accepts none. `game.emote` carries one id from that list; the sample
uses the placeholder `"example"`, which is not an accepted id.

Username: 3–16 characters of `A–Z a–z 0–9 _`, unique case-insensitively. There is no reserved-name
list. `name` is the display name: 1–16 Unicode code points after trimming, and no character in
Unicode category `Cc`. `color` is a `TableColor`: one of the eight legacy table colours
`#1cb0f6`, `#ff9600`, `#ce82ff`, `#ff4b4b`, `#58cc02`, `#e5a400`, `#2b70c9`, `#ff5fbf`, written in
lower case. A password is `WEAK_PASSWORD` only when it is empty. The message is `Enter a password.`

`Active` for a casual queue is `{ kind: 'queue', id: 'casual' }`. There is one casual queue.
`Active` for a ranked queue is `{ kind: 'queue', id: 'ranked' }`. There is one ranked queue.

`Stats` counts every finished custom game and every finished casual game. A finished ranked game
is stored and does not change these counters, including for a seat that stayed. `rating.games`
counts that ranked game instead, including a seat that left. A shared first place counts as a win
for each of those seats. A seat that sent `game.leave` is not counted in `Stats`. `bestScore` is
set by the first finished custom or casual game even when the total is negative, and is the highest
total after that. `bidsTotal` is the number of scored rounds. `bidsMade` is the rounds where the
bid was hit.

`config.season` is the calendar quarter that contains the server's clock. It is not null. Quarters
are UTC: Q1 starts 1 January, Q2 1 April, Q3 1 July, Q4 1 October. `id` 1 is 2026 Q1. `name` is
`YYYY Qn`, for example `2026 Q4`. `startsAt` is the quarter's first millisecond. `endsAt` is the
next quarter's first millisecond. A season that is not the current one cannot be asked for.

`Rating.value` is a whole number: the nearest integer of μ − 3σ, half away from zero. It may be
negative. μ and σ are Weng-Lin (OpenSkill, Plackett-Luce), one player per team, with the crate's
default β of 25/6. A new account has no row, so `Me.rating` and `User.tier` are null. The prior
used for that account's first ranked game is μ 25 and σ 25/3, whose value is 0. `delta` is
`after.value − before.value` of the integers that were sent. `provisional` is true while `games`
is below 5. The fifth ranked game of a season ends placement: its `after.provisional` is false and
its `after.games` is 5. The tier is shown during placement. The bands, on `value`, are Deckhand
below 8, Bosun below 16, Quartermaster below 24, First Mate below 32, Captain below 40, Pirate Lord
below 48, and Skull King from 48. The server sends those strings. It does not send any other tier.

At a season boundary a stored rating is soft-reset for display and for the next game: μ moves
halfway back to 25, σ becomes `min(25/3, hypot(σ, 25/6))`, and `games` becomes 0, so the rating is
provisional again. `Me.rating` stays present. The account is not on the ladder until it finishes a
ranked game in the new season. An account that has never finished one stays `rating: null`. The
leave count starts over. A cooldown that has not run out still applies.

`Me.cooldownUntil` is the server time when ranked opens again, or null. A time that is not in the
future is null. The penalty starts when the ranked `game.leave` is accepted, not when the game
ends. The first ranked leave of a season closes ranked for 15 minutes. Each further leave in that
season doubles it: 15, 30, 60 minutes, then 2, 4, 8 and 16 hours. The eighth leave and every leave
after it is 24 hours, which is the cap. The `QUEUE_COOLDOWN` message carries no time. Casual queue
and every lobby message still work during the penalty. A bot that takes a seat after the disconnect
grace is not a forfeit and does not start a cooldown.

## 5. Socket

### 5.1 Envelope

Client → server: `{ "t": string, "id": number, ...payload }`. `id` is a counter the client picks.
Every client message gets exactly one reply, `{ "t": "ok", "re": id, ...result }` or an `err`.

`ok` always has `t` and `re`. It includes `lobby` when a lobby action returns the lobby, `queue`
when the player joins the queue, and `serverTime` on `ping` and any other reply that carries the
clock. Those three fields are omitted when they do not apply. They are not sent as `null`.

Server → client pushes have no `re`.

Limits: 4 KB per frame, and a longer frame closes the socket with code 1009. 20 messages per
second per connection, then `RATE_LIMITED` for that frame and it is not applied. A frame that is
not valid JSON closes the socket with code 1003. No `hello` within 5 seconds, or 45 seconds with
no frame, closes the socket.

### 5.2 Connecting

1. The client opens the socket. No cookie or a bad origin fails the upgrade with 401 or 403.
2. The client sends `hello` within 5 seconds: `{ t: 'hello', id, protocol: 1, build: string }`.
3. The server replies `ok` and pushes `welcome`:

```ts
type Welcome = {
  t: 'welcome'; me: Me; serverTime: number;
  lobby: Lobby | null;                       // if the user is in a lobby
  queue: QueueStatus | null;                 // if the user is queued
  game: { start: GameStart; update: GameUpdate } | null;   // if the user is in a game
};
```

`welcome` is a complete snapshot. After any reconnect the client throws its online state away and
takes this one. A second socket for the same user closes the first with `{ t: 'superseded' }` and
close code 4001.

A reply is written only to the socket its message arrived on. Closing that socket ends every `id`
still waiting on it. The next socket receives no `ok` or `err` for those ids. The client forgets
them and does not send the intent again. `welcome` shows whether it was accepted: a game intent
that landed is in `welcome.game`, and one that did not is absent from that snapshot.

Heartbeat: the client sends `{ t: 'ping', id }` every 15 seconds; the reply is
`{ t: 'ok', re, serverTime }`. The server drops a socket that has been silent for 45 seconds.

### 5.3 Lobby

```ts
type GameSettings = {
  maxPlayers: number;               // 2..8
  scoring: 'classic' | 'rascal';
  format: 'classic' | 'brawl' | 'swift' | 'even' | 'whirl';
  loot: boolean; kraken: boolean; whale: boolean; abilities: boolean;
  botLevel: 'easy' | 'normal' | 'hard';
  pace: 'relaxed' | 'standard' | 'fast';   // scales the timers
};
type Lobby = {
  id: LobbyId; code: string;               // 6 characters from ABCDEFGHJKMNPQRSTUVWXYZ23456789
  mode: 'custom' | 'casual' | 'ranked';
  visibility: 'private' | 'public';
  hostId: UserId | null;                   // null in matchmade lobbies
  settings: GameSettings;
  members: Member[];                       // join order
  state: 'open' | 'starting' | 'inGame';
  gameId: GameId | null;
};
type Member =
  | { kind: 'human'; user: User; ready: boolean; connected: boolean }
  | { kind: 'bot'; name: string; color: TableColor; level: 'easy' | 'normal' | 'hard' };
type LobbySummary = { id: LobbyId; hostName: string; settings: GameSettings; players: number };
```

| Client message | Payload | Who | Result |
| -------------- | ------- | --- | ------ |
| `lobby.create` | `{ visibility, settings }` | anyone not seated | `ok { lobby }` |
| `lobby.join` | `{ code?: string, lobbyId?: string }` | anyone not seated | `ok { lobby }`. Send one. If both are present, `code` wins. `lobbyId` may seat a private lobby: the id of a private lobby reaches only its members. |
| `lobby.leave` | | member of an open lobby | `ok`. While the lobby is `inGame`, `LOBBY_STARTED`; leaving the seat is `game.leave`. |
| `lobby.ready` | `{ ready: boolean }` | member | `ok` |
| `lobby.settings` | `{ settings }` | host | `ok`; clears everyone's ready |
| `lobby.addBot` | | host | `ok` |
| `lobby.removeBot` | `{ index: number }` | host | `ok`. `index` is the index in `members` (join order), not a seat. |
| `lobby.kick` | `{ userId }` | host | `ok` |
| `lobby.start` | | host | `ok`; needs ≥ 2 seats and every human ready |

Pushes: `{ t: 'lobby.state', lobby }` to every member on any change, including the member whose
message caused it. `ok` for `lobby.ready`, `lobby.settings`, `lobby.addBot` and `lobby.removeBot`
does not carry the lobby, so that push is what moves the sender's screen. `{ t: 'lobby.closed',
reason: 'kicked' | 'closed' | 'idle' }` goes to someone removed. When the host leaves, the
longest-present human becomes host; a lobby with no humans closes. After a game the lobby returns
to `open` with the same members and nobody ready (that is the rematch).

While `state` is not `open`, `lobby.join`, `lobby.leave`, `lobby.ready`, `lobby.settings`,
`lobby.addBot`, `lobby.removeBot`, `lobby.kick` and `lobby.start` are `LOBBY_STARTED`. `game.leave` removes that user from the
lobby as well as from the seat. The members who remain are sent `lobby.state`. The leaver is not.

### 5.4 Queue

| Client message | Payload | Result |
| -------------- | ------- | ------ |
| `queue.join` | `{ mode: 'casual' | 'ranked' }` | `ok { queue }` |
| `queue.leave` | | `ok`, including when the user was not queued |

```ts
type QueueStatus = { mode: 'casual' | 'ranked'; since: number; found: number; needed: number };
```

`queue.join` is checked in this order. Any other `mode` is `VALIDATION`. `ranked` from a guest is
`ACCOUNT_REQUIRED`, even when that guest is already seated. `ranked` while `Me.cooldownUntil` is in
the future is `QUEUE_COOLDOWN`, even when that account is already seated. A user who is in a lobby,
a game, or either queue is `ALREADY_SEATED`.

Casual and ranked are separate lines. A player waiting in one is not seated by the other.

For either mode, `ok.queue` is `{ mode, since, found, needed: 4 }`. `since` is when this player
joined. `found` counts everyone waiting in that mode, the joiner included. Every other waiting
player in that mode is then sent `{ t: 'queue.status', queue }` with their own `since` and the new
`found`. The joiner is not sent that push. The join that fills a table sends that `queue.status`
too, with the new `found`, and then `game.start`. There is no further `queue.status` after
`game.start`. A ranked table that seats four and leaves others waiting sends those others a later
`queue.status` with the reduced `found`.

For `casual`, when `found` reaches 4 the table forms at once, the first four in join order.
Otherwise the server waits 6000 ms from the moment that line stopped being empty, then seats
whoever is waiting and fills the empty seats with bots. The client does not print that duration.
A dropped socket keeps the place, with no time limit. The next `welcome` has `queue` set. A queued
player with no socket when the table forms is seated `offline`.

For `ranked`, there is no fill timer and no bot. A dropped socket keeps the place. One account
waiting is not seated. Each waiter has a window around the ordinal they had on joining. An account
with no rating uses 0. The window starts at ±10 and grows by ±10 for every 15 seconds spent
waiting. Two waiters match only when each is inside the other's window. The server looks at the
12 who have waited the longest and seats the oldest compatible four. Four accounts on 0 match at
once, in join order. `SeatInfo.tier` on that `game.start` follows the rule under the `SeatInfo` type.

A table made by either queue has no lobby. `game.start` carries `lobbyId: null`. Casual carries
`mode: 'casual'`. Ranked carries `mode: 'ranked'`. `settings` are `config.standard`. Humans sit in
join order. Casual then adds bots. There is no accept step and no `lobby.state`. After `game.over`
the client returns to the hub. `game.over` has no `mode` field; the mode is the one from
`game.start`.

`GET /ladder` needs a session. No session is `401`. `season` omitted, or equal to `config.season.id`,
is the current season. Any other value, including a non-integer, is `404`. `limit` omitted is 25.
An integer from 1 to 100 is kept. Anything else is `400`. `after` omitted starts at rank 1. It is
otherwise the `next` of the previous page, which is the user id of that page's last row, and the
next page starts after that row. An empty `after`, or an id that is not on this season's ladder,
is `400`. The body is `{ season, entries, next? }`. `entries` are the accounts with at least one
ranked game in this season, highest `value` first, then by display name in UTF-8 byte order, then
by user id. `rank` counts from 1 with no shared ranks. A provisional account is listed. An account
whose season was reset and who has not finished a game since is not. Each entry is
`{ rank, user, rating }`. `user` is `{ id, name, color, tier }` and has no username, no stats and
no session. `next` is omitted on the last page, not null. The page does not add the caller's own
rank when that row was not loaded. With nobody rated, `entries` is `[]` and `season` is still the
current quarter.

### 5.5 Game

```ts
type GameStart = {
  t: 'game.start';
  gameId: GameId; mode: 'custom' | 'casual' | 'ranked'; lobbyId: LobbyId | null;
  settings: GameSettings;
  deck: Card[];                    // CardId = index. Sent once.
  schedule: number[];              // cards per round
  seats: SeatInfo[];               // clockwise; index = Seat
  me: Seat;
};
type Card =
  | { id: CardId; kind: 'num'; suit: 'green' | 'yellow' | 'purple' | 'black'; rank: number }
  | { id: CardId; kind: 'pirate'; ability: 'helm' | 'smuggler' | 'gambler' | 'seer' | 'giant' }
  | { id: CardId; kind: 'escape' | 'tigress' | 'sk' | 'mermaid' | 'loot' | 'kraken' | 'whale' };
type SeatInfo = { name: string; color: TableColor; bot: boolean; userId: UserId | null; tier: string | null };

`SeatInfo.tier` is the account's tier when that account has a visible rating at the deal, and null
when it does not. A custom table, a casual table and a ranked table use that same rule. A bot seat
is null. The client draws a tier from a `Rating`, not from `SeatInfo`.

type GameUpdate = {
  t: 'game.update';
  gameId: GameId;
  rev: number;                     // +1 per accepted step; the client drops anything older
  events: GameEvent[];             // what just happened, in order; empty in a snapshot
  view: EngineView;                // this seat's view after the step
  table: TableInfo;
};
type TableInfo = {
  status: ('online' | 'offline' | 'away' | 'bot')[];   // per seat; 'bot' = taken over or a bot seat
  deadline: { kind: 'bid' | 'play' | 'ability' | 'nextRound'; seats: Seat[]; at: number } | null;
  ready: boolean[];                // per seat, during roundEnd
};
```

`EngineView` and `GameEvent` are defined in `docs/engine-conformance.md` §3 and §4. They are the
legacy engine's `view()` without `seats`, `cfg` and `deck`, and its event list, unchanged.

Two events exist only online and are appended by the server:

```ts
| { type: 'seatStatus'; seat: Seat; status: 'online' | 'offline' | 'away' | 'bot' }
| { type: 'timedOut'; seat: Seat }      // the server played for this seat
```

The generated TypeScript name `GameEvent` is this whole set: every engine event, plus `seatStatus`
and `timedOut`. The engine-only list is generated as `EngineEvent`. Rust re-exports that engine
enum as `EngineEvent` so the wire union can be called `GameEvent`.

| Client message | Payload | Result |
| -------------- | ------- | ------ |
| `game.bid` | `{ at, bid }` | `ok` |
| `game.play` | `{ at, card, as? }` | `ok`; `as: 'pirate' | 'escape'` for the Tigress only |
| `game.ability` | `{ at, choice }` | `ok`; `choice` per ability, see below |
| `game.ready` | | `ok`; ready for the next round |
| `game.emote` | `{ emote }` | `ok`; one per 2 seconds |
| `game.leave` | | `ok`; a bot takes the seat. In ranked this is a forfeit. |

`at` is `{ round: number, trick: number }`: the round index and the number of tricks of that round
already finished, as the sender's view shows them. `trick` is the sum of `won` plus
`log[round].destroyed`. A trick the Kraken took is in `destroyed` and counts. During `trickEnd` the
trick just played is already in one of those two, so it counts. The trick on the table during
`playing` or `ability` does not. The server rejects a mismatch with `STALE_ACTION`. It stops a
click that was aimed at one trick from landing in the next after a timeout played for the seat.

`choice`: Helmsman a `Seat`; Smuggler `CardId[]` of the same length as the cards drawn; Gambler
`0 | 10 | 20`; Seer `null`; Giant `-1 | 0 | 1`.

The reply `ok` only says the intent was accepted. The effect arrives as a `game.update`, also to the
sender. The client never applies its own action locally.

On the sender's socket, an accepted `game.bid`, `game.play`, `game.ability`, `game.ready` or
`game.leave` is written as `ok` and then, as the next message on that socket, the `game.update`
for that step. No other server message is placed between them: not another seat's `game.update`,
not a `game.emote`, not a `ping` reply, not `game.over`. The table handles one step at a time and
finishes both writes before it takes the next step. An `err` is the whole answer for that intent
and is not followed by a `game.update`. Other seats receive the step as a `game.update` only.
When the step ends the game, `game.over` follows that `game.update`. An accepted `game.emote` is
the same pair with the `game.emote` push in place of `game.update`. `protocol` stays 1.

A bot move, a timeout and the server's `advance` are steps of their own. Each is its own
`game.update`, written to a socket only after both frames of an earlier pair are queued on it.

`game.leave` uses the `ok` then `game.update` pair, and that socket then receives no further
`game.update` for the game. The client takes the table down when that update has been presented.
The seat is a bot from that step. A later `welcome` for that user has `game: null`, and the hand
cannot be resumed. In ranked the leave is a forfeit, recorded then and scored last. `forfeited`
and `rating` travel on `game.over`, sent to the leaver when the game ends. If the leaver has no
socket at that moment, that `game.over` is written immediately after the next `welcome`, which
still has `game: null`. It does not put the table back. The same delivery is owed to any seated
player who had no socket when the game ended, leaver or not. `forfeited` is empty unless the game
is ranked. In ranked it lists every seat that sent `game.leave`, in the order they left. A seat a
bot took after the disconnect grace is not in that list. `totals` are the points as played. A
forfeited seat's place is the number of seats, so two forfeits in a four-player game are both 4.
Every other seat is 1 plus the number of non-forfeited seats with a strictly higher total. Ties
among those seats share a place. `rating` is that receiver's own `{ before, after, delta }` in a
ranked game, and null in every other mode. `before` is the rating at the deal. For an account that
had none, `before` is `{ value: 0, tier: 'Deckhand', provisional: true, games: 0 }`. `after` is
written to `Me.rating` and `User.tier` before `game.over` is sent. No other seat's new rating is
on this message.

`lobby.start`'s `ok` does not carry the opening table. Every member, including the host, is then
sent `lobby.state` with `state: 'inGame'`. On each seated human's socket the server then writes
`game.start` and, next, a `game.update` for that game with `rev` 0 and `events: []`. That update
is the opening view. The client draws the table from it and does not present its events. The first
accepted step is `rev` 1.

`game.ready` during `roundEnd` is `ok` and then a `game.update` whose `events` are empty and whose
`table.ready` shows the new flags. `table.ready` is false for every bot seat and for a human who
has not sent `game.ready`. `advance` to the next round is a later step of its own, when every human
seat whose status is `online` or `away` is ready, or when the round-end deadline fires. `offline`
and `bot` are not waited for.

A missed deadline's `timedOut` event is in the same `game.update` as the move the server played
for that seat, after the engine's events.

A socket that arrives or drops during a game is a step of its own. `rev` increases by one,
`events` is one `seatStatus`, and every seated socket is sent that `game.update`. The returning
socket is sent it after `welcome`. `welcome.game.update`, when `welcome.game` is present, is a
snapshot at the current `rev` with `events: []`. It is not a new step. A drop sets the status to
`offline` at once. During the 60s grace the seat is still that player's and the status stays
`offline`. The change to `bot` when the grace runs out is a later step. Two missed deadlines in a
row set `away` as their own step. `away` still has a socket. `offline` does not.

At `game.start`, a seat whose colour is already taken by an earlier seat gets the next free
`TableColor`.

Other pushes:

- `{ t: 'game.emote', seat, emote }`
- `{ t: 'game.over', gameId, seat, result: GameResult }`, sent after the final `game.update`.
  `seat` is the receiver's seat. The server always sends it. A message that omits it is still
  readable.

```ts
type GameResult = {
  totals: number[];                // per seat
  places: number[];                // per seat, 1 = winner; ties share a place
  forfeited: Seat[];
  rating: { before: Rating; after: Rating; delta: number } | null;   // ranked, for this seat only
  lobbyId: LobbyId | null;         // where "play again" goes
};
```

Until `game.over` arrives, the client may order the seats by `totals`. From the moment `game.over`
follows that final `game.update`, the end screen takes each seat's place from `result.places` and
marks every seat in `result.forfeited`. The winner is whoever has place 1, even when a forfeited
seat has a higher total. `game.over` stays the message after that `game.update`, as written above.

### 5.6 Timing

The server drives every transition the legacy `LocalTable` drove with timers.

| What | Standard | Notes |
| ---- | -------- | ----- |
| Bid | 45 s | One deadline for all seats that have not bid |
| Play | 30 s | |
| Ability | 30 s | |
| Trick end | 2.5 s | Then the server advances; nobody can skip it |
| Round end | 20 s | Or as soon as every connected human sent `game.ready` |
| Bot seats | 0.8–1.5 s per move | So people can follow |
| Disconnect grace | 60 s | Then the seat's status becomes `bot` |

`pace` scales bid, play and ability: relaxed ×2, fast ×0.5. Those lengths, scaled by the game's
`pace`, are the whole of every deadline clock. `Deadline` has no length of its own. A client that
meets a clock while it is already running uses that scaled length, or the time remaining when that
is longer. A missed deadline plays the bot's move for that turn and emits `timedOut`. Two in a row
set the seat to `away`; an away seat is played after 1.5 seconds and returns to `online` on the
player's next accepted intent. Round end waits for `online` and `away` humans, as §5.5 says.

In a ranked game, a seat that is `away` when more than half of the rounds end is a forfeit. A
round counts at the moment it ends. Coming back to `online` before that moment keeps the round
off the count. The forfeit is applied when the game ends, not when the seat first goes `away`:
the place is last, the seat is appended to `forfeited` after any `game.leave` seats, and
`Me.cooldownUntil` is set then, by the same steps as a leave. A seat that already sent
`game.leave` is not penalised again. Casual and custom games do not do this. The away player is
still seated, so `game.over` arrives on the open table, not as a notice after `game.leave`.

## 6. What a seat never receives

Restated from `docs/agent-rules/server-authority.md`, because it is part of the contract:

- No other seat's `hand`. Only `handCounts`.
- No bid that is not revealed: other seats show `-1` (placed) or `null` (not yet) during bidding.
- No `pile`. `pending.peek` exists only for the Seer's own seat while that ability is pending;
  `pending.drawn` only for the Smuggler's own seat.
- No deck order, seed or RNG state. `deck` in `game.start` is the card list in canonical order,
  identical for every game with the same settings.
- `rating` in `game.over` is the receiver's own. Other players' new ratings come from their profiles.

## 7. Samples

`fixtures/protocol/` holds one JSON file per message and DTO in this document, written by
`skt-protocol`. The web test suite parses each against the generated types.

Regenerate both trees from `server/` with `cargo run -p skt-protocol --bin export-protocol`.
Do not hand-edit `web/src/protocol/generated/` or `fixtures/protocol/`.
