/* RemoteTable: the online "transport". The server runs the game; this table shows the one seat the
   server gave this session and sends that seat's intents (docs/protocol.md §5.5).

   Nothing is decided here. A bid, a card or an ability choice goes out without a seat: the server
   takes the seat from the connection. What it did comes back as a `game.update`, also for the
   sender, and only that is ever shown.

   The order of the frames is the contract. An accepted intent is answered `ok`, and the very next
   message on this socket is the `game.update` of that step: that update, once on screen, gives the
   input back. An `err` is the whole answer and gives it back at once. Updates of other seats that
   arrive in between do not. */
import type { Action, TableView } from '../game';
import type {
  Card,
  EngineEvent,
  GameEvent,
  GameId,
  GameResult,
  GameStart,
  GameUpdate,
  Seat,
  TableMode,
} from '../protocol/generated';
import type { ClientRequest } from '../net/messages';
import type { LinkEvent, SocketClient } from '../net/socket';
import type { DispatchResult, Table, TableListener, UpdateInfo } from './table';

/** The intents the server answers with `ok` and then, as the next message, that step's `game.update`. */
const PAIRED: ReadonlySet<ClientRequest['t']> = new Set([
  'game.bid',
  'game.play',
  'game.ability',
  'game.ready',
  'game.leave',
]);

const isEngineEvent = (e: GameEvent): e is EngineEvent => e.type !== 'seatStatus' && e.type !== 'timedOut';

/** The view the renderer draws: the seat's wire view plus what `game.start` said once. */
function tableView(start: GameStart, update: GameUpdate): TableView {
  const s = start.settings,
    deck: Card[] = [];
  for (const card of start.deck) deck[card.id] = card;
  return {
    ...update.view,
    seats: start.seats.map((p) => ({ name: p.name, color: p.color, bot: p.bot })),
    cfg: {
      scoring: s.scoring,
      abilities: s.abilities,
      level: s.botLevel,
      format: s.format,
      loot: s.loot,
      kraken: s.kraken,
      whale: s.whale,
    },
    deck,
  };
}

export class RemoteTable implements Table {
  readonly gameId: GameId;
  /** How the table came to be: a lobby's game, quick play, or ranked. */
  readonly mode: TableMode;
  /** The one seat `game.start` calls `me`. */
  readonly localSeats: readonly Seat[];
  private readonly client: SocketClient;
  private readonly subs = new Set<TableListener>();
  private readonly resultSubs = new Set<() => void>();
  private readonly unlisten: () => void;
  /** The intents sent from here that have no reply yet. */
  private readonly sent = new Set<ClientRequest>();
  private start: GameStart;
  private rev: number;
  private current: TableView;
  /** Set by an `ok`: the intent whose `game.update` is the next message. */
  private due: ClientRequest['t'] | null = null;
  /** This session left the seat: the server sends no further update, and none would be shown. */
  private left = false;
  /** What `game.over` said, once it has: the standings, and in ranked this seat's rating change. */
  private over: GameResult | null = null;

  /** `update` is the snapshot the table opens with: the one after `game.start`, or the one in `welcome`. */
  constructor(client: SocketClient, start: GameStart, update: GameUpdate) {
    this.client = client;
    this.gameId = start.gameId;
    this.mode = start.mode;
    this.localSeats = [start.me];
    this.start = start;
    this.rev = update.rev;
    this.current = tableView(start, update);
    this.unlisten = client.subscribe((event) => this.onLink(event));
  }

  /** Whether this session gave the seat up: the table's last update has arrived, and no other will. */
  get hasLeft(): boolean {
    return this.left;
  }

  /** The result of the game as the server sent it after the last update, or null until it has. */
  get result(): GameResult | null {
    return this.over;
  }

  /** Called once, when `game.over` for this table arrives. */
  onResult(fn: () => void): () => void {
    this.resultSubs.add(fn);
    return () => {
      this.resultSubs.delete(fn);
    };
  }

  /** Only the session's own seat has a view here: the server never sent another one. */
  view(seat: Seat): TableView {
    if (seat !== this.start.me) throw new Error('An online table shows one seat: the one the server gave this session');
    return this.current;
  }

  subscribe(fn: TableListener): () => void {
    this.subs.add(fn);
    return () => {
      this.subs.delete(fn);
    };
  }

