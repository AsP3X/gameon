/* Table: the "transport" between the renderer and whoever runs the game.
   The renderer asks which seats are played on this device, asks for a seat's view, sends actions and
   is told what happened. Offline that is LocalTable (the reference engine plus bot timers); online
   it will be a socket client with the same localSeats / view(seat) / dispatch(action) / subscribe(fn). */
import type { Action, TableView } from '../game';
import type { EngineEvent, ErrorCode, Seat } from '../protocol/generated';

/** The redacted view of one seat at the moment an update happened. */
export type GetView = (seat: Seat) => TableView;

/** Called once per accepted action with what happened and the views right after it. */
export type TableListener = (events: EngineEvent[], getView: GetView) => void;

/**
 * Why an action was not taken. A server answers with one of its error codes; `REJECTED` is the
 * offline engine saying no, and `TIMEOUT` is no answer at all (see dispatchWithin).
 */
export type DispatchCode = ErrorCode | 'REJECTED' | 'TIMEOUT';

/**
 * The table's answer to one action. `ok` only says the action was accepted: what it did arrives
 * through `subscribe`, for the sender as for everyone else. A failed action changed nothing.
 */
export type DispatchResult = { ok: true } | { ok: false; code: DispatchCode; message: string };

export interface Table {
  /**
   * The seats played on this device, in seat order. Offline that is every human at the table: one
   * in a solo game, several in pass-and-play. Online it is the one seat the server gave this session.
   * A seat that is not listed is somebody else's, bot or human, and is never shown from the inside.
   */
  readonly localSeats: readonly Seat[];
  /** What `seat` is allowed to see right now. */
  view(seat: Seat): TableView;
  /**
   * Send an action. The promise never rejects: a refused action resolves with `ok: false` and has
   * changed nothing. A table may take as long as it likes to answer, or never answer at all, so
   * code that locks input while it waits goes through dispatchWithin.
   */
  dispatch(action: Action): Promise<DispatchResult>;
  /** Returns the function that unsubscribes. */
  subscribe(fn: TableListener): () => void;
  /** Start whatever the table does on its own after `events` (bots, the pause after a trick). */
  schedule(events?: EngineEvent[]): void;
  /** Cancel everything `schedule` started. */
  stop(): void;
}

/** How long input stays locked on an unanswered action before it is given back. */
export const DISPATCH_TIMEOUT_MS = 8000;

/**
 * `table.dispatch(action)` with a limit on the wait. After `ms` without an answer the result is a
 * failed one with the code `TIMEOUT`, and whatever the table says later is ignored. A table that
 * throws or rejects is reported as `REJECTED`. A table that answers on the turn it was asked, as
 * LocalTable does, never starts the clock.
 */
export function dispatchWithin(
  table: Table,
  action: Action,
  ms: number = DISPATCH_TIMEOUT_MS,
): Promise<DispatchResult> {
  return new Promise((resolve) => {
    let settled = false,
      timer: ReturnType<typeof setTimeout> | null = null;
    const settle = (result: DispatchResult): void => {
      if (settled) return;
      settled = true;
      if (timer != null) clearTimeout(timer);
      resolve(result);
    };
    const broken = (e: unknown): void => {
      console.error(e);
      settle({ ok: false, code: 'REJECTED', message: 'The table could not take that action.' });
    };
    try {
      table.dispatch(action).then(settle, broken);
    } catch (e) {
      broken(e);
    }
    // Queued behind the answer of a table that has already resolved, so that one is never timed.
    queueMicrotask(() => {
      if (settled) return;
      timer = setTimeout(
        () => settle({ ok: false, code: 'TIMEOUT', message: 'The table did not answer in time.' }),
        ms,
      );
    });
  });
}
