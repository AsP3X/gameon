/* The mock server's accounts, public lobby list and casual queue, looked at from bare connections
   and bare REST calls: the status and the body of every answer, who is told what, and in which
   order. This is what the web client is built against until the real server has these routes
   (docs/protocol.md §3, §4, §5.3 and §5.4), so the same checks are what that server has to pass. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { GameSettings, LobbyList, Me, Profile } from '../../protocol/generated';
import type { Backend, RestMethod, RestResponse } from '../api';
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

const SETTINGS: GameSettings = { ...STANDARD, maxPlayers: 3, format: 'swift' };
/** Short clocks: a deadline plays for a human who does nothing, so a whole game runs by itself. */
const FAST = { bidMs: 400, playMs: 300, abilityMs: 300, trickEndMs: 100, roundEndMs: 200 };
const QUEUE_FILL_MS = 5000;
const ANNE = { username: 'Anne_Bonny', password: 'three sheets' };

let server: MockServer;
const flush = (): Promise<void> => vi.advanceTimersByTimeAsync(0).then(() => {});

/** One browser profile: its REST calls and its socket share a session. */
interface Browser extends Backend {
  call(method: RestMethod, path: string, body?: unknown): Promise<RestResponse>;
  me(): Promise<Me>;
  connect(): Promise<RawClient>;
}
function browser(): Browser {
  const b = server.browser();
  return {
    ...b,
    call: (method, path, body) => b.rest(method, path, body),
    me: async () => (await b.rest('GET', '/me')).body as Me,
    async connect() {
      const client = await connectRaw(b.transport);
      await flush();
      return client;
    },
  };
}
/** A browser that already is a guest. */
async function guest(): Promise<Browser> {
  const b = browser();
  expect((await b.call('POST', '/auth/guest')).status).toBe(200);
  return b;
}
/** A browser signed in to a new account with that login. */
async function account(credentials = ANNE): Promise<Browser> {
  const b = await guest();
  expect((await b.call('POST', '/auth/register', credentials)).status).toBe(200);
  return b;
}
const error = (code: string): unknown => ({ error: { code, message: expect.any(String) } });
const last = <T extends ServerMessage['t']>(client: RawClient, t: T): Extract<ServerMessage, { t: T }> => {
  const found = framesOf(client, t).at(-1);
  if (!found) throw new Error(`No ${t} frame yet`);
  return found;
};
/** The frame that answers `id`. */
function reply(client: RawClient, id: number): ServerMessage {
  const found = client.frames.find((f) => (f.t === 'ok' || f.t === 'err') && f.re === id);
  if (!found) throw new Error(`No reply to ${id}`);
  return found;
}
/** Send one message and return its answer. */
async function ask(client: RawClient, message: Parameters<RawClient['send']>[0]): Promise<ServerMessage> {
  const id = client.send(message);
  await flush();
  return reply(client, id);
}
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

describe('the session', () => {
  it('has none until the browser asks to be a guest, and then keeps that guest', async () => {
    const b = browser();
    expect(await b.call('GET', '/me')).toEqual({ status: 401, body: error('UNAUTHENTICATED') });
    const first = await b.call('POST', '/auth/guest');
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ guest: true, username: null, active: null, rating: null });
    // With a valid session the same call returns that user: it never makes a second guest.
    expect((await b.call('POST', '/auth/guest')).body).toEqual(first.body);
    expect(await b.me()).toEqual(first.body);
  });

  it('answers an unknown path NOT_FOUND and a known path with the wrong method VALIDATION', async () => {
    const b = await guest();
    expect(await b.call('GET', '/treasure')).toEqual({ status: 404, body: error('NOT_FOUND') });
    expect(await b.call('GET', '/auth/guest')).toEqual({ status: 400, body: error('VALIDATION') });
    expect(await b.call('GET', '/health')).toEqual({ status: 200, body: { ok: true } });
    expect((await b.call('GET', '/config')).body).toMatchObject({ protocol: 1, standard: STANDARD, emotes: [] });
    // The deal quick play and ranked are played with: the classic one, ten rounds of 1 to 10 cards.
    expect((await b.call('GET', '/config')).body).toMatchObject({ standard: { format: 'classic', maxPlayers: 4 } });
  });
});

