// @vitest-environment jsdom
/* The frame around the game: the landing, Games, and signing up and in. Most of it runs on the whole
   page against the mock server: what a visitor clicks and types, what the pages say back, and what
   the server then knows. The states the mock cannot be clicked into (a rating, a seat the server
   keeps, a server that does not answer) run against answers written by hand. */
import { act, StrictMode, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { App } from '../App';
import { Api } from '../net/api';
import type { Backend, RestResponse } from '../net/api';
import { connectRaw, framesOf } from '../net/mock/raw';
import type { RawClient } from '../net/mock/raw';
import { MockServer, STANDARD } from '../net/mock/server';
import { Online } from '../net/online';
import { SocketClient } from '../net/socket';
import type { GameSettings, LadderEntry, Me, ServerConfig } from '../protocol/generated';
import { isFrame, routeOf } from '../router/addresses';
import { memoryPlaces } from '../router/places';
import type { MemoryPlaces } from '../router/places';
import { createRouter } from '../router/router';
import { GameOn } from './GameOn';

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
/** How long the frame waits before it asks again a server that did not answer. */
const RETRY_MS = 5000;

let host: HTMLDivElement;
let root: Root | null = null;
let places: MemoryPlaces;
let server: MockServer;
/** The browser the page runs in: the tests ask the server about its session through the same cookie jar. */
let page: Backend;

const $ = (selector: string): HTMLElement | null => document.querySelector<HTMLElement>(selector);
const texts = (selector: string): string[] =>
  Array.from(document.querySelectorAll<HTMLElement>(selector), (el) => el.textContent ?? '');
const settle = (ms = 0): Promise<void> => act(() => vi.advanceTimersByTimeAsync(ms).then(() => {}));
/** The first link of the frame that says this. A page has some links twice, one for each width. */
const link = (label: string): HTMLAnchorElement => {
  const el = Array.from(document.querySelectorAll<HTMLAnchorElement>('#gameon a')).find((a) => a.textContent === label);
  if (!el) throw new Error(`No link says "${label}"`);
  return el;
};
const button = (label: string): HTMLButtonElement => {
  const el = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === label);
  if (!el) throw new Error(`No button says "${label}"`);
  return el;
};
async function clickOn(el: HTMLElement): Promise<void> {
  if (el instanceof HTMLButtonElement && el.disabled) throw new Error(`"${el.textContent}" is disabled`);
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);
  });
}
/** Skull King's two choices on Games, as the page has them: the name of each, and whether it is open. */
const choices = (): { name: string; open: boolean }[] =>
  Array.from(document.querySelectorAll<HTMLElement>('.go-choices .sk-way'), (card) => ({
    name: card.querySelector('b')?.textContent ?? '',
    open: card.getAttribute('aria-expanded') === 'true',
  }));
/** The ways of the choice that is open: what each is called and where it leads. */
const shown = (): [string, string | null][] =>
  Array.from(document.querySelectorAll<HTMLElement>('.go-choices .sk-opts:not([hidden]) .sk-opt'), (opt) => [
    opt.querySelector('b')?.textContent ?? '',
    opt.getAttribute('href'),
  ]);
const way = (name: string): HTMLElement => {
  const el = Array.from(document.querySelectorAll<HTMLElement>('.go-choices .sk-opts:not([hidden]) .sk-opt')).find(
    (opt) => opt.querySelector('b')?.textContent === name,
  );
  if (!el) throw new Error(`No way called "${name}" is open`);
  return el;
};
/** Open the choice of that name, or close it. */
const choose = (name: string): Promise<void> =>
  clickOn($(`.go-choices .sk-way[aria-controls="go-${name.toLowerCase()}-ways"]`) ?? host);
