// @vitest-environment jsdom
/* The whole page against the mock server: from the home screen through the hub and the lobby to a
   bid at the table, and back. What is clicked here is what a player clicks. */
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { App } from '../App';
import { memoryPlaces } from '../router/places';
import type { MemoryPlaces } from '../router/places';
import { connectRaw, framesOf } from '../net/mock/raw';
import type { RawClient } from '../net/mock/raw';
import { MockServer } from '../net/mock/server';
import type { MockStore } from '../net/mock/server';
import type { Transport } from '../net/socket';
import { Sound } from '../sound/sound';
import { render } from '../tableview/render';
import { session, stats, tableView, ui } from '../tableview/state';
import { noticeText } from './OnlineScreens';
import { reloadPage } from './reload';

vi.mock('./reload', () => ({ reloadPage: vi.fn<() => void>() }));

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let host: HTMLDivElement;
let root: Root | null = null;
/** The page's address and the entries behind it. A reload in a test keeps them, as a browser does. */
let places: MemoryPlaces;
let server: MockServer;

const $ = (selector: string): HTMLElement | null => document.querySelector<HTMLElement>(selector);
const texts = (selector: string): string[] =>
  Array.from(document.querySelectorAll<HTMLElement>(selector), (el) => el.textContent ?? '');
/** Let the clocks and the frames run, and React with them. */
const settle = (ms = 0): Promise<void> => act(() => vi.advanceTimersByTimeAsync(ms).then(() => {}));
/** The button whose label is `label`, or starts with it when no label is exactly that. */
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
/** A click on the first element that matches the selector. */
async function click(selector: string): Promise<void> {
  const el = $(selector);
  if (!el) throw new Error(`Nothing to click: ${selector}`);
  await clickOn(el, selector);
}
/** A door of the index, by its name: a link, a button, or a card that cannot be followed. */
const door = (name: string): HTMLElement => {
  const el = Array.from(document.querySelectorAll<HTMLElement>('#online .sk-way')).find(
    (way) => way.querySelector('b')?.textContent === name,
  );
  if (!el) throw new Error(`No door is called "${name}"`);
  return el;
};
/** Whether that door can be gone through: one that cannot is neither a link nor a button. */
const isOpen = (name: string): boolean => door(name).getAttribute('aria-disabled') !== 'true';
/** A click on the button with that label. */
const press = (label: string): Promise<void> => clickOn(button(label), `"${label}"`);
/** Type into a field React controls. */
async function type(selector: string, value: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`Nothing to type into: ${selector}`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(0);
  });
}
async function renderApp(transport: Transport = server.transport()): Promise<void> {
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <StrictMode>
        <App
          places={places}
          backend={{
            transport,
            // The home asks who this browser is, and is told nobody. Nothing else is answered.
            rest: (method, path) =>
              method === 'GET' && path === '/me'
                ? Promise.resolve({ status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'No session.' } } })
                : Promise.reject(new Error('This screen test has no REST')),
          }}
        />
      </StrictMode>,
    );
    await vi.advanceTimersByTimeAsync(0);
  });
}
/** The page goes away: closed, or about to be loaded again. What it left in localStorage stays. */
function closePage(): void {
  act(() => root?.unmount());
  root = null;
}
const CLOCKS = { bidMs: 3000, playMs: 300, abilityMs: 300, trickEndMs: 100, roundEndMs: 200 };
const makeServer = (store?: MockStore): MockServer =>
  new MockServer({ random: seeded(4), timers: CLOCKS, bot: { minMs: 40, maxMs: 80 }, store });
