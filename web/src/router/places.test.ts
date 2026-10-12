// @vitest-environment jsdom
/* The browser's history behind the router: the address it reads and writes, and what it keeps. */
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { browserPlaces, memoryPlaces } from './places';

afterEach(() => {
  history.replaceState(null, '', '/');
});

describe("the browser's history", () => {
  it('reads the path, writes a new entry or this one, and keeps the note of each', () => {
    history.replaceState(null, '', '/skull-king');
    const places = browserPlaces();
    expect(places.path()).toBe('/skull-king');
    expect(places.note()).toBeNull();
    const length = history.length;
    places.push('/skull-king/solo', { from: '/skull-king' });
    expect(location.pathname).toBe('/skull-king/solo');
    expect(history.length).toBe(length + 1);
    expect(places.note()).toEqual({ from: '/skull-king' });
    places.replace('/skull-king/table', { from: '/skull-king' });
    expect(location.pathname).toBe('/skull-king/table');
    expect(history.length).toBe(length + 1);
  });

  it("keeps what follows the question mark on every address: it is the page's, not one screen's", () => {
    history.replaceState(null, '', '/?mock');
    const places = browserPlaces();
    places.replace('/skull-king', null);
    expect(location.pathname + location.search).toBe('/skull-king?mock');
    places.push('/skull-king/online', null);
    expect(location.pathname + location.search).toBe('/skull-king/online?mock');
    expect(places.path()).toBe('/skull-king/online');
  });

  it('tells its listeners when the browser went back, until they stop listening', async () => {
    history.replaceState(null, '', '/skull-king');
    const places = browserPlaces();
    let heard = 0;
    const stop = places.listen(() => heard++);
    places.push('/skull-king/score', null);
    expect(heard).toBe(0);
    const arrived = new Promise((resolve) => addEventListener('popstate', resolve, { once: true }));
    places.back();
    await arrived;
    expect(heard).toBe(1);
    expect(places.path()).toBe('/skull-king');
    stop();
    dispatchEvent(new PopStateEvent('popstate'));
    expect(heard).toBe(1);
  });
});

describe("a history of the tests' own", () => {
  it('drops what was ahead when a new entry is made, and stays put at either end', () => {
    const places = memoryPlaces('/a');
    places.push('/b', 1);
    places.push('/c', 2);
    places.back();
    places.back();
    places.back();
    expect(places.entries()).toEqual({ paths: ['/a', '/b', '/c'], at: 0 });
    places.push('/d', 3);
    expect(places.entries()).toEqual({ paths: ['/a', '/d'], at: 1 });
    expect(places.note()).toBe(3);
    places.forward();
    expect(places.path()).toBe('/d');
  });
});
