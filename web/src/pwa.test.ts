import { describe, expect, it, vi } from 'vite-plus/test';
import { registerWorker } from './pwa';

const now = (then: () => void): void => then();

describe('registering the service worker', () => {
  it('registers /sw.js for a built page, once the page has loaded', () => {
    const register = vi.fn<(url: string) => Promise<unknown>>().mockResolvedValue(undefined);
    let loaded: (() => void) | null = null;
    registerWorker(true, { register }, (then) => {
      loaded = then;
    });
    expect(register).not.toHaveBeenCalled();
    (loaded as (() => void) | null)?.();
    expect(register).toHaveBeenCalledExactlyOnceWith('/sw.js');
  });

  it('does not register in development', () => {
    const register = vi.fn<(url: string) => Promise<unknown>>().mockResolvedValue(undefined);
    registerWorker(false, { register }, now);
    expect(register).not.toHaveBeenCalled();
  });

  it('plays on where there are no service workers, and where one is refused', async () => {
    expect(() => registerWorker(true, undefined, now)).not.toThrow();
    const register = vi.fn<(url: string) => Promise<unknown>>().mockRejectedValue(new Error('insecure'));
    expect(() => registerWorker(true, { register }, now)).not.toThrow();
    await Promise.resolve();
    expect(register).toHaveBeenCalledTimes(1);
  });
});
