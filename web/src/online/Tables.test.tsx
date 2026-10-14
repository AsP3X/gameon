// @vitest-environment jsdom
/* The tables of friends and the public ones, on the whole page against the mock server (plan item
   W4): what a new table is asked for with, the table that seats no bots, what a row of the public
   list says, and the invite to a table a player opened with the address it links to. What is checked is what the page writes to its socket and what it draws from
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
/** Every lobby the page is sent is a standing house table (docs/protocol.md §5.3). The mock keeps none of its own. */
let house: boolean;

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
/** The field of the join screen. */
const codeField = (): HTMLInputElement | null => document.querySelector<HTMLInputElement>('#table-code');

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
      real.onmessage = (data) =>
        wire.onmessage?.(
          house && typeof data === 'string' ? data.replaceAll('"visibility":', '"standing":true,"visibility":') : data,
        );
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
/** The page goes away: closed, or about to be loaded again. The browser it ran in keeps its session. */
function closePage(): void {
  act(() => root?.unmount());
  root = null;
}
/** What the browser has to send a link with: a share sheet, a clipboard, both or neither. */
function browserHas(what: {
  share?: (data: ShareData) => Promise<void>;
  copy?: (text: string) => Promise<void>;
}): void {
  Object.defineProperty(navigator, 'share', { configurable: true, value: what.share });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: what.copy && { writeText: what.copy },
  });
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
  house = false;
  page = recording(server.browser());
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'share');
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('a new table', () => {
  it.each([
    {
      door: 'friends',
      at: '/skull-king/online/new',
      visibility: 'private',
      submit: 'Open table',
      botLevel: 'hard',
      labels: ['Bots', 'Bot skill', 'Rounds', 'Scoring', 'Advanced'],
    },
    {
      door: 'public',
      at: '/skull-king/online/public/new',
      visibility: 'public',
      submit: 'List table',
      botLevel: 'normal',
      labels: ['Bots', 'Rounds', 'Scoring', 'Advanced'],
    },
  ])(
    'of $door is asked for with four seats, the standard pace and $botLevel bots, whatever the device remembers',
    async ({ at, visibility, submit, botLevel, labels }) => {
      localStorage.setItem('skullking-tavern.lobby.v1', JSON.stringify(REMEMBERED));
      await openAt(at);
      // The rules the device remembers are the ones the cards start on.
      expect(button('Even').getAttribute('aria-pressed')).toBe('true');
      expect(button('Rascal').getAttribute('aria-pressed')).toBe('true');
      expect(button('Loot').getAttribute('aria-pressed')).toBe('true');
      // No seats, no pace, and nothing that makes the table ranked. Only Your table picks the bots' skill.
      expect(texts('#online .label')).toEqual(labels);
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
      expect($('#online')?.textContent).not.toMatch(/Pace|Ranked|Seats/);
      // Your table starts on the skill the device remembers. A public one offers none.
      expect(texts('#online .on-level button')).toEqual(
        visibility === 'private' ? ['EasyMakes mistakes', 'NormalSolid play', 'HardCounts cards'] : [],
      );
      if (visibility === 'private') expect(button('Hard').getAttribute('aria-pressed')).toBe('true');
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
            botLevel,
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
      // The plate names the skill the table was opened with.
      expect($('#online .on-rules small')?.textContent).toBe(
        `Rascal scoring · Loot · ${botLevel === 'hard' ? 'Hard' : 'Normal'} bots`,
      );
      // A public table does not make the device forget the skill it last picked for Your table.
      expect(JSON.parse(localStorage.getItem('skullking-tavern.lobby.v1') ?? '{}')).toMatchObject({
        botLevel: 'hard',
      });
    },
  );

  it('of friends is asked for at the skill the host picks, and changes it with the rules', async () => {
    await openAt('/skull-king/online/new');
    // A device that remembers nothing starts on Normal.
    expect(button('Normal').getAttribute('aria-pressed')).toBe('true');
    await press('Hard');
    expect(button('Hard').getAttribute('aria-pressed')).toBe('true');
    expect(button('Normal').getAttribute('aria-pressed')).toBe('false');
    await press('Open table');
    expect(sentOf('lobby.create')).toMatchObject([
      { visibility: 'private', settings: { maxPlayers: 4, pace: 'standard', botLevel: 'hard' } },
    ]);
    await press('Add a bot');
    await press("I'm ready");
    expect($('#online .on-rules small')?.textContent).toBe('Classic scoring · Hard bots');

    // The host's rules offer the same three buttons, on the skill the table has.
    await press('Change');
    expect(texts('#online .label')).toEqual(['Bot skill', 'Rounds', 'Scoring', 'Advanced']);
    expect(button('Hard').getAttribute('aria-pressed')).toBe('true');
    await press('Easy');
    await press('Save rules');
    // The seats and the pace stay what the table has. The server moves the seated bot.
    expect(sentOf('lobby.settings')).toMatchObject([
      { settings: { maxPlayers: 4, pace: 'standard', botLevel: 'easy' } },
    ]);
    expect($('#online .on-rules small')?.textContent).toBe('Classic scoring · Easy bots');
    expect($('#online .on-crew .label')?.textContent).toBe('Crew · 2 of 4');
    expect(texts('#online .member small')).toEqual(['Host · you', 'Bot']);
    // New rules clear the host's ready.
    expect(texts('#online .member .pill')).toEqual(['Not ready']);
    expect(JSON.parse(localStorage.getItem('skullking-tavern.lobby.v1') ?? '{}')).toMatchObject({ botLevel: 'easy' });
  });

  it.each([
    {
      door: 'friends',
      at: '/skull-king/online/new',
      submit: 'Open table',
      botLevel: 'hard',
      waiting: 'Send the invite. The table can start once a second pirate sits down.',
    },
    {
      door: 'public',
      at: '/skull-king/online/public/new',
      submit: 'List table',
      botLevel: 'normal',
      waiting: 'A public table can start once a second pirate sits down.',
    },
  ])(
    'of $door with Seat bots off is asked for with allowBots false, and has no way to add or remove a bot',
    async ({ at, submit, botLevel, waiting }) => {
      await openAt(at);
      if (botLevel === 'hard') {
        await press('Hard');
        // The skill is hidden while the switch is off, and comes back as it was.
        await press('Seat bots');
        expect(texts('#online .label')).toEqual(['Bots', 'Rounds', 'Scoring', 'Advanced']);
        await press('Seat bots');
        expect(button('Hard').getAttribute('aria-pressed')).toBe('true');
      }
      await press('Seat bots');
      expect(button('Seat bots').getAttribute('aria-pressed')).toBe('false');
      expect($('#online .on-level')).toBeNull();
      await press(submit);
      expect(sentOf('lobby.create')).toHaveLength(1);
      // The bot skill is sent all the same: the settings have no place to leave it out.
      expect(sentOf('lobby.create')[0]).toMatchObject({
        allowBots: false,
        settings: { maxPlayers: 4, pace: 'standard', botLevel },
      });
      // A table that seats no bots does not name their skill.
      expect($('#online .on-rules small')?.textContent).toBe('Classic scoring');
      if (botLevel === 'hard') {
        // Its rules do not offer the skill either.
        await press('Change');
        expect(texts('#online .label')).toEqual(['Rounds', 'Scoring', 'Advanced']);
        await act(async () => {
          $('#online [aria-label="Back"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          await vi.advanceTimersByTimeAsync(0);
        });
        expect($('#online .on-crew')).not.toBeNull();
      }

      // The waiting table: the host, three empty seats, and nothing that asks for a bot.
      expect($('#online .on-crew .label')?.textContent).toBe('Crew · 1 of 4');
      expect(texts('#online .member small')).toEqual(['Host · you']);
      expect(texts('#online .member.open')).toHaveLength(3);
      expect(texts('#online button')).not.toContain('Add a bot');
      expect($('#online [aria-label^="Remove "]')).toBeNull();
      // With no bot to fill a seat, a private table waits for a second pirate as a public one does.
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

  it.each([
    { door: 'friends', at: '/skull-king/online/new', submit: 'Open table', standing: false, change: true },
    { door: 'public', at: '/skull-king/online/public/new', submit: 'List table', standing: false, change: false },
    { door: 'the house', at: '/skull-king/online/public/new', submit: 'List table', standing: true, change: false },
  ])(
    'of $door shows its rules while it waits, and offers to change them only when it is private',
    async ({ at, submit, standing, change }) => {
      house = standing;
      await openAt(at);
      await press('Rascal');
      await press(submit);
      await press("I'm ready");
      // The rules the table opened with are on the plate, for a public table as for a private one.
      expect($('#online .on-rules b')?.textContent).toBe('Classic · 10 rounds');
      expect($('#online .on-rules small')?.textContent).toBe('Rascal scoring · Normal bots');
      expect(texts('#online .on-rules button')).toEqual(change ? ['Change'] : []);
      expect(texts('#online button')).toContain('Start');
      if (!change) {
        // A public table keeps them: the host has nothing to open the form with, and nothing is asked of the server.
        expect($('#online h1, #online h2')?.textContent).toBe('Public table');
        expect(sentOf('lobby.settings')).toEqual([]);
        return;
      }
      await press('Change');
      expect($('#online h1, #online h2')?.textContent).toBe('Table rules');
      await press('Kraken');
      await press('Save rules');
      expect(sentOf('lobby.settings')).toMatchObject([{ settings: { scoring: 'rascal', kraken: true } }]);
      expect($('#online .on-rules small')?.textContent).toBe('Rascal scoring · Kraken · Normal bots');
      // New rules clear the host's ready.
      expect(texts('#online .member .pill')).toEqual(['Not ready']);
    },
  );

  it('says a public table keeps its rules when the server refuses a change all the same', () => {
    expect(failureText({ ok: false, code: 'RULES_LOCKED', message: 'x' })).toBe('A public table keeps its rules.');
  });
});

describe('the public list', () => {
  const row = (over: Partial<LobbySummary> & { id: string; hostName: string }): LobbySummary => ({
    settings: STANDARD,
    players: 0,
    ...over,
  });

  it('leads every table with what it plays, titles one nobody hosts by the name the server sent, and says whether it seats bots', async () => {
    listed = [
      // The five tables the server keeps open, one for each length of game: no host, so no colour, nobody seated, and no word about bots.
      row({ id: '00000000-0000-4000-8000-000000000001', hostName: 'Open table' }),
      row({
        id: '00000000-0000-4000-8000-000000000002',
        hostName: 'Open table',
        settings: { ...STANDARD, format: 'brawl' },
      }),
      row({
        id: '00000000-0000-4000-8000-000000000003',
        hostName: 'Open table',
        settings: { ...STANDARD, format: 'swift' },
      }),
      row({
        id: '00000000-0000-4000-8000-000000000004',
        hostName: 'Open table',
        settings: { ...STANDARD, format: 'even' },
      }),
      row({
        id: '00000000-0000-4000-8000-000000000005',
        hostName: 'Open table',
        settings: { ...STANDARD, format: 'whirl' },
      }),
      row({
        id: '00000000-0000-4000-8000-000000000006',
        hostName: 'Calico Jack',
        hostColor: '#ce82ff',
        players: 1,
        settings: { ...STANDARD, format: 'swift' },
        allowBots: false,
      }),
      row({
        id: '00000000-0000-4000-8000-000000000007',
        hostName: 'Kidd',
        hostColor: '#58cc02',
        players: 3,
        settings: { ...STANDARD, format: 'brawl' },
        allowBots: true,
      }),
      row({
        id: '00000000-0000-4000-8000-000000000008',
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
        li.querySelector('.on-row-head')?.firstElementChild?.textContent,
        li.querySelector('b')?.textContent,
        ...Array.from(li.querySelectorAll('.on-row-line'), (line) => line.firstChild?.textContent),
        li.querySelector('.on-row-line .pill')?.textContent,
        li.querySelector(':scope > .mini, :scope > .pill')?.textContent,
      ]),
    ).toEqual([
      ['Classic', 'Open table', '10 rounds · 1 to 10 cards', '0 of 4 seats', 'Bots', 'Join'],
      ['Brawl', 'Open table', '5 rounds · 6 to 10 cards', '0 of 4 seats', 'Bots', 'Join'],
      ['Swift', 'Open table', '5 rounds · 5 cards each', '0 of 4 seats', 'Bots', 'Join'],
      ['Even', 'Open table', '10 rounds · 2, 4, 6, 8, 10 twice', '0 of 4 seats', 'Bots', 'Join'],
      ['Whirl', 'Open table', '10 rounds · 9, 7, 5, 3, 1 twice', '0 of 4 seats', 'Bots', 'Join'],
      ['Swift', 'Calico Jack’s table', '5 rounds · 5 cards each', '1 of 4 seats', 'No bots', 'Join'],
      ['Brawl', 'Kidd’s table', '5 rounds · 6 to 10 cards', '3 of 4 seats', 'Bots', 'Join'],
      ['Classic', 'Mary Read’s table', '10 rounds · 1 to 10 cards', '4 of 4 seats', 'No bots', 'Full'],
    ]);
    // What a table plays is a pill of its own, and Join is told apart by it: five rows have the same title.
    expect(rows.map((li) => li.querySelector('.on-row-head')?.firstElementChild?.className)).toEqual(
      rows.map(() => 'pill format'),
    );
    expect(
      rows
        .slice(0, 5)
        .map((li) =>
          (li.querySelector('.mini')?.getAttribute('aria-describedby') ?? '')
            .split(' ')
            .map((id) => document.getElementById(id)?.textContent),
        ),
    ).toEqual([
      ['Classic', 'Open table'],
      ['Brawl', 'Open table'],
      ['Swift', 'Open table'],
      ['Even', 'Open table'],
      ['Whirl', 'Open table'],
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

describe('an invite', () => {
  const CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
  /** The link of the table the page is at: the join screen with its code, on the page's own origin. */
  const linkOf = (code: string): string => `${location.origin}/skull-king/online/join/${code}`;
  /** A table somebody else opened, and its code. */
  async function tableOf(friend: RawClient, visibility: 'private' | 'public'): Promise<string> {
    friend.send({ t: 'lobby.create', visibility, settings: STANDARD });
    await settle();
    const code = framesOf(friend, 'ok').at(-1)?.lobby?.code;
    if (!code) throw new Error('The friend has no table');
    return code;
  }

  it('of a private table copies the link where the browser has no share sheet, and keeps the code on the screen', async () => {
    const copy = vi.fn((_text: string) => Promise.resolve());
    browserHas({ copy });
    await openAt('/skull-king/online/new');
    await press('Open table');
    const code = $('#online .code')?.textContent ?? '';
    expect(code).toMatch(CODE);
    expect($('#online .foot-hint')?.textContent).toBe('Add a bot, or send the invite.');
    expect(texts('#online .on-code button')).toEqual(['Invite']);
    expect(texts('#online button')).not.toContain('Copy');

    await press('Invite');
    await settle();
    // The link, not the bare code.
    expect(copy.mock.calls).toEqual([[linkOf(code)]]);
    expect(texts('#online .on-code button')).toEqual(['Copied']);
    expect($('#online .code')?.textContent).toBe(code);
    await settle(2000);
    expect(texts('#online .on-code button')).toEqual(['Invite']);
  });

  it('opens the share sheet where there is one, and a sheet that was closed is not an error', async () => {
    const copy = vi.fn((_text: string) => Promise.resolve());
    const share = vi.fn((_data: ShareData) => Promise.resolve());
    browserHas({ share, copy });
    await openAt('/skull-king/online/new');
    await press('Open table');
    const code = $('#online .code')?.textContent ?? '';

    await press('Invite');
    await settle();
    expect(share.mock.calls).toEqual([[{ title: 'Skull King Tavern', text: 'Join my table', url: linkOf(code) }]]);
    // Shared, not copied: the button says nothing else.
    expect(copy).not.toHaveBeenCalled();
    expect(texts('#online .on-code button')).toEqual(['Invite']);

    // The player closes the sheet without sending.
    share.mockImplementationOnce(() => Promise.reject(new DOMException('Share canceled', 'AbortError')));
    await press('Invite');
    await settle();
    expect(copy).not.toHaveBeenCalled();
    expect(texts('#online .on-code button')).toEqual(['Invite']);
    expect($('#online [role="alert"]')).toBeNull();

    // The sheet fails for another reason: the link is copied instead.
    share.mockImplementationOnce(() => Promise.reject(new DOMException('Not allowed', 'NotAllowedError')));
    await press('Invite');
    await settle();
    expect(copy.mock.calls).toEqual([[linkOf(code)]]);
    expect(texts('#online .on-code button')).toEqual(['Copied']);
  });

  it('leaves the button as it is when the link can be neither shared nor copied', async () => {
    browserHas({
      share: () => Promise.reject(new Error('No share target')),
      copy: () => Promise.reject(new Error('Not allowed')),
    });
    await openAt('/skull-king/online/new');
    await press('Open table');
    await press('Invite');
    await settle();
    expect(texts('#online .on-code button')).toEqual(['Invite']);
    expect($('#online [role="alert"]')).toBeNull();

    // A browser with neither of the two.
    browserHas({});
    await press('Invite');
    await settle();
    expect(texts('#online .on-code button')).toEqual(['Invite']);
  });

  it('of a public table a player opened is one button without a code, for the host and for a guest', async () => {
    const copy = vi.fn((_text: string) => Promise.resolve());
    browserHas({ copy });
    await openAt('/skull-king/online/public/new');
    await press('List table');
    expect($('#online h1, #online h2')?.textContent).toBe('Public table');
    expect($('#online .on-code')).toBeNull();
    expect($('#online .code')).toBeNull();
    expect(texts('#online button').filter((t) => t === 'Invite')).toHaveLength(1);
    // The table's code is on no part of the screen, and it is what the link ends in.
    await press('Invite');
    await settle();
    expect(copy).toHaveBeenCalledTimes(1);
    const link = copy.mock.calls[0]?.[0] ?? '';
    const code = link.slice(linkOf('').length);
    expect(link).toBe(linkOf(code));
    expect(code).toMatch(CODE);
    expect($('#online')?.textContent).not.toContain(code);
    expect(texts('#online .on-crew button')).toContain('Copied');
    closePage();

    // A guest who sits down at it from the public list has the same button, and the same link.
    copy.mockClear();
    page = recording(server.browser());
    await openAt('/skull-king/online/public');
    await press('Join');
    expect(texts('#online .member small')).toEqual(['Host · away', 'You']);
    expect($('#online .on-code')).toBeNull();
    expect(texts('#online button').filter((t) => t === 'Invite')).toHaveLength(1);
    await press('Invite');
    await settle();
    expect(copy.mock.calls).toEqual([[link]]);
  });

  it('is not on a standing house table, which has no code plate either', async () => {
    browserHas({ copy: () => Promise.resolve() });
    await tableOf(await someone(), 'public');
    house = true;
    await openAt('/skull-king/online/public');
    await press('Join');
    expect($('#online h1, #online h2')?.textContent).toBe('Public table');
    expect($('#online .on-crew .label')?.textContent).toBe('Crew · 2 of 4');
    expect(texts('#online button')).not.toContain('Invite');
    expect($('#online .on-code')).toBeNull();
    expect($('#online .code')).toBeNull();
  });

  it('opens the join screen with its code, and asks for the seat only when Join table is pressed', async () => {
    const code = await tableOf(await someone(), 'private');
    // A link typed in lower case is the same invite.
    await openAt(`/skull-king/online/join/${code.toLowerCase()}`);
    expect(places.path()).toBe(`/skull-king/online/join/${code}`);
    expect($('#online h1, #online h2')?.textContent).toBe('Join a table');
    expect(codeField()?.value).toBe(code);
    expect($('#table-code-help')?.textContent).toBe('This invite is for one table.');
    await settle(5000);
    expect(sentOf('lobby.join')).toEqual([]);

    await press('Join table');
    expect(sentOf('lobby.join')).toEqual([{ t: 'lobby.join', id: expect.any(Number), code }]);
    expect($('#online h1, #online h2')?.textContent).toBe('Table');
    expect(texts('#online .member small')).toEqual(['Host', 'You']);
    expect($('#online .code')?.textContent).toBe(code);
    expect(places.entries()).toEqual({ paths: ['/skull-king/online'], at: 0 });
  });

  it('opens the empty join screen for anything that is not a code', async () => {
    for (const suffix of ['ABC', 'ABCDEFG', 'ABCDE1', 'ABC%20EF', 'ABCDEF/more']) {
      await openAt(`/skull-king/online/join/${suffix}`);
      expect(places.path()).toBe('/skull-king/online/join');
      expect(codeField()?.value).toBe('');
      expect($('#table-code-help')?.textContent).toBe('Ask the host for the 6-character code.');
      closePage();
    }
    expect(sentOf('lobby.join')).toEqual([]);
  });

  it('says what the server says about a table that is gone, and asks the host again once the code is another', async () => {
    await openAt('/skull-king/online/join/ZZZZZZ');
    await press('Join table');
    expect(sentOf('lobby.join')).toHaveLength(1);
    expect($('#table-code-help')?.textContent).toBe('No table has that code. Check it with the host.');
    expect($('#online h1, #online h2')?.textContent).toBe('Join a table');
    // The address stays the invite's: nothing was joined.
    expect(places.path()).toBe('/skull-king/online/join/ZZZZZZ');
    const input = codeField();
    if (!input) throw new Error('No code field');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'ZZZZZ');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect($('#table-code-help')?.textContent).toBe('Ask the host for the 6-character code.');
  });

  it('leaves a player who is already at a table, or in the queue, where they are', async () => {
    const code = await tableOf(await someone(), 'private');
    await openAt('/skull-king/online/new');
    await press('Open table');
    const own = $('#online .code')?.textContent;
    closePage();
    // The same browser opens the invite: the server's welcome says it sits at its own table.
    await openAt(`/skull-king/online/join/${code}`);
    await settle(5000);
    expect($('#online h1, #online h2')?.textContent).toBe('Your table');
    expect($('#online .code')?.textContent).toBe(own);
    expect($('#table-code')).toBeNull();
    expect(sentOf('lobby.join')).toEqual([]);
    expect(sentOf('lobby.leave')).toEqual([]);
    closePage();

    // Another browser, waiting in the queue.
    page = recording(server.browser());
    sent = [];
    await openAt('/skull-king/online');
    await press('Quick play');
    expect(sentOf('queue.join')).toHaveLength(1);
    closePage();
    await openAt(`/skull-king/online/join/${code}`);
    await settle(1000);
    expect($('#table-code')).toBeNull();
    expect($('#online .searching')).not.toBeNull();
    expect(sentOf('lobby.join')).toEqual([]);
    expect(sentOf('queue.leave')).toEqual([]);
  });
});
