// @vitest-environment jsdom
/* The page's address and the legacy renderer's screens follow each other: a tap that goes to
   another screen moves the address, and an address that changes by itself (a reload, Back, Forward,
   a typed address) moves the renderer. Everything here is offline: no server is asked. */
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { App } from './App';
import { memoryPlaces } from './router/places';
import type { MemoryPlaces } from './router/places';

let host: HTMLDivElement;
let root: Root | null = null;
let places: MemoryPlaces;

const $ = (selector: string): HTMLElement | null => document.querySelector<HTMLElement>(selector);
/** Open the page at an address, as a typed address or a link from somewhere else does. */
function open(at = '/'): void {
  places = memoryPlaces(at);
  load();
}
/** Load the page where the history stands: the first time, or again. */
function load(): void {
  root = createRoot(host);
  act(() => {
    root?.render(
      <StrictMode>
        <App places={places} />
      </StrictMode>,
    );
  });
}
function close(): void {
  act(() => root?.unmount());
  root = null;
}
function click(selector: string): void {
  const el = $(selector);
  if (!el) throw new Error(`Nothing to click: ${selector}`);
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}
/** Let the table go on by itself for a while: the bots bid, and with the first step the game is saved. */
const wait = (ms: number): void =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
const back = (): void => act(() => places.back());
const forward = (): void => act(() => places.forward());
/** What the renderer shows: the heading of a screen that has one, or what it is. */
const screen = (): string =>
  $('#app .home') ? 'home' : $('#app .game') ? 'table' : ($('#app h2')?.textContent ?? 'something else');

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }));
  vi.stubGlobal('scrollTo', () => {});
  localStorage.clear();
  document.body.innerHTML = '<div id="root"></div>';
  host = document.querySelector<HTMLDivElement>('#root') ?? document.createElement('div');
});

afterEach(() => {
  if (root) close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('where the page opens', () => {
  it("opens the front door on Skull King's home, in the place of the address that was typed", () => {
    open('/');
    expect(screen()).toBe('home');
    expect(places.entries()).toEqual({ paths: ['/skull-king'], at: 0 });
  });

  it("leads the addresses that have no page yet, and any that are nobody's, to the home screen", () => {
    for (const at of ['/games', '/nowhere', '/skull-king/', '/index.html']) {
      open(at);
      expect(screen()).toBe('home');
      expect(places.entries()).toEqual({ paths: ['/skull-king'], at: 0 });
      close();
    }
  });

  it('opens the screen its address names', () => {
    open('/skull-king/solo');
    expect(screen()).toBe('New game');
    close();
    // One screen has no page of its own yet: it is the same new-game screen, and its address stays.
    open('/skull-king/one-screen');
    expect(screen()).toBe('New game');
    expect(places.path()).toBe('/skull-king/one-screen');
    close();
    open('/skull-king/score');
    expect(screen()).toBe('Score a real game');
    expect(places.path()).toBe('/skull-king/score');
  });

  it("goes home from the table's address when no game is open or saved", () => {
    open('/skull-king/table');
    expect(screen()).toBe('home');
    expect(places.entries()).toEqual({ paths: ['/skull-king'], at: 0 });
  });
});

describe('a tap moves the address', () => {
  it("goes to the new-game screen and back, and Back is the browser's Back", () => {
    open();
    click('[data-act="setup"]');
    expect(screen()).toBe('New game');
    expect(places.entries()).toEqual({ paths: ['/skull-king', '/skull-king/solo'], at: 1 });
    click('[data-act="home"]');
    expect(screen()).toBe('home');
    // Not a third entry: the way back is the way the player came.
    expect(places.entries()).toEqual({ paths: ['/skull-king', '/skull-king/solo'], at: 0 });
  });

  it('puts the table in the place of the screen the game was set up on, and saves the game under its address', () => {
    open();
    click('[data-act="setup"]');
    click('[data-act="start"]');
    expect(screen()).toBe('table');
    expect(places.entries()).toEqual({ paths: ['/skull-king', '/skull-king/table'], at: 1 });

    // A reload at the table's address is the same game, once it has been saved: a bot has bid.
    wait(3000);
    const round = $('#app .g-top')?.textContent;
    close();
    load();
    expect(screen()).toBe('table');
    expect($('#app .g-top')?.textContent).toBe(round);
    expect(places.path()).toBe('/skull-king/table');

    // Leaving the table is the way back home, and the game waits there.
    click('#app .g-top [data-act="home"]');
    expect(screen()).toBe('home');
    expect(places.entries()).toEqual({ paths: ['/skull-king', '/skull-king/table'], at: 0 });
    expect($('#app [data-act="resume"]')).not.toBeNull();
    click('[data-act="resume"]');
    expect(screen()).toBe('table');
    expect(places.entries()).toEqual({ paths: ['/skull-king', '/skull-king/table'], at: 1 });
  });

  it('goes to the scoresheet and back', () => {
    open();
    click('[data-act="track"]');
    expect(screen()).toBe('Score a real game');
    expect(places.entries()).toEqual({ paths: ['/skull-king', '/skull-king/score'], at: 1 });
    click('[data-act="home"]');
    expect(screen()).toBe('home');
    expect(places.path()).toBe('/skull-king');
  });

  it('puts the home screen in the place of a screen that was opened by its address: there is no way back to go', () => {
    open('/skull-king/solo');
    click('[data-act="home"]');
    expect(screen()).toBe('home');
    expect(places.entries()).toEqual({ paths: ['/skull-king'], at: 0 });
  });
});

describe("the browser's Back and Forward move the screen", () => {
  it('goes back from the new-game screen to the home screen, and forward to it again', () => {
    open();
    click('[data-act="setup"]');
    back();
    expect(screen()).toBe('home');
    expect(places.path()).toBe('/skull-king');
    forward();
    expect(screen()).toBe('New game');
    expect(places.path()).toBe('/skull-king/solo');
  });

  it('leaves an offline table by Back with the game saved, and sits back down at it by Forward', () => {
    open();
    click('[data-act="setup"]');
    click('[data-act="start"]');
    wait(3000);
    back();
    expect(screen()).toBe('home');
    expect($('#app [data-act="resume"]')).not.toBeNull();
    forward();
    expect(screen()).toBe('table');
    expect(places.entries()).toEqual({ paths: ['/skull-king', '/skull-king/table'], at: 1 });
  });

  it('goes from the scoresheet to the home screen and back to the same sheet', () => {
    open();
    click('[data-act="track"]');
    click('[data-act="trkStart"]');
    const sheet = $('#app .g-top')?.textContent;
    expect(sheet).toBeTruthy();
    back();
    expect(screen()).toBe('home');
    forward();
    expect($('#app .g-top')?.textContent).toBe(sheet);
    expect(places.path()).toBe('/skull-king/score');
  });
});
