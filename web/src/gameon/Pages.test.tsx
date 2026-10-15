// @vitest-environment jsdom
/* The four pages the footer leads to: how to play, privacy, the imprint and a game to suggest. They
   run on the whole page against the mock server, with every request the page makes written down:
   the footer's links, the way back, what each page says, and that a suggestion is kept on the
   device and sent nowhere. */
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { App } from '../App';
import type { Backend } from '../net/api';
import { MockServer } from '../net/mock/server';
import { memoryPlaces } from '../router/places';
import type { MemoryPlaces } from '../router/places';
import { GAME_MAX, NOTE_MAX, SUGGESTION_KEY } from './Suggest';

let host: HTMLDivElement;
let root: Root | null = null;
let places: MemoryPlaces;
let server: MockServer;
/** The browser the page runs in, and every request and socket the page asked it for. */
let page: Backend;
let asked: string[];

const $ = (selector: string): HTMLElement | null => document.querySelector<HTMLElement>(selector);
const texts = (selector: string): string[] =>
  Array.from(document.querySelectorAll<HTMLElement>(selector), (el) => el.textContent ?? '');
const settle = (ms = 0): Promise<void> => act(() => vi.advanceTimersByTimeAsync(ms).then(() => {}));
async function clickOn(el: HTMLElement | null): Promise<void> {
  if (!el) throw new Error('Nothing to click');
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);
  });
}
/** The footer's link of that name. */
const footLink = (name: string): HTMLAnchorElement => {
  const el = Array.from(document.querySelectorAll<HTMLAnchorElement>('.go-foot-links a')).find(
    (a) => a.textContent === name,
  );
  if (!el) throw new Error(`The footer has no link "${name}"`);
  return el;
};
async function type(selector: string, value: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
  if (!input) throw new Error(`Nothing to type into: ${selector}`);
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(0);
  });
}
async function submit(): Promise<void> {
  const form = $('#gameon form');
  if (!form) throw new Error('No form on screen');
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);
  });
}
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
function closePage(): void {
  act(() => root?.unmount());
  root = null;
}
const kept = (): unknown => JSON.parse(localStorage.getItem(SUGGESTION_KEY) ?? 'null');

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }));
  vi.stubGlobal('scrollTo', () => {});
  localStorage.clear();
  document.title = 'Skull King Tavern';
  document.body.innerHTML = '<div id="root"></div>';
  host = document.querySelector<HTMLDivElement>('#root') ?? document.createElement('div');
  server = new MockServer({});
  asked = [];
  const browser = server.browser();
  page = {
    rest: (method, path, body) => {
      asked.push(`${method} ${path}`);
      return browser.rest(method, path, body);
    },
    transport: () => {
      asked.push('socket');
      return browser.transport();
    },
  };
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const PAGES: [name: string, at: string, tab: string][] = [
  ['How to play', '/how-to-play', 'GameOn · How to play'],
  ['Privacy', '/privacy', 'GameOn · Privacy'],
  ['Imprint', '/imprint', 'GameOn · Imprint'],
  ['Suggest a game', '/suggest', 'GameOn · Suggest a game'],
];

describe('the footer', () => {
  it('keeps Games and Ladder, and names the four pages after them', async () => {
    await openAt('/');
    expect(texts('.go-foot-links a').filter((name) => name !== 'Sign in')).toEqual([
      'Games',
      'Ladder',
      'How to play',
      'Privacy',
      'Imprint',
      'Suggest a game',
    ]);
    expect(footLink('Games').getAttribute('href')).toBe('/games');
    expect(footLink('Ladder').getAttribute('href')).toBe('/ladder');
    for (const [name, at] of PAGES) expect(footLink(name).getAttribute('href')).toBe(at);
  });

  // The profile is an account's or a guest's: the browser has its guest before the page opens.
  for (const from of ['/', '/games', '/profile', '/ladder'])
    it(`opens each of the four pages from ${from}, and Back is the page it was opened from`, async () => {
      await page.rest('POST', '/auth/guest');
      await openAt(from);
      expect(places.path()).toBe(from);
      for (const [name, at, tab] of PAGES) {
        await clickOn(footLink(name));
        expect(places.path()).toBe(at);
        expect($('#gameon h1')?.textContent).toBe(name);
        expect(document.title).toBe(tab);
        // The title has the keyboard, and the page's own link in the footer says it is this one.
        expect(document.activeElement).toBe($('#gameon h1'));
        expect(footLink(name).getAttribute('aria-current')).toBe('page');
        await clickOn($('.go-doc .go-back'));
        expect(places.path()).toBe(from);
        expect(places.entries()).toEqual({ paths: [from, at], at: 0 });
        // The next page starts from a history of this one page again.
        closePage();
        await openAt(from);
      }
    });

  it('leads from one of the four to another, and to the front page from one opened by its address', async () => {
    await openAt('/privacy');
    await clickOn(footLink('Imprint'));
    expect(places.path()).toBe('/imprint');
    await clickOn($('.go-doc .go-back'));
    expect(places.path()).toBe('/privacy');
    // Nothing led here: the way back is the front page, where the footer sits.
    await clickOn($('.go-doc .go-back'));
    expect(places.path()).toBe('/');
    expect($('.go-hero')).not.toBeNull();
  });

  it('makes no guest and no connection for any of the four', async () => {
    for (const [, at] of PAGES) {
      await openAt(at);
      closePage();
    }
    expect(asked).not.toContain('POST /auth/guest');
    expect(asked).not.toContain('socket');
    expect((await server.browser().rest('GET', '/me')).status).toBe(401);
  });
});

