# The server is the only authority

**Applies to:** every change that touches online play — the engine, the server, the protocol, and
the web client's online screens.

The server is the single point of truth. A player who rewrites the client, replays traffic or
opens a second socket must gain nothing: no hidden information and no move the rules forbid. A
change that breaks one of the invariants below is wrong even if the game "works".

## The server decides

- The server owns the shuffle, the deal, the dealer, turn order, legality, trick resolution,
  pirate abilities, scoring, timers, bot moves, results and ratings.
- A client sends **intents** only: a bid, a card, an ability choice, ready, an emote, a lobby or
  queue request. It never sends a seat, a user id, a score, a result or a state transition.
  The acting seat is derived from the authenticated connection, never from the message.
- `advance` (trick end → next trick, round end → next round) is driven by the server's timers. No
  client message can trigger it.
- Every intent is validated against the current state, and rejected — never queued, never
  "corrected" — when it is stale, out of turn or illegal. A rejected intent changes nothing.
- Deadlines are enforced on the server's clock. The client only displays them.

## The server hides

- Game state leaves the engine only through the per-seat view. `GameState` does not implement
  `Serialize`; the view types do. There is no "full state" message, debug flag or admin shortcut
  on the player socket.
- Never sent to a seat: another seat's hand, the undealt pile (except to the Seer while their
  ability is pending), what the Smuggler drew or discarded (except to the Smuggler), an unrevealed
  bid, the deck order, RNG state or seeds.
- Bids stay hidden until every seat has bid, then all are revealed in one update.
- Events are public facts only. Anything private travels in the acting seat's own view.
- Shuffles use an OS-seeded CSPRNG, one stream per game. The legacy 32-bit `mulberry32` seed can be
  brute-forced from one hand and must never run on the server.
- Bots decide from the same per-seat view a human gets. A bot never reads `GameState`.

## The server keeps the record

- Results and rating changes are written by the server, in one database transaction, from the
  state it computed itself.
- Every game stores its deals and its accepted actions in order, enough to replay it exactly.
- Ranked is solo queue, never starts with a bot, and a seat that leaves is scored as a loss.

## The client is not a security control

- Nothing in `web/` enforces a rule. Client-side checks (legal cards, bid range, disabled buttons)
  exist for feedback only, and the server repeats every one of them.
- The client must never receive something and then hide it. If a player shouldn't know it, the
  server doesn't send it.
- One socket per account per table: a new connection replaces the old one.
- Messages are size-limited and rate-limited per connection and per account.

## Review checklist

1. Can any message, log line or error body show one seat another seat's hidden information? Must be **no**.
2. Is every new intent validated for sender, phase, turn, freshness and legality on the server?
3. Does a new piece of state have an explicit entry in the view — sent, redacted or omitted — and a leak test?
4. Could the client decide an outcome the server then trusts? Must be **no**.
