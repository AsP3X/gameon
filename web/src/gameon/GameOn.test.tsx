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
import { OchoClient } from '../ocho/client';
import { aLobby, fakeOcho } from '../ocho/fake';
import type { FakeOcho } from '../ocho/fake';
import type { GameSettings, LadderEntry, LobbySummary, Me, ServerConfig } from '../protocol/generated';
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
/** Ocho's server, as the page reaches it: nothing answers until a test pushes a frame. */
let ochoServer: FakeOcho;

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
/** A phone: the window is narrower than the wide layout, and Games' sheets are used. */
function phone(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: !query.includes('min-width'), media: query }));
}
/** Open one of the sheets of a phone's Games by its button in the bar, and give back the dialog. */
async function sheet(label: 'Tables' | 'You' | 'Look for open games'): Promise<HTMLDialogElement> {
  await press(label);
  const dialog = document.querySelector<HTMLDialogElement>('dialog.go-sheet');
  if (!dialog?.open) throw new Error(`The ${label} sheet did not open`);
  return dialog;
}
/** Answer the page's last `ocho.tables` with these rows, before its `ok`, as Ocho's server does. */
async function ochoLists(tables: unknown[]): Promise<void> {
  const asked = ochoServer.sent.filter((frame) => frame.t === 'ocho.tables').at(-1);
  if (!asked) throw new Error('The page did not ask Ocho for its tables');
  await act(async () => {
    ochoServer.push({ t: 'ocho.tables', tables });
    ochoServer.push({ t: 'ok', re: asked.id });
    await vi.advanceTimersByTimeAsync(0);
  });
}
/**
 * Open the open games, by the button a wide window has or by the phone bar's Tables, and give back
 * the dialog. Ocho lists `ocho` unless it is null: then it has not answered.
 */
