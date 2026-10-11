/* The mock server, looked at frame by frame from bare connections: what it writes, to whom, and in
   which order. These are the rules of docs/protocol.md §5.2 and §5.5 the client is built on, so the
   same checks are the ones the real server has to pass. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { GameUpdate, Lobby } from '../../protocol/generated';
import type { ServerMessage } from '../messages';
import { connectRaw, framesOf } from './raw';
import type { RawClient } from './raw';
import { MockServer } from './server';

/** mulberry32, so the codes, the deal and the bots are the same on every run. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SETTINGS = {
  maxPlayers: 4,
  scoring: 'classic',
  format: 'swift',
  loot: false,
  kraken: false,
  whale: false,
  abilities: false,
  botLevel: 'normal',
  pace: 'standard',
} as const;
/** Short clocks: a deadline plays for a human who does nothing, so a whole game runs by itself. */
const FAST = { bidMs: 400, playMs: 300, abilityMs: 300, trickEndMs: 100, roundEndMs: 200 };

let server: MockServer;
const flush = (): Promise<void> => vi.advanceTimersByTimeAsync(0).then(() => {});

async function connect(as = server.transport()): Promise<RawClient> {
  const client = await connectRaw(as);
  await flush();
  return client;
}
const last = <T extends ServerMessage['t']>(client: RawClient, t: T): Extract<ServerMessage, { t: T }> => {
  const found = framesOf(client, t).at(-1);
  if (!found) throw new Error(`No ${t} frame yet`);
  return found;
};
const lobbyOf = (client: RawClient): Lobby => last(client, 'lobby.state').lobby;
const view = (client: RawClient): GameUpdate['view'] => last(client, 'game.update').view;
const at = (client: RawClient): { round: number; trick: number } => {
  const v = view(client);
  return { round: v.round, trick: v.won.reduce((a, b) => a + b, 0) + v.log[v.round].destroyed };
};
/** The frame that answers `id`, and the one written right after it. */
function answer(client: RawClient, id: number): { reply: ServerMessage; next: ServerMessage | undefined } {
  const i = client.frames.findIndex((f) => (f.t === 'ok' || f.t === 'err') && f.re === id);
  if (i < 0) throw new Error(`No reply to ${id}`);
  return { reply: client.frames[i], next: client.frames[i + 1] };
}

/** A private table with `humans` people and `bots` bots at it, started. The first human is the host. */
async function startedTable(humans: number, bots: number): Promise<RawClient[]> {
  const host = await connect();
  host.send({ t: 'lobby.create', visibility: 'private', settings: SETTINGS });
  await flush();
  const code = last(host, 'ok').lobby?.code;
  const players = [host];
  for (let i = 1; i < humans; i++) {
    const guest = await connect();
    guest.send({ t: 'lobby.join', code });
    players.push(guest);
  }
  for (let i = 0; i < bots; i++) host.send({ t: 'lobby.addBot' });
  players.forEach((p) => p.send({ t: 'lobby.ready', ready: true }));
  await flush();
  host.send({ t: 'lobby.start' });
  await flush();
  return players;
}

