// @vitest-environment jsdom
/* Ranked on the whole page against the mock server: the hub's ranked block, the queue, the leave
   warning, the cooldown, the rating line at the end of a game, and the ladder. The mock's numbers
   are stand-ins; what is checked here is that the page shows what it was sent and sends nothing it
   should not. The mock's own frames are in src/net/mock/ranked.test.ts. */
import { act, StrictMode, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { App } from '../App';
import { Api } from '../net/api';
import type { Backend, RestResponse } from '../net/api';
import { connectRaw, framesOf } from '../net/mock/raw';
import type { RawClient } from '../net/mock/raw';
import { MockServer } from '../net/mock/server';
import { Online } from '../net/online';
import { SocketClient } from '../net/socket';
import type { Wire } from '../net/socket';
import type { LadderEntry, LadderPage, Me, TableColor } from '../protocol/generated';
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

/** Midday, so the season's dates read the same in every time zone. */
const NOW = Date.UTC(2026, 9, 31, 12);
const COOLDOWN_MS = 10 * 60_000;

let host: HTMLDivElement;
let root: Root | null = null;
let server: MockServer;
/** The browser the page runs in, and every frame the page wrote to its socket. */
let page: Backend;
let sent: { t: string; mode?: string }[];

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
const sentOf = (t: string): typeof sent => sent.filter((m) => m.t === t);

/** A backend that writes down what the page sends over its socket. */
function recording(innerBackend: Backend): Backend {
  return {
    rest: innerBackend.rest,
    transport: async () => {
      const inner = await innerBackend.transport();
      const wire: Wire = {
        send: (data) => {
          sent.push(JSON.parse(data) as { t: string });
          inner.send(data);
        },
        close: () => inner.close(),
        onmessage: null,
        onclose: null,
      };
      inner.onmessage = (data) => wire.onmessage?.(data);
      inner.onclose = (code) => wire.onclose?.(code);
      return wire;
    },
  };
}
async function register(browser: Backend, username: string, name: string): Promise<Me> {
  await browser.rest('POST', '/auth/guest');
  await browser.rest('PATCH', '/me', { name });
  return (await browser.rest('POST', '/auth/register', { username, password: 'x' })).body as Me;
}
const me = async (): Promise<Me> => (await page.rest('GET', '/me')).body as Me;
/** From the home screen to the hub, connected. With a username the page is that account. */
async function openHub(username?: string): Promise<void> {
  if (username) await register(page, username, 'Anne');
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <StrictMode>
        <App backend={page} />
      </StrictMode>,
    );
    await vi.advanceTimersByTimeAsync(0);
  });
  await click('[data-act="online"]');
  await settle();
}
/** Three more accounts in the ranked queue: with the page's, that is a table. */
async function threeMore(): Promise<RawClient[]> {
  const others: RawClient[] = [];
  for (const name of ['Calico', 'Mary', 'Kidd']) {
    const browser = server.browser();
    await register(browser, `${name.toLowerCase()}_login`, name);
    const socket = await connectRaw(browser.transport);
    await settle();
    socket.send({ t: 'queue.join', mode: 'ranked' });
    await settle();
    others.push(socket);
  }
  return others;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
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
    queueFillMs: 4000,
    cooldownMs: COOLDOWN_MS,
  });
  sent = [];
  page = recording(server.browser());
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ranked, for a guest', () => {
  it('says ranked needs an account and sends nothing; the ladder is open to look at', async () => {
    await openHub();
    const ranked = $('#online [aria-label="Ranked"]');
    expect(ranked?.querySelector('p')?.textContent).toBe('Ranked needs an account.');
    expect(Array.from(ranked?.querySelectorAll('button') ?? [], (b) => b.textContent)).toEqual([
      'Create an account',
      'Ladder',
    ]);
    // There is no way to ask from here, so nothing was asked.
    expect(sentOf('queue.join')).toEqual([]);
    await press('Create an account');
    expect($('#online h2')?.textContent).toBe('Create an account');
    await click('[aria-label="Back"]');
    await click('[aria-label="Back"]');
    await press('Ladder');
    expect($('#online h2')?.textContent).toBe('Ladder');
    expect($('#online .season b')?.textContent).toBe('Season 1');
    expect($('#online .season small')?.textContent).toBe('1 Oct 2026 – 1 Jan 2027');
    expect($('#online .notice')?.textContent).toBe('Nobody is on the ladder yetPlay a ranked game to be the first.');
    expect(document.querySelector('#online .footbar')).toBeNull();
  });
});

