/* Online: what this device knows about its session on the server: the connection, who the player
   is, the lobby they sit in, the queue they wait in and the table they play at. All of it is the
   server's: `welcome` is a complete snapshot and replaces everything, and between snapshots the
   state only changes by what the server sends. The intents here ask; they never change the state
   themselves.

   The account calls go over REST (src/net/api.ts). Registering and editing the profile keep the
   session, so the answer's `Me` is taken as it is. Logging in replaces the session and logging out
   ends it: the socket of the old one is given up, and what was known about it with it.

   The screens read it with subscribe() and getState(), which is what React's useSyncExternalStore
   wants: getState() returns the same object until something changed. */
import type {
  CloseReason,
  Credentials,
  ErrorCode,
  GameId,
  GameOver,
  GameSettings,
  GameStart,
  GameUpdate,
  Lobby,
  LobbyId,
  LobbySummary,
  Me,
  Profile,
  ProfilePatch,
  QueueStatus,
  Seat,
  ServerConfig,
  UserId,
  Visibility,
} from '../protocol/generated';
import { RemoteTable } from '../table/remoteTable';
import type { DispatchResult } from '../table/table';
import type { Api, ApiResult } from './api';
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
  /** The quick-play queue the player waits in. */
  queue: QueueStatus | null;
  table: RemoteTable | null;
  notice: Notice | null;
  /** What the server said about itself (`GET /config`): the quick-play rules are in it. null until it answered. */
  config: ServerConfig | null;
}

/** The answer to an intent. `ok` says the server accepted it; what it changed arrives as state. */
export type Outcome = { ok: true } | { ok: false; code: ErrorCode | 'OFFLINE'; message: string };

const EMPTY: OnlineState = {
  status: 'idle',
  me: null,
  lobby: null,
  queue: null,
  table: null,
  notice: null,
  config: null,
};
const outcome = (r: ApiResult<unknown>): Outcome => (r.ok ? { ok: true } : r);

export class Online {
  private readonly client: SocketClient;
  private readonly api: Api;
  private readonly subs = new Set<() => void>();
  private readonly unlisten: () => void;
  private state: OnlineState = EMPTY;
  /** A `game.start` whose first `game.update` has not arrived: the table opens with both. */
  private starting: GameStart | null = null;
  /** The seat this page played in each game it opened, and whether it left it. */
  private readonly played = new Map<GameId, { seat: Seat; left: boolean }>();

  constructor(client: SocketClient, api: Api) {
    this.client = client;
    this.api = api;
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
    if (!this.state.config) void this.loadConfig();
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
    this.state = { ...EMPTY, config: this.state.config };
    this.notify();
  }

  /** Stop listening for good. */
  dispose(): void {
    this.close();
    this.unlisten();
    this.subs.clear();
  }

  /* ---------- the account ---------- */

  /** Give this guest a username and a password. The player stays who they are. */
  async register(credentials: Credentials): Promise<Outcome> {
    const r = await this.api.register(credentials);
    if (r.ok) this.set({ me: r.value });
    return outcome(r);
  }

  /** Become that account. The session changes, so the connection is made again with the new one. */
  async login(credentials: Credentials): Promise<Outcome> {
    const r = await this.api.login(credentials);
    if (!r.ok) return r;
    this.close();
    this.set({ me: r.value });
    this.open();
    return { ok: true };
  }

  /** End the session and hang up. Whoever plays online next on this device starts as a new guest. */
  async logout(): Promise<Outcome> {
    const r = await this.api.logout();
    // No session to end is the state that was asked for.
    if (!r.ok && r.code !== 'UNAUTHENTICATED') return r;
    this.close();
    return { ok: true };
  }

  /** Change the display name, the colour, or both. */
  async saveProfile(patch: ProfilePatch): Promise<Outcome> {
    const r = await this.api.patchMe(patch);
    if (r.ok) this.set({ me: r.value });
    return outcome(r);
  }

  /** Another player, as the server knows them. */
  profile(id: UserId): Promise<ApiResult<Profile>> {
    return this.api.user(id);
  }

  /* ---------- lobby intents ---------- */

  /** The open public tables, as they are right now. Nothing pushes changes to this list. */
  async publicLobbies(): Promise<ApiResult<LobbySummary[]>> {
    const r = await this.api.lobbies();
    return r.ok ? { ok: true, value: r.value.lobbies } : r;
  }
  /** Sit down at a table from the public list. */
  joinPublicLobby(lobbyId: LobbyId): Promise<Outcome> {
    return this.ask({ t: 'lobby.join', lobbyId });
  }

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

  /* ---------- the queue ---------- */

  /** Wait for a quick-play table. The game starts by itself when the server has formed one. */
  joinQueue(): Promise<Outcome> {
    return this.ask({ t: 'queue.join', mode: 'casual' });
  }
  leaveQueue(): Promise<Outcome> {
    return this.ask({ t: 'queue.leave' });
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

  private async loadConfig(): Promise<void> {
    const r = await this.api.config();
    if (r.ok) this.set({ config: r.value });
  }

  /** The player's own record changed on the server (a game ended): ask for it again. */
  private async refreshMe(): Promise<void> {
    const id = this.state.me?.user.id,
      r = await this.api.me();
    // Whoever this page was when it asked is who the answer is for.
    if (r.ok && id != null && this.state.me?.user.id === id && r.value.user.id === id) this.set({ me: r.value });
  }

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
        const { me, lobby, queue, game } = event.welcome;
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
        return this.set({ status: 'online', me, lobby, queue, table });
      }
      case 'reply': {
        if (event.reply.t !== 'ok') return;
        const t = event.request.t;
        if ((t === 'lobby.create' || t === 'lobby.join') && event.reply.lobby) this.set({ lobby: event.reply.lobby });
        else if (t === 'lobby.leave') this.set({ lobby: null });
        else if (t === 'queue.join' && event.reply.queue) this.set({ queue: event.reply.queue });
        else if (t === 'queue.leave') this.set({ queue: null });
        return;
      }
      case 'push': {
        const m = event.message;
        switch (m.t) {
          case 'lobby.state':
            return this.set({ lobby: m.lobby });
          case 'lobby.closed':
            return this.set({ lobby: null, notice: { kind: 'lobbyClosed', reason: m.reason } });
          case 'queue.status':
            return this.set({ queue: m.queue });
          case 'game.start':
            this.starting = m;
            return;
          case 'game.update': {
            const start = this.starting;
            if (!start || start.gameId !== m.gameId) return; // an open table hears its updates itself
            this.starting = null;
            this.state.table?.dispose();
            // A table the queue made is where the queue ends: no `queue.status` says so.
            return this.set({ table: this.seat(start, m), queue: null });
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
    void this.refreshMe();
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
