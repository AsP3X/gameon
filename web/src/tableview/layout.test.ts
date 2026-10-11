// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { layout, tapWord } from './layout';

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
