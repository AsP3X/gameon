/* Loading the menu music: the fetched files go to the mixer, each with the place of its loop, and a
   file that cannot be had is left out. */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { loadMusic, TUNES } from './music';
import { Sound } from './sound';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** The bytes a tune's address answers with: its place in TUNES, so a test can tell the files apart. */
const serve = (url: string): Response => new Response(new Uint8Array([TUNES.findIndex((tune) => tune.url === url)]));
/** What the mixer was handed: for each tune its file's bytes and its loop. */
const handed = (given: { mock: { calls: Parameters<typeof Sound.tunes>[] } }) =>
  given.mock.calls.map(([tunes]) => tunes.map(({ file, loop }) => [Array.from(new Uint8Array(file)), loop]));

describe('loadMusic', () => {
  it('fetches the tunes from this origin and hands them over together, each with its loop', async () => {
    const given = vi.spyOn(Sound, 'tunes').mockImplementation(() => {});
    const asked: string[] = [];
    vi.stubGlobal('fetch', (url: string) => {
      asked.push(url);
      return Promise.resolve(serve(url));
    });
    await loadMusic();
    expect(asked).toHaveLength(2);
    expect(new Set(asked).size).toBe(2);
    for (const url of asked) expect(url).toMatch(/^\/[^:]*tavern[^/]*\.mp3$/);
    expect(handed(given)).toEqual([TUNES.map((tune, k) => [[k], tune.loop])]);
  });

  it('hands over the tunes that came when one is missing or cannot be reached', async () => {
    const given = vi.spyOn(Sound, 'tunes').mockImplementation(() => {});
    const [first, second] = TUNES;
    vi.stubGlobal('fetch', (url: string) =>
      Promise.resolve(url === first?.url ? new Response('gone', { status: 404 }) : serve(url)),
    );
    await loadMusic();
    vi.stubGlobal('fetch', (url: string) =>
      url === second?.url ? Promise.reject(new TypeError('offline')) : Promise.resolve(serve(url)),
    );
    await loadMusic();
    expect(handed(given)).toEqual([[[[1], second?.loop]], [[[0], first?.loop]]]);
  });

  it('hands over nothing when no tune is to be had', async () => {
    const given = vi.spyOn(Sound, 'tunes').mockImplementation(() => {});
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('gone', { status: 404 })));
    await expect(loadMusic()).resolves.toBeUndefined();
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));
    await expect(loadMusic()).resolves.toBeUndefined();
    expect(given).not.toHaveBeenCalled();
  });
});

describe('the tune files', () => {
  /** The length of an MPEG-1 Layer III file, read from its frame headers. */
  function seconds(bytes: Uint8Array): number {
    const RATES = [44100, 48000, 32000],
      KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
    let at = 0,
      total = 0;
    while (at + 4 <= bytes.length) {
      const [sync, b1, b2] = [bytes[at], bytes[at + 1], bytes[at + 2]];
      const rate = RATES[(b2 >> 2) & 3],
        kbps = KBPS[b2 >> 4];
      if (sync !== 0xff || (b1 & 0xfe) !== 0xfa || !rate || !kbps)
        throw new Error(`No MPEG-1 Layer III frame at byte ${at}`);
      total += 1152 / rate;
      at += Math.floor((144000 * kbps) / rate) + ((b2 >> 1) & 1);
    }
    return total;
  }

  it.each(TUNES)(
    '$url holds the loop the mixer is told about, with the lead-in on either side of it',
    ({ url, loop }) => {
      const length = seconds(readFileSync(new URL(`./music/${url.slice(url.lastIndexOf('/') + 1)}`, import.meta.url)));
      // The encoder adds a frame or two of its own; the file must not be shorter than lead-in, loop, lead-in.
      expect(length).toBeGreaterThanOrEqual(loop.repeats + 2 * loop.starts);
      expect(length).toBeLessThan(loop.repeats + 2 * loop.starts + 0.1);
    },
  );
});
