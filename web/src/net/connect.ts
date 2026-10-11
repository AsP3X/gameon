/* How the page reaches a server: the real one, or in development the mock when the address says
   `?mock`. The mock is loaded only then, and only in a development build: the condition is false at
   build time otherwise, so the production bundle does not contain it. */
import type { Transport } from './socket';
import { browserTransport } from './transport';

let mock: Promise<Transport> | null = null;

export const appTransport: Transport = () => {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('mock')) {
    mock ??= import('./mock/server').then(({ MockServer }) => new MockServer().transport());
    return mock.then((open) => open());
  }
  return browserTransport();
};

/** The client build named in `hello`. */
export const BUILD: string = import.meta.env.DEV ? 'dev' : 'web';
