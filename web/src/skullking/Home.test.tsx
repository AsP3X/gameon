// @vitest-environment jsdom
/* Skull King's home: the four ways to play, the way back into a game that is not over, and what it
   says about ranked. What the server says about the player is written by hand here, because the
   mock cannot be clicked into a solo game on the server, a cooldown or a rating. The ways in, the
   renderer's sheets and the seat that comes back run on the whole page against the mock server. */
import { act, StrictMode, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { App } from '../App';
import { Engine } from '../game';
import { Api } from '../net/api';
import type { Backend, RestResponse } from '../net/api';
import { MockServer } from '../net/mock/server';
import { Online } from '../net/online';
import { SocketClient } from '../net/socket';
import type { Wire } from '../net/socket';
import type { Active, Me, ServerConfig } from '../protocol/generated';
import { memoryPlaces } from '../router/places';
import type { MemoryPlaces } from '../router/places';
import { createRouter } from '../router/router';
import { Sound } from '../sound/sound';
import { session, stats } from '../tableview/state';
import { SkullKingHome } from './Home';

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const QUEUE_FILL_MS = 4000;
const RETRY_MS = 5000;
const GAME_KEY = 'skullking-tavern.game.v2';

let host: HTMLDivElement;
let root: Root | null = null;
let places: MemoryPlaces;
let server: MockServer;
/** The browser the page runs in, and every frame the page wrote to its socket. */
let page: Backend;
let sent: { t: string }[];
/** How often the home asked for the seat the server keeps. */
let rejoined: number;

const $ = (selector: string): HTMLElement | null => document.querySelector<HTMLElement>(selector);
const texts = (selector: string): string[] =>
  Array.from(document.querySelectorAll<HTMLElement>(selector), (el) => el.textContent ?? '');
const settle = (ms = 0): Promise<void> => act(() => vi.advanceTimersByTimeAsync(ms).then(() => {}));
async function click(selector: string): Promise<void> {
  const el = $(selector);
  if (!el) throw new Error(`Nothing to click: ${selector}`);
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);
  });
}
/** The four ways to play, as the page has them: what each says and where it leads, or null where it leads nowhere. */
const ways = (): { name: string; line: string; to: string | null }[] =>
  Array.from(document.querySelectorAll<HTMLElement>('.sk-way'), (way) => ({
    name: way.querySelector('b')?.textContent ?? '',
    line: way.querySelector('.sk-way-text > span')?.textContent ?? '',
    to: way.getAttribute('href'),
  }));
const way = (name: string): HTMLElement => {
  const el = Array.from(document.querySelectorAll<HTMLElement>('.sk-way')).find(
    (w) => w.querySelector('b')?.textContent === name,
  );
  if (!el) throw new Error(`No way called "${name}"`);
  return el;
};
const jump = (): { title: string; line: string; button: string; to: string | null } | null => {
  const el = $('.sk-jump');
  return (
    el && {
      title: el.querySelector('.sk-jump-text b')?.textContent ?? '',
      line: el.querySelector('.sk-jump-text > span')?.textContent ?? '',
      button: el.querySelector('a.btn')?.textContent ?? '',
      to: el.querySelector('a.btn')?.getAttribute('href') ?? null,
    }
  );
};

/* ---------- answers written by hand ---------- */