/** Let the clocks run until `done`, in small steps so every timer gets its own turn. */
async function until(done: () => boolean, what: string, steps = 4000): Promise<void> {
  for (let i = 0; i < steps; i++) {
    if (done()) return;
    await vi.advanceTimersByTimeAsync(50);
  }
  throw new Error(`Never happened: ${what}`);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockImplementation(seeded(11));
  server = new MockServer({ random: seeded(5), timers: FAST, bot: { minMs: 40, maxMs: 80 } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('connecting', () => {
  it('answers hello with ok and then a welcome that is a complete, empty snapshot', async () => {
    const client = await connect();
    expect(client.frames.map((f) => f.t)).toEqual(['ok', 'welcome']);
    const welcome = last(client, 'welcome');
    expect(welcome).toMatchObject({ lobby: null, queue: null, game: null });
    expect(welcome.me).toMatchObject({ guest: true, username: null, active: null });
    expect(welcome.me.user.name).toMatch(/^Guest \d{4}$/);
  });

  it('refuses a protocol it does not speak and hangs up', async () => {
    const old = await connectRaw(server.transport(), 0);
    await flush();
    expect(old.frames).toEqual([expect.objectContaining({ t: 'err', code: 'PROTOCOL_UNSUPPORTED' })]);
    expect(old.closed).not.toBeNull();
  });

  it('replaces the first socket of a player with the second: superseded, then close code 4001', async () => {
    const as = server.transport();
    const first = await connect(as),
      second = await connect(as);
    expect(first.frames.at(-1)).toEqual({ t: 'superseded' });
    expect(first.closed).toBe(4001);
    expect(second.closed).toBeNull();
    expect(last(second, 'welcome').me.user.id).toBe(last(first, 'welcome').me.user.id);
  });

  it('answers a ping with the server time, and everything exactly once', async () => {
    const client = await connect();
    vi.setSystemTime(1_700_000_000_000);
    const id = client.send({ t: 'ping' });
    await flush();
    expect(client.frames.filter((f) => (f.t === 'ok' || f.t === 'err') && f.re === id)).toEqual([
      { t: 'ok', re: id, serverTime: 1_700_000_000_000 },
    ]);
  });

  it('limits a connection to 20 messages a second and closes one that sends something that is not JSON', async () => {
    const client = await connect();
    const ids = Array.from({ length: 22 }, () => client.send({ t: 'ping' }));
    await flush();
    const codes = ids.map((id) => {
      const { reply } = answer(client, id);
      return reply.t === 'err' ? reply.code : 'ok';
    });
    // The hello was the first message of this second.
    expect(codes.filter((c) => c === 'ok')).toHaveLength(19);
    expect(codes.slice(19)).toEqual(['RATE_LIMITED', 'RATE_LIMITED', 'RATE_LIMITED']);

    const wire = await server.transport()();
    let closed: number | null = null;
    wire.onclose = (code) => {
      closed = code;
    };
    wire.send('{not json');
    await flush();
    expect(closed).toBe(1003);
  });
});

describe('a server with a store', () => {
  /** What a page keeps for the mock between two loads. */
  function memory(): { load(): string | null; save(data: string): void } {
    let data: string | null = null;
    return {
      load: () => data,
      save: (next) => {
        data = next;
      },
    };
  }
  const make = (store: ReturnType<typeof memory>, seed = 5): MockServer =>
    new MockServer({ random: seeded(seed), timers: { ...FAST, bidMs: 5000 }, bot: { minMs: 40, maxMs: 80 }, store });

  it('is the same player for the same session, and somebody else without one', async () => {
    server = make(memory());
    const first = await connect(server.transport('this-page')),
      again = await connect(server.transport('this-page')),
      other = await connect(server.transport());
    expect(last(again, 'welcome').me.user.id).toBe(last(first, 'welcome').me.user.id);
    expect(first.closed).toBe(4001);
    expect(last(other, 'welcome').me.user.id).not.toBe(last(first, 'welcome').me.user.id);
  });

  it('finds the table where it was after it is made anew: the seat offline, the hand and the clock as they were', async () => {
    const store = memory();
    server = make(store);
    const page = await connect(server.transport('this-page'));
    page.send({ t: 'lobby.create', visibility: 'private', settings: SETTINGS });
    page.send({ t: 'lobby.addBot' });
    page.send({ t: 'lobby.ready', ready: true });
    await flush();
    page.send({ t: 'lobby.start' });
    await flush();
    await until(() => view(page).bids[1] === -1, 'the bot bids');
    const before = last(page, 'game.update'),
      start = last(page, 'game.start');
    await flush();

    // The page is gone, and the server with it. The next one reads what was written down.
    server.shutDown();
    server = make(store, 99);
    await flush();
    const back = await connect(server.transport('this-page'));
    const welcome = last(back, 'welcome');
    expect(welcome.me).toMatchObject({
      user: last(page, 'welcome').me.user,
      active: { kind: 'game', id: start.gameId },
    });
    expect(welcome.lobby).toMatchObject({ code: lobbyOf(page).code, state: 'inGame' });
    expect(welcome.game?.start).toEqual(start);
    const snapshot = welcome.game?.update;
    expect(snapshot?.view).toEqual(before.view);
    expect(snapshot?.events).toEqual([]);
    // The reload was a drop: one step for the seat going offline, and the clock ran on.
    expect(snapshot?.rev).toBe(before.rev + 1);
    expect(snapshot?.table).toEqual({ ...before.table, status: ['offline', 'bot'] });
    // Coming back is a step again, written after the welcome.
    expect(back.frames.at(-1)).toMatchObject({
      t: 'game.update',
      rev: before.rev + 2,
      events: [{ type: 'seatStatus', seat: 0, status: 'online' }],
      table: { status: ['online', 'bot'] },
    });

    // And the table goes on: a bid lands, and the bots play.
    const bid = back.send({ t: 'game.bid', at: at(back), bid: 1 });
    await until(() => view(back).phase !== 'bidding', 'the bids are in');
    expect(answer(back, bid).reply.t).toBe('ok');
    expect(view(back).bids[0]).toBe(1);
  });

  it('plays for a seat whose deadline passed while nobody was there', async () => {
    const store = memory();
    server = make(store);
    const page = await connect(server.transport('this-page'));
    page.send({ t: 'lobby.create', visibility: 'private', settings: SETTINGS });
    page.send({ t: 'lobby.addBot' });
    page.send({ t: 'lobby.ready', ready: true });
    await flush();
    page.send({ t: 'lobby.start' });
    await flush();
    expect(view(page).bids[0]).toBeNull();

    server.shutDown();
    vi.setSystemTime(Date.now() + 60_000); // a minute with no page: the five seconds to bid are long over
    server = make(store, 99);
    await vi.advanceTimersByTimeAsync(200);
    const back = await connect(server.transport('this-page'));
    expect(last(back, 'welcome').game?.update.view.bids[0]).not.toBeNull();
  });

  it('starts empty from a store that holds nothing it can read', async () => {
    const store = memory();
    store.save('{"v":7,"what":"another version"}');
    server = make(store);
    const client = await connect(server.transport('this-page'));
    expect(last(client, 'welcome')).toMatchObject({ lobby: null, game: null });
    store.save('not json');
    server = make(store);
    expect(last(await connect(server.transport('this-page')), 'welcome')).toMatchObject({ lobby: null, game: null });
  });
});

describe('lobbies', () => {
  it('creates a private lobby with a code, lets a second player join by it, and tells both of every change', async () => {
    const host = await connect();
    host.send({ t: 'lobby.create', visibility: 'private', settings: SETTINGS });
    await flush();
    const created = last(host, 'ok').lobby;
    expect(created).toMatchObject({ mode: 'custom', visibility: 'private', state: 'open', gameId: null });
    expect(created?.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(created?.hostId).toBe(last(host, 'welcome').me.user.id);

    const guest = await connect();
    const join = guest.send({ t: 'lobby.join', code: created?.code.toLowerCase() });
    await flush();
    expect(answer(guest, join).reply).toMatchObject({ t: 'ok', lobby: { code: created?.code } });
    expect(lobbyOf(host).members).toHaveLength(2);

    host.send({ t: 'lobby.addBot' });
    guest.send({ t: 'lobby.ready', ready: true });
    await flush();
    expect(lobbyOf(host)).toEqual(lobbyOf(guest));
    expect(lobbyOf(guest).members.map((m) => (m.kind === 'bot' ? `bot ${m.level}` : `human ${m.ready}`))).toEqual([
      'human false',
      'human true',
      'bot normal',
    ]);

    // New rules clear everyone's ready.
    host.send({ t: 'lobby.settings', settings: { ...SETTINGS, botLevel: 'hard' } });
    await flush();
    expect(lobbyOf(guest).members.map((m) => (m.kind === 'bot' ? `bot ${m.level}` : `human ${m.ready}`))).toEqual([
      'human false',
      'human false',
      'bot hard',
    ]);

    // `index` is the place in `members`.
    host.send({ t: 'lobby.removeBot', index: 2 });
    await flush();
    expect(lobbyOf(guest).members).toHaveLength(2);
  });

  it('says why not: an unknown code, a full table, a guest acting as host, a start before everyone is ready', async () => {
    const host = await connect(),
      guest = await connect(),
      late = await connect();
    const code = async (client: RawClient, message: Parameters<RawClient['send']>[0]): Promise<string> => {
      const id = client.send(message);
      await flush();
      const { reply } = answer(client, id);
      return reply.t === 'err' ? reply.code : 'ok';
    };
    expect(await code(guest, { t: 'lobby.join', code: 'ZZZZZZ' })).toBe('LOBBY_NOT_FOUND');
    expect(await code(guest, { t: 'lobby.ready', ready: true })).toBe('NOT_IN_LOBBY');
    expect(
      await code(host, { t: 'lobby.create', visibility: 'private', settings: { ...SETTINGS, maxPlayers: 9 } }),
    ).toBe('VALIDATION');
    expect(
      await code(host, { t: 'lobby.create', visibility: 'private', settings: { ...SETTINGS, maxPlayers: 2 } }),
    ).toBe('ok');
    const table = last(host, 'ok').lobby?.code;
    expect(await code(host, { t: 'lobby.create', visibility: 'private', settings: SETTINGS })).toBe('ALREADY_SEATED');
    expect(await code(host, { t: 'lobby.start' })).toBe('NOT_READY'); // one seat
    expect(await code(guest, { t: 'lobby.join', code: table })).toBe('ok');
    expect(await code(late, { t: 'lobby.join', code: table })).toBe('LOBBY_FULL');
    expect(await code(guest, { t: 'lobby.addBot' })).toBe('NOT_HOST');
    expect(await code(guest, { t: 'lobby.start' })).toBe('NOT_HOST');
    expect(await code(host, { t: 'lobby.addBot' })).toBe('LOBBY_FULL');
    expect(await code(host, { t: 'lobby.ready', ready: true })).toBe('ok');
    expect(await code(host, { t: 'lobby.start' })).toBe('NOT_READY'); // the guest is not
    expect(await code(guest, { t: 'lobby.ready', ready: true })).toBe('ok');
    expect(await code(host, { t: 'lobby.start' })).toBe('ok');
    expect(await code(late, { t: 'lobby.join', code: table })).toBe('LOBBY_STARTED');
  });

  it('makes the next human host when the host leaves, and tells a kicked player why', async () => {
    const host = await connect(),
      guest = await connect();
    host.send({ t: 'lobby.create', visibility: 'private', settings: SETTINGS });
    await flush();
    guest.send({ t: 'lobby.join', code: last(host, 'ok').lobby?.code });
    await flush();
    host.send({ t: 'lobby.kick', userId: last(guest, 'welcome').me.user.id });
    await flush();
    expect(guest.frames.at(-1)).toEqual({ t: 'lobby.closed', reason: 'kicked' });
    expect(lobbyOf(host).members).toHaveLength(1);

    guest.send({ t: 'lobby.join', code: lobbyOf(host).code });
    await flush();
    host.send({ t: 'lobby.leave' });
    await flush();
    expect(lobbyOf(guest).hostId).toBe(last(guest, 'welcome').me.user.id);
    expect(lobbyOf(guest).members).toHaveLength(1);
  });
});

describe('the table', () => {
  it('starts with the lobby in game, then game.start and the first game.update, for every human', async () => {
    const [a, b] = await startedTable(2, 1);
    for (const p of [a, b]) {
      const tail = p.frames.slice(-3).map((f) => f.t);
      expect(tail).toEqual(['lobby.state', 'game.start', 'game.update']);
      expect(lobbyOf(p).state).toBe('inGame');
    }
    const start = last(a, 'game.start');
    expect(start.me).toBe(0);
    expect(last(b, 'game.start').me).toBe(1);
    expect(start.seats.map((s) => s.bot)).toEqual([false, false, true]);
    expect(start.schedule).toEqual([5, 5, 5, 5, 5]);
    expect(start.deck).toHaveLength(70);
    expect(last(a, 'game.update')).toMatchObject({ rev: 0, events: [], view: { me: 0, phase: 'bidding' } });
  });

  it('writes ok and then the game.update of that step, with nothing between them, through a whole game', async () => {
    const [a, b] = await startedTable(2, 1);
    const sent = new Map<RawClient, { id: number; t: string }[]>([
      [a, []],
      [b, []],
    ]);
    /** Play whatever the seat may play right now, at most one intent per look. */
    const move = (p: RawClient): void => {
      const v = view(p),
        mine = sent.get(p) ?? [],
        waiting = mine.some(({ id }) => !p.frames.some((f) => (f.t === 'ok' || f.t === 'err') && f.re === id));
      if (waiting) return;
      const send = (message: Parameters<RawClient['send']>[0] & { t: string }): void => {
        mine.push({ id: p.send(message), t: message.t });
      };
      if (v.phase === 'bidding' && v.bids[v.me] == null) send({ t: 'game.bid', at: at(p), bid: 1 });
      else if (v.phase === 'playing' && v.turn === v.me)
        send({ t: 'game.play', at: at(p), card: v.legal[0], as: 'pirate' });
      else if (v.phase === 'roundEnd' && !last(p, 'game.update').table.ready[v.me]) send({ t: 'game.ready' });
    };
    await until(() => {
      move(a);
      move(b);
      return framesOf(a, 'game.over').length > 0;
    }, 'the game ends');

    for (const p of [a, b]) {
      const mine = sent.get(p) ?? [];
      expect(mine.length).toBeGreaterThan(30);
      for (const { id, t } of mine) {
        const { reply, next } = answer(p, id);
        expect(reply, `${t} #${id}`).toEqual({ t: 'ok', re: id });
        expect(next?.t, `what follows the ok of ${t} #${id}`).toBe('game.update');
        if (next?.t !== 'game.update') continue;
        const me = view(p).me;
        if (t === 'game.bid') expect(next.events[0]).toEqual({ type: 'bidPlaced', seat: me });
        if (t === 'game.play') expect(next.events[0]).toMatchObject({ type: 'cardPlayed', seat: me });
        if (t === 'game.ready') expect(next.events).toEqual([]);
      }
      // Every step reaches every seat once: the revisions count up without a gap.
      const revs = framesOf(p, 'game.update').map((u) => u.rev);
      expect(revs).toEqual(revs.map((_, i) => i));
      // The result comes after the final update, once.
      expect(p.frames.filter((f) => f.t === 'game.over')).toHaveLength(1);
      const over = p.frames.findIndex((f) => f.t === 'game.over');
      expect(p.frames[over - 1]).toMatchObject({ t: 'game.update', view: { phase: 'gameOver' } });
      expect(last(p, 'game.over').result).toMatchObject({ forfeited: [], rating: null });
      // And the lobby is open again for the rematch, with nobody ready.
      expect(lobbyOf(p)).toMatchObject({ state: 'open', gameId: null });
      expect(lobbyOf(p).members.every((m) => m.kind === 'bot' || !m.ready)).toBe(true);
    }
    // A bot's move, a timeout and the advance are steps of their own: each update is one step.
    const kinds = framesOf(a, 'game.update').map((u) => u.events.map((e) => e.type).join('+'));
    expect(kinds).toContain('trickCollected');
    expect(kinds.filter((k) => k.startsWith('cardPlayed')).length).toBeGreaterThan(60);
  });

  it('answers a refused intent with err alone: no update follows, and nobody else hears of it', async () => {
    const [a, b] = await startedTable(2, 1);
    await until(() => view(a).bids.filter((x) => x === -1).length === 1, 'the bot bids');
    const before = { a: a.frames.length, b: b.frames.length, rev: last(a, 'game.update').rev };
    const refused = async (message: Parameters<RawClient['send']>[0]): Promise<string> => {
      const id = a.send(message);
      await flush();
      const { reply, next } = answer(a, id);
      expect(next).toBeUndefined();
      return reply.t === 'err' ? reply.code : 'ok';
    };
    expect(await refused({ t: 'game.play', at: at(a), card: view(a).hand[0] })).toBe('NOT_YOUR_TURN');
    expect(await refused({ t: 'game.bid', at: at(a), bid: 6 })).toBe('BID_OUT_OF_RANGE');
    expect(await refused({ t: 'game.bid', at: { round: 0, trick: 1 }, bid: 1 })).toBe('STALE_ACTION');
    expect(await refused({ t: 'game.ready' })).toBe('NOT_YOUR_TURN');
    expect(await refused({ t: 'game.emote', emote: 'example' })).toBe('VALIDATION');
    expect(a.frames.length).toBe(before.a + 5);
    expect(b.frames.length).toBe(before.b);
    expect(last(a, 'game.update').rev).toBe(before.rev);

    // A bid "for another seat" is a bid for the sender's: the seat comes from the connection.
    const forged = a.send({ t: 'game.bid', at: at(a), bid: 2, seat: 1 });
    await flush();
    expect(answer(a, forged)).toMatchObject({ reply: { t: 'ok' }, next: { events: [{ type: 'bidPlaced', seat: 0 }] } });
    expect(view(a).bids[0]).toBe(2);
    expect(view(b).bids).toEqual([-1, null, -1]);

    // A card that is not in the hand, on the player's own turn.
    b.send({ t: 'game.bid', at: at(b), bid: 0 });
    await until(
      () => [a, b].some((p) => view(p).phase === 'playing' && view(p).turn === view(p).me),
      'a human has the turn',
    );
    const p = view(a).turn === 0 ? a : b,
      other = p === a ? b : a,
      count = other.frames.length;
    const stolen = p.send({ t: 'game.play', at: at(p), card: view(other).hand[0] });
    await flush();
    expect(answer(p, stolen)).toMatchObject({ reply: { t: 'err', code: 'ILLEGAL_MOVE' }, next: undefined });
    expect(other.frames.length).toBe(count);
  });

  it('sends each seat its own view and never the hand of another seat', async () => {
    const [a, b] = await startedTable(2, 1);
    await until(() => framesOf(a, 'game.over').length > 0, 'the game ends');
    const VIEW_KEYS = [
      'bids',
      'cards',
      'dealer',
      'hand',
      'handCounts',
      'lastTrick',
      'legal',
      'log',
      'me',
      'pending',
      'phase',
      'played',
      'round',
      'rounds',
      'trick',
      'turn',
      'won',
    ];
    const ofA = new Map(framesOf(a, 'game.update').map((u) => [u.rev, u]));
    const updates = framesOf(b, 'game.update');
    expect(updates.length).toBeGreaterThan(100);
    let hiddenBids = 0;
    for (const u of updates) {
      const mine = ofA.get(u.rev);
      if (!mine) throw new Error(`Seat 0 never saw revision ${u.rev}`);
      expect(Object.keys(u).sort()).toEqual(['events', 'gameId', 'rev', 't', 'table', 'view']);
      expect(Object.keys(u.view).sort()).toEqual(VIEW_KEYS);
      expect(u.view.me).toBe(1);
      // Seat 0's hand is a count for seat 1, and none of its cards are in what seat 1 holds.
      expect(u.view.handCounts[0]).toBe(mine.view.hand.length);
      expect(u.view.hand.filter((card) => mine.view.hand.includes(card))).toEqual([]);
      expect(u.view.hand).toHaveLength(u.view.handCounts[1]);
      // Whatever seat 1 may play is in its own hand.
      expect(u.view.legal.every((card) => u.view.hand.includes(card))).toBe(true);
      // A bid placed while the others are still bidding is a fact, not a number.
      if (u.view.phase === 'bidding' && mine.view.bids[0] != null) {
        expect(u.view.bids[0]).toBe(-1);
        hiddenBids++;
      }
      // Events are public: the same for both seats.
      expect(u.events).toEqual(mine.events);
    }
    expect(hiddenBids).toBeGreaterThan(0);
    // Nothing that is not a view ever names a hand: the start and the welcome carry no cards in play.
    expect(Object.keys(last(b, 'game.start')).sort()).toEqual([
      'deck',
      'gameId',
      'lobbyId',
      'me',
      'mode',
      'schedule',
      'seats',
      'settings',
      't',
    ]);
  });

  it('gives a leaver ok and one last update, no update after it, and the result when the game ends', async () => {
    const [a, b] = await startedTable(2, 1);
    await until(() => view(a).phase === 'playing', 'the bids are in');
    const leave = a.send({ t: 'game.leave' });
    await flush();
    const { reply, next } = answer(a, leave);
    expect(reply).toEqual({ t: 'ok', re: leave });
    expect(next).toMatchObject({ t: 'game.update', events: [{ type: 'seatStatus', seat: 0, status: 'bot' }] });
    if (next?.t !== 'game.update') throw new Error('unreachable');
    expect(next.table.status[0]).toBe('bot');
    const mark = a.frames.length,
      rev = next.rev;
    // The other seat hears the same step, and the leaver is out of the lobby it reads.
    expect(framesOf(b, 'game.update').find((u) => u.rev === rev)?.events).toEqual(next.events);
    expect(lobbyOf(b).members).toHaveLength(2);

    await until(() => framesOf(b, 'game.over').length > 0, 'the game ends');
    expect(last(b, 'game.update').rev).toBeGreaterThan(rev + 50);
    // After its last update the leaver's socket got the result and nothing else.
    expect(a.frames.slice(mark)).toEqual([last(b, 'game.over')]);
    // The seat it gave up was played by a bot to the end.
    expect(last(b, 'game.over').result.totals).toHaveLength(3);

    // Leaving twice is not a thing, and neither is playing on.
    const again = a.send({ t: 'game.leave' });
    await flush();
    expect(answer(a, again).reply).toMatchObject({ t: 'err', code: 'NOT_IN_GAME' });
  });

  it('owes a leaver without a socket the result: it is written right after their next welcome, which has no game', async () => {
    const as = server.transport();
    const host = await connect(as);
    host.send({ t: 'lobby.create', visibility: 'private', settings: SETTINGS });
    host.send({ t: 'lobby.addBot' });
    host.send({ t: 'lobby.ready', ready: true });
    await flush();
    const other = await connect();
    other.send({ t: 'lobby.join', code: lobbyOf(host).code });
    other.send({ t: 'lobby.ready', ready: true });
    await flush();
    host.send({ t: 'lobby.start' });
    await flush();
    host.send({ t: 'game.leave' });
    await flush();
    host.close();
    await until(() => framesOf(other, 'game.over').length > 0, 'the game ends');

    const back = await connect(as);
    expect(back.frames.map((f) => f.t)).toEqual(['ok', 'welcome', 'game.over']);
    expect(last(back, 'welcome')).toMatchObject({ game: null, lobby: null });
    expect(last(back, 'game.over')).toEqual(last(other, 'game.over'));
  });

  it('holds the seat of a player whose connection dropped: the welcome on the next socket is the game', async () => {
    const as = server.transport();
    const host = await connect(as);
    host.send({ t: 'lobby.create', visibility: 'private', settings: SETTINGS });
    host.send({ t: 'lobby.addBot' });
    host.send({ t: 'lobby.ready', ready: true });
    await flush();
    host.send({ t: 'lobby.start' });
    await flush();
    const bid = host.send({ t: 'game.bid', at: at(host), bid: 3 });
    await flush();
    expect(answer(host, bid).reply.t).toBe('ok');
    const hand = view(host).hand;

    server.drop();
    await flush();
    expect(host.closed).toBe(1006);
    const back = await connect(as);
    const welcome = last(back, 'welcome');
    expect(welcome.me.active).toEqual({ kind: 'game', id: last(host, 'game.start').gameId });
    expect(welcome.game?.start).toEqual(last(host, 'game.start'));
    expect(welcome.game?.update).toMatchObject({ events: [], view: { me: 0, hand } });
    expect(welcome.game?.update.view.bids[0]).toBe(3);
    // Nothing on the new socket answers an id of the old one.
    expect(back.frames.filter((f) => f.t === 'ok' || f.t === 'err')).toHaveLength(1);
  });
});
