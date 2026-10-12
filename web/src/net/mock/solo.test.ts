/* The mock server's solo game, looked at from bare connections: what `solo.start` answers and
   seats, what stands still while the player has no socket, and what a leave does. These are the
   replies of the Rust server (docs/protocol.md §5, `solo.start`; docs/handover/092), so the same
   checks are what that server passes. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { GameSettings, GameUpdate, Me } from '../../protocol/generated';
import type { ServerMessage } from '../messages';
import { connectRaw, framesOf } from './raw';
import type { RawClient } from './raw';
import { MockServer, STANDARD } from './server';

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Three seats and five short rounds, with nothing extra in the deck. */
const SOLO: GameSettings = { ...STANDARD, maxPlayers: 3, format: 'swift', abilities: false };
const CLOCKS = { bidMs: 400, playMs: 300, abilityMs: 300, trickEndMs: 100, roundEndMs: 200 };

let server: MockServer;
const flush = (ms = 0): Promise<void> => vi.advanceTimersByTimeAsync(ms).then(() => {});

interface Player {
  socket: RawClient;
  me(): Promise<Me>;
  connect(): Promise<RawClient>;
  register(username: string): Promise<number>;
}
async function player(): Promise<Player> {
  const b = server.browser();
  await b.rest('POST', '/auth/guest');
  const connect = async (): Promise<RawClient> => {
    const client = await connectRaw(b.transport);
    await flush();
    return client;
  };
  return {
    socket: await connect(),
    me: async () => (await b.rest('GET', '/me')).body as Me,
    connect,
    register: async (username) => (await b.rest('POST', '/auth/register', { username, password: 'secret' })).status,
  };
}
function reply(client: RawClient, id: number): ServerMessage {
  const found = client.frames.find((f) => (f.t === 'ok' || f.t === 'err') && f.re === id);
  if (!found) throw new Error(`No reply to ${id}`);
  return found;
}
async function ask(client: RawClient, message: Parameters<RawClient['send']>[0]): Promise<ServerMessage> {
  const id = client.send(message);
  await flush();
  return reply(client, id);
}
const lastUpdate = (client: RawClient): GameUpdate => {
  const found = framesOf(client, 'game.update').at(-1);
  if (!found) throw new Error('No game.update yet');
  return found;
};
/** What a seat can see of where the game stands: enough to tell whether anything was played. */
const standing = (update: GameUpdate): string =>
  JSON.stringify([update.view.phase, update.view.round, update.view.bids, update.view.trick, update.view.hand]);

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockImplementation(seeded(11));
  server = new MockServer({ random: seeded(5), timers: CLOCKS, bot: { minMs: 40, maxMs: 80 } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('solo.start', () => {
  it('seats the player in seat 0 and a bot in every other, at a table named solo with no lobby', async () => {
    const p = await player(),
      id = p.socket.send({ t: 'solo.start', settings: { ...SOLO, botLevel: 'hard', pace: 'fast' } });
    await flush();
    // `ok`, then `game.start`, then the first `game.update`, in that order.
    const order = p.socket.frames.map((f) => f.t),
      at = order.indexOf('ok', order.indexOf('welcome') + 1);
    expect(reply(p.socket, id)).toMatchObject({ t: 'ok' });
    expect(order.slice(at, at + 3)).toEqual(['ok', 'game.start', 'game.update']);

    const start = framesOf(p.socket, 'game.start')[0];
    expect(start).toMatchObject({ table: 'solo', mode: 'custom', lobbyId: null, me: 0 });
    expect(start.seats.map((seat) => seat.bot)).toEqual([false, true, true]);
    // The pace is kept as standard whatever was sent. The rest is what was asked for.
    expect(start.settings).toEqual({ ...SOLO, botLevel: 'hard', pace: 'standard' });
    expect(lastUpdate(p.socket).rev).toBe(0);
    // No clock on the player's bid.
    expect(lastUpdate(p.socket).table.deadline).toBeNull();
    expect(await p.me()).toMatchObject({ active: { kind: 'game', table: 'solo', round: 1, rounds: 5, bots: 2 } });
  });

  it('takes every table from two seats to eight, and refuses the rest without seating anyone', async () => {
    for (const maxPlayers of [2, 8]) {
      const p = await player();
      expect(await ask(p.socket, { t: 'solo.start', settings: { ...SOLO, maxPlayers } })).toMatchObject({ t: 'ok' });
      expect(framesOf(p.socket, 'game.start')[0].seats).toHaveLength(maxPlayers);
    }
    for (const maxPlayers of [1, 9]) {
      const p = await player();
      expect(await ask(p.socket, { t: 'solo.start', settings: { ...SOLO, maxPlayers } })).toMatchObject({
        t: 'err',
        code: 'VALIDATION',
      });
      expect(framesOf(p.socket, 'game.start')).toEqual([]);
      expect((await p.me()).active).toBeNull();
    }
  });

  it('refuses a second start, and a start from a lobby or a queue', async () => {
    const solo = await player();
    await ask(solo.socket, { t: 'solo.start', settings: SOLO });
    expect(await ask(solo.socket, { t: 'solo.start', settings: SOLO })).toMatchObject({
      t: 'err',
      code: 'ALREADY_SEATED',
    });
    expect(framesOf(solo.socket, 'game.start')).toHaveLength(1);

    const host = await player();
    await ask(host.socket, { t: 'lobby.create', visibility: 'private', settings: SOLO });
    expect(await ask(host.socket, { t: 'solo.start', settings: SOLO })).toMatchObject({ code: 'ALREADY_SEATED' });

    const waiting = await player();
    await ask(waiting.socket, { t: 'queue.join', mode: 'casual' });
    expect(await ask(waiting.socket, { t: 'solo.start', settings: SOLO })).toMatchObject({ code: 'ALREADY_SEATED' });
  });

  it('lets a guest start one, and keeps it when that guest registers', async () => {
    const p = await player();
    await ask(p.socket, { t: 'solo.start', settings: SOLO });
    const game = (await p.me()).active;
    expect(await p.register('calico')).toBe(200);
    expect(await p.me()).toMatchObject({ guest: false, active: game });
  });
});

describe('a solo table', () => {
  it('lets the bots play up to the player and then waits, with no clock, for as long as it takes', async () => {
    const p = await player();
    await ask(p.socket, { t: 'solo.start', settings: SOLO });
    await flush(1000);
    const update = lastUpdate(p.socket);
    // Both bots have bid. The player has not, and nothing counts down on them.
    expect(update.view.phase).toBe('bidding');
    expect(update.view.bids[0]).toBeNull();
    expect(update.table.deadline).toBeNull();

    const frames = p.socket.frames.length;
    await flush(60 * 60 * 1000);
    // An hour later nothing was played for them, and nothing was said.
    expect(p.socket.frames).toHaveLength(frames);
    expect(framesOf(p.socket, 'game.update').some((u) => u.events.some((e) => e.type === 'timedOut'))).toBe(false);
  });

  it('plays no card while the player has no socket, and gives the same hand back when they return', async () => {
    const p = await player();
    await ask(p.socket, { t: 'solo.start', settings: SOLO });
    await flush(1000);
    await ask(p.socket, { t: 'game.bid', at: { round: 0, trick: 0 }, bid: 1 });
    // The bidding is over, and the bots that come before the player have played.
    await flush(1000);
    const before = lastUpdate(p.socket);
    expect(before.view.phase).toBe('playing');

    // The socket closes while a bot may be about to play. Nothing moves for a long time.
    p.socket.close();
    await flush(10 * 60 * 1000);
    expect(await p.me()).toMatchObject({ active: { kind: 'game', table: 'solo', round: 1 } });

    const back = await p.connect(),
      welcome = framesOf(back, 'welcome')[0];
    // The `welcome` still has the seat offline. The update that follows has the player online.
    expect(welcome.game?.start).toMatchObject({ table: 'solo', gameId: before.gameId });
    expect(welcome.game?.update.table.status[0]).toBe('offline');
    expect(welcome.game && standing(welcome.game.update)).toBe(standing(before));
    expect(lastUpdate(back).table.status[0]).toBe('online');
    // No seat was given to a bot, no turn was played for the player, and nobody lost a seat.
    expect(lastUpdate(back).table.status).toEqual(['online', 'bot', 'bot']);
    expect(framesOf(back, 'seat.lost')).toEqual([]);
    expect(framesOf(back, 'game.update').some((u) => u.events.some((e) => e.type === 'timedOut'))).toBe(false);
  });

  it('answers a leave with ok and nothing else: the game is gone, with no result and no stats', async () => {
    const p = await player();
    await ask(p.socket, { t: 'solo.start', settings: SOLO });
    await flush(1000);
    const frames = p.socket.frames.length;
    expect(await ask(p.socket, { t: 'game.leave' })).toMatchObject({ t: 'ok' });
    await flush(5000);
    // One frame came after the leave: its `ok`.
    expect(p.socket.frames.slice(frames).map((f) => f.t)).toEqual(['ok']);
    expect(await p.me()).toMatchObject({ active: null, cooldownUntil: null, stats: { games: 0 } });

    // The next `welcome` has no game, and another solo game can be started.
    p.socket.close();
    const back = await p.connect();
    expect(framesOf(back, 'welcome')[0].game).toBeNull();
    expect(framesOf(back, 'game.over')).toEqual([]);
    expect(await ask(back, { t: 'solo.start', settings: SOLO })).toMatchObject({ t: 'ok' });
  });

  it('counts a solo game that was played to its end, for a guest too', async () => {
    const p = await player();
    await ask(p.socket, { t: 'solo.start', settings: { ...SOLO, maxPlayers: 2 } });
    const deck = framesOf(p.socket, 'game.start')[0].deck;
    // The player bids nothing and plays the first card they may, every time it is their turn.
    for (let i = 0; i < 4000 && framesOf(p.socket, 'game.over').length === 0; i++) {
      await flush(60);
      const { view } = lastUpdate(p.socket),
        at = { round: view.round, trick: view.won.reduce((a, b) => a + b, 0) + view.log[view.round].destroyed };
      if (view.phase === 'bidding' && view.bids[0] == null) p.socket.send({ t: 'game.bid', at, bid: 0 });
      else if (view.phase === 'playing' && view.turn === 0) {
        const card = view.legal[0];
        // A Tigress is played as one thing or the other: here always as an escape.
        if (deck[card].kind === 'tigress') p.socket.send({ t: 'game.play', at, card, as: 'escape' });
        else p.socket.send({ t: 'game.play', at, card });
      } else if (view.phase === 'roundEnd') p.socket.send({ t: 'game.ready' });
    }
    const over = framesOf(p.socket, 'game.over')[0];
    expect(over.result.places).toHaveLength(2);
    expect(over.result.rating).toBeNull();
    expect(await p.me()).toMatchObject({ guest: true, active: null, stats: { games: 1 } });
  });
});
