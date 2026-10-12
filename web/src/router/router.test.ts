/* The router over a history of its own: a link, a redirect, the Back arrow of a page, and the
   browser's own two buttons. */
import { describe, expect, it } from 'vite-plus/test';
import { memoryPlaces } from './places';
import type { Places } from './places';
import { createRouter } from './router';

/** A router somebody is reading, and every path it said it changed to. */
function watched(places: Places) {
  const router = createRouter(places);
  const seen: string[] = [];
  const stop = router.subscribe(() => seen.push(router.getPath()));
  return { router, seen, stop };
}

describe('the router', () => {
  it('starts at the address the page opened on', () => {
    expect(createRouter(memoryPlaces('/skull-king/score')).getPath()).toBe('/skull-king/score');
  });

  it('goes on to a new entry, or puts another page in the place of this one', () => {
    const places = memoryPlaces('/');
    const { router, seen } = watched(places);
    router.go('/a');
    router.go('/b');
    expect(places.entries()).toEqual({ paths: ['/', '/a', '/b'], at: 2 });
    router.go('/c', { replace: true });
    expect(places.entries()).toEqual({ paths: ['/', '/a', '/c'], at: 2 });
    expect(seen).toEqual(['/a', '/b', '/c']);
    // Where it already is, is nowhere to go.
    router.go('/c');
    router.go('/c', { replace: true });
    expect(places.entries().paths).toHaveLength(3);
    expect(seen).toHaveLength(3);
  });

  it("goes back the browser's way when the page was reached from its parent", () => {
    const places = memoryPlaces('/home');
    const { router, seen } = watched(places);
    router.go('/home/child');
    router.up('/home');
    expect(router.getPath()).toBe('/home');
    // The entry ahead is still there, as after the browser's own Back.
    expect(places.entries()).toEqual({ paths: ['/home', '/home/child'], at: 0 });
    expect(seen).toEqual(['/home/child', '/home']);
    places.forward();
    expect(router.getPath()).toBe('/home/child');
  });

  it('puts the parent in this place when the page was reached some other way', () => {
    // A typed address: nothing is behind it.
    const typed = memoryPlaces('/home/child');
    const a = watched(typed);
    a.router.up('/home');
    expect(typed.entries()).toEqual({ paths: ['/home'], at: 0 });

    // From a page that is not the parent: the way there is kept, and no entry is added.
    const places = memoryPlaces('/list');
    const b = watched(places);
    b.router.go('/home/child');
    b.router.up('/home');
    expect(places.entries()).toEqual({ paths: ['/list', '/home'], at: 1 });
  });

  it('remembers where an entry was made from through a redirect', () => {
    const places = memoryPlaces('/home');
    const { router } = watched(places);
    router.go('/setup');
    router.go('/table', { replace: true });
    router.up('/home');
    expect(places.entries()).toEqual({ paths: ['/home', '/table'], at: 0 });
  });

  it("follows the browser's Back and Forward, and stops listening when nobody reads it", () => {
    const places = memoryPlaces('/');
    const { router, seen, stop } = watched(places);
    router.go('/a');
    places.back();
    expect(router.getPath()).toBe('/');
    places.forward();
    expect(router.getPath()).toBe('/a');
    expect(seen).toEqual(['/a', '/', '/a']);
    stop();
    places.back();
    expect(seen).toHaveLength(3);
  });

  it('shows the parent at once while the browser is still on its way back, and writes what was asked meanwhile when it has arrived', () => {
    // A browser answers Back a moment later: this one answers when the test says so.
    const inner = memoryPlaces('/home');
    let pending = 0;
    const slow: Places = { ...inner, back: () => void pending++ };
    const arrive = (): void => {
      while (pending-- > 0) inner.back();
      pending = 0;
    };
    const { router, seen } = watched(slow);
    router.go('/home/child');
    router.up('/home');
    expect(router.getPath()).toBe('/home');
    expect(inner.path()).toBe('/home/child');
    // A table opens before the browser is back: the page shows it, and the history waits.
    router.go('/table');
    expect(router.getPath()).toBe('/table');
    expect(inner.entries()).toEqual({ paths: ['/home', '/home/child'], at: 1 });
    arrive();
    expect(inner.entries()).toEqual({ paths: ['/home', '/table'], at: 1 });
    expect(router.getPath()).toBe('/table');
    expect(seen).toEqual(['/home/child', '/home', '/table']);
  });
});
