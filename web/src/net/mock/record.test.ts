/* The mock's record (docs/protocol.md §4): the five lines of `Stats.byMode`, and the list of
   finished games on `GET /me/games`. The server it stands for has not built these yet; the mock
   does what the contract says, so the profile has something to show. Every game here is played by
   the deadlines: nobody bids or plays a card. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { FinishedGame, GamePage, Me, ModeLine, Profile } from '../../protocol/generated';
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
/** Five rounds of five cards: the shortest game there is. */
const SWIFT = { ...STANDARD, maxPlayers: 2, format: 'swift' } as const;
const T0 = Date.UTC(2026, 9, 11, 12);
const NO_LINE: ModeLine = { games: 0, wins: 0, bidsMade: 0, bidsTotal: 0, bestScore: null };

let server: MockServer;
const flush = (): Promise<void> => vi.advanceTimersByTimeAsync(0).then(() => {});

interface Player {
  call(method: RestMethod, path: string): Promise<RestResponse>;
  me(): Promise<Me>;
  games(query?: string): Promise<GamePage>;
  socket: RawClient;
}
let logins = 0;
/** A browser with a session and a socket: a guest, or an account when it is given a name. */
async function player(name?: string): Promise<Player> {
  const b = server.browser();
  await b.rest('POST', '/auth/guest');
  if (name) {
    await b.rest('PATCH', '/me', { name });
    await b.rest('POST', '/auth/register', { username: `login_${++logins}`, password: 'x' });
  }
  const socket = await connectRaw(b.transport);
  await flush();
  return {
    call: (method, path) => b.rest(method, path),
    me: async () => (await b.rest('GET', '/me')).body as Me,
    games: async (query = '') => (await b.rest('GET', `/me/games${query}`)).body as GamePage,
    socket,
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
/** Let the deadlines play until every one of `players` has been told of `games` results. */
async function played(players: Player[], games: number): Promise<void> {
  for (let i = 0; i < 8000; i++) {
    if (players.every((p) => framesOf(p.socket, 'game.over').length >= games)) return;
    await vi.advanceTimersByTimeAsync(50);
  }
  throw new Error('The game never ended');
}
/** Two players at a table of their own, private or public, with the game not yet started. */
async function table(visibility: 'private' | 'public', host: Player, guest: Player): Promise<void> {
  const made = await ask(host.socket, { t: 'lobby.create', visibility, settings: SWIFT });
  if (made.t !== 'ok' || !made.lobby) throw new Error('No lobby');
  await ask(guest.socket, { t: 'lobby.join', code: made.lobby.code });
}
/** One more game at the table the two sit at. `done` is how many they have finished by then. */
async function game(host: Player, guest: Player, done: number): Promise<void> {
  await ask(host.socket, { t: 'lobby.ready', ready: true });
  await ask(guest.socket, { t: 'lobby.ready', ready: true });
  expect(await ask(host.socket, { t: 'lobby.start' })).toMatchObject({ t: 'ok' });
  await played([host, guest], done);
  // The clock moves on between two games, so no two rows end in the same millisecond.
  await vi.advanceTimersByTimeAsync(1000);
}
/** The caller's own seat line of a stored game. */
const mine = (game: FinishedGame, me: Me): FinishedGame['seats'][number] => {
  const seat = game.seats.find((s) => s.userId === me.user.id);
  if (!seat) throw new Error('The caller is not on their own game');
  return seat;
};

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

describe('the five lines', () => {
  it('are there from the start, all empty, on the own profile and on the public one', async () => {
    const anne = await player('anne');
    const me = await anne.me();
    expect(me.stats).toEqual({
      ...NO_LINE,
      byMode: { solo: NO_LINE, friends: NO_LINE, public: NO_LINE, casual: NO_LINE, ranked: NO_LINE },
    });
    const other = await player();
    const profile = (await other.call('GET', `/users/${me.user.id}`)).body as Profile;
    expect(profile.stats).toEqual(me.stats);
    // Another player is the public player, the lines and the rating: no username, no session data.
    expect(Object.keys(profile).toSorted((a, b) => a.localeCompare(b))).toEqual(['rating', 'stats', 'user']);
    expect(JSON.stringify(profile)).not.toContain('login_');
  });

  it('count a game on the line of its table and in the headline, for each of the four that are not ranked', async () => {
    const anne = await player('anne'),
      mary = await player('mary');
    // A table of friends, then a public one.
    await table('private', anne, mary);
    await game(anne, mary, 1);
    await ask(anne.socket, { t: 'lobby.leave' });
    await ask(mary.socket, { t: 'lobby.leave' });
    await table('public', anne, mary);
    await game(anne, mary, 2);
    await ask(anne.socket, { t: 'lobby.leave' });
    await ask(mary.socket, { t: 'lobby.leave' });
    // Quick play: the queue fills the table with bots.
    await ask(anne.socket, { t: 'queue.join', mode: 'casual' });
    await vi.advanceTimersByTimeAsync(QUEUE_FILL_MS);
    await played([anne], 3);

    const { stats } = await anne.me(),
      lines = stats.byMode;
    if (!lines) throw new Error('No lines');
    expect([lines.solo.games, lines.friends.games, lines.public.games, lines.casual.games, lines.ranked.games]).toEqual(
      [0, 1, 1, 1, 0],
    );
    // The headline is the three together: the same games, wins and bids, and the best of the bests.
    const played3 = [lines.friends, lines.public, lines.casual];
    const sum = (pick: (line: ModeLine) => number): number => played3.reduce((n, line) => n + pick(line), 0);
    expect(stats.games).toBe(3);
    expect(stats.wins).toBe(sum((l) => l.wins));
    expect(stats.bidsMade).toBe(sum((l) => l.bidsMade));
    expect(stats.bidsTotal).toBe(sum((l) => l.bidsTotal));
    expect(stats.bidsTotal).toBe(5 + 5 + 10);
    expect(stats.bestScore).toBe(Math.max(...played3.map((l) => l.bestScore ?? -Infinity)));
    // The same lines are on the public profile.
    const seen = (await mary.call('GET', `/users/${(await anne.me()).user.id}`)).body as Profile;
    expect(seen.stats.byMode).toEqual(lines);
  });

  it('keep a ranked game on the ranked line and out of the headline', async () => {
    const four: Player[] = [];
    for (const name of ['anne', 'calico', 'mary', 'kidd']) four.push(await player(name));
    for (const p of four) await ask(p.socket, { t: 'queue.join', mode: 'ranked' });
    await played(four, 1);
    for (const p of four) {
      const me = await p.me();
      expect(me.stats.byMode?.ranked.games).toBe(1);
      expect(me.stats.byMode?.ranked.bidsTotal).toBe(10);
      expect(me.stats.byMode?.ranked.bestScore).not.toBeNull();
      expect(me.stats).toMatchObject(NO_LINE);
      expect(me.rating?.games).toBe(1);
      // The game is in the list all the same, with its season.
      const { games } = await p.games();
      expect(games).toHaveLength(1);
      expect(games[0]).toMatchObject({ table: 'ranked', seasonId: expect.any(Number), settings: STANDARD });
      expect(mine(games[0], me).score).toBe(me.stats.byMode?.ranked.bestScore);
    }
  });
});

describe('GET /me/games', () => {
  it('needs a session, and lists nothing before the first finished game', async () => {
    expect((await server.browser().rest('GET', '/me/games')).status).toBe(401);
    const anne = await player('anne');
    expect(await anne.games()).toEqual({ games: [] });
  });

  it('is one row per finished game, newest first, with the table, the times and a line for every seat', async () => {
    const anne = await player('anne'),
      mary = await player('mary');
    await table('private', anne, mary);
    const started = Date.now();
    await game(anne, mary, 1);
    await game(anne, mary, 2);
    const me = await anne.me(),
      { games } = await anne.games();
    expect(games).toHaveLength(2);
    expect(games[0].endedAt).toBeGreaterThan(games[1].endedAt);
    expect(games[1]).toMatchObject({ table: 'friends', settings: SWIFT, startedAt: started });
    expect(games[1].endedAt).toBeGreaterThan(games[1].startedAt);
    // A table that is not ranked has no season.
    expect('seasonId' in games[1]).toBe(false);
    // Both seats, in seat order, each with its own place and score. Nobody at this table is a bot.
    const other = await mary.me();
    expect(games[1].seats.map((s) => s.userId)).toEqual([me.user.id, other.user.id]);
    expect(games[1].seats.map((s) => s.bot)).toEqual([false, false]);
    expect(games[1].seats.map((s) => s.forfeited)).toEqual([false, false]);
    expect(games[1].seats.map((s) => s.place).toSorted((a, b) => a - b)[0]).toBe(1);
    // The other player has the same two rows.
    expect((await mary.games()).games).toEqual(games);
    // The game's id is the one the table was told, and its record can be asked for with it.
    expect(games[0].id).toBe(last(anne.socket, 'game.over').gameId);
  });

  it('pages with `limit` and `after`, and leaves `next` out on the last page', async () => {
    const anne = await player('anne'),
      mary = await player('mary');
    await table('private', anne, mary);
    for (let n = 1; n <= 5; n++) await game(anne, mary, n);
    const all = (await anne.games()).games;
    expect(all).toHaveLength(5);
    expect('next' in (await anne.games())).toBe(false);

    const first = await anne.games('?limit=2');
    expect(first.games).toEqual(all.slice(0, 2));
    expect(first.next).toBe(all[1].id);
    const second = await anne.games(`?limit=2&after=${first.next}`);
    expect(second.games).toEqual(all.slice(2, 4));
    expect(second.next).toBe(all[3].id);
    const third = await anne.games(`?limit=2&after=${second.next}`);
    expect(third).toEqual({ games: all.slice(4) });
    // A page that ends on the last row has no next either.
    expect(await anne.games('?limit=5')).toEqual({ games: all });

    // A limit that is not 1 to 100, and a cursor that is not one of this player's games, are refused.
    for (const query of ['?limit=0', '?limit=101', '?limit=two', '?after=nobody', '?after='])
      expect((await anne.call('GET', `/me/games${query}`)).status).toBe(400);
    const stranger = await player('kidd');
    expect((await stranger.call('GET', `/me/games?after=${all[0].id}`)).status).toBe(400);
  });

  it('keeps the list and the lines through a reload of the page that holds the mock', async () => {
    let kept: string | null = null;
    const store: MockStore = { load: () => kept, save: (data) => void (kept = data) };
    server = new MockServer({ random: seeded(5), timers: FAST, bot: { minMs: 40, maxMs: 80 }, store });
    const anne = await player('anne'),
      mary = await player('mary');
    await table('private', anne, mary);
    await game(anne, mary, 1);
    const before = await anne.me(),
      games = (await anne.games()).games;
    await flush();

    const again = new MockServer({ random: seeded(6), timers: FAST, bot: { minMs: 40, maxMs: 80 }, store });
    const b = again.browser();
    expect((await b.rest('POST', '/auth/login', { username: before.username, password: 'x' })).status).toBe(200);
    expect(((await b.rest('GET', '/me')).body as Me).stats).toEqual(before.stats);
    expect(((await b.rest('GET', '/me/games')).body as GamePage).games).toEqual(games);
  });
});
