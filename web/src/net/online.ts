/* Online: what this device knows about its session on the server: the connection, who the player
   is, the lobby they sit in and the table they play at. All of it is the server's: `welcome` is a
   complete snapshot and replaces everything, and between snapshots the state only changes by what
   the server sends. The lobby intents here ask; they never change the state themselves.

   The screens read it with subscribe() and getState(), which is what React's useSyncExternalStore
   wants: getState() returns the same object until something changed. */
import type {
  CloseReason,
  ErrorCode,
  GameId,
  GameOver,
  GameSettings,
  GameStart,
  GameUpdate,
  Lobby,
  Me,
  Seat,
  Visibility,
} from '../protocol/generated';
import { RemoteTable } from '../table/remoteTable';
import type { DispatchResult } from '../table/table';
import type { ClientRequest } from './messages';
import type { LinkEvent, LinkStatus, SocketClient } from './socket';

/** Why the player is back at the hub, until they have read it. */
export type Notice =
  | { kind: 'lobbyClosed'; reason: CloseReason }
  /**
   * A game ended while its table was not on screen: the seat was left, or the result arrived after a
   * reconnect. `place` is known when the table was opened from this page; after a reload it is not.
   */
  | {
      kind: 'gameOver';
      left: boolean;
      place: number | null;
      seats: number;
      forfeited: boolean;
      delta: number | null;
    };

export interface OnlineState {
  status: LinkStatus;
  /** null until the first `welcome`. */
  me: Me | null;
  lobby: Lobby | null;
  table: RemoteTable | null;
  notice: Notice | null;
}

/** The answer to a lobby intent. `ok` says the server accepted it; the lobby itself arrives as state. */
export type Outcome = { ok: true } | { ok: false; code: ErrorCode | 'OFFLINE'; message: string };

const EMPTY: OnlineState = { status: 'idle', me: null, lobby: null, table: null, notice: null };

export class Online {
  private readonly client: SocketClient;
  private readonly subs = new Set<() => void>();
  private readonly unlisten: () => void;
  private state: OnlineState = EMPTY;
  /** A `game.start` whose first `game.update` has not arrived: the table opens with both. */
  private starting: GameStart | null = null;
  /** The seat this page played in each game it opened, and whether it left it. */
  private readonly played = new Map<GameId, { seat: Seat; left: boolean }>();

  constructor(client: SocketClient) {
    this.client = client;
    this.unlisten = client.subscribe((event) => this.onLink(event));
  }