describe('how to play', () => {
  it('says a hand in its own words: a bid, a trick, and the score', async () => {
    await openAt('/how-to-play');
    expect(texts('.go-doc-block h2')).toEqual(['A hand', 'A bid', 'A trick', 'The score']);
    expect($('.go-doc-head p')?.textContent).toBe(
      'Skull King in three minutes: a bid, a trick, and five ways to sit down.',
    );
  });

  it('names the five ways to sit down, each with the address it has', async () => {
    await openAt('/how-to-play');
    expect(
      Array.from(document.querySelectorAll('.go-doc-way'), (a) => [
        a.querySelector('b')?.textContent,
        a.getAttribute('href'),
      ]),
    ).toEqual([
      ['Against bots', '/skull-king/solo'],
      ['One screen', '/skull-king/one-screen'],
      ['Tables', '/skull-king/online'],
      ['Friends', '/skull-king/online/new'],
      ['Ranked', '/skull-king/ranked'],
    ]);
    // The numbers are on the rules sheet at Skull King's home, which this page leads to.
    expect($('.go-doc-block .go-inline-link')?.getAttribute('href')).toBe('/skull-king');
    await clickOn($('.go-doc-ways a.btn'));
    expect(places.path()).toBe('/skull-king');
  });

  it('is where Games and the landing send somebody who asks how', async () => {
    await openAt('/games');
    const hows = (card: string): HTMLAnchorElement[] =>
      Array.from(
        document.querySelector(`[aria-labelledby="${card}"]`)?.querySelectorAll<HTMLAnchorElement>('a') ?? [],
      ).filter((a) => a.textContent === 'How to play');
    const how = hows('go-sk-title');
    expect(how.map((a) => a.getAttribute('href'))).toEqual(['/how-to-play', '/how-to-play']);
    // Ocho has a guide of its own.
    expect(hows('go-ocho-title').map((a) => a.getAttribute('href'))).toEqual([
      '/games/ocho/how-to-play',
      '/games/ocho/how-to-play',
    ]);
    await clickOn(how[0]);
    expect(places.path()).toBe('/how-to-play');
    closePage();
    await openAt('/');
    expect($('.go-pick .go-actions a.ghost')?.getAttribute('href')).toBe('/how-to-play');
  });
});

describe('privacy', () => {
  it('says what is kept: the account, the cookie, the stored games and the game on the device', async () => {
    await openAt('/privacy');
    expect(texts('.go-doc-block h2')).toEqual([
      'Your account',
      'The session cookie',
      'The games the server stores',
      'What other players see',
      'On this device',
    ]);
    const said = texts('.go-doc-block p').join(' ');
    for (const word of ['display name', 'colour', 'username', 'password', 'hash', 'cookie', 'deals', 'moves'])
      expect(said).toContain(word);
    expect(said).toContain('One game against bots or on one screen is saved in this browser');
  });

  it('says the ladder shows the display name, the colour and the rating, and not the username', async () => {
    await openAt('/privacy');
    expect(texts('.go-doc-block p')).toContain(
      'The ladder is public. It shows your display name, your colour, your tier and your rating. It does not show your username, and neither does your page as other players see it.',
    );
    expect($('.go-doc-note a')?.getAttribute('href')).toBe('/imprint');
  });

  it('says a ranked leave is kept: how often this season, and until when ranked is closed', async () => {
    await openAt('/privacy');
    const stored = Array.from(document.querySelectorAll('.go-doc-block')).find(
      (block) => block.querySelector('h2')?.textContent === 'The games the server stores',
    );
    expect(Array.from(stored?.querySelectorAll('p') ?? [], (p) => p.textContent)[1]).toBe(
      'When you walk out of a ranked game, the server keeps how often you have done so this season, and until when ranked stays closed for you. The ladder shows neither.',
    );
  });
});