describe('registering', () => {
  it('upgrades the guest in place: the same user id, name, colour and stats, now with a username', async () => {
    const b = await guest(),
      before = await b.me();
    const socket = await b.connect();
    const res = await b.call('POST', '/auth/register', ANNE);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...before, guest: false, username: 'Anne_Bonny' });
    expect((res.body as Me).user.id).toBe(before.user.id);
    // The cookie is still the session: the socket stays up, and the next one is welcomed as the account.
    expect(socket.closed).toBeNull();
    expect(last(await b.connect(), 'welcome').me).toMatchObject({ guest: false, username: 'Anne_Bonny' });
  });

  it('refuses a second registration of the same session: ALREADY_REGISTERED', async () => {
    const b = await account();
    const res = await b.call('POST', '/auth/register', { username: 'someone_else', password: 'x' });
    expect(res).toEqual({ status: 409, body: error('ALREADY_REGISTERED') });
    expect((await b.me()).username).toBe('Anne_Bonny');
  });

  it('refuses a taken username whatever its case, and changes nothing', async () => {
    await account();
    const b = await guest(),
      before = await b.me();
    for (const username of ['Anne_Bonny', 'anne_bonny', 'ANNE_BONNY'])
      expect(await b.call('POST', '/auth/register', { username, password: 'x' })).toEqual({
        status: 409,
        body: error('USERNAME_TAKEN'),
      });
    expect(await b.me()).toEqual(before);
  });

  it('refuses a username of the wrong shape, an empty password, and a body that is not credentials', async () => {
    const b = await guest();
    for (const username of ['ab', 'seventeen_letters', 'with space', 'tilde~', 'ünïcode', ''])
      expect(await b.call('POST', '/auth/register', { username, password: 'x' })).toEqual({
        status: 400,
        body: error('USERNAME_INVALID'),
      });
    expect(await b.call('POST', '/auth/register', { username: 'calico', password: '' })).toEqual({
      status: 400,
      body: error('WEAK_PASSWORD'),
    });
    for (const body of [undefined, {}, { username: 'calico' }, { username: 7, password: 'x' }])
      expect(await b.call('POST', '/auth/register', body)).toEqual({ status: 400, body: error('VALIDATION') });
    expect((await b.me()).guest).toBe(true);
    // The shortest and the longest username there is.
    expect((await b.call('POST', '/auth/register', { username: 'a_1', password: 'x' })).status).toBe(200);
    const other = await guest();
    expect((await other.call('POST', '/auth/register', { username: 'sixteen_letters_', password: 'x' })).status).toBe(
      200,
    );
  });

  it('needs a session', async () => {
    expect(await browser().call('POST', '/auth/register', ANNE)).toEqual({
      status: 401,
      body: error('UNAUTHENTICATED'),
    });
  });
});