type Answers = Record<string, () => RestResponse | Promise<RestResponse>>;
const ok = (body: unknown): RestResponse => ({ status: 200, body });
const refused = (status: number, code: string): RestResponse => ({ status, body: { error: { code, message: '' } } });
/** The home alone, with addresses of its own. It never connects: asking for a seat is counted. */
function Home({ online }: { online: Online }) {
  const state = useSyncExternalStore(online.subscribe, online.getState);
  const [router] = useState(() => createRouter(places));
  useSyncExternalStore(router.subscribe, router.getPath);
  return <SkullKingHome online={online} state={state} go={router.go} behind={false} onRejoin={() => rejoined++} />;
}
async function openHome(answers: Answers): Promise<void> {
  places = memoryPlaces('/skull-king');
  const online = new Online(
    new SocketClient({ transport: () => new Promise(() => {}), build: 'test' }),
    new Api(async (method, path) => (answers[`${method} ${path}`] ?? (() => refused(404, 'NOT_FOUND')))()),
  );
  root = createRoot(host);
  await act(async () => {
    root?.render(<Home online={online} />);
    await vi.advanceTimersByTimeAsync(0);
  });
  await settle();
}
function closePage(): void {
  act(() => root?.unmount());
  root = null;
}
/** A guest as the mock makes them, to build other players from. */
const aGuest = async (): Promise<Me> => (await server.browser().rest('POST', '/auth/guest')).body as Me;
const anAccount = async (): Promise<Me> => {
  const guest = await aGuest();
  return {
    ...guest,
    guest: false,
    username: 'anne_bonny',
    user: { ...guest.user, name: 'Anne' },
    rating: { value: 14, tier: 'Bosun', provisional: false, games: 9 },
  };
};
const config = async (): Promise<ServerConfig> => (await server.browser().rest('GET', '/config')).body as ServerConfig;
/** What the server says of a player whose seat it keeps in that game. */
const seated = async (active: Active): Promise<Answers> => {
  const me = await anAccount();
  return { 'GET /me': () => ok({ ...me, active }) };
};
/** A game saved on this device, as the renderer saves one: only what the home reads of it is real. */
function saveOnDevice(humans: number, bots: number, round: number, rounds: number): void {
  localStorage.setItem(
    GAME_KEY,
    JSON.stringify({
      version: Engine.VERSION,
      phase: 'bidding',
      seats: [...Array<boolean>(humans).fill(false), ...Array<boolean>(bots).fill(true)].map((bot) => ({ bot })),
      round: round - 1,
      schedule: Array<number>(rounds).fill(1),
    }),
  );
}

/* ---------- the whole page ---------- */