/** From the home screen to the lobby of a new private table with five short rounds. */
async function createTable(): Promise<void> {
  await click('.sk-home a[href="/skull-king/online"]');
  await click('#online a[href="/skull-king/online/new"]');
  await press('Swift');
  await press('Open table');
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
  server = makeServer();
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('playing online', () => {
  it('connects when the hub opens, and not before', async () => {
    await renderApp();
    expect($('#online')).toBeNull();
    expect($('#app')?.hidden).toBe(false);
    act(() => {
      $('#gameon a[href="/skull-king/online"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // The hub is up at once, and says it is still connecting.
    expect($('#app')?.hidden).toBe(true);
    expect($('#online h1, #online h2')?.textContent).toBe('Online');
    expect(texts('#online .pill')).toEqual(['Connecting…']);
    expect($('#online .notice b')?.textContent).toBe('Finding the tavern…');
    expect(['Quick play', 'Public tables', 'Your table'].map(isOpen)).toEqual([false, false, false]);
    expect(button('Join with a code').disabled).toBe(true);

    await settle();
    expect(texts('#online .pill')).toEqual(['Connected']);
    expect($('#online .notice')).toBeNull();
    expect(['Quick play', 'Public tables', 'Your table'].map(isOpen)).toEqual([true, true, true]);
    expect(button('Join with a code').disabled).toBe(false);

    // Back is back: the home screen, and the connection is given up.
    await click('[aria-label="Back"]');
    expect($('#online')).toBeNull();
    expect($('#app')?.hidden).toBe(false);
    expect($('.sk-home')).not.toBeNull();
  });

  it('plays the menu music on the hub, where the home screen was, and keeps it on the way back', async () => {
    const music = vi.spyOn(Sound, 'music');
    const wanted = (): boolean | undefined => music.mock.calls.at(-1)?.[0];
    await renderApp();
    // jsdom is not a real browser, so the greeting that arms the theme is not opened for us.
    ui.sheet = 'welcome';
    render();
    await click('[data-act="welcomeIn"]');
    expect(wanted()).toBe(true);
    await click('#gameon a[href="/skull-king/online"]');
    expect(wanted()).toBe(true);
    await click('[aria-label="Back"]');
    expect(wanted()).toBe(true);
  });

  it('creates a private table, waits for a second pirate, starts with a bot in the third seat and bids', async () => {
    await renderApp();
    await createTable();

    // The lobby of the new table: a code to share, the host alone, three open seats.
    expect($('#online h1, #online h2')?.textContent).toBe('Your table');
    expect(texts('#online .on-bar .pill')).toEqual(['Private']);
    expect($('#online .code')?.textContent).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(texts('#online .member b').map((n) => n.replace(/\d/g, '#'))).toEqual(['Guest ####']);
    expect(texts('#online .member small')).toEqual(['Host · you']);
    expect(texts('#online .member.open')).toHaveLength(3);
    expect($('#online .on-rules b')?.textContent).toBe('Swift · 5 rounds');
    expect($('#online .on-rules small')?.textContent).toBe('Classic scoring');
    const waiting = 'The table can start once a second pirate sits down. Share the code.';
    expect($('#online .foot-hint')?.textContent).toBe(waiting);
    expect(button('Start').disabled).toBe(true);

    // A bot takes a seat, but it is not the second pirate: ready or not, the host cannot start.
    await press('Add a bot');
    expect(texts('#online .member small')).toEqual(['Host · you', 'Bot']);
    expect($('#online .on-crew .label')?.textContent).toBe('Crew · 2 of 4');
    expect($('#online .foot-hint')?.textContent).toBe(waiting);
    expect(button('Start').disabled).toBe(true);
    await press("I'm ready");
    expect(texts('#online .member .pill')).toEqual(['Ready']);
    expect(button('Not ready')).toBeDefined();
    expect($('#online .foot-hint')?.textContent).toBe(waiting);
    expect(button('Start').disabled).toBe(true);

    // Somebody sits down: the table waits for them to be ready, and then the host may start.
    const friend = await connectRaw(server.transport());
    await settle();
    friend.send({ t: 'lobby.join', code: $('#online .code')?.textContent ?? '' });
    await settle();
    expect(texts('#online .member small')).toEqual(['Host · you', 'Bot', 'Guest']);
    expect($('#online .foot-hint')?.textContent).toMatch(/^Waiting for Guest \d{4} to be ready\.$/);
    expect(button('Start').disabled).toBe(true);
    friend.send({ t: 'lobby.ready', ready: true });
    await settle();
    expect($('#online .foot-hint')?.textContent).toBe('Everyone is ready. Start when you like.');

    await press('Start');
    // The game is played at the renderer's table: the online screens step aside.
    expect($('#online')).toBeNull();
    expect($('#app')?.hidden).toBe(false);
    expect(ui.screen).toBe('game');
    expect(session.table?.localSeats).toEqual([0]);
    expect(document.querySelectorAll('#app .hand .hslot')).toHaveLength(5);
    expect(texts('#app .seat .sname').map((n) => n.replace(/\d/g, '#'))).toEqual(['Anne', 'Guest ####']);
    expect($('#app .bidsheet')).not.toBeNull();
    // The bid is on the server's clock: a ring around each person, none around the bot, who has none.
    expect($('#app .mebar .ring')?.getAttribute('style')).toContain('--left:3000ms');
    expect(document.querySelectorAll('#app .seat .ring')).toHaveLength(1);

    $('#bid')?.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true, cancelable: true }));
    await click('[data-act="bid"]');
    expect(tableView().bids[0]).toBe(2);
    expect(ui.waiting).toBe(false);
    expect($('#app .mebar .ring')).toBeNull();
    friend.send({ t: 'game.bid', at: { round: 0, trick: 0 }, bid: 0 });
    await settle();
    expect($('#app .ring')).toBeNull(); // nobody is waited for on a clock now
    // The bot bids on the server's clock, and the bids are turned over for everyone at once.
    await settle(1500);
    expect(tableView().phase).not.toBe('bidding');
    expect(tableView().bids.every((b) => b != null && b >= 0)).toBe(true);
    // None of this is the offline game's: nothing was saved on the device for it.
    expect(localStorage.getItem('skullking-tavern.game.v2')).toBeNull();
  });

  it('changes the rules as host, which clears every ready, and removes a bot again', async () => {
    await renderApp();
    await createTable();
    await press('Add a bot');
    await press("I'm ready");
    await press('Change');
    expect($('#online h1, #online h2')?.textContent).toBe('Table rules');
    expect($('#online .sk-hints')?.textContent).toBe("Saving new rules clears everyone's ready.");
    // The rules are the cards of a new table. Who can join, and whether bots are seated, is not asked again.
    expect($('#online .on-intro')).toBeNull();
    expect(texts('#online .toggle .grow').map((t) => t.split(/(?=[A-Z])/)[0])).not.toContain('Seat bots');
    expect(texts('#online .label')).toEqual(['Rounds', 'Scoring', 'Advanced']);
    await press('Rascal');
    await press('Kraken');
    await press('Save rules');
    expect($('#online h1, #online h2')?.textContent).toBe('Your table');
    expect($('#online .on-rules b')?.textContent).toBe('Swift · 5 rounds');
    expect($('#online .on-rules small')?.textContent).toBe('Rascal scoring · Kraken');
    expect(texts('#online .member small')).toEqual(['Host · you', 'Bot']);
    expect(texts('#online .member .pill')).toEqual(['Not ready']);
    // The table is as large as it was: the form has no control for its seats.
    expect($('#online .on-crew .label')?.textContent).toBe('Crew · 2 of 4');

    await click('[aria-label="Remove Anne"]');
    expect(texts('#online .member small')).toEqual(['Host · you']);
    // The rules the table was made with are remembered on this device for the next one.
    expect(JSON.parse(localStorage.getItem('skullking-tavern.lobby.v1') ?? '{}')).toMatchObject({
      maxPlayers: 4,
      format: 'swift',
      scoring: 'rascal',
      kraken: true,
      botLevel: 'normal',
      pace: 'standard',
    });
  });

  describe('with a friend', () => {
    let friend: RawClient;
    /** The friend's table, made from another connection: this page joins it by its code. */
    async function friendsTable(): Promise<string> {
      friend = await connectRaw(server.transport());
      await settle();
      friend.send({
        t: 'lobby.create',
        visibility: 'private',
        settings: {
          maxPlayers: 3,
          scoring: 'classic',
          format: 'swift',
          loot: false,
          kraken: false,
          whale: false,
          abilities: false,
          botLevel: 'normal',
          pace: 'standard',
        },
      });
      await settle();
      const code = framesOf(friend, 'ok').at(-1)?.lobby?.code;
      if (!code) throw new Error('The friend has no table');
      return code;
    }

    it('joins by code, says so when the code is wrong, and waits for the host as a guest', async () => {
      const code = await friendsTable();
      await renderApp();
      await click('#gameon a[href="/skull-king/online"]');
      await press('Join with a code');
      expect(button('Join table').disabled).toBe(true);
      await type('#table-code', 'zz-zz zz!');
      expect($('#table-code')).toHaveProperty('value', 'ZZZZZZ');
      await press('Join table');
      expect($('#online [role="alert"]')?.textContent).toBe('No table has that code. Check it with the host.');
      expect($('#table-code')?.getAttribute('aria-invalid')).toBe('true');

      await type('#table-code', code.toLowerCase());
      expect($('#online [role="alert"]')).toBeNull();
      await press('Join table');
      expect($('#online h1, #online h2')?.textContent).toBe('Table');
      expect($('#online .code')?.textContent).toBe(code);
      expect(texts('#online .member small')).toEqual(['Host', 'You']);
      // A guest readies and waits: the bots, the rules and the start are the host's.
      expect(texts('#online button').filter((t) => ['Add a bot', 'Change', 'Start'].includes(t))).toEqual([]);
      expect($('#online .foot-hint')?.textContent).toBe('Say you are ready when you are set.');
      await press("I'm ready");
      expect($('#online .foot-hint')?.textContent).toMatch(/^Waiting for Guest \d{4} to be ready\.$/);

      friend.send({ t: 'lobby.ready', ready: true });
      await settle();
      expect($('#online .foot-hint')?.textContent).toBe('Everyone is ready. The host starts the game.');
      friend.send({ t: 'lobby.start' });
      await settle();
      expect(ui.screen).toBe('game');
      expect(session.table?.localSeats).toEqual([1]);
      expect($('#online')).toBeNull();
    });

    it('is told when the host removes them, and can read it and move on', async () => {
      const code = await friendsTable();
      await renderApp();
      await click('#gameon a[href="/skull-king/online"]');
      await press('Join with a code');
      await type('#table-code', code);
      await press('Join table');
      const me = framesOf(friend, 'lobby.state').at(-1)?.lobby.members[1];
      friend.send({ t: 'lobby.kick', userId: me?.kind === 'human' ? me.user.id : '' });
      await settle();
      expect($('#online h1, #online h2')?.textContent).toBe('Online');
      expect($('#online .notice.gold b')?.textContent).toBe('The host removed you from the table');
      await press('OK');
      expect($('#online .notice')).toBeNull();
    });

    it('leaves a running game after being asked, lands on the hub, and hears how the game ended', async () => {
      const code = await friendsTable();
      await renderApp();
      await click('#gameon a[href="/skull-king/online"]');
      await press('Join with a code');
      await type('#table-code', code);
      await press('Join table');
      await press("I'm ready");
      friend.send({ t: 'lobby.addBot' });
      friend.send({ t: 'lobby.ready', ready: true });
      await settle();
      friend.send({ t: 'lobby.start' });
      await settle();
      expect(ui.screen).toBe('game');

      await click('#app .g-top [data-act="home"]');
      expect($('#app .sheet h2')?.textContent).toBe('Leave the table?');
      await click('[data-act="leaveTable"]');
      await settle();
      // The table is down and so is the seat in the lobby: this is the hub.
      expect($('#app')?.hidden).toBe(true);
      expect($('#online h1, #online h2')?.textContent).toBe('Online');
      expect(session.table).toBeNull();
      expect($('#online .notice')).toBeNull();
      expect(framesOf(friend, 'lobby.state').at(-1)?.lobby.members).toHaveLength(2);

      // The others play to the end. The result reaches the one who left as a notice, not as a table.
      for (let i = 0; i < 400 && !framesOf(friend, 'game.over').length; i++) await settle(250);
      expect(framesOf(friend, 'game.over')).toHaveLength(1);
      expect($('#online .notice.gold b')?.textContent).toBe('Your last game is over');
      expect($('#online .notice.gold p')?.textContent).toMatch(
        /^You left before the end\. Final place: \d(st|nd|rd) of 3\.$/,
      );
      expect($('#online h1, #online h2')?.textContent).toBe('Online');
      expect(session.table).toBeNull();
    });
  });

  it("opens the renderer's sound settings over an online screen, which takes no input meanwhile", async () => {
    await renderApp();
    await click('.sk-home a[href="/skull-king/online"]');
    await settle();
    // The renderer is at home under the online screens, and not to be seen.
    expect($('#app')?.hidden).toBe(true);
    expect($('#online')?.hasAttribute('inert')).toBe(false);
    await click('#online .on-bar [data-act="soundSheet"]');
    // Its sheet is the one thing it draws there. The screen behind it is out of reach.
    expect($('#app .sheet')?.getAttribute('aria-label')).toBe('Sound settings');
    expect($('#app')?.hidden).toBe(false);
    expect($('#app')?.hasAttribute('data-behind')).toBe(true);
    expect($('#online')?.hasAttribute('inert')).toBe(true);
    expect($('#online h1')?.textContent).toBe('Online');
    await click('[data-act="closeSheet"]');
    expect($('#app .sheet')).toBeNull();
    expect($('#app')?.hidden).toBe(true);
    expect($('#online')?.hasAttribute('inert')).toBe(false);
    // Nothing of this was the connection's business.
    expect(texts('#online .pill')).toEqual(['Connected']);
  });

  it('takes the keyboard to the title of each screen it opens', async () => {
    await renderApp();
    await click('#gameon a[href="/skull-king/online"]');
    await settle();
    expect(document.activeElement).toBe($('#online h1, #online h2'));
    expect(document.activeElement?.textContent).toBe('Online');
    await press('Join with a code');
    expect(document.activeElement?.textContent).toBe('Join a table');
    await click('#online [aria-label="Back"]');
    expect(document.activeElement?.textContent).toBe('Online');
  });

  it('tells the player to reload when the server no longer speaks the protocol of this page', async () => {
    // The page says hello in a protocol the server has left behind: it answers PROTOCOL_UNSUPPORTED.
    const old: Transport = async () => {
      const inner = await server.transport()();
      return {
        send: (data) => {
          const frame = JSON.parse(data) as { t: string; protocol?: number };
          inner.send(frame.t === 'hello' ? JSON.stringify({ ...frame, protocol: 0 }) : data);
        },
        close: () => inner.close(),
        get onmessage() {
          return inner.onmessage;
        },
        set onmessage(handler) {
          inner.onmessage = handler;
        },
        get onclose() {
          return inner.onclose;
        },
        set onclose(handler) {
          inner.onclose = handler;
        },
      };
    };
    await renderApp(old);
    await click('#gameon a[href="/skull-king/online"]');
    await settle();
    expect(texts('#online .pill')).toEqual(['Update needed']);
    expect($('#online .notice[role="alert"] b')?.textContent).toBe('The tavern has moved on');
    expect($('#online .notice[role="alert"] p')?.textContent).toBe(
      'This page is older than the server. Reload to update.',
    );
    expect(isOpen('Your table')).toBe(false);
    expect(reloadPage).not.toHaveBeenCalled();
    await press('Reload to update');
    expect(reloadPage).toHaveBeenCalledTimes(1);
    // It does not try again by itself: only a new page can speak to this server.
    await settle(60_000);
    expect(texts('#online .pill')).toEqual(['Update needed']);
  });

  it('shows the way to the offline modes when the server cannot be reached', async () => {
    server.drop(true);
    await renderApp();
    await click('#gameon a[href="/skull-king/online"]');
    await settle();
    expect($('#online .notice p:last-of-type')?.textContent).toBe(
      'Bots, one phone for the crew and the scoresheet need no connection.',
    );
    await press('Play offline');
    expect($('#online')).toBeNull();
    expect($('.sk-home')).not.toBeNull();
    expect(ui.screen).toBe('home');
  });

  it('says when the server cannot be reached, keeps trying, and recovers', async () => {
    server.drop(true);
    await renderApp();
    await click('#gameon a[href="/skull-king/online"]');
    await settle();
    expect(texts('#online .pill')).toEqual(['Offline']);
    expect($('#online .notice b')?.textContent).toBe("Can't reach the tavern");
    expect(texts('#online .notice .btn')).toEqual(['Try now', 'Play offline']);
    expect(isOpen('Your table')).toBe(false);
    server.restore();
    await press('Try now');
    await settle();
    expect(texts('#online .pill')).toEqual(['Connected']);
    expect($('#online .notice')).toBeNull();
  });

  it('pauses when the same player connects from somewhere else, until asked to play here', async () => {
    const as = server.browser();
    root = createRoot(host);
    await act(async () => {
      root?.render(<App backend={as} places={places} />);
      await vi.advanceTimersByTimeAsync(0);
    });
    await click('#gameon a[href="/skull-king/online"]');
    await settle();
    const elsewhere = await connectRaw(as.transport);
    await settle();
    expect(texts('#online .pill')).toEqual(['Paused']);
    expect($('#online .notice b')?.textContent).toBe('Playing in another tab');
    await settle(60_000);
    expect(texts('#online .pill')).toEqual(['Paused']); // it does not fight for the seat on its own
    await press('Play here');
    await settle();
    expect(texts('#online .pill')).toEqual(['Connected']);
    expect(elsewhere.closed).toBe(4001);
  });

  describe('at a table with a friend', () => {
    let friend: RawClient;
    /** This page hosts a table of three: itself, a friend on another connection, and a bot. The game is on. */
    async function seated(transport?: Transport): Promise<void> {
      await renderApp(transport);
      await click('#gameon a[href="/skull-king/online"]');
      await click('#online a[href="/skull-king/online/new"]');
      await press('Swift');
      await press('Open table');
      friend = await connectRaw(server.transport('the-friend'));
      await settle();
      friend.send({ t: 'lobby.join', code: $('#online .code')?.textContent ?? '' });
      friend.send({ t: 'lobby.ready', ready: true });
      await press('Add a bot');
      await press("I'm ready");
      await press('Start');
      expect(ui.screen).toBe('game');
    }
    const seatOf = (name: RegExp): HTMLElement => {
      const seat = Array.from(document.querySelectorAll<HTMLElement>('#app .seat')).find((el) =>
        name.test(el.querySelector('.sname')?.textContent ?? ''),
      );
      if (!seat) throw new Error(`No seat for ${name}`);
      return seat;
    };

    it('shows the bid deadline as a ring on both people, and takes it off each as they bid', async () => {
      await seated();
      expect($('#app .mebar .ring')).not.toBeNull();
      expect(seatOf(/^Guest/).querySelector('.ring')).not.toBeNull();
      expect(seatOf(/^Anne/).querySelector('.ring')).toBeNull();
      // A second in, a third of the clock is gone.
      await settle(1000);
      friend.send({ t: 'game.bid', at: { round: 0, trick: 0 }, bid: 0 });
      await settle();
      expect(seatOf(/^Guest/).querySelector('.ring')).toBeNull();
      const style = $('#app .mebar .ring')?.getAttribute('style') ?? '';
      expect(style).toContain('--left:2000ms');
      expect(style).toContain('--gone:33.3');

      // The deadline passes: the server bids for this seat, and says so.
      await settle(1990);
      expect(tableView().bids[0]).toBeNull();
      for (let i = 0; i < 100 && tableView().bids[0] == null; i++) await settle(10);
      expect(tableView().bids[0]).not.toBeNull();
      expect(tableView().phase).not.toBe('bidding');
      expect($('#app .felt .pill.gold')?.textContent).toBe('Time ran out · the table played for you');
    });

    it('tags the friend as offline when their connection drops, and takes the tag off when they are back', async () => {
      await seated();
      expect($('#app .presence')).toBeNull();
      friend.close();
      await settle();
      const seat = seatOf(/^Guest/);
      expect(seat.querySelector('.presence.off')?.textContent).toBe('Offline');
      expect(seat.classList.contains('gone')).toBe(true);
      expect(session.table?.view(0).online?.status).toEqual(['online', 'offline', 'bot']);

      friend = await connectRaw(server.transport('the-friend'));
      await settle();
      expect($('#app .presence')).toBeNull();
      expect(seatOf(/^Guest/).classList.contains('gone')).toBe(false);
    });

    it('covers the table while the server cannot be heard, and comes back to the same hand', async () => {
      await seated();
      const hand = tableView().hand;
      $('#bid')?.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true }));
      await click('[data-act="bid"]');
      expect(tableView().bids[0]).toBe(1);
      expect($('.table-overlay')).toBeNull();
      expect($('#app')?.hasAttribute('inert')).toBe(false);

      server.drop(true);
      await settle();
      expect($('.table-overlay h2')?.textContent).toBe('Connection lost');
      expect($('.table-overlay')?.getAttribute('role')).toBe('alertdialog');
      // The table underneath takes no input: the keyboard is on the one thing that can be done.
      expect(document.activeElement).toBe($('.table-overlay button'));
      expect($('#app')?.hasAttribute('inert')).toBe(true);
      expect(ui.screen).toBe('game'); // the table stays where it was, underneath

      server.restore();
      await press('Try now');
      await settle();
      expect($('.table-overlay')).toBeNull();
      expect($('#app')?.hasAttribute('inert')).toBe(false);
      expect(tableView().hand).toEqual(hand);
      expect(tableView().bids[0]).toBe(1);
    });

    it('says so on the table when the same player connects from somewhere else', async () => {
      const as = server.transport('this-page');
      await seated(as);
      await connectRaw(as);
      await settle();
      expect($('.table-overlay h2')?.textContent).toBe('Playing in another tab');
      expect(button('Play here')).toBeDefined();
    });
  });

  describe('after a reload', () => {
    /** A mock that outlives its page, as the one behind `?mock` does in sessionStorage. */
    let kept: string | null;
    const store: MockStore = {
      load: () => kept,
      save: (data) => {
        kept = data;
      },
    };
    beforeEach(() => {
      kept = null;
      server = makeServer(store);
    });
    /** The page is loaded again: everything in it is new, the mock included. Only what was stored is left. */
    async function reload(): Promise<void> {
      await settle();
      closePage();
      server.shutDown();
      server = makeServer(store);
      await renderApp(server.transport('this-page'));
      await settle();
    }
    /** A game of this page and a friend on a connection of their own, with both bids already in. */
    async function midHand(): Promise<void> {
      await renderApp(server.transport('this-page'));
      await createTable();
      const friend = await connectRaw(server.transport('the-friend'));
      await settle();
      friend.send({ t: 'lobby.join', code: $('#online .code')?.textContent ?? '' });
      friend.send({ t: 'lobby.ready', ready: true });
      await press("I'm ready");
      await press('Start');
      $('#bid')?.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true, cancelable: true }));
      await click('[data-act="bid"]');
      friend.send({ t: 'game.bid', at: { round: 0, trick: 0 }, bid: 0 });
      await settle(1500);
      expect(tableView().phase).toBe('playing');
    }

    it('goes straight back to the table and the same hand, without being asked', async () => {
      await midHand();
      const before = tableView(),
        sent = { hand: before.hand, bids: before.bids, trick: before.trick, round: before.round };
      await reload();
      // No tap on "Play online": the last page was seated, so this one connected by itself.
      expect($('#online')).toBeNull();
      expect($('#app')?.hidden).toBe(false);
      expect(ui.screen).toBe('game');
      expect(session.table?.localSeats).toEqual([0]);
      const after = tableView();
      expect({ hand: after.hand, bids: after.bids, trick: after.trick, round: after.round }).toEqual(sent);
      expect(document.querySelectorAll('#app .hand .hslot')).toHaveLength(after.hand.length);
      // The seat is online again, the friend's page is still gone, and the table goes on from here.
      expect(after.online?.status).toEqual(['online', 'offline']);
      expect($('.table-overlay')).toBeNull();
      await settle(2000);
      const later = tableView();
      expect({ round: later.round, hand: later.hand }).not.toEqual({ round: sent.round, hand: sent.hand });
    });

    it('goes back to the lobby when that is where the player sat', async () => {
      await renderApp(server.transport('this-page'));
      await createTable();
      await press('Add a bot');
      const code = $('#online .code')?.textContent;
      await reload();
      expect($('#online h1, #online h2')?.textContent).toBe('Your table');
      expect($('#online .code')?.textContent).toBe(code);
      expect(texts('#online .member small')).toEqual(['Host · you', 'Bot']);
    });

    it('comes back to the hub when that is what the player was looking at: the address is still the hub', async () => {
      await renderApp(server.transport('this-page'));
      await click('#gameon a[href="/skull-king/online"]');
      await settle();
      expect(places.path()).toBe('/skull-king/online');
      await reload();
      expect(places.path()).toBe('/skull-king/online');
      expect($('#online h1, #online h2')?.textContent).toBe('Online');
      expect(texts('#online .pill')).toEqual(['Connected']);
      // Back is still the way out, to the home screen it was reached from.
      await click('[aria-label="Back"]');
      expect(places.path()).toBe('/skull-king');
      expect($('#online')).toBeNull();
      expect($('.sk-home')).not.toBeNull();
    });

    it('opens on the home screen for a player who was only looking at the hub and comes in at the front door', async () => {
      await renderApp(server.transport('this-page'));
      await click('#gameon a[href="/skull-king/online"]');
      await settle();
      closePage();
      // Another tab, or the installed app opened again: nobody is seated, so nothing connects by itself.
      places = memoryPlaces('/skull-king');
      await renderApp(server.transport('this-page'));
      await settle();
      expect(places.path()).toBe('/skull-king');
      expect($('#online')).toBeNull();
      expect($('.sk-home')).not.toBeNull();
    });

    it('says the seat is lost when the page stayed away for two turns, and opens no table for the game that goes on', async () => {
      await midHand();
      await settle();
      closePage();
      // The clock plays this seat's turn twice. The second time closes the seat, and the friend plays on.
      await settle(3000);
      await renderApp(server.transport('this-page'));
      await settle();
      // welcome has no game and no lobby, and the news follows it: this is the hub.
      expect(session.table).toBeNull();
      expect(ui.screen).toBe('home');
      expect($('#app')?.hidden).toBe(true);
      expect($('#online h1, #online h2')?.textContent).toBe('Online');
      expect($('#online .notice.gold b')?.textContent).toBe('You lost your seat');
      expect($('#online .notice.gold p')?.textContent).toBe(
        'You were away for two turns in a row. The game goes on without you.',
      );
      await press('OK');
      expect($('#online .notice')).toBeNull();
    });

    it('shows the result of a game that ended while the page was away, with the seat that was lost in it', async () => {
      await midHand();
      await settle();
      closePage();
      // Nobody comes back. The seat is closed, the table plays it, and the game runs to its end.
      await settle(180_000);
      await renderApp(server.transport('this-page'));
      await settle();
      // The lost seat and the stored game.over both follow the welcome: the result is what is shown.
      expect(session.table).toBeNull();
      expect(ui.screen).toBe('home');
      expect($('#app')?.hidden).toBe(true);
      expect($('#online h1, #online h2')?.textContent).toBe('Online');
      expect($('#online .notice.gold b')?.textContent).toBe('Your last game is over');
      expect($('#online .notice.gold p')?.textContent).toMatch(
        /^You lost your seat before the end\. Final place: (1st|2nd) of 2\.$/,
      );
      await press('OK');
      expect($('#online .notice')).toBeNull();
    });

    it("keeps the table through the browser's Back: a seat is left by the table's own way out, and then the hub is where the page is", async () => {
      await midHand();
      expect(places.path()).toBe('/skull-king/table');
      const before = places.entries();
      await act(async () => {
        places.back();
        await vi.advanceTimersByTimeAsync(0);
      });
      // Still seated on the server, so still at the table, and at its address.
      expect(places.path()).toBe('/skull-king/table');
      expect(places.entries()).toEqual(before);
      expect($('#online')).toBeNull();
      expect($('#app')?.hidden).toBe(false);
      expect(ui.screen).toBe('game');
      expect(session.table).not.toBeNull();

      await click('#app .g-top [data-act="home"]');
      await click('[data-act="leaveTable"]');
      await settle();
      expect($('#online h1, #online h2')?.textContent).toBe('Online');
      // The hub takes the table's place: there is no table to go back to.
      expect(places.path()).toBe('/skull-king/online');
      expect(places.entries().paths).not.toContain('/skull-king/table');
    });

    it('shows the result of a game the player left, on the hub, the next time they come online', async () => {
      await midHand();
      await click('#app .g-top [data-act="home"]');
      await click('[data-act="leaveTable"]');
      await settle();
      expect($('#online h1, #online h2')?.textContent).toBe('Online');
      closePage();
      await settle(120_000);

      // Not seated any more: a page opened afresh, at the front door, waits to be asked.
      places = memoryPlaces('/skull-king');
      await renderApp(server.transport('this-page'));
      expect($('#online')).toBeNull();
      await click('#gameon a[href="/skull-king/online"]');
      await settle();
      expect($('#online h1, #online h2')?.textContent).toBe('Online');
      expect(session.table).toBeNull();
      expect($('#online .notice.gold p')?.textContent).toMatch(
        /^You left before the end\. Final place: (1st|2nd) of 2\.$/,
      );
    });
  });

  it('leaves the offline game as it was: a solo round after a visit to the hub is saved and counted on the device', async () => {
    await renderApp();
    await click('#gameon a[href="/skull-king/online"]');
    await settle();
    await click('[aria-label="Back"]');
    await click('#gameon a[href="/skull-king/one-screen"]');
    await click('[data-act="start"]');
    expect(ui.screen).toBe('game');
    expect(session.online).toBeNull();
    expect(session.table?.localSeats).toEqual([0]);
    expect($('#app .g-top [data-act="home"]')?.getAttribute('aria-label')).toBe('Leave table (game is saved)');
    // The bots bid, and every step of an offline game is saved on the device.
    await settle(3000);
    expect(localStorage.getItem('skullking-tavern.game.v2')).toContain('"phase":"bidding"');
    // Leaving an offline table asks nothing: the game is on the device.
    await click('#app .g-top [data-act="home"]');
    expect(ui.screen).toBe('home');
    expect($('#app .sheet')).toBeNull();
    expect($('.sk-jump-text > span')?.textContent).toBe('Round 1 of 10 · offline, on this device only');
    expect($('.sk-jump a.btn')?.textContent).toBe('Continue');
    expect(stats.games).toBe(0);
  });
});

