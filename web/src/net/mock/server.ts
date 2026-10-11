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
   which the real server must never run. It has private lobbies only: no accounts, no queue, no
   emotes, no away detection and no bot takeover after the grace period. */
import { Bots, Engine, Rules } from '../../game';
import type { Action, GameState } from '../../game';
import type {
  ClientMessage,
  Deadline,
  EngineView,
  ErrorCode,
  GameEvent,
  GameOver,
  GameSettings,
  GameStart,
  GameUpdate,
  Lobby,
  Me,
  Member,
  Seat,
  SeatStatus,
  TableColor,
  Timers,
  Welcome,
} from '../../protocol/generated';
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

const MESSAGES: Partial<Record<ErrorCode, string>> = {
  VALIDATION: 'That message is not valid.',
  RATE_LIMITED: 'Too many messages. Slow down.',
  PROTOCOL_UNSUPPORTED: 'This page is too old for the server. Reload to update.',
  LOBBY_NOT_FOUND: 'No table has that code.',
  LOBBY_FULL: 'That table is full.',
  LOBBY_STARTED: 'That game has already started.',
  ALREADY_SEATED: 'You are already at a table.',
  NOT_IN_LOBBY: 'You are not at a table.',
  NOT_HOST: 'Only the host can do that.',
  NOT_READY: 'Everyone has to be ready, and a game needs at least two seats.',
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
}

type Timer = ReturnType<typeof setTimeout>;

/** One player: what the session cookie stands for on the real server. */
interface Account {
  me: Me;
  conn: Conn | null;
  room: Room | null;
  game: Game | null;
  /** Results of games that ended while this player had no socket: written right after the next `welcome`. */
  owed: GameOver[];
}
interface Conn {
  account: Account;
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
  room: Room;
  state: GameState;
  rev: number;
  /** Who plays each seat. null is a bot seat, or one whose player left. */
  players: (Account | null)[];
  colors: TableColor[];
  /** Those who left, and the seat they gave up. */
  leavers: { account: Account; seat: Seat }[];
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

export class MockServer {
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly timers: Timers;
  private readonly bot: { minMs: number; maxMs: number };
  private readonly rooms = new Set<Room>();
  private readonly conns = new Set<Conn>();
  private ids = 0;
  private down = false;

  constructor({
    now = Date.now,
    random = Math.random,
    timers = {},
    bot = { minMs: 800, maxMs: 1500 },
  }: MockOptions = {}) {
    this.now = now;
    this.random = random;
    this.timers = { ...STANDARD_TIMERS, ...timers };
    this.bot = bot;
  }

