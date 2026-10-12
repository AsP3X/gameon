// @vitest-environment jsdom
/* Ranked on the whole page against the mock server: the ranked page, the queue, the leave
   warning, the cooldown, the rating line at the end of a game, and the ladder. The mock's numbers
   are stand-ins; what is checked here is that the page shows what it was sent and sends nothing it
   should not. The mock's own frames are in src/net/mock/ranked.test.ts. */
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
/** What the first ranked leave of a season costs. The page does not know this number: it reads `cooldownUntil`. */
const COOLDOWN_MS = 15 * 60_000;

let host: HTMLDivElement;
let root: Root | null = null;
/** The page's address and the entries behind it. A reload in a test keeps them, as a browser does. */
let places: MemoryPlaces;
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
/** A rating number as the screens write it: whole, with a real minus sign. */
const shown = (n: number): string => String(n).replace('-', '−');
const signed = (n: number): string => (n > 0 ? `+${n}` : shown(n));

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
/** The page, opened at an address and connected. With a username it is that account. */
async function openAt(at: string, username?: string): Promise<void> {
  if (username) await register(page, username, 'Anne');
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
/** The ranked page, as its address opens it. */
const openRanked = (username?: string): Promise<void> => openAt('/skull-king/ranked', username);
/** To another address of the running page, as a link there would lead: a new entry, and the page reads it. */
async function visit(path: string): Promise<void> {
  await act(async () => {
    places.push(path, null);
    places.back();
    places.forward();
    await vi.advanceTimersByTimeAsync(0);
  });
  await settle();
}
/** The lines of a list of the ranked page: each row's words, in the order they are drawn. */
const lines = (label: string): string[][] =>
  Array.from(document.querySelectorAll<HTMLElement>(`#online [aria-labelledby="${label}"] li`), (li) =>
    Array.from(li.querySelectorAll('b, small, .pill'), (el) => el.textContent ?? ''),
  );
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
  places = memoryPlaces('/skull-king');
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
  it('says ranked needs a free account, cannot join, and sends nothing; the ladder is open to look at', async () => {
    await openRanked();
    expect($('#online h1')?.textContent).toBe('Ranked');
    expect(places.path()).toBe('/skull-king/ranked');
    const ranked = $('#online [aria-label="Ranked"]');
    expect(ranked?.querySelector('.notice')?.textContent).toBe('Ranked needs a free account.Sign up');
    expect(Array.from(ranked?.querySelectorAll('button') ?? [], (b) => b.textContent)).toEqual([
      'Sign up',
      'Find a ranked game',
    ]);
    // The one door is shut for a guest, and a tap on it reaches nobody.
    expect(button('Find a ranked game').disabled).toBe(true);
    button('Find a ranked game').click();
    await settle();
    expect(sentOf('queue.join')).toEqual([]);
    // The account is made on the frame's page. The browser's Back is the way back to ranked.
    await press('Sign up');
    expect($('#gameon h1')?.textContent).toBe('Create your account');
    await act(async () => {
      places.back();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect($('#online h1')?.textContent).toBe('Ranked');

    await visit('/ladder');
    expect($('#online h1, #online h2')?.textContent).toBe('Ladder');
    // The season is the server's: its name as sent, and its days, the last one being the day before `endsAt`.
    expect($('#online .season b')?.textContent).toBe('2026 Q4');
    expect($('#online .season small')?.textContent).toBe('1 Oct 2026 – 31 Dec 2026');
    expect($('#online .notice')?.textContent).toBe('Nobody is on the ladder yetPlay a ranked game to be the first.');
    expect(document.querySelector('#online .footbar')).toBeNull();
    // Back from the ladder is the ranked page.
    await click('[aria-label="Back"]');
    expect($('#online h1')?.textContent).toBe('Ranked');
  });
});

describe('ranked, for an account', () => {
  it('is one door: the season, the standard rules as the server plays them, the tiers, and nothing to pick', async () => {
    await openRanked('anne_login');
    // The season is the server's, and its last day is the day before `endsAt`.
    expect($('#online .on-season')?.textContent).toBe(
      'Season 2026 Q4The season runs until 31 DecemberFive placement games set your tier. Then every ranked game moves your rating.',
    );
    expect($('#online .on-lead')?.textContent).toBe('This quarter. The standard rules. No bots.');
    // The rules are `ServerConfig.standard`: four players, classic, ten rounds, nothing extra in the deck.
    expect(lines('on-standard')).toEqual([
      ['Four players'],
      ['Classic scoring'],
      ['Classic', '10 rounds'],
      ['No loot'],
      ['No kraken'],
      ['No whale'],
      ['No abilities'],
    ]);
    expect($('#online')?.textContent).not.toContain('Brawl');
    expect(lines('on-tiers')).toEqual([
      ['Skull King', 'from 48'],
      ['Pirate Lord', '40 to 47'],
      ['Captain', '32 to 39'],
      ['First Mate', '24 to 31'],
      ['Quartermaster', '16 to 23'],
      ['Bosun', '8 to 15'],
      ['Deckhand', 'below 8'],
    ]);
    // No format picker, no bot switch, no ruleset cards: the page has one button that asks.
    expect(
      document.querySelectorAll('#online .seg, #online .toggle, #online .sk-formats, #online .sk-way'),
    ).toHaveLength(0);
    expect(texts('#online .on-body button')).toEqual(['Ladder', 'Find a ranked game']);
  });

  it('shows no rating before the first game, queues, and sits down with three other accounts and no bot', async () => {
    await openRanked('anne_login');
    const ranked = $('#online [aria-label="Ranked"]');
    expect(ranked?.querySelector('.plate')?.textContent).toBe('RatingUnratedPlay a ranked game to get a rating.Ladder');
    expect(ranked?.querySelector('p.muted')?.textContent).toBe(
      'Leaving a ranked game, losing your seat, or staying away for most of it scores last place and starts a cooldown.',
    );
    await press('Find a ranked game');
    expect(sentOf('queue.join')).toEqual([expect.objectContaining({ mode: 'ranked' })]);
    // The queue is asked for with its name and nothing else: no rules, no bots.
    expect(Object.keys(sentOf('queue.join')[0]).toSorted()).toEqual(['id', 'mode', 't']);
    expect($('#online h1, #online h2')?.textContent).toBe('Ranked');
    expect($('#online .searching [role="status"]')?.textContent).toBe('1 of 4 found');
    // The standard rules, without the skill of bots a ranked table does not start with.
    expect(texts('#online .plate small')).toEqual(['Up to 4 pirates · Standard pace · No extra cards']);
    expect(texts('#online p.muted').at(-1)).toBe(
      'The game starts by itself when the table is full. A ranked table has no bots. Leaving a ranked game, losing your seat, or staying away for most of it scores last place and starts a cooldown.',
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

  it('warns before a ranked leave, sends nothing until it is confirmed, and then keeps the queue closed until the time on Me, with no minutes drawn', async () => {
    await openRanked('anne_login');
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
    // The table is down, and the page is at the index. Casual is not closed.
    expect($('#online h1, #online h2')?.textContent).toBe('Online');
    expect((await me()).cooldownUntil).toBe(NOW + COOLDOWN_MS);
    expect(button('Quick play').disabled).toBe(false);
    // The ranked page says that ranked is closed. Until when is the server's to know: no time is drawn.
    await visit('/skull-king/ranked');
    const ranked = (): HTMLElement | null => $('#online [aria-label="Ranked"]');
    expect(ranked()?.querySelector('.notice[role="status"]')?.textContent).toBe(
      'CooldownRanked is closed for youYou forfeited a ranked game.',
    );
    const drawn = (): string => ($('#online .on-body')?.textContent ?? '').replace('Five placement games', '');
    expect(drawn()).not.toMatch(/\d+\s*(s|sec|seconds|min|minutes?|h|hours?)\b|opens again|:\d\d/i);
    expect(button('Find a ranked game').disabled).toBe(true);
    // A tap on the closed button reaches nobody: the page still has sent one ranked join, the first.
    button('Find a ranked game').click();
    await settle();
    expect(sentOf('queue.join')).toHaveLength(1);

    await settle(COOLDOWN_MS - 30_000);
    // Half a minute before it opens the page says what it said a quarter of an hour before.
    expect(ranked()?.querySelector('.notice[role="status"]')?.textContent).toBe(
      'CooldownRanked is closed for youYou forfeited a ranked game.',
    );
    expect(drawn()).not.toMatch(/\d+\s*(s|sec|seconds|min|minutes?|h|hours?)\b|opens again|:\d\d/i);
    expect(button('Find a ranked game').disabled).toBe(true);
    // The others played on meanwhile: the result reached the leaver as news, with the forfeit and the rating.
    // The numbers are whatever the server made of it: the page shows them and works none out.
    const after = (await me()).rating;
    if (!after) throw new Error('The leave left no rating');
    expect(after).toMatchObject({ games: 1, provisional: true });
    expect(after.value).toBeLessThan(0);
    expect(ranked()?.querySelector('.rating')?.textContent).toBe(`${shown(after.value)}${after.tier}Placement`);
    // The tier is the one the server named: its row is marked, with the number as it came.
    expect(lines('on-tiers').filter((row) => row.length === 3)).toEqual([
      [after.tier, `You · ${shown(after.value)}`, expect.any(String)],
    ]);
    await visit('/skull-king/online');
    expect($('#online .notice.gold p')?.textContent).toBe(
      `You left before the end. Final place: 4th of 4. It counts as a forfeit. Rating ${signed(after.value)}.`,
    );

    await visit('/skull-king/ranked');
    await settle(31_000);
    // The time the server named has come: the page looked again by itself, and the door is open.
    expect(ranked()?.querySelector('.notice')).toBeNull();
    await press('Find a ranked game');
    expect(sentOf('queue.join')).toHaveLength(2);
    expect($('#online h1, #online h2')?.textContent).toBe('Ranked');
  });

  it('ranks the end screen by the places the server sent: a seat that forfeited is last and marked, whatever it scored', async () => {
    await openRanked('anne_login');
    await press('Find a ranked game');
    const [calico, mary] = await threeMore();
    // Calico gives the seat up at the deal: a bot plays it to the end, and the server places it last.
    calico.send({ t: 'game.leave' });
    await settle();
    for (let i = 0; i < 800 && ui.screen !== 'end'; i++) await settle(250);
    expect(ui.screen).toBe('end');
    await settle();
    const { result } = framesOf(mary, 'game.over')[0];
    expect(result).toMatchObject({ forfeited: [1] });
    expect(result.places[1]).toBe(4);
    const names = ['Anne', 'Calico', 'Mary', 'Kidd'];
    // The hero is whoever the server placed first, and the list below is in the server's order.
    const first = names.filter((_, seat) => result.places[seat] === 1);
    expect($('#app .hero-win h1')?.textContent).toBe(first.join(' & '));
    const rows = Array.from(document.querySelectorAll<HTMLElement>('#app .standings li'));
    expect(rows.map((li) => Number(li.querySelector('.rank')?.textContent))).toEqual(
      result.places.filter((place) => place > 1).toSorted((a, b) => a - b),
    );
    const last = rows[rows.length - 1];
    expect(last.querySelector('.pname')?.textContent).toBe('Calico');
    expect(last.querySelector('.rank')?.textContent).toBe('4');
    expect(last.querySelector('.pill')?.textContent).toBe('Forfeit');
    // Its points are the points as played: they are shown, and they did not decide the place.
    expect(last.querySelector('b.num')?.getAttribute('data-final')).toBe(String(result.totals[1]));
    expect(rows.filter((li) => li.querySelector('.pill'))).toHaveLength(1);
    // The page stayed to the end: the rating line is here, and no "you left" notice follows on the hub.
    expect($('#app .end-rating')?.hidden).toBe(false);
    await click('[data-act="again"]');
    await settle();
    expect($('#online h1, #online h2')?.textContent).toBe('Online');
    expect($('#online .notice.gold')).toBeNull();
    expect((await me()).cooldownUntil).toBeNull();
  });

  it('keeps the casual leave sheet as it was', async () => {
    await openAt('/skull-king/online', 'anne_login');
    await press('Quick play');
    await settle(4000);
    expect(ui.screen).toBe('game');
    await click('#app .g-top [data-act="home"]');
    expect($('#app .sheet h2')?.textContent).toBe('Leave the table?');
    expect(texts('#app .sheet .btn')).toEqual(['Leave table', 'Keep playing']);
    await click('[data-act="leaveTable"]');
    await settle();
    expect((await me()).cooldownUntil).toBeNull();
    await visit('/skull-king/ranked');
    expect($('#online [aria-label="Ranked"] .notice')).toBeNull();
    expect(button('Find a ranked game').disabled).toBe(false);
  });

  it('shows what the game did to the rating on the end screen, on the ranked page, on the profile and on the ladder', async () => {
    await openRanked('anne_login');
    await press('Find a ranked game');
    await threeMore();
    // Nobody touches anything: the deadlines play every seat to the end of the game.
    for (let i = 0; i < 800 && ui.screen !== 'end'; i++) await settle(250);
    expect(ui.screen).toBe('end');
    await settle();
    const rating = (await me()).rating;
    if (!rating) throw new Error('The game left no rating');
    // The first game starts from 0, so the change is the new value. Up or down is the server's call.
    const delta = rating.value,
      value = shown(rating.value),
      badge = `${value}${rating.tier}Placement`;
    expect(rating).toMatchObject({ games: 1, provisional: true });
    expect($('#app .end-rating')?.hidden).toBe(false);
    expect($('#app .end-rating')?.textContent).toBe(`Rating 0 → ${value} ${signed(delta)} Placement`);
    expect($('#app .end-rating b:last-of-type')?.className).toBe(
      delta > 0 ? 'num pos' : delta < 0 ? 'num neg' : 'num zero',
    );
    // A ranked game is in the rating, not in the online record.
    expect((await me()).stats.games).toBe(0);

    // The record is one of the two buttons under the scores, and covers neither of them.
    expect(texts('#app .end-actions .btn')).toEqual(['Play again', 'The record']);
    expect($('#record')).toBeNull();
    await click('[data-act="record"]');
    await settle();
    expect($('#record .label')?.textContent).toBe('The record');
    // A dialog over the end screen: it has the keyboard, and the table under it takes no input.
    expect($('#record')?.getAttribute('role')).toBe('dialog');
    expect($('#record')?.getAttribute('aria-labelledby')).toBe($('#record .label')?.id);
    expect(document.activeElement).toBe($('#record'));
    expect($('#app')?.hasAttribute('inert')).toBe(true);
    const steps = texts('#record li b');
    expect(steps.length).toBeGreaterThan(0);
    expect(steps[0]).toBe('0 · deal');
    await press('Back to the scores');
    expect($('#record')).toBeNull();
    expect($('#app')?.hasAttribute('inert')).toBe(false);
    expect(ui.screen).toBe('end');
    // Escape closes it too, like the table's own sheets.
    await click('[data-act="record"]');
    await settle();
    await act(async () => {
      $('#record')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect($('#record')).toBeNull();

    await click('[data-act="again"]');
    await settle();
    expect($('#online h1, #online h2')?.textContent).toBe('Online');
    await click('#online a[href="/profile"]');
    expect($('#online [aria-label="Ranked"] .rating')?.textContent).toBe(badge);
    expect(texts('#online .stat')[0]).toBe('0Games');
    await visit('/skull-king/ranked');
    expect($('#online [aria-label="Ranked"] .rating')?.textContent).toBe(badge);

    await press('Ladder');
    const rows = Array.from(document.querySelectorAll<HTMLElement>('#online .ranking li'));
    expect(rows.map((li) => li.querySelector('.place')?.textContent)).toEqual(['1', '2', '3', '4']);
    expect(
      rows.map((li) => li.querySelector('.grow b')?.textContent ?? '').toSorted((a, b) => a.localeCompare(b)),
    ).toEqual(['Anne', 'Calico', 'Kidd', 'Mary']);
    const mine = rows.filter((li) => li.classList.contains('you'));
    expect(mine).toHaveLength(1);
    expect(mine[0].querySelector('.grow b')?.textContent).toBe('Anne');
    expect(mine[0].querySelector('small')?.textContent).toBe(`${rating.tier} · Placement · You`);
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

  /** The online screens alone, with addresses of their own: no page around them. */
  function Screens({ online }: { online: Online }) {
    const state = useSyncExternalStore(online.subscribe, online.getState);
    const [router] = useState(() => createRouter(memoryPlaces(AT.ladder)));
    const route = routeOf(useSyncExternalStore(router.subscribe, router.getPath));
    return (
      <div id="online">
        <OnlineScreens
          online={online}
          state={state}
          route={isOnline(route) ? route : HUB}
          go={router.go}
          up={router.up}
          onExit={() => {}}
        />
      </div>
    );
  }
  /** The ladder of a connected guest whose server answers REST from `answers`. */
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
    expect(document.querySelectorAll('#online .ranking li')).toHaveLength(25);
    expect(texts('#online .ranking li:first-child small')).toEqual(['Bosun']);
    expect(texts('#online .ranking li:first-child b')).toEqual(['Pirate 1', '1999']);

    await press('Show more');
    expect(asked.at(-1)).toBe('GET /ladder?limit=25&after=c%3A25');
    expect(document.querySelectorAll('#online .ranking li')).toHaveLength(27);
    expect(texts('#online .ranking li .place').slice(-3)).toEqual(['25', '26', '27']);
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
    expect(document.querySelectorAll('#online .ranking li')).toHaveLength(1);
    await press('Show more');
    expect($('#online .footbar [role="alert"]')?.textContent).toBe("Couldn't load more. Try again.");
    expect(document.querySelectorAll('#online .ranking li')).toHaveLength(1);
    answers['/ladder?limit=25&after=x'] = { status: 200, body: { season, entries: [entry(2)] } };
    await press('Show more');
    expect(document.querySelectorAll('#online .ranking li')).toHaveLength(2);
    online.dispose();
  });
});
