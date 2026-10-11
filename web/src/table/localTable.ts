/* LocalTable: the offline "transport". It holds the state, runs the bots on timers and notifies
   the UI with (events, getView). getView(seat) returns the redacted view for that seat at that moment.
   Ported from the legacy build (legacy/Skull King Tavern.html, section 5) without changing behavior.
   Three things differ. The legacy class called the storage layer itself; this one is handed a
   `persist` function, so it does not depend on the renderer. It is told which seats are played on
   this device instead of leaving the renderer to read that off the `bot` flags. And dispatch answers
   with a promise, as a table on a server has to; here it is resolved before dispatch returns. */
import { Bots, Engine } from '../game';
import type { Action, GameState, SeatConfig, TableView } from '../game';
import type { EngineEvent, Seat } from '../protocol/generated';
import type { DispatchResult, Table, TableListener } from './table';

/** The local seats of an offline table: nobody else is connected, so every human sits at this device. */
export const humanSeats = (seats: readonly SeatConfig[]): Seat[] => seats.flatMap((p, i) => (p.bot ? [] : [i]));

export class LocalTable implements Table {
  state: GameState;
  readonly localSeats: readonly Seat[];
  private readonly persist: (state: GameState) => void;
  private readonly subs = new Set<TableListener>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private readonly pendingBids = new Set<Seat>();

  /**
   * `localSeats` are the seats played on this device: the table runs the bots, and every other seat
   * has to be somebody's. `persist` is called with every new state, before the listeners hear about it.
   */
  constructor(state: GameState, localSeats: readonly Seat[], persist: (state: GameState) => void = () => {}) {
    const stray = state.seats.findIndex((p, i) => p.bot === localSeats.includes(i));
    if (stray >= 0 || localSeats.some((i) => !state.seats[i]))
      throw new Error('An offline table needs every human seat, and only those, played on this device');
    this.state = state;
    this.localSeats = [...localSeats].sort((a, b) => a - b);
    this.persist = persist;
  }

  view(seat: Seat): TableView {
    return Engine.view(this.state, seat);
  }

  subscribe(fn: TableListener): () => void {
    this.subs.add(fn);
    return () => {
      this.subs.delete(fn);
    };
  }

  /** Answered by the engine on the spot: the listeners have heard before this returns, and the promise is resolved. */
  dispatch(action: Action): Promise<DispatchResult> {
    return Promise.resolve(this.apply(action));
  }

  private apply(action: Action): DispatchResult {
    const r = Engine.reduce(this.state, action);
    if (r.error) {
      console.warn('Rejected', action, r.error);
      return { ok: false, code: 'REJECTED', message: r.error };
    }
    this.state = r.state;
    this.persist(this.state);
    const snap = this.state,
      getView = (seat: Seat): TableView => Engine.view(snap, seat);
    this.subs.forEach((fn) => fn(r.events, getView));
    this.schedule(r.events);
    return { ok: true };
  }

  /** Bots act on timers so humans can follow along. A server would do the same. */
  schedule(events: EngineEvent[] = []): void {
    const s = this.state,
      has = (t: EngineEvent['type']): boolean => events.some((e) => e.type === t);
    if (s.phase === 'bidding') {
      s.seats.forEach((p, i) => {
        if (!p.bot || s.bids[i] != null || this.pendingBids.has(i)) return;
        this.pendingBids.add(i);
        this.later(600 + this.pendingBids.size * 300 + Math.random() * 700, () => {
          this.pendingBids.delete(i);
          if (this.state.phase === 'bidding' && this.state.bids[i] == null)
            this.apply({ type: 'bid', seat: i, bid: Bots.bid(this.state, i) });
        });
      });
      return;
    }
    this.stop();
    if (s.phase === 'playing' && s.turn != null && s.seats[s.turn].bot) {
      const seat = s.turn;
      this.later(has('bidsRevealed') ? 1500 : has('trickCollected') || has('abilityUsed') ? 700 : 850, () =>
        this.apply({ type: 'play', seat, ...Bots.play(this.state, seat) }),
      );
    } else if (s.phase === 'ability' && s.pending && s.seats[s.pending.seat].bot) {
      const seat = s.pending.seat;
      this.later(1900, () => this.apply({ type: 'ability', seat, choice: Bots.ability(this.state, seat) }));
    } else if (s.phase === 'trickEnd') this.later(1600, () => this.apply({ type: 'advance' }));
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, ms));
  }

  stop(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.pendingBids.clear();
  }
}
