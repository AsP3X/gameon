# Engine conformance

How the Rust engine (`server/crates/skt-engine`) is kept identical to the reference engine, and the
exact shapes both produce. Part of the contract (`docs/agent-rules/protocol-contract.md`).

## 1. The reference

The reference is the JavaScript in `legacy/Skull King Tavern.html` (moved there from the repo root
with its content unchanged, so the line numbers hold):

| Lines | Part |
| ----- | ---- |
| 497–635 | `Rules`: `buildDeck`, `role`, `leadSuit`, `legal`, `standing`, `resolveTrick`, `newRecord`, `scoreSeat`, `totals` |
| 637–804 | `Engine`: `create`, `startRound`, `reduce`, `view` |
| 806–889 | `Bots`: `bid`, `play`, `ability` |
| 891–931 | `LocalTable`: the timers the server now owns |

**Port the behavior exactly.** Where the code and a rulebook disagree, the code wins, and the
disagreement goes into a handover as a question. A deliberate rule change is made in the reference
first, the fixtures are regenerated, and then the port follows. A fixture is never edited by hand.

### What the port changes on purpose

| Reference | Rust engine |
| --------- | ----------- |
| `shuffle` with `mulberry32` inside `startRound`; the seed is in the state | The engine takes each round's card order from a `DealSource` passed in. The server's source is an OS-seeded CSPRNG; the test source replays a fixture. No seed in the state. |
| First dealer drawn from the same RNG in `create` | The first dealer is an argument. |
| Bots call `Math.random()` and read `state`. The legacy formula is a power table plus noise | Bots take an RNG argument, one seat's `EngineView`, the static deck, the table rules, the face-up plays, and that seat's own Seer peek. They cannot see `GameState`. Easy, Normal, and Hard are the policy in `bots.rs`: a beginner who sometimes slips, a regular who plays a makeable bid, and that same regular leaning on the next seat without giving up their own bid |
| `view()` includes `seats`, `cfg`, `deck` | `EngineView` leaves them out; the server sends them once in `game.start`. |
| `reduce` returns `{error: string}` | A typed rejection: `NotYourTurn`, `IllegalMove`, `BidOutOfRange` (table in §5). |
| `cfg.cannonball` in `scoreSeat` | Not ported. It is a scorekeeper-only option. |
| `{type:'advance'}` is an action anyone can dispatch | An engine method the server's timer calls. Not reachable from a client message. |

Everything else is the same, including these easy-to-miss details:

- Canonical deck order: the four suits `green, yellow, purple, black`, ranks 1–14 each (ids 0–55);
  five Escapes (56–60); Pirates `helm, smuggler, gambler, seer, giant` (61–65); Tigress (66); Skull
  King (67); two Mermaids (68, 69); then, if enabled and in this order, two Loot, one Kraken, one
  White Whale.
- Cards per round are `min(format[round], floor(deckSize / players))`.
- Deal: seat `i` gets `order[i*cards .. (i+1)*cards]`; the rest, in order, is the undealt pile.
- The seat after the dealer leads the first trick. The dealer moves one seat clockwise each round.
- The suit to follow is set by the first card that is not an Escape (a Tigress played as Escape and
  Loot count as Escapes). If that card is not a number card, there is no suit to follow.
- A Mermaid beats the Skull King; the Skull King beats Pirates; a Pirate beats Mermaids; black beats
  the other suits; otherwise the highest card of the first-played suit. If every card is an Escape,
  the first one wins.
- Kraken: nobody wins the trick, the would-be winner leads next, and the round's `destroyed` count
  goes up. White Whale: the highest number card wins whatever its suit, the first played on a tie,
  and character captures do not score; with no number card the trick is destroyed and the Whale's
  player leads. If both beasts are played, the later one counts.
- Pirate abilities fire only when the pirate **wins** the trick and `abilities` is on. Helmsman,
  Smuggler and Seer are skipped on the last trick of a round; Smuggler and Seer also need a
  non-empty pile. The Gambler fires on the last trick too. The Giant is remembered and asked once,
  after the last trick.
