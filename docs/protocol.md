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
  expires 30 days after last use.
- The page never reads the token. REST and the socket upgrade both carry the cookie.
- Every state-changing REST request and the socket upgrade are checked against an `Origin`
  allow-list.

## 3. Errors

REST: the HTTP status plus `{ "error": { "code": string, "message": string } }`.
Socket: `{ "t": "err", "re": number, "code": string, "message": string }`.

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
| `POST /auth/register` | `{ username, password }` | `Me` | With a guest session, upgrades that guest in place. |
| `POST /auth/login` | `{ username, password }` | `Me` | *public*; replaces the session. |
| `POST /auth/logout` | | `204` | Revokes the session, clears the cookie. |
| `GET /me` | | `Me` | |
| `PATCH /me` | `{ name?, color? }` | `Me` | |
| `GET /users/{id}` | | `Profile` | |
| `GET /lobbies` | | `{ lobbies: LobbySummary[] }` | Open public lobbies. Phase 2. |
| `GET /ladder?season=&limit=&after=` | | `{ season: Season, entries: LadderEntry[], next?: string }` | Phase 3. |

```ts
type ServerConfig = {
  protocol: number;                 // 1
  build: string;                    // server build id
  timers: Timers;                   // the defaults
  standard: GameSettings;           // the quick-play and ranked ruleset
  season: Season | null;
  emotes: string[];                 // the emote ids the server accepts
};
type Timers = { bidMs: number; playMs: number; abilityMs: number; trickEndMs: number; roundEndMs: number;
                disconnectGraceMs: number };
type Me = {
  user: User; guest: boolean; username: string | null;
  active: { kind: 'lobby' | 'queue' | 'game'; id: string } | null;   // where a reconnect lands
  cooldownUntil: number | null;
  stats: Stats; rating: Rating | null;
};
type User = { id: UserId; name: string; color: string; tier: string | null };
type Profile = { user: User; stats: Stats; rating: Rating | null };
type Stats = { games: number; wins: number; bidsMade: number; bidsTotal: number; bestScore: number | null };
type Rating = { value: number; tier: string; provisional: boolean; games: number };
type Season = { id: number; name: string; startsAt: number; endsAt: number };
type LadderEntry = { rank: number; user: User; rating: Rating };
```

Username: 3–16 characters of `A–Z a–z 0–9 _`, unique case-insensitively, not on the reserved list.
`name` is the display name: 1–16 visible characters, trimmed, no control characters. `color` is one
of the eight table colours.

## 5. Socket

### 5.1 Envelope

Client → server: `{ "t": string, "id": number, ...payload }`. `id` is a counter the client picks.
Every client message gets exactly one reply, `{ "t": "ok", "re": id, ...result }` or an `err`.

Server → client pushes have no `re`.

Limits: 4 KB per frame; 20 messages per second per connection, then `RATE_LIMITED`; a frame that
is not valid JSON closes the socket with code 1003.

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
  | { kind: 'bot'; name: string; color: string; level: 'easy' | 'normal' | 'hard' };
type LobbySummary = { id: LobbyId; hostName: string; settings: GameSettings; players: number };
```

| Client message | Payload | Who | Result |
| -------------- | ------- | --- | ------ |
| `lobby.create` | `{ visibility, settings }` | anyone not seated | `ok { lobby }` |
| `lobby.join` | `{ code }` or `{ lobbyId }` | anyone not seated | `ok { lobby }` |
| `lobby.leave` | | member | `ok` |
| `lobby.ready` | `{ ready: boolean }` | member | `ok` |
| `lobby.settings` | `{ settings }` | host | `ok`; clears everyone's ready |
| `lobby.addBot` | | host | `ok` |
| `lobby.removeBot` | `{ index }` | host | `ok` |
| `lobby.kick` | `{ userId }` | host | `ok` |
| `lobby.start` | | host | `ok`; needs ≥ 2 seats and every human ready |

Pushes: `{ t: 'lobby.state', lobby }` to every member on any change; `{ t: 'lobby.closed', reason:
'kicked' | 'closed' | 'idle' }` to someone removed. When the host leaves, the longest-present human
becomes host; a lobby with no humans closes. After a game the lobby returns to `open` with the same
members and nobody ready (that is the rematch).

### 5.4 Queue

| Client message | Payload | Result |
| -------------- | ------- | ------ |
| `queue.join` | `{ mode: 'casual' | 'ranked' }` | `ok { queue }` |
| `queue.leave` | | `ok` |

```ts
type QueueStatus = { mode: 'casual' | 'ranked'; since: number; found: number; needed: number };
```

Pushes: `{ t: 'queue.status', queue }` as it changes. When a table forms, the queue ends and the
game starts with `game.start`; there is no accept step.

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
type SeatInfo = { name: string; color: string; bot: boolean; userId: UserId | null; tier: string | null };

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

| Client message | Payload | Result |
| -------------- | ------- | ------ |
| `game.bid` | `{ at, bid }` | `ok` |
| `game.play` | `{ at, card, as? }` | `ok`; `as: 'pirate' | 'escape'` for the Tigress only |
| `game.ability` | `{ at, choice }` | `ok`; `choice` per ability, see below |
| `game.ready` | | `ok`; ready for the next round |
| `game.emote` | `{ emote }` | `ok`; one per 2 seconds |
| `game.leave` | | `ok`; a bot takes the seat. In ranked this is a forfeit. |

`at` is `{ round: number, trick: number }`: the round index and the number of tricks already
completed in it, as the client saw them. The server rejects a mismatch with `STALE_ACTION`. It stops
a click that was aimed at one trick from landing in the next after a timeout played for the seat.

`choice`: Helmsman a `Seat`; Smuggler `CardId[]` of the same length as the cards drawn; Gambler
`0 | 10 | 20`; Seer `null`; Giant `-1 | 0 | 1`.

The reply `ok` only says the intent was accepted. The effect arrives as a `game.update`, also to the
sender. The client never applies its own action locally.

Other pushes:

- `{ t: 'game.emote', seat, emote }`
- `{ t: 'game.over', gameId, result: GameResult }`, sent after the final `game.update`.

```ts
type GameResult = {
  totals: number[];                // per seat
  places: number[];                // per seat, 1 = winner; ties share a place
  forfeited: Seat[];
  rating: { before: Rating; after: Rating; delta: number } | null;   // ranked, for this seat only
  lobbyId: LobbyId | null;         // where "play again" goes
};
```

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

`pace` scales bid, play and ability: relaxed ×2, fast ×0.5. A missed deadline plays the bot's move
for that turn and emits `timedOut`. Two in a row set the seat to `away`; an away seat is played
after 1.5 seconds and returns to `online` on the player's next accepted intent.

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
`skt-protocol`'s tests. The web test suite parses each against the generated types.
