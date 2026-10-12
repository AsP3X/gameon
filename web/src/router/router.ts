/* The router: which address the page is at, and the three ways to another one.

   - go(path) is a link: a new entry, so the browser's Back returns here.
   - go(path, { replace: true }) puts another page in this entry's place: a redirect, or a page that
     must not be come back to.
   - up(parent) is the Back arrow of a page. When the page was reached from that parent, it is the
     browser's Back, so the entries stay as short as the way the player went. Reached any other
     way (a typed address, a reload into a new tab), the parent takes this entry's place.

   Each entry is given a note of where it was made from, which is how up() knows. The browser
   answers Back a moment later, and the page has to show the parent now: the router says so at
   once, and what is asked of it in between is written to the history when the browser has arrived. */
import type { Places } from './places';

/** Its members are functions of their own: they can be handed on without the router. */
export interface Router {
  /** The path the page is at. The same string until it changes. */
  getPath: () => string;
  subscribe: (changed: () => void) => () => void;
  go: (path: string, how?: { replace?: boolean }) => void;
  up: (parent: string) => void;
}

const fromOf = (note: unknown): string | null =>
  typeof note === 'object' && note !== null && 'from' in note && typeof note.from === 'string' ? note.from : null;

export function createRouter(places: Places): Router {
  const subs = new Set<() => void>();
  let path = places.path();
  let unlisten: (() => void) | null = null;
  /** What was asked while the browser was still on its way back, in order. null when it is not. */
  let arriving: (() => void)[] | null = null;

  const show = (next: string): void => {
    if (next === path) return;
    path = next;
    subs.forEach((fn) => fn());
  };
  const write = (to: string, replace: boolean): void => {
    if (replace) places.replace(to, { from: fromOf(places.note()) });
    else places.push(to, { from: places.path() });
  };
  const moved = (): void => {
    const waiting = arriving;
    arriving = null;
    waiting?.forEach((fn) => fn());
    show(places.path());
    // Nobody is reading any more: the browser was only heard out for the way back.
    if (!subs.size) {
      unlisten?.();
      unlisten = null;
    }
  };

  const go: Router['go'] = (to, how = {}) => {
    if (to === path) return;
    const replace = how.replace === true;
    if (arriving) arriving.push(() => write(to, replace));
    else write(to, replace);
    show(to);
  };
  return {
    getPath: () => path,
    subscribe(changed) {
      subs.add(changed);
      unlisten ??= places.listen(moved);
      return () => {
        subs.delete(changed);
        if (subs.size) return;
        unlisten?.();
        unlisten = null;
      };
    },
    go,
    up(parent) {
      if (parent === path) return;
      if (arriving || fromOf(places.note()) !== parent) return go(parent, { replace: true });
      arriving = [];
      unlisten ??= places.listen(moved);
      // Shown first: a history that answers at once (the tests' own) is then already where it says.
      show(parent);
      places.back();
    },
  };
}
