// @vitest-environment jsdom
/* The ladder page (plan item W5), against answers written by hand: the season the server named,
   one row for each entry it sent, and the next page with the cursor it gave. The ladder is public,
   so the page asks for no session and makes no guest. The way to it from the ranked page, and a
   ladder the mock filled by playing, are in src/online/Ranked.test.tsx. */
import { act, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { Api, LADDER_PAGE } from '../net/api';
import type { RestResponse } from '../net/api';
import { Online } from '../net/online';
import { SocketClient } from '../net/socket';
import type { LadderEntry, LadderPage, Me, TableColor } from '../protocol/generated';
import { isFrame, routeOf } from '../router/addresses';
import { memoryPlaces } from '../router/places';
import type { MemoryPlaces } from '../router/places';
import { createRouter } from '../router/router';
import { GameOn } from './GameOn';
import { RETRY_MS } from './Profile';

const COLORS: TableColor[] = ['#1cb0f6', '#ff9600', '#ce82ff'];
const ID = (n: number): string => `11111111-0000-4000-8000-${String(n).padStart(12, '0')}`;
/** A row as the server sends one: the public player and the rating. There is no username on it. */
const entry = (rank: number, provisional = false): LadderEntry => ({
  rank,
  user: { id: ID(rank), name: `Pirate ${rank}`, color: COLORS[rank % 3], tier: provisional ? 'Deckhand' : 'Bosun' },
  rating: { value: 2000 - rank, tier: provisional ? 'Deckhand' : 'Bosun', provisional, games: provisional ? 2 : 12 },
});
const SEASON = { id: 3, name: 'Season of the Kraken', startsAt: Date.UTC(2026, 9, 1), endsAt: Date.UTC(2027, 0, 1) };
const CONFIG = { protocol: 1, build: 'test', season: { ...SEASON, name: '2026 Q4' }, emotes: [] };
/** The player looking: an account whose row is the third. Their username is nowhere on the ladder. */
const ME: Me = {
  user: entry(3).user,
  guest: false,
  username: 'pirate_three_login',
  active: null,
  cooldownUntil: null,
  stats: { games: 0, wins: 0, bidsMade: 0, bidsTotal: 0, bestScore: null },
  rating: entry(3).rating,
};

let host: HTMLDivElement;
let root: Root | null = null;
let places: MemoryPlaces;
let asked: string[];
/** What the server answers, by path and query. A path without an answer cannot be reached. */
let answers: Record<string, RestResponse>;

const $ = (selector: string): HTMLElement | null => document.querySelector<HTMLElement>(selector);
const texts = (selector: string): string[] =>
  Array.from(document.querySelectorAll<HTMLElement>(selector), (el) => el.textContent ?? '');
const settle = (ms = 0): Promise<void> => act(() => vi.advanceTimersByTimeAsync(ms).then(() => {}));
async function press(label: string): Promise<void> {
  const el = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === label);
  if (!el) throw new Error(`No button says "${label}"`);
  if (el.disabled) throw new Error(`"${label}" is disabled`);
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);
  });
}
const ok = (body: unknown): RestResponse => ({ status: 200, body });
const NOBODY: RestResponse = { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: '' } } };

