/* How the page reaches a server: the real one, or in development the mock when the address says
   `?mock`. The mock is loaded only then, and only in a development build: the condition is false at
   build time otherwise, so the production bundle does not contain it.

   The mock lives in the page, so a reload would end it. It keeps its state in sessionStorage
   instead and comes back with it, which makes a reload in development what it is against a real
   server: the sockets are gone, the table is not. */
import { Store } from '../tableview/store';
import type { Backend } from './api';
import type { OnlineMemory, Remembered } from './online';
import { browserBackend } from './transport';

const MOCK_KEY = 'skullking-tavern.mock.v1';
const MEMORY_KEY = 'skullking-tavern.online.v1';

let mock: Promise<Backend> | null = null;

/** The tab's own storage, or nothing where it is blocked: the mock then simply forgets on reload. */
const mockStore = {
  load(): string | null {
    try {
      return sessionStorage.getItem(MOCK_KEY);
    } catch {
      return null;
    }
  },
  save(data: string): void {
    try {
      sessionStorage.setItem(MOCK_KEY, data);
    } catch {
      // Private mode or a full quota.
    }
  },
};

const asked = (): boolean => new URLSearchParams(location.search).has('mock');
/** One mock server and one browser profile at it, for as long as the page lives. */
const mockBackend = (): Promise<Backend> =>
  (mock ??= import('./mock/server').then(({ MockServer }) => new MockServer({ store: mockStore }).page('this-page')));

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

/** What the online state leaves on the device for the next page (see online.ts, OnlineMemory). */
export const appMemory: OnlineMemory = {
  load: () => Store.get<Remembered>(MEMORY_KEY),
  save: (remembered) => Store.set(MEMORY_KEY, remembered),
};

/** The client build named in `hello`. */
export const BUILD: string = import.meta.env.DEV ? 'dev' : 'web';