describe('logging in and out', () => {
  it('refuses a wrong password and an unknown username alike, and leaves the session as it was', async () => {
    await account();
    const b = await guest(),
      before = await b.me();
    const socket = await b.connect();
    for (const credentials of [
      { username: 'Anne_Bonny', password: 'wrong' },
      { username: 'nobody', password: 'three sheets' },
      { username: 'Anne_Bonny', password: '' },
    ])
      expect(await b.call('POST', '/auth/login', credentials)).toEqual({
        status: 401,
        body: error('INVALID_CREDENTIALS'),
      });
    expect(await b.call('POST', '/auth/login', { username: 'Anne_Bonny' })).toEqual({
      status: 400,
      body: error('VALIDATION'),
    });
    expect(await b.me()).toEqual(before);
    await flush();
    expect(socket.closed).toBeNull();
  });

  it('replaces the session with the account, from any browser and whatever the case of the username', async () => {
    const home = await account(),
      anne = await home.me();
    const b = await guest(),
      wasGuest = await b.me();
    const socket = await b.connect();
    const res = await b.call('POST', '/auth/login', { username: 'ANNE_bonny', password: 'three sheets' });
    expect(res).toEqual({ status: 200, body: anne });
    expect(await b.me()).toEqual(anne);
    // The guest this browser was is logged out of it: that session's socket is closed.
    await flush();
    expect(socket.closed).toBe(1008);
    expect(last(await b.connect(), 'welcome').me.user.id).toBe(anne.user.id);
    expect(anne.user.id).not.toBe(wasGuest.user.id);
    // Login is public: a browser with no session at all can do it.
    expect((await browser().call('POST', '/auth/login', ANNE)).status).toBe(200);
  });

  it('logs out with 204: the cookie is gone, the socket is closed, and the next socket is a new guest', async () => {
    const b = await account(),
      anne = await b.me();
    const socket = await b.connect();
    expect(await b.call('POST', '/auth/logout')).toEqual({ status: 204, body: null });
    await flush();
    expect(socket.closed).toBe(1008);
    expect(await b.call('GET', '/me')).toEqual({ status: 401, body: error('UNAUTHENTICATED') });
    expect(await b.call('POST', '/auth/logout')).toEqual({ status: 401, body: error('UNAUTHENTICATED') });
    const next = last(await b.connect(), 'welcome').me;
    expect(next).toMatchObject({ guest: true, username: null });
    expect(next.user.id).not.toBe(anne.user.id);
    // The account is still there to come back to.
    expect((await b.call('POST', '/auth/login', ANNE)).body).toEqual(anne);
  });

  it('takes a player who logs out from their open lobby and from the queue', async () => {
    const host = await guest(),
      hostSocket = await host.connect();
    const lobby = (await ask(hostSocket, { t: 'lobby.create', visibility: 'private', settings: SETTINGS })) as {
      lobby?: { code: string };
    };
    const b = await account(),
      socket = await b.connect();
    await ask(socket, { t: 'lobby.join', code: lobby.lobby?.code });
    expect(last(hostSocket, 'lobby.state').lobby.members).toHaveLength(2);
    await b.call('POST', '/auth/logout');
    await flush();
    expect(last(hostSocket, 'lobby.state').lobby.members).toHaveLength(1);

    const waiting = await guest(),
      waitingSocket = await waiting.connect();
    await ask(waitingSocket, { t: 'queue.join', mode: 'casual' });
    const c = await guest(),
      queued = await c.connect();
    await ask(queued, { t: 'queue.join', mode: 'casual' });
    expect(last(waitingSocket, 'queue.status').queue.found).toBe(2);
    await c.call('POST', '/auth/logout');
    await flush();
    expect(last(waitingSocket, 'queue.status').queue.found).toBe(1);
  });
});

