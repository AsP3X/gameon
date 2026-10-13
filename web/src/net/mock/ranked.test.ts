/* The mock server's ranked queue, rating change, cooldown and ladder, from bare connections and
   bare REST calls: the rules of docs/protocol.md §4, §5.4 and §5.5 as far as a client can see them.
   What a rating is worth after a game is the server's (Weng-Lin), and the mock's own step is not
   checked here. What is checked is the shape every rating has: a whole number, `delta` the
   difference of the two values that were sent, the tier of the band the value is in, and placement
   until the fifth game. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { GameUpdate, LadderPage, Me, Rating } from '../../protocol/generated';
import type { RestMethod, RestResponse } from '../api';
import type { ServerMessage } from '../messages';
import { connectRaw, framesOf } from './raw';
import type { RawClient } from './raw';
import { MockServer, STANDARD } from './server';
import type { MockStore } from './server';

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
const MINUTE_MS = 60_000;
/** 11 October 2026, midday UTC: the season is 2026 Q4. */
const T0 = Date.UTC(2026, 9, 11, 12);
const Q4 = { id: 4, name: '2026 Q4', startsAt: Date.UTC(2026, 9, 1), endsAt: Date.UTC(2027, 0, 1) };
/** The tier of a value, written down from §4 and not taken from the mock. */
function tierOf(value: number): string {
  const bands: [number, string][] = [
    [8, 'Deckhand'],
    [16, 'Bosun'],
    [24, 'Quartermaster'],
    [32, 'First Mate'],
    [40, 'Captain'],
    [48, 'Pirate Lord'],
  ];
  return bands.find(([below]) => value < below)?.[1] ?? 'Skull King';
}
/** What every rating on the wire looks like, whatever its number. */
function expectShape(rating: Rating, games: number): void {
  expect(Number.isInteger(rating.value)).toBe(true);
  expect(rating).toEqual({ value: rating.value, tier: tierOf(rating.value), provisional: games < 5, games });
}
const UNRATED: Rating = { value: 0, tier: 'Deckhand', provisional: true, games: 0 };

let server: MockServer;
const flush = (): Promise<void> => vi.advanceTimersByTimeAsync(0).then(() => {});

