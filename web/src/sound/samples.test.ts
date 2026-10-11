/* Loading the recorded takes: what could be fetched goes to the mixer, what could not is left out. */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { loadSamples } from './samples';
import { Sound } from './sound';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Stand in for fetch: `answer` decides what each request, in order, comes back with. */
function serve(answer: (request: number, url: string) => Response | Error): string[] {
  const asked: string[] = [];
  vi.stubGlobal('fetch', (url: string) => {
    asked.push(url);
    const result = answer(asked.length - 1, url);
    return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
  });
  return asked;
}
const audio = (byte: number): Response => new Response(new Uint8Array([byte]));

describe('loadSamples', () => {
  it('fetches every take from this origin and hands each sound its own, in order', async () => {
    const given = vi.spyOn(Sound, 'samples').mockImplementation(() => {});
    // Each file answers with the letter in its name, so the order handed over can be read back.
    const asked = serve((_k, url) => audio(/-([a-d])[^/]*$/.exec(url)?.[1]?.charCodeAt(0) ?? 0));
    await loadSamples();
    expect(asked).toHaveLength(7);
    expect(new Set(asked).size).toBe(7);
    for (const url of asked) expect(url).toMatch(/^(\/|data:audio\/)[^:]*(card-play-[a-d]|tap-[a-c])/);
    const letters = (name: string): string | undefined =>
      given.mock.calls
        .find((call) => call[0] === name)?.[1]
        .map((f) => String.fromCharCode(new Uint8Array(f)[0] ?? 0))
        .join('');
    expect(given).toHaveBeenCalledTimes(2);
    expect(letters('tap')).toBe('abc');
    expect(letters('cardPlay')).toBe('abcd');
  });

  it('leaves out a take that is missing or cannot be reached', async () => {
    const given = vi.spyOn(Sound, 'samples').mockImplementation(() => {});
    serve((_k, url) =>
      url.includes('card-play-b')
        ? new Response('gone', { status: 404 })
        : url.includes('card-play-c')
          ? new TypeError('offline')
          : audio(1),
    );
    await loadSamples();
    const files = (name: string): ArrayBuffer[] | undefined => given.mock.calls.find((call) => call[0] === name)?.[1];
    expect(files('cardPlay')).toHaveLength(2);
    expect(files('tap')).toHaveLength(3);
  });

  it('hands over no takes when nothing can be fetched, so the recipes stay', async () => {
    const given = vi.spyOn(Sound, 'samples').mockImplementation(() => {});
    serve(() => new TypeError('offline'));
    await expect(loadSamples()).resolves.toBeUndefined();
    expect(given).toHaveBeenCalledWith('cardPlay', []);
    expect(given).toHaveBeenCalledWith('tap', []);
  });
});
