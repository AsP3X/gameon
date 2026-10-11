// @vitest-environment jsdom
/* The service worker's rules, with the browser's side of it written by hand: what it keeps, what
   it answers itself, and above all what it leaves alone. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

type Handler = (event: never) => void;

const ORIGIN = location.origin;
let handlers: Record<string, Handler>;
/** Cache name → the paths in it. */
let stored: Map<string, Set<string>>;
let network: ReturnType<typeof vi.fn<(request: Request) => Promise<Response>>>;
let skipWaiting: ReturnType<typeof vi.fn<() => Promise<void>>>;
let claim: ReturnType<typeof vi.fn<() => Promise<void>>>;
/** How the worker last looked something up in what it kept. */
let lookup: CacheQueryOptions | undefined;

const pathOf = (request: Request | string): string =>
  new URL(typeof request === 'string' ? request : request.url, ORIGIN).pathname;
const kept = (path: string): Response => new Response(`kept ${path}`);

/** What the worker did with a request: nothing (the browser fetches it), or the answer it gave. */
function fetched(url: string, init: { method?: string; mode?: string } = {}): Promise<Response> | null {
  let answer: Promise<Response> | null = null;
  const request = { url: new URL(url, ORIGIN).href, method: init.method ?? 'GET', mode: init.mode ?? 'cors' };
  handlers.fetch({
    request,
    respondWith: (response: Promise<Response>) => {
      answer = response;
    },
  } as never);
  return answer;
}
async function lifecycle(name: 'install' | 'activate'): Promise<void> {
  let done: Promise<unknown> = Promise.resolve();
  handlers[name]({
    waitUntil: (work: Promise<unknown>) => {
      done = work;
    },
  } as never);
  await done;
}

beforeEach(async () => {
  handlers = {};
  stored = new Map();
  lookup = undefined;
  network = vi.fn<(request: Request) => Promise<Response>>((request) =>
    Promise.resolve(new Response(`network ${pathOf(request)}`)),
  );
  skipWaiting = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  claim = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  vi.stubGlobal('fetch', network);
  vi.stubGlobal('caches', {
    open: (name: string) => {
      const paths = stored.get(name) ?? new Set<string>();
      stored.set(name, paths);
      return Promise.resolve({
        addAll: (files: string[]) => {
          for (const file of files) paths.add(file);
          return Promise.resolve();
        },
      });
    },
    keys: () => Promise.resolve([...stored.keys()]),
    delete: (name: string) => Promise.resolve(stored.delete(name)),
    match: (request: Request | string, options?: CacheQueryOptions) => {
      lookup = options;
      const path = pathOf(request);
      for (const paths of stored.values()) if (paths.has(path)) return Promise.resolve(kept(path));
      return Promise.resolve(undefined);
    },
  });
  vi.spyOn(self, 'addEventListener').mockImplementation((type: string, handler: unknown) => {
    handlers[type] = handler as Handler;
  });
  vi.stubGlobal('skipWaiting', skipWaiting);
  vi.stubGlobal('clients', { claim });
  vi.resetModules();
  await import('./sw');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the service worker', () => {
  it('keeps the build files when it is installed and takes over at once', async () => {
    await lifecycle('install');
    expect([...stored.keys()]).toHaveLength(1);
    expect([...stored.keys()][0]).toMatch(/^skt-/);
    expect(skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('throws away what an older build kept, and nothing that is not its own', async () => {
    stored.set('skt-older', new Set(['/assets/old.js']));
    stored.set('someone-else', new Set(['/x']));
    await lifecycle('install');
    await lifecycle('activate');
    expect([...stored.keys()].filter((name) => name.startsWith('skt-'))).toHaveLength(1);
    expect(stored.has('someone-else')).toBe(true);
    expect(stored.has('skt-older')).toBe(false);
    expect(claim).toHaveBeenCalledTimes(1);
  });

  it('never answers for the server: /api is left to the network, whatever is asked', () => {
    stored.set('skt-x', new Set(['/api/v1/me', '/api/v1/lobbies']));
    expect(fetched('/api/v1/me')).toBeNull();
    expect(fetched('/api/v1/lobbies')).toBeNull();
    expect(fetched('/api/v1/games/1/log')).toBeNull();
    expect(fetched('/api/v1/ws', { mode: 'websocket' })).toBeNull();
    expect(fetched('/api/v1/auth/login', { method: 'POST' })).toBeNull();
    expect(network).not.toHaveBeenCalled();
  });

  it('leaves alone what is not a GET and what is not from this origin', () => {
    expect(fetched('/assets/main.js', { method: 'POST' })).toBeNull();
    expect(fetched('https://elsewhere.example/assets/main.js')).toBeNull();
  });

  it('answers a build file from what it kept, and from the network when it kept none', async () => {
    stored.set('skt-x', new Set(['/assets/main.js']));
    expect(await (await fetched('/assets/main.js'))?.text()).toBe('kept /assets/main.js');
    expect(network).not.toHaveBeenCalled();
    // A server's `Vary: Origin` must not hide a kept file from the page's own request for it.
    expect(lookup).toEqual({ ignoreVary: true });
    expect(await (await fetched('/assets/other.js'))?.text()).toBe('network /assets/other.js');
  });

  it('opens the page from the network, so a reload after a deploy is the new page', async () => {
    stored.set('skt-x', new Set(['/index.html']));
    expect(await (await fetched('/', { mode: 'navigate' }))?.text()).toBe('network /');
  });

  it('opens the kept page when there is no network, and fails when it kept none', async () => {
    network.mockRejectedValue(new TypeError('Failed to fetch'));
    stored.set('skt-x', new Set(['/index.html']));
    expect(await (await fetched('/', { mode: 'navigate' }))?.text()).toBe('kept /index.html');
    stored.clear();
    await expect(fetched('/', { mode: 'navigate' })).rejects.toThrow('Failed to fetch');
  });
});