const follow = (label: string): Promise<void> => clickOn(link(label));
const press = (label: string): Promise<void> => clickOn(button(label));
async function type(selector: string, value: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`Nothing to type into: ${selector}`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(0);
  });
}
/** Send the form on screen, as Enter in a field does. */
async function submit(): Promise<void> {
  const form = $('#gameon form');
  if (!form) throw new Error('No form on screen');
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);
  });
}
/** Open the whole page at an address, as a typed address does. */
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
function closePage(): void {
  act(() => root?.unmount());
  root = null;
}
const session = (): Promise<RestResponse> => page.rest('GET', '/me');
const me = async (): Promise<Me> => (await session()).body as Me;
const config = async (): Promise<ServerConfig> => (await page.rest('GET', '/config')).body as ServerConfig;
/** Another player, from a browser of their own. */
async function someone(): Promise<{ socket: RawClient; browser: Backend }> {
  const browser = server.browser();
  const socket = await connectRaw(browser.transport);
  await settle();
  return { socket, browser };
}
/** An account that exists before the page does anything. */
async function existingAccount(username: string, password: string, name: string): Promise<Me> {
  const { browser, socket } = await someone();
  await browser.rest('PATCH', '/me', { name });
  const res = await browser.rest('POST', '/auth/register', { username, password });
  socket.close();
  return res.body as Me;
}
async function signUp(username: string, password: string, repeat = password): Promise<void> {
  await type('#signup-username', username);
  await type('#signup-password', password);
  await type('#signup-repeat', repeat);
  await submit();
}

/* ---------- answers written by hand ---------- */

type Answers = Record<string, () => RestResponse | Promise<RestResponse>>;
const ok = (body: unknown): RestResponse => ({ status: 200, body });
const refused = (status: number, code: string): RestResponse => ({ status, body: { error: { code, message: '' } } });
/** A session whose server says exactly what `answers` holds, by method and path. It never connects. */
const cannedOnline = (answers: Answers): Online =>
  new Online(
    new SocketClient({ transport: () => new Promise(() => {}), build: 'test' }),
    new Api(async (method, path) =>
      (answers[`${method} ${path.split('?')[0]}`] ?? (() => refused(404, 'NOT_FOUND')))(),
    ),
  );