describe('the profile', () => {
  it('changes what the patch names and leaves the rest: the name is trimmed', async () => {
    const b = await guest(),
      before = await b.me();
    const named = await b.call('PATCH', '/me', { name: '  Calico Jack ' });
    expect(named).toEqual({ status: 200, body: { ...before, user: { ...before.user, name: 'Calico Jack' } } });
    const coloured = await b.call('PATCH', '/me', { color: '#ff5fbf' });
    expect((coloured.body as Me).user).toEqual({ ...before.user, name: 'Calico Jack', color: '#ff5fbf' });
    // An empty patch is fine and changes nothing; a field the server does not know is ignored.
    expect((await b.call('PATCH', '/me', { motto: 'Yo ho' })).body).toEqual(coloured.body);
    expect(await b.me()).toEqual(coloured.body);
  });

  it('refuses a colour outside the eight and a name that is not 1 to 16 visible characters, whole', async () => {
    const b = await guest(),
      before = await b.me();
    const bad: unknown[] = [
      { color: '#000000' },
      { color: '#1CB0F6' },
      { color: 'red' },
      { color: null },
      { name: '' },
      { name: '   ' },
      { name: 'seventeen letters' },
      { name: 'tab\there' },
      { name: 7 },
      // One good field does not carry a bad one through.
      { name: 'Fine', color: '#123456' },
      'Calico',
      undefined,
    ];
    for (const patch of bad)
      expect(await b.call('PATCH', '/me', patch)).toEqual({ status: 400, body: error('VALIDATION') });
    expect(await b.me()).toEqual(before);
    expect((await b.call('PATCH', '/me', { name: 'sixteen letters!' })).status).toBe(200);
  });

  it('shows a lobby the new name, and gives any player anyone else as a profile', async () => {
    const b = await guest(),
      socket = await b.connect();
    await ask(socket, { t: 'lobby.create', visibility: 'private', settings: SETTINGS });
    await b.call('PATCH', '/me', { name: 'Mary Read' });
    await flush();
    const member = last(socket, 'lobby.state').lobby.members[0];
    expect(member.kind === 'human' && member.user.name).toBe('Mary Read');

    const me = await b.me(),
      other = await guest();
    const profile: Profile = { user: me.user, stats: me.stats, rating: null };
    expect(await other.call('GET', `/users/${me.user.id}`)).toEqual({ status: 200, body: profile });
    // A profile is the public part only: no username, no guest flag, no cooldown.
    expect(Object.keys(profile).toSorted()).toEqual(['rating', 'stats', 'user']);
    expect(await other.call('GET', '/users/00000000-0000-4000-8000-ffffffffffff')).toEqual({
      status: 404,
      body: error('NOT_FOUND'),
    });
    expect((await browser().call('GET', `/users/${me.user.id}`)).status).toBe(401);
  });
});

describe('public lobbies', () => {
  const list = async (b: Browser): Promise<LobbyList['lobbies']> =>
    ((await b.call('GET', '/lobbies')).body as LobbyList).lobbies;

  it("lists the open public lobbies with host, the host's colour, rules and seats taken, and never a private one", async () => {
    const host = await guest(),
      hostSocket = await host.connect(),
      hidden = await (await guest()).connect(),
      viewer = await guest();
    expect(await list(viewer)).toEqual([]);
    await ask(hidden, { t: 'lobby.create', visibility: 'private', settings: SETTINGS });
    const made = await ask(hostSocket, { t: 'lobby.create', visibility: 'public', settings: SETTINGS });
    await ask(hostSocket, { t: 'lobby.addBot' });
    const lobby = made.t === 'ok' ? made.lobby : undefined;
    expect(lobby).toMatchObject({ visibility: 'public', mode: 'custom' });
    const hostUser = (await host.me()).user;
    expect(await list(viewer)).toEqual([
      { id: lobby?.id, hostName: hostUser.name, hostColor: hostUser.color, settings: SETTINGS, players: 2 },
    ]);
    expect((await browser().call('GET', '/lobbies')).status).toBe(401);
  });

  it('seats a player who joins by lobby id, and lets the code win when both are sent', async () => {
    const one = await (await guest()).connect(),
      two = await (await guest()).connect(),
      joiner = await (await guest()).connect();
    const first = await ask(one, { t: 'lobby.create', visibility: 'public', settings: SETTINGS }),
      second = await ask(two, { t: 'lobby.create', visibility: 'public', settings: SETTINGS });
    if (first.t !== 'ok' || second.t !== 'ok' || !first.lobby || !second.lobby) throw new Error('No lobbies');
    const joined = await ask(joiner, { t: 'lobby.join', lobbyId: first.lobby.id });
    expect(joined).toMatchObject({ t: 'ok', lobby: { id: first.lobby.id } });
    expect(last(one, 'lobby.state').lobby.members).toHaveLength(2);
    await ask(joiner, { t: 'lobby.leave' });
    expect(await ask(joiner, { t: 'lobby.join', code: second.lobby.code, lobbyId: first.lobby.id })).toMatchObject({
      t: 'ok',
      lobby: { id: second.lobby.id },
    });
    await ask(joiner, { t: 'lobby.leave' });
    expect(await ask(joiner, { t: 'lobby.join', lobbyId: 'nowhere' })).toMatchObject({ code: 'LOBBY_NOT_FOUND' });
  });

  it('takes a lobby off the list while its game runs and puts it back when the lobby is open again', async () => {
    const host = await guest(),
      socket = await host.connect(),
      second = await (await guest()).connect();
    const made = await ask(socket, { t: 'lobby.create', visibility: 'public', settings: SETTINGS });
    if (made.t !== 'ok' || !made.lobby) throw new Error('No lobby');
    // A public table starts with two people at it: a bot would not do.
    await ask(second, { t: 'lobby.join', lobbyId: made.lobby.id });
    await ask(socket, { t: 'lobby.ready', ready: true });
    await ask(second, { t: 'lobby.ready', ready: true });
    expect(await list(host)).toHaveLength(1);
    expect(await ask(socket, { t: 'lobby.start' })).toMatchObject({ t: 'ok' });
    expect(await list(host)).toEqual([]);
    await until(() => framesOf(socket, 'game.over').length > 0, 'the game ends');
    expect(await list(host)).toHaveLength(1);
    await ask(socket, { t: 'lobby.leave' });
    await ask(second, { t: 'lobby.leave' });
    expect(await list(host)).toEqual([]);
  });
});