/** The page's backend, with every frame it writes to its socket kept. */
function recording(inner: Backend): Backend {
  return {
    rest: inner.rest,
    transport: async () => {
      const wire = await inner.transport();
      const tapped: Wire = {
        send: (data) => {
          sent.push(JSON.parse(data) as { t: string });
          wire.send(data);
        },
        close: () => wire.close(),
        onmessage: null,
        onclose: null,
      };
      wire.onmessage = (data) => tapped.onmessage?.(data);
      wire.onclose = (code) => tapped.onclose?.(code);
      return tapped;
    },
  };
}
async function openAt(at: string): Promise<void> {
  places = memoryPlaces(at);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <StrictMode>
        <App backend={page} places={places} />
      </StrictMode>,
    );
    await vi.advanceTimersByTimeAsync(0);
  });
  await settle();
}
const back = (): Promise<void> =>
  act(async () => {
    places.back();
    await vi.advanceTimersByTimeAsync(0);
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockImplementation(seeded(21));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }));
  vi.stubGlobal('scrollTo', () => {});
  localStorage.clear();
  document.title = 'Skull King Tavern';
  document.body.innerHTML = '<div id="root"></div>';
  host = document.querySelector<HTMLDivElement>('#root') ?? document.createElement('div');
  server = new MockServer({
    random: seeded(4),
    timers: { bidMs: 300, playMs: 200, abilityMs: 200, trickEndMs: 60, roundEndMs: 100 },
    bot: { minMs: 20, maxMs: 40 },
    queueFillMs: QUEUE_FILL_MS,
  });
  sent = [];
  rejoined = 0;
  page = recording(server.browser());
  Object.assign(stats, { games: 0, wins: 0, made: 0, bids: 0, best: null, streak: 0, lastDay: null });
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the four ways to play', () => {
  it('offers Solo, One screen, Online and Ranked, each with its own address', async () => {
    const me = await anAccount();
    await openHome({ 'GET /me': () => ok(me), 'GET /config': async () => ok(await config()) });
    expect($('.sk-home h1')?.textContent).toBe('Skull King');
    expect(document.title).toBe('Skull King · GameOn');
    expect(ways()).toEqual([
      { name: 'Solo', line: 'Against bots, any time. Saved to your account.', to: '/skull-king/solo' },
      // One line for a phone and one for a wide window: only one of the two words is ever shown.
      { name: 'One screen', line: 'Pass one phonedevice around. 2 to 8 pirates.', to: '/skull-king/one-screen' },
      { name: 'Online', line: 'Quick play, public tables, or a table of your own.', to: '/skull-king/online' },
      { name: 'Ranked', line: 'This quarter. The standard rules. No bots.', to: '/skull-king/ranked' },
    ]);
    // The season on the Ranked card is the server's.
    expect(way('Ranked').querySelector('.pill')?.textContent).toBe((await config()).season?.name);
    expect($('.sk-jump')).toBeNull();
    expect($('.sk-back')?.getAttribute('href')).toBe('/games');
    expect($('.go-chip')?.getAttribute('href')).toBe('/profile');
    expect($('.go-chip-text small')?.textContent).toBe('Bosun');
  });

  it('opens the screen of each way, and Back is the home again', async () => {
    await openAt('/skull-king');
    await click('.sk-way[href="/skull-king/solo"]');
    expect(places.path()).toBe('/skull-king/solo');
    expect($('.sk-solo h1')?.textContent).toBe('Solo game');
    expect($('.sk-home')).toBeNull();
    await back();
    expect($('.sk-home')).not.toBeNull();

    await click('.sk-way[href="/skull-king/one-screen"]');
    expect(places.path()).toBe('/skull-king/one-screen');
    expect($('#app h2')?.textContent).toBe('New game');
    await back();

    await click('.sk-way[href="/skull-king/online"]');
    await settle();
    expect(places.path()).toBe('/skull-king/online');
    expect($('#online h2')?.textContent).toBe('Play online');
    await back();
    expect($('.sk-home')).not.toBeNull();

    // A browser the server does not know has no account: Ranked says what it takes and leads to it.
    expect(way('Ranked').getAttribute('href')).toBe('/sign-up');
  });

  it('leads an account from Ranked to the ranked page, which is the hub until it is built', async () => {
    await page.rest('POST', '/auth/guest');
    await page.rest('POST', '/auth/register', { username: 'calico', password: 'secret' });
    await openAt('/skull-king');
    expect(way('Ranked').getAttribute('href')).toBe('/skull-king/ranked');
    await click('.sk-way[href="/skull-king/ranked"]');
    await settle();
    expect(places.path()).toBe('/skull-king/online');
    expect(texts('#online .label')).toContain('Ranked');
  });

  it('makes nobody and connects nowhere: looking at the home is not playing online', async () => {
    await openAt('/skull-king');
    expect((await page.rest('GET', '/me')).status).toBe(401);
    expect(sent).toEqual([]);
    expect($('.go-chip')).toBeNull();
    // Neither does the setup of a solo game, until "Start": the home itself starts nothing.
    await click('.sk-way[href="/skull-king/solo"]');
    await settle(3000);
    expect((await page.rest('GET', '/me')).status).toBe(401);
    expect(sent).toEqual([]);
  });

  it('leads to the scoresheet for a real table, and back', async () => {
    await openAt('/skull-king');
    expect($('.sk-real b')?.textContent).toBe('Score a real game');
    expect($('.sk-real small')?.textContent).toBe('Playing with physical cards? Track bids, tricks and bonuses.');
    await click('.sk-real');
    expect(places.path()).toBe('/skull-king/score');
    expect($('#app h2')?.textContent).toBe('Score a real game');
    await click('[data-act="trkStart"]');
    await click('[data-act="home"]');
    expect($('.sk-real b')?.textContent).toBe('Continue scoring');
    expect($('.sk-real small')?.textContent).toMatch(/^Round 1 of \d+ · \d players$/);
  });
});

