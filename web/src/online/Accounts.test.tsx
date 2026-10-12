// @vitest-environment jsdom
/* Accounts, the public tables and quick play, on the whole page against the mock server: what a
   player clicks and types, and what the screens say back. The mock's own answers are checked frame
   by frame in src/net/mock/accounts.test.ts. */
import { act, StrictMode, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { App } from '../App';
import { AT, HUB, isLegacy, routeOf } from '../router/addresses';
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
  const form = $('#online form');
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
  await click('[data-act="online"]');
  await settle();
}
const me = async (): Promise<Me> => (await page.rest('GET', '/me')).body as Me;
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
  places = memoryPlaces();
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
  it('says who is playing and offers quick play, the public tables and a table of your own', async () => {
    await openHub();
    expect($('#online .identity small')?.textContent).toBe('Playing as a guest');
    expect($('#online .identity b')?.textContent).toMatch(/^Guest \d{4}$/);
    expect(texts('#online .label')).toEqual(['Quick play', 'Ranked', 'Public tables', 'Your own table']);
    expect(texts('#online .wrap .btn')).toEqual([
      'Find a game',
      'Create an account',
      'Ladder',
      'Browse tables',
      'Create a table',
      'Join with a code',
    ]);
    expect(texts('#online .pill')).toEqual(['Connected']);
  });
});

describe('an account', () => {
  it('turns the guest into an account that keeps its user id, and says a forgotten password is gone for good', async () => {
    await openHub();
    const guest = await me();
    await press('Profile');
    expect($('#online h2')?.textContent).toBe('Your profile');
    expect(texts('#online .who .pill')).toEqual(['Guest']);
    await press('Create an account');
    expect($('#online h2')?.textContent).toBe('Create an account');
    expect($('#online .notice.gold')?.textContent).toBe(
      'Keep your password safeThere is no email and no reset. A forgotten password cannot be recovered.',
    );
    // There is a username and a password, twice. No email.
    expect(Array.from(document.querySelectorAll('#online input'), (i) => i.getAttribute('type'))).toEqual([
      'text',
      'password',
      'password',
    ]);
    expect(button('Create account').disabled).toBe(true);

    await signUp('Anne_Bonny', 'three sheets');
    expect($('#online h2')?.textContent).toBe('Your profile');
    expect(texts('#online .who .pill')).toEqual(['@Anne_Bonny']);
    expect($('#online [aria-label="Account"] p')?.textContent).toBe('Signed in as @Anne_Bonny.');
    const now = await me();
    expect(now).toMatchObject({ guest: false, username: 'Anne_Bonny' });
    expect(now.user).toEqual(guest.user);
    await click('[aria-label="Back"]');
    expect($('#online .identity small')?.textContent).toBe('Playing as @Anne_Bonny');
    expect(texts('#online .pill')).toEqual(['Connected']);
  });

  it('says so under the field when the username is taken or has the wrong shape, and when the passwords differ', async () => {
    await existingAccount('anne_bonny', 'three sheets', 'Anne');
    await openHub();
    await press('Profile');
    await press('Create an account');

    await signUp('ANNE_BONNY', 'secret');
    expect($('#signup-username-help')?.textContent).toBe('That username is taken. Try another.');
    expect($('#signup-username')?.getAttribute('aria-invalid')).toBe('true');
    expect($('#online h2')?.textContent).toBe('Create an account');

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
    expect((await me()).guest).toBe(true);
  });

  it('never keeps the password or a token where the page could read it back', async () => {
    await openHub();
    await press('Profile');
    await press('Create an account');
    await signUp('calico', 'a very secret password');
    expect((await me()).username).toBe('calico');
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain('secret');
    expect(sessionStorage).toHaveLength(0);
    expect(location.href).not.toContain('secret');
    expect(document.cookie).toBe('');
    expect(document.body.innerHTML).not.toContain('a very secret password');
  });

  it('refuses a wrong password and stays the guest; the right one makes the page that account', async () => {
    const anne = await existingAccount('anne_bonny', 'three sheets', 'Anne');
    await openHub();
    const guest = await me();
    await press('Profile');
    await press('Sign in');
    expect($('#online h2')?.textContent).toBe('Sign in');
    expect(texts('#online p.muted')).toEqual([
      'Signing in switches to that account. This guest and its stats are left behind.',
    ]);
    await type('#signin-username', 'anne_bonny');
    await type('#signin-password', 'two sheets');
    await submit();
    expect($('#online [role="alert"]')?.textContent).toBe('Wrong username or password.');
    expect((await me()).user.id).toBe(guest.user.id);
    expect(button('Sign in').disabled).toBe(false);

    await type('#signin-password', 'three sheets');
    expect($('#online [role="alert"]')).toBeNull();
    await submit();
    await settle();
    expect($('#online h2')?.textContent).toBe('Play online');
    expect($('#online .identity b')?.textContent).toBe('Anne');
    expect($('#online .identity small')?.textContent).toBe('Playing as @anne_bonny');
    expect(texts('#online .pill')).toEqual(['Connected']);
    expect((await me()).user.id).toBe(anne.user.id);
  });

  it('signs out to the home screen, and whoever plays online next is a new guest', async () => {
    await openHub();
    await press('Profile');
    await press('Create an account');
    await signUp('calico', 'secret');
    const calico = await me();
    await press('Sign out');
    expect($('#online')).toBeNull();
    expect($('#app')?.hidden).toBe(false);
    expect($('#app .home')).not.toBeNull();
    expect((await page.rest('GET', '/me')).status).toBe(401);

    await click('[data-act="online"]');
    await settle();
    expect($('#online .identity small')?.textContent).toBe('Playing as a guest');
    expect((await me()).user.id).not.toBe(calico.user.id);
    // A guest has nothing to sign out of: the profile offers an account instead.
    await press('Profile');
    expect(texts('#online [aria-label="Account"] .btn')).toEqual(['Create an account', 'Sign in']);
  });
});