describe('the casual queue', () => {
  const queued = async (): Promise<RawClient> => {
    const socket = await (await guest()).connect();
    expect(await ask(socket, { t: 'queue.join', mode: 'casual' })).toMatchObject({ t: 'ok' });
    return socket;
  };

  it('answers the joiner with the queue and tells those already waiting, and the same when one leaves', async () => {
    vi.setSystemTime(1_700_000_000_000);
    // The wait runs from the moment the line stopped being empty, and it is the same time for everyone in it.
    const FILLS_AT = 1_700_000_000_000 + QUEUE_FILL_MS;
    const a = await (await guest()).connect();
    const joined = await ask(a, { t: 'queue.join', mode: 'casual' });
    expect(joined).toEqual({
      t: 'ok',
      re: expect.any(Number),
      queue: { mode: 'casual', since: 1_700_000_000_000, found: 1, needed: 4, fillsAt: FILLS_AT },
    });
    expect(framesOf(a, 'queue.status')).toEqual([]);
    await vi.advanceTimersByTimeAsync(1000);
    const b = await queued();
    // The one who was waiting hears of it as a push; the joiner's reply already said so.
    expect(framesOf(a, 'queue.status')).toEqual([
      {
        t: 'queue.status',
        queue: { mode: 'casual', since: 1_700_000_000_000, found: 2, needed: 4, fillsAt: FILLS_AT },
      },
    ]);
    expect(framesOf(b, 'queue.status')).toEqual([]);
    // The one who joined a second later has that second less to wait, not the whole time again.
    expect(last(b, 'ok').queue).toEqual({
      mode: 'casual',
      since: 1_700_000_001_000,
      found: 2,
      needed: 4,
      fillsAt: FILLS_AT,
    });

    expect(await ask(b, { t: 'queue.leave' })).toEqual({ t: 'ok', re: expect.any(Number) });
    expect(last(a, 'queue.status').queue.found).toBe(1);
    expect(framesOf(b, 'queue.status')).toEqual([]);
    // Leaving a queue one is not in is `ok` too.
    expect(await ask(b, { t: 'queue.leave' })).toMatchObject({ t: 'ok' });

    // A line that was empty starts its wait again with the next one who joins.
    expect(await ask(a, { t: 'queue.leave' })).toMatchObject({ t: 'ok' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(await ask(b, { t: 'queue.join', mode: 'casual' })).toMatchObject({
      queue: { found: 1, fillsAt: 1_700_000_003_000 + QUEUE_FILL_MS },
    });
  });

  it('keeps the place across a reconnect: the next welcome carries the queue', async () => {
    const b = await guest(),
      first = await b.connect();
    await ask(first, { t: 'queue.join', mode: 'casual' });
    first.close();
    await flush();
    const welcome = last(await b.connect(), 'welcome');
    expect(welcome).toMatchObject({ lobby: null, game: null, queue: { mode: 'casual', found: 1, needed: 4 } });
    expect(welcome.me.active).toEqual({ kind: 'queue', id: 'casual' });
  });

  it('fills the open seats with bots after a wait and starts the game: game.start, then the opening update', async () => {
    const a = await queued(),
      b = await queued();
    await vi.advanceTimersByTimeAsync(QUEUE_FILL_MS - 1100);
    expect(framesOf(a, 'game.start')).toEqual([]);
    await vi.advanceTimersByTimeAsync(1100);
    for (const p of [a, b]) {
      const start = last(p, 'game.start');
      expect(start).toMatchObject({ mode: 'casual', lobbyId: null, settings: STANDARD });
      expect(start.seats.map((s) => s.bot)).toEqual([false, false, true, true]);
      expect(new Set(start.seats.map((s) => s.color)).size).toBe(4);
      // The queue ends with `game.start`, with no accept step, no lobby and no last `queue.status`.
      const i = p.frames.indexOf(start);
      expect(p.frames[i + 1]).toMatchObject({ t: 'game.update', rev: 0, events: [] });
      expect(p.frames.slice(i - 1, i).map((f) => f.t)).not.toContain('lobby.state');
      expect(framesOf(p, 'lobby.state')).toEqual([]);
    }
    expect(last(a, 'game.start').me).toBe(0);
    expect(last(b, 'game.start').me).toBe(1);
    expect(last(a, 'game.start').gameId).toBe(last(b, 'game.start').gameId);
  });

  it('starts at once when four are waiting, with no bots', async () => {
    const players = [await queued(), await queued(), await queued()];
    expect(framesOf(players[0], 'game.start')).toEqual([]);
    players.push(await queued());
    for (const p of players) expect(last(p, 'game.start').seats.every((s) => !s.bot)).toBe(true);
    // The fourth joiner's reply still names the queue they were in for a moment.
    expect(last(players[3], 'ok').queue).toMatchObject({ found: 4, needed: 4 });
    // Four are a table: there is nothing left to wait for, and no time is named.
    expect(last(players[2], 'ok').queue?.fillsAt).toEqual(expect.any(Number));
    expect(last(players[3], 'ok').queue).not.toHaveProperty('fillsAt');
    expect(last(players[0], 'queue.status').queue).not.toHaveProperty('fillsAt');
  });

  it('tells a guest who asks for ranked ACCOUNT_REQUIRED, seated or not', async () => {
    const socket = await (await guest()).connect();
    expect(await ask(socket, { t: 'queue.join', mode: 'ranked' })).toMatchObject({
      t: 'err',
      code: 'ACCOUNT_REQUIRED',
    });
    await ask(socket, { t: 'queue.join', mode: 'casual' });
    expect(await ask(socket, { t: 'queue.join', mode: 'ranked' })).toMatchObject({ code: 'ACCOUNT_REQUIRED' });
    expect(await ask(socket, { t: 'queue.join', mode: 'blitz' })).toMatchObject({ code: 'VALIDATION' });
    // An account may queue for ranked: that queue has tests of its own (ranked.test.ts).
    const anne = await (await account()).connect();
    expect(await ask(anne, { t: 'queue.join', mode: 'ranked' })).toMatchObject({ t: 'ok', queue: { mode: 'ranked' } });
  });

  it('answers ALREADY_SEATED to anyone who is already in a queue, a lobby or a game', async () => {
    // In the queue: no second place in it, and no lobby.
    const waiting = await queued();
    const other = await (await guest()).connect();
    const made = await ask(other, { t: 'lobby.create', visibility: 'public', settings: SETTINGS });
    const lobby = made.t === 'ok' ? made.lobby : undefined;
    for (const message of [
      { t: 'queue.join', mode: 'casual' },
      { t: 'lobby.create', visibility: 'private', settings: SETTINGS },
      { t: 'lobby.join', code: lobby?.code },
      { t: 'lobby.join', lobbyId: lobby?.id },
    ])
      expect(await ask(waiting, message)).toMatchObject({ t: 'err', code: 'ALREADY_SEATED' });
    // In a lobby: no queue.
    expect(await ask(other, { t: 'queue.join', mode: 'casual' })).toMatchObject({ code: 'ALREADY_SEATED' });
    // A refusal changes nothing: the one who waited is still the only one waiting.
    expect(framesOf(waiting, 'queue.status')).toEqual([]);
    // In a game: neither.
    await vi.advanceTimersByTimeAsync(QUEUE_FILL_MS);
    expect(framesOf(waiting, 'game.start')).toHaveLength(1);
    expect(await ask(waiting, { t: 'queue.join', mode: 'casual' })).toMatchObject({ code: 'ALREADY_SEATED' });
    expect(await ask(waiting, { t: 'lobby.join', code: lobby?.code })).toMatchObject({ code: 'ALREADY_SEATED' });
    // Free again after leaving the lobby.
    await ask(other, { t: 'lobby.leave' });
    expect(await ask(other, { t: 'queue.join', mode: 'casual' })).toMatchObject({ t: 'ok', queue: { found: 1 } });
  });
});

describe('stats', () => {
  it('counts a finished game for everyone still seated: games, a win for place 1, bids and the best score', async () => {
    const one = await guest(),
      two = await guest(),
      a = await one.connect(),
      b = await two.connect();
    await ask(a, { t: 'queue.join', mode: 'casual' });
    await ask(b, { t: 'queue.join', mode: 'casual' });
    await until(() => framesOf(a, 'game.over').length > 0, 'the game ends', 8000);
    const { result } = last(a, 'game.over');
    expect(result).toMatchObject({ lobbyId: null, rating: null, forfeited: [] });
    const rounds = last(a, 'game.start').schedule.length;
    for (const [seat, who] of [one, two].entries()) {
      const me = await who.me();
      expect(me.stats).toMatchObject({
        games: 1,
        wins: result.places[seat] === 1 ? 1 : 0,
        bidsTotal: rounds,
        bestScore: result.totals[seat],
      });
      expect(me.stats.bidsMade).toBeGreaterThanOrEqual(0);
      expect(me.stats.bidsMade).toBeLessThanOrEqual(rounds);
      expect(me.active).toBeNull();
      // What anyone else sees of them is the same record.
      expect(((await one.call('GET', `/users/${me.user.id}`)).body as Profile).stats).toEqual(me.stats);
    }
    // The table the queue made has no lobby to go back to.
    expect(last(await one.connect(), 'welcome')).toMatchObject({ lobby: null, queue: null, game: null });
  });

  it('does not count a game for the seat that left it', async () => {
    const one = await guest(),
      two = await guest(),
      a = await one.connect(),
      b = await two.connect();
    await ask(a, { t: 'queue.join', mode: 'casual' });
    await ask(b, { t: 'queue.join', mode: 'casual' });
    await vi.advanceTimersByTimeAsync(QUEUE_FILL_MS);
    await ask(a, { t: 'game.leave' });
    await until(() => framesOf(b, 'game.over').length > 0, 'the game ends', 8000);
    expect((await one.me()).stats).toMatchObject({ games: 0, wins: 0, bidsTotal: 0, bestScore: null });
    expect((await two.me()).stats.games).toBe(1);
  });
});