describe('the way back into a game', () => {
  it("says a solo game in the server's own numbers, and the Solo card is the way back to it", async () => {
    await openHome(await seated({ kind: 'game', id: 'game-1', table: 'solo', bots: 2, round: 3, rounds: 5 }));
    expect(jump()).toEqual({
      title: 'Solo against 2 bots',
      line: 'Round 3 of 5 · saved to your account',
      button: 'Continue',
      to: '/skull-king/table',
    });
    expect(ways()[0]).toEqual({ name: 'Solo', line: 'Round 3 of 5 is waiting.', to: '/skull-king/table' });
    expect(way('Solo').querySelector('.pill')?.textContent).toBe('Back to your game');
    // Both ask for the seat the server keeps. Neither starts a game.
    await click('.sk-jump a.btn');
    expect(rejoined).toBe(1);
    await click('.sk-way[href="/skull-king/table"]');
    expect(rejoined).toBe(2);
    expect(places.path()).toBe('/skull-king');
  });

  it('says one bot as one bot', async () => {
    await openHome(await seated({ kind: 'game', id: 'game-1', table: 'solo', bots: 1, round: 10, rounds: 10 }));
    expect(jump()?.title).toBe('Solo against 1 bot');
    expect(jump()?.line).toBe('Round 10 of 10 · saved to your account');
  });

  it("says any other game is the player's table, with no name in it, and leaves the Solo card as it rests", async () => {
    for (const table of ['friends', 'public', 'casual', 'ranked'] as const) {
      await openHome(await seated({ kind: 'game', id: 'game-1', table }));
      expect(jump()).toEqual({
        title: 'Skull King · your table',
        line: 'Game running · your seat is kept',
        button: 'Rejoin',
        to: '/skull-king/table',
      });
      expect(ways()[0].line).toBe('Against bots, any time. Saved to your account.');
      closePage();
    }
    // A reply that names no table, or a solo game without its numbers, is a game like any other.
    await openHome(await seated({ kind: 'game', id: 'game-1' }));
    expect(jump()?.title).toBe('Skull King · your table');
    closePage();
    await openHome(await seated({ kind: 'game', id: 'game-1', table: 'solo' }));
    expect(jump()?.title).toBe('Skull King · your table');
    expect(ways()[0].to).toBe('/skull-king/solo');
  });

  it('has no panel for a lobby or a queue: the frames draw none', async () => {
    await openHome(await seated({ kind: 'lobby', id: 'lobby-1' }));
    expect($('.sk-jump')).toBeNull();
    closePage();
    await openHome(await seated({ kind: 'queue', id: 'casual' }));
    expect($('.sk-jump')).toBeNull();
  });

  it('offers the game saved on this device when the server keeps none', async () => {
    saveOnDevice(1, 2, 2, 7);
    await openHome({ 'GET /me': async () => ok(await anAccount()) });
    expect(jump()).toEqual({
      title: 'Solo against 2 bots',
      line: 'Round 2 of 7 · offline, on this device only',
      button: 'Continue',
      to: '/skull-king/table',
    });
    expect($('.sk-jump-also')).toBeNull();
    // That game is the device's: the way to it asks the server for nothing.
    await click('.sk-jump a.btn');
    expect(rejoined).toBe(0);
    expect(places.path()).toBe('/skull-king/table');
  });

  it('says a game for several at one screen as what it is', async () => {
    saveOnDevice(3, 0, 1, 10);
    await openHome({ 'GET /me': () => refused(401, 'UNAUTHENTICATED') });
    expect(jump()?.title).toBe('One screen with 3 pirates');
    expect(jump()?.line).toBe('Round 1 of 10 · offline, on this device only');
  });

  it('shows the server game first when both exist, and the device game as a second line under it', async () => {
    saveOnDevice(1, 3, 2, 10);
    await openHome(await seated({ kind: 'game', id: 'game-1', table: 'solo', bots: 4, round: 6, rounds: 8 }));
    expect(jump()).toEqual({
      title: 'Solo against 4 bots',
      line: 'Round 6 of 8 · saved to your account',
      button: 'Continue',
      to: '/skull-king/table',
    });
    expect($('.sk-jump-also')?.textContent).toBe('Round 2 of 10 · offline, on this device only');
    expect(ways()[0].line).toBe('Round 6 of 8 is waiting.');

    // "Continue" and "Back to your game" are the server game.
    await click('.sk-jump a.btn');
    expect(rejoined).toBe(1);
    expect(places.path()).toBe('/skull-king');
    // The second line is the device game, at the table, with nothing asked of the server.
    await click('.sk-jump-also');
    expect(rejoined).toBe(1);
    expect(places.path()).toBe('/skull-king/table');
  });

  it('brings the seat back at the table through the connection, and starts no game to do it', async () => {
    // A quick-play table the server seated this browser at.
    await openAt('/skull-king/online');
    await click('#online section .btn');
    expect($('#online h2')?.textContent).toBe('Quick play');
    await settle(QUEUE_FILL_MS + 500);
    expect($('#app .game')).not.toBeNull();
    closePage();

    // The same browser, on a device that remembers no seat: it opens at the home and connects nowhere.
    localStorage.removeItem('skullking-tavern.online.v1');
    sent = [];
    await openAt('/skull-king');
    expect(sent).toEqual([]);
    expect(jump()).toEqual({
      title: 'Skull King · your table',
      line: 'Game running · your seat is kept',
      button: 'Rejoin',
      to: '/skull-king/table',
    });

    await click('.sk-jump a.btn');
    await settle(100);
    expect(places.path()).toBe('/skull-king/table');
    expect($('.sk-home')).toBeNull();
    expect($('#app .game')).not.toBeNull();
    // It is the server's table, with this browser in its one seat.
    expect(session.online).not.toBeNull();
    expect(session.table?.localSeats).toHaveLength(1);
    // Only `hello` went out before the server's `welcome` put the table back.
    expect(sent.map((m) => m.t)).not.toContain('solo.start');
    expect(sent[0]?.t).toBe('hello');
  });
});

