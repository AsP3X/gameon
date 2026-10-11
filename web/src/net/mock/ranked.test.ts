/* The mock server's ranked queue, rating change, cooldown and ladder, from bare connections and
   bare REST calls. The Rust server does not speak ranked yet, so this is what the client is built
   against. The NUMBERS here are stand-ins the screens can render (one point up or down, one tier,
   every game a placement game, a fixed cooldown): the frames and their order are the contract, the
   values are not. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { LadderPage, Me, Rating } from '../../protocol/generated';
import type { RestMethod, RestResponse } from '../api';
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

/** Short clocks: a deadline plays for a human who does nothing, so a whole game runs by itself. */
const FAST = { bidMs: 400, playMs: 300, abilityMs: 300, trickEndMs: 100, roundEndMs: 200 };
const QUEUE_FILL_MS = 5000;
const COOLDOWN_MS = 10 * 60_000;
const T0 = 1_700_000_000_000;

let server: MockServer;
const flush = (): Promise<void> => vi.advanceTimersByTimeAsync(0).then(() => {});

interface Player {
  call(method: RestMethod, path: string, body?: unknown): Promise<RestResponse>;
  me(): Promise<Me>;
  connect(): Promise<RawClient>;
  socket: RawClient;
}
/** A browser with a session: a guest, or an account when it is given a username. */
async function player(username?: string): Promise<Player> {
  const b = server.browser();
  await b.rest('POST', '/auth/guest');
  if (username) {
    await b.rest('PATCH', '/me', { name: username });
    expect((await b.rest('POST', '/auth/register', { username, password: 'x' })).status).toBe(200);
  }
  const connect = async (): Promise<RawClient> => {
    const client = await connectRaw(b.transport);
    await flush();
    return client;
  };
  return {
    call: (method, path, body) => b.rest(method, path, body),
    me: async () => (await b.rest('GET', '/me')).body as Me,
    connect,
    socket: await connect(),
  };
}
const last = <T extends ServerMessage['t']>(client: RawClient, t: T): Extract<ServerMessage, { t: T }> => {
  const found = framesOf(client, t).at(-1);
  if (!found) throw new Error(`No ${t} frame yet`);
  return found;
};
async function ask(client: RawClient, message: Parameters<RawClient['send']>[0]): Promise<ServerMessage> {
  const id = client.send(message);
  await flush();
  const found = client.frames.find((f) => (f.t === 'ok' || f.t === 'err') && f.re === id);
  if (!found) throw new Error(`No reply to ${id}`);
  return found;
}
async function until(done: () => boolean, what: string, steps = 8000): Promise<void> {
  for (let i = 0; i < steps; i++) {
    if (done()) return;
    await vi.advanceTimersByTimeAsync(50);
  }
  throw new Error(`Never happened: ${what}`);
}
const NAMES = ['anne', 'calico', 'mary', 'kidd'];
/** Four accounts at one ranked table, in that seat order. */
async function rankedTable(): Promise<Player[]> {
  const players: Player[] = [];
  for (const name of NAMES) {
    const p = await player(name);
    expect(await ask(p.socket, { t: 'queue.join', mode: 'ranked' })).toMatchObject({ t: 'ok' });
    players.push(p);
  }
  return players;
}
const error = (code: string): unknown => ({ error: { code, message: expect.any(String) } });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  vi.spyOn(Math, 'random').mockImplementation(seeded(11));
  server = new MockServer({
    random: seeded(5),
    timers: FAST,
    bot: { minMs: 40, maxMs: 80 },
    queueFillMs: QUEUE_FILL_MS,
    cooldownMs: COOLDOWN_MS,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the ranked queue', () => {
  it('refuses a guest with ACCOUNT_REQUIRED, and before ALREADY_SEATED when the guest is seated', async () => {
    const guest = await player();
    expect(await ask(guest.socket, { t: 'queue.join', mode: 'ranked' })).toMatchObject({
      t: 'err',
      code: 'ACCOUNT_REQUIRED',
    });
    expect((await guest.me()).active).toBeNull();
    await ask(guest.socket, { t: 'lobby.create', visibility: 'private', settings: STANDARD });
    expect(await ask(guest.socket, { t: 'queue.join', mode: 'ranked' })).toMatchObject({ code: 'ACCOUNT_REQUIRED' });
    // Casual from that same seat is the other refusal.
    expect(await ask(guest.socket, { t: 'queue.join', mode: 'casual' })).toMatchObject({ code: 'ALREADY_SEATED' });
  });

  it('answers an account with the queue and tells the others waiting, as the casual queue does', async () => {
    const anne = await player('anne');
    expect(await ask(anne.socket, { t: 'queue.join', mode: 'ranked' })).toEqual({
      t: 'ok',
      re: expect.any(Number),
      queue: { mode: 'ranked', since: T0, found: 1, needed: 4 },
    });
    expect((await anne.me()).active).toEqual({ kind: 'queue', id: 'ranked' });
    await vi.advanceTimersByTimeAsync(2000);
    const calico = await player('calico');
    await ask(calico.socket, { t: 'queue.join', mode: 'ranked' });
    // The one who waited is pushed the change with their own `since`; the joiner's reply said it.
    expect(framesOf(anne.socket, 'queue.status')).toEqual([
      { t: 'queue.status', queue: { mode: 'ranked', since: T0, found: 2, needed: 4 } },
    ]);
    expect(framesOf(calico.socket, 'queue.status')).toEqual([]);
    expect(last(calico.socket, 'ok').queue).toEqual({ mode: 'ranked', since: T0 + 2000, found: 2, needed: 4 });
    // A dropped socket keeps the place.
    anne.socket.close();
    await flush();
    expect(last(await anne.connect(), 'welcome').queue).toMatchObject({ mode: 'ranked', found: 2 });
    expect(await ask(calico.socket, { t: 'queue.leave' })).toMatchObject({ t: 'ok' });
    expect((await calico.me()).active).toBeNull();
  });

  it('keeps the two queues apart, and seats nobody twice', async () => {
    const anne = await player('anne'),
      calico = await player('calico');
    await ask(anne.socket, { t: 'queue.join', mode: 'casual' });
    expect(await ask(calico.socket, { t: 'queue.join', mode: 'ranked' })).toMatchObject({
      queue: { mode: 'ranked', found: 1 },
    });
    expect(framesOf(anne.socket, 'queue.status')).toEqual([]);
    // In either queue, the other one is closed, and so is every lobby.
    for (const [who, mode] of [
      [anne, 'ranked'],
      [calico, 'casual'],
      [calico, 'ranked'],
    ] as const)
      expect(await ask(who.socket, { t: 'queue.join', mode })).toMatchObject({ code: 'ALREADY_SEATED' });
    expect(await ask(calico.socket, { t: 'lobby.create', visibility: 'private', settings: STANDARD })).toMatchObject({
      code: 'ALREADY_SEATED',
    });
    // In a lobby, and in a game, ranked is closed too.
    const mary = await player('mary');
    await ask(mary.socket, { t: 'lobby.create', visibility: 'private', settings: STANDARD });
    expect(await ask(mary.socket, { t: 'queue.join', mode: 'ranked' })).toMatchObject({ code: 'ALREADY_SEATED' });
    await vi.advanceTimersByTimeAsync(QUEUE_FILL_MS);
    expect(framesOf(anne.socket, 'game.start')).toHaveLength(1);
    expect(await ask(anne.socket, { t: 'queue.join', mode: 'ranked' })).toMatchObject({ code: 'ALREADY_SEATED' });
  });

  it('never fills a ranked table with bots: three accounts wait for as long as it takes', async () => {
    const [anne, calico, mary] = [await player('anne'), await player('calico'), await player('mary')];
    for (const p of [anne, calico, mary]) await ask(p.socket, { t: 'queue.join', mode: 'ranked' });
    await vi.advanceTimersByTimeAsync(QUEUE_FILL_MS * 20);
    for (const p of [anne, calico, mary]) expect(framesOf(p.socket, 'game.start')).toEqual([]);
    expect((await mary.me()).active).toEqual({ kind: 'queue', id: 'ranked' });
  });

  it('starts when four accounts wait: game.start with four humans, no bot and no lobby, then the opening update', async () => {
    const players = await rankedTable();
    // The fourth joiner's reply names the queue they were in for a moment.
    expect(last(players[3].socket, 'ok').queue).toEqual({ mode: 'ranked', since: T0, found: 4, needed: 4 });
    for (const [seat, p] of players.entries()) {
      const start = last(p.socket, 'game.start');
      expect(start).toMatchObject({ mode: 'ranked', lobbyId: null, settings: STANDARD, me: seat });
      // Humans in the order they joined, and nobody else.
      expect(start.seats.map((s) => [s.name, s.bot])).toEqual(NAMES.map((name) => [name, false]));
      expect(start.seats.every((s) => s.userId != null)).toBe(true);
      const i = p.socket.frames.indexOf(start);
      expect(p.socket.frames[i + 1]).toMatchObject({ t: 'game.update', rev: 0, events: [] });
      // No accept step and no lobby. What comes before `game.start` is the fourth join itself: its
      // `ok` for the joiner, and for the three who waited the push that says four are found. Nothing
      // after that says the table formed.
      expect(framesOf(p.socket, 'lobby.state')).toEqual([]);
      expect(p.socket.frames[i - 1]).toMatchObject(
        seat === 3 ? { t: 'ok', queue: { found: 4 } } : { t: 'queue.status', queue: { mode: 'ranked', found: 4 } },
      );
      expect(framesOf(p.socket, 'queue.status')).toHaveLength(seat === 3 ? 0 : 3 - seat);
      expect((await p.me()).active).toEqual({ kind: 'game', id: start.gameId });
    }
    expect(new Set(players.map((p) => last(p.socket, 'game.start').gameId)).size).toBe(1);
  });
});

