/* Registers the service worker (src/sw.ts). Only a built page has one: in development the files
   change under the page, and a worker that kept them would be in the way. */

export interface WorkerHost {
  register(url: string): Promise<unknown>;
}

/**
 * Register the worker once the page has loaded, so it never competes with the page's own start.
 * A browser without service workers, or one that refuses (private mode, no HTTPS), plays on
 * without: nothing but opening with no network depends on it.
 */
export function registerWorker(
  built: boolean = import.meta.env.PROD,
  host: WorkerHost | undefined = 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
  loaded: (then: () => void) => void = (then) => {
    if (document.readyState === 'complete') then();
    else addEventListener('load', then, { once: true });
  },
): void {
  if (!built || !host) return;
  loaded(() => {
    host.register('/sw.js').catch(() => {
      // Refused: the page works as it did.
    });
  });
}
