// @vitest-environment jsdom
/* The profile and another player's page (plan item W5), against answers written by hand: what the
   server said is on the page as it came, and what it did not say is not made up. The two servers
   differ today, and both are here: the mock sends the five lines and a list of games, and the Rust
   server leaves `stats.byMode` out and has no `GET /me/games`. The ways to the page, the account
   block and signing out run on the whole page in src/online/Accounts.test.tsx. */
import { act, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { Api } from '../net/api';
import type { RestResponse } from '../net/api';
import { Online } from '../net/online';
import { SocketClient } from '../net/socket';
import type { FinishedGame, Me, ModeLine, Profile, Season, TableKind } from '../protocol/generated';
import { isFrame, routeOf } from '../router/addresses';
import { memoryPlaces } from '../router/places';
import type { MemoryPlaces } from '../router/places';
import { createRouter } from '../router/router';
import { GameOn } from './GameOn';
import { GAMES_NARROW, GAMES_WIDE, RETRY_MS } from './Profile';

const ID = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const line = (
  games: number,
  wins: number,
  bidsMade: number,
  bidsTotal: number,
  bestScore: number | null = null,
): ModeLine => ({ games, wins, bidsMade, bidsTotal, bestScore });
const SEASON: Season = { id: 8, name: '2026 Q4', startsAt: Date.UTC(2026, 9, 1), endsAt: Date.UTC(2027, 0, 1) };
const CONFIG = { protocol: 1, build: 'test', season: SEASON, emotes: [] };
/** An account as the mock sends one: the five lines, and a ranked best that is higher than the headline's. */
const ANNE: Me = {
  user: { id: ID(1), name: 'Anne', color: '#1cb0f6', tier: 'Captain' },
  guest: false,
  username: 'anne_bonny',
  active: null,
  cooldownUntil: null,
  stats: {
    ...line(27, 10, 128, 225, 340),
    byMode: {
      solo: line(12, 5, 71, 120, 340),
      friends: line(4, 1, 22, 40, 260),
      public: line(2, 1, 11, 20, 230),
      casual: line(9, 3, 24, 45, 140),
      ranked: line(6, 2, 17, 30, 410),
    },
  },
  rating: { value: 34, tier: 'Captain', provisional: false, games: 6 },
};
const SETTINGS: FinishedGame['settings'] = {
  maxPlayers: 4,
  scoring: 'classic',
  format: 'classic',
  loot: false,
  kraken: false,
  whale: false,
  abilities: false,
  botLevel: 'normal',
  pace: 'standard',
};
const TABLES: TableKind[] = ['solo', 'ranked', 'casual', 'solo', 'friends', 'ranked', 'public', 'casual', 'solo'];
const PLACES = [2, 1, 3, 1, 2, 4, 1, 2, 3];
const SCORES = [210, 190, 80, 340, 260, -30, 230, 140, 90];
/** Nine finished games, newest first, each a day before the one above it. */
const GAMES: FinishedGame[] = TABLES.map((table, i) => ({
  id: ID(100 + i),
  table,
  settings: SETTINGS,
  startedAt: Date.UTC(2026, 9, 12 - i, 11),
  endedAt: Date.UTC(2026, 9, 12 - i, 12),
  seats: [
    { userId: ID(77), bot: false, place: 4, score: -200, bidsMade: 0, forfeited: false },
    { userId: ID(1), bot: false, place: PLACES[i], score: SCORES[i], bidsMade: 4, forfeited: false },
    { userId: null, bot: true, place: 3, score: 5, bidsMade: 1, forfeited: false },
  ],
}));

let host: HTMLDivElement;
let root: Root | null = null;
let places: MemoryPlaces;
/** Every request the page made, as `METHOD path?query`. */
let asked: string[];

const $ = (selector: string): HTMLElement | null => document.querySelector<HTMLElement>(selector);
const texts = (selector: string): string[] =>
  Array.from(document.querySelectorAll<HTMLElement>(selector), (el) => el.textContent ?? '');
const settle = (ms = 0): Promise<void> => act(() => vi.advanceTimersByTimeAsync(ms).then(() => {}));
const button = (label: string): HTMLButtonElement => {
  const el = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === label);
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

type Answer = (query: URLSearchParams) => RestResponse | Promise<RestResponse>;
type Answers = Record<string, Answer>;
const ok = (body: unknown): RestResponse => ({ status: 200, body });
const refused = (status: number, code: string): RestResponse => ({ status, body: { error: { code, message: '' } } });
const down = (): Promise<RestResponse> => Promise.reject(new Error('No network'));
/** `GET /me/games` over a list, as docs/protocol.md §4 pages it. */
const paged =
  (games: FinishedGame[]): Answer =>
  (query) => {
    const limit = Number(query.get('limit')),
      after = query.get('after'),
      from = after == null ? 0 : games.findIndex((g) => g.id === after) + 1,
      rows = games.slice(from, from + limit);
    return ok({ games: rows, ...(from + limit < games.length ? { next: rows[rows.length - 1].id } : {}) });
  };
/** What the page is told. A path nobody wrote an answer for is one the server does not have. */
const server = (answers: Answers): Online =>
  new Online(
    new SocketClient({ transport: () => new Promise(() => {}), build: 'test' }),
    new Api(async (method, target) => {
      asked.push(`${method} ${target}`);
      const [path, query = ''] = target.split('?', 2);
      return (answers[`${method} ${path}`] ?? (() => refused(404, 'NOT_FOUND')))(new URLSearchParams(query));
    }),
  );
/** The frame alone, with addresses of its own. An address that is not the frame's is written out. */
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
async function open(at: string, answers: Answers): Promise<void> {
  places = memoryPlaces(at);
  root = createRoot(host);
  await act(async () => {
    root?.render(<Frame online={server({ 'GET /config': () => ok(CONFIG), ...answers })} />);
    await vi.advanceTimersByTimeAsync(0);
  });
  await settle();
}
/** The five lines as the page has them: the table, the games, the wins, the bids. */
const lines = (): string[][] =>
  Array.from(document.querySelectorAll('.go-lines tbody tr'), (tr) =>
    Array.from(tr.children, (cell) => cell.textContent ?? ''),
  );
/** "Your games" as the page has it: the table, the day, the place, the score. */
const played = (): string[][] =>
  Array.from(document.querySelectorAll('.go-played li'), (li) => [
    li.querySelector('.go-played-what b')?.textContent ?? '',
    li.querySelector('.go-played-what small')?.textContent ?? '',
    li.querySelector('.pill')?.textContent ?? '',
    li.querySelector('.go-played-score')?.textContent ?? '',
  ]);
const EMPTY_LINES = ['Solo', 'Friends', 'Public', 'Casual', 'Ranked'].map((name) => [name, '0', '0', '0 of 0']);
/** Whether the window is a wide one, as the page asks. */
let wide: boolean;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  wide = false;
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('min-width') ? wide : true,
    media: query,
  }));
  vi.stubGlobal('scrollTo', () => {});
  localStorage.clear();
  document.title = 'Skull King Tavern';
  document.body.innerHTML = '<div id="root"></div>';
  host = document.querySelector<HTMLDivElement>('#root') ?? document.createElement('div');
  asked = [];
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the profile of an account', () => {
  it('says who the player is, their quarter, the five lines, the best score and their games', async () => {
    await open('/profile', { 'GET /me': () => ok(ANNE), 'GET /me/games': paged(GAMES) });
    expect(document.title).toBe('GameOn · Your profile');
    expect($('#gameon h1')?.textContent).toBe('Anne');
    // The username, and the tier the server named.
    expect(texts('.go-who p > *')).toEqual(['anne_bonny', 'Captain']);
    expect($('.go-who .avatar')?.style.background).toBe('rgb(28, 176, 246)');
    expect($('.go-who .avatar')?.textContent).toBe('A');

    expect($('.go-quarter h2')?.textContent).toBe('This quarter');
    expect(texts('.go-quarter-head .pill')).toEqual(['2026 Q4']);
    expect(texts('.go-quarter-tiles div')).toEqual(['Rating34', 'Ranked games6']);
    expect($('.go-quarter-ladder')?.textContent).toBe('See the ladder');
    expect($('.go-quarter-ladder')?.getAttribute('href')).toBe('/ladder');

    expect(texts('.go-lines thead th')).toEqual(['Table', 'Games', 'Wins', 'Bids hit']);
    expect(lines()).toEqual([
      ['Solo', '12', '5', '71 of 120'],
      ['Friends', '4', '1', '22 of 40'],
      ['Public', '2', '1', '11 of 20'],
      ['Casual', '9', '3', '24 of 45'],
      ['Ranked', '6', '2', '17 of 30'],
    ]);
    // The best score is the headline's. The ranked line's own best is higher, and is not it.
    expect($('.go-best h2')?.textContent).toBe('Best score');
    expect($('.go-best p')?.textContent).toBe('Solo, Friends, Public and Casual');
    expect($('.go-best > b')?.textContent).toBe('340');
    expect($('#gameon')?.textContent).not.toContain('410');

    // The chip in the bar is this page.
    expect($('.go-nav .go-chip')?.getAttribute('aria-current')).toBe('page');
    // The profile makes nobody and connects nowhere.
    expect(asked.filter((a) => a.startsWith('POST'))).toEqual([]);
  });

  it('lists five games on a phone, newest first, and the next five with "Load more"', async () => {
    await open('/profile', { 'GET /me': () => ok(ANNE), 'GET /me/games': paged(GAMES) });
    expect(asked).toContain(`GET /me/games?limit=${GAMES_NARROW}`);
    expect($('.go-played h2')?.textContent).toBe('Your games');
    // A row is the table, the day, the caller's own place and the caller's own score.
    expect(played()).toEqual([
      ['Solo', '12 Oct 2026', '2nd', '210'],
      ['Ranked', '11 Oct 2026', '1st', '190'],
      ['Casual', '10 Oct 2026', '3rd', '80'],
      ['Solo', '9 Oct 2026', '1st', '340'],
      ['Friends', '8 Oct 2026', '2nd', '260'],
    ]);
    // First place is the gold pill. Every other place is the plain one.
    expect(Array.from(document.querySelectorAll('.go-played li .pill'), (p) => p.className)).toEqual([
      'pill soft',
      'pill gold',
      'pill soft',
      'pill gold',
      'pill soft',
    ]);

    await press('Load more');
    // The next page is asked for with the cursor the server gave.
    expect(asked.at(-1)).toBe(`GET /me/games?limit=${GAMES_NARROW}&after=${GAMES[4].id}`);
    expect(played()).toHaveLength(9);
    expect(played().slice(5)).toEqual([
      ['Ranked', '7 Oct 2026', '4th', '−30'],
      ['Public', '6 Oct 2026', '1st', '230'],
      ['Casual', '5 Oct 2026', '2nd', '140'],
      ['Solo', '4 Oct 2026', '3rd', '90'],
    ]);
    // That was the last page: there is nothing more to ask for.
    expect($('.go-more')).toBeNull();
  });

  it('lists eight at a time in a wide window', async () => {
    wide = true;
    await open('/profile', { 'GET /me': () => ok(ANNE), 'GET /me/games': paged(GAMES) });
    expect(asked).toContain(`GET /me/games?limit=${GAMES_WIDE}`);
    expect(played()).toHaveLength(8);
    await press('Load more');
    expect(asked.at(-1)).toBe(`GET /me/games?limit=${GAMES_WIDE}&after=${GAMES[7].id}`);
    expect(played()).toHaveLength(9);
    expect($('.go-more')).toBeNull();
  });

  it('says so when the next games cannot be loaded, keeps the ones it has, and asks again when told to', async () => {
    let cut = false;
    const list = paged(GAMES);
    await open('/profile', {
      'GET /me': () => ok(ANNE),
      'GET /me/games': (query) => (cut ? down() : list(query)),
    });
    cut = true;
    await press('Load more');
    expect($('.go-more [role="alert"]')?.textContent).toBe('The next games could not be loaded.');
    expect(played()).toHaveLength(5);
    cut = false;
    await press('Try again');
    expect($('.go-more')).toBeNull();
    expect(played()).toHaveLength(9);
  });

  it('says "Provisional" while the server says the rating is, and still shows the tier', async () => {
    const me: Me = {
      ...ANNE,
      user: { ...ANNE.user, tier: 'Bosun' },
      rating: { value: 9, tier: 'Bosun', provisional: true, games: 3 },
    };
    await open('/profile', { 'GET /me': () => ok(me) });
    expect(texts('.go-quarter-head .pill')).toEqual(['2026 Q4', 'Provisional']);
    expect(texts('.go-quarter-tiles div')).toEqual(['Rating9', 'Ranked games3']);
    expect(texts('.go-who p > *')).toEqual(['anne_bonny', 'Bosun']);
  });

  it('says what comes first to an account with no rating, and shows no tier', async () => {
    await open('/profile', { 'GET /me': () => ok({ ...ANNE, rating: null, user: { ...ANNE.user, tier: null } }) });
    expect($('.go-quarter > p')?.textContent).toBe('Play a ranked game to be rated.');
    expect($('.go-quarter-tiles')).toBeNull();
    expect(texts('.go-quarter-head .pill')).toEqual(['2026 Q4']);
    expect($('.go-quarter-ladder')?.getAttribute('href')).toBe('/ladder');
    expect(texts('.go-who p > *')).toEqual(['anne_bonny']);
    // The lines of the other tables are still theirs.
    expect(lines()[0]).toEqual(['Solo', '12', '5', '71 of 120']);
  });
});

