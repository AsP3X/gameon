/// <reference lib="webworker" />
/* The service worker: what makes the page installable and lets it open with no network.

   It keeps the build's own files, and nothing else. `/api` and `/ocho` are never touched: every
   answer of the server is fetched from the server, so nothing here can show a player something old about a game,
   a table or an account. With no network the page still opens, the offline modes play, and the
   online screens say that the server cannot be reached.

   The two markers below are filled in when the build is done (vite.config.ts): the list of files
   the build wrote, and a name for that list. */
const sw = self as unknown as ServiceWorkerGlobalScope;

const FILES = '__SKT_PRECACHE__'.split('|');
const CACHE = `skt-${'__SKT_VERSION__'}`;
const PAGE = '/index.html';

sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((name) => name.startsWith('skt-') && name !== CACHE).map((name) => caches.delete(name)),
        ),
      )
      .then(() => sw.clients.claim()),
  );
});

/** The page itself: from the network, so a reload after a deploy is the new page; the kept one only when there is none. */
async function page(request: Request): Promise<Response> {
  try {
    return await fetch(request);
  } catch (error) {
    const kept = await caches.match(PAGE);
    if (kept) return kept;
    throw error;
  }
}

/**
 * A file of the build: the kept one, since its name changes when its content does. A server may
 * answer `Vary: Origin`, and the page's request for a script or a font names an origin where the
 * worker's own did not: the file is the same one, so that header is not compared.
 */
async function file(request: Request): Promise<Response> {
  return (await caches.match(request, { ignoreVary: true })) ?? fetch(request);
}

sw.addEventListener('fetch', (event) => {
  const { request } = event,
    url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    url.origin !== sw.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/ocho/')
  )
    return;
  event.respondWith(request.mode === 'navigate' ? page(request) : file(request));
});
