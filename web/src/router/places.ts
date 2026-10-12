/* Where the page is, as the browser keeps it: the address, the entries behind it, and the note each
   entry was given when it was made. The router (router.ts) reads and writes it through this, so the
   tests can hand it a list of their own instead of the one window a test file shares. */

export interface Places {
  /** The path of the address the page is at. */
  path(): string;
  /** What the entry the page is at was given when it was made, or null. */
  note(): unknown;
  /** A new entry after this one. Everything that was ahead of it is gone. */
  push(path: string, note: unknown): void;
  /** Another address and note for the entry the page is at. */
  replace(path: string, note: unknown): void;
  /** The browser's Back. Where it arrives is told to the listeners, now or a moment later. */
  back(): void;
  /** Hear when the browser moved along its entries by itself: Back, Forward. Returns how to stop. */
  listen(heard: () => void): () => void;
}

/**
 * The browser's own history. What follows the `?` of the address is the page's as a whole, not one
 * screen's (`?mock` in development, src/net/connect.ts): it stays on every address the page goes to.
 */
export function browserPlaces(win: Window = window): Places {
  const whole = (path: string): string => path + win.location.search;
  return {
    path: () => win.location.pathname,
    note: () => win.history.state as unknown,
    push: (path, note) => win.history.pushState(note, '', whole(path)),
    replace: (path, note) => win.history.replaceState(note, '', whole(path)),
    back: () => win.history.back(),
    listen(heard) {
      win.addEventListener('popstate', heard);
      return () => win.removeEventListener('popstate', heard);
    },
  };
}

/** A history that lives in an object, with the browser's two buttons to press. It moves at once. */
export interface MemoryPlaces extends Places {
  forward(): void;
  /** Every address from the oldest entry to the newest, and which one the page is at. */
  entries(): { paths: string[]; at: number };
}

export function memoryPlaces(start = '/'): MemoryPlaces {
  const list: { path: string; note: unknown }[] = [{ path: start, note: null }];
  const heard = new Set<() => void>();
  let at = 0;
  const move = (to: number): void => {
    if (to < 0 || to >= list.length) return;
    at = to;
    heard.forEach((fn) => fn());
  };
  return {
    path: () => list[at].path,
    note: () => list[at].note,
    push(path, note) {
      list.splice(at + 1, Infinity, { path, note });
      at++;
    },
    replace(path, note) {
      list[at] = { path, note };
    },
    back: () => move(at - 1),
    forward: () => move(at + 1),
    listen(fn) {
      heard.add(fn);
      return () => heard.delete(fn);
    },
    entries: () => ({ paths: list.map((entry) => entry.path), at }),
  };
}
