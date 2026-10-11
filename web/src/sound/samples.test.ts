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
  it('fetches the four card takes from this origin and hands them to the mixer', async () => {
    const given = vi.spyOn(Sound, 'samples').mockImplementation(() => {});
    const asked = serve((k) => audio(k));
    await loadSamples();
    expect(asked).toHaveLength(4);
    expect(new Set(asked).size).toBe(4);
    for (const url of asked) expect(url).toMatch(/^(\/|data:audio\/)[^:]*card-play-[a-d]/);
    expect(given).toHaveBeenCalledTimes(1);
    const [name, files] = given.mock.calls[0] ?? [];
    expect(name).toBe('cardPlay');
    expect(files?.map((file) => new Uint8Array(file)[0])).toEqual([0, 1, 2, 3]);
  });

  it('leaves out a take that is missing or cannot be reached', async () => {
    const given = vi.spyOn(Sound, 'samples').mockImplementation(() => {});
    serve((k) => (k === 1 ? new Response('gone', { status: 404 }) : k === 2 ? new TypeError('offline') : audio(k)));
    await loadSamples();
    const [, files] = given.mock.calls[0] ?? [];
    expect(files?.map((file) => new Uint8Array(file)[0])).toEqual([0, 3]);
  });

  it('hands over no takes when nothing can be fetched, so the recipe stays', async () => {
    const given = vi.spyOn(Sound, 'samples').mockImplementation(() => {});
    serve(() => new TypeError('offline'));
    await expect(loadSamples()).resolves.toBeUndefined();
    expect(given).toHaveBeenCalledWith('cardPlay', []);
  });
});