describe('the profile of a guest', () => {
  const GUEST: Me = {
    ...ANNE,
    user: { id: ID(2), name: 'Guest 12', color: '#ff9600', tier: null },
    guest: true,
    username: null,
    rating: null,
    stats: {
      ...line(5, 1, 22, 40, 120),
      byMode: {
        solo: line(3, 1, 16, 30, 120),
        friends: line(0, 0, 0, 0),
        public: line(0, 0, 0, 0),
        casual: line(2, 0, 6, 10, 60),
        ranked: line(0, 0, 0, 0),
      },
    },
  };

  it('says "Guest" where the username would be, and that ranked needs a free account', async () => {
    await open('/profile', { 'GET /me': () => ok(GUEST), 'GET /me/games': paged([]) });
    expect($('#gameon h1')?.textContent).toBe('Guest 12');
    expect(texts('.go-who p > *')).toEqual(['Guest']);
    expect($('.go-quarter > p')?.textContent).toBe('Ranked needs a free account.');
    expect($('.go-quarter a.btn')?.textContent).toBe('Create an account');
    expect($('.go-quarter a.btn')?.getAttribute('href')).toBe('/sign-up');
    // A guest has no ranked quarter: no rating, no tier, and no way to a ladder they are not on.
    expect($('.go-quarter-tiles')).toBeNull();
    expect($('.go-quarter-ladder')).toBeNull();
    // Solo and casual are still counted for a guest.
    expect(lines()).toEqual([
      ['Solo', '3', '1', '16 of 30'],
      ['Friends', '0', '0', '0 of 0'],
      ['Public', '0', '0', '0 of 0'],
      ['Casual', '2', '0', '6 of 10'],
      ['Ranked', '0', '0', '0 of 0'],
    ]);
    expect($('.go-best > b')?.textContent).toBe('120');
    expect($('.go-played-note')?.textContent).toBe('No finished games yet.');
    // A guest has no account to sign out of.
    expect(texts('.go-account-actions .btn')).toEqual(['Save']);
  });

  it('shows no tier even if a rating came with the guest', async () => {
    const odd: Me = { ...GUEST, rating: { value: 20, tier: 'Bosun', provisional: false, games: 9 } };
    await open('/profile', { 'GET /me': () => ok(odd) });
    expect(texts('.go-who p > *')).toEqual(['Guest']);
    expect($('.go-quarter-tiles')).toBeNull();
  });
});

