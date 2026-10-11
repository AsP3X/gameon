/* LocalTable: the offline "transport". It holds the state, runs the bots on timers and notifies
   the UI with (events, getView). getView(seat) returns the redacted view for that seat at that moment.
   Ported from the legacy build (legacy/Skull King Tavern.html, section 5) without changing behavior.
   The one difference is how the game is saved: the legacy class called the storage layer itself,
   this one is handed a `persist` function, so it does not depend on the renderer. */
import { Bots, Engine } from '../game';
import type { Action, GameState, ReduceResult, TableView } from '../game';
import type { EngineEvent, Seat } from '../protocol/generated';
import type { Table, TableListener } from './table';

export class LocalTable implements Table {
  state: GameState;
  private readonly persist: (state: GameState) => void;
  private readonly subs = new Set<TableListener>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private readonly pendingBids = new Set<Seat>();

  /** `persist` is called with every new state, before the listeners hear about it. */
  constructor(state: GameState, persist: (state: GameState) => void = () => {}) {
    this.state = state;
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

  dispatch(action: Action): ReduceResult {
    const r = Engine.reduce(this.state, action);
    if (r.error) {
      console.warn('Rejected', action, r.error);
      return r;
    }
    this.state = r.state;
    this.persist(this.state);
    const snap = this.state,
      getView = (seat: Seat): TableView => Engine.view(snap, seat);
    this.subs.forEach((fn) => fn(r.events, getView));
    this.schedule(r.events);
    return r;
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
            this.dispatch({ type: 'bid', seat: i, bid: Bots.bid(this.state, i) });
        });
      });
      return;
    }
    this.stop();
    if (s.phase === 'playing' && s.turn != null && s.seats[s.turn].bot) {
      const seat = s.turn;
      this.later(has('bidsRevealed') ? 1500 : has('trickCollected') || has('abilityUsed') ? 700 : 850, () =>
        this.dispatch({ type: 'play', seat, ...Bots.play(this.state, seat) }),
      );
    } else if (s.phase === 'ability' && s.pending && s.seats[s.pending.seat].bot) {
      const seat = s.pending.seat;
      this.later(1900, () => this.dispatch({ type: 'ability', seat, choice: Bots.ability(this.state, seat) }));
    } else if (s.phase === 'trickEnd') this.later(1600, () => this.dispatch({ type: 'advance' }));
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
