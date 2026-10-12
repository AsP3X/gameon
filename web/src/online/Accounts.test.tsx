// @vitest-environment jsdom
/* Accounts, the public tables and quick play, on the whole page against the mock server: what a
   player clicks and types, and what the screens say back. The sign-up and sign-in pages have their
   own tests in src/gameon/GameOn.test.tsx; here they are reached from the profile. The mock's own answers are checked frame
   by frame in src/net/mock/accounts.test.ts. */
import { act, StrictMode, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { App } from '../App';
import { AT, HUB, isOnline, routeOf } from '../router/addresses';
import { memoryPlaces } from '../router/places';
import type { MemoryPlaces } from '../router/places';
import { createRouter } from '../router/router';
import { Api } from '../net/api';
import type { Backend } from '../net/api';
import { connectRaw, framesOf } from '../net/mock/raw';
import type { RawClient } from '../net/mock/raw';
import { MockServer, STANDARD } from '../net/mock/server';
import { Online } from '../net/online';
import { SocketClient } from '../net/socket';
import type { Wire } from '../net/socket';
import type { GameSettings, LobbyList, Me } from '../protocol/generated';
import { session, ui } from '../tableview/state';
import { OnlineScreens } from './OnlineScreens';

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
const SETTINGS: GameSettings = { ...STANDARD, maxPlayers: 3, format: 'swift' };

let host: HTMLDivElement;
let root: Root | null = null;
/** The page's address and the entries behind it. A reload in a test keeps them, as a browser does. */
let places: MemoryPlaces;
let server: MockServer;
/** The browser the page runs in: the tests ask the server about its session through the same cookie jar. */
let page: Backend;

const $ = (selector: string): HTMLElement | null => document.querySelector<HTMLElement>(selector);
const texts = (selector: string): string[] =>
  Array.from(document.querySelectorAll<HTMLElement>(selector), (el) => el.textContent ?? '');
const settle = (ms = 0): Promise<void> => act(() => vi.advanceTimersByTimeAsync(ms).then(() => {}));
const button = (label: string): HTMLButtonElement => {
  const all = Array.from(document.querySelectorAll('button'));
  const el = all.find((b) => b.textContent === label) ?? all.find((b) => b.textContent?.startsWith(label));
  if (!el) throw new Error(`No button says "${label}"`);
  return el;
};
async function clickOn(el: HTMLElement, what: string): Promise<void> {
  if (el instanceof HTMLButtonElement && el.disabled) throw new Error(`${what} is disabled`);
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);
  });
}
async function click(selector: string): Promise<void> {
  const el = $(selector);
  if (!el) throw new Error(`Nothing to click: ${selector}`);
  await clickOn(el, selector);
}
const press = (label: string): Promise<void> => clickOn(button(label), `"${label}"`);
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
  const form = $('#gameon form') ?? $('#online form');
  if (!form) throw new Error('No form on screen');
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);
  });
}
async function renderApp(): Promise<void> {
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <StrictMode>
        <App backend={page} places={places} />
      </StrictMode>,
    );
    await vi.advanceTimersByTimeAsync(0);
  });
}
/** From the home screen to the hub, connected. */
async function openHub(): Promise<void> {
  await renderApp();
  await click('#gameon a[href="/skull-king/online"]');
  await settle();
}
const me = async (): Promise<Me> => (await page.rest('GET', '/me')).body as Me;
/** The browser's Back. */
const back = (): Promise<void> =>
  act(async () => {
    places.back();
    await vi.advanceTimersByTimeAsync(0);
  });
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