async function openGames(ocho: unknown[] | null = []): Promise<HTMLDialogElement> {
  const wide = matchMedia('(min-width: 1000px)').matches;
  const dialog = await sheet(wide ? 'Look for open games' : 'Tables');
  await settle();
  if (ocho) await ochoLists(ocho);
  return dialog;
}
/** What each row of the open games says: what it plays, its title, and its two lines. */
const rowsOf = (within: ParentNode): (string | null)[][] =>
  Array.from(within.querySelectorAll('.go-tables li'), (row) =>
    Array.from(row.querySelectorAll('.pill, b, small'), (c) => c.textContent),
  );
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
        <App backend={page} places={places} ochoSocket={ochoServer.transport} />
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
function Frame({ online, ocho, at }: { online: Online; ocho: OchoClient; at: string }) {
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
      ocho={ocho}
    />
  );
}
async function openFrame(answers: Answers, at: string): Promise<void> {
  root = createRoot(host);
  await act(async () => {
    root?.render(<Frame online={cannedOnline(answers)} ocho={new OchoClient(ochoServer.transport)} at={at} />);
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
  // jsdom has the dialog element without its modal methods: these do what a browser does that the page relies on.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
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
  ochoServer = fakeOcho();
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
    expect(link('Play Ocho').getAttribute('href')).toBe('/games/ocho');
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

  it('opens on two doors, Skull King then Ocho, each with its own Play', async () => {
    await openAt('/');
    const doors = Array.from(document.querySelectorAll<HTMLElement>('.go-hero .go-door'));
    expect(doors.map((door) => door.querySelector('h2')?.textContent)).toEqual(['Skull King', 'Ocho']);
    expect(doors.map((door) => door.querySelector('p')?.textContent)).toEqual([
      'The pirate trick-taking game',
      'Match the colour or the number',
    ]);
    expect(doors.map((door) => door.querySelector('a')?.textContent)).toEqual(['Play Skull King', 'Play Ocho']);
    expect(doors.map((door) => door.querySelector('a')?.getAttribute('href'))).toEqual(['/skull-king', '/games/ocho']);
    // Both hands are drawn, and neither is read out: the line beside it says what the game is.
    expect(doors.every((door) => door.querySelector('.go-door-art > [aria-hidden="true"]'))).toBe(true);
    expect(texts('.go-hero .go-facts li')).toEqual(['Free to play', 'No download', 'No account needed']);
    // Nothing moves on by itself and nothing is featured over the other.
    expect($('.go-hero [aria-roledescription]')).toBeNull();
    expect($('.go-hero .pill')).toBeNull();

    await follow('Play Ocho');
    expect(places.path()).toBe('/games/ocho');
  });

  it('leaves a modified click to the browser: a link can be opened in a new tab', async () => {
    await openAt('/');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true });
    act(() => {
      link('Play Ocho').dispatchEvent(click);
    });
    expect(click.defaultPrevented).toBe(false);
    expect(places.path()).toBe('/');
  });

  it('reads the ways to sit down, the season, what is coming and the last word, in that order on a wide window', async () => {
    await openAt('/');
    expect(Array.from(document.querySelectorAll('#gameon main > section'), (s) => s.className)).toEqual([
      'go-hero',
      'go-ways',
      'go-ranked',
      'go-shelf',
      'go-cta wide-only',
    ]);
    // No kickers over the headings.
    expect($('.go-ways .go-eyebrow, .go-ranked .go-eyebrow, .go-shelf .go-eyebrow')).toBeNull();
    expect($('#go-shelf-title .wide-only')?.textContent).toBe('Coming soon');
    // Every announced game and the way to ask for one: no filters and no featured game.
    expect(texts('.go-soon > b')).toEqual(['Hearts', 'Chess', 'Ludo', 'Four in a Row', 'Five Dice']);
    expect($('.go-suggest')).not.toBeNull();
    expect($('.go-shelves')).toBeNull();
    expect($('.go-pick')).toBeNull();
    // The season's words on the left, the tiers on the right.
    expect($('.go-ranked-copy .go-ranked-text')).not.toBeNull();
    expect($('.go-standings .go-tiers')?.getAttribute('aria-label')).toBe('Seven tiers');
    expect($('#go-cta-title')?.textContent).toBe('Pull up a chair.');
  });

  it('reads the season before the ways to play on a phone, as it did', async () => {
    phone();
    await openAt('/');
    expect(Array.from(document.querySelectorAll('#gameon main > section'), (s) => s.className)).toEqual([
      'go-hero',
      'go-ranked',
      'go-ways',
      'go-shelf',
      'go-cta wide-only',
    ]);
    expect($('.go-ranked .go-eyebrow')?.textContent).toBe('Ranked');
    expect(link('See the ladder').getAttribute('href')).toBe('/ladder');
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
    expect($('.go-ranked-foot')).toBeNull();
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
  /** A table the server keeps open, which nobody hosts yet: no colour, nobody seated. */
  const house = (format: GameSettings['format']): LobbySummary => ({
    id: `house-${format}`,
    hostName: 'Open table',
    settings: { ...STANDARD, format },
    players: 0,
  });
  const mira: LobbySummary = { id: 'lobby-1', hostName: 'Mira', hostColor: '#ce82ff', settings: SETTINGS, players: 1 };
  const MIRA = ['Swift', 'Mira’s table', '5 rounds · 5 cards each', '1 of 3 seats'];
  /** Anne's public Ocho table, as `ocho.tables` lists it, and its row. */
  const anneOcho = { id: 'o1', hostName: 'Anne', players: 4, seated: 1, teams: false, match: 'one' };
  const ANNE_OCHO = ['Ocho', 'Anne’s table', 'Free-for-all · One hand', '1 of 4 seats'];
  const listing = async (lobbies: LobbySummary[]): Promise<void> => {
    const guest = await aGuest();
    await openFrame({ 'POST /auth/guest': () => ok(guest), 'GET /lobbies': () => ok({ lobbies }) }, '/games');
  };

  it('makes a guest of a browser nobody knew, and says who they are', async () => {
    phone();
    await openAt('/games');
    expect($('#gameon h1')?.textContent).toBe('Games');
    expect(document.title).toBe('GameOn · Games');
    const guest = await me();
    expect(guest.guest).toBe(true);
    // A guest has no account in the nav: the way to sign in is in its place.
    expect($('.go-chip')).toBeNull();
    expect(link('Sign in').getAttribute('href')).toBe('/sign-in');
    // Their seat is in the sheet the bar's "You" opens.
    await sheet('You');
    expect($('.go-seat-who b')?.textContent).toBe(guest.user.name);
    expect($('.go-seat-who small')?.textContent).toBe('Playing as a guest');
    expect($('.go-seat > p')?.textContent).toBe('Ranked needs an account. Your name, colour and stats stay with you.');
    expect(link('Create an account').getAttribute('href')).toBe('/sign-up');
    // No connection was made for any of it.
    expect($('#online')).toBeNull();
    expect($('.go-banner')).toBeNull();
  });

  it('lays the page out as a library: the heading and the shelf, the games, the way to the open games and the seat, and what is coming', async () => {
    await openAt('/games');
    const lib = $('.go-lib');
    // The heading is on the screen, and the shelf beside it, All picked.
    expect(lib?.querySelector('.go-lib-head h1')?.classList.contains('go-sr')).toBe(false);
    expect(texts('.go-lib-head .go-shelves button')).toEqual(['All', 'Cards', 'Board', 'Dice']);
    expect(button('All').getAttribute('aria-pressed')).toBe('true');
    expect(lib?.querySelectorAll('.go-lib-games > .go-lib-game')).toHaveLength(2);
    // The way to the open games and the seat are a wide window's. A phone has them in its bar.
    const find = lib?.querySelector('.go-lib-cols.wide-only .go-lib-find');
    expect(find?.querySelector('h2')?.textContent).toBe('Open games');
    expect(find?.querySelector('p')?.textContent).toBe('Skull King and Ocho, in one list.');
    expect(find?.querySelector('button')?.textContent).toBe('Look for open games');
    expect(lib?.querySelector('.go-lib-cols .go-lib-seat h2')?.textContent).toBe('Your seat');
    // The page lists no table, and no dialog is open.
    expect($('.go-tables, .go-tables li, dialog')).toBeNull();
    // What is coming is on both. No felt and no seat marks are left.
    expect(lib?.querySelector('.go-coming')?.closest('.wide-only')).toBeNull();
    expect($('.go-floor, .go-felt-table, .go-seat-mark')).toBeNull();
    // The bar is a phone's, with no Play in it. The footer is a wide window's.
    expect(texts('.go-lib-bar.narrow-only button')).toEqual(['Tables', 'You']);
    expect($('.go-foot')?.classList.contains('wide-only')).toBe(true);
    // Ocho's socket waits for the dialog.
    expect(ochoServer.opened).toBe(0);
  });

  it('starts either live game from its row, and Back is Games again', async () => {
    await openAt('/games');
    const games = Array.from(document.querySelectorAll<HTMLElement>('.go-lib-game'));
    expect(games.map((game) => game.querySelector('h2')?.textContent)).toEqual(['Skull King', 'Ocho']);
    expect(games.map((game) => game.querySelector('.go-lib-text p')?.textContent)).toEqual([
      'The pirate trick-taking game',
      'Match the colour or the number',
    ]);
    expect(
      games.map((game) => Array.from(game.querySelectorAll('a'), (a) => [a.textContent, a.getAttribute('href')])),
    ).toEqual([
      [
        ['How to play', '/how-to-play'],
        ['Play Skull King', '/skull-king'],
      ],
      [
        ['How to play', '/games/ocho/how-to-play'],
        ['Play Ocho', '/games/ocho'],
      ],
    ]);
    // Each row is named by its game, and its art is not read out.
    expect(games.map((game) => game.getAttribute('aria-labelledby'))).toEqual(['go-sk-title', 'go-ocho-title']);
    expect(games.every((game) => game.querySelector('.go-lib-art > [aria-hidden="true"]'))).toBe(true);
    // Nothing to go back to: no game is made up for the band.
    expect($('.go-jump')).toBeNull();

    await follow('Play Skull King');
    expect(places.entries()).toEqual({ paths: ['/games', '/skull-king'], at: 1 });
    expect($('.sk-home')).not.toBeNull();
    expect($('#app')?.hidden).toBe(false);
    await act(async () => {
      places.back();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(places.path()).toBe('/games');
    expect($('#gameon h1')?.textContent).toBe('Games');
  });

  it('says so when no table is open, and offers to open one of either game', async () => {
    await openAt('/games');
    const dialog = await openGames();
    expect(dialog.querySelector('.go-tables-head .pill')?.textContent).toBe('0');
    expect(dialog.querySelector('.go-tables-note p')?.textContent).toBe(
      'No open tables right now. Open one and others can sit down.',
    );
    expect(dialog.querySelector('.go-tables li')).toBeNull();
    expect(link('Open a Skull King table').getAttribute('href')).toBe('/skull-king/online/public/new');
    expect(button('Open an Ocho table').disabled).toBe(false);
  });

  it('lists the public tables that have room, and sits down at one through the public list', async () => {
    phone();
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
    // The page lists nothing. The phone bar's Tables opens the dialog.
    expect($('.go-tables')).toBeNull();
    const dialog = await openGames();
    expect(dialog.querySelector('.go-sheet-head h2')?.textContent).toBe('Open games');
    expect(dialog.querySelector('.go-tables-head .pill')?.textContent).toBe('1');
    // What the table plays leads the row, by its short name, then its title, its rounds and its seats.
    expect(rowsOf(dialog)).toEqual([['Swift', '<i>Mary</i>’s table', '5 rounds · 5 cards each', '1 of 3 seats']]);
    // The avatar is the host's own colour, as the server sent it.
    expect(dialog.querySelector<HTMLElement>('.go-tables li .avatar')?.className).toBe('avatar');
    expect(dialog.querySelector<HTMLElement>('.go-tables li .avatar')?.style.background).toBe('rgb(206, 130, 255)');
    // A code, and the way to open a table. The whole public list is not linked from Games.
    expect(Array.from(dialog.querySelectorAll('a'), (a) => a.getAttribute('href'))).toEqual([
      '/skull-king/online/join',
      '/skull-king/online/public/new',
    ]);
    expect($('#gameon a[href="/skull-king/online/public"]')).toBeNull();

    // Games has no connection. The public list makes one and asks for the seat.
    await clickOn(dialog.querySelector<HTMLButtonElement>('.go-tables li button') ?? host);
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
    await openGames();
    open.socket.send({ t: 'lobby.addBot' });
    await settle();
    await press('Join');
    await settle();
    expect($('#online h1, #online h2')?.textContent).toBe('Public tables');
    expect($('#online [role="alert"]')?.textContent).toBe('That table is full.');
  });

  it("says Skull King's tables could not be loaded, keeps Ocho's, and reads Skull King's again when asked", async () => {
    phone();
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
    const dialog = await openGames([anneOcho]);
    expect(dialog.querySelector('.go-tables [role="alert"]')?.textContent).toBe(
      'Skull King’s tables could not be loaded.',
    );
    expect(rowsOf(dialog)).toEqual([ANNE_OCHO]);
    const asked = ochoServer.sent.length;
    broken = false;
    await press('Try again');
    await settle();
    // Only Skull King's list is read again.
    expect(ochoServer.sent).toHaveLength(asked);
    expect(dialog.querySelector('[role="alert"]')).toBeNull();
    expect(rowsOf(dialog)).toEqual([['Swift', 'Teo', '5 rounds · 5 cards each', '2 of 3 seats'], ANNE_OCHO]);
    // This row came without a host's colour, as a table nobody hosts does: the name the server gave
    // it is the whole title, the avatar is plain, and no colour is made up for it.
    expect(dialog.querySelector('.go-tables li .avatar')?.className).toBe('avatar plain');
    expect(dialog.querySelector('.go-tables li .avatar')?.getAttribute('style')).toBeNull();
  });

  it("says Ocho's tables could not be loaded, keeps Skull King's, and asks Ocho again when asked", async () => {
    await listing([mira]);
    const dialog = await openGames(null);
    // Ocho has not answered: the rows in hand are there, and the dialog says it is still looking.
    expect(rowsOf(dialog)).toEqual([MIRA]);
    expect(dialog.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe('Looking for open games');
    expect(dialog.querySelector('.go-tables-head .pill')).toBeNull();
    await act(async () => {
      ochoServer.err('INTERNAL', 'Something went wrong.');
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(dialog.querySelector('[role="status"]')).toBeNull();
    expect(dialog.querySelector('[role="alert"]')?.textContent).toBe('Ocho’s tables could not be loaded.');
    expect(rowsOf(dialog)).toEqual([MIRA]);
    expect(dialog.querySelector('.go-tables-head .pill')?.textContent).toBe('1');
    await press('Try again');
    expect(ochoServer.sent.filter((frame) => frame.t === 'ocho.tables')).toHaveLength(2);
    await ochoLists([anneOcho]);
    expect(dialog.querySelector('[role="alert"]')).toBeNull();
    expect(rowsOf(dialog)).toEqual([MIRA, ANNE_OCHO]);

    // A socket that drops is a list that failed too, and Skull King's rows stay.
    await act(async () => {
      ochoServer.drop();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(dialog.querySelector('[role="alert"]')?.textContent).toBe('Ocho’s tables could not be loaded.');
    expect(rowsOf(dialog)[0]).toEqual(MIRA);
    // Try again does not wait out the socket's backoff: it connects now, and asks once it is up.
    await press('Try again');
    await settle();
    expect(ochoServer.opened).toBe(2);
    await ochoLists([]);
    expect(dialog.querySelector('[role="alert"]')).toBeNull();
    expect(rowsOf(dialog)).toEqual([MIRA]);
  });

  it('says the tables could not be loaded when neither game answers, and asks both again', async () => {
    const guest = await aGuest();
    let broken = true;
    await openFrame(
      {
        'POST /auth/guest': () => ok(guest),
        'GET /lobbies': () => (broken ? refused(500, 'INTERNAL') : ok({ lobbies: [mira] })),
      },
      '/games',
    );
    const dialog = await openGames(null);
    await act(async () => {
      ochoServer.err('INTERNAL', 'Something went wrong.');
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(texts('dialog [role="alert"]')).toEqual(['The tables could not be loaded.']);
    broken = false;
    await press('Try again');
    await settle();
    expect(ochoServer.sent.filter((frame) => frame.t === 'ocho.tables')).toHaveLength(2);
    await ochoLists([anneOcho]);
    expect(dialog.querySelector('[role="alert"]')).toBeNull();
    expect(rowsOf(dialog)).toEqual([MIRA, ANNE_OCHO]);
  });

  it("lists the server's own open tables, one for each length of game, and a player's as one more", async () => {
    phone();
    await listing([house('classic'), house('brawl'), house('swift'), house('even'), house('whirl'), mira]);
    const dialog = await openGames();
    expect(dialog.querySelector('.go-tables-head .pill')?.textContent).toBe('6');
    expect(rowsOf(dialog)).toEqual([
      ['Classic', 'Open table', '10 rounds · 1 to 10 cards', '0 of 4 seats'],
      ['Brawl', 'Open table', '5 rounds · 6 to 10 cards', '0 of 4 seats'],
      ['Swift', 'Open table', '5 rounds · 5 cards each', '0 of 4 seats'],
      ['Even', 'Open table', '10 rounds · 2, 4, 6, 8, 10 twice', '0 of 4 seats'],
      ['Whirl', 'Open table', '10 rounds · 9, 7, 5, 3, 1 twice', '0 of 4 seats'],
      MIRA,
    ]);
    // Each can be sat down at, and Join is told apart by what the table plays: five rows have the same title.
    expect(
      Array.from(dialog.querySelectorAll('.go-tables li button'), (join) =>
        (join.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent),
      ),
    ).toEqual([
      ['Classic', 'Open table'],
      ['Brawl', 'Open table'],
      ['Swift', 'Open table'],
      ['Even', 'Open table'],
      ['Whirl', 'Open table'],
      ['Swift', 'Mira’s table'],
    ]);
    // A table nobody hosts has the plain avatar: no colour is made up for it.
    expect(Array.from(dialog.querySelectorAll('.go-tables li .avatar'), (a) => a.className)).toEqual([
      'avatar plain',
      'avatar plain',
      'avatar plain',
      'avatar plain',
      'avatar plain',
      'avatar',
    ]);
  });

  it('lists every table that has a seat, in the order the server sent them, however long the list', async () => {
    const hosted = (n: number, format: GameSettings['format']): LobbySummary => ({
      id: `lobby-${n}`,
      hostName: `Pirate ${n}`,
      hostColor: '#58cc02',
      settings: { ...STANDARD, format },
      players: 1,
    });
    // Classic filled up and was opened again at the end of the list, behind six tables of players. Somebody sat down at Even.
    await listing([
      house('brawl'),
      house('swift'),
      { ...house('even'), hostName: 'Anne', hostColor: '#ff4b4b', players: 1 },
      house('whirl'),
      hosted(1, 'swift'),
      hosted(2, 'swift'),
      hosted(3, 'brawl'),
      hosted(4, 'whirl'),
      hosted(5, 'even'),
      hosted(6, 'brawl'),
      house('classic'),
      { ...house('swift'), id: 'house-full', players: 4 },
    ]);
    const dialog = await openGames();
    // The full one is not a row, and is not counted. None of the others is left out.
    expect(dialog.querySelector('.go-tables-head .pill')?.textContent).toBe('11');
    expect(
      Array.from(dialog.querySelectorAll('.go-table-text'), (row) =>
        Array.from(row.querySelectorAll('.pill, b'), (c) => c.textContent),
      ),
    ).toEqual([
      ['Brawl', 'Open table'],
      ['Swift', 'Open table'],
      ['Even', 'Anne’s table'],
      ['Whirl', 'Open table'],
      ['Swift', 'Pirate 1’s table'],
      ['Swift', 'Pirate 2’s table'],
      ['Brawl', 'Pirate 3’s table'],
      ['Whirl', 'Pirate 4’s table'],
      ['Even', 'Pirate 5’s table'],
      ['Brawl', 'Pirate 6’s table'],
      ['Classic', 'Open table'],
    ]);
  });

  it("lists Ocho's tables after Skull King's, and filters and searches them without asking again", async () => {
    await listing([mira]);
    const dialog = await openGames([
      anneOcho,
      { id: 'o2', hostName: 'Ben', players: 4, seated: 4, teams: true, match: 'to500' },
      { id: 'o3', hostName: 'Cleo', players: 4, seated: 2, teams: true, match: 'to500' },
    ]);
    // Ben's table is full: it is not a row and not counted.
    expect(dialog.querySelector('.go-tables-head .pill')?.textContent).toBe('3');
    const cleo = ['Ocho', 'Cleo’s table', 'Teams · First to 500', '2 of 4 seats'];
    expect(rowsOf(dialog)).toEqual([MIRA, ANNE_OCHO, cleo]);
    // Ocho sends no colour: the avatar is plain, the host's initial, and no colour is made up.
    const avatars = Array.from(dialog.querySelectorAll<HTMLElement>('.go-tables li .avatar'));
    expect(avatars.map((a) => [a.className, a.textContent, a.getAttribute('style')])).toEqual([
      ['avatar', 'M', 'background: rgb(206, 130, 255);'],
      ['avatar plain', 'A', null],
      ['avatar plain', 'C', null],
    ]);
    // The search has the keyboard when the dialog opens.
    const search = dialog.querySelector<HTMLInputElement>('input[type="search"]');
    expect(document.activeElement).toBe(search);
    expect(search?.closest('label')?.textContent).toBe('Search tables');
    expect(search?.placeholder).toBe('A name or a game');

    // The chips hide rows, All first.
    const chip = (label: string): HTMLButtonElement =>
      Array.from(dialog.querySelectorAll<HTMLButtonElement>('.go-finder-chips button')).find(
        (b) => b.textContent === label,
      ) ?? (host as unknown as HTMLButtonElement);
    expect(Array.from(dialog.querySelectorAll('.go-finder-chips button'), (b) => b.textContent)).toEqual([
      'All',
      'Skull King',
      'Ocho',
    ]);
    expect(chip('All').getAttribute('aria-pressed')).toBe('true');
    const asked = ochoServer.sent.length;
    await clickOn(chip('Ocho'));
    expect(chip('Ocho').getAttribute('aria-pressed')).toBe('true');
    expect(rowsOf(dialog)).toEqual([ANNE_OCHO, cleo]);
    await clickOn(chip('Skull King'));
    expect(rowsOf(dialog)).toEqual([MIRA]);
    await clickOn(chip('All'));
    expect(rowsOf(dialog)).toEqual([MIRA, ANNE_OCHO, cleo]);

    // The search finds a host, a game, and what a row says, whatever the case.
    await type('dialog input[type="search"]', 'ANNE');
    expect(rowsOf(dialog)).toEqual([ANNE_OCHO]);
    await type('dialog input[type="search"]', 'skull king');
    expect(rowsOf(dialog)).toEqual([MIRA]);
    await type('dialog input[type="search"]', 'ocho');
    expect(rowsOf(dialog)).toEqual([ANNE_OCHO, cleo]);
    await type('dialog input[type="search"]', 'first to 500');
    expect(rowsOf(dialog)).toEqual([cleo]);
    await clickOn(chip('Skull King'));
    expect(rowsOf(dialog)).toEqual([]);
    expect(dialog.querySelector('.go-tables-note p')?.textContent).toBe('No table matches that.');
    // The count is the tables with a seat, whatever is hidden.
    expect(dialog.querySelector('.go-tables-head .pill')?.textContent).toBe('3');
    // Nothing was asked of the server for any of it.
    expect(ochoServer.sent).toHaveLength(asked);
  });

  it('shows only the Ocho tables the server listed: a table the player sits at privately is not one', async () => {
    await listing([]);
    const dialog = await openGames([anneOcho]);
    // The account is at a private table: the lobby frame says so, and it is not listed.
    await act(async () => {
      ochoServer.push({ t: 'ocho.lobby', lobby: { ...aLobby({}, 1, 4), id: 'private-1' } });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(rowsOf(dialog)).toEqual([ANNE_OCHO]);
    await ochoLists([]);
    expect(rowsOf(dialog)).toEqual([]);
    expect(dialog.querySelector('.go-tables-note p')?.textContent).toBe(
      'No open tables right now. Open one and others can sit down.',
    );
  });

  it("sits down at an Ocho table by its lobby id, and goes to Ocho's table", async () => {
    await openAt('/games');
    const dialog = await openGames([anneOcho]);
    await clickOn(dialog.querySelector<HTMLButtonElement>('.go-tables li button') ?? host);
    // No code: the lobby id is all the page sends.
    expect(ochoServer.sent.at(-1)).toEqual({ t: 'ocho.joinOpen', lobby: 'o1', id: ochoServer.sent.at(-1)?.id });
    await act(async () => {
      ochoServer.ok();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(places.entries()).toEqual({ paths: ['/games', '/games/ocho'], at: 1 });
    expect($('dialog')).toBeNull();
  });

  it('says why an Ocho table could not be sat down at, and asks for the list again', async () => {
    await listing([]);
    const dialog = await openGames([anneOcho]);
    const join = async (code: string, message: string): Promise<void> => {
      await clickOn(dialog.querySelector<HTMLButtonElement>('.go-tables li button') ?? host);
      await act(async () => {
        ochoServer.err(code, message);
        await vi.advanceTimersByTimeAsync(0);
      });
    };
    await join('LOBBY_FULL', 'That table is full.');
    expect(dialog.querySelector('.go-tables-refused')?.textContent).toBe('That table is full.');
    expect(ochoServer.sent.at(-1)).toMatchObject({ t: 'ocho.tables' });
    await ochoLists([anneOcho]);
    await join('NOT_FOUND', 'That table is gone.');
    expect(dialog.querySelector('.go-tables-refused')?.textContent).toBe('That table is gone.');
    expect(ochoServer.sent.at(-1)).toMatchObject({ t: 'ocho.tables' });
    await ochoLists([]);
    expect(rowsOf(dialog)).toEqual([]);
    expect($('#left')).toBeNull();
  });

  it('opens a public Ocho table from the dialog: no bots, ready, and on to the table', async () => {
    await openAt('/games');
    const dialog = await openGames([]);
    const form = dialog.querySelector('.go-finder-ocho');
    expect(Array.from(form?.querySelectorAll('h4') ?? [], (h) => h.textContent)).toEqual(['Players', 'Table', 'Match']);
    expect(form?.querySelector('output')?.textContent).toBe('4');
    await clickOn($('dialog [aria-label="One player more"]') ?? host);
    await press('First to 500');
    await press('Open an Ocho table');
    expect(ochoServer.sent.at(-1)).toEqual({
      t: 'ocho.create',
      players: 5,
      teams: false,
      match: 'to500',
      open: true,
      id: ochoServer.sent.at(-1)?.id,
    });
    // While it is sent, it cannot be sent again.
    expect(button('Open an Ocho table').disabled).toBe(true);
    await act(async () => {
      ochoServer.ok();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(ochoServer.sent.at(-1)).toMatchObject({ t: 'ocho.ready', ready: true });
    await act(async () => {
      ochoServer.ok();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(places.entries()).toEqual({ paths: ['/games', '/games/ocho'], at: 1 });
  });

  it('says why an Ocho table could not be opened, stays, and locks Teams at four', async () => {
    await listing([]);
    const dialog = await openGames([]);
    await press('Teams2v2 only');
    expect(dialog.querySelector('.go-finder-ocho output')?.textContent).toBe('4');
    expect($('dialog [aria-label="One player more"]')?.hasAttribute('disabled')).toBe(true);
    await press('Open an Ocho table');
    expect(ochoServer.sent.at(-1)).toMatchObject({
      t: 'ocho.create',
      players: 4,
      teams: true,
      match: 'one',
      open: true,
    });
    expect(ochoServer.sent.at(-1)).not.toHaveProperty('bots');
    await act(async () => {
      ochoServer.err('ALREADY_SEATED', 'You are already at a table.');
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(dialog.querySelector('.go-finder-ocho [role="alert"]')?.textContent).toBe('You are already at a table.');
    expect(ochoServer.sent.filter((frame) => frame.t === 'ocho.ready')).toEqual([]);
    expect($('#left')).toBeNull();
    expect($('dialog')).not.toBeNull();
    // A link that is down cannot open one.
    await act(async () => {
      ochoServer.drop();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(button('Open an Ocho table').disabled).toBe(true);
  });

  it('offers Ocho in the row under Skull King, live, and not among what is coming', async () => {
    await openAt('/games');
    expect($('#go-ocho-title')?.textContent).toBe('Ocho');
    const game = $('#go-ocho-title')?.closest('.go-lib-game');
    expect(game?.querySelector('.go-lib-text p')?.textContent).toBe('Match the colour or the number');
    expect(game?.querySelector('a.go-lib-play')?.getAttribute('href')).toBe('/games/ocho');
    expect($('.go-coming-names')?.textContent).not.toContain('Ocho');
    // Ocho is a card game: the board shelf has no room for it.
    await press('Board');
    expect($('#go-ocho-title')).toBeNull();
    await press('Cards');
    expect($('#go-ocho-title')).not.toBeNull();
  });

  it('filters the live games and what is coming by the shelf', async () => {
    await openAt('/games');
    expect($('#go-sk-title')).not.toBeNull();
    expect($('.go-coming-names')?.textContent).toBe('Hearts, Chess, Ludo, Four in a Row, Five Dice');
    expect(link('Suggest a game').getAttribute('href')).toBe('/suggest');
    await press('Board');
    expect(button('Board').getAttribute('aria-pressed')).toBe('true');
    expect($('#go-sk-title')).toBeNull();
    expect($('.go-start-none')?.textContent).toBe('No live game on this shelf yet. These are on the way.');
    expect($('.go-lib-play')).toBeNull();
    expect($('.go-coming-names')?.textContent).toBe('Chess, Ludo, Four in a Row');
    await press('All');
    expect($('#go-sk-title')).not.toBeNull();
    expect(texts('.go-lib-play')).toEqual(['Play Skull King', 'Play Ocho']);
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
    expect($('#go-jump-title')?.textContent).toBe('Jump back in: Skull King');
    expect($('.go-jump')?.getAttribute('aria-labelledby')).toBe('go-jump-title');
    expect($('.go-jump-text b')?.textContent).toMatch(/^solo against \d bots?$/);
    expect($('.go-jump-text > span')?.textContent).toMatch(/^Round 1 of \d+ · saved on this device$/);
    // A band above the games, not cards on a cloth.
    expect($('.go-jump')?.nextElementSibling?.classList.contains('go-lib-games')).toBe(true);
    expect($('.go-jump .card')).toBeNull();
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
    expect(link('Play Skull King').getAttribute('href')).toBe('/skull-king');
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
    expect($('.go-jump-text b')?.textContent).toBe('your table');
    expect($('.go-jump-text > span')?.textContent).toBe('Game running · your seat is kept');
    expect(link('Continue').getAttribute('href')).toBe('/skull-king/online');
    closePage();
    await openFrame(
      {
        'POST /auth/guest': () => ok({ ...guest, active: { kind: 'lobby', id: 'lobby-1' } }),
        'GET /lobbies': () => ok({ lobbies: [] }),
      },
      '/games',
    );
    expect($('.go-jump-text > span')?.textContent).toBe('Waiting to start · your seat is kept');
    expect(link('Continue').getAttribute('href')).toBe('/skull-king/online');
  });

  it('shows an account its rating as the server sent it, and says when there is none yet', async () => {
    phone();
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
    // A wide window's seat beside the tables: name, rating, tier and games.
    expect($('.go-lib-seat .go-seat-who b')?.textContent).toBe('Anne');
    expect(texts('.go-lib-seat .go-seat-stats dd')).toEqual(['34', 'Captain', '23']);
    // The bar has the player where a guest has "Sign in".
    expect($('.go-chip')?.getAttribute('aria-label')).toBe('Anne, your profile');
    expect($('.go-chip-text small')?.textContent).toBe('Captain');
    expect(Array.from(document.querySelectorAll('#gameon a'), (a) => a.textContent)).not.toContain('Sign in');
    // Their seat, in the phone's sheet.
    await sheet('You');
    expect($('dialog .go-seat-who b')?.textContent).toBe('Anne');
    expect($('dialog .go-seat-who small')?.textContent).toBe('anne_bonny');
    expect($('dialog .go-seat-label .pill')?.textContent).toBe(season?.name);
    expect(texts('dialog .go-seat-stats dt')).toEqual(['Rating', 'Tier', 'Games']);
    expect(texts('dialog .go-seat-stats dd')).toEqual(['34', 'Captain', '23']);
    expect($('dialog .go-seat a')?.textContent).toBe('Find a ranked game');
    expect(link('Find a ranked game').getAttribute('href')).toBe('/skull-king/ranked');
    // Then the footer's links: a phone's Games has no footer of its own to show.
    expect(texts('dialog .go-sheet-links a')).toEqual([
      'Games',
      'Ladder',
      'How to play',
      'Privacy',
      'Imprint',
      'Suggest a game',
    ]);
    closePage();

    await openFrame({ 'POST /auth/guest': () => ok(anne), 'GET /lobbies': () => ok({ lobbies: [] }) }, '/games');
    expect($('.go-lib-seat .go-seat-who small')?.textContent).toBe('anne_bonny');
    expect($('.go-lib-seat .go-seat > p')?.textContent).toBe('No rating yet. Five placement games set your tier.');
    expect($('.go-chip-text small')?.textContent).toBe('anne_bonny');
    await sheet('You');
    expect($('dialog .go-seat > p')?.textContent).toBe('No rating yet. Five placement games set your tier.');
    expect($('.go-seat-stats')).toBeNull();
    expect(link('Find a ranked game').getAttribute('href')).toBe('/skull-king/ranked');
  });

  it('opens the open games from the phone bar as a dialog, and Escape, the close button and the scrim close it', async () => {
    phone();
    await openAt('/games');
    expect($('dialog')).toBeNull();
    const opener = button('Tables');
    act(() => opener.focus());
    let dialog = await sheet('Tables');
    expect(dialog.classList.contains('go-finder')).toBe(true);
    expect(dialog.getAttribute('aria-labelledby')).toBe(dialog.querySelector('h2')?.id);
    expect($('.go-lib-games')).not.toBeNull();

    // Escape closes it, and the button that opened it has the keyboard again.
    await act(async () => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect($('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    // The games are still on the screen.
    expect($('.go-lib-games')).not.toBeNull();

    dialog = await sheet('Tables');
    await clickOn(dialog.querySelector<HTMLButtonElement>('.go-sheet-close') ?? host);
    expect($('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);

    // A tap on the scrim is a click on the dialog itself. One on the panel leaves it open.
    dialog = await sheet('Tables');
    await clickOn(dialog.querySelector<HTMLElement>('.go-sheet-panel') ?? host);
    expect($('dialog')).not.toBeNull();
    await clickOn(dialog);
    expect($('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);

    dialog = await sheet('You');
    await clickOn(dialog.querySelector<HTMLElement>('.go-sheet-panel') ?? host);
    expect($('dialog')).not.toBeNull();
    await clickOn(dialog);
    expect($('dialog')).toBeNull();
    expect(document.activeElement).toBe(button('You'));
  });

  it('has no Play in the phone bar and no Play sheet: a game starts from its card', async () => {
    phone();
    await openAt('/games');
    expect(texts('.go-lib-bar button')).toEqual(['Tables', 'You']);
    expect(Array.from(document.querySelectorAll('button'), (b) => b.textContent)).not.toContain('Play');
    const card = $('#go-ocho-title')?.closest('.go-lib-game');
    expect(card?.querySelector('a.go-lib-play')?.textContent).toBe('Play Ocho');
    await clickOn(card?.querySelector<HTMLElement>('a.go-lib-play') ?? host);
    expect(places.entries()).toEqual({ paths: ['/games', '/games/ocho'], at: 1 });
  });

  it('keeps the You sheet closed on a wide window, and opens the open games from its button', async () => {
    await openAt('/games');
    await press('You');
    expect($('dialog')).toBeNull();
    const opener = button('Look for open games');
    act(() => opener.focus());
    const dialog = await openGames();
    expect(dialog.classList.contains('go-finder')).toBe(true);
    expect(dialog.querySelector('.go-sheet-head h2')?.textContent).toBe('Open games');
    expect(ochoServer.opened).toBe(1);
    await clickOn(dialog);
    expect($('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('closes the You sheet when the window grows wide, and leaves the open games open', async () => {
    let wide = false;
    const changed = new Set<() => void>();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('min-width') ? wide : true,
      media: query,
      addEventListener: (_: string, fn: () => void) => changed.add(fn),
      removeEventListener: (_: string, fn: () => void) => changed.delete(fn),
    }));
    const grow = async (to: boolean): Promise<void> => {
      wide = to;
      await act(async () => {
        for (const fn of changed) fn();
        await vi.advanceTimersByTimeAsync(0);
      });
    };
    await openAt('/games');
    await sheet('You');
    await grow(true);
    expect($('dialog')).toBeNull();
    await grow(false);
    await sheet('Tables');
    await grow(true);
    expect($('dialog.go-finder')).not.toBeNull();
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
    // There is no way to the tables, on either width.
    expect($('.go-lib-find')).toBeNull();
    expect(texts('.go-lib-bar button')).toEqual(['You']);
    // What needs no server is there all the same.
    expect($('#go-sk-title')).not.toBeNull();

    down = false;
    await settle(RETRY_MS);
    expect($('.go-banner')).toBeNull();
    expect($('.go-lib-seat .go-seat-who small')?.textContent).toBe('Playing as a guest');
    expect($('.go-lib-find')).not.toBeNull();
    expect(texts('.go-lib-bar button')).toEqual(['Tables', 'You']);
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
    expect($('.go-lib-seat .go-seat-who b')?.textContent).toBe('Anne');
    expect($('.go-lib-seat .go-seat-who small')?.textContent).toBe('anne_bonny');
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
