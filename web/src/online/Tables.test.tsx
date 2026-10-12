// @vitest-environment jsdom
/* The tables of friends and the public ones, on the whole page against the mock server (plan item
   W4): what a new table is asked for with, the table that seats no bots, and what a row of the
   public list says. What is checked is what the page writes to its socket and what it draws from
   what it was sent. The mock's own answers are in src/net/mock/server.test.ts. */
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { App } from '../App';
import type { Backend } from '../net/api';
import { connectRaw, framesOf } from '../net/mock/raw';
import type { RawClient } from '../net/mock/raw';
import { MockServer, STANDARD } from '../net/mock/server';
import type { Wire } from '../net/socket';
import type { LobbySummary } from '../protocol/generated';
import { memoryPlaces } from '../router/places';
import type { MemoryPlaces } from '../router/places';
import { ui } from '../tableview/state';
import { failureText } from './copy';

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
let places: MemoryPlaces;
let server: MockServer;
/** The browser the page runs in, and every frame the page wrote to its socket. */
let page: Backend;
let sent: Record<string, unknown>[];
/** The public list the server answers with, when a test writes it by hand. `down` is a server that does not answer. */
let listed: LobbySummary[] | 'down' | null;
/** A list that was asked for and is kept waiting, until the test lets the answer go. */
let held: (() => void) | null;
let hold: boolean;

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
async function press(label: string): Promise<void> {
  const el = button(label);
  if (el.disabled) throw new Error(`"${label}" is disabled`);
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);
  });
}
const sentOf = (t: string): typeof sent => sent.filter((m) => m.t === t);

/** A backend that writes down what the page sends over its socket, and may answer the public list by hand. */
function recording(inner: Backend): Backend {
  return {
    rest: (method, path, body) => {
      if (listed == null || method !== 'GET' || path !== '/lobbies') return inner.rest(method, path, body);
      if (listed === 'down') return Promise.reject(new Error('The server does not answer'));
      const answer = { status: 200, body: { lobbies: listed } };
      if (!hold) return Promise.resolve(answer);
      return new Promise((resolve) => {
        held = () => resolve(answer);
      });
    },
    transport: async () => {
      const real = await inner.transport();
      const wire: Wire = {
        send: (data) => {
          sent.push(JSON.parse(data) as Record<string, unknown>);
          real.send(data);
        },
        close: () => real.close(),
        onmessage: null,
        onclose: null,
      };
      real.onmessage = (data) => wire.onmessage?.(data);
      real.onclose = (code) => wire.onclose?.(code);
      return wire;
    },
  };
}
/** The page, opened at an address and connected. */
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
/** Another player, on a connection of their own. */
async function someone(): Promise<RawClient> {
  const socket = await connectRaw(server.browser().transport);
  await settle();
  return socket;
}
/** What this device remembers of the last table: other seats, another pace and other bots than a table is opened with. */
const REMEMBERED = {
  ...STANDARD,
  maxPlayers: 7,
  pace: 'fast',
  botLevel: 'hard',
  format: 'even',
  scoring: 'rascal',
  loot: true,
};