function Frame({ online }: { online: Online }) {
  const state = useSyncExternalStore(online.subscribe, online.getState);
  const [router] = useState(() => createRouter(places));
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
/** The ladder, reached from `from` when one is given, or opened by its address. */
async function openLadder(from?: string): Promise<void> {
  places = memoryPlaces(from ?? '/ladder');
  const online = new Online(
    new SocketClient({ transport: () => new Promise(() => {}), build: 'test' }),
    new Api((method, path) => {
      asked.push(`${method} ${path}`);
      const answer = answers[path];
      return answer ? Promise.resolve(answer) : Promise.reject(new Error('No answer'));
    }),
  );
  if (from) createRouter(places).go('/ladder');
  root = createRoot(host);
  await act(async () => {
    root?.render(<Frame online={online} />);
    await vi.advanceTimersByTimeAsync(0);
  });
  await settle();
}
/** The rows as the page has them: the rank, the name, the tier, the rating. */
const rows = (): string[][] =>
  Array.from(document.querySelectorAll('.go-ladder-list li'), (li) => [
    li.querySelector('.go-ladder-rank')?.textContent ?? '',
    li.querySelector('.go-ladder-name b')?.textContent ?? '',
    li.querySelector('.go-ladder-tier')?.textContent ?? '',
    li.querySelector('.go-ladder-rating')?.textContent ?? '',
  ]);
const FIRST = `/ladder?limit=${LADDER_PAGE}`;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }));
  vi.stubGlobal('scrollTo', () => {});
  localStorage.clear();
  document.title = 'Skull King Tavern';
  document.body.innerHTML = '<div id="root"></div>';
  host = document.querySelector<HTMLDivElement>('#root') ?? document.createElement('div');
  asked = [];
  answers = { '/me': NOBODY, '/config': ok(CONFIG) };
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the ladder', () => {
  it('asks for 25, shows the season the server named and a row for each entry, and has no username on it', async () => {
    answers['/me'] = ok(ME);
    answers[FIRST] = ok({
      season: SEASON,
      entries: [entry(1), entry(2), entry(3), entry(4, true)],
    } satisfies LadderPage);
    await openLadder();
    expect(document.title).toBe('GameOn · Ladder');
    expect($('#gameon h1')?.textContent).toBe('Ladder');
    expect(asked).toContain(`GET ${FIRST}`);
    // The season is the one the ladder came with, not the one `GET /config` named.
    expect(texts('.go-ladder-title .pill')).toEqual(['Season of the Kraken']);
    expect($('.go-ladder-head p')?.textContent).toBe('Ranked players this quarter, by rating.');
    // A row is the rank, the name, the tier and the rating. A provisional account is listed, and says so.
    expect(rows()).toEqual([
      ['1', 'Pirate 1', 'Bosun', '1999'],
      ['2', 'Pirate 2', 'Bosun', '1998'],
      ['3', 'Pirate 3', 'Bosun', '1997'],
      ['4', 'Pirate 4', 'DeckhandProvisional', '1996'],
    ]);
    expect(texts('.go-ladder-cols span')).toEqual(['Rank', 'Player', 'Tier', 'Rating']);
    // The colour is the player's own. The viewer has a session, so the name leads to that player's page.
    expect($('.go-ladder-list li .avatar')?.style.background).toBe('rgb(255, 150, 0)');
    expect($('.go-ladder-list li a')?.getAttribute('href')).toBe(`/players/${ID(1)}`);
    expect(document.querySelectorAll('.go-ladder-list li a')).toHaveLength(4);
    // The viewer's own row is on this page, and is marked. Nobody's username is anywhere.
    expect(texts('.go-ladder-list li .pill.green')).toEqual(['You']);
    expect($('.go-ladder-list li:nth-child(3) .pill.green')).not.toBeNull();
    expect($('#gameon main')?.textContent).not.toContain('login');
    // That was the whole ladder: there is nothing more to ask for.
    expect($('.go-more')).toBeNull();
    // The bar says where the page is.
    expect($('.go-nav a[href="/ladder"]')?.getAttribute('aria-current')).toBe('page');
  });

  it('loads the next page with the cursor it was given, and stops when no cursor comes', async () => {
    answers[FIRST] = ok({ season: SEASON, entries: Array.from({ length: 25 }, (_, i) => entry(i + 1)), next: 'c:25' });
    answers[`${FIRST}&after=c%3A25`] = ok({ season: SEASON, entries: [entry(26), entry(27)] });
    await openLadder();
    expect(rows()).toHaveLength(25);
    await press('Load more');
    expect(asked.at(-1)).toBe(`GET ${FIRST}&after=c%3A25`);
    expect(rows()).toHaveLength(27);
    expect(
      rows()
        .slice(-3)
        .map((r) => r[0]),
    ).toEqual(['25', '26', '27']);
    expect($('.go-more')).toBeNull();
  });

  it('is public: a browser without a session reads it, nobody is marked, and no guest is made', async () => {
    answers[FIRST] = ok({ season: SEASON, entries: [entry(1), entry(2), entry(3)] });
    await openLadder();
    expect(rows()).toHaveLength(3);
    expect($('.go-ladder-list .pill.green')).toBeNull();
    // Another player's page is not public: without a session a name leads nowhere.
    expect($('.go-ladder-list a')).toBeNull();
    expect(asked.filter((a) => a.startsWith('POST'))).toEqual([]);
    expect($('.go-nav a[href="/sign-in"]')).not.toBeNull();
  });

  it('does not make up a row for a player who is not on the page it loaded', async () => {
    // The viewer is rated, and the first page does not have their row.
    answers['/me'] = ok({ ...ME, user: { ...ME.user, id: ID(40) } });
    answers[FIRST] = ok({ season: SEASON, entries: [entry(1), entry(2)], next: 'x' });
    await openLadder();
    expect(rows()).toHaveLength(2);
    expect($('.go-ladder-list .pill.green')).toBeNull();
    expect($('#gameon main')?.textContent).not.toMatch(/you are|your rank|40/i);
  });

  it('shows the season and no rows when nobody is rated', async () => {
    answers[FIRST] = ok({ season: SEASON, entries: [] });
    await openLadder();
    expect(texts('.go-ladder-title .pill')).toEqual(['Season of the Kraken']);
    expect($('.go-ladder-empty')?.textContent).toBe('Nobody is rated this quarter yet.');
    expect(rows()).toEqual([]);
    expect($('.go-ladder-cols')).toBeNull();
    expect($('.go-more')).toBeNull();
  });

  it('goes back to the ranked page, the way it was reached or in its place', async () => {
    answers[FIRST] = ok({ season: SEASON, entries: [] });
    await openLadder('/skull-king/ranked');
    await press('Ranked');
    expect(places.entries()).toEqual({ paths: ['/skull-king/ranked', '/ladder'], at: 0 });
    expect($('#left')?.textContent).toBe('/skull-king/ranked');
    act(() => root?.unmount());
    // Opened by its address, the ranked page takes its place.
    await openLadder();
    await press('Ranked');
    expect(places.entries()).toEqual({ paths: ['/skull-king/ranked'], at: 0 });
  });

  it("shows that it is loading, says when it couldn't load, and asks again every five seconds", async () => {
    await openLadder();
    // The season of `GET /config` stands in until the ladder has come with its own.
    expect(texts('.go-ladder-title .pill')).toEqual(['2026 Q4']);
    expect($('.go-failed [role="alert"]')?.textContent).toBe('The ladder could not be loaded.');
    const asks = (): number => asked.filter((a) => a === `GET ${FIRST}`).length;
    expect(asks()).toBe(1);
    await settle(RETRY_MS);
    expect(asks()).toBe(2);
    answers[FIRST] = ok({ season: SEASON, entries: [entry(1)], next: 'x' });
    await settle(RETRY_MS);
    expect(asks()).toBe(3);
    expect($('.go-failed')).toBeNull();
    expect(rows()).toHaveLength(1);
    // Nothing is asked again once the server has answered.
    await settle(RETRY_MS * 2);
    expect(asks()).toBe(3);

    // The next page fails: the rows stay, the page says so, and asks again when told to.
    await press('Load more');
    expect($('.go-more [role="alert"]')?.textContent).toBe('The next rows could not be loaded.');
    expect(rows()).toHaveLength(1);
    answers[`${FIRST}&after=x`] = ok({ season: SEASON, entries: [entry(2)] });
    await press('Try again');
    expect(rows()).toHaveLength(2);
    expect($('.go-more')).toBeNull();
  });

  it('asks at once when told to, without waiting for the clock', async () => {
    await openLadder();
    expect($('.go-failed')).not.toBeNull();
    answers[FIRST] = ok({ season: SEASON, entries: [entry(1)] });
    await press('Try again');
    expect(rows()).toHaveLength(1);
    // While it asks, the page says it is loading.
    act(() => root?.unmount());
    let answer: (r: RestResponse) => void = () => {};
    places = memoryPlaces('/ladder');
    const online = new Online(
      new SocketClient({ transport: () => new Promise(() => {}), build: 'test' }),
      new Api((_method, path) =>
        path.startsWith('/ladder')
          ? new Promise<RestResponse>((resolve) => (answer = resolve))
          : Promise.resolve(NOBODY),
      ),
    );
    root = createRoot(host);
    await act(async () => {
      root?.render(<Frame online={online} />);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect($('.go-skeleton')?.getAttribute('aria-label')).toBe('Loading the ladder');
    await act(async () => {
      answer(ok({ season: SEASON, entries: [entry(1)] }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect($('.go-skeleton')).toBeNull();
    expect(rows()).toHaveLength(1);
  });
});