  /**
   * Send the seat's intent. `ok: true` means the server accepted it, nothing more: what it did
   * arrives through `subscribe`. `advance` is the player saying "ready for the next round".
   */
  dispatch(action: Action): Promise<DispatchResult> {
    const request = this.intent(action);
    if (!request)
      return Promise.resolve({ ok: false, code: 'REJECTED', message: 'That seat is not played from this device.' });
    return this.send(request);
  }

  /**
   * Give the seat up for good. The update that answers it is the last one (`last` in its info), and
   * a bot plays the seat from that step. The result of the game still arrives later, as `game.over`.
   */
  leave(): Promise<DispatchResult> {
    return this.send({ t: 'game.leave' });
  }

  /** After a reconnect: `welcome` is the whole truth, so whatever was known or waited for is dropped. */
  resync(start: GameStart, update: GameUpdate): void {
    this.start = start;
    this.rev = update.rev;
    this.current = tableView(start, update);
    this.due = null;
    this.left = false;
    this.emit([], { unlock: true, last: false });
  }

  /** Nothing to run: the server has the timers. */
  schedule(): void {}
  stop(): void {}

  /** Stop listening to the socket. The table is of no use afterwards. */
  dispose(): void {
    this.unlisten();
    this.subs.clear();
    this.resultSubs.clear();
    this.sent.clear();
  }

  private intent(action: Action): ClientRequest | null {
    if (action.type === 'advance') return { t: 'game.ready' };
    if (action.seat !== this.start.me) return null;
    const v = this.current,
      at = { round: v.round, trick: v.won.reduce((a, b) => a + b, 0) + v.log[v.round].destroyed };
    switch (action.type) {
      case 'bid':
        return { t: 'game.bid', at, bid: action.bid };
      case 'play':
        return action.as
          ? { t: 'game.play', at, card: action.card, as: action.as }
          : { t: 'game.play', at, card: action.card };
      case 'ability':
        return { t: 'game.ability', at, choice: action.choice };
    }
  }

  private async send(request: ClientRequest): Promise<DispatchResult> {
    this.sent.add(request);
    const result = await this.client.request(request);
    this.sent.delete(request);
    return result.ok ? { ok: true } : { ok: false, code: result.code, message: result.message };
  }

  private onLink(event: LinkEvent): void {
    if (event.type === 'welcome') return; // whoever opened this table calls resync() with it
    if (event.type === 'status') {
      // A closed socket ends every id waiting on it, and with it the update that was due.
      if (event.status !== 'online') this.due = null;
      return;
    }
    // The result follows the last update. It is kept for whoever shows the end of the game; what
    // it means for an update that was still due is decided below, as for any other frame.
    if (event.type === 'push' && event.message.t === 'game.over' && event.message.gameId === this.gameId) {
      this.over = event.message.result;
      Array.from(this.resultSubs).forEach((fn) => fn());
    }
    const due = this.due;
    this.due = null;
    if (event.type === 'push' && event.message.t === 'game.update' && event.message.gameId === this.gameId)
      return this.take(event.message, due);
    // Anything else where the update was due: the server broke the pair. The input is given back anyway.
    if (due) this.settle(due);
    if (
      event.type === 'reply' &&
      this.sent.delete(event.request) &&
      event.reply.t === 'ok' &&
      PAIRED.has(event.request.t)
    )
      this.due = event.request.t;
  }

  private take(update: GameUpdate, due: ClientRequest['t'] | null): void {
    if (this.left) return;
    const fresh = update.rev > this.rev;
    if (!fresh && !due) return; // older than what is on screen: dropped
    if (fresh) {
      this.rev = update.rev;
      this.current = tableView(this.start, update);
    }
    this.left = due === 'game.leave';
    this.emit(fresh ? update.events.filter(isEngineEvent) : [], { unlock: due != null, last: this.left });
  }

  private settle(due: ClientRequest['t']): void {
    this.left = due === 'game.leave';
    this.emit([], { unlock: true, last: this.left });
  }

  private emit(events: EngineEvent[], info: UpdateInfo): void {
    const view = this.current,
      me = this.start.me;
    const getView = (seat: Seat): TableView => {
      if (seat !== me) throw new Error('An online table shows one seat: the one the server gave this session');
      return view;
    };
    this.subs.forEach((fn) => fn(events, getView, info));
  }
}