- The Smuggler draws up to two cards from the front of the pile and discards exactly as many as
  were drawn; the discards are removed from play and never shown.
- `as` on a play is read only for the Tigress. On any other card it is ignored: the play is
  accepted and the `cardPlayed` event carries no `as`.
- The Seer's `choice` is not checked. Any value ends the ability and nothing is stored.
- Checks run in the reference's order, and the first failure is the answer: phase, then seat, then
  the value. A bid out of range from a seat that has already bid is `NOT_YOUR_TURN`; a card that is
  not in the hand, played out of turn, is `NOT_YOUR_TURN`.

## 2. Fixtures

`fixtures/engine/*.json`, written by Claude's generator from the reference engine. One file is one
complete game.

```ts
type EngineFixture = {
  fixture: 1;
  name: string;                          // e.g. "4p-classic-brawl-abilities-kraken-017"
  settings: { scoring: 'classic' | 'rascal'; format: string;
              loot: boolean; kraken: boolean; whale: boolean; abilities: boolean };
  players: number;                       // 2..8
  dealer: Seat;                          // the first dealer
  deals: CardId[][];                     // per round: the full deck order used for the deal
  initial: { views: EngineView[] };      // one per seat, after the first deal
  steps: Step[];
  final: { totals: number[];             // per seat
           scores: Score[][] };          // [round][seat]
};
type Step =
  | { action: Action; ok: true; events: GameEvent[]; views: EngineView[] }
  | { action: Action; ok: false; reject: 'NOT_YOUR_TURN' | 'ILLEGAL_MOVE' | 'BID_OUT_OF_RANGE' };
type Action =
  | { type: 'bid'; seat: Seat; bid: number }
  | { type: 'play'; seat: Seat; card: CardId; as?: 'pirate' | 'escape' }
  | { type: 'ability'; seat: Seat; choice: number | number[] | null }
  | { type: 'advance' };
type Score = { base: number; bonus: number; wager: number; total: number;
               hit: boolean; diff: number; kind: 'hit' | 'glance' | 'miss' };
```

The conformance test, for every fixture: build the game from `settings`, `players`, `dealer` and a
deal source that returns `deals[round]`; compare `initial.views`; then for each step apply the
action and compare. An accepted step must produce exactly `events` and exactly `views` (compared as
JSON values, so key order does not matter but every key and value does). A rejected step must be
rejected with that code and leave every view unchanged. At the end compare `final`.

The set covers every player count, every format, both scoring modes, each expansion alone and all
together, every ability with every choice, both beasts in one trick, and rejected actions of every
kind. `fixtures/engine/README.md`, written by the generator, lists the games and every coverage row
with the files that fill it; the generator fails if a row is left open. A gap found later is filled
by a new row and a new fixture, requested through a handover.

The generator is `web/scripts/generate-engine-fixtures.mjs`. It pins the reference file by hash and
is deterministic, so `--check` proves the files on disk are what the reference produces.

## 3. `EngineView`

What one seat may see. Serialised with camelCase keys. Absent optional keys are omitted, not `null`.