describe('the profile against the Rust server of today', () => {
  /** `GET /me` without `stats.byMode`, and no `GET /me/games` at all. */
  const BARE: Me = { ...ANNE, stats: line(27, 10, 128, 225, 340) };

  it('shows five empty lines and the real headline best score, and copies no headline number onto a line', async () => {
    await open('/profile', { 'GET /me': () => ok(BARE) });
    expect(lines()).toEqual(EMPTY_LINES);
    // The 27 games of the headline are not put on Solo, or anywhere else on the page.
    expect($('.go-lines')?.textContent).not.toContain('27');
    expect($('.go-best > b')?.textContent).toBe('340');
    // The rating and the season are real there.
    expect(texts('.go-quarter-tiles div')).toEqual(['Rating34', 'Ranked games6']);
    expect(texts('.go-quarter-head .pill')).toEqual(['2026 Q4']);
    expect(texts('.go-who p > *')).toEqual(['anne_bonny', 'Captain']);
  });

  it('reads a server that has no list of games as no finished games, and not as an error', async () => {
    await open('/profile', { 'GET /me': () => ok(BARE) });
    expect(asked).toContain(`GET /me/games?limit=${GAMES_NARROW}`);
    expect($('.go-played-note')?.textContent).toBe('No finished games yet.');
    expect($('.go-played [role="alert"]')).toBeNull();
    expect($('.go-played li')).toBeNull();
    expect($('.go-more')).toBeNull();
    // Nothing is asked again: the server answered.
    const before = asked.length;
    await settle(RETRY_MS * 2);
    expect(asked).toHaveLength(before);
  });

  it('shows a dash for a best score that is not there yet, and a negative one as it is', async () => {
    await open('/profile', { 'GET /me': () => ok({ ...BARE, stats: line(0, 0, 0, 0) }) });
    expect($('.go-best > b')?.textContent).toBe('–');
    act(() => root?.unmount());
    await open('/profile', { 'GET /me': () => ok({ ...BARE, stats: line(1, 0, 0, 10, -40) }) });
    expect($('.go-best > b')?.textContent).toBe('−40');
  });
});