describe('ranked, for an account', () => {
  it('shows no rating before the first game, queues, and sits down with three other accounts and no bot', async () => {
    await openHub('anne_login');
    const ranked = $('#online [aria-label="Ranked"]');
    expect(ranked?.querySelector('.plate')?.textContent).toBe('RatingUnratedPlay a ranked game to get a rating.Ladder');
    expect(ranked?.querySelector('p.muted')?.textContent).toBe(
      'The standard rules against other pirates, no bots. Leaving a ranked game scores last place and starts a cooldown.',
    );
    await press('Find a ranked game');
    expect(sentOf('queue.join')).toEqual([expect.objectContaining({ mode: 'ranked' })]);
    expect($('#online h2')?.textContent).toBe('Ranked');
    expect($('#online .searching [role="status"]')?.textContent).toBe('1 of 4 found');
    // The standard rules, without the skill of bots a ranked table does not start with.
    expect(texts('#online .plate small')).toEqual(['Up to 4 pirates · Standard pace · No extra cards']);
    expect(texts('#online p.muted').at(-1)).toBe(
      'The game starts by itself when the table is full. A ranked table has no bots. Leaving a ranked game scores last place and starts a cooldown.',
    );
    // No waiting time is promised, and waiting does not bring bots.
    expect($('#online')?.textContent).not.toMatch(/\d+\s*(s|sec|seconds|min|minutes?)\b/);
    await settle(60_000);
    expect($('#online .searching [role="status"]')?.textContent).toBe('1 of 4 found');

    const others = await threeMore();
    expect(ui.screen).toBe('game');
    expect($('#online')).toBeNull();
    expect(session.table?.view(0).seats.map((seat) => [seat.name, seat.bot])).toEqual([
      ['Anne', false],
      ['Calico', false],
      ['Mary', false],
      ['Kidd', false],
    ]);
    expect(framesOf(others[0], 'game.start')[0]).toMatchObject({ mode: 'ranked', lobbyId: null });
  });

  it('warns before a ranked leave, sends nothing until it is confirmed, and then keeps the queue closed until the time on Me', async () => {
    await openHub('anne_login');
    await press('Find a ranked game');
    await threeMore();
    await click('#app .g-top [data-act="home"]');
    expect($('#app .sheet h2')?.textContent).toBe('Leave this ranked game?');
    expect($('#app .sheet p')?.textContent).toBe(
      "Leaving scores last place and starts a cooldown before your next ranked game. A bot takes your seat, and you can't come back to it.",
    );
    expect(texts('#app .sheet .btn')).toEqual(['Leave and forfeit', 'Keep playing']);
    // The warning alone sends nothing, and neither does backing out of it.
    expect(sentOf('game.leave')).toEqual([]);
    await click('[data-act="closeSheet"]');
    expect($('#app .sheet')).toBeNull();
    expect(sentOf('game.leave')).toEqual([]);
    expect((await me()).active?.kind).toBe('game');
    expect((await me()).cooldownUntil).toBeNull();

    await click('#app .g-top [data-act="home"]');
    await click('[data-act="leaveTable"]');
    await settle();
    expect(sentOf('game.leave')).toHaveLength(1);
    // The table is down, and the hub says until when ranked is closed: the time is the server's.
    expect($('#online h2')?.textContent).toBe('Play online');
    expect((await me()).cooldownUntil).toBe(NOW + COOLDOWN_MS);
    const ranked = (): HTMLElement | null => $('#online [aria-label="Ranked"]');
    expect(ranked()?.querySelector('.notice')?.textContent).toBe(
      'Ranked is closed for youYou left a ranked game. It opens again in 10 min.',
    );
    expect(button('Find a ranked game').disabled).toBe(true);
    // A tap on the closed button reaches nobody: the page still has sent one ranked join, the first.
    button('Find a ranked game').click();
    await settle();
    expect(sentOf('queue.join')).toHaveLength(1);
    // Casual is not closed.
    expect(button('Find a game').disabled).toBe(false);

    await settle(COOLDOWN_MS - 30_000);
    expect(ranked()?.querySelector('.notice p')?.textContent).toBe(
      'You left a ranked game. It opens again in less than a minute.',
    );
    expect(button('Find a ranked game').disabled).toBe(true);
    // The others played on meanwhile: the result reached the leaver as news, with the forfeit and the rating.
    expect($('#online .notice.gold p')?.textContent).toBe(
      'You left before the end. Final place: 4th of 4. It counts as a forfeit. Rating −1.',
    );
    expect(ranked()?.querySelector('.rating')?.textContent).toBe('−1DeckhandPlacement');
    expect(ranked()?.querySelector('.plate + p')?.textContent).toBe(
      'These are placement games. Your tier is not settled yet.',
    );

    await settle(31_000);
    expect(ranked()?.querySelector('.notice')).toBeNull();
    await press('Find a ranked game');
    expect(sentOf('queue.join')).toHaveLength(2);
    expect($('#online h2')?.textContent).toBe('Ranked');
  });

  it('keeps the casual leave sheet as it was', async () => {
    await openHub('anne_login');
    await press('Find a game');
    await settle(4000);
    expect(ui.screen).toBe('game');
    await click('#app .g-top [data-act="home"]');
    expect($('#app .sheet h2')?.textContent).toBe('Leave the table?');
    expect(texts('#app .sheet .btn')).toEqual(['Leave table', 'Keep playing']);
    await click('[data-act="leaveTable"]');
    await settle();
    expect((await me()).cooldownUntil).toBeNull();
    expect($('#online [aria-label="Ranked"] .notice')).toBeNull();
  });

  it('shows what the game did to the rating on the end screen, on the hub, on the profile and on the ladder', async () => {
    await openHub('anne_login');
    await press('Find a ranked game');
    await threeMore();
    // Nobody touches anything: the deadlines play every seat to the end of the game.
    for (let i = 0; i < 800 && ui.screen !== 'end'; i++) await settle(250);
    expect(ui.screen).toBe('end');
    await settle();
    const rating = (await me()).rating;
    if (!rating) throw new Error('The game left no rating');
    const won = rating.value > 0;
    expect($('#app .end-rating')?.hidden).toBe(false);
    expect($('#app .end-rating')?.textContent).toBe(won ? 'Rating 0 → 1 +1 Placement' : 'Rating 0 → −1 −1 Placement');
    expect($('#app .end-rating b:last-of-type')?.className).toBe(won ? 'num pos' : 'num neg');

    await click('[data-act="again"]');
    await settle();
    expect($('#online h2')?.textContent).toBe('Play online');
    const value = won ? '1' : '−1';
    expect($('#online [aria-label="Ranked"] .rating')?.textContent).toBe(`${value}DeckhandPlacement`);
    await press('Profile');
    expect($('#online [aria-label="Ranked"] .rating')?.textContent).toBe(`${value}DeckhandPlacement`);
    await click('[aria-label="Back"]');

    await press('Ladder');
    const rows = Array.from(document.querySelectorAll<HTMLElement>('#online .ladder li'));
    expect(rows.map((li) => li.querySelector('.rank')?.textContent)).toEqual(['1', '2', '3', '4']);
    expect(
      rows.map((li) => li.querySelector('.grow b')?.textContent ?? '').toSorted((a, b) => a.localeCompare(b)),
    ).toEqual(['Anne', 'Calico', 'Kidd', 'Mary']);
    const mine = rows.filter((li) => li.classList.contains('you'));
    expect(mine).toHaveLength(1);
    expect(mine[0].querySelector('.grow b')?.textContent).toBe('Anne');
    expect(mine[0].querySelector('small')?.textContent).toBe('Deckhand · Placement · You');
    expect(mine[0].querySelector('b.num:last-child')?.textContent).toBe(value);
    // The ladder is public players: nobody's login name is on it.
    expect($('#online')?.textContent).not.toMatch(/_login/);
    expect(document.querySelector('#online .footbar')).toBeNull();
  });
});