/** The frame alone, with addresses of its own. An address that is not the frame's is written out. */
function Frame({ online, at }: { online: Online; at: string }) {
  const state = useSyncExternalStore(online.subscribe, online.getState);
  const [router] = useState(() => createRouter(memoryPlaces(at)));
  const path = useSyncExternalStore(router.subscribe, router.getPath);
  const route = routeOf(path);
  if (!isFrame(route)) return <p id="left">{path}</p>;
  return (
    <GameOn
      online={online}
      state={state}
      route={route}
      go={router.go}
      up={router.up}
      back={router.back}
      onJoin={() => {}}
    />
  );
}
async function openFrame(answers: Answers, at: string): Promise<void> {
  root = createRoot(host);
  await act(async () => {
    root?.render(<Frame online={cannedOnline(answers)} at={at} />);
    await vi.advanceTimersByTimeAsync(0);
  });
  await settle();
}
/** A guest as the mock makes them, to build other players from. */
const aGuest = async (): Promise<Me> => (await server.browser().rest('POST', '/auth/guest')).body as Me;

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
  });
  page = server.browser();
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the landing', () => {
  it('shows a visitor the way in and gives them no session', async () => {
    await openAt('/');
    expect($('#gameon h1')?.textContent).toBe('Game night, switched on.');
    expect(document.title).toBe('GameOn · Game night, switched on');
    expect($('#app')?.hidden).toBe(true);
    expect($('#online')).toBeNull();
    expect(link('Sign in').getAttribute('href')).toBe('/sign-in');
    expect(link('Play Skull King').getAttribute('href')).toBe('/skull-king');
    expect(link('Browse the games').getAttribute('href')).toBe('/games');
    expect(link('Ladder').getAttribute('href')).toBe('/ladder');

    // The season is the server's. Ranked is offered with what it takes.
    const season = (await config()).season;
    expect($('.go-season .pill')?.textContent).toBe(`Season ${season?.name}`);
    expect(link('Find a ranked game').getAttribute('href')).toBe('/sign-up');
    expect($('.go-ranked-foot')?.textContent).toContain('Ranked needs a free account.');
    expect(texts('.go-tier')).toEqual([
      'Deckhand',
      'Bosun',
      'Quartermaster',
      'First Mate',
      'Captain',
      'Pirate Lord',
      'Skull King',
    ]);
    // Nobody is on the ladder yet, so there is no podium. Reading it made no session.
    expect($('.go-podium')).toBeNull();
    expect((await session()).status).toBe(401);
  });

  it('goes to Skull King by a link, and Back is the way the visitor came', async () => {
    await openAt('/');
    await follow('Play Skull King');
    expect(places.entries()).toEqual({ paths: ['/', '/skull-king'], at: 1 });
    expect($('.go-nav')).toBeNull();
    expect($('#app')?.hidden).toBe(false);
    expect($('.sk-home h1')?.textContent).toBe('Skull King');
    expect(document.title).toBe('Skull King · GameOn');
    await act(async () => {
      places.back();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect($('#gameon h1')?.textContent).toBe('Game night, switched on.');
    expect($('#app')?.hidden).toBe(true);
    // Still nobody: playing offline takes no session either.
    expect((await session()).status).toBe(401);
  });

  it('leaves a modified click to the browser: a link can be opened in a new tab', async () => {
    await openAt('/');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true });
    act(() => {
      link('Browse the games').dispatchEvent(click);
    });
    expect(click.defaultPrevented).toBe(false);
    expect(places.path()).toBe('/');
  });

  it('filters the shelf by the kind of game', async () => {
    await openAt('/');
    expect(texts('.go-soon > b')).toEqual(['Hearts', 'Chess', 'Ludo', 'Four in a Row', 'Five Dice']);
    expect($('.go-pick')).not.toBeNull();
    await press('Dice');
    expect(button('Dice').getAttribute('aria-pressed')).toBe('true');
    expect(texts('.go-soon > b')).toEqual(['Five Dice']);
    expect($('.go-pick')).toBeNull();
    await press('Cards');
    expect(texts('.go-soon > b')).toEqual(['Hearts']);
    expect($('.go-pick')).not.toBeNull();
  });

  it('shows the three at the top of the ladder to a browser that has a session, as the server sent them', async () => {
    const guest = await aGuest(),
      season = (await config()).season;
    const entry = (rank: number, name: string, value: number, tier: string): LadderEntry => ({
      rank,
      user: { ...guest.user, id: `018f6b4a-6a2e-7c3a-8b1d-9e0f1a2b3c4${rank}`, name, tier },
      rating: { value, tier, provisional: false, games: 12 },
    });
    await openFrame(
      {
        'GET /me': () => ok({ ...guest, guest: false, username: 'anne_bonny' }),
        'GET /config': () => ok({ season }),
        'GET /ladder': () =>
          ok({
            season,
            entries: [
              entry(1, '<b>Mira</b>', 52.4, 'Skull King'),
              entry(2, 'Jonas', 49, 'Skull King'),
              entry(3, 'Teo', 47.5, 'Pirate Lord'),
              entry(4, 'Lou', 40, 'Captain'),
            ],
          }),
      },
      '/',
    );
    // A name is text, whatever is in it. The rating is rounded for the eye and the tier is not worked out here.
    expect(texts('.go-podium li > b')).toEqual(['<b>Mira</b>', 'Jonas', 'Teo']);
    expect(texts('.go-podium .pill')).toEqual(['Skull King', 'Skull King', 'Pirate Lord']);
    expect(texts('.go-step small')).toEqual(['Rating 52', 'Rating 49', 'Rating 48']);
    // An account has what ranked takes: the way in is the ranked page.
    expect(link('Find a ranked game').getAttribute('href')).toBe('/skull-king/ranked');
    expect($('.go-ranked-foot')?.textContent).not.toContain('free account');
    expect($('.go-chip')?.getAttribute('href')).toBe('/profile');
  });

  it('shows a visitor the podium too, and makes no guest to read it', async () => {
    const guest = await aGuest(),
      season = (await config()).season;
    let guests = 0;
    const entries = ['Mira', 'Jonas', 'Teo'].map((name, i): LadderEntry => ({
      rank: i + 1,
      user: { ...guest.user, id: `018f6b4a-6a2e-7c3a-8b1d-9e0f1a2b3c4${i}`, name, tier: 'Captain' },
      rating: { value: 40 - i, tier: 'Captain', provisional: false, games: 9 },
    }));
    await openFrame(
      {
        'GET /me': () => refused(401, 'UNAUTHENTICATED'),
        'POST /auth/guest': () => {
          guests++;
          return ok(guest);
        },
        'GET /config': () => ok({ season }),
        'GET /ladder': () => ok({ season, entries }),
      },
      '/',
    );
    expect(texts('.go-podium li > b')).toEqual(['Mira', 'Jonas', 'Teo']);
    expect(guests).toBe(0);
    // Still a visitor: ranked is offered with what it takes.
    expect(link('Sign in').getAttribute('href')).toBe('/sign-in');
    expect(link('Find a ranked game').getAttribute('href')).toBe('/sign-up');
  });

  it('has no podium while fewer than three are on the ladder, and no ranked block when there is no season', async () => {
    const guest = await aGuest(),
      season = (await config()).season;
    await openFrame(
      {
        'GET /me': () => ok(guest),
        'GET /config': () => ok({ season }),
        'GET /ladder': () => ok({ season, entries: [] }),
      },
      '/',
    );
    expect($('.go-ranked')).not.toBeNull();
    expect($('.go-podium')).toBeNull();
    closePage();
    await openFrame({ 'GET /me': () => ok(guest), 'GET /config': () => ok({ season: null }) }, '/');
    expect($('.go-ranked')).toBeNull();
  });
});