describe('the profile', () => {
  it('offers the eight table colours and no others, and saves the name and the colour', async () => {
    await openHub();
    const before = await me();
    await press('Profile');
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
    expect($('#online .identity b')?.textContent).toBe('Calico Jack');
  });

  it('cannot save an empty name, and shows no games before the first one', async () => {
    await openHub();
    await press('Profile');
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
    await press('Browse tables');
    expect($('#online h2')?.textContent).toBe('Public tables');
    expect($('#online .notice b')?.textContent).toBe('No public tables right now');

    const open = await someone(),
      hidden = await someone();
    await open.browser.rest('PATCH', '/me', { name: 'Mary Read' });
    open.socket.send({ t: 'lobby.create', visibility: 'public', settings: SETTINGS });
    hidden.socket.send({ t: 'lobby.create', visibility: 'private', settings: SETTINGS });
    await settle();
    await press('Refresh');
    expect(texts('#online .tables .plate b')).toEqual(['Mary Read']);
    expect(texts('#online .tables .plate small')).toEqual([
      "1 of 3 pirates · Skull King's scoring · Swift-n-Salty",
      'Normal bots · Standard pace · No extra cards',
    ]);

    await press('Join');
    expect($('#online h2')?.textContent).toBe('Table');
    expect(texts('#online .head .pill')).toEqual(['Public']);
    expect(framesOf(open.socket, 'lobby.state').at(-1)?.lobby.members).toHaveLength(2);
    // Leaving the table is back at the list it was joined from.
    await click('[aria-label="Leave table"]');
    expect($('#online h2')?.textContent).toBe('Public tables');
  });

  it('shows a full table as full, and reads the list again when a table filled up in the meantime', async () => {
    const open = await someone();
    open.socket.send({ t: 'lobby.create', visibility: 'public', settings: { ...SETTINGS, maxPlayers: 2 } });
    await settle();
    await openHub();
    await press('Browse tables');
    expect(button('Join').disabled).toBe(false);
    // Somebody else takes the last seat after the list was read.
    open.socket.send({ t: 'lobby.addBot' });
    await settle();
    await press('Join');
    expect($('#online [role="alert"]')?.textContent).toBe('That table is full.');
    expect(texts('#online .tables .pill')).toEqual(['Full']);
    expect(document.querySelector('#online .tables button')).toBeNull();
    expect($('#online h2')?.textContent).toBe('Public tables');
  });

  it('creates a public table from the list, which the server then lists', async () => {
    await openHub();
    await press('Browse tables');
    await press('Create a public table');
    expect($('#online h2')?.textContent).toBe('New table');
    expect(button('Public').getAttribute('aria-pressed')).toBe('true');
    await press('Create table');
    expect($('#online h2')?.textContent).toBe('Table');
    expect(texts('#online .head .pill')).toEqual(['Public']);
    expect(await list()).toHaveLength(1);
  });

  it('offers Start at a public table only once a second pirate sat down and is ready', async () => {
    await openHub();
    await press('Browse tables');
    await press('Create a public table');
    await press('Create table');
    const waiting = 'A public table can start once a second pirate sits down.';
    expect($('#online .foot-hint')?.textContent).toBe(waiting);
    // A bot takes a seat, but it is not the second pirate: ready or not, the host cannot start.
    await press('Add a bot');
    await press("I'm ready");
    expect(texts('#online .member small')).toEqual(['Host · you', 'Bot · Normal']);
    expect($('#online .foot-hint')?.textContent).toBe(waiting);
    expect(button('Start game').disabled).toBe(true);

    const friend = await someone();
    friend.socket.send({ t: 'lobby.join', lobbyId: (await list())[0].id });
    await settle();
    expect($('#online .foot-hint')?.textContent).toMatch(/^Waiting for Guest \d{4} to be ready\.$/);
    expect(button('Start game').disabled).toBe(true);
    friend.socket.send({ t: 'lobby.ready', ready: true });
    await settle();
    expect($('#online .foot-hint')?.textContent).toBe('Everyone is ready. Start when you like.');
    expect(button('Start game').disabled).toBe(false);
    await press('Start game');
    expect(ui.screen).toBe('game');
  });

  it('keeps a table private unless asked: the form starts on Private from the hub', async () => {
    await openHub();
    await press('Create a table');
    expect(texts('#online .label')[0]).toBe('Who can join');
    expect(button('Private').getAttribute('aria-pressed')).toBe('true');
    await press('Create table');
    expect(texts('#online .head .pill')).toEqual(['Private']);
    expect(await list()).toEqual([]);
    // The host's "Table rules" has no such choice: nothing changes a table's visibility afterwards.
    await press('Change');
    expect(texts('#online .label')).not.toContain('Who can join');
  });

  it('shows who a human at the table is, from the server', async () => {
    const friend = await someone();
    await friend.browser.rest('PATCH', '/me', { name: 'Mary Read', color: '#58cc02' });
    friend.socket.send({ t: 'lobby.create', visibility: 'public', settings: SETTINGS });
    await settle();
    await openHub();
    await press('Browse tables');
    await press('Join');
    await press('Mary Read');
    expect($('#online h2')?.textContent).toBe('Pirate');
    expect($('#online .who b')?.textContent).toBe('Mary Read');
    expect($('#online .who .avatar')?.style.background).toBe('rgb(88, 204, 2)');
    expect(texts('#online .stat')).toEqual(['0Games', '0Wins', '–Bids hit', '–Best']);
    expect($('#online [aria-label="Online games"] p')?.textContent).toBe('No online games yet.');
    await click('[aria-label="Back"]');
    expect($('#online h2')?.textContent).toBe('Table');
  });
});

