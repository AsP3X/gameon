// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { hasMouse, layout, tapWord } from './layout';
import { soundSheet } from './views';

/** A laid-out document `width` px wide whose media queries answer for that width. */
function viewport(width: number, fine = false): void {
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(width);
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = /min-width: (\d+)px/.exec(query);
    return { media: query, matches: min ? width >= Number(min[1]) : fine };
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('layout', () => {
  it('is the phone layout in a document that has no width, whatever matchMedia says', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ media: query, matches: true }));
    expect(layout()).toBe('phone');
    expect(tapWord()).toBe('Tap');
  });

  it('changes at 700 and at 1024', () => {
    viewport(699);
    expect(layout()).toBe('phone');
    viewport(700);
    expect(layout()).toBe('tablet');
    viewport(1023);
    expect(layout()).toBe('tablet');
    viewport(1024);
    expect(layout()).toBe('desk');
  });

  it('says click only where there is room and a mouse', () => {
    viewport(390, true);
    expect(tapWord()).toBe('Tap');
    viewport(834, false);
    expect(tapWord()).toBe('Tap');
    viewport(1440, true);
    expect(tapWord()).toBe('Click');
  });
});

describe('the vibration switch of the sound sheet', () => {
  const buzzes = (): void => {
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: () => true });
  };
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'vibrate');
  });

  it('is offered on a device that can buzz and has no mouse, at any width', () => {
    buzzes();
    viewport(390);
    expect(soundSheet()).toContain('data-k="haptics"');
    viewport(1280);
    expect(soundSheet()).toContain('data-k="haptics"');
  });

  it('is not offered where there is a mouse, however narrow the window', () => {
    // A desk's browser has `navigator.vibrate` as well, and it does nothing there.
    buzzes();
    viewport(1440, true);
    expect(hasMouse()).toBe(true);
    expect(soundSheet()).not.toContain('data-k="haptics"');
    viewport(390, true);
    expect(soundSheet()).not.toContain('data-k="haptics"');
    // The other two switches are still there.
    expect(soundSheet()).toContain('data-k="sfx"');
    expect(soundSheet()).toContain('data-k="ambience"');
  });

  it('is not offered where the browser cannot buzz', () => {
    viewport(390);
    expect(soundSheet()).not.toContain('data-k="haptics"');
  });

  it('stays in a document that has no width, whatever matchMedia says', () => {
    buzzes();
    vi.stubGlobal('matchMedia', (query: string) => ({ media: query, matches: true }));
    expect(hasMouse()).toBe(false);
    expect(soundSheet()).toContain('data-k="haptics"');
  });
});