describe('Games', () => {
  it('makes a guest of a browser nobody knew, and says who they are', async () => {
    await openAt('/games');
    expect($('#gameon h1')?.textContent).toBe('Games');
    expect(document.title).toBe('GameOn · Games');
    const guest = await me();
    expect(guest.guest).toBe(true);
    expect($('.go-seat-who b')?.textContent).toBe(guest.user.name);
    expect($('.go-seat-who small')?.textContent).toBe('Playing as a guest');
    expect($('.go-seat > p')?.textContent).toBe('Ranked needs an account. Your name, colour and stats stay with you.');
    expect(link('Create an account').getAttribute('href')).toBe('/sign-up');
    expect(link('Sign in').getAttribute('href')).toBe('/sign-in');
    // No connection was made for any of it.
    expect($('#online')).toBeNull();
    expect($('.go-banner')).toBeNull();
  });

  it("offers Skull King's two choices, closed, as its home does, and no four ways beside them", async () => {
    await openAt('/games');
    expect(choices()).toEqual([
      { name: 'Solo', open: false },
      { name: 'Online', open: false },
    ]);
    expect(shown()).toEqual([]);
    expect($('.go-mode')).toBeNull();
    // What each choice holds is there for a screen reader to be told of, and not to be seen.
    expect($('#go-solo-ways')?.hidden).toBe(true);
    expect($('#go-online-ways')?.hidden).toBe(true);
    expect(link('Play').getAttribute('href')).toBe('/skull-king');
    await follow('Play');
    expect(places.entries()).toEqual({ paths: ['/games', '/skull-king'], at: 1 });
    expect($('.sk-home')).not.toBeNull();
    expect($('#app')?.hidden).toBe(false);
  });

  it('opens one choice at a time, each on its two ways and their addresses', async () => {
    await openAt('/games');
    await choose('Solo');
    expect(choices()).toEqual([
      { name: 'Solo', open: true },
      { name: 'Online', open: false },
    ]);
    expect(shown()).toEqual([
      ['Against bots', '/skull-king/solo'],
      ['One screen', '/skull-king/one-screen'],
    ]);
    // Opening the other closes this one.
    await choose('Online');
    expect(choices()).toEqual([
      { name: 'Solo', open: false },
      { name: 'Online', open: true },
    ]);
    expect(shown()).toEqual([
      ['Tables', '/skull-king/online'],
      ['Ranked', '/skull-king/ranked'],
    ]);
    // Pressing an open choice closes it. The address never moved.
    await choose('Online');
    expect(shown()).toEqual([]);
    expect(places.entries()).toEqual({ paths: ['/games'], at: 0 });
  });

  for (const [choice, name, at] of [
    ['Solo', 'Against bots', '/skull-king/solo'],
    ['Solo', 'One screen', '/skull-king/one-screen'],
    ['Online', 'Tables', '/skull-king/online'],
    ['Online', 'Ranked', '/skull-king/ranked'],
  ])
    it(`opens ${at} from ${name} under ${choice}, and Back is Games again`, async () => {
      await openAt('/games');
      await choose(choice);
      await clickOn(way(name));
      expect(places.entries()).toEqual({ paths: ['/games', at], at: 1 });
      expect($('.go-games')).toBeNull();
      await act(async () => {
        places.back();
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(places.path()).toBe('/games');
      expect($('#gameon h1')?.textContent).toBe('Games');
    });

  it('says so when no table is open, and offers to open one', async () => {
    await openAt('/games');
    expect($('.go-tables-head .pill')?.textContent).toBe('0');
    expect($('.go-tables-note p')?.textContent).toBe('No open tables right now. Open one and others can sit down.');
    expect(link('Create a table').getAttribute('href')).toBe('/skull-king/online/public/new');
  });

  it('lists the public tables that have room, and sits down at one through the public list', async () => {
    const open = await someone(),
      full = await someone(),
      hidden = await someone();
    await open.browser.rest('PATCH', '/me', { name: '<i>Mary</i>', color: '#ce82ff' });
    open.socket.send({ t: 'lobby.create', visibility: 'public', settings: SETTINGS });
    full.socket.send({ t: 'lobby.create', visibility: 'public', settings: { ...SETTINGS, maxPlayers: 2 } });
    hidden.socket.send({ t: 'lobby.create', visibility: 'private', settings: SETTINGS });
    await settle();
    full.socket.send({ t: 'lobby.addBot' });
    await settle();

    await openAt('/games');
    expect($('.go-tables-head .pill')?.textContent).toBe('1');
    expect(texts('.go-table-text b')).toEqual(['<i>Mary</i>’s table']);
    expect(texts('.go-table-text small')).toEqual(['1 of 3 seats · Swift-n-Salty']);
    // The avatar is the host's own colour, as the server sent it.
    expect($('.go-tables li .avatar')?.className).toBe('avatar');
    expect($('.go-tables li .avatar')?.style.background).toBe('rgb(206, 130, 255)');
    expect(link('All public tables').getAttribute('href')).toBe('/skull-king/online/public');
    expect(link('Join with a code').getAttribute('href')).toBe('/skull-king/online/join');

    // Games has no connection. The public list makes one and asks for the seat.
    await press('Join');
    expect(places.entries()).toEqual({ paths: ['/games', '/skull-king/online/public'], at: 1 });
    await settle();
    // The frame's page is gone: what is up is the table, in the online screens.
    expect($('.go-tables')).toBeNull();
    expect($('#online h1, #online h2')?.textContent).toBe('Public table');
    const members = framesOf(open.socket, 'lobby.state').at(-1)?.lobby.members ?? [];
    expect(members).toHaveLength(2);
    // Asked once: the page that mounts twice in development did not ask twice.
    expect($('#online [role="alert"]')).toBeNull();
  });

  it('says why at the public list when the table filled up in the meantime', async () => {
    const open = await someone();
    open.socket.send({ t: 'lobby.create', visibility: 'public', settings: { ...SETTINGS, maxPlayers: 2 } });
    await settle();
    await openAt('/games');
    open.socket.send({ t: 'lobby.addBot' });
    await settle();
    await press('Join');
    await settle();
    expect($('#online h1, #online h2')?.textContent).toBe('Public tables');
    expect($('#online [role="alert"]')?.textContent).toBe('That table is full.');
  });

  it('says the tables could not be loaded, and reads them again when asked', async () => {
    const guest = await aGuest();
    let broken = true;
    await openFrame(
      {
        'POST /auth/guest': () => ok(guest),
        'GET /lobbies': () =>
          broken
            ? refused(500, 'INTERNAL')
            : ok({ lobbies: [{ id: 'lobby-1', hostName: 'Teo', settings: SETTINGS, players: 2 }] }),
      },
      '/games',
    );
    expect($('.go-tables [role="alert"]')?.textContent).toBe('The tables could not be loaded.');
    broken = false;
    await press('Try again');
    await settle();
    // This row came without a host's colour, as a table nobody hosts does: the name the server gave
    // it is the whole title, the avatar is plain, and no colour is made up for it.
    expect(texts('.go-table-text b')).toEqual(['Teo']);
    expect(texts('.go-table-text small')).toEqual(['2 of 3 seats · Swift-n-Salty']);
    expect($('.go-tables li .avatar')?.className).toBe('avatar plain');
    expect($('.go-tables li .avatar')?.getAttribute('style')).toBeNull();
  });

  it("lists the server's own open tables, which nobody hosts yet, next to a player's", async () => {
    const guest = await aGuest();
    const house = { id: 'house-1', hostName: 'Open table', settings: { ...SETTINGS, maxPlayers: 4 }, players: 0 };
    await openFrame(
      {
        'POST /auth/guest': () => ok(guest),
        'GET /lobbies': () =>
          ok({
            lobbies: [
              house,
              { ...house, id: 'house-2' },
              { id: 'lobby-1', hostName: 'Mira', hostColor: '#ce82ff', settings: SETTINGS, players: 1 },
            ],
          }),
      },
      '/games',
    );
    expect($('.go-tables-head .pill')?.textContent).toBe('3');
    expect(texts('.go-table-text b')).toEqual(['Open table', 'Open table', 'Mira’s table']);
    expect(texts('.go-table-text small')).toEqual([
      '0 of 4 seats · Swift-n-Salty',
      '0 of 4 seats · Swift-n-Salty',
      '1 of 3 seats · Swift-n-Salty',
    ]);
    expect(Array.from(document.querySelectorAll('.go-tables li .avatar'), (a) => a.className)).toEqual([
      'avatar plain',
      'avatar plain',
      'avatar',
    ]);
    // Each can be sat down at.
    expect(document.querySelectorAll('.go-tables li button')).toHaveLength(3);
  });

  it('filters the shelf, and counts what is coming', async () => {
    await openAt('/games');
    expect($('#go-sk-title')).not.toBeNull();
    expect($('#go-soon-title .pill')?.textContent).toBe('5');
    await press('Board');
    expect($('#go-sk-title')).toBeNull();
    expect(texts('.go-soon > b')).toEqual(['Chess', 'Ludo', 'Four in a Row']);
    expect($('#go-soon-title .pill')?.textContent).toBe('3');
    await press('All');
    expect($('#go-sk-title')).not.toBeNull();
  });

  it('offers the game saved on this device, and continues it at the table', async () => {
    // A solo game against bots, left after the first bid: that is when it is saved.
    await openAt('/skull-king');
    await clickOn($('#gameon a[href="/skull-king/one-screen"]') ?? host);
    await clickOn($('[data-act="start"]') ?? host);
    await settle(3000);
    const round = $('#app .g-top')?.textContent;
    closePage();

    await openAt('/games');
    expect($('.go-jump-text b')?.textContent).toMatch(/^Skull King · solo against \d bots?$/);
    expect($('.go-jump-text span')?.textContent).toMatch(/^Round 1 of \d+ · saved on this device$/);
    expect(link('Continue').getAttribute('href')).toBe('/skull-king/table');
    await follow('Continue');
    expect(places.path()).toBe('/skull-king/table');
    expect($('#gameon')).toBeNull();
    expect($('#app .game')).not.toBeNull();
    expect($('#app .g-top')?.textContent).toBe(round);
  });

  it('has no way back to offer when nothing is open', async () => {
    await openAt('/games');
    expect($('.go-jump')).toBeNull();
  });

  it('offers the seat the server keeps before the game on this device', async () => {
    const guest = await aGuest();
    localStorage.setItem('skullking-tavern.game.v2', 'not a game');
    await openFrame(
      {
        'POST /auth/guest': () => ok({ ...guest, active: { kind: 'game', id: 'game-1', table: 'friends' } }),
        'GET /lobbies': () => ok({ lobbies: [] }),
      },
      '/games',
    );
    expect($('.go-jump-text b')?.textContent).toBe('Skull King · your table');
    expect($('.go-jump-text span')?.textContent).toBe('Game running · your seat is kept');
    expect(link('Rejoin').getAttribute('href')).toBe('/skull-king/online');
    closePage();
    await openFrame(
      {
        'POST /auth/guest': () => ok({ ...guest, active: { kind: 'lobby', id: 'lobby-1' } }),
        'GET /lobbies': () => ok({ lobbies: [] }),
      },
      '/games',
    );
    expect($('.go-jump-text span')?.textContent).toBe('Waiting to start · your seat is kept');
    expect(link('Rejoin').getAttribute('href')).toBe('/skull-king/online');
  });

  it('shows an account its rating as the server sent it, and says when there is none yet', async () => {
    const guest = await aGuest(),
      season = (await config()).season,
      anne: Me = { ...guest, guest: false, username: 'anne_bonny', user: { ...guest.user, name: 'Anne' } };
    await openFrame(
      {
        'POST /auth/guest': () =>
          ok({ ...anne, rating: { value: 34.4, tier: 'Captain', provisional: false, games: 23 } }),
        'GET /config': () => ok({ season }),
        'GET /lobbies': () => ok({ lobbies: [] }),
      },
      '/games',
    );
    expect($('.go-seat-who b')?.textContent).toBe('Anne');
    expect($('.go-seat-who small')?.textContent).toBe('anne_bonny');
    expect($('.go-seat-label .pill')?.textContent).toBe(season?.name);
    expect(texts('.go-seat-stats dt')).toEqual(['Rating', 'Tier', 'Games']);
    expect(texts('.go-seat-stats dd')).toEqual(['34', 'Captain', '23']);
    expect(link('Find a ranked game').getAttribute('href')).toBe('/skull-king/ranked');
    // The bar has the player where a guest has "Sign in".
    expect($('.go-chip')?.getAttribute('aria-label')).toBe('Anne, your profile');
    expect($('.go-chip-text small')?.textContent).toBe('Captain');
    expect(Array.from(document.querySelectorAll('#gameon a'), (a) => a.textContent)).not.toContain('Sign in');
    closePage();

    await openFrame({ 'POST /auth/guest': () => ok(anne), 'GET /lobbies': () => ok({ lobbies: [] }) }, '/games');
    expect($('.go-seat > p')?.textContent).toBe('No rating yet. Five placement games set your tier.');
    expect($('.go-seat-stats')).toBeNull();
    expect($('.go-chip-text small')?.textContent).toBe('anne_bonny');
    expect(link('Find a ranked game').getAttribute('href')).toBe('/skull-king/ranked');
  });

  it('says it is not connected when the server cannot be asked, and asks again by itself', async () => {
    const guest = await aGuest();
    let down = true;
    await openFrame(
      {
        'POST /auth/guest': () => (down ? Promise.reject(new Error('No network')) : ok(guest)),
        'GET /lobbies': () => ok({ lobbies: [] }),
      },
      '/games',
    );
    expect($('.go-banner')?.textContent).toBe('Not connected. Trying again…');
    expect($('.go-banner')?.getAttribute('role')).toBe('status');
    expect($('.go-seat')).toBeNull();
    expect($('.go-tables')).toBeNull();
    // What needs no server is there all the same.
    expect($('#go-sk-title')).not.toBeNull();

    down = false;
    await settle(RETRY_MS);
    expect($('.go-banner')).toBeNull();
    expect($('.go-seat-who b')?.textContent).toBe(guest.user.name);
    expect($('.go-tables')).not.toBeNull();
  });
});

describe('signing up', () => {
  it('makes an account of a browser nobody knew, and names it after its username', async () => {
    await openAt('/sign-up');
    expect($('#gameon h1')?.textContent).toBe('Create your account');
    expect($('.go-keep')?.textContent).toBe(
      'Keep your password safeThere is no email and no reset. A forgotten password cannot be recovered.',
    );
    // There is a username and a password, twice. No email, and no name.
    expect(Array.from(document.querySelectorAll('#gameon input'), (i) => i.getAttribute('type'))).toEqual([
      'text',
      'password',
      'password',
    ]);
    expect(button('Create account').disabled).toBe(true);
    expect(link('Sign in').getAttribute('href')).toBe('/sign-in');
    expect(link('Continue as a guest').getAttribute('href')).toBe('/games');
    // Reading the form makes nobody.
    expect((await session()).status).toBe(401);

    await signUp('Anne_Bonny', 'three sheets');
    await settle();
    const now = await me();
    expect(now).toMatchObject({ guest: false, username: 'Anne_Bonny' });
    expect(now.user.name).toBe('Anne_Bonny');
    // Games takes the form's place: Back does not return to a form that is done.
    expect(places.entries()).toEqual({ paths: ['/games'], at: 0 });
    expect($('#gameon h1')?.textContent).toBe('Games');
    expect($('.go-chip')?.getAttribute('aria-label')).toBe('Anne_Bonny, your profile');
  });

  it('keeps the user id, the name and the colour of a guest who was already playing', async () => {
    await page.rest('POST', '/auth/guest');
    await page.rest('PATCH', '/me', { name: 'Calico Jack', color: '#ce82ff' });
    const guest = await me();
    await openAt('/sign-up');
    await signUp('calico', 'three sheets');
    await settle();
    const now = await me();
    expect(now).toMatchObject({ guest: false, username: 'calico' });
    expect(now.user).toEqual(guest.user);
    expect(now.user.name).toBe('Calico Jack');
  });

  it('says so under the field when the username is taken or has the wrong shape, and when the passwords differ', async () => {
    await existingAccount('anne_bonny', 'three sheets', 'Anne');
    await openAt('/sign-up');

    await signUp('ANNE_BONNY', 'secret');
    expect($('#signup-username-help')?.textContent).toBe('That username is taken. Try another.');
    expect($('#signup-username')?.getAttribute('aria-invalid')).toBe('true');
    expect($('#gameon h1')?.textContent).toBe('Create your account');

    // Typing again takes the error away.
    await type('#signup-username', 'a b');
    expect($('#signup-username-help')?.textContent).toBe(
      '3 to 16 letters, digits or underscores. You sign in with it.',
    );
    await submit();
    expect($('#signup-username-help')?.textContent).toBe(
      "That username can't be used. Use 3 to 16 letters, digits or underscores.",
    );

    await signUp('calico', 'secret', 'secrex');
    expect($('#signup-repeat-help')?.textContent).toBe('The two passwords are not the same.');
    expect($('#signup-repeat')?.getAttribute('aria-invalid')).toBe('true');
    // The guest the first try made is still a guest, and the next try that goes through is named.
    expect((await me()).guest).toBe(true);
    await signUp('calico', 'secret');
    await settle();
    expect((await me()).user.name).toBe('calico');
  });

  it('never keeps the password or a token where the page could read it back', async () => {
    await openAt('/sign-up');
    await signUp('calico', 'a very secret password');
    await settle();
    expect((await me()).username).toBe('calico');
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain('secret');
    expect(sessionStorage).toHaveLength(0);
    expect(location.href).not.toContain('secret');
    expect(places.entries().paths.join(' ')).not.toContain('secret');
    expect(document.cookie).toBe('');
    expect(document.body.innerHTML).not.toContain('a very secret password');
  });

  it('has nothing to offer somebody who has an account: Games takes its place', async () => {
    await page.rest('POST', '/auth/guest');
    await page.rest('POST', '/auth/register', { username: 'calico', password: 'secret' });
    await openAt('/sign-up');
    expect(places.entries()).toEqual({ paths: ['/games'], at: 0 });
    expect($('#gameon h1')?.textContent).toBe('Games');
  });

  it('says it is not connected and takes nothing while the server cannot be asked', async () => {
    await openFrame({ 'GET /me': () => Promise.reject(new Error('No network')) }, '/sign-up');
    await type('#signup-username', 'calico');
    await type('#signup-password', 'secret');
    await type('#signup-repeat', 'secret');
    expect($('.go-send [role="status"]')?.textContent).toBe('Not connected. Trying again…');
    expect(button('Create account').disabled).toBe(true);
  });
});

describe('signing in', () => {
  it('refuses a wrong password and stays nobody; the right one makes this browser that account', async () => {
    const anne = await existingAccount('anne_bonny', 'three sheets', 'Anne');
    await openAt('/sign-in');
    expect($('#gameon h1')?.textContent).toBe('Welcome back');
    expect(link('Create account').getAttribute('href')).toBe('/sign-up');
    expect(texts('.go-form-note')).toEqual([
      'Forgot your password? There is no email and no reset, so it cannot be recovered.',
    ]);
    expect(button('Sign in').disabled).toBe(true);

    await type('#signin-username', 'anne_bonny');
    await type('#signin-password', 'two sheets');
    await submit();
    expect($('.go-send [role="alert"]')?.textContent).toBe('Wrong username or password.');
    expect((await session()).status).toBe(401);
    expect(button('Sign in').disabled).toBe(false);

    await type('#signin-password', 'three sheets');
    expect($('.go-send [role="alert"]')).toBeNull();
    await submit();
    await settle();
    expect((await me()).user.id).toBe(anne.user.id);
    expect(places.entries()).toEqual({ paths: ['/games'], at: 0 });
    expect($('.go-seat-who b')?.textContent).toBe('Anne');
    expect($('.go-seat-who small')?.textContent).toBe('anne_bonny');
    // Signing in made no connection: the frame has none to make again.
    expect($('#online')).toBeNull();
  });

  it('tells a guest who has played that those games stay behind', async () => {
    const guest = await aGuest();
    await openFrame({ 'GET /me': () => ok({ ...guest, stats: { ...guest.stats, games: 3 } }) }, '/sign-in');
    expect(texts('.go-form-note')).toEqual([
      'Signing in switches to that account. This guest and its games are left behind.',
      'Forgot your password? There is no email and no reset, so it cannot be recovered.',
    ]);
  });

  it('says so above the button when the server says to slow down', async () => {
    await openFrame(
      { 'GET /me': () => refused(401, 'UNAUTHENTICATED'), 'POST /auth/login': () => refused(429, 'RATE_LIMITED') },
      '/sign-in',
    );
    await type('#signin-username', 'anne_bonny');
    await type('#signin-password', 'three sheets');
    await submit();
    expect($('.go-send [role="alert"]')?.textContent).toBe('Too fast. Wait a moment and try again.');
  });
});