beforeEach(() => {
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
  });
  sent = [];
  listed = null;
  held = null;
  hold = false;
  page = recording(server.browser());
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('a new table', () => {
  it.each([
    { door: 'friends', at: '/skull-king/online/new', visibility: 'private', submit: 'Open table' },
    { door: 'public', at: '/skull-king/online/public/new', visibility: 'public', submit: 'List table' },
  ])(
    'of $door is asked for with four seats, the standard pace and normal bots, whatever the device remembers',
    async ({ at, visibility, submit }) => {
      localStorage.setItem('skullking-tavern.lobby.v1', JSON.stringify(REMEMBERED));
      await openAt(at);
      // The rules the device remembers are the ones the cards start on.
      expect(button('Even').getAttribute('aria-pressed')).toBe('true');
      expect(button('Rascal').getAttribute('aria-pressed')).toBe('true');
      expect(button('Loot').getAttribute('aria-pressed')).toBe('true');
      // No seats, no pace and no bot skill to choose, and nothing that makes the table ranked.
      expect(texts('#online .label')).toEqual(['Bots', 'Rounds', 'Scoring', 'Advanced']);
      expect(texts('#online .sk-formats button').map((t) => t.replace(/\d.*$/, ''))).toEqual([
        'Classic',
        'Brawl',
        'Swift',
        'Even',
        'Whirl',
      ]);
      expect(texts('#online .on-scoring button')).toEqual(['ClassicClassic, high risk', 'Rascal10 per card dealt']);
      expect(texts('#online .sk-extras .toggle').map((t) => t.split(/(?<=[a-z])(?=[A-Z])/)[0])).toEqual([
        'Loot',
        'Kraken',
        'Whale',
        'Abilities',
      ]);
      expect($('#online')?.textContent).not.toMatch(/Pace|Bot skill|Ranked|Seats/);
      // The switch is on as the page opens.
      expect(button('Seat bots').getAttribute('aria-pressed')).toBe('true');

      await press(submit);
      expect(sentOf('lobby.create')).toEqual([
        {
          t: 'lobby.create',
          id: expect.any(Number),
          visibility,
          settings: {
            maxPlayers: 4,
            pace: 'standard',
            botLevel: 'normal',
            format: 'even',
            scoring: 'rascal',
            loot: true,
            kraken: false,
            whale: false,
            abilities: false,
          },
        },
      ]);
      // Seat bots on leaves the field out: that is what a table that seats bots is asked for with.
      expect(sentOf('lobby.create')[0]).not.toHaveProperty('allowBots');
      expect($('#online .on-crew .label')?.textContent).toBe('Crew · 1 of 4');
      // The host of such a table may seat a bot, and take it away again.
      await press('Add a bot');
      expect(sentOf('lobby.addBot')).toHaveLength(1);
      expect(texts('#online .member small')).toEqual(['Host · you', 'Bot']);
      expect($('#online [aria-label^="Remove "]')).not.toBeNull();
    },
  );

  it.each([
    { door: 'friends', at: '/skull-king/online/new', submit: 'Open table', share: ' Share the code.' },
    { door: 'public', at: '/skull-king/online/public/new', submit: 'List table', share: '' },
  ])(
    'of $door with Seat bots off is asked for with allowBots false, and has no way to add or remove a bot',
    async ({ at, submit, share }) => {
      await openAt(at);
      await press('Seat bots');
      expect(button('Seat bots').getAttribute('aria-pressed')).toBe('false');
      await press(submit);
      expect(sentOf('lobby.create')).toHaveLength(1);
      // The bot skill is sent all the same: the settings have no place to leave it out.
      expect(sentOf('lobby.create')[0]).toMatchObject({
        allowBots: false,
        settings: { maxPlayers: 4, pace: 'standard', botLevel: 'normal' },
      });

      // The waiting table: the host, three empty seats, and nothing that asks for a bot.
      expect($('#online .on-crew .label')?.textContent).toBe('Crew · 1 of 4');
      expect(texts('#online .member small')).toEqual(['Host · you']);
      expect(texts('#online .member.open')).toHaveLength(3);
      expect(texts('#online button')).not.toContain('Add a bot');
      expect($('#online [aria-label^="Remove "]')).toBeNull();
      // The same start rule as any table: it waits for a second pirate.
      const waiting = `${at.includes('public') ? 'A public table' : 'The table'} can start once a second pirate sits down.${share}`;
      expect($('#online .foot-hint')?.textContent).toBe(waiting);
      await press("I'm ready");
      expect(button('Start').disabled).toBe(true);
      expect(sentOf('lobby.addBot')).toEqual([]);

      const friend = await someone();
      const code = $('#online .code')?.textContent;
      const id = ((await page.rest('GET', '/lobbies')).body as { lobbies: LobbySummary[] }).lobbies[0]?.id;
      friend.send(code ? { t: 'lobby.join', code } : { t: 'lobby.join', lobbyId: id });
      friend.send({ t: 'lobby.ready', ready: true });
      await settle();
      // Both pirates are ready: Start is enabled, the seats that are left stay empty, and still nothing asks for a bot.
      expect($('#online .on-crew .label')?.textContent).toBe('Crew · 2 of 4');
      expect(texts('#online .member.open')).toHaveLength(2);
      expect(texts('#online button')).not.toContain('Add a bot');
      expect(button('Start').disabled).toBe(false);
      await press('Start');
      // The server's start names no kind of table. It is drawn as every online table was.
      expect(framesOf(friend, 'game.start')[0]).not.toHaveProperty('table');
      expect(ui.screen).toBe('game');
      expect($('#app .game')).not.toBeNull();
      expect(texts('#app .seat .sname')).toHaveLength(1);
      expect(sentOf('lobby.addBot')).toEqual([]);
    },
  );

  it('says what the server says when a bot is refused all the same', () => {
    expect(failureText({ ok: false, code: 'BOTS_DISABLED', message: 'x' })).toBe('This table does not seat bots.');
  });
});

