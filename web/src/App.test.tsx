// @vitest-environment jsdom
/* The React shell around the legacy renderer: it mounts the table once, even under StrictMode,
   leaves #app to it, and takes everything off the page when it unmounts. */
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { App } from './App';
import { memoryPlaces } from './router/places';
import type { MemoryPlaces } from './router/places';

let host: HTMLDivElement;
let root: Root | null = null;
/** The page's address and the entries behind it. A reload in a test keeps them, as a browser does. */
let places: MemoryPlaces;

beforeEach(() => {
  places = memoryPlaces('/skull-king');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }));
  vi.stubGlobal('scrollTo', () => {});
  localStorage.clear();
  document.body.innerHTML = '<div id="root"></div>';
  host = document.querySelector<HTMLDivElement>('#root') ?? document.createElement('div');
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

function renderApp(): void {
  root = createRoot(host);
  act(() => {
    root?.render(
      <StrictMode>
        <App places={places} />
      </StrictMode>,
    );
  });
}

describe('App', () => {
  it("renders #app and #fx inside #root, and Skull King's home next to them", () => {
    renderApp();
    const app = document.querySelector('#root > #app');
    expect(app?.querySelector('.home')).toBeNull();
    expect(document.querySelector('#root > .sk-home .logo')?.textContent).toBe('Skull King');
    expect(document.querySelector<HTMLCanvasElement>('#root > canvas#fx')?.hidden).toBe(true);
  });

  it('mounts the table exactly once under StrictMode', () => {
    renderApp();
    expect(document.querySelectorAll('symbol#ill-back')).toHaveLength(1);
    act(() => {
      document
        .querySelector('#gameon a[href="/skull-king/solo"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    document.querySelector('[data-act="crewAdd"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.querySelectorAll('.crew-row')).toHaveLength(5); // a second listener would have added two
  });

  it('takes the sprite and the listeners away when it unmounts', () => {
    renderApp();
    act(() => root?.unmount());
    root = null;
    expect(document.querySelector('svg')).toBeNull();
    expect(host.innerHTML).toBe('');
    host.innerHTML = '<div id="app"><button data-act="setup">Play</button></div>';
    document.querySelector('[data-act="setup"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(host.querySelector('.wrap')).toBeNull();
  });
});