/* The ladder against REST answers written by hand: a first page with a `next`, and the page after it. */
describe('the ladder, a page at a time', () => {
  const COLORS: TableColor[] = ['#1cb0f6', '#ff9600', '#ce82ff'];
  const entry = (rank: number): LadderEntry => ({
    rank,
    user: {
      id: `11111111-0000-4000-8000-${String(rank).padStart(12, '0')}`,
      name: `Pirate ${rank}`,
      color: COLORS[rank % 3],
      tier: 'Bosun',
    },
    rating: { value: 2000 - rank, tier: 'Bosun', provisional: false, games: 12 },
  });
  const season = {
    id: 3,
    name: 'Season of the Kraken',
    startsAt: Date.UTC(2026, 9, 1, 12),
    endsAt: Date.UTC(2026, 11, 31, 12),
  };
  let asked: string[];
  let answers: Record<string, RestResponse>;

  function Screens({ online }: { online: Online }) {
    const state = useSyncExternalStore(online.subscribe, online.getState);
    return (
      <div id="online">
        <OnlineScreens online={online} state={state} onExit={() => {}} />
      </div>
    );
  }
  /** The hub of a connected guest whose server answers REST from `answers`. */
  async function openLadder(): Promise<Online> {
    const frames: { id: number }[] = [];
    const wire: Wire = {
      send: (data) => void frames.push(JSON.parse(data) as { id: number }),
      close: () => {},
      onmessage: null,
      onclose: null,
    };
    const online = new Online(
      new SocketClient({ transport: () => Promise.resolve(wire), build: 'test' }),
      new Api((method, path) => {
        asked.push(`${method} ${path}`);
        const answer = answers[path];
        return answer ? Promise.resolve(answer) : Promise.reject(new Error('No answer'));
      }),
    );
    online.open();
    root = createRoot(host);
    await act(async () => {
      root?.render(<Screens online={online} />);
      await vi.advanceTimersByTimeAsync(0);
    });
    const guest = (await server.browser().rest('POST', '/auth/guest')).body;
    await act(async () => {
      wire.onmessage?.(JSON.stringify({ t: 'ok', re: frames[0].id }));
      wire.onmessage?.(
        JSON.stringify({ t: 'welcome', me: guest, serverTime: Date.now(), lobby: null, queue: null, game: null }),
      );
      await vi.advanceTimersByTimeAsync(0);
    });
    await press('Ladder');
    return online;
  }

  beforeEach(() => {
    asked = [];
    answers = {};
  });

  it('asks for 25, shows the season the server named, and loads the next page with the cursor it was given', async () => {
    const first: LadderPage = { season, entries: Array.from({ length: 25 }, (_, i) => entry(i + 1)), next: 'c:25' };
    const second: LadderPage = { season, entries: [entry(26), entry(27)] };
    answers['/ladder?limit=25'] = { status: 200, body: first };
    answers['/ladder?limit=25&after=c%3A25'] = { status: 200, body: second };
    const online = await openLadder();
    expect(asked).toContain('GET /ladder?limit=25');
    // The season comes with the ladder: the config was never answered here.
    expect(online.getState().config).toBeNull();
    expect($('#online .season b')?.textContent).toBe('Season of the Kraken');
    expect($('#online .season small')?.textContent).toBe('1 Oct 2026 – 31 Dec 2026');
    expect(document.querySelectorAll('#online .ladder li')).toHaveLength(25);
    expect(texts('#online .ladder li:first-child small')).toEqual(['Bosun']);
    expect(texts('#online .ladder li:first-child b')).toEqual(['Pirate 1', '1999']);

    await press('Show more');
    expect(asked.at(-1)).toBe('GET /ladder?limit=25&after=c%3A25');
    expect(document.querySelectorAll('#online .ladder li')).toHaveLength(27);
    expect(texts('#online .ladder li .rank').slice(-3)).toEqual(['25', '26', '27']);
    // That was the last page: there is nothing more to ask for.
    expect(document.querySelector('#online .footbar')).toBeNull();
    online.dispose();
  });

  it('says so when the ladder or its next page cannot be loaded, and tries again when asked', async () => {
    const online = await openLadder();
    expect($('#online .notice')?.textContent).toBe(
      "Couldn't load the ladderCheck your connection and try again.Try again",
    );
    answers['/ladder?limit=25'] = { status: 200, body: { season, entries: [entry(1)], next: 'x' } };
    await press('Try again');
    expect(document.querySelectorAll('#online .ladder li')).toHaveLength(1);
    await press('Show more');
    expect($('#online .footbar [role="alert"]')?.textContent).toBe("Couldn't load more. Try again.");
    expect(document.querySelectorAll('#online .ladder li')).toHaveLength(1);
    answers['/ladder?limit=25&after=x'] = { status: 200, body: { season, entries: [entry(2)] } };
    await press('Show more');
    expect(document.querySelectorAll('#online .ladder li')).toHaveLength(2);
    online.dispose();
  });
});
