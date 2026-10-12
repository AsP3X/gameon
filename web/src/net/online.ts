/* Online: what this device knows about its session on the server: the connection, who the player
   is, the lobby they sit in, the queue they wait in and the table they play at. All of it is the
   server's: `welcome` is a complete snapshot and replaces everything, and between snapshots the
   state only changes by what the server sends. The intents here ask; they never change the state
   themselves.

   The account calls go over REST (src/net/api.ts). Registering and editing the profile keep the
   session, so the answer's `Me` is taken as it is. Logging in replaces the session and logging out
   ends it: the socket of the old one is given up, and what was known about it with it.

   The pages around the game (src/gameon) show who the player is without a connection: `identify`
   asks over REST, and `me` is then known while the status is still `idle`.

   The screens read it with subscribe() and getState(), which is what React's useSyncExternalStore
   wants: getState() returns the same object until something changed.

   One thing is kept on the device between two pages (`OnlineMemory`): whether the player was seated
   in a lobby or at a table, so a reload connects again by itself, and which seat they had in a
   running game, so the result of a game that ended in between can say where they finished. Both are
   conveniences. Where the player really is, is what the next `welcome` says. */
import type {
  CloseReason,
  Credentials,
  ErrorCode,
  GameId,
  GameOver,
  GameSettings,
  GameStart,
  GameUpdate,
  LadderPage,
  Lobby,
  LobbyId,
  LobbySummary,
  Me,
  Profile,
  ProfilePatch,
  QueueMode,
  QueueStatus,
  Seat,
  ServerConfig,
  UserId,
  Visibility,
} from '../protocol/generated';
import { RemoteTable } from '../table/remoteTable';
import { DISPATCH_TIMEOUT_MS } from '../table/table';
import type { DispatchResult } from '../table/table';
import type { Api, ApiResult } from './api';
import type { ClientRequest } from './messages';
import type { LinkEvent, LinkStatus, SocketClient } from './socket';

/** Why the player is back at the hub, until they have read it. */
export type Notice =
  | { kind: 'lobbyClosed'; reason: CloseReason }
  /**
   * A game ended while its table was not on screen: the seat was left, or the result arrived after a
   * reconnect. `place` is null only when the result did not say whose seat it is about and this
   * device does not remember one. `left` and `lost` are what this device remembers: the seat was
   * given up, or it was closed for being offline for two turns in a row.
   */
  | {
      kind: 'gameOver';
      left: boolean;
      lost: boolean;
      place: number | null;
      seats: number;
      forfeited: boolean;
      delta: number | null;
    }
  /**
   * The server closed this player's seat in a running game: they were offline for two turns in a
   * row. The game goes on without them. In a ranked game that is a forfeit.
   */
  | { kind: 'seatLost'; ranked: boolean };

/** What this device knows about a game it sat in. `seat` is null when only the server's word that the seat is lost is known. */
interface Played {
  seat: Seat | null;
  left: boolean;
  lost?: boolean;
}

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

/** What a page leaves behind for the next one. Plain JSON. */
export interface Remembered {
  /** The player sat in a lobby or at a table when the server was last heard. */
  seated: boolean;
  /** The seat played in each game that has not reported its result yet, and how it was given up. */
  games: Record<GameId, Played>;
}
/** Where `Remembered` is kept: localStorage in the page, an object in a test. */
export interface OnlineMemory {
  load(): Remembered | null;
  save(remembered: Remembered): void;
}

/** What `identify` learned: the server knows this browser, it does not, or it could not be asked. */
export type Identity = 'known' | 'nobody' | 'failed';

/**
 * The answer to `startSolo`. `TIMEOUT` is no answer in the time an action gets at a table, and
 * `OFFLINE` a server that cannot be reached: after either, the game is played on the device.
 */