describe('the imprint', () => {
  it('says it is not filled in yet, and names nobody', async () => {
    await openAt('/imprint');
    expect(texts('.go-doc-block p')).toEqual([
      'The imprint is not filled in yet. The publisher’s name and address belong here.',
    ]);
    // No person, no street, no mail address and no phone number is made up for it.
    expect($('.go-doc')?.textContent).not.toMatch(/@|\d/);
  });
});

describe('suggesting a game', () => {
  it('keeps the note on this device, says so, and sends no request', async () => {
    await openAt('/suggest');
    expect($('.go-form-note')?.textContent).toBe(
      'There is no inbox behind this page yet. Your note is kept on this device and is sent nowhere.',
    );
    const before = [...asked];
    await type('#suggest-game', '  Hearts ');
    await type('#suggest-note', 'We play it every Sunday.');
    expect($('.go-saved')).toBeNull();
    await submit();
    await settle(10_000);
    expect($('.go-saved')?.textContent).toBe('Saved on this device.');
    expect($('.go-saved')?.getAttribute('role')).toBe('status');
    expect(kept()).toEqual({ game: 'Hearts', note: 'We play it every Sunday.' });
    // Nothing went to the server for it: no call, and no socket.
    expect(asked).toEqual(before);
    expect(asked.every((call) => call === 'GET /me' || call === 'GET /config')).toBe(true);
  });

  it('puts a second note in the place of the first', async () => {
    await openAt('/suggest');
    await type('#suggest-game', 'Hearts');
    await submit();
    expect(kept()).toEqual({ game: 'Hearts', note: '' });
    // Typing again takes the word back until the new note is saved.
    await type('#suggest-game', 'Chess');
    expect($('.go-saved')).toBeNull();
    await type('#suggest-note', 'Against a friend.');
    await submit();
    expect($('.go-saved')?.textContent).toBe('Saved on this device.');
    expect(kept()).toEqual({ game: 'Chess', note: 'Against a friend.' });
    expect(Object.keys(localStorage).filter((key) => key.includes('suggestion'))).toEqual([SUGGESTION_KEY]);
  });

  it('shows the note it kept to a page that opens later', async () => {
    localStorage.setItem(SUGGESTION_KEY, JSON.stringify({ game: 'Ludo', note: 'Four of us.' }));
    await openAt('/suggest');
    expect(document.querySelector<HTMLInputElement>('#suggest-game')?.value).toBe('Ludo');
    expect(document.querySelector<HTMLTextAreaElement>('#suggest-note')?.value).toBe('Four of us.');
    expect($('.go-saved')).toBeNull();
  });

  it('asks for a name before it keeps anything, and takes what is not a note as none', async () => {
    localStorage.setItem(SUGGESTION_KEY, '{"game":7}');
    await openAt('/suggest');
    expect(document.querySelector<HTMLInputElement>('#suggest-game')?.value).toBe('');
    await type('#suggest-note', 'No name yet.');
    await submit();
    expect($('#suggest-game-help')?.textContent).toBe('Name the game first.');
    expect($('#suggest-game')?.getAttribute('aria-invalid')).toBe('true');
    expect($('.go-saved')).toBeNull();
    expect(localStorage.getItem(SUGGESTION_KEY)).toBe('{"game":7}');
    expect(document.querySelector<HTMLInputElement>('#suggest-game')?.maxLength).toBe(GAME_MAX);
    expect(document.querySelector<HTMLTextAreaElement>('#suggest-note')?.maxLength).toBe(NOTE_MAX);
  });

  it('says so when this browser would not keep the note', async () => {
    await openAt('/suggest');
    await type('#suggest-game', 'Hearts');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    await submit();
    expect($('.go-saved')).toBeNull();
    expect($('.go-send .alert')?.textContent).toBe('This browser would not keep the note.');
  });

  it('is where the tile under the announced games leads, on Games and on the landing', async () => {
    await openAt('/games');
    expect($('.go-suggest a')?.getAttribute('href')).toBe('/suggest');
    await clickOn($('.go-suggest a'));
    expect(places.path()).toBe('/suggest');
    closePage();
    await openAt('/');
    expect(Array.from(document.querySelectorAll('.go-suggest a'), (a) => a.getAttribute('href'))).toEqual([
      '/suggest',
      '/suggest',
    ]);
  });
});