interface Player {
  call(method: RestMethod, path: string, body?: unknown): Promise<RestResponse>;
  me(): Promise<Me>;
  connect(): Promise<RawClient>;
  socket: RawClient;
}
let logins = 0;
/** A browser with a session: a guest, or an account with that display name and a login of its own. */
async function player(name?: string): Promise<Player> {
  const b = server.browser();
  await b.rest('POST', '/auth/guest');
  if (name) {
    await b.rest('PATCH', '/me', { name });
    expect((await b.rest('POST', '/auth/register', { username: `login_${++logins}`, password: 'x' })).status).toBe(200);
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
/** Put these accounts into the ranked queue, in this order. Four of them are a table. */
async function queueUp(players: Player[]): Promise<void> {
  for (const p of players) expect(await ask(p.socket, { t: 'queue.join', mode: 'ranked' })).toMatchObject({ t: 'ok' });
}
/** Four new accounts at one ranked table, in that seat order. */
async function rankedTable(names = NAMES): Promise<Player[]> {
  const players: Player[] = [];
  for (const name of names) players.push(await player(name));
  await queueUp(players);
  return players;
}
/** Let the deadlines play a table to its end: every one of `players` has `games` results by then. */
const played = (players: Player[], games = 1): Promise<void> =>
  until(() => players.every((p) => framesOf(p.socket, 'game.over').length >= games), 'the game ends');
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
      // Nobody at this table has a rating yet, so no seat is announced with a tier.
      expect(start.seats.map((s) => s.tier)).toEqual([null, null, null, null]);
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
  it('tells every seat its own rating change, in the shape every rating has, and stores it', async () => {
    const players = await rankedTable();
    expect((await players[0].me()).rating).toBeNull();
    expect((await players[0].me()).user.tier).toBeNull();
    await played(players);
    const places = last(players[0].socket, 'game.over').result.places;
    const deltas: number[] = [];
    for (const [seat, p] of players.entries()) {
      const { result } = last(p.socket, 'game.over');
      expect(result).toMatchObject({ places, forfeited: [], lobbyId: null });
      // `rating` is the receiver's own. An account that had none starts from the same place.
      const change = result.rating;
      if (!change) throw new Error('A ranked game has a rating change');
      expect(change.before).toEqual(UNRATED);
      expectShape(change.after, 1);
      expect(change.delta).toBe(change.after.value - change.before.value);
      deltas[seat] = change.delta;
      // `Me.rating` and `User.tier` are written before `game.over` is.
      const me = await p.me();
      expect(me.rating).toEqual(change.after);
      expect(me.user.tier).toBe(change.after.tier);
      expect(me).toMatchObject({ active: null, cooldownUntil: null });
      const gameId = last(p.socket, 'game.over').gameId;
      const record = await p.call('GET', `/games/${gameId}/log`);
      expect(record.status).toBe(200);
      expect(record.body).toEqual(
        expect.objectContaining({
          gameId,
          entries: expect.arrayContaining([expect.objectContaining({ kind: 'deal' })]),
        }),
      );
      // A ranked game is counted in the rating's `games` and on the ranked line. It changes no
      // headline number, and no other line.
      expect(me.stats).toMatchObject({ games: 0, wins: 0, bidsMade: 0, bidsTotal: 0, bestScore: null });
      expect(me.stats.byMode?.ranked.games).toBe(1);
      expect(me.stats.byMode?.ranked.wins).toBe(places[seat] === 1 ? 1 : 0);
      expect(me.stats.byMode?.casual.games).toBe(0);
    }
    // With a rating, the seat is announced with its tier at a casual table too. A bot's is null.
    const rated = players[0],
      tier = (await rated.me()).user.tier;
    await ask(rated.socket, { t: 'queue.join', mode: 'casual' });
    await vi.advanceTimersByTimeAsync(QUEUE_FILL_MS);
    expect(last(rated.socket, 'game.start')).toMatchObject({ mode: 'casual' });
    expect(last(rated.socket, 'game.start').seats.map((s) => s.tier)).toEqual([tier, null, null, null]);
    // Whatever the model, between equals a better place is never worth less.
    for (const [a, placeA] of places.entries())
      for (const [b, placeB] of places.entries())
        if (placeA < placeB) expect(deltas[a]).toBeGreaterThanOrEqual(deltas[b]);
    expect(deltas[places.indexOf(1)]).toBeGreaterThan(0);
  });

  it('ends placement with the fifth game, names the tier of the band, and announces a rated seat with its tier', async () => {
    const players = await rankedTable();
    for (let game = 1; game <= 6; game++) {
      await played(players, game);
      for (const p of players) {
        const change = last(p.socket, 'game.over').result.rating;
        if (!change) throw new Error('A ranked game has a rating change');
        expectShape(change.after, game);
        expect(change.delta).toBe(change.after.value - change.before.value);
        // The game before this one is where this one started from.
        if (game > 1) expectShape(change.before, game - 1);
        expect((await p.me()).rating).toEqual(change.after);
      }
      if (game === 6) break;
      const tiers = await Promise.all(players.map(async (p) => (await p.me()).user.tier));
      await queueUp(players);
      // From the second game on, everyone has a rating at the deal, and the seat says its tier.
      expect(last(players[0].socket, 'game.start').seats.map((s) => s.tier)).toEqual(tiers);
      expect(tiers.every((tier) => tier != null)).toBe(true);
    }
    const ratings = await Promise.all(players.map(async (p) => (await p.me()).rating));
    expect(ratings.map((r) => r?.provisional)).toEqual([false, false, false, false]);
    expect(ratings.map((r) => r?.games)).toEqual([6, 6, 6, 6]);
  });

  it('leaves the rating alone after a casual game, and counts that game in the stats', async () => {
    const anne = await player('anne');
    await ask(anne.socket, { t: 'queue.join', mode: 'casual' });
    await played([anne]);
    expect(last(anne.socket, 'game.over').result).toMatchObject({ rating: null, forfeited: [] });
    expect((await anne.me()).rating).toBeNull();
    expect((await anne.me()).stats.games).toBe(1);
    expect((await anne.call('GET', '/ladder')).body).toMatchObject({ entries: [] });
    // A seat says the tier its account has at the deal, at any table: this one has none, and a bot never has.
    expect(last(anne.socket, 'game.start').seats.map((s) => s.tier)).toEqual([null, null, null, null]);
  });
});