describe('the profile while the server has not answered', () => {
  it('leads a browser without a session to the sign-in page, and makes no guest', async () => {
    await open('/profile', { 'GET /me': () => refused(401, 'UNAUTHENTICATED') });
    expect(places.path()).toBe('/sign-in');
    expect($('#gameon h1')?.textContent).toBe('Welcome back');
    // The profile's entry is the sign-in page's now: Back does not come back to it.
    expect(places.entries()).toEqual({ paths: ['/sign-in'], at: 0 });
    expect(asked.filter((a) => a.startsWith('POST'))).toEqual([]);
    expect(asked.filter((a) => a.includes('/me/games'))).toEqual([]);
  });

  it('shows that it is loading until the server has said who this is', async () => {
    let answer: (r: RestResponse) => void = () => {};
    await open('/profile', { 'GET /me': () => new Promise<RestResponse>((resolve) => (answer = resolve)) });
    expect($('.go-skeleton')?.getAttribute('role')).toBe('status');
    expect($('.go-skeleton')?.getAttribute('aria-label')).toBe('Loading your profile');
    expect($('.go-who')).toBeNull();
    await act(async () => {
      answer(ok(ANNE));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect($('.go-skeleton')).toBeNull();
    expect($('#gameon h1')?.textContent).toBe('Anne');
  });

  it("says it couldn't load, asks again every five seconds, and at once when told to", async () => {
    let up = false;
    await open('/profile', { 'GET /me': () => (up ? ok(ANNE) : down()) });
    expect($('.go-failed [role="alert"]')?.textContent).toBe('The profile could not be loaded.');
    const asks = (): number => asked.filter((a) => a === 'GET /me').length;
    expect(asks()).toBe(1);
    await settle(RETRY_MS);
    expect(asks()).toBe(2);
    await settle(RETRY_MS);
    expect(asks()).toBe(3);
    expect($('.go-failed')).not.toBeNull();
    // "Try again" does not wait for the clock.
    up = true;
    await press('Try again');
    expect(asks()).toBe(4);
    expect($('.go-failed')).toBeNull();
    expect($('#gameon h1')?.textContent).toBe('Anne');
  });

  it('says so when the games cannot be loaded, and asks for them again every five seconds', async () => {
    let up = false;
    const list = paged(GAMES);
    await open('/profile', { 'GET /me': () => ok(ANNE), 'GET /me/games': (query) => (up ? list(query) : down()) });
    // The rest of the profile is there: only the list is missing.
    expect(lines()[0]).toEqual(['Solo', '12', '5', '71 of 120']);
    expect($('.go-played [role="alert"]')?.textContent).toBe('Your games could not be loaded.');
    const asks = (): number => asked.filter((a) => a.startsWith('GET /me/games')).length;
    expect(asks()).toBe(1);
    await settle(RETRY_MS);
    expect(asks()).toBe(2);
    up = true;
    await settle(RETRY_MS);
    expect(asks()).toBe(3);
    expect($('.go-played [role="alert"]')).toBeNull();
    expect(played()).toHaveLength(5);
  });
});

describe("another player's page", () => {
  const MIRA: Profile = {
    user: { id: ID(51), name: 'Mira', color: '#ce82ff', tier: 'First Mate' },
    rating: { value: 27, tier: 'First Mate', provisional: false, games: 17 },
    stats: {
      ...line(51, 20, 240, 425, 410),
      byMode: {
        solo: line(20, 9, 118, 200),
        friends: line(11, 4, 52, 95),
        public: line(6, 2, 31, 60),
        casual: line(14, 5, 39, 70),
        ranked: line(17, 6, 47, 85),
      },
    },
  };
  const AT = `/players/${ID(51)}`;

  it('has the name, the colour, the tier and the five lines, and nothing that is only their own', async () => {
    await open(AT, { 'GET /me': () => ok(ANNE), [`GET /users/${ID(51)}`]: () => ok(MIRA) });
    expect(document.title).toBe('GameOn · Player');
    expect($('#gameon h1')?.textContent).toBe('Mira');
    expect($('.go-who .avatar')?.style.background).toBe('rgb(206, 130, 255)');
    // The tier, and no username: the server sends none for another player.
    expect(texts('.go-who p > *')).toEqual(['First Mate']);
    expect(lines()).toEqual([
      ['Solo', '20', '9', '118 of 200'],
      ['Friends', '11', '4', '52 of 95'],
      ['Public', '6', '2', '31 of 60'],
      ['Casual', '14', '5', '39 of 70'],
      ['Ranked', '17', '6', '47 of 85'],
    ]);
    // No quarter, no best score, no list of games and no account: those are the player's own.
    expect($('.go-quarter')).toBeNull();
    expect($('.go-best')).toBeNull();
    expect($('.go-played')).toBeNull();
    expect($('.go-account-card')).toBeNull();
    expect($('#gameon main')?.textContent).not.toContain('anne_bonny');
    expect(asked.filter((a) => a.includes('/me/games'))).toEqual([]);
    // The chip is the viewer's, and this is not their page.
    expect($('.go-nav .go-chip')?.hasAttribute('aria-current')).toBe(false);
  });

  it('reads the Rust server of today, which sends no lines, as five empty ones', async () => {
    const bare: Profile = { ...MIRA, stats: line(51, 20, 240, 425, 410) };
    await open(AT, { 'GET /me': () => ok(ANNE), [`GET /users/${ID(51)}`]: () => ok(bare) });
    expect(lines()).toEqual(EMPTY_LINES);
    expect(texts('.go-who p > *')).toEqual(['First Mate']);
  });

  it('leads a browser without a session to the sign-in page, and makes no guest to read the player', async () => {
    // The server shows another player to nobody without a session.
    await open(AT, {
      'GET /me': () => refused(401, 'UNAUTHENTICATED'),
      [`GET /users/${ID(51)}`]: () => refused(401, 'UNAUTHENTICATED'),
    });
    expect(places.entries()).toEqual({ paths: ['/sign-in'], at: 0 });
    expect($('#gameon h1')?.textContent).toBe('Welcome back');
    expect(asked.filter((a) => a.startsWith('POST'))).toEqual([]);
    // It is not asked again either: the answer was the server's.
    const before = asked.filter((a) => a.startsWith('GET /users/')).length;
    await settle(RETRY_MS * 2);
    expect(asked.filter((a) => a.startsWith('GET /users/'))).toHaveLength(before);
  });

  it('leads back to the page it was reached from, and to the ladder when it was reached by its address', async () => {
    await open(AT, { 'GET /me': () => ok(ANNE), [`GET /users/${ID(51)}`]: () => ok(MIRA) });
    await press('Back');
    expect(places.entries()).toEqual({ paths: ['/ladder'], at: 0 });
    act(() => root?.unmount());

    const entries = [
      { rank: 1, user: MIRA.user, rating: MIRA.rating },
      { rank: 2, user: ANNE.user, rating: ANNE.rating },
    ];
    await open('/ladder', {
      'GET /me': () => ok(ANNE),
      'GET /ladder': () => ok({ season: SEASON, entries }),
      [`GET /users/${ID(51)}`]: () => ok(MIRA),
    });
    await act(async () => {
      $(`a[href="${AT}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(places.entries()).toEqual({ paths: ['/ladder', AT], at: 1 });
    await press('Back');
    expect(places.entries()).toEqual({ paths: ['/ladder', AT], at: 0 });
  });

  it("says it couldn't load, asks again every five seconds, and leaves a player the server does not have alone", async () => {
    let up = false;
    await open(AT, { 'GET /me': () => ok(ANNE), [`GET /users/${ID(51)}`]: () => (up ? ok(MIRA) : down()) });
    expect($('.go-failed [role="alert"]')?.textContent).toBe('The profile could not be loaded.');
    const asks = (): number => asked.filter((a) => a.startsWith('GET /users/')).length;
    expect(asks()).toBe(1);
    up = true;
    await settle(RETRY_MS);
    expect(asks()).toBe(2);
    expect($('#gameon h1')?.textContent).toBe('Mira');
    act(() => root?.unmount());

    // No answer was written for this id: the server says NOT_FOUND, and asking again changes nothing.
    asked = [];
    await open(`/players/${ID(52)}`, { 'GET /me': () => ok(ANNE) });
    expect($('.go-failed [role="alert"]')?.textContent).toBe('The profile could not be loaded.');
    await settle(RETRY_MS * 3);
    expect(asks()).toBe(1);
  });
});
