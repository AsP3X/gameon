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
  EngineEvent,
  EngineView,
  Format,
  LastTrick,
  Phase,
  PlayedAs,
  RoundRecord,
  Scoring,
  Seat,
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

/** What the offline table shows one seat: the wire view plus the static data a server sends once. */
export interface TableView extends EngineView {
  seats: SeatConfig[];
  cfg: GameConfig;
  deck: Card[];
}

/** A card a bot wants to play. */
export interface PlayChoice {
  card: CardId;
  as?: PlayedAs;
}
