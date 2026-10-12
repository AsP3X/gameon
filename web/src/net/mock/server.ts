/* A mock server that speaks protocol v1 (docs/protocol.md) inside the page, for the tests and for
   `?mock` in development. It stands where the Rust server will stand: the client talks to it over
   the same `Wire` it would get from a WebSocket, in JSON text frames, and is told nothing it would
   not be told there.

   What it keeps to:
   - One reply per client `id`, on the socket the message arrived on.
   - The table handles one step at a time. An accepted intent is written as `ok` and then that
     step's `game.update`, with nothing between them on that socket. An `err` is the whole answer.
   - A bot move, a timeout and `advance` are steps of their own.
   - The acting seat comes from the connection. A seat named in a message is not read.
   - Every seat is sent its own view and nobody else's.

   What it is not: a security boundary or a reference for the rules. Accepted play goes through the
   reference engine in src/game (the seeded shuffle and the bots that read the whole state included),
   which the real server must never run. Accounts live in the page's memory and are gone with it,
   passwords included, as they were typed. There are no emotes, no away detection and no rate limit
   on REST. A dropped seat is closed after two missed turns in a row, as §5.5 says, and it keeps
   that across a reload of the page, which the server it stands for does not yet do across a restart.

   Ranked follows the rules of docs/protocol.md §4, §5.4 and §5.5 in everything a screen can see:
   the tier bands, placement ending with the fifth game, the cooldown that doubles with every
   leave, the season that is the UTC calendar quarter, and a ladder paged by user id. Two things it
   does not do. It does not rate: where the server runs Weng-Lin, the mock moves a rating by a
   fixed step for each place, so its numbers have the right shape and mean nothing. And it has no
   skill window: the first four accounts in the ranked queue sit down, whatever their ratings.
   It also never sees a season end, so it has no soft reset. And since it never marks a seat away,
   it has no forfeit for a ranked seat that was away for most of the game (§5.6): in the mock a
   forfeit is a `game.leave`.

   Solo follows `solo.start` of docs/protocol.md §5 as the server plays it: the player in seat 0,
   a bot in every other seat, no clock on the player's own bid, play or ability, and one unfinished
   solo game per player. While the player has no socket the table stands still: no bot plays, no
   trick is collected, no round goes on. Leaving it is `ok` and then nothing: the game is gone,
   with no result and no stats.

   A browser() is one browser profile: a cookie jar that holds at most one session, the REST calls
   that carry it, and the sockets opened with it. */
import { Bots, Engine, Rules } from '../../game';
import type { Action, GameState } from '../../game';
import type {
  ActionLogEntry,
  ClientMessage,
  Credentials,
  Deadline,
  EngineView,
  ErrorCode,
  GameEvent,
  GameOver,
  GameSettings,
  GameStart,
  GameUpdate,
  LadderEntry,
  LadderPage,
  Lobby,
  LobbySummary,
  Me,
  Member,
  Profile,
  QueueMode,
  QueueStatus,
  Rating,
  Season,
  Seat,
  SeatLost,
  SeatStatus,
  ServerConfig,
  TableColor,
  TableKind,
  TableMode,
  Timers,
  Welcome,
} from '../../protocol/generated';
import type { Backend, RestResponse } from '../api';
import { PROTOCOL } from '../messages';
import type { ServerMessage } from '../messages';
import type { Transport, Wire } from '../socket';

const COLORS: TableColor[] = ['#1cb0f6', '#ff9600', '#ce82ff', '#ff4b4b', '#58cc02', '#e5a400', '#2b70c9', '#ff5fbf'];
const BOT_NAMES = ['Anne', 'Calico', 'Morgan', 'Ching', 'Kidd', 'Grace', 'Bart', 'Rackham'];
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const FRAME_LIMIT = 4096;
const RATE_PER_SECOND = 20;
const HELLO_WITHIN_MS = 5000;
const CLOSE_BAD_FRAME = 1003;
const CLOSE_TOO_BIG = 1009;
const CLOSE_SUPERSEDED = 4001;
const CLOSE_DROPPED = 1006;
/** The session behind the socket was logged out or replaced. The protocol names no code for it. */
const CLOSE_SESSION_ENDED = 1008;

/** The defaults of §5.6. */
export const STANDARD_TIMERS: Timers = {
  bidMs: 45_000,
  playMs: 30_000,
  abilityMs: 30_000,
  trickEndMs: 2500,
  roundEndMs: 20_000,
  disconnectGraceMs: 60_000,
};
const PACE = { relaxed: 2, standard: 1, fast: 0.5 } as const;
/** How long the table waits before it plays the turn of a seat that is `out` (§5.6). */
const OUT_SEAT_MS = 1500;
/** The ruleset of §4 that quick play and ranked are played with: the classic deal, ten rounds of 1 to 10 cards. */
export const STANDARD: GameSettings = {
  maxPlayers: 4,
  scoring: 'classic',
  format: 'classic',
  loot: false,
  kraken: false,
  whale: false,
  abilities: false,
  botLevel: 'normal',
  pace: 'standard',
};
/** §4: 3–16 characters of A–Z a–z 0–9 _. The reserved list is not named, so the mock has none. */
const USERNAME = /^[A-Za-z0-9_]{3,16}$/;
const NAME_MAX = 16;
/** The tiers and the value each one ends below (§4). From 48 it is Skull King. */
const TIERS: readonly (readonly [below: number, name: string])[] = [
  [8, 'Deckhand'],
  [16, 'Bosun'],
  [24, 'Quartermaster'],
  [32, 'First Mate'],
  [40, 'Captain'],
  [48, 'Pirate Lord'],
];
const tierOf = (value: number): string => TIERS.find(([below]) => value < below)?.[1] ?? 'Skull King';
/** The ranked games of a season that are placement games: the fifth one ends placement. */
const PLACEMENT_GAMES = 5;
/**
 * What a ranked game does to a rating in the mock, by place. NOT the rating model: the server
 * runs Weng-Lin and the number is whatever that gives. This only makes ratings move, so tiers and
 * the end of placement can be seen.
 */