describe('the result of a ranked game', () => {
  it('tells every seat its own rating change, and stores it: one up for the winner, one down for the rest', async () => {
    const players = await rankedTable();
    expect((await players[0].me()).rating).toBeNull();
    await until(() => players.every((p) => framesOf(p.socket, 'game.over').length > 0), 'the game ends');
    const places = last(players[0].socket, 'game.over').result.places;
    expect(places.filter((place) => place === 1).length).toBeGreaterThanOrEqual(1);
    const unrated: Rating = { value: 0, tier: 'Deckhand', provisional: true, games: 0 };
    for (const [seat, p] of players.entries()) {
      const { result } = last(p.socket, 'game.over'),
        delta = places[seat] === 1 ? 1 : -1,
        after: Rating = { value: delta, tier: 'Deckhand', provisional: true, games: 1 };
      expect(result).toMatchObject({ places, forfeited: [], lobbyId: null });
      // `rating` is the receiver's own, and nobody else's.
      expect(result.rating).toEqual({ before: unrated, after, delta });
      const me = await p.me();
      expect(me.rating).toEqual(after);
      expect(me.user.tier).toBe('Deckhand');
      expect(me).toMatchObject({ active: null, cooldownUntil: null });
      expect(me.stats.games).toBe(1);
    }
  });

  it('leaves the rating alone after a casual game', async () => {
    const anne = await player('anne');
    await ask(anne.socket, { t: 'queue.join', mode: 'casual' });
    await until(() => framesOf(anne.socket, 'game.over').length > 0, 'the game ends');
    expect(last(anne.socket, 'game.over').result).toMatchObject({ rating: null, forfeited: [] });
    expect((await anne.me()).rating).toBeNull();
    expect((await anne.call('GET', '/ladder')).body).toMatchObject({ entries: [] });
  });
});