  getState = (): OnlineState => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.subs.add(fn);
    return () => {
      this.subs.delete(fn);
    };
  };

  /** Connect and stay connected. */
  open(): void {
    this.client.start();
  }

  /** Try to connect now instead of waiting: the "Try now" and "Play here" buttons. */
  retry(): void {
    this.client.retry();
  }

  /** Hang up and forget everything. The server keeps the seat for as long as its grace period says. */
  close(): void {
    this.client.stop();
    this.state.table?.dispose();
    this.starting = null;
    this.state = EMPTY;
    this.notify();
  }

  /** Stop listening for good. */
  dispose(): void {
    this.close();
    this.unlisten();
    this.subs.clear();
  }

  /* ---------- lobby intents ---------- */

  createLobby(visibility: Visibility, settings: GameSettings): Promise<Outcome> {
    return this.ask({ t: 'lobby.create', visibility, settings });
  }
  joinLobby(code: string): Promise<Outcome> {
    return this.ask({ t: 'lobby.join', code });
  }
  leaveLobby(): Promise<Outcome> {
    return this.ask({ t: 'lobby.leave' });
  }
  setReady(ready: boolean): Promise<Outcome> {
    return this.ask({ t: 'lobby.ready', ready });
  }
  setSettings(settings: GameSettings): Promise<Outcome> {
    return this.ask({ t: 'lobby.settings', settings });
  }
  addBot(): Promise<Outcome> {
    return this.ask({ t: 'lobby.addBot' });
  }
  /** `index` is the bot's place in `lobby.members`. */
  removeBot(index: number): Promise<Outcome> {
    return this.ask({ t: 'lobby.removeBot', index });
  }
  startGame(): Promise<Outcome> {
    return this.ask({ t: 'lobby.start' });
  }

  /* ---------- the table ---------- */

  /**
   * Give up the seat at the open table. The table's last update follows the answer; whoever shows
   * the table takes it down then and calls closeTable().
   */
  leaveTable(): Promise<DispatchResult> {
    const table = this.state.table;
    if (!table) return Promise.resolve({ ok: false, code: 'NOT_IN_GAME', message: 'No table is open.' });
    return table.leave();
  }

  /**
   * The table is off the screen: after the game ended, or after the seat was left. Leaving a seat
   * also leaves its lobby as far as this page knows; if the server sees it differently, its next
   * `lobby.state` or `welcome` says so.
   */
  closeTable(): void {
    const table = this.state.table;
    if (!table) return;
    const played = this.played.get(table.gameId),
      left = table.hasLeft;
    if (played) played.left = left;
    table.dispose();
    this.set({ table: null, lobby: left ? null : this.state.lobby });
  }

  dismissNotice(): void {
    if (this.state.notice) this.set({ notice: null });
  }

  /* ---------- what the server says ---------- */

  private async ask(request: ClientRequest): Promise<Outcome> {
    const result = await this.client.request(request);
    return result.ok ? { ok: true } : { ok: false, code: result.code, message: result.message };
  }

  private onLink(event: LinkEvent): void {
    switch (event.type) {
      case 'status':
        return this.set({ status: event.status });
      case 'welcome': {
        // The whole truth: nothing from before the reconnect survives it.
        const { me, lobby, game } = event.welcome;
        const open = this.state.table;
        this.starting = null;
        let table: RemoteTable | null = null;
        if (game && open && open.gameId === game.start.gameId) {
          open.resync(game.start, game.update);
          table = open;
        } else {
          open?.dispose();
          if (game) table = this.seat(game.start, game.update);
        }
        return this.set({ status: 'online', me, lobby, table });
      }
      case 'reply': {
        if (event.reply.t !== 'ok') return;
        const t = event.request.t;
        if ((t === 'lobby.create' || t === 'lobby.join') && event.reply.lobby) this.set({ lobby: event.reply.lobby });
        else if (t === 'lobby.leave') this.set({ lobby: null });
        return;
      }
      case 'push': {
        const m = event.message;
        switch (m.t) {
          case 'lobby.state':
            return this.set({ lobby: m.lobby });
          case 'lobby.closed':
            return this.set({ lobby: null, notice: { kind: 'lobbyClosed', reason: m.reason } });
          case 'game.start':
            this.starting = m;
            return;
          case 'game.update': {
            const start = this.starting;
            if (!start || start.gameId !== m.gameId) return; // an open table hears its updates itself
            this.starting = null;
            this.state.table?.dispose();
            return this.set({ table: this.seat(start, m) });
          }
          case 'game.over':
            return this.gameOver(m);
          default:
            return;
        }
      }
    }
  }

  private seat(start: GameStart, update: GameUpdate): RemoteTable {
    this.played.set(start.gameId, { seat: start.me, left: false });
    return new RemoteTable(this.client, start, update);
  }

  /**
   * The result of a game. At an open table the end screen already shows it. Anywhere else it is
   * news: it never puts a table back.
   */
  private gameOver(over: GameOver): void {
    const played = this.played.get(over.gameId),
      r = over.result;
    this.played.delete(over.gameId);
    if (this.state.table?.gameId === over.gameId) return;
    this.set({
      notice: {
        kind: 'gameOver',
        left: played?.left ?? false,
        place: played ? (r.places[played.seat] ?? null) : null,
        seats: r.places.length,
        forfeited: played != null && r.forfeited.includes(played.seat),
        delta: r.rating ? r.rating.delta : null,
      },
    });
  }

  private set(patch: Partial<OnlineState>): void {
    this.state = { ...this.state, ...patch };
    this.notify();
  }

  private notify(): void {
    this.subs.forEach((fn) => fn());
  }
}