beforeEach(() => {
  places = memoryPlaces('/skull-king');
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockImplementation(seeded(21));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }));
  vi.stubGlobal('scrollTo', () => {});
  localStorage.clear();
  document.body.innerHTML = '<div id="root"></div>';
  host = document.querySelector<HTMLDivElement>('#root') ?? document.createElement('div');
  server = new MockServer({
    random: seeded(4),
    timers: { bidMs: 300, playMs: 200, abilityMs: 200, trickEndMs: 60, roundEndMs: 100 },
    bot: { minMs: 20, maxMs: 40 },
    queueFillMs: QUEUE_FILL_MS,
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

describe('the hub', () => {
  it('is three doors and a code: quick play, the public tables and a table of your own', async () => {
    await openHub();
    expect($('#online h1')?.textContent).toBe('Online');
    expect(texts('#online .pill')).toEqual(['Connected']);
    // Who is playing is at the right of a wide window's bar, with the way to their profile.
    expect($('#online .go-chip-text small')?.textContent).toBe('Guest');
    expect($('#online .go-chip-text b')?.textContent).toMatch(/^Guest \d{4}$/);
    expect($('#online .go-chip')?.getAttribute('href')).toBe('/profile');

    const doors = Array.from(document.querySelectorAll<HTMLElement>('#online .sk-way'));
    expect(
      doors.map((d) => [d.querySelector('b')?.textContent, d.querySelector('.sk-way-text > span')?.textContent]),
    ).toEqual([
      ['Quick play', 'A random table. Bots fill the empty seats. The standard rules.'],
      ['Public tables', 'Anyone can see the table. You pick the rules.'],
      ['Your table', 'Friends only, with a code. You pick the rules.'],
    ]);
    // Quick play asks at once. The other two lead to their pages.
    expect(doors.map((d) => d.tagName)).toEqual(['BUTTON', 'A', 'A']);
    expect(doors.map((d) => d.getAttribute('href'))).toEqual([
      null,
      '/skull-king/online/public',
      '/skull-king/online/new',
    ]);
    expect(texts('#online .on-body > .btn')).toEqual(['Join with a code']);
    // Ranked is not a door of this page: it has its own.
    expect($('#online')?.textContent).not.toContain('Ranked');
  });
});

describe('an account', () => {
  it('turns the guest into an account on the sign-up page, and comes back to a hub that is still connected', async () => {
    await openHub();
    const guest = await me();
    await click('#online a[href="/profile"]');
    expect($('#online h1, #online h2')?.textContent).toBe('Your profile');
    expect(texts('#online .who .pill')).toEqual(['Guest']);
    // Signing up is a page of the frame (src/gameon). It leaves the connection as it is.
    await press('Create an account');
    expect(places.path()).toBe('/sign-up');
    expect($('#gameon h1')?.textContent).toBe('Create your account');
    await signUp('Anne_Bonny', 'three sheets');
    await settle();
    const now = await me();
    expect(now).toMatchObject({ guest: false, username: 'Anne_Bonny' });
    // A guest who was already playing stays who they are, the name included.
    expect(now.user).toEqual(guest.user);
    expect(places.path()).toBe('/games');

    // Back is the profile the player came from, and it knows the account.
    await back();
    expect($('#online h1, #online h2')?.textContent).toBe('Your profile');
    expect(texts('#online .who .pill')).toEqual(['@Anne_Bonny']);
    expect($('#online [aria-label="Account"] p')?.textContent).toBe('Signed in as @Anne_Bonny.');
    await click('[aria-label="Back"]');
    expect($('#online .go-chip-text small')?.textContent).toBe('Anne_Bonny');
    expect(texts('#online .pill')).toEqual(['Connected']);
  });

  it('signs in from the profile, and connects again as that account', async () => {
    const anne = await existingAccount('anne_bonny', 'three sheets', 'Anne');
    await openHub();
    const guest = await me();
    await click('#online a[href="/profile"]');
    await press('Sign in');
    expect(places.path()).toBe('/sign-in');
    expect($('#gameon h1')?.textContent).toBe('Welcome back');
    await type('#signin-username', 'anne_bonny');
    await type('#signin-password', 'two sheets');
    await submit();
    expect($('#gameon [role="alert"]')?.textContent).toBe('Wrong username or password.');
    expect((await me()).user.id).toBe(guest.user.id);

    await type('#signin-password', 'three sheets');
    await submit();
    await settle();
    expect((await me()).user.id).toBe(anne.user.id);
    expect(places.path()).toBe('/games');
    // The connection that was up was made again with the new session.
    await back();
    await settle();
    expect(texts('#online .who .pill')).toEqual(['@anne_bonny']);
    await click('[aria-label="Back"]');
    expect($('#online .go-chip-text b')?.textContent).toBe('Anne');
    expect($('#online .go-chip-text small')?.textContent).toBe('anne_bonny');
    expect(texts('#online .pill')).toEqual(['Connected']);
  });

  it('signs out to the home screen, and whoever plays online next is a new guest', async () => {
    await page.rest('POST', '/auth/guest');
    await page.rest('POST', '/auth/register', { username: 'calico', password: 'secret' });
    const calico = await me();
    await openHub();
    await click('#online a[href="/profile"]');
    await press('Sign out');
    expect($('#online')).toBeNull();
    expect($('#app')?.hidden).toBe(false);
    expect($('.sk-home')).not.toBeNull();
    expect((await page.rest('GET', '/me')).status).toBe(401);

    await click('#gameon a[href="/skull-king/online"]');
    await settle();
    expect($('#online .go-chip-text small')?.textContent).toBe('Guest');
    expect((await me()).user.id).not.toBe(calico.user.id);
    // A guest has nothing to sign out of: the profile offers an account instead.
    await click('#online a[href="/profile"]');
    expect(texts('#online [aria-label="Account"] .btn')).toEqual(['Create an account', 'Sign in']);
  });
});

describe('the profile', () => {
  it('offers the eight table colours and no others, and saves the name and the colour', async () => {
    await openHub();
    const before = await me();
    await click('#online a[href="/profile"]');
    const swatches = Array.from(document.querySelectorAll<HTMLElement>('#online .swatch'));
    expect(swatches.map((s) => s.getAttribute('aria-label'))).toEqual([
      'Blue',
      'Orange',
      'Purple',
      'Red',
      'Green',
      'Gold',
      'Navy',
      'Pink',
    ]);
    // jsdom spells a colour as rgb(): the eight of docs/protocol.md §4, in their order.
    expect(swatches.map((s) => s.querySelector('i')?.style.background)).toEqual([
      'rgb(28, 176, 246)',
      'rgb(255, 150, 0)',
      'rgb(206, 130, 255)',
      'rgb(255, 75, 75)',
      'rgb(88, 204, 2)',
      'rgb(229, 164, 0)',
      'rgb(43, 112, 201)',
      'rgb(255, 95, 191)',
    ]);
    expect(swatches.filter((s) => s.getAttribute('aria-checked') === 'true')).toHaveLength(1);
    expect($('#online .swatches')?.getAttribute('role')).toBe('radiogroup');
    // Nothing to save yet, and no free-text colour anywhere.
    expect(button('Save').disabled).toBe(true);
    expect(document.querySelectorAll('#online input')).toHaveLength(1);

    const other = before.user.color === '#ff5fbf' ? 'Navy' : 'Pink';
    await click(`#online .swatch[aria-label="${other}"]`);
    await type('#display-name', '  Calico Jack ');
    await press('Save');
    expect($('#online .foot-hint')?.textContent).toBe('Saved.');
    expect($('#online .who b')?.textContent).toBe('Calico Jack');
    expect((await me()).user).toEqual({
      ...before.user,
      name: 'Calico Jack',
      color: other === 'Pink' ? '#ff5fbf' : '#2b70c9',
    });
    expect(button('Save').disabled).toBe(true);
    await click('[aria-label="Back"]');
    expect($('#online .go-chip-text b')?.textContent).toBe('Calico Jack');
  });

  it('cannot save an empty name, and shows no games before the first one', async () => {
    await openHub();
    await click('#online a[href="/profile"]');
    expect(texts('#online .stat')).toEqual(['0Games', '0Wins', '–Bids hit', '–Best']);
    expect($('#online [aria-label="Online games"] p')?.textContent).toBe(
      'No online games yet. Your first one counts here.',
    );
    await type('#display-name', '   ');
    expect(button('Save').disabled).toBe(true);
    expect($('#display-name')?.getAttribute('maxlength')).toBe('16');
  });
});

describe('public tables', () => {
  const list = async (): Promise<LobbyList['lobbies']> =>
    ((await page.rest('GET', '/lobbies')).body as LobbyList).lobbies;

  it('says so when there are none, and lists the public ones only', async () => {
    await openHub();
    await click('#online a[href="/skull-king/online/public"]');
    expect($('#online h1, #online h2')?.textContent).toBe('Public tables');
    expect($('#online .notice')?.textContent).toBe('No public tables right now.');

    const open = await someone(),
      hidden = await someone();
    await open.browser.rest('PATCH', '/me', { name: 'Mary Read' });
    open.socket.send({ t: 'lobby.create', visibility: 'public', settings: SETTINGS });
    hidden.socket.send({ t: 'lobby.create', visibility: 'private', settings: SETTINGS });
    await settle();
    await press('Refresh');
    // A table somebody hosts is theirs by name. The seats, the length of the game, and that it seats bots.
    expect(texts('#online .tables .plate b')).toEqual(['Mary Read’s table']);
    expect(texts('#online .tables .on-row-line')).toEqual(['1 of 3 seats · SwiftBots']);
    expect(texts('#online .tables .pill')).toEqual(['Bots']);

    await press('Join');
    expect($('#online h1, #online h2')?.textContent).toBe('Public table');
    expect(texts('#online .on-bar .pill')).toEqual(['Public']);
    // A public table shows no code to share: it is on the list.
    expect($('#online .code')).toBeNull();
    expect(framesOf(open.socket, 'lobby.state').at(-1)?.lobby.members).toHaveLength(2);
    // Leaving the table is back at the list it was joined from.
    await click('[aria-label="Leave table"]');
    expect($('#online h1, #online h2')?.textContent).toBe('Public tables');
  });

  it('shows a full table as full, and reads the list again when a table filled up in the meantime', async () => {
    const open = await someone();
    open.socket.send({ t: 'lobby.create', visibility: 'public', settings: { ...SETTINGS, maxPlayers: 2 } });
    await settle();
    await openHub();
    await click('#online a[href="/skull-king/online/public"]');
    expect(button('Join').disabled).toBe(false);
    // Somebody else takes the last seat after the list was read.
    open.socket.send({ t: 'lobby.addBot' });
    await settle();
    await press('Join');
    expect($('#online [role="alert"]')?.textContent).toBe('That table is full.');
    expect(texts('#online .tables .pill')).toEqual(['Bots', 'Full']);
    expect(document.querySelector('#online .tables button')).toBeNull();
    expect($('#online h1, #online h2')?.textContent).toBe('Public tables');
  });

  it('creates a public table from the list, which the server then lists', async () => {
    await openHub();
    await click('#online a[href="/skull-king/online/public"]');
    await press('Create a public table');
    expect($('#online h1, #online h2')?.textContent).toBe('Public table');
    expect(texts('#online .on-intro .pill')).toEqual(['Public']);
    expect($('#online .on-intro p')?.textContent).toBe('Anyone can see the table. You pick the rules.');
    expect($('#online .sk-hints')?.textContent).toBe('A public table can start once a second pirate sits down.');
    await press('List table');
    expect($('#online h1, #online h2')?.textContent).toBe('Public table');
    expect(texts('#online .on-bar .pill')).toEqual(['Public']);
    expect(await list()).toHaveLength(1);
  });

  it('offers Start at a public table only once a second pirate sat down and is ready', async () => {
    await openHub();
    await click('#online a[href="/skull-king/online/public"]');
    await press('Create a public table');
    await press('List table');
    const waiting = 'A public table can start once a second pirate sits down.';
    expect($('#online .foot-hint')?.textContent).toBe(waiting);
    // A bot takes a seat, but it is not the second pirate: ready or not, the host cannot start.
    await press('Add a bot');
    await press("I'm ready");
    expect(texts('#online .member small')).toEqual(['Host · you', 'Bot']);
    expect($('#online .foot-hint')?.textContent).toBe(waiting);
    expect(button('Start').disabled).toBe(true);

    const friend = await someone();
    friend.socket.send({ t: 'lobby.join', lobbyId: (await list())[0].id });
    await settle();
    expect($('#online .foot-hint')?.textContent).toMatch(/^Waiting for Guest \d{4} to be ready\.$/);
    expect(button('Start').disabled).toBe(true);
    friend.socket.send({ t: 'lobby.ready', ready: true });
    await settle();
    expect($('#online .foot-hint')?.textContent).toBe('Everyone is ready. Start when you like.');
    expect(button('Start').disabled).toBe(false);
    await press('Start');
    expect(ui.screen).toBe('game');
  });

  it('keeps your table off the list: the door opens a private one, and says so', async () => {
    await openHub();
    await click('#online a[href="/skull-king/online/new"]');
    expect($('#online h1, #online h2')?.textContent).toBe('Your table');
    expect(texts('#online .on-intro .pill')).toEqual(['Private']);
    expect($('#online .on-intro p')?.textContent).toBe('Friends only, with a code. You pick the rules.');
    expect($('#online .sk-hints')?.textContent).toBe(
      'The table starts when two pirates are seated and ready. A bot is not the second.',
    );
    // Who can join is not a choice on this page: the other door is the public one.
    expect(texts('#online .label')).toEqual(['Bots', 'Rounds', 'Scoring', 'Advanced']);
    await press('Open table');
    expect(texts('#online .on-bar .pill')).toEqual(['Private']);
    expect(await list()).toEqual([]);
    // The host's "Table rules" does not say it again: nothing changes a table's visibility afterwards.
    await press('Change');
    expect($('#online .on-intro')).toBeNull();
  });

  it('shows who a human at the table is, from the server', async () => {
    const friend = await someone();
    await friend.browser.rest('PATCH', '/me', { name: 'Mary Read', color: '#58cc02' });
    friend.socket.send({ t: 'lobby.create', visibility: 'public', settings: SETTINGS });
    await settle();
    await openHub();
    await click('#online a[href="/skull-king/online/public"]');
    await press('Join');
    await press('Mary Read');
    expect($('#online h1, #online h2')?.textContent).toBe('Pirate');
    expect($('#online .who b')?.textContent).toBe('Mary Read');
    expect($('#online .who .avatar')?.style.background).toBe('rgb(88, 204, 2)');
    expect(texts('#online .stat')).toEqual(['0Games', '0Wins', '–Bids hit', '–Best']);
    expect($('#online [aria-label="Online games"] p')?.textContent).toBe('No online games yet.');
    await click('[aria-label="Back"]');
    expect($('#online h1, #online h2')?.textContent).toBe('Public table');
  });
});

describe('quick play', () => {
  it('waits in the queue with what the server says about it, and leaves it again', async () => {
    await openHub();
    await press('Quick play');
    expect($('#online h1, #online h2')?.textContent).toBe('Quick play');
    expect($('#online .searching [role="status"]')?.textContent).toBe('1 of 4 found');
    expect(document.querySelectorAll('#online .queue-seat')).toHaveLength(4);
    expect(document.querySelectorAll('#online .queue-seat.found')).toHaveLength(1);
    // The rules are the server's standard ruleset, and no waiting time is promised.
    expect(texts('#online .plate b')).toEqual(["Skull King's scoring · Classic"]);
    expect($('#online')?.textContent).not.toMatch(/\d+\s*(s|sec|seconds|minutes?)\b/);

    const other = await someone();
    other.socket.send({ t: 'queue.join', mode: 'casual' });
    await settle();
    expect($('#online .searching [role="status"]')?.textContent).toBe('2 of 4 found');
    expect(document.querySelectorAll('#online .queue-seat.found')).toHaveLength(2);

    await press('Leave the queue');
    expect($('#online h1, #online h2')?.textContent).toBe('Online');
    expect(framesOf(other.socket, 'queue.status').at(-1)?.queue.found).toBe(1);
    expect((await me()).active).toBeNull();
  });

  it('opens the table when the queue has made one, plays it to the end, and counts it on the profile', async () => {
    await openHub();
    await press('Quick play');
    await settle(QUEUE_FILL_MS);
    expect(ui.screen).toBe('game');
    expect($('#online')).toBeNull();
    expect(session.table?.localSeats).toEqual([0]);
    expect(session.table?.view(0).seats.map((seat) => seat.bot)).toEqual([false, true, true, true]);

    // Nobody touches anything: the deadlines play this seat, and the game runs to its end.
    for (let i = 0; i < 600 && ui.screen !== 'end'; i++) await settle(250);
    expect(ui.screen).toBe('end');
    // A casual game moves no rating: the end screen has no rating line at all.
    expect($('#app .end-rating')).toBeNull();
    await click('[data-act="again"]');
    await settle();
    // A quick-play table has no lobby to go back to: this is the hub.
    expect($('#online h1, #online h2')?.textContent).toBe('Online');
    expect($('#online .notice')).toBeNull();
    const mine = await me();
    expect(mine.stats.games).toBe(1);
    await click('#online a[href="/profile"]');
    expect(texts('#online .stat')).toEqual([
      '1Games',
      `${mine.stats.wins}Wins`,
      `${Math.round((mine.stats.bidsMade / mine.stats.bidsTotal) * 100)}%Bids hit`,
      `${mine.stats.bestScore}Best`,
    ]);
    expect($('#online [aria-label="Online games"] p')).toBeNull();
  });

  it('keeps the queue screen through a dropped connection, and takes the place the server still has', async () => {
    await openHub();
    await press('Quick play');
    server.drop(true);
    await settle();
    expect($('#online h1, #online h2')?.textContent).toBe('Quick play');
    expect($('#online .notice')?.textContent).toBe(
      'Connection lostTrying again. If your place is gone, you can look for a game again.',
    );
    expect(button('Leave the queue').disabled).toBe(true);
    server.restore();
    await settle(1000);
    // The welcome on the new socket carries the queue: the mock kept the place.
    expect($('#online .notice')).toBeNull();
    expect($('#online .searching [role="status"]')?.textContent).toBe('1 of 4 found');
    expect(button('Leave the queue').disabled).toBe(false);
  });
});

/* The hub against frames written by hand: what it says when the server refuses the queue. With the
   mock the page cannot get there by clicking, because a seated player is never shown the hub. */
describe('the hub, when the server refuses quick play', () => {
  /** The online screens alone, with addresses of their own: no page around them. */
  function Hub({ online, onExit }: { online: Online; onExit: () => void }) {
    const state = useSyncExternalStore(online.subscribe, online.getState);
    const [router] = useState(() => createRouter(memoryPlaces(AT.online)));
    const route = routeOf(useSyncExternalStore(router.subscribe, router.getPath));
    return (
      <div id="online">
        <OnlineScreens
          online={online}
          state={state}
          route={isOnline(route) ? route : HUB}
          go={router.go}
          up={router.up}
          onExit={onExit}
        />
      </div>
    );
  }

  it('shows the refusal under the button and stays on the hub', async () => {
    const sent: { t: string; id: number }[] = [];
    const wire: Wire = {
      send: (data) => void sent.push(JSON.parse(data) as { t: string; id: number }),
      close: () => {},
      onmessage: null,
      onclose: null,
    };
    const say = (frame: object): void => wire.onmessage?.(JSON.stringify(frame));
    const online = new Online(
      new SocketClient({ transport: () => Promise.resolve(wire), build: 'test' }),
      new Api(() => Promise.reject(new Error('This test has no REST'))),
    );
    online.open();
    root = createRoot(host);
    await act(async () => {
      root?.render(<Hub online={online} onExit={() => {}} />);
      await vi.advanceTimersByTimeAsync(0);
    });
    const guest = (await server.browser().rest('POST', '/auth/guest')).body;
    await act(async () => {
      say({ t: 'ok', re: sent[0].id });
      say({ t: 'welcome', me: guest, serverTime: Date.now(), lobby: null, queue: null, game: null });
      await vi.advanceTimersByTimeAsync(0);
    });
    await press('Quick play');
    expect(sent.at(-1)).toMatchObject({ t: 'queue.join', mode: 'casual' });
    await act(async () => {
      say({ t: 'err', re: sent.at(-1)?.id, code: 'ALREADY_SEATED', message: 'The user is seated elsewhere.' });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect($('#online [role="alert"]')?.textContent).toBe('You are already at a table.');
    expect($('#online h1, #online h2')?.textContent).toBe('Online');
    expect(button('Quick play').disabled).toBe(false);

    // A code this client has no words for shows what the server said: that is what `message` is for.
    await press('Quick play');
    await act(async () => {
      say({ t: 'err', re: sent.at(-1)?.id, code: 'INTERNAL', message: 'Something went wrong.' });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect($('#online [role="alert"]')?.textContent).toBe('Something went wrong.');
    online.dispose();
  });
});