const MOCK_RATING_STEP = [6, 2, -2, -6];
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
/** How long the n-th ranked leave of a season closes the ranked queue: 15 minutes, doubled each time, a day at most. */
const cooldownAfter = (leaves: number): number => Math.min(DAY_MS, 15 * MINUTE_MS * 2 ** (leaves - 1));
/** The season that contains `at`: the UTC calendar quarter. Season 1 is 2026 Q1. */
function seasonAt(at: number): Season {
  const date = new Date(at),
    year = date.getUTCFullYear(),
    quarter = Math.floor(date.getUTCMonth() / 3);
  return {
    id: (year - 2026) * 4 + quarter + 1,
    name: `${year} Q${quarter + 1}`,
    startsAt: Date.UTC(year, quarter * 3, 1),
    endsAt: Date.UTC(year, quarter * 3 + 3, 1),
  };
}
/** Strings in the order of their UTF-8 bytes, which is how the ladder breaks a tie of values. */
function byBytes(a: string, b: string): number {
  const x = BYTES.encode(a),
    y = BYTES.encode(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}
const BYTES = new TextEncoder();
const LADDER_PAGE = 25;
const LADDER_MAX = 100;

/** The HTTP status of each code REST can answer with (§3). */
const STATUS: Partial<Record<ErrorCode, number>> = {
  UNAUTHENTICATED: 401,
  NOT_FOUND: 404,
  VALIDATION: 400,
  USERNAME_TAKEN: 409,
  USERNAME_INVALID: 400,
  WEAK_PASSWORD: 400,
  INVALID_CREDENTIALS: 401,
  ALREADY_REGISTERED: 409,
};

const MESSAGES: Partial<Record<ErrorCode, string>> = {
  UNAUTHENTICATED: 'You are not signed in.',
  NOT_FOUND: 'Nothing is there.',
  VALIDATION: 'That message is not valid.',
  USERNAME_TAKEN: 'That username is taken.',
  USERNAME_INVALID: 'A username is 3 to 16 letters, digits or underscores.',
  WEAK_PASSWORD: 'A password cannot be empty.',
  INVALID_CREDENTIALS: 'Wrong username or password.',
  ALREADY_REGISTERED: 'This player already has an account.',
  ACCOUNT_REQUIRED: 'Ranked needs an account.',
  QUEUE_COOLDOWN: 'You cannot queue yet.',
  RATE_LIMITED: 'Too many messages. Slow down.',
  PROTOCOL_UNSUPPORTED: 'This page is too old for the server. Reload to update.',
  LOBBY_NOT_FOUND: 'No table has that code.',
  LOBBY_FULL: 'That table is full.',
  BOTS_DISABLED: 'This table does not seat bots.',
  LOBBY_STARTED: 'That game has already started.',
  ALREADY_SEATED: 'You are already at a table.',
  NOT_IN_LOBBY: 'You are not at a table.',
  NOT_HOST: 'Only the host can do that.',
  NOT_READY: 'Everyone has to be ready, and a table needs two pirates. A bot is not one of them.',
  NOT_IN_GAME: 'You are not in a game.',
  NOT_YOUR_TURN: 'It is not your turn.',
  STALE_ACTION: 'The table has moved on.',
  ILLEGAL_MOVE: 'That move is not allowed.',
  BID_OUT_OF_RANGE: 'That bid is out of range.',
  INTERNAL: 'Something went wrong.',
};

export interface MockOptions {
  now?: () => number;
  random?: () => number;
  timers?: Partial<Timers>;
  /** How long a bot seat waits before it moves, so people can follow. */
  bot?: { minMs: number; maxMs: number };
  /** How long the casual queue waits for a full table before bots take the open seats. The protocol names no time. */
  queueFillMs?: number;
  /** Where the server keeps its state between two lives. Without one it forgets everything. */
  store?: MockStore;
}
export interface MockStore {
  load(): string | null;
  save(data: string): void;
}

type Timer = ReturnType<typeof setTimeout>;

/** One browser profile: the cookie jar. `session` is the player its cookie stands for, if it has one. */
interface Browser {
  session: Account | null;
}
/** One player: a guest, or a registered account that any browser may log in to. */
interface Account {
  /** What a transport names to be this player again. null when nobody can come back as them. */
  session: string | null;
  me: Me;
  /** The login of a registered account: the username in lower case, and the password as it was typed. */
  login: { name: string; password: string } | null;
  conn: Conn | null;
  room: Room | null;
  game: Game | null;
  /** The queue this player waits in, and since when. */
  queued: { mode: QueueMode; since: number } | null;
  /** How many ranked games this player has left this season: each one makes the next cooldown longer. */
  leaves: number;
  /** Results of games that ended while this player had no socket: written right after the next `welcome`. */
  owed: GameOver[];
  /** The seat this player was kicked from for inactivity, until a `welcome` has been followed by it. */
  lost: SeatLost | null;
}
interface Conn {
  account: Account;
  /** The browser whose session opened it. */
  browser: Browser;
  wire: Wire;
  /** The server still reads from and writes to it. */
  open: boolean;
  /** The client hung up: nothing is delivered any more. */
  gone: boolean;
  /** The network dropped: frames already on their way are lost, and the client only learns that it closed. */
  cut: boolean;
  greeted: boolean;
  stamps: number[];
  helloTimer: Timer | null;
}
interface Room {
  lobby: Lobby;
  /** The humans at the table, in the order they came: the next host is the first of them. */
  humans: Account[];
}
interface Game {
  id: string;
  /** The lobby the table came from and goes back to. A table the queue made has none. */
  room: Room | null;
  mode: TableMode;
  /** Which table it is, where the server says so: only a solo game is named (`game.start.table`). */
  table: TableKind | null;
  settings: GameSettings;
  state: GameState;
  rev: number;
  /** Who plays each seat. null is a bot seat, or one whose player left. */
  players: (Account | null)[];
  colors: TableColor[];
  /** The tier each seat is announced with in `game.start`: its account's at the deal, if it had a rating. */
  tiers: (string | null)[];
  /** Those who left, and the seat they gave up. In ranked that is a forfeit. */
  leavers: { account: Account; seat: Seat }[];
  /** Those whose seat was closed for missing two turns in a row while offline, in that order. In ranked that is a forfeit too. */
  kicked: { account: Account; seat: Seat }[];
  /** The deadlines each seat has missed in a row since its socket dropped. */
  misses: number[];
  status: SeatStatus[];
  ready: boolean[];
  deadline: Deadline | null;
  timers: Timer[];
  over: boolean;
}
/** The socket an intent arrived on, the `id` to answer, and the seat that socket plays. */
interface Actor {
  conn: Conn;
  id: number;
  seat: Seat;
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x);
const oneOf = <T extends string>(x: unknown, values: readonly T[]): x is T =>
  typeof x === 'string' && values.some((v) => v === x);

function isSettings(x: unknown): x is GameSettings {
  return (
    isRecord(x) &&
    isInt(x.maxPlayers) &&
    x.maxPlayers >= 2 &&
    x.maxPlayers <= 8 &&
    oneOf(x.scoring, ['classic', 'rascal']) &&
    oneOf(x.format, ['classic', 'brawl', 'swift', 'even', 'whirl']) &&
    oneOf(x.botLevel, ['easy', 'normal', 'hard']) &&
    oneOf(x.pace, ['relaxed', 'standard', 'fast']) &&
    typeof x.loot === 'boolean' &&
    typeof x.kraken === 'boolean' &&
    typeof x.whale === 'boolean' &&
    typeof x.abilities === 'boolean'
  );
}

const isCredentials = (x: unknown): x is Credentials =>
  isRecord(x) && typeof x.username === 'string' && typeof x.password === 'string';
const credentials = (x: unknown): Credentials | null => (isCredentials(x) ? x : null);

/** A display name as §4 wants it: trimmed, 1–16 characters, no control characters. null if it is not one. */
function displayName(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  const name = x.trim(),
    length = Array.from(name).length;
  return length >= 1 && length <= NAME_MAX && !/\p{Cc}/u.test(name) ? name : null;
}

export class MockServer {
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly timers: Timers;
  private readonly bot: { minMs: number; maxMs: number };
  private readonly queueFillMs: number;
  private readonly store: MockStore | null;
  private readonly sessions = new Map<string, Account>();
  private readonly rooms = new Set<Room>();
  private readonly games = new Set<Game>();
  /** Finished games a seat may read back. The key is the game id. */
  private readonly records = new Map<string, { users: Set<string>; entries: ActionLogEntry[] }>();
  private readonly conns = new Set<Conn>();
  /** Every player there ever was, by user id. */
  private readonly accounts = new Map<string, Account>();
  /** The two queues, each in the order its players joined. */
  private readonly queues: Record<QueueMode, Account[]> = { casual: [], ranked: [] };
  private queueTimer: Timer | null = null;
  private ids = 0;
  private down = false;
  private saving = false;
  private ended = false;

  constructor({
    now = Date.now,
    random = Math.random,
    timers = {},
    bot = { minMs: 800, maxMs: 1500 },
    queueFillMs = 6000,
    store,
  }: MockOptions = {}) {
    this.now = now;
    this.random = random;
    this.timers = { ...STANDARD_TIMERS, ...timers };
    this.bot = bot;
    this.queueFillMs = queueFillMs;
    this.store = store ?? null;
    this.resume();
  }

  /**
   * One browser profile with no session yet: its REST calls and its sockets share one cookie jar.
   * Opening a socket without a session asks for a guest first, as the page does (`POST /auth/guest`).
   */
  browser(): Backend {
    return this.backend({ session: null });
  }

  /** REST and sockets for one named session, created if this server has not seen it. */
  page(session: string): Backend {
    return this.backend({ session: this.sessions.get(session) ?? this.guest(session) });
  }

  /**
   * A player and the way to connect as them. Every call of the returned transport is another socket
   * of the same player. With a `session`, it is the player that session named before, also in an
   * earlier life of a server with a store.
   */
  transport(session?: string): Transport {
    const account = session != null ? (this.sessions.get(session) ?? this.guest(session)) : this.guest();
    return this.backend({ session: account }).transport;
  }

  /** Who a session is, making a guest of one nobody has seen: what `POST /auth/guest` answers. */
  me(session: string): Me {
    return this.profile(this.sessions.get(session) ?? this.guest(session));
  }

  private backend(browser: Browser): Backend {
    return {
      transport: () =>
        Promise.resolve().then(() => {
          if (this.down) throw new Error('The mock server is down');
          browser.session ??= this.guest();
          return this.connect(browser.session, browser);
        }),
      rest: (method, path, body) => Promise.resolve().then(() => this.http(browser, method, path, body)),
    };
  }

  /**
   * Cut every connection, as a network drop would: replies on their way are lost with it.
   * With `down`, nothing connects until restore().
   */
  drop(down = false): void {
    this.down = down;
    this.conns.forEach((conn) => {
      conn.cut = true;
      this.hangUp(conn, CLOSE_DROPPED);
    });
  }
  restore(): void {
    this.down = false;
  }

  /**
   * The end of this server, as when its page is closed: no timer fires again, and nothing further
   * is written to the store.
   */
  shutDown(): void {
    this.down = true;
    this.ended = true;
    if (this.queueTimer != null) clearTimeout(this.queueTimer);
    this.queueTimer = null;
    this.games.forEach((game) => this.disarm(game));
    this.conns.forEach((conn) => {
      conn.open = false;
      conn.gone = true;
      if (conn.helloTimer != null) clearTimeout(conn.helloTimer);
    });
    this.conns.clear();
  }

  /* ---------- connections ---------- */

  private guest(session: string | null = null): Account {
    if (session != null) {
      const existing = this.sessions.get(session);
      if (existing) return existing;
    }
    const n = 1000 + Math.floor(this.random() * 9000);
    const account: Account = {
      session,
      me: {
        user: { id: this.uuid(), name: `Guest ${n}`, color: COLORS[n % COLORS.length], tier: null },
        guest: true,
        username: null,
        active: null,
        cooldownUntil: null,
        stats: { games: 0, wins: 0, bidsMade: 0, bidsTotal: 0, bestScore: null },
        rating: null,
      },
      login: null,
      conn: null,
      room: null,
      game: null,
      queued: null,
      leaves: 0,
      owed: [],
      lost: null,
    };
    this.accounts.set(account.me.user.id, account);
    if (session != null) this.sessions.set(session, account);
    return account;
  }

  private connect(account: Account, browser: Browser): Wire {
    const wire: Wire = {
      send: (data) => {
        queueMicrotask(() => {
          if (conn.open) this.receive(conn, data);
        });
      },
      close: () => {
        conn.gone = true;
        this.hangUp(conn, null);
      },
      onmessage: null,
      onclose: null,
    };
    const conn: Conn = {
      account,
      browser,
      wire,
      open: true,
      gone: false,
      cut: false,
      greeted: false,
      stamps: [],
      helloTimer: null,
    };
    conn.helloTimer = setTimeout(() => this.hangUp(conn, CLOSE_BAD_FRAME), HELLO_WITHIN_MS);
    this.conns.add(conn);
    return wire;
  }

  /** Queue one frame. Frames reach the client one by one, in the order they were written. */
  private write(conn: Conn | null, message: ServerMessage): void {
    if (!conn?.open) return;
    const data = JSON.stringify(message);
    queueMicrotask(() => {
      if (!conn.gone && !conn.cut) conn.wire.onmessage?.(data);
    });
    this.touch();
  }

  private fail(conn: Conn, re: number, code: ErrorCode, message = MESSAGES[code] ?? code): void {
    this.write(conn, { t: 'err', re, code, message });
  }

  /** End a connection. `code` is what the client is told, after the frames already written; null if it hung up itself. */
  private hangUp(conn: Conn, code: number | null): void {
    if (!conn.open) return;
    conn.open = false;
    this.conns.delete(conn);
    if (conn.helloTimer != null) clearTimeout(conn.helloTimer);
    if (code != null)
      queueMicrotask(() => {
        if (!conn.gone) conn.wire.onclose?.(code);
      });
    const account = conn.account;
    if (account.conn !== conn) return;
    account.conn = null;
    this.presence(account, false);
  }

  /** A player's socket came or went: the table and the lobby hear about it. */
  private presence(account: Account, connected: boolean): void {
    const room = account.room;
    if (room) {
      const member = room.lobby.members.find((m) => m.kind === 'human' && m.user.id === account.me.user.id);
      if (member?.kind === 'human') member.connected = connected;
      this.pushLobby(room);
    }
    const game = account.game,
      seat = game ? game.players.indexOf(account) : -1;
    if (!game || seat < 0 || game.over) return;
    const status: SeatStatus = connected ? 'online' : 'offline';
    // Sitting back down before the kick forgives the misses, and a fresh drop starts the count again.
    game.misses[seat] = 0;
    game.status[seat] = status;
    this.step(game, [{ type: 'seatStatus', seat, status }]);
  }

  private receive(conn: Conn, data: string): void {
    if (data.length > FRAME_LIMIT) return this.hangUp(conn, CLOSE_TOO_BIG);
    let raw: unknown;
    try {
      raw = JSON.parse(data);
    } catch {
      return this.hangUp(conn, CLOSE_BAD_FRAME);
    }
    // Without an id there is nothing to reply to, and unknown message types are ignored (§1).
    if (!isRecord(raw) || typeof raw.t !== 'string' || !isInt(raw.id)) return;
    const now = this.now();
    conn.stamps = conn.stamps.filter((t) => now - t < 1000);
    if (conn.stamps.length >= RATE_PER_SECOND) return this.fail(conn, raw.id, 'RATE_LIMITED');
    conn.stamps.push(now);
    // The fields of each message are checked where they are used: this only names the shape.
    const message = raw as ClientMessage;
    if (message.t === 'hello') return this.hello(conn, message);
    if (!conn.greeted) return this.fail(conn, message.id, 'UNAUTHENTICATED', 'Say hello first.');
    if (message.t === 'ping') return this.write(conn, { t: 'ok', re: message.id, serverTime: this.now() });
    if (message.t === 'solo.start') return this.onSolo(conn, message);
    if (message.t.startsWith('lobby.')) return this.onLobby(conn, message);
    if (message.t.startsWith('game.')) return this.onGame(conn, message);
    if (message.t.startsWith('queue.')) return this.onQueue(conn, message);
    this.fail(conn, message.id, 'VALIDATION');
  }

  private hello(conn: Conn, m: Extract<ClientMessage, { t: 'hello' }>): void {
    if (conn.greeted) return this.fail(conn, m.id, 'VALIDATION');
    if (m.protocol !== PROTOCOL) {
      this.fail(conn, m.id, 'PROTOCOL_UNSUPPORTED');
      return this.hangUp(conn, CLOSE_BAD_FRAME);
    }
    if (conn.helloTimer != null) clearTimeout(conn.helloTimer);
    conn.helloTimer = null;
    const account = conn.account,
      older = account.conn;
    // One socket per player: the new one replaces the old one.
    if (older) {
      this.write(older, { t: 'superseded' });
      account.conn = null;
      this.hangUp(older, CLOSE_SUPERSEDED);
    }
    conn.greeted = true;
    account.conn = conn;
    this.write(conn, { t: 'ok', re: m.id });
    this.write(conn, this.welcome(account));
    // Once, after the `welcome` that no longer has the game, and before a result that is owed.
    if (account.lost) this.write(conn, account.lost);
    account.lost = null;
    account.owed.splice(0).forEach((over) => this.write(conn, over));
    this.presence(account, true);
  }

  private welcome(account: Account): Welcome {
    const game = account.game,
      seat = game ? game.players.indexOf(account) : -1;
    return {
      t: 'welcome',
      me: this.profile(account),
      serverTime: this.now(),
      lobby: account.room ? account.room.lobby : null,
      queue: account.queued ? this.queueStatus(account) : null,
      game: game && seat >= 0 ? { start: this.gameStart(game, seat), update: this.update(game, seat, []) } : null,
    };
  }

  /** `Me` as REST and `welcome` give it: with where a reconnect would land. */
  private profile(account: Account): Me {
    // A cooldown that has run out is no cooldown.
    if (account.me.cooldownUntil != null && account.me.cooldownUntil <= this.now()) account.me.cooldownUntil = null;
    return {
      ...account.me,
      active: account.game
        ? account.game.table === 'solo'
          ? {
              kind: 'game',
              id: account.game.id,
              table: 'solo',
              // The deal the game is at, counted from 1, and the length of its format: not the schedule the deck capped.
              round: account.game.state.round + 1,
              rounds: Rules.FORMATS[account.game.settings.format].seq.length,
              bots: account.game.state.seats.filter((seat) => seat.bot).length,
            }
          : { kind: 'game', id: account.game.id }
        : account.room
          ? { kind: 'lobby', id: account.room.lobby.id }
          : account.queued
            ? // A queue's id is its mode: `casual` is written down, `ranked` is the mock's.
              { kind: 'queue', id: account.queued.mode }
            : null,
    };
  }

  /* ---------- REST ---------- */

  /** One request under /api/v1, answered as §3 and §4 say: the status and the JSON body. */
  private http(browser: Browser, method: string, target: string, body: unknown): RestResponse {
    if (this.down) throw new Error('The mock server is down');
    const ok = (value: unknown): RestResponse => ({ status: 200, body: value });
    const fail = (code: ErrorCode, message = MESSAGES[code] ?? code): RestResponse => ({
      status: STATUS[code] ?? 500,
      body: { error: { code, message } },
    });
    // A query belongs to the request, not to the path: only the ladder reads one.
    const [path, search = ''] = target.split('?', 2);
    const user = /^\/users\/([^/]+)$/.exec(path);
    const gameLog = /^\/games\/([^/]+)\/log$/.exec(path);
    const methods: Record<string, string> = {
      '/health': 'GET',
      '/config': 'GET',
      '/auth/guest': 'POST',
      '/auth/register': 'POST',
      '/auth/login': 'POST',
      '/auth/logout': 'POST',
      '/me': 'GET PATCH',
      '/lobbies': 'GET',
      '/ladder': 'GET',
    };
    const allowed = user || gameLog ? 'GET' : methods[path];
    if (allowed == null) return fail('NOT_FOUND');
    if (!allowed.split(' ').includes(method)) return fail('VALIDATION');

    // The public paths.
    if (path === '/health') return ok({ ok: true });
    if (path === '/config') return ok(this.config());
    if (path === '/auth/guest') {
      browser.session ??= this.guest();
      return ok(this.profile(browser.session));
    }
    if (path === '/auth/login') {
      const c = credentials(body);
      if (!c) return fail('VALIDATION');
      const found = this.byUsername(c.username);
      if (!found || found.login?.password !== c.password) return fail('INVALID_CREDENTIALS');
      // The session is replaced: whoever this browser was before is logged out of it.
      if (browser.session !== found) this.endSession(browser);
      browser.session = found;
      return ok(this.profile(found));
    }

    // The ladder of the current season is anybody's to read: no session is asked for, and none is made.
    if (path === '/ladder') {
      const page = this.ladder(new URLSearchParams(search));
      return typeof page === 'string' ? fail(page) : ok(page);
    }

    const account = browser.session;
    if (!account) return fail('UNAUTHENTICATED');
    if (path === '/auth/logout') {
      this.endSession(browser);
      return { status: 204, body: null };
    }
    if (path === '/auth/register') {
      if (account.login) return fail('ALREADY_REGISTERED');
      const c = credentials(body);
      if (!c) return fail('VALIDATION');
      if (!USERNAME.test(c.username)) return fail('USERNAME_INVALID');
      if (this.byUsername(c.username)) return fail('USERNAME_TAKEN');
      // §3 has the code and no rule. The mock refuses only the empty password.
      if (c.password === '') return fail('WEAK_PASSWORD');
      // The guest is upgraded in place: the same user id, name, colour and stats, now with a login.
      account.login = { name: c.username.toLowerCase(), password: c.password };
      account.me.guest = false;
      account.me.username = c.username;
      return ok(this.profile(account));
    }
    if (path === '/me') {
      if (method === 'GET') return ok(this.profile(account));
      if (!isRecord(body)) return fail('VALIDATION');
      // Both fields are checked before either is written: a refused patch changes nothing.
      const name = 'name' in body ? displayName(body.name) : undefined,
        color = 'color' in body ? body.color : undefined;
      if (name === null || (color !== undefined && !oneOf(color, COLORS))) return fail('VALIDATION');
      // The lobby's member shows this same user, so a table the player sits at hears of the change.
      if (name !== undefined) account.me.user.name = name;
      if (color !== undefined) account.me.user.color = color;
      if (account.room && (name !== undefined || color !== undefined)) this.pushLobby(account.room);
      return ok(this.profile(account));
    }
    if (path === '/lobbies') {
      const lobbies: LobbySummary[] = [...this.rooms]
        .filter((r) => r.lobby.visibility === 'public' && r.lobby.state === 'open')
        .map(({ lobby }) => {
          const host = lobby.members.find((m) => m.kind === 'human' && m.user.id === lobby.hostId);
          return {
            id: lobby.id,
            hostName: host?.kind === 'human' ? host.user.name : '',
            // The host's own colour. A row without a host has none, and no other is put in its place.
            ...(host?.kind === 'human' ? { hostColor: host.user.color } : {}),
            settings: lobby.settings,
            players: lobby.members.length,
            ...(lobby.allowBots === undefined ? {} : { allowBots: lobby.allowBots }),
          };
        });
      return ok({ lobbies });
    }
    if (gameLog) {
      const kept = this.records.get(gameLog[1]);
      if (!kept?.users.has(account.me.user.id)) return fail('NOT_FOUND');
      return ok({ gameId: gameLog[1], entries: kept.entries });
    }
    if (user) {
      const found = this.accounts.get(user[1]);
      if (!found) return fail('NOT_FOUND');
      const profile: Profile = { user: found.me.user, stats: found.me.stats, rating: found.me.rating };
      return ok(profile);
    }
    return fail('NOT_FOUND');
  }

  /** Keep the steps of a finished game for the seats that played it. */
  private remember(game: Game): void {
    const entries: ActionLogEntry[] = [];
    const push = (kind: string, seat: number | null, body: unknown): void => {
      entries.push({ seq: entries.length, kind, seat, body: JSON.stringify(body) });
    };
    game.state.log.forEach((_round, round) => {
      push('deal', null, { round, cards: [] });
    });
    if (entries.length === 0) push('advance', null, {});
    const users = new Set<string>();
    game.players.forEach((account) => {
      if (account) users.add(account.me.user.id);
    });
    game.leavers.forEach(({ account }) => users.add(account.me.user.id));
    this.records.set(game.id, { users, entries });
  }

  private config(): ServerConfig {
    return {
      protocol: PROTOCOL,
      build: 'mock',
      timers: this.timers,
      standard: STANDARD,
      season: seasonAt(this.now()),
      emotes: [],
    };
  }

  /**
   * One page of the current season's ladder: everyone with a ranked game, highest value first, then
   * by display name in byte order, then by user id. Ranks count from 1 with no ties. `after` is the
   * user id of the last row the caller has; `next` is the id of this page's last row, while more
   * follow. Any season but the current one is `NOT_FOUND`; a limit that is not 1 to 100, or an
   * `after` that is not on the ladder, is `VALIDATION`. An entry is the public player and the
   * rating: no username, no stats, no session.
   */
  private ladder(query: URLSearchParams): LadderPage | 'NOT_FOUND' | 'VALIDATION' {
    const season = seasonAt(this.now()),
      limit = query.has('limit') ? Number(query.get('limit')) : LADDER_PAGE,
      after = query.get('after');
    if (query.has('season') && query.get('season') !== String(season.id)) return 'NOT_FOUND';
    if (!isInt(limit) || limit < 1 || limit > LADDER_MAX) return 'VALIDATION';
    const rated = [...this.accounts.values()]
      .flatMap((a) => (a.me.rating ? [{ user: a.me.user, rating: a.me.rating }] : []))
      .sort(
        (a, b) => b.rating.value - a.rating.value || byBytes(a.user.name, b.user.name) || byBytes(a.user.id, b.user.id),
      );
    const from = after == null ? 0 : rated.findIndex((e) => e.user.id === after) + 1;
    if (after != null && from === 0) return 'VALIDATION';
    const entries: LadderEntry[] = rated.slice(from, from + limit).map((e, i) => ({ rank: from + i + 1, ...e }));
    const page: LadderPage = { season, entries };
    if (from + limit < rated.length && entries.length) page.next = entries[entries.length - 1].user.id;
    return page;
  }

  /** Usernames are unique whatever their case. */
  private byUsername(username: string): Account | undefined {
    const name = username.toLowerCase();
    return [...this.accounts.values()].find((a) => a.login?.name === name);
  }

  /**
   * This browser's session is over: logged out, or replaced by a login. Its cookie is gone. If the
   * player's socket is this browser's, it is closed, and they leave an open lobby and the queue; a
   * seat in a running game is kept as it is after any dropped connection.
   */
  private endSession(browser: Browser): void {
    const account = browser.session;
    browser.session = null;
    const conn = account?.conn;
    if (!account || conn?.browser !== browser) return;
    if (account.room?.lobby.state === 'open') this.unseat(account);
    this.unqueue(account);
    this.hangUp(conn, CLOSE_SESSION_ENDED);
  }

  /* ---------- the queue ---------- */

  private onQueue(conn: Conn, m: ClientMessage): void {
    const account = conn.account;
    if (m.t === 'queue.leave') {
      // Leaving a queue one is not in is answered `ok` as well.
      this.unqueue(account);
      return this.write(conn, { t: 'ok', re: m.id });
    }
    if (m.t !== 'queue.join' || !oneOf(m.mode, ['casual', 'ranked'])) return this.fail(conn, m.id, 'VALIDATION');
    const mode = m.mode;
    // Who may ask comes before where they are: a guest is told `ACCOUNT_REQUIRED`, and a leaver
    // `QUEUE_COOLDOWN`, even when seated (§5.4). The message carries no time: `GET /me` does.
    if (mode === 'ranked' && account.me.guest) return this.fail(conn, m.id, 'ACCOUNT_REQUIRED');
    if (mode === 'ranked' && (this.profile(account).cooldownUntil ?? 0) > this.now())
      return this.fail(conn, m.id, 'QUEUE_COOLDOWN');
    if (account.room || account.game || account.queued) return this.fail(conn, m.id, 'ALREADY_SEATED');
    const queue = this.queues[mode];
    account.queued = { mode, since: this.now() };
    queue.push(account);
    this.write(conn, { t: 'ok', re: m.id, queue: this.queueStatus(account) });
    this.pushQueue(mode, account);
    if (queue.length >= STANDARD.maxPlayers) this.seatQueue(mode);
    // Only the casual queue gives up waiting: a ranked table never starts with a bot.
    else if (mode === 'casual') this.queueTimer ??= setTimeout(() => this.seatQueue('casual'), this.queueFillMs);
  }

  private queueStatus(account: Account): QueueStatus {
    const mode = account.queued?.mode ?? 'casual';
    return {
      mode,
      since: account.queued?.since ?? this.now(),
      found: this.queues[mode].length,
      needed: STANDARD.maxPlayers,
    };
  }

  /** A queue changed: everyone waiting in it is told, except the one whose reply already said so. */
  private pushQueue(mode: QueueMode, except?: Account): void {
    this.queues[mode].forEach((a) => {
      if (a !== except) this.write(a.conn, { t: 'queue.status', queue: this.queueStatus(a) });
    });
  }

  private unqueue(account: Account): void {
    if (!account.queued) return;
    const mode = account.queued.mode,
      queue = this.queues[mode];
    account.queued = null;
    queue.splice(queue.indexOf(account), 1);
    this.pushQueue(mode);
    if (mode === 'casual' && !queue.length && this.queueTimer != null) {
      clearTimeout(this.queueTimer);
      this.queueTimer = null;
    }
  }

  /**
   * A table forms: the first four in the queue, or, in the casual queue, whoever waited long enough
   * with bots in the open seats. The queue ends for them without another `queue.status`:
   * `game.start` is what says so. The table has no lobby, so there is none to go back to after the game.
   */
  private seatQueue(mode: QueueMode): void {
    const queue = this.queues[mode];
    if (mode === 'casual') {
      if (this.queueTimer != null) clearTimeout(this.queueTimer);
      this.queueTimer = null;
    }
    const humans = queue.splice(0, STANDARD.maxPlayers);
    if (!humans.length) return;
    humans.forEach((a) => {
      a.queued = null;
    });
    const members: Member[] = humans.map((a) => ({ kind: 'human', user: a.me.user, ready: true, connected: true }));
    while (members.length < STANDARD.maxPlayers) members.push(this.botFor(members, STANDARD.botLevel));
    this.openTable(members, humans, STANDARD, mode, null);
    if (queue.length) {
      this.pushQueue(mode);
      if (mode === 'casual') this.queueTimer = setTimeout(() => this.seatQueue('casual'), this.queueFillMs);
    }
  }

  /* ---------- lobbies ---------- */

  private onLobby(conn: Conn, m: ClientMessage): void {
    const account = conn.account,
      room = account.room,
      ok = (lobby?: Lobby): void => this.write(conn, lobby ? { t: 'ok', re: m.id, lobby } : { t: 'ok', re: m.id });
    if (m.t === 'lobby.create') {
      if (room || account.game || account.queued) return this.fail(conn, m.id, 'ALREADY_SEATED');
      if (!isSettings(m.settings) || !oneOf(m.visibility, ['private', 'public']))
        return this.fail(conn, m.id, 'VALIDATION');
      if (m.allowBots !== undefined && typeof m.allowBots !== 'boolean') return this.fail(conn, m.id, 'VALIDATION');
      const made: Room = {
        lobby: {
          id: this.uuid(),
          code: this.code(),
          mode: 'custom',
          visibility: m.visibility,
          hostId: account.me.user.id,
          settings: { ...m.settings },
          // Kept as it was sent. Left out, the table seats bots.
          ...(m.allowBots === undefined ? {} : { allowBots: m.allowBots }),
          members: [{ kind: 'human', user: account.me.user, ready: false, connected: true }],
          state: 'open',
          gameId: null,
        },
        humans: [account],
      };
      this.rooms.add(made);
      account.room = made;
      return ok(made.lobby);
    }
    if (m.t === 'lobby.join') {
      if (room || account.game || account.queued) return this.fail(conn, m.id, 'ALREADY_SEATED');
      const code = typeof m.code === 'string' ? m.code.trim().toUpperCase() : null;
      const found = [...this.rooms].find((r) => (code != null ? r.lobby.code === code : r.lobby.id === m.lobbyId));
      if (!found) return this.fail(conn, m.id, 'LOBBY_NOT_FOUND');
      if (found.lobby.state !== 'open') return this.fail(conn, m.id, 'LOBBY_STARTED');
      if (found.lobby.members.length >= found.lobby.settings.maxPlayers) return this.fail(conn, m.id, 'LOBBY_FULL');
      found.lobby.members.push({ kind: 'human', user: account.me.user, ready: false, connected: true });
      found.humans.push(account);
      account.room = found;
      ok(found.lobby);
      return this.pushLobby(found);
    }
    if (!room) return this.fail(conn, m.id, 'NOT_IN_LOBBY');
    const lobby = room.lobby,
      host = lobby.hostId === account.me.user.id,
      mine = lobby.members.find((x) => x.kind === 'human' && x.user.id === account.me.user.id);
    if (m.t === 'lobby.leave') {
      if (lobby.state !== 'open') return this.fail(conn, m.id, 'LOBBY_STARTED');
      this.unseat(account);
      return ok();
    }
    if (m.t === 'lobby.ready') {
      if (typeof m.ready !== 'boolean') return this.fail(conn, m.id, 'VALIDATION');
      if (lobby.state !== 'open') return this.fail(conn, m.id, 'LOBBY_STARTED');
      if (mine?.kind === 'human') mine.ready = m.ready;
      ok();
      return this.pushLobby(room);
    }
    // Everything below is the host's.
    if (
      m.t !== 'lobby.settings' &&
      m.t !== 'lobby.addBot' &&
      m.t !== 'lobby.removeBot' &&
      m.t !== 'lobby.kick' &&
      m.t !== 'lobby.start'
    )
      return this.fail(conn, m.id, 'VALIDATION');
    if (!host) return this.fail(conn, m.id, 'NOT_HOST');
    if (lobby.state !== 'open') return this.fail(conn, m.id, 'LOBBY_STARTED');
    switch (m.t) {
      case 'lobby.settings':
        if (!isSettings(m.settings) || m.settings.maxPlayers < lobby.members.length)
          return this.fail(conn, m.id, 'VALIDATION');
        lobby.settings = { ...m.settings };
        lobby.members.forEach((x) => {
          if (x.kind === 'human') x.ready = false;
          else x.level = lobby.settings.botLevel;
        });
        break;
      case 'lobby.addBot': {
        // Only a table somebody opened can say so. A matchmade one has no host to ask.
        if (lobby.allowBots === false) return this.fail(conn, m.id, 'BOTS_DISABLED');
        if (lobby.members.length >= lobby.settings.maxPlayers) return this.fail(conn, m.id, 'LOBBY_FULL');
        lobby.members.push(this.botFor(lobby.members, lobby.settings.botLevel));
        break;
      }
      case 'lobby.removeBot':
        if (!isInt(m.index) || lobby.members[m.index]?.kind !== 'bot') return this.fail(conn, m.id, 'VALIDATION');
        lobby.members.splice(m.index, 1);
        break;
      case 'lobby.kick': {
        const target = room.humans.find((a) => a.me.user.id === m.userId);
        if (!target || target === account) return this.fail(conn, m.id, 'VALIDATION');
        this.unseat(target);
        this.write(target.conn, { t: 'lobby.closed', reason: 'kicked' });
        return ok();
      }
      case 'lobby.start': {
        const humansReady = lobby.members.every((x) => x.kind === 'bot' || x.ready);
        // A table waits for two people: a bot fills a seat, but is not one of the two.
        if (lobby.members.filter((x) => x.kind === 'human').length < 2 || !humansReady)
          return this.fail(conn, m.id, 'NOT_READY');
        ok();
        lobby.state = 'inGame';
        this.openTable(lobby.members, room.humans, lobby.settings, lobby.mode, room);
        return;
      }
    }
    ok();
    this.pushLobby(room);
  }

  /** A bot with a name and a colour nobody at the table has yet. */
  private botFor(members: Member[], level: GameSettings['botLevel']): Member {
    const names = new Set(members.map((x) => (x.kind === 'bot' ? x.name : x.user.name))),
      colors = new Set(members.map((x) => (x.kind === 'bot' ? x.color : x.user.color)));
    return {
      kind: 'bot',
      name: BOT_NAMES.find((n) => !names.has(n)) ?? 'Bot',
      color: COLORS.find((c) => !colors.has(c)) ?? COLORS[0],
      level,
    };
  }

  private pushLobby(room: Room): void {
    room.humans.forEach((a) => this.write(a.conn, { t: 'lobby.state', lobby: room.lobby }));
  }

  /** Take a player out of their lobby. The next human becomes host; a lobby without humans closes. */
  private unseat(account: Account): void {
    const room = account.room;
    if (!room) return;
    account.room = null;
    const lobby = room.lobby,
      id = account.me.user.id;
    room.humans = room.humans.filter((a) => a !== account);
    lobby.members = lobby.members.filter((x) => x.kind === 'bot' || x.user.id !== id);
    if (!room.humans.length) {
      this.rooms.delete(room);
      return;
    }
    if (lobby.hostId === id) lobby.hostId = room.humans[0].me.user.id;
    this.pushLobby(room);
  }

  /* ---------- the table ---------- */

  /**
   * Seat the members in their order and deal. A lobby's table tells the lobby first (`lobby.state`
   * with `inGame`); the queue's table has no lobby to tell.
   */
  private openTable(
    members: Member[],
    humans: Account[],
    s: GameSettings,
    mode: TableMode,
    room: Room | null,
    table: TableKind | null = null,
  ): void {
    const used = new Set<string>();
    // A seat's colour is the member's own, unless a seat before it already has it.
    const color = (wanted: TableColor): TableColor => {
      const c = used.has(wanted) ? (COLORS.find((x) => !used.has(x)) ?? wanted) : wanted;
      used.add(c);
      return c;
    };
    const seats = members.map((x) =>
      x.kind === 'bot'
        ? { name: x.name, color: color(x.color), bot: true }
        : { name: x.user.name, color: color(x.user.color), bot: false },
    );
    const players = members.map((x: Member) =>
      x.kind === 'human' ? (humans.find((a) => a.me.user.id === x.user.id) ?? null) : null,
    );
    const game: Game = {
      id: this.uuid(),
      room,
      mode,
      table,
      settings: s,
      state: Engine.create({
        seats,
        scoring: s.scoring,
        loot: s.loot,
        kraken: s.kraken,
        whale: s.whale,
        abilities: s.abilities,
        level: s.botLevel,
        format: s.format,
        seed: Math.floor(this.random() * 2 ** 32),
      }),
      rev: 0,
      players,
      colors: seats.map((p) => p.color),
      // A seat is announced with the tier its account has at the deal, at any table; a bot's is null.
      tiers: players.map((a) => a?.me.rating?.tier ?? null),
      leavers: [],
      kicked: [],
      misses: players.map(() => 0),
      status: players.map((a) => (a ? (a.conn ? 'online' : 'offline') : 'bot')),
      ready: players.map(() => false),
      deadline: null,
      timers: [],
      over: false,
    };
    this.games.add(game);
    if (room) {
      room.lobby.gameId = game.id;
      this.pushLobby(room);
    }
    this.plan(game);
    players.forEach((account, seat) => {
      if (!account) return;
      account.game = game;
      this.write(account.conn, this.gameStart(game, seat));
      this.write(account.conn, this.update(game, seat, []));
    });
    this.arm(game);
  }

  private gameStart(game: Game, seat: Seat): GameStart {
    const s = game.state;
    return {
      t: 'game.start',
      gameId: game.id,
      mode: game.mode,
      lobbyId: game.room ? game.room.lobby.id : null,
      // Only a solo game is named. Every other table leaves the field out, as the server does.
      ...(game.table === 'solo' ? { table: game.table } : {}),
      settings: game.settings,
      deck: s.deck,
      schedule: s.schedule,
      seats: s.seats.map((p, i) => {
        const account = game.players[i];
        return {
          name: p.name,
          color: game.colors[i],
          bot: p.bot,
          userId: account ? account.me.user.id : null,
          tier: game.tiers[i],
        };
      }),
      me: seat,
    };
  }

  /** What one seat is sent after a step: its own view and nothing of anybody else's. */
  private update(game: Game, seat: Seat, events: GameEvent[]): GameUpdate {
    const { seats: _seats, cfg: _cfg, deck: _deck, ...view } = Engine.view(game.state, seat);
    const wire: EngineView = view;
    return {
      t: 'game.update',
      gameId: game.id,
      rev: game.rev,
      events,
      view: wire,
      table: { status: game.status.slice(), deadline: game.deadline, ready: game.ready.slice() },
    };
  }

  /**
   * `solo.start`: the player alone against bots. Refused for a table size the game does not have,
   * and for a player who already sits somewhere: in a lobby, a queue or a game, a solo game included.
   */
  private onSolo(conn: Conn, m: Extract<ClientMessage, { t: 'solo.start' }>): void {
    const account = conn.account;
    if (!isSettings(m.settings)) return this.fail(conn, m.id, 'VALIDATION');
    if (account.room || account.queued || account.game) return this.fail(conn, m.id, 'ALREADY_SEATED');
    // The pace is stored as standard whatever was sent: a solo table has no clock to scale.
    const settings: GameSettings = { ...m.settings, pace: 'standard' };
    const members: Member[] = [{ kind: 'human', user: account.me.user, ready: true, connected: true }];
    while (members.length < settings.maxPlayers) members.push(this.botFor(members, settings.botLevel));
    this.write(conn, { t: 'ok', re: m.id });
    this.openTable(members, [account], settings, 'custom', null, 'solo');
  }

  private onGame(conn: Conn, m: ClientMessage): void {
    const account = conn.account,
      game = account.game,
      seat = game ? game.players.indexOf(account) : -1,
      actor: Actor = { conn, id: m.id, seat };
    if (!game || seat < 0 || game.over) return this.fail(conn, m.id, 'NOT_IN_GAME');
    const s = game.state;
    switch (m.t) {
      case 'game.bid':
        if (!this.current(game, m.at)) return this.fail(conn, m.id, 'STALE_ACTION');
        if (s.phase !== 'bidding' || s.bids[seat] != null) return this.fail(conn, m.id, 'NOT_YOUR_TURN');
        if (!isInt(m.bid) || m.bid < 0 || m.bid > s.schedule[s.round]) return this.fail(conn, m.id, 'BID_OUT_OF_RANGE');
        return this.act(game, { type: 'bid', seat, bid: m.bid }, [], actor);
      case 'game.play':
        if (!this.current(game, m.at)) return this.fail(conn, m.id, 'STALE_ACTION');
        if (s.phase !== 'playing' || s.turn !== seat) return this.fail(conn, m.id, 'NOT_YOUR_TURN');
        return this.act(game, { type: 'play', seat, card: m.card, as: m.as }, [], actor);
      case 'game.ability':
        if (!this.current(game, m.at)) return this.fail(conn, m.id, 'STALE_ACTION');
        if (s.phase !== 'ability' || s.pending?.seat !== seat) return this.fail(conn, m.id, 'NOT_YOUR_TURN');
        return this.act(game, { type: 'ability', seat, choice: m.choice }, [], actor);
      case 'game.ready':
        if (s.phase !== 'roundEnd') return this.fail(conn, m.id, 'NOT_YOUR_TURN');
        game.ready[seat] = true;
        return this.step(game, [], actor);
      case 'game.emote':
        return this.fail(conn, m.id, 'VALIDATION', 'The mock server accepts no emotes.');
      case 'game.leave': {
        // A solo game that is left is gone: `ok`, and nothing after it. No update, no result, no stats.
        if (game.table === 'solo') {
          this.disarm(game);
          this.games.delete(game);
          account.game = null;
          this.touch();
          return this.write(conn, { t: 'ok', re: m.id });
        }
        // The seat is a bot from this step. The leaver still gets the step's update, and none after it.
        game.status[seat] = 'bot';
        game.players[seat] = null;
        game.leavers.push({ account, seat });
        account.game = null;
        // Leaving a ranked game is a forfeit, and it closes the ranked queue from this moment:
        // for longer with every leave of the season.
        if (game.mode === 'ranked') account.me.cooldownUntil = this.now() + cooldownAfter(++account.leaves);
        this.step(game, [{ type: 'seatStatus', seat, status: 'bot' }], actor);
        return this.unseat(account);
      }
      default:
        this.fail(conn, m.id, 'VALIDATION');
    }
  }

  /** `at` names the round and the tricks already finished in it, as the sender saw them. */
  private current(game: Game, at: unknown): boolean {
    const s = game.state,
      done = s.won.reduce((a, b) => a + b, 0) + s.log[s.round].destroyed;
    return isRecord(at) && at.round === s.round && at.trick === done;
  }

  /** Put one action to the engine. A refused intent is answered `ILLEGAL_MOVE` and changes nothing. */
  private act(game: Game, action: Action, extra: GameEvent[], actor?: Actor): void {
    const r = Engine.reduce(game.state, action);
    if (r.error != null) {
      if (actor) this.fail(actor.conn, actor.id, 'ILLEGAL_MOVE', r.error);
      return;
    }
    game.state = r.state;
    if (r.events.some((e) => e.type === 'roundStarted')) game.ready.fill(false);
    this.step(game, [...r.events, ...extra], actor);
  }

  /**
   * One step of the table task, written out before anything else is looked at. The actor's socket
   * gets `ok` and then this step's `game.update`, queued together so nothing can come between them.
   * Every other seated socket gets the update alone.
   */
  private step(game: Game, events: GameEvent[], actor?: Actor): void {
    game.rev++;
    game.over = game.state.phase === 'gameOver';
    this.plan(game);
    if (actor) {
      this.write(actor.conn, { t: 'ok', re: actor.id });
      this.write(actor.conn, this.update(game, actor.seat, events));
    }
    game.players.forEach((account, seat) => {
      if (account && seat !== actor?.seat) this.write(account.conn, this.update(game, seat, events));
    });
    if (game.over) this.finish(game);
    else this.arm(game);
  }

  /** Whose move the table is waiting for, and until when. Kept as it is while the same seats are still on the same clock. */
  private plan(game: Game): void {
    const s = game.state,
      human = (seat: Seat): boolean => game.players[seat] != null,
      humans = game.players.flatMap((a, i) => (a ? [i] : [])),
      scale = PACE[game.settings.pace],
      prev = game.deadline;
    let next: { kind: Deadline['kind']; seats: Seat[]; ms: number } | null = null;
    if (game.over) next = null;
    // A solo table has no clock on the player's own move: only the end of a round is timed.
    else if (game.table === 'solo' && s.phase !== 'roundEnd') next = null;
    else if (s.phase === 'bidding')
      next = { kind: 'bid', seats: humans.filter((i) => s.bids[i] == null), ms: this.timers.bidMs * scale };
    else if (s.phase === 'playing' && s.turn != null && human(s.turn))
      next = { kind: 'play', seats: [s.turn], ms: this.timers.playMs * scale };
    else if (s.phase === 'ability' && s.pending && human(s.pending.seat))
      next = { kind: 'ability', seats: [s.pending.seat], ms: this.timers.abilityMs * scale };
    else if (s.phase === 'roundEnd')
      next = { kind: 'nextRound', seats: humans.filter((i) => !game.ready[i]), ms: this.timers.roundEndMs };
    if (!next || (!next.seats.length && next.kind !== 'nextRound')) {
      game.deadline = null;
      return;
    }
    // One deadline for all the bids of a round and one for the round's end; a turn keeps its own.
    const running =
      prev != null &&
      prev.kind === next.kind &&
      (next.kind === 'bid' || next.kind === 'nextRound' || prev.seats.join() === next.seats.join());
    game.deadline = { kind: next.kind, seats: next.seats, at: running ? prev.at : this.now() + next.ms };
  }

  /** Start what the table does on its own from here: the bots, the pause after a trick, and the deadline. */
  private arm(game: Game): void {
    this.disarm(game);
    // A solo table stands still while its player has no socket: nothing is played, collected or timed.
    if (game.table === 'solo' && !game.players.some((account) => account?.conn)) return;
    const s = game.state,
      bot = (seat: Seat): boolean => game.players[seat] == null,
      later = (ms: number, fn: () => void): void => {
        game.timers.push(setTimeout(fn, ms));
      },
      // A bot takes a moment so people can follow. A seat that is out is played after a fixed wait.
      pause = (seat: Seat): number =>
        game.status[seat] === 'out' ? OUT_SEAT_MS : this.bot.minMs + this.random() * (this.bot.maxMs - this.bot.minMs);
    if (s.phase === 'bidding')
      s.bids.forEach((bid, seat) => {
        if (bid == null && bot(seat))
          later(pause(seat), () => this.act(game, { type: 'bid', seat, bid: Bots.bid(game.state, seat) }, []));
      });
    else if (s.phase === 'playing' && s.turn != null && bot(s.turn)) {
      const seat = s.turn;
      later(pause(seat), () => this.act(game, { type: 'play', seat, ...Bots.play(game.state, seat) }, []));
    } else if (s.phase === 'ability' && s.pending && bot(s.pending.seat)) {
      const seat = s.pending.seat;
      later(pause(seat), () => this.act(game, { type: 'ability', seat, choice: Bots.ability(game.state, seat) }, []));
    } else if (s.phase === 'trickEnd') later(this.timers.trickEndMs, () => this.act(game, { type: 'advance' }, []));
    else if (s.phase === 'roundEnd') {
      const waiting = game.players.some((a, i) => a?.conn && !game.ready[i]),
        anyone = game.players.some((a) => a?.conn);
      if (anyone && !waiting) later(0, () => this.act(game, { type: 'advance' }, []));
    }
    const deadline = game.deadline;
    if (deadline) later(Math.max(0, deadline.at - this.now()), () => this.expire(game, deadline));
  }

  private disarm(game: Game): void {
    game.timers.forEach(clearTimeout);
    game.timers = [];
  }

  /**
   * A deadline passed: the server plays the bot's move for each seat that missed it, one step per
   * seat. The second miss in a row of a seat that is offline closes that seat in the same step.
   */
  private expire(game: Game, deadline: Deadline): void {
    if (deadline.kind === 'nextRound') return this.act(game, { type: 'advance' }, []);
    for (const seat of deadline.seats) {
      const s = game.state;
      let action: Action;
      if (deadline.kind === 'bid' && s.phase === 'bidding' && s.bids[seat] == null)
        action = { type: 'bid', seat, bid: Bots.bid(s, seat) };
      else if (deadline.kind === 'play' && s.phase === 'playing' && s.turn === seat)
        action = { type: 'play', seat, ...Bots.play(s, seat) };
      else if (deadline.kind === 'ability' && s.phase === 'ability' && s.pending?.seat === seat)
        action = { type: 'ability', seat, choice: Bots.ability(s, seat) };
      else continue;
      const events: GameEvent[] = [{ type: 'timedOut', seat }];
      if (game.status[seat] === 'offline' && ++game.misses[seat] >= 2 && this.kick(game, seat))
        events.push({ type: 'seatStatus', seat, status: 'out' });
      this.act(game, action, events);
    }
  }

  /**
   * Close the seat of a player who was offline for two turns in a row. The name and the colour stay
   * at the table, the table plays the seat from here, and the player cannot sit back down. They are
   * told once, after their next `welcome`. In ranked it is a forfeit, with the cooldown of a leave.
   */
  private kick(game: Game, seat: Seat): boolean {
    const account = game.players[seat];
    if (!account) return false;
    game.status[seat] = 'out';
    game.players[seat] = null;
    game.kicked.push({ account, seat });
    account.game = null;
    account.lost = { t: 'seat.lost', gameId: game.id, mode: game.mode, reason: 'inactivity' };
    if (game.mode === 'ranked') account.me.cooldownUntil = this.now() + cooldownAfter(++account.leaves);
    this.unseat(account);
    return true;
  }

  /** After the final `game.update`: the result to everyone who played, and the lobby opens again. */
  private finish(game: Game): void {
    this.disarm(game);
    const s = game.state,
      totals = Rules.totals(s.log, s.cfg, s.seats.length),
      room = game.room,
      open = room != null && this.rooms.has(room),
      ranked = game.mode === 'ranked',
      // A leave or a kick is a forfeit in ranked only: the seat is placed last, whatever was scored in
      // it. The leavers come first, in the order they left, then the kicked, in the order of the kicks.
      forfeited = ranked ? [...game.leavers, ...game.kicked].map((l) => l.seat) : [],
      places = totals.map((t, seat) =>
        forfeited.includes(seat)
          ? totals.length
          : 1 + totals.filter((x, other) => x > t && !forfeited.includes(other)).length,
      );
    // A custom or a casual game counts for everyone still in their seat, before anyone is told it
    // is over: a `GET /me` that follows `game.over` already has it. A seat that was left is not
    // counted. A ranked game changes no `Stats` at all: it is counted in the rating's `games`.
    game.players.forEach((account, seat) => {
      if (!account || ranked) return;
      const stats = account.me.stats;
      stats.games++;
      if (places[seat] === 1) stats.wins++;
      stats.bestScore = Math.max(stats.bestScore ?? totals[seat], totals[seat]);
      s.log.forEach((round) => {
        const score = round.done ? Rules.scoreSeat(s.cfg, round, seat) : null;
        if (!score) return;
        stats.bidsTotal++;
        if (score.hit) stats.bidsMade++;
      });
    });
    /**
     * What one seat is told: whose seat it is, the standings for all, and in ranked this seat's own
     * rating change.
     */
    const tell = (account: Account, seat: Seat): void => {
      const over: GameOver = {
        t: 'game.over',
        gameId: game.id,
        seat,
        result: {
          totals,
          places,
          forfeited,
          rating: ranked ? this.rate(account, places[seat]) : null,
          lobbyId: open && room ? room.lobby.id : null,
        },
      };
      if (account.conn) this.write(account.conn, over);
      else account.owed.push(over);
    };
    this.remember(game);
    this.games.delete(game);
    game.players.forEach((account, seat) => {
      if (!account) return;
      account.game = null;
      tell(account, seat);
    });
    game.leavers.forEach(({ account, seat }) => tell(account, seat));
    game.kicked.forEach(({ account, seat }) => tell(account, seat));
    if (!open || !room) return;
    room.lobby.state = 'open';
    room.lobby.gameId = null;
    room.lobby.members.forEach((x) => {
      if (x.kind === 'human') x.ready = false;
    });
    this.pushLobby(room);
  }

  /**
   * Move a rating after a ranked game, and say what it was and what it is. The shape is the
   * server's: a whole number, `delta` the difference of the two values, the tier of the band the
   * value is in, and placement until the fifth game. The step is the mock's own (MOCK_RATING_STEP).
   */
  private rate(account: Account, place: number): { before: Rating; after: Rating; delta: number } {
    const before = account.me.rating ?? { value: 0, tier: tierOf(0), provisional: true, games: 0 },
      value = before.value + (MOCK_RATING_STEP[place - 1] ?? MOCK_RATING_STEP[MOCK_RATING_STEP.length - 1]),
      games = before.games + 1,
      after = { value, tier: tierOf(value), provisional: games < PLACEMENT_GAMES, games };
    account.me.rating = after;
    account.me.user.tier = after.tier;
    return { before, after, delta: after.value - before.value };
  }

  /* ---------- between two lives ---------- */

  /** Something changed: write the state down once this turn is over. */
  private touch(): void {
    if (!this.store || this.saving) return;
    this.saving = true;
    queueMicrotask(() => {
      this.saving = false;
      if (!this.ended) this.save();
    });
  }

  private save(): void {
    const id = (a: Account): string => a.me.user.id;
    const running = [...this.games].filter((g) => !g.over);
    const saved = {
      v: 1 as const,
      ids: this.ids,
      accounts: [...this.accounts.values()].map((a) => ({
        session: a.session,
        me: a.me,
        login: a.login,
        leaves: a.leaves,
        owed: a.owed,
        lost: a.lost,
      })),
      rooms: [...this.rooms].map((r) => ({ lobby: r.lobby, humans: r.humans.map(id) })),
      games: running.map((g) => ({
        id: g.id,
        lobby: g.room?.lobby.id ?? null,
        mode: g.mode,
        table: g.table,
        settings: g.settings,
        state: g.state,
        rev: g.rev,
        players: g.players.map((a) => (a ? id(a) : null)),
        colors: g.colors,
        tiers: g.tiers,
        leavers: g.leavers.map((l) => ({ user: id(l.account), seat: l.seat })),
        kicked: g.kicked.map((l) => ({ user: id(l.account), seat: l.seat })),
        misses: g.misses,
        status: g.status,
        ready: g.ready,
        deadline: g.deadline,
      })),
    };
    this.store?.save(JSON.stringify(saved));
  }

  /**
   * Pick up what an earlier life wrote down. Every socket of that life is gone, so every seated
   * player is offline, and the clocks run on from where they were.
   */
  private resume(): void {
    let saved: {
      v: number;
      ids: number;
      accounts: {
        session: string | null;
        me: Me;
        login: Account['login'];
        leaves?: number;
        owed: GameOver[];
        lost?: SeatLost | null;
      }[];
      rooms: { lobby: Lobby; humans: string[] }[];
      games: {
        id: string;
        lobby: string | null;
        mode: TableMode;
        table?: TableKind | null;
        settings: GameSettings;
        state: GameState;
        rev: number;
        players: (string | null)[];
        colors: TableColor[];
        tiers?: (string | null)[];
        leavers: { user: string; seat: Seat }[];
        kicked?: { user: string; seat: Seat }[];
        misses?: number[];
        status: SeatStatus[];
        ready: boolean[];
        deadline: Deadline | null;
      }[];
    };
    try {
      const raw: unknown = JSON.parse(this.store?.load() ?? 'null');
      if (!isRecord(raw) || raw.v !== 1) return;
      saved = raw as typeof saved;
    } catch {
      return;
    }
    this.ids = saved.ids;
    for (const a of saved.accounts) {
      const account: Account = {
        session: a.session,
        me: a.me,
        login: a.login,
        conn: null,
        room: null,
        game: null,
        queued: null,
        leaves: a.leaves ?? 0,
        owed: a.owed,
        lost: a.lost ?? null,
      };
      this.accounts.set(a.me.user.id, account);
      if (a.session != null) this.sessions.set(a.session, account);
    }
    const known = (ids: string[]): Account[] => ids.flatMap((x) => this.accounts.get(x) ?? []);
    const rooms = new Map<string, Room>();
    for (const r of saved.rooms) {
      const room: Room = { lobby: r.lobby, humans: known(r.humans) };
      room.humans.forEach((a) => (a.room = room));
      room.lobby.members.forEach((m) => {
        if (m.kind === 'human') m.connected = false;
      });
      rooms.set(r.lobby.id, room);
      this.rooms.add(room);
    }
    const seated = (l: { user: string; seat: Seat }): { account: Account; seat: Seat }[] => {
      const account = this.accounts.get(l.user);
      return account ? [{ account, seat: l.seat }] : [];
    };
    for (const g of saved.games) {
      const room = g.lobby == null ? null : (rooms.get(g.lobby) ?? null);
      if (g.lobby != null && !room) continue;
      const game: Game = {
        id: g.id,
        room,
        mode: g.mode,
        table: g.table ?? null,
        settings: g.settings,
        state: g.state,
        rev: g.rev,
        players: g.players.map((x) => (x == null ? null : (this.accounts.get(x) ?? null))),
        colors: g.colors,
        tiers: g.tiers ?? g.players.map(() => null),
        leavers: g.leavers.flatMap(seated),
        kicked: (g.kicked ?? []).flatMap(seated),
        misses: g.misses ?? g.players.map(() => 0),
        status: g.status,
        ready: g.ready,
        deadline: g.deadline,
        timers: [],
        over: false,
      };
      game.players.forEach((account, seat) => {
        if (!account) return;
        account.game = game;
        if (game.status[seat] !== 'offline') game.rev++;
        game.status[seat] = 'offline';
      });
      this.games.add(game);
      this.arm(game);
    }
  }

  /* ---------- ids ---------- */

  private uuid(): string {
    return `00000000-0000-4000-8000-${(++this.ids).toString(16).padStart(12, '0')}`;
  }

  private code(): string {
    for (;;) {
      const code = Array.from(
        { length: 6 },
        () => CODE_ALPHABET[Math.floor(this.random() * CODE_ALPHABET.length)],
      ).join('');
      if (![...this.rooms].some((r) => r.lobby.code === code)) return code;
    }
  }
}