describe('quick play', () => {
  it('waits in the queue with what the server says about it, and leaves it again', async () => {
    await openHub();
    await press('Find a game');
    expect($('#online h2')?.textContent).toBe('Quick play');
    expect($('#online .searching [role="status"]')?.textContent).toBe('1 of 4 found');
    expect(document.querySelectorAll('#online .queue-seat')).toHaveLength(4);
    expect(document.querySelectorAll('#online .queue-seat.found')).toHaveLength(1);
    // The rules are the server's standard ruleset, and no waiting time is promised.
    expect(texts('#online .plate b')).toEqual(["Skull King's scoring · Skip to the Brawl"]);
    expect($('#online')?.textContent).not.toMatch(/\d+\s*(s|sec|seconds|minutes?)\b/);

    const other = await someone();
    other.socket.send({ t: 'queue.join', mode: 'casual' });
    await settle();
    expect($('#online .searching [role="status"]')?.textContent).toBe('2 of 4 found');
    expect(document.querySelectorAll('#online .queue-seat.found')).toHaveLength(2);

    await press('Leave the queue');
    expect($('#online h2')?.textContent).toBe('Play online');
    expect(framesOf(other.socket, 'queue.status').at(-1)?.queue.found).toBe(1);
    expect((await me()).active).toBeNull();
  });

  it('opens the table when the queue has made one, plays it to the end, and counts it on the profile', async () => {
    await openHub();
    await press('Find a game');
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
    expect($('#online h2')?.textContent).toBe('Play online');
    expect($('#online .notice')).toBeNull();
    const mine = await me();
    expect(mine.stats.games).toBe(1);
    await press('Profile');
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
    await press('Find a game');
    server.drop(true);
    await settle();
    expect($('#online h2')?.textContent).toBe('Quick play');
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
          route={isLegacy(route) ? HUB : route}
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
    await press('Find a game');
    expect(sent.at(-1)).toMatchObject({ t: 'queue.join', mode: 'casual' });
    await act(async () => {
      say({ t: 'err', re: sent.at(-1)?.id, code: 'ALREADY_SEATED', message: 'The user is seated elsewhere.' });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect($('#online [role="alert"]')?.textContent).toBe('You are already at a table.');
    expect($('#online h2')?.textContent).toBe('Play online');
    expect(button('Find a game').disabled).toBe(false);

    // A code this client has no words for shows what the server said: that is what `message` is for.
    await press('Find a game');
    await act(async () => {
      say({ t: 'err', re: sent.at(-1)?.id, code: 'INTERNAL', message: 'Something went wrong.' });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect($('#online [role="alert"]')?.textContent).toBe('Something went wrong.');
    online.dispose();
  });
});