describe('what the home says about ranked', () => {
  it('says ranked is closed while the cooldown the server named is ahead, and leads nowhere', async () => {
    const me = await anAccount();
    await openHome({ 'GET /me': () => ok({ ...me, cooldownUntil: Date.now() + 60_000 }) });
    const ranked = way('Ranked');
    expect(ways()[3]).toEqual({ name: 'Ranked', line: 'Ranked is closed for you.', to: null });
    expect(ranked.tagName).toBe('DIV');
    expect(ranked.getAttribute('aria-disabled')).toBe('true');
    expect(ranked.querySelector('.pill')?.textContent).toBe('Cooldown');
    // No minutes are drawn.
    expect(ranked.textContent).not.toMatch(/\d/);
    await click('.sk-way[aria-disabled]');
    expect(places.path()).toBe('/skull-king');

    // When the time has come, the card is the way in again.
    await settle(61_000);
    expect(ways()[3]).toEqual({
      name: 'Ranked',
      line: 'This quarter. The standard rules. No bots.',
      to: '/skull-king/ranked',
    });
  });

  it('takes a cooldown that is over as none', async () => {
    const me = await anAccount();
    await openHome({ 'GET /me': () => ok({ ...me, cooldownUntil: Date.now() - 1000 }) });
    expect(ways()[3].to).toBe('/skull-king/ranked');
  });

  it('tells a guest and a visitor what ranked takes, and an account without a rating what comes first', async () => {
    const guest = await aGuest();
    await openHome({ 'GET /me': () => ok(guest) });
    expect(ways()[3]).toEqual({ name: 'Ranked', line: 'Needs a free account.', to: '/sign-up' });
    expect(way('Ranked').querySelector('.pill')?.textContent).toBe('Sign up');
    closePage();

    await openHome({ 'GET /me': () => refused(401, 'UNAUTHENTICATED') });
    expect(ways()[3]).toEqual({ name: 'Ranked', line: 'Needs a free account.', to: '/sign-up' });
    closePage();

    const me = await anAccount();
    await openHome({ 'GET /me': () => ok({ ...me, rating: null }) });
    expect(ways()[3]).toEqual({
      name: 'Ranked',
      line: 'Five placement games set your tier.',
      to: '/skull-king/ranked',
    });
  });
});

