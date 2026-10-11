/* How the page reaches a server: the real one, or in development the mock when the address says
   `?mock`. The mock is loaded only then, and only in a development build: the condition is false at
   build time otherwise, so the production bundle does not contain it.

   The mock lives in the page, so a reload would end it. It keeps its state in sessionStorage
   instead and comes back with it, which makes a reload in development what it is against a real
   server: the sockets are gone, the table is not. */
import { Store } from '../tableview/store';
import type { OnlineMemory, Remembered } from './online';
import type { Transport } from './socket';
import { browserTransport } from './transport';

const MOCK_KEY = 'skullking-tavern.mock.v1';
const MEMORY_KEY = 'skullking-tavern.online.v1';

let mock: Promise<Transport> | null = null;

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

export const appTransport: Transport = () => {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('mock')) {
    mock ??= import('./mock/server').then(({ MockServer }) =>
      new MockServer({ store: mockStore }).transport('this-page'),
    );
    return mock.then((open) => open());
  }
  return browserTransport();
};

/** What the online state leaves on the device for the next page (see online.ts, OnlineMemory). */
export const appMemory: OnlineMemory = {
  load: () => Store.get<Remembered>(MEMORY_KEY),
  save: (remembered) => Store.set(MEMORY_KEY, remembered),
};

/** The client build named in `hello`. */
export const BUILD: string = import.meta.env.DEV ? 'dev' : 'web';