describe('leaving a ranked game', () => {
  it('is a forfeit: the seat is last, the cooldown starts at once, and the others get a normal result', async () => {
    const players = await rankedTable(),
      [anne, ...others] = players;
    await vi.advanceTimersByTimeAsync(1000);
    const leftAt = Date.now();
    expect(await ask(anne.socket, { t: 'game.leave' })).toMatchObject({ t: 'ok' });
    // The table is down for the leaver at once, and the cooldown is on `Me`: 15 minutes the first time.
    expect(await anne.me()).toMatchObject({ active: null, cooldownUntil: leftAt + 15 * MINUTE_MS });
    expect(last(await anne.connect(), 'welcome')).toMatchObject({ game: null, queue: null });
    // The table plays the seat to the end, and the leaver hears the result when the game is over.
    const back = await anne.connect();
    await played(others);
    const theirs = last(others[0].socket, 'game.over').result;
    expect(theirs.forfeited).toEqual([0]);
    expect(theirs.places[0]).toBe(4);
    // The three who stayed are placed among themselves, from first.
    expect(Math.min(...theirs.places.slice(1))).toBe(1);
    expect(theirs.places.slice(1).every((place) => place >= 1 && place <= 3)).toBe(true);
    const mine = last(back, 'game.over').result;
    expect(mine.forfeited).toEqual([0]);
    if (!mine.rating) throw new Error('The leaver has a rating change too');
    expect(mine.rating.before).toEqual(UNRATED);
    expectShape(mine.rating.after, 1);
    expect(mine.rating.delta).toBe(mine.rating.after.value);
    expect(mine.rating.delta).toBeLessThan(0);
    expect((await anne.me()).rating).toEqual(mine.rating.after);
    // The leave is in the rating's `games`. No ranked game is in anybody's `Stats`.
    expect((await anne.me()).stats.games).toBe(0);
    expect((await others[0].me()).stats.games).toBe(0);
  });

  it('places two leavers both last', async () => {
    const players = await rankedTable();
    await ask(players[2].socket, { t: 'game.leave' });
    await ask(players[0].socket, { t: 'game.leave' });
    await played([players[1], players[3]]);
    const { result } = last(players[1].socket, 'game.over');
    // In the order they left, and each with the place that is the number of seats.
    expect(result.forfeited).toEqual([2, 0]);
    expect([result.places[0], result.places[2]]).toEqual([4, 4]);
    expect([result.places[1], result.places[3]].toSorted((a, b) => a - b)[0]).toBe(1);
  });

  it('keeps the seat a leaver gave up out: no bot sits down in it', async () => {
    const players = await rankedTable();
    await ask(players[0].socket, { t: 'game.leave' });
    expect(last(players[1].socket, 'game.update')).toMatchObject({
      events: [{ type: 'seatStatus', seat: 0, status: 'out' }],
      table: { status: ['out', 'online', 'online', 'online'] },
    });
  });

  it('cancels the game when the last of the four resigns: the cooldown starts for them too, and no rating moves', async () => {
    const players = await rankedTable();
    for (const p of players.slice(0, 3)) await ask(p.socket, { t: 'game.leave' });
    const marks = players.map((p) => p.socket.frames.length),
      leftAt = Date.now();
    expect(await ask(players[3].socket, { t: 'game.leave' })).toMatchObject({ t: 'ok' });
    await vi.advanceTimersByTimeAsync(10 * MINUTE_MS);
    // The last one is sent `ok` and the update that says out. Nobody is sent anything else: the
    // game was not played out, so it has no result.
    expect(players.map((p, i) => p.socket.frames.slice(marks[i]).map((f) => f.t))).toEqual([
      [],
      [],
      [],
      ['ok', 'game.update'],
    ]);
    expect(last(players[3].socket, 'game.update')).toMatchObject({
      events: [{ type: 'seatStatus', seat: 3, status: 'out' }],
      table: { status: ['out', 'out', 'out', 'out'] },
    });
    for (const p of players) {
      const me = await p.me();
      // Every resign closed ranked for its player. A game that was cancelled was not scored.
      expect(me.cooldownUntil).not.toBeNull();
      expect(me).toMatchObject({ active: null, rating: null, stats: { games: 0 } });
      expect((await p.call('GET', '/me/games')).body).toEqual({ games: [] });
    }
    expect((await players[3].me()).cooldownUntil).toBe(leftAt + 15 * MINUTE_MS);
  });

  it('is a forfeit too when the seat is closed for two missed turns: last place, and the cooldown from the kick', async () => {
    const players = await rankedTable(),
      [anne, ...others] = players,
      watcher = others[0].socket;
    const kick = (): GameUpdate | undefined =>
      framesOf(watcher, 'game.update').find((u) => u.events.some((e) => e.type === 'seatStatus' && e.status === 'out'));
    anne.socket.close();
    await until(() => kick() != null, 'the kick');
    const kickedAt = Date.now();
    expect(kick()?.table.status[0]).toBe('out');
    // The cooldown is that of a leave, and it runs from the kick, not from the end of the game.
    const me = await anne.me();
    expect(me.active).toBeNull();
    const since = (me.cooldownUntil ?? 0) - 15 * MINUTE_MS;
    expect(kickedAt - since).toBeGreaterThanOrEqual(0);
    expect(kickedAt - since).toBeLessThanOrEqual(50);

    const back = await anne.connect();
    expect(back.frames.map((f) => f.t)).toEqual(['ok', 'welcome', 'seat.lost']);
    expect(last(back, 'welcome')).toMatchObject({ game: null, me: { cooldownUntil: me.cooldownUntil } });
    expect(last(back, 'seat.lost')).toMatchObject({ mode: 'ranked', reason: 'inactivity' });

    await played(others);
    const theirs = last(watcher, 'game.over').result;
    expect(theirs.forfeited).toEqual([0]);
    expect(theirs.places[0]).toBe(4);
    const mine = last(back, 'game.over');
    expect(mine).toMatchObject({ seat: 0, result: { forfeited: [0] } });
    if (!mine.result.rating) throw new Error('The kicked player has a rating change too');
    expect(mine.result.rating.delta).toBeLessThan(0);
  });

  it('lists those who left before those whose seat was closed', async () => {
    const players = await rankedTable();
    players[1].socket.close();
    await until(() => last(players[0].socket, 'game.update').table.status[1] === 'out', 'the kick');
    await ask(players[3].socket, { t: 'game.leave' });
    await played([players[0], players[2]]);
    const { result } = last(players[0].socket, 'game.over');
    expect(result.forfeited).toEqual([3, 1]);
    expect([result.places[1], result.places[3]]).toEqual([4, 4]);
  });

  it('closes ranked for longer with every leave: 15 minutes, doubled each time, and a day at most', async () => {
    const anne = await player('anne'),
      minutes: number[] = [];
    for (let leave = 1; leave <= 9; leave++) {
      const others = [await player(`b${leave}`), await player(`c${leave}`), await player(`d${leave}`)];
      await queueUp([anne, ...others]);
      const leftAt = Date.now();
      expect(await ask(anne.socket, { t: 'game.leave' })).toMatchObject({ t: 'ok' });
      const until = (await anne.me()).cooldownUntil;
      if (until == null) throw new Error('A ranked leave starts a cooldown');
      minutes.push((until - leftAt) / MINUTE_MS);
      // Closed until the last millisecond, and open at that time: a time that is not ahead is null.
      await vi.advanceTimersByTimeAsync(until - Date.now() - 1);
      expect(await ask(anne.socket, { t: 'queue.join', mode: 'ranked' })).toMatchObject({ code: 'QUEUE_COOLDOWN' });
      await vi.advanceTimersByTimeAsync(1);
      expect((await anne.me()).cooldownUntil).toBeNull();
    }
    expect(minutes).toEqual([15, 30, 60, 120, 240, 480, 960, 1440, 1440]);
  });

  it('answers a join during the cooldown with QUEUE_COOLDOWN and no time, before ALREADY_SEATED, and leaves casual open', async () => {
    const [anne] = await rankedTable();
    await ask(anne.socket, { t: 'game.leave' });
    const refused = await ask(anne.socket, { t: 'queue.join', mode: 'ranked' });
    expect(refused).toMatchObject({ t: 'err', code: 'QUEUE_COOLDOWN', message: 'You cannot queue yet.' });
    expect((await anne.me()).active).toBeNull();
    // The cooldown is the ranked queue's: casual and lobbies are open.
    expect(await ask(anne.socket, { t: 'queue.join', mode: 'casual' })).toMatchObject({ t: 'ok' });
    // Seated in the casual queue, ranked still answers the cooldown first.
    expect(await ask(anne.socket, { t: 'queue.join', mode: 'ranked' })).toMatchObject({ code: 'QUEUE_COOLDOWN' });
    await ask(anne.socket, { t: 'queue.leave' });
    expect(await ask(anne.socket, { t: 'lobby.create', visibility: 'private', settings: STANDARD })).toMatchObject({
      t: 'ok',
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
    await played([calico]);
    expect(last(calico.socket, 'game.over').result).toMatchObject({ forfeited: [], rating: null });
  });
});

describe('the season', () => {
  const seasonOn = async (at: number): Promise<unknown> =>
    ((await new MockServer({ now: () => at }).browser().rest('GET', '/config')).body as { season: unknown }).season;

  it('is the UTC calendar quarter, counted from 2026 Q1, and ends where the next one starts', async () => {
    expect(await seasonOn(Date.UTC(2026, 0, 1))).toEqual({
      id: 1,
      name: '2026 Q1',
      startsAt: Date.UTC(2026, 0, 1),
      endsAt: Date.UTC(2026, 3, 1),
    });
    expect(await seasonOn(Date.UTC(2026, 3, 1) - 1)).toMatchObject({ id: 1, name: '2026 Q1' });
    expect(await seasonOn(Date.UTC(2026, 3, 1))).toMatchObject({ id: 2, name: '2026 Q2' });
    expect(await seasonOn(T0)).toEqual(Q4);
    expect(await seasonOn(Date.UTC(2027, 0, 1))).toMatchObject({ id: 5, name: '2027 Q1', startsAt: Q4.endsAt });
  });
});

describe('the ladder', () => {
  const ladder = async (who: Player, query = ''): Promise<LadderPage> =>
    (await who.call('GET', `/ladder${query}`)).body as LadderPage;
  const bytes = (a: string, b: string): number => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));

  it('needs no session, makes none, and is an empty list with the current season before anyone has played', async () => {
    const visitor = server.browser();
    expect(await visitor.rest('GET', '/ladder')).toEqual({ status: 200, body: { season: Q4, entries: [] } });
    expect(await visitor.rest('GET', '/me')).toEqual({ status: 401, body: error('UNAUTHENTICATED') });
    const guest = await player();
    expect(await ladder(guest)).toEqual({ season: Q4, entries: [] });
    expect((await guest.call('GET', '/config')).body).toMatchObject({ season: Q4 });
  });

  it('lists everyone with a ranked game as public players, best first and ties by the bytes of the name', async () => {
    // Two tables, so that two accounts end on every value; names whose byte order is not the alphabet's.
    const one = await rankedTable(['anne', 'Zed', 'Émile', 'kidd']),
      two = await rankedTable(['Anne', 'zed', 'emile', 'Kidd']);
    await played([...one, ...two]);
    const page = await ladder(await player());
    expect(page.season).toEqual(Q4);
    expect(page.next).toBeUndefined();
    expect(page.entries.map((e) => e.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const [i, entry] of page.entries.entries()) {
      expect(Object.keys(entry).toSorted()).toEqual(['rank', 'rating', 'user']);
      expect(Object.keys(entry.user).toSorted()).toEqual(['color', 'id', 'name', 'tier']);
      expectShape(entry.rating, 1);
      // A provisional account is listed, with the tier its rating has.
      expect(entry.user.tier).toBe(entry.rating.tier);
      const next = page.entries[i + 1];
      if (!next) continue;
      expect(entry.rating.value).toBeGreaterThanOrEqual(next.rating.value);
      if (entry.rating.value === next.rating.value) expect(bytes(entry.user.name, next.user.name)).toBeLessThan(0);
    }
    // There were ties to break, and upper case came before lower case in one of them.
    const tied = page.entries.filter((e, i) => e.rating.value === page.entries[i + 1]?.rating.value);
    expect(tied.length).toBeGreaterThan(0);
    // No login name is on the wire, and nothing else of the account.
    expect(JSON.stringify(page)).not.toMatch(/login_|username|guest|cooldown|stats/);
  });

  it('pages by the user id of the last row, and keeps counting the ranks', async () => {
    const players = await rankedTable();
    await played(players);
    const viewer = players[0],
      all = await ladder(viewer);
    const first = await ladder(viewer, '?limit=2');
    expect(first.entries).toEqual(all.entries.slice(0, 2));
    expect(first.next).toBe(all.entries[1].user.id);
    const second = await ladder(viewer, `?limit=2&after=${first.next}`);
    expect(second.entries).toEqual(all.entries.slice(2));
    expect(second.entries.map((e) => e.rank)).toEqual([3, 4]);
    // The last page names no next one: the field is absent, not null.
    expect('next' in second).toBe(false);
    expect((await ladder(viewer, '?limit=3')).next).toBe(all.entries[2].user.id);
    expect((await ladder(viewer, `?season=${Q4.id}`)).entries).toEqual(all.entries);
    // Any season but the current one cannot be asked for.
    for (const season of ['3', '5', 'x', ''])
      expect(await viewer.call('GET', `/ladder?season=${season}`)).toEqual({ status: 404, body: error('NOT_FOUND') });
    // A limit out of range, and a cursor that is not a row of this ladder.
    const stranger = (await (await player()).me()).user.id;
    for (const query of [
      '?limit=0',
      '?limit=101',
      '?limit=x',
      '?limit=2.5',
      '?after=',
      '?after=2',
      `?after=${stranger}`,
    ])
      expect(await viewer.call('GET', `/ladder${query}`)).toEqual({ status: 400, body: error('VALIDATION') });
  });
});

describe('a ranked table and a mock that is made anew', () => {
  /** What a page keeps for the mock between two loads. */
  function memory(): MockStore {
    let data: string | null = null;
    return {
      load: () => data,
      save: (next) => {
        data = next;
      },
    };
  }
  const make = (store: MockStore): MockServer =>
    new MockServer({
      random: seeded(5),
      timers: FAST,
      bot: { minMs: 40, maxMs: 80 },
      queueFillMs: QUEUE_FILL_MS,
      store,
    });
  /** The account of one named page: registered the first time it is asked for, the same one after that. */
  async function paged(name: string): Promise<Player> {
    const b = server.page(`page-${name}`);
    const me = async (): Promise<Me> => (await b.rest('GET', '/me')).body as Me;
    if ((await me()).guest) {
      await b.rest('PATCH', '/me', { name });
      expect((await b.rest('POST', '/auth/register', { username: `paged_${name}`, password: 'x' })).status).toBe(200);
    }
    const connect = async (): Promise<RawClient> => {
      const client = await connectRaw(b.transport);
      await flush();
      return client;
    };
    return { call: (method, path, body) => b.rest(method, path, body), me, connect, socket: await connect() };
  }
  const everyone = async (): Promise<Player[]> => {
    const players: Player[] = [];
    for (const name of NAMES) players.push(await paged(name));
    return players;
  };

  it('finds the table with the tiers it was dealt with, and still counts a leave from before', async () => {
    const store = memory();
    server = make(store);
    const before = await everyone();
    // A first game, so that every seat has a tier to be announced with in the second.
    await queueUp(before);
    await played(before);
    await queueUp(before);
    const start = last(before[0].socket, 'game.start'),
      tiers = start.seats.map((seat) => seat.tier);
    expect(tiers.every((tier) => tier != null)).toBe(true);
    const leftAt = Date.now();
    expect(await ask(before[1].socket, { t: 'game.leave' })).toMatchObject({ t: 'ok' });

    // The page is gone, and the server with it. The next one reads what was written down.
    server.shutDown();
    server = make(store);
    await flush();
    const after = await everyone(),
      [anne, calico] = after;
    const back = last(anne.socket, 'welcome').game?.start;
    expect(back).toMatchObject({ gameId: start.gameId, mode: 'ranked' });
    expect(back?.seats.map((seat) => seat.tier)).toEqual(tiers);
    expect((await calico.me()).cooldownUntil).toBe(leftAt + 15 * MINUTE_MS);

    // The game ends by its deadlines. Once ranked is open again, a second leave closes it for twice as long.
    await vi.advanceTimersByTimeAsync(15 * MINUTE_MS);
    expect((await calico.me()).cooldownUntil).toBeNull();
    await queueUp(after);
    const leftAgain = Date.now();
    expect(await ask(calico.socket, { t: 'game.leave' })).toMatchObject({ t: 'ok' });
    expect((await calico.me()).cooldownUntil).toBe(leftAgain + 30 * MINUTE_MS);
  });
});