export type SoloOutcome = { ok: true } | { ok: false; code: ErrorCode | 'OFFLINE' | 'TIMEOUT'; message: string };

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
  /** The seat this device played in each game it opened, and whether it left or lost it. */
  private readonly played: Map<GameId, Played>;
  private readonly memory: OnlineMemory | null;
  private seated: boolean;
  /** The guest this page made so that a sign-up had a session to upgrade, until that sign-up went through. */
  private fresh: UserId | null = null;
  /** The connection has said its `welcome`: where the player sits is known, not remembered. */
  private greeted = false;
  /** Counts the sessions this page has had: a login or a logout starts the next one. */
  private era = 0;
  /** The question `identify` has out, and whether it may make a guest. */
  private identifying: { create: boolean; answer: Promise<Identity> } | null = null;

  constructor(client: SocketClient, api: Api, memory: OnlineMemory | null = null) {
    this.client = client;
    this.api = api;
    this.memory = memory;
    const remembered = memory?.load();
    this.seated = remembered?.seated === true;
    this.played = new Map(Object.entries(remembered?.games ?? {}));
    this.unlisten = client.subscribe((event) => this.onLink(event));
  }

  /** Whether the last page on this device left a seat behind: then this one connects without being asked. */
  get wasSeated(): boolean {
    return this.seated;
  }

  /** The server's clock, in Unix milliseconds: what a deadline or a cooldown the server named is measured against. */
  serverNow = (): number => this.client.serverNow();

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

  /**
   * Hang up and forget what the server said. The server keeps the seat for as long as its grace
   * period says, and the device still remembers that there was one, unless `forget` says the player
   * walked away on purpose.
   */
  close(forget = false): void {
    this.client.stop();
    this.greeted = false;
    this.state.table?.dispose();
    this.starting = null;
    this.state = { ...EMPTY, config: this.state.config };
    if (forget) {
      this.seated = false;
      this.remember();
    }
    this.notify();
  }

  /** Stop listening for good. */
  dispose(): void {
    this.close();
    this.unlisten();
    this.subs.clear();
  }

  /* ---------- the account ---------- */

  /**
   * Who this browser is to the server, asked over REST: the pages around the game show it without
   * a connection. A browser with no session stays one (`GET /me`), unless `create` says the player
   * is on their way in: then it gets a guest (`POST /auth/guest`), as a connection would give it.
   */
  identify(create = false): Promise<Identity> {
    const asked = this.identifying;
    // One question at a time: two that both made a guest would leave the page with one and the cookie with the other.
    if (asked) return asked.create || !create ? asked.answer : asked.answer.then(() => this.identify(true));
    const answer = this.whoAmI(create).finally(() => {
      this.identifying = null;
    });
    this.identifying = { create, answer };
    return answer;
  }

  private async whoAmI(create: boolean): Promise<Identity> {
    if (!this.state.config) void this.loadConfig();
    const before = this.state.me?.user.id ?? null,
      era = this.era,
      r = create ? await this.api.guest() : await this.api.me();
    // A login, a logout or a `welcome` that arrived in between knows better than this answer. A
    // connection that was only hung up does not: who the browser is has not changed with it.
    const now = this.state.me?.user.id ?? null,
      same = era === this.era && (now === before || now == null);
    if (r.ok) {
      if (same) this.set({ me: r.value });
      return 'known';
    }
    if (r.code !== 'UNAUTHENTICATED') return 'failed';
    // The session this page remembered is gone, and no connection says otherwise.
    if (same && now != null && this.state.status === 'idle') this.set({ me: null });
    return 'nobody';
  }

  /**
   * Sign up from a page that asks for no display name (docs/handover/075, the answer to 064).
   * `register` upgrades the guest of the session, so a browser without one gets a guest first, and
   * the account made of that guest takes the username as its name: it was never offered another.
   * A guest who was there before keeps the name they play under.
   */
  async signUp(credentials: Credentials): Promise<Outcome> {
    if (!this.state.me) {
      const who = await this.api.me();
      if (who.ok) this.set({ me: who.value });
      else if (who.code !== 'UNAUTHENTICATED') return who;
      else {
        const made = await this.api.guest();
        if (!made.ok) return made;
        this.fresh = made.value.user.id;
        this.set({ me: made.value });
      }
    }
    const r = await this.api.register(credentials);
    if (!r.ok) return r;
    this.set({ me: r.value });
    if (this.fresh === r.value.user.id) {
      this.fresh = null;
      // The account exists either way. A name that could not be set is changed on the profile.
      const named = await this.api.patchMe({ name: credentials.username });
      if (named.ok) this.set({ me: named.value });
    }
    return { ok: true };
  }

  /** Give this guest a username and a password. The player stays who they are. */
  async register(credentials: Credentials): Promise<Outcome> {
    const r = await this.api.register(credentials);
    if (r.ok) this.set({ me: r.value });
    return outcome(r);
  }

  /**
   * Become that account. The session changes, so a connection that was up is made again with the
   * new one. A page that had none (the sign-in page of the frame) still has none afterwards.
   */
  async login(credentials: Credentials): Promise<Outcome> {
    const r = await this.api.login(credentials);
    if (!r.ok) return r;
    const linked = this.state.status !== 'idle';
    this.era++;
    this.close();
    this.fresh = null;
    this.set({ me: r.value });
    if (linked) this.open();
    return { ok: true };
  }

  /** End the session and hang up. Whoever plays online next on this device starts as a new guest. */
  async logout(): Promise<Outcome> {
    const r = await this.api.logout();
    // No session to end is the state that was asked for.
    if (!r.ok && r.code !== 'UNAUTHENTICATED') return r;
    this.era++;
    this.close();
    return { ok: true };
  }

  /** Change the display name, the colour, or both. */
  async saveProfile(patch: ProfilePatch): Promise<Outcome> {
    const r = await this.api.patchMe(patch);
    if (r.ok) this.set({ me: r.value });
    return outcome(r);
  }

  /** The stored steps of a finished game this session sat. */
  record(gameId: string): ReturnType<Api['gameLog']> {
    return this.api.gameLog(gameId);
  }

  /** One page of this player's finished games: the first, or the one after the page whose `next` is given. */
  games(limit: number, after?: string): ReturnType<Api['games']> {
    return this.api.games(limit, after);
  }

  /** Another player, as the server knows them. */
  profile(id: UserId): Promise<ApiResult<Profile>> {
    return this.api.user(id);
  }

  /** One page of the ladder: the first, or the one after the page whose `next` is given. */
  ladder(after?: string): Promise<ApiResult<LadderPage>> {
    return this.api.ladder(after);
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

  /**
   * Open a table. `seatBots` false asks for one that seats no bots (`allowBots: false`). Otherwise
   * the field is left out, which the server reads as a table that seats them.
   */
  createLobby(visibility: Visibility, settings: GameSettings, seatBots = true): Promise<Outcome> {
    return this.ask({ t: 'lobby.create', visibility, settings, ...(seatBots ? {} : { allowBots: false }) });
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

  /**
   * Wait for a quick-play or a ranked table. The game starts by itself when the server has formed
   * one. Whether this player may queue for ranked is the server's to say.
   */
  async joinQueue(mode: QueueMode): Promise<Outcome> {
    const r = await this.ask({ t: 'queue.join', mode });
    // The refusal carries no time. `Me` does: read it again so the screen can say until when.
    if (!r.ok && r.code === 'QUEUE_COOLDOWN') void this.refreshMe();
    return r;
  }
  leaveQueue(): Promise<Outcome> {
    return this.ask({ t: 'queue.leave' });
  }

  /* ---------- solo ---------- */

  /**
   * Start a game alone against bots on the server (`solo.start`). It connects first, and waits for
   * the `welcome`: a player who already sits somewhere is not asked for, and is told so as the
   * server would (`ALREADY_SEATED`). The table itself arrives as state, after the `ok`.
   *
   * The whole of it has `ms` to be answered, the time an action at a table gets. With no answer by
   * then the result is `TIMEOUT`, and whatever the server says later is not waited for.
   */
  startSolo(settings: GameSettings, ms: number = DISPATCH_TIMEOUT_MS): Promise<SoloOutcome> {
    this.open();
    return new Promise((resolve) => {
      let asked = false,
        settled = false;
      const done = (answer: SoloOutcome): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unlisten();
        resolve(answer);
      };
      const timer = setTimeout(
        () => done({ ok: false, code: 'TIMEOUT', message: 'The server did not answer in time.' }),
        ms,
      );
      const look = (): void => {
        if (asked || settled || !this.greeted || this.state.status !== 'online') return;
        const { table, lobby, queue } = this.state;
        if (table || lobby || queue)
          return done({ ok: false, code: 'ALREADY_SEATED', message: 'You are already at a table.' });
        asked = true;
        void this.ask({ t: 'solo.start', settings }).then(done);
      };
      const unlisten = this.subscribe(look);
      look();
    });
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
    // Leaving a ranked game starts a cooldown, and only `Me` says until when.
    if (left && table.mode === 'ranked') void this.refreshMe();
    this.remember();
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

  /** The player's own record changed on the server (a game ended, a ranked game was left): ask for it again. */
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
        if (event.status !== 'online') this.greeted = false;
        return this.set({ status: event.status });
      case 'welcome': {
        // The whole truth: nothing from before the reconnect survives it.
        const { me, lobby, queue, game } = event.welcome;
        const open = this.state.table;
        this.starting = null;
        this.greeted = true;
        let table: RemoteTable | null = null;
        if (game && open && open.gameId === game.start.gameId) {
          open.resync(game.start, game.update);
          table = open;
        } else {
          open?.dispose();
          if (game) table = this.seat(game.start, game.update, false);
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
            return this.set({ table: this.seat(start, m, true), queue: null });
          }
          case 'game.over':
            return this.gameOver(m);
          case 'seat.lost': {
            // Said once, after the `welcome` that no longer has the game. The result still follows when the game ends.
            const played = this.played.get(m.gameId);
            if (played) played.lost = true;
            else this.played.set(m.gameId, { seat: null, left: false, lost: true });
            this.remember();
            return this.set({ notice: { kind: 'seatLost', ranked: m.mode === 'ranked' } });
          }
          default:
            return;
        }
      }
    }
  }

  /** `opening` is the update right after `game.start`; the other way in is the snapshot of a `welcome`. */
  private seat(start: GameStart, update: GameUpdate, opening: boolean): RemoteTable {
    if (!this.played.has(start.gameId)) this.played.set(start.gameId, { seat: start.me, left: false });
    return new RemoteTable(this.client, start, update, opening);
  }

  /**
   * The result of a game. At an open table the end screen already shows it. Anywhere else it is
   * news: it never puts a table back.
   *
   * The message names the receiver's seat (`seat`, §5.5). The seat this device remembers is only
   * for a message without one, which the protocol still allows.
   */
  private gameOver(over: GameOver): void {
    const played = this.played.get(over.gameId),
      r = over.result,
      seat = 'seat' in over && typeof over.seat === 'number' ? over.seat : (played?.seat ?? null);
    this.played.delete(over.gameId);
    this.remember();
    void this.refreshMe();
    if (this.state.table?.gameId === over.gameId) return;
    this.set({
      notice: {
        kind: 'gameOver',
        left: played?.left ?? false,
        lost: played?.lost ?? false,
        place: seat == null ? null : (r.places[seat] ?? null),
        seats: r.places.length,
        forfeited: seat != null && r.forfeited.includes(seat),
        delta: r.rating ? r.rating.delta : null,
      },
    });
  }

  private set(patch: Partial<OnlineState>): void {
    this.state = { ...this.state, ...patch };
    // Only what the server said counts: while the link is down, the last known seat stays remembered.
    if (this.state.status === 'online') {
      this.seated = this.state.lobby != null || this.state.table != null;
      this.remember();
    }
    this.notify();
  }

  private remember(): void {
    this.memory?.save({ seated: this.seated, games: Object.fromEntries(this.played) });
  }

  private notify(): void {
    this.subs.forEach((fn) => fn());
  }
}
