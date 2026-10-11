/* How the page reaches a server: the real one, or in development the mock when the address says
   `?mock`. The mock is loaded only then, and only in a development build: the condition is false at
   build time otherwise, so the production bundle does not contain it. */
import type { Backend } from './api';
import { browserBackend } from './transport';

let mock: Promise<Backend> | null = null;

const asked = (): boolean => new URLSearchParams(location.search).has('mock');
/** One mock server and one browser profile at it, for as long as the page lives. */
const mockBackend = (): Promise<Backend> =>
  (mock ??= import('./mock/server').then(({ MockServer }) => new MockServer().browser()));

export const appBackend: Backend = {
  transport: () => {
    if (import.meta.env.DEV && asked()) return mockBackend().then((b) => b.transport());
    return browserBackend.transport();
  },
  rest: (method, path, body) => {
    if (import.meta.env.DEV && asked()) return mockBackend().then((b) => b.rest(method, path, body));
    return browserBackend.rest(method, path, body);
  },
};

/** The client build named in `hello`. */
export const BUILD: string = import.meta.env.DEV ? 'dev' : 'web';