describe('leaving a ranked game', () => {
  it('is a forfeit: the seat is last, a cooldown starts, and the others get a normal result', async () => {
    const players = await rankedTable(),
      [anne, ...others] = players;
    await vi.advanceTimersByTimeAsync(1000);
    const leftAt = Date.now();
    expect(await ask(anne.socket, { t: 'game.leave' })).toMatchObject({ t: 'ok' });
    // The table is down for the leaver at once, and the cooldown is on `Me`.
    const me = await anne.me();
    expect(me).toMatchObject({ active: null, cooldownUntil: leftAt + COOLDOWN_MS });
    expect(last(await anne.connect(), 'welcome')).toMatchObject({ game: null, queue: null });
    // A bot plays the seat to the end, and the leaver hears the result when the game is over.
    const back = await anne.connect();
    await until(() => others.every((p) => framesOf(p.socket, 'game.over').length > 0), 'the game ends');
    const theirs = last(others[0].socket, 'game.over').result;
    expect(theirs.forfeited).toEqual([0]);
    expect(theirs.places[0]).toBe(4);
    // The three who stayed are placed among themselves, from first.
    expect(Math.min(...theirs.places.slice(1))).toBe(1);
    expect(theirs.places.slice(1).every((place) => place >= 1 && place <= 3)).toBe(true);
    expect(last(back, 'game.over').result).toMatchObject({
      forfeited: [0],
      rating: { delta: -1, after: { value: -1, games: 1 } },
    });
    expect((await anne.me()).rating).toMatchObject({ value: -1, tier: 'Deckhand', provisional: true, games: 1 });
    // The seat that left is not in the game count; its rating moved all the same.
    expect((await anne.me()).stats.games).toBe(0);
    expect((await others[0].me()).stats.games).toBe(1);
  });

  it('closes the ranked queue with QUEUE_COOLDOWN until the time on Me, and says no time in the message', async () => {
    const [anne] = await rankedTable();
    await ask(anne.socket, { t: 'game.leave' });
    const until = (await anne.me()).cooldownUntil;
    expect(until).toBe(Date.now() + COOLDOWN_MS);
    const refused = await ask(anne.socket, { t: 'queue.join', mode: 'ranked' });
    expect(refused).toMatchObject({ t: 'err', code: 'QUEUE_COOLDOWN' });
    expect(refused.t === 'err' && refused.message).not.toMatch(/\d/);
    expect((await anne.me()).active).toBeNull();
    // The cooldown is the ranked queue's: casual is open.
    expect(await ask(anne.socket, { t: 'queue.join', mode: 'casual' })).toMatchObject({ t: 'ok' });
    await ask(anne.socket, { t: 'queue.leave' });

    await vi.advanceTimersByTimeAsync(COOLDOWN_MS - 1000);
    expect(await ask(anne.socket, { t: 'queue.join', mode: 'ranked' })).toMatchObject({ code: 'QUEUE_COOLDOWN' });
    await vi.advanceTimersByTimeAsync(1000);
    expect((await anne.me()).cooldownUntil).toBeNull();
    expect(await ask(anne.socket, { t: 'queue.join', mode: 'ranked' })).toMatchObject({
      t: 'ok',
      queue: { mode: 'ranked' },
    });
  });

  it('starts no cooldown and no forfeit for leaving a casual game', async () => {
    const anne = await player('anne'),
      calico = await player('calico');
    await ask(anne.socket, { t: 'queue.join', mode: 'casual' });
    await ask(calico.socket, { t: 'queue.join', mode: 'casual' });
    await vi.advanceTimersByTimeAsync(QUEUE_FILL_MS);
    await ask(anne.socket, { t: 'game.leave' });
    expect((await anne.me()).cooldownUntil).toBeNull();
    await until(() => framesOf(calico.socket, 'game.over').length > 0, 'the game ends');
    expect(last(calico.socket, 'game.over').result).toMatchObject({ forfeited: [], rating: null });
  });
});