describe('without a connection', () => {
  it('says so, keeps Solo and One screen, and takes Online and Ranked out of reach until the server answers', async () => {
    const me = await anAccount();
    let down = true;
    await openHome({ 'GET /me': () => (down ? Promise.reject(new Error('No network')) : ok(me)) });
    expect($('.go-banner')?.textContent).toBe('Not connected. Solo and One screen still work.');
    expect(ways()).toEqual([
      {
        name: 'Solo',
        line: 'Offline: runs on this device and is not counted in your stats.',
        to: '/skull-king/solo',
      },
      { name: 'One screen', line: 'Pass one phonedevice around. 2 to 8 pirates.', to: '/skull-king/one-screen' },
      { name: 'Online', line: 'Needs a connection.', to: null },
      { name: 'Ranked', line: 'Needs a connection.', to: null },
    ]);
    expect(way('Solo').querySelector('.pill')?.textContent).toBe('Offline');
    expect($('.go-chip')).toBeNull();

    down = false;
    await settle(RETRY_MS);
    expect($('.go-banner')).toBeNull();
    expect(ways().map((w) => w.to)).toEqual([
      '/skull-king/solo',
      '/skull-king/one-screen',
      '/skull-king/online',
      '/skull-king/ranked',
    ]);
  });
});

describe("this device's stats", () => {
  it('shows none before the first game, and the four numbers after it', async () => {
    await openHome({ 'GET /me': () => refused(401, 'UNAUTHENTICATED') });
    expect($('.sk-stats')).toBeNull();
    closePage();
    Object.assign(stats, { games: 5, wins: 2, made: 9, bids: 20, streak: 3 });
    await openHome({ 'GET /me': () => refused(401, 'UNAUTHENTICATED') });
    expect(texts('.sk-stats .stat b')).toEqual(['3', '5', '2', '45%']);
    expect(texts('.sk-stats .stat small')).toEqual(['Day streak', 'Games', 'Wins', 'Bids made']);
  });
});

describe("the renderer's sheets over the home", () => {
  it('opens the rules and the sound settings, and takes the home out of reach while one is open', async () => {
    await openAt('/skull-king');
    const rules = $('.sk-rules');
    rules?.focus();
    await click('.sk-rules');
    expect($('#app .sheet')?.getAttribute('role')).toBe('dialog');
    expect($('#app .sheet h2')?.textContent).toBe('How to play');
    expect($('.sk-home')?.hasAttribute('inert')).toBe(true);
    expect($('#app')?.hidden).toBe(false);

    // Closed, the home takes input again, and the keyboard is back on what opened the sheet.
    await click('#app .sheet [data-act="closeSheet"]');
    await settle(300);
    expect($('#app .sheet')).toBeNull();
    expect($('.sk-home')?.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(rules);

    await click('.sk-bar [data-act="soundSheet"]');
    expect($('#app .sheet')?.getAttribute('aria-label')).toBe('Sound settings');
    expect($('.sk-home')?.hasAttribute('inert')).toBe(true);
  });

  it('greets a page that opens on the home, and no page that opens anywhere else', async () => {
    // A real browser withholds sound until a tap. The greeting is that tap.
    vi.spyOn(Sound, 'asksToStart').mockReturnValue(true);
    await openAt('/skull-king');
    expect($('#app .sheet')?.getAttribute('aria-label')).toBe('Welcome back');
    expect($('.sk-home')?.hasAttribute('inert')).toBe(true);
    await click('[data-act="welcomeIn"]');
    expect($('#app .sheet')).toBeNull();
    expect($('.sk-home')?.hasAttribute('inert')).toBe(false);
    closePage();

    vi.stubGlobal('fetch', () => Promise.reject(new Error('No server in this test')));
    await openAt('/games');
    expect($('#app .sheet')).toBeNull();
    await click('#gameon a[href="/skull-king"]');
    expect($('.sk-home')).not.toBeNull();
    expect($('#app .sheet')).toBeNull();
  });
});