describe('the addresses of the online screens', () => {
  /** Open the page at an address, as a typed address, a link or a bookmark does. */
  async function openAt(at: string): Promise<void> {
    places = memoryPlaces(at);
    await renderApp();
    await settle();
  }

  it('connects by itself and opens the page its address names', async () => {
    await openAt('/skull-king/online/join');
    expect($('#online h1, #online h2')?.textContent).toBe('Join a table');
    expect($('#app')?.hidden).toBe(true);
    closePage();
    await openAt('/skull-king/online/public');
    expect($('#online h1, #online h2')?.textContent).toBe('Public tables');
    closePage();
    await openAt('/skull-king/online/new');
    expect($('#online h1, #online h2')?.textContent).toBe('Your table');
    expect(texts('#online .on-intro .pill')).toEqual(['Private']);
    closePage();
    await openAt('/skull-king/online/public/new');
    expect($('#online h1, #online h2')?.textContent).toBe('Public table');
    expect(texts('#online .on-intro .pill')).toEqual(['Public']);
    closePage();
    await openAt('/skull-king/ranked');
    expect($('#online h1, #online h2')?.textContent).toBe('Ranked');
    expect(places.entries()).toEqual({ paths: ['/skull-king/ranked'], at: 0 });
    closePage();
    await openAt('/ladder');
    expect($('#online h1, #online h2')?.textContent).toBe('Ladder');
    closePage();
    await openAt('/profile');
    expect($('#online h1, #online h2')?.textContent).toBe('Your profile');
  });

  it('moves the address with every page, and Back is the way the player came', async () => {
    await openAt('/skull-king');
    await click('#gameon a[href="/skull-king/online"]');
    await settle();
    await click('#online a[href="/skull-king/online/new"]');
    expect(places.entries()).toEqual({
      paths: ['/skull-king', '/skull-king/online', '/skull-king/online/new'],
      at: 2,
    });
    await click('[aria-label="Back"]');
    expect($('#online h1, #online h2')?.textContent).toBe('Online');
    expect(places.entries().at).toBe(1);

    await click('#online a[href="/skull-king/online/public"]');
    await press('Create a public table');
    expect(places.path()).toBe('/skull-king/online/public/new');
    // Back from a new public table is the list it was reached from, not the hub.
    await click('[aria-label="Back"]');
    expect($('#online h1, #online h2')?.textContent).toBe('Public tables');
    expect(places.path()).toBe('/skull-king/online/public');
    await click('[aria-label="Back"]');
    expect(places.path()).toBe('/skull-king/online');
    await click('[aria-label="Back"]');
    expect(places.path()).toBe('/skull-king');
    expect($('#online')).toBeNull();
    expect($('.sk-home')).not.toBeNull();
  });

  it("follows the browser's Back and Forward between the hub, a page of it and the home screen, and hangs up at home", async () => {
    await openAt('/skull-king');
    await click('#gameon a[href="/skull-king/online"]');
    await settle();
    await press('Join with a code');
    const go = async (move: () => void): Promise<void> => {
      await act(async () => {
        move();
        await vi.advanceTimersByTimeAsync(0);
      });
    };
    await go(() => places.back());
    expect($('#online h1, #online h2')?.textContent).toBe('Online');
    expect(texts('#online .pill')).toEqual(['Connected']);
    await go(() => places.back());
    expect($('#online')).toBeNull();
    expect($('.sk-home')).not.toBeNull();
    await go(() => places.forward());
    await settle();
    expect($('#online h1, #online h2')?.textContent).toBe('Online');
    expect(texts('#online .pill')).toEqual(['Connected']);
    await go(() => places.forward());
    expect($('#online h1, #online h2')?.textContent).toBe('Join a table');
  });

  it('sits down at a table from a page opened by its address, and the lobby is at the hub', async () => {
    await openAt('/skull-king/online/new');
    await press('Open table');
    expect($('#online h1, #online h2')?.textContent).toBe('Your table');
    // Opened by its address, the form has no way back: the hub takes its place.
    expect(places.entries()).toEqual({ paths: ['/skull-king/online'], at: 0 });
  });
});

describe('what a notice says', () => {
  it('says a lost seat is a forfeit only in a ranked game', () => {
    expect(noticeText({ kind: 'seatLost', ranked: false })).toEqual({
      title: 'You lost your seat',
      text: 'You were away for two turns in a row. The game goes on without you.',
    });
    expect(noticeText({ kind: 'seatLost', ranked: true })).toEqual({
      title: 'You lost your seat',
      text: 'You were away for two turns in a row. The game goes on without you. It counts as a forfeit.',
    });
  });

  it('says how the seat was given up when the result arrives later', () => {
    const over = { kind: 'gameOver', place: 4, seats: 4, forfeited: true, delta: null } as const;
    expect(noticeText({ ...over, left: false, lost: true }).text).toBe(
      'You lost your seat before the end. Final place: 4th of 4. It counts as a forfeit.',
    );
    expect(noticeText({ ...over, left: true, lost: false }).text).toBe(
      'You left before the end. Final place: 4th of 4. It counts as a forfeit.',
    );
    expect(noticeText({ ...over, left: false, lost: false, forfeited: false }).text).toBe(
      'It ended while you were away. Final place: 4th of 4.',
    );
  });
});
