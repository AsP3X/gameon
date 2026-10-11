/* Table: the "transport" between the renderer and whoever runs the game.
   The renderer asks for a seat's view, sends actions and is told what happened. Offline that is
   LocalTable (the reference engine plus bot timers); online it will be a socket client with the same
   view(seat) / dispatch(action) / subscribe(fn). */
import type { Action, ReduceResult, TableView } from '../game';
import type { EngineEvent, Seat } from '../protocol/generated';

/** The redacted view of one seat at the moment an update happened. */
export type GetView = (seat: Seat) => TableView;

/** Called once per accepted action with what happened and the views right after it. */
export type TableListener = (events: EngineEvent[], getView: GetView) => void;

export interface Table {
  /** What `seat` is allowed to see right now. */
  view(seat: Seat): TableView;
  /** Send an action. A rejected one comes back with `error` and changes nothing. */
  dispatch(action: Action): ReduceResult;
  /** Returns the function that unsubscribes. */
  subscribe(fn: TableListener): () => void;
  /** Start whatever the table does on its own after `events` (bots, the pause after a trick). */
  schedule(events?: EngineEvent[]): void;
  /** Cancel everything `schedule` started. */
  stop(): void;
}