describe('the public list', () => {
  const row = (over: Partial<LobbySummary> & { id: string; hostName: string }): LobbySummary => ({
    settings: STANDARD,
    players: 0,
    ...over,
  });

  it('titles a table nobody hosts by the name the server sent, and says of every table whether it seats bots', async () => {
    listed = [
      // The two tables the server keeps open: no host, so no colour, nobody seated, and no word about bots.
      row({ id: '00000000-0000-4000-8000-000000000001', hostName: 'Open table' }),
      row({ id: '00000000-0000-4000-8000-000000000002', hostName: 'Open table' }),
      row({
        id: '00000000-0000-4000-8000-000000000003',
        hostName: 'Calico Jack',
        hostColor: '#ce82ff',
        players: 1,
        settings: { ...STANDARD, format: 'swift' },
        allowBots: false,
      }),
      row({
        id: '00000000-0000-4000-8000-000000000004',
        hostName: 'Kidd',
        hostColor: '#58cc02',
        players: 3,
        settings: { ...STANDARD, format: 'brawl' },
        allowBots: true,
      }),
      row({
        id: '00000000-0000-4000-8000-000000000005',
        hostName: 'Mary Read',
        hostColor: '#ff4b4b',
        players: 4,
        allowBots: false,
      }),
    ];
    await openAt('/skull-king/online/public');
    expect($('#online h1')?.textContent).toBe('Public tables');
    const rows = Array.from(document.querySelectorAll<HTMLElement>('#online .tables li'));
    expect(
      rows.map((li) => [
        li.querySelector('b')?.textContent,
        li.querySelector('.on-row-line')?.firstChild?.textContent,
        li.querySelector('.on-row-line .pill')?.textContent,
        li.querySelector(':scope > .mini, :scope > .pill')?.textContent,
      ]),
    ).toEqual([
      ['Open table', '0 of 4 seats · Classic', 'Bots', 'Join'],
      ['Open table', '0 of 4 seats · Classic', 'Bots', 'Join'],
      ['Calico Jack’s table', '1 of 4 seats · Swift', 'No bots', 'Join'],
      ['Kidd’s table', '3 of 4 seats · Brawl', 'Bots', 'Join'],
      ['Mary Read’s table', '4 of 4 seats · Classic', 'No bots', 'Full'],
    ]);
    // A row is the name the server sent and nothing else of the host's: no colour is made up for it.
    expect(document.querySelectorAll('#online .tables .avatar')).toHaveLength(0);
    expect(button('Create a public table').disabled).toBe(false);
  });

  it('says so when no table is listed, while it is asked, and when it cannot be loaded', async () => {
    listed = [];
    await openAt('/skull-king/online/public');
    expect($('#online .notice')?.textContent).toBe('No public tables right now.');
    // While the list is asked for again.
    hold = true;
    await press('Refresh');
    expect($('#online .notice')?.textContent).toBe('Looking for tables…One moment.');
    expect(button('Refresh').disabled).toBe(true);
    await act(async () => {
      held?.();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect($('#online .notice')?.textContent).toBe('No public tables right now.');

    // The server does not answer.
    hold = false;
    listed = 'down';
    await press('Refresh');
    await settle();
    expect($('#online .notice[role="alert"]')?.textContent).toBe(
      "Couldn't load tablesCheck your connection and try again.Try again",
    );
  });
});