describe('the ladder', () => {
  const ladder = async (who: Player, query = ''): Promise<LadderPage> =>
    (await who.call('GET', `/ladder${query}`)).body as LadderPage;

  it('needs a session, and is an empty list with its season before anyone has played', async () => {
    expect(await server.browser().rest('GET', '/ladder')).toEqual({ status: 401, body: error('UNAUTHENTICATED') });
    const guest = await player();
    const page = await ladder(guest);
    expect(page).toEqual({
      season: { id: 1, name: 'Season 1', startsAt: expect.any(Number), endsAt: expect.any(Number) },
      entries: [],
    });
    expect(page.season.startsAt).toBeLessThan(Date.now());
    expect(page.season.endsAt).toBeGreaterThan(Date.now());
    // The config names the same season, but the ladder does not lean on it.
    expect((await guest.call('GET', '/config')).body).toMatchObject({ season: page.season });
  });

  it('lists everyone with a rating, best first, as public players: no username anywhere', async () => {
    const players = await rankedTable();
    await until(() => players.every((p) => framesOf(p.socket, 'game.over').length > 0), 'the game ends');
    const page = await ladder(await player());
    expect(page.next).toBeUndefined();
    expect(page.entries.map((e) => e.rank)).toEqual([1, 2, 3, 4]);
    const values = page.entries.map((e) => e.rating.value);
    expect(values).toEqual(values.toSorted((a, b) => b - a));
    expect(page.entries.map((e) => e.user.name).toSorted()).toEqual(NAMES.toSorted());
    for (const entry of page.entries) {
      expect(Object.keys(entry).toSorted()).toEqual(['rank', 'rating', 'user']);
      expect(Object.keys(entry.user).toSorted()).toEqual(['color', 'id', 'name', 'tier']);
      expect(Object.keys(entry.rating).toSorted()).toEqual(['games', 'provisional', 'tier', 'value']);
    }
    // The display names here happen to be the usernames; the word "username" and the guest flag are not on the wire.
    expect(JSON.stringify(page)).not.toMatch(/username|guest|cooldown|stats/);
  });

  it('pages with limit and after, and names the next page only while there is one', async () => {
    const players = await rankedTable();
    await until(() => players.every((p) => framesOf(p.socket, 'game.over').length > 0), 'the game ends');
    const viewer = players[0],
      all = await ladder(viewer);
    const first = await ladder(viewer, '?limit=3');
    expect(first.entries).toEqual(all.entries.slice(0, 3));
    expect(first.next).toEqual(expect.any(String));
    const second = await ladder(viewer, `?limit=3&after=${first.next}`);
    expect(second.entries).toEqual(all.entries.slice(3));
    expect(second.next).toBeUndefined();
    expect((await ladder(viewer, '?season=1')).entries).toEqual(all.entries);
    expect(await viewer.call('GET', '/ladder?season=2')).toEqual({ status: 404, body: error('NOT_FOUND') });
    for (const query of ['?limit=0', '?limit=101', '?limit=x', '?after=-1', '?after=soon'])
      expect(await viewer.call('GET', `/ladder${query}`)).toEqual({ status: 400, body: error('VALIDATION') });
  });
});