  /**
   * A new guest and the way to connect as them: what one browser profile is to the real server.
   * Every call of the returned transport is another socket of the same player.
   */
  transport(): Transport {
    const account = this.guest();
    return () => Promise.resolve().then(() => this.connect(account));
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

  /* ---------- connections ---------- */

  private guest(): Account {
    const n = 1000 + Math.floor(this.random() * 9000);
    return {
      me: {
        user: { id: this.uuid(), name: `Guest ${n}`, color: COLORS[n % COLORS.length], tier: null },
        guest: true,
        username: null,
        active: null,
        cooldownUntil: null,
        stats: { games: 0, wins: 0, bidsMade: 0, bidsTotal: 0, bestScore: null },
        rating: null,
      },
      conn: null,
      room: null,
      game: null,
      owed: [],
    };
  }

  private connect(account: Account): Wire {
    if (this.down) throw new Error('The mock server is down');
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
    if (message.t.startsWith('lobby.')) return this.onLobby(conn, message);
    if (message.t.startsWith('game.')) return this.onGame(conn, message);
    if (message.t.startsWith('queue.'))
      return this.fail(conn, message.id, 'INTERNAL', 'The mock server has no matchmaking.');
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
    account.owed.splice(0).forEach((over) => this.write(conn, over));
    this.presence(account, true);
  }

  private welcome(account: Account): Welcome {
    const game = account.game,
      seat = game ? game.players.indexOf(account) : -1;
    return {
      t: 'welcome',
      me: {
        ...account.me,
        active: game
          ? { kind: 'game', id: game.id }
          : account.room
            ? { kind: 'lobby', id: account.room.lobby.id }
            : null,
      },
      serverTime: this.now(),
      lobby: account.room ? account.room.lobby : null,
      queue: null,
      game: game && seat >= 0 ? { start: this.gameStart(game, seat), update: this.update(game, seat, []) } : null,
    };
  }

  /* ---------- lobbies ---------- */

  private onLobby(conn: Conn, m: ClientMessage): void {
    const account = conn.account,
      room = account.room,
      ok = (lobby?: Lobby): void => this.write(conn, lobby ? { t: 'ok', re: m.id, lobby } : { t: 'ok', re: m.id });
    if (m.t === 'lobby.create') {
      if (room || account.game) return this.fail(conn, m.id, 'ALREADY_SEATED');
      if (!isSettings(m.settings) || !oneOf(m.visibility, ['private', 'public']))
        return this.fail(conn, m.id, 'VALIDATION');
      const made: Room = {
        lobby: {
          id: this.uuid(),
          code: this.code(),
          mode: 'custom',
          visibility: m.visibility,
          hostId: account.me.user.id,
          settings: { ...m.settings },
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
      if (room || account.game) return this.fail(conn, m.id, 'ALREADY_SEATED');
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
        if (lobby.members.length >= lobby.settings.maxPlayers) return this.fail(conn, m.id, 'LOBBY_FULL');
        const names = new Set(lobby.members.map((x) => (x.kind === 'bot' ? x.name : x.user.name))),
          colors = new Set(lobby.members.map((x) => (x.kind === 'bot' ? x.color : x.user.color)));
        lobby.members.push({
          kind: 'bot',
          name: BOT_NAMES.find((n) => !names.has(n)) ?? 'Bot',
          color: COLORS.find((c) => !colors.has(c)) ?? COLORS[0],
          level: lobby.settings.botLevel,
        });
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
        if (lobby.members.length < 2 || !humansReady) return this.fail(conn, m.id, 'NOT_READY');
        ok();
        return this.startGame(room);
      }
    }
    ok();
    this.pushLobby(room);
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

  private startGame(room: Room): void {
    const lobby = room.lobby,
      s = lobby.settings,
      used = new Set<string>();
    // A seat's colour is the member's own, unless a seat before it already has it.
    const color = (wanted: TableColor): TableColor => {
      const c = used.has(wanted) ? (COLORS.find((x) => !used.has(x)) ?? wanted) : wanted;
      used.add(c);
      return c;
    };
    const seats = lobby.members.map((x) =>
      x.kind === 'bot'
        ? { name: x.name, color: color(x.color), bot: true }
        : { name: x.user.name, color: color(x.user.color), bot: false },
    );
    const players = lobby.members.map((x: Member) =>
      x.kind === 'human' ? (room.humans.find((a) => a.me.user.id === x.user.id) ?? null) : null,
    );
    const game: Game = {
      id: this.uuid(),
      room,
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
      leavers: [],
      status: players.map((a) => (a ? (a.conn ? 'online' : 'offline') : 'bot')),
      ready: players.map(() => false),
      deadline: null,
      timers: [],
      over: false,
    };
    lobby.state = 'inGame';
    lobby.gameId = game.id;
    this.pushLobby(room);
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
    const lobby = game.room.lobby,
      s = game.state;
    return {
      t: 'game.start',
      gameId: game.id,
      mode: lobby.mode,
      lobbyId: lobby.id,
      settings: lobby.settings,
      deck: s.deck,
      schedule: s.schedule,
      seats: s.seats.map((p, i) => {
        const account = game.players[i];
        return {
          name: p.name,
          color: game.colors[i],
          bot: p.bot,
          userId: account ? account.me.user.id : null,
          tier: null,
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
        // The seat is a bot from this step. The leaver still gets the step's update, and none after it.
        game.status[seat] = 'bot';
        game.players[seat] = null;
        game.leavers.push({ account, seat });
        account.game = null;
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
      scale = PACE[game.room.lobby.settings.pace],
      prev = game.deadline;
    let next: { kind: Deadline['kind']; seats: Seat[]; ms: number } | null = null;
    if (game.over) next = null;
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
    const s = game.state,
      bot = (seat: Seat): boolean => game.players[seat] == null,
      later = (ms: number, fn: () => void): void => {
        game.timers.push(setTimeout(fn, ms));
      },
      pause = (): number => this.bot.minMs + this.random() * (this.bot.maxMs - this.bot.minMs);
    if (s.phase === 'bidding')
      s.bids.forEach((bid, seat) => {
        if (bid == null && bot(seat))
          later(pause(), () => this.act(game, { type: 'bid', seat, bid: Bots.bid(game.state, seat) }, []));
      });
    else if (s.phase === 'playing' && s.turn != null && bot(s.turn)) {
      const seat = s.turn;
      later(pause(), () => this.act(game, { type: 'play', seat, ...Bots.play(game.state, seat) }, []));
    } else if (s.phase === 'ability' && s.pending && bot(s.pending.seat)) {
      const seat = s.pending.seat;
      later(pause(), () => this.act(game, { type: 'ability', seat, choice: Bots.ability(game.state, seat) }, []));
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

  /** A deadline passed: the server plays the bot's move for each seat that missed it, one step per seat. */
  private expire(game: Game, deadline: Deadline): void {
    if (deadline.kind === 'nextRound') return this.act(game, { type: 'advance' }, []);
    for (const seat of deadline.seats) {
      const s = game.state,
        timedOut: GameEvent[] = [{ type: 'timedOut', seat }];
      if (deadline.kind === 'bid' && s.phase === 'bidding' && s.bids[seat] == null)
        this.act(game, { type: 'bid', seat, bid: Bots.bid(s, seat) }, timedOut);
      else if (deadline.kind === 'play' && s.phase === 'playing' && s.turn === seat)
        this.act(game, { type: 'play', seat, ...Bots.play(s, seat) }, timedOut);
      else if (deadline.kind === 'ability' && s.phase === 'ability' && s.pending?.seat === seat)
        this.act(game, { type: 'ability', seat, choice: Bots.ability(s, seat) }, timedOut);
    }
  }

  /** After the final `game.update`: the result to everyone who played, and the lobby opens again. */
  private finish(game: Game): void {
    this.disarm(game);
    const s = game.state,
      totals = Rules.totals(s.log, s.cfg, s.seats.length),
      room = game.room,
      open = this.rooms.has(room);
    const over: GameOver = {
      t: 'game.over',
      gameId: game.id,
      result: {
        totals,
        places: totals.map((t) => 1 + totals.filter((x) => x > t).length),
        // A leave is a forfeit in ranked only, and the mock has custom games only.
        forfeited: [],
        rating: null,
        lobbyId: open ? room.lobby.id : null,
      },
    };
    const tell = (account: Account): void => {
      if (account.conn) this.write(account.conn, over);
      else account.owed.push(over);
    };
    game.players.forEach((account) => {
      if (!account) return;
      account.game = null;
      tell(account);
    });
    game.leavers.forEach(({ account }) => tell(account));
    if (!open) return;
    room.lobby.state = 'open';
    room.lobby.gameId = null;
    room.lobby.members.forEach((x) => {
      if (x.kind === 'human') x.ready = false;
    });
    this.pushLobby(room);
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
