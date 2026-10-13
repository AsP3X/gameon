/* Types of the reference engine: the offline game that runs in the browser.
   Everything a seat can see is typed by the wire contract (src/protocol/generated), so the table
   renders an offline view and a server view the same way. The types here are the parts the wire
   never carries: the full state, the actions, and the offline-only configuration. */
import type {
  Ability,
  AbilityChoice,
  BotLevel,
  Card,
  CardId,
  Deadline,
  EngineEvent,
  EngineView,
  Format,
  LastTrick,
  Phase,
  Play,
  PlayedAs,
  RoundRecord,
  Scoring,
  Seat,
  SeatStatus,
  Trick,
} from '../protocol/generated';

/** A player at an offline table. `bot` seats are played by src/game/bots. */
export interface SeatConfig {
  name: string;
  color: string;
  bot: boolean;
}

/** Which optional cards are in the deck. */
export interface DeckConfig {
  loot: boolean;
  kraken: boolean;
  whale: boolean;
}

/** The rules of one game. `level` is read by the bots only. */
export interface GameConfig extends DeckConfig {
  scoring: Scoring;
  abilities: boolean;
  level: BotLevel;
  format: Format;
}

/** What scoring needs. `cannonball` exists only in the scorekeeper. */
export interface ScoreConfig {
  scoring: Scoring;
  cannonball?: boolean;
}

/** A round as the scorekeeper stores it: the engine's record plus who called a cannonball. */
export interface ScoreRecord extends RoundRecord {
  cannon?: boolean[];
}

/** One seat's result for one round. */
export interface Score {
  base: number;
  bonus: number;
  wager: number;
  total: number;
  hit: boolean;
  diff: number;
  kind: 'hit' | 'glance' | 'miss';
}

/** The ability waiting for its seat. `drawn` is what the Smuggler took from the pile. */
export interface PendingAbility {
  kind: Ability;
  seat: Seat;
  drawn?: CardId[];
}

/**
 * The whole game, hidden cards included. Plain JSON, so it can be saved and deep-copied.
 * It never leaves the device: a seat is shown `view(state, seat)` instead.
 */
export interface GameState {
  version: number;
  seats: SeatConfig[];
  cfg: GameConfig;
  deck: Card[];
  /** Cards per round, already capped by the deck size. */
  schedule: number[];
  /** State of the seeded shuffle generator, so a saved game replays exactly. */
  rng: number;
  round: number;
  dealer: Seat;
  phase: Phase;
  hands: CardId[][];
  /** Undealt cards: the Smuggler draws from them, the Seer looks at them. */
  pile: CardId[];
  played: CardId[];
  bids: (number | null)[];
  won: number[];
  trick: Trick;
  turn: Seat | null;
  lastTrick: LastTrick | null;
  pending: PendingAbility | null;
  giantSeat: Seat | null;
  giantUsed: boolean;
  log: RoundRecord[];
  /**
   * Every card played face up this round, in order, with the Tigress's declaration. Everybody at the
   * table saw them, and the bots count from them. `played` has only the ids and `lastTrick` only one trick.
   */
  roundPlays: Play[];
  /** Per seat, the pile the Seer showed that seat this round. Empty for every other seat. */
  peeked: CardId[][];
}

export type Action =
  | { type: 'bid'; seat: Seat; bid: number }
  | { type: 'play'; seat: Seat; card: CardId; as?: PlayedAs }
  | { type: 'ability'; seat: Seat; choice: AbilityChoice }
  | { type: 'advance' };

/** An accepted action gives the next state and what happened; a rejected one gives `error` and the state it was given. */
export type ReduceResult =
  | { state: GameState; events: EngineEvent[]; error?: undefined }
  | { state: GameState; events: EngineEvent[]; error: string };

/**
 * What only a table on a server knows about its seats (docs/protocol.md §5.5, `TableInfo`): who is
 * there, who is ready for the next round, and whose clock is running.
 */
export interface OnlineInfo {
  /** Per seat. `bot` on a seat that started as a person means a bot took it over. */
  status: SeatStatus[];
  /** Per seat, during `roundEnd`. */
  ready: boolean[];
  /**
   * The clock the table is waiting on. `at` is on the server's clock. `total` is how long that clock
   * runs from start to finish, so what is left can be drawn as a share of it.
   */
  deadline: (Deadline & { total: number }) | null;
}

/**
 * What a table shows one seat: the wire view plus the static data a server sends once.
 * `online` is there on a table a server runs, and absent offline.
 */
export interface TableView extends EngineView {
  seats: SeatConfig[];
  cfg: GameConfig;
  deck: Card[];
  online?: OnlineInfo;
}

/** A card a bot wants to play. */
export interface PlayChoice {
  card: CardId;
  as?: PlayedAs;
}