```ts
type EngineView = {
  me: Seat;
  phase: 'bidding' | 'playing' | 'trickEnd' | 'ability' | 'roundEnd' | 'gameOver';
  round: number;                 // 0-based
  rounds: number;
  cards: number;                 // cards per hand this round
  dealer: Seat;
  turn: Seat | null;             // who must play; null outside 'playing'
  hand: CardId[];                // this seat only, in deal order (drawn cards appended)
  handCounts: number[];          // per seat
  played: CardId[];              // every card played this round, in order
  bids: (number | null)[];       // while bidding: own bid as placed, others -1 if placed, null if not
  won: number[];                 // tricks won this round, per seat
  trick: { leader: Seat; plays: Play[] };
  lastTrick: { plays: Play[]; result: TrickResult; ability: Ability | null } | null;
  log: RoundRecord[];            // rounds so far, the current one last
  pending: { kind: Ability; seat: Seat;
             drawn?: CardId[];   // Smuggler, own seat only
             peek?: CardId[];    // Seer, own seat only: the undealt pile
           } | null;
  legal: CardId[];               // playable cards if it is this seat's turn, else []
};
type Play = { seat: Seat; card: CardId; as?: 'pirate' | 'escape' };
type Ability = 'helm' | 'smuggler' | 'gambler' | 'seer' | 'giant';
type TrickResult = {
  winner: Seat | null; winIndex: number;     // null and -1 when the trick was destroyed
  leader: Seat;                              // who leads next
  effect: 'kraken' | 'whale' | null;
  captures: { b14: number; black14: boolean; mp: number; ps: number; sm: boolean };
  loot: { from: Seat; to: Seat }[];
};
type RoundRecord = {
  cards: number;
  bids: (number | null)[];       // null until all bids are revealed
  tricks: (number | null)[];     // null until the round is done
  b14: number[]; mp: number[]; ps: number[]; wager: number[];
  black14: Seat | -1; sm: Seat | -1;
  loot: { from: Seat; to: Seat }[];
  destroyed: number;
  giant: { seat: Seat; from: number; to: number } | null;
  done: boolean;
};
```

## 4. `GameEvent`

Public facts, the same for every seat, in the order they happened.

```ts
type GameEvent =
  | { type: 'bidPlaced'; seat: Seat }
  | { type: 'bidsRevealed'; bids: number[] }
  | { type: 'cardPlayed'; seat: Seat; card: CardId; as?: 'pirate' | 'escape' }
  | { type: 'trickResolved'; winner: Seat | null; effect: 'kraken' | 'whale' | null; ability: Ability | null }
  | { type: 'trickCollected'; winner: Seat | null }
  | { type: 'abilityStarted'; kind: Ability; seat: Seat }
  | { type: 'abilityUsed'; kind: 'helm'; seat: Seat; choice: Seat }
  | { type: 'abilityUsed'; kind: 'smuggler'; seat: Seat; count: number }
  | { type: 'abilityUsed'; kind: 'gambler'; seat: Seat; choice: 0 | 10 | 20 }
  | { type: 'abilityUsed'; kind: 'seer'; seat: Seat }
  | { type: 'abilityUsed'; kind: 'giant'; seat: Seat; choice: -1 | 0 | 1; from: number; to: number }
  | { type: 'roundEnded'; round: number }
  | { type: 'roundStarted'; round: number }
  | { type: 'gameOver' };
```

The server adds `seatStatus` and `timedOut` (`docs/protocol.md` §5.5). The engine does not emit them.

## 5. Rejections

| Reference error string | Code |
| ---------------------- | ---- |
| `Not bidding now`, `Seat cannot bid`, `Not your turn`, `No ability to use`, `Nothing to advance` | `NOT_YOUR_TURN` |
| `Bid out of range` | `BID_OUT_OF_RANGE` |
| `Card not in hand`, `Must follow suit`, `Choose Pirate or Escape`, `Pick a pirate to lead`, `Discard exactly N`, `Bet 0, 10 or 20`, `Change by 1 or keep`, `Unknown action` | `ILLEGAL_MOVE` |

`STALE_ACTION` is the server's check of `at`, made before the engine is asked.

## 6. Hidden-information tests

Beyond the fixtures, `skt-engine` carries property tests that play random legal games at every
player count with everything enabled and assert after every step, for every seat `s`:

- **Indistinguishability.** Take the state and shuffle everything `s` cannot know — the cards in
  the other seats' hands and in the pile, among themselves, and the other seats' unrevealed bids.
  The view for `s` must serialise to the same bytes before and after. (While `s` is the pending
  Seer, the pile is known to `s` and is left alone.)
- The card-carrying fields of the view (`hand`, `legal`, `played`, the tricks' `plays`,
  `pending.drawn`, `pending.peek`) hold only `s`'s own hand, cards played face up, and what an
  ability gave `s`. `drawn` and `peek` are absent for every other seat.
- During bidding, another seat's entry in `bids` is `-1` or `null`, never the value.
- The events carry no card that was not played face up.

`GameState` does not implement `Serialize`, and a compile-fail test (or a `static_assertions`
check) keeps it that way.
