/* Loading the menu music: the fetched file goes to the mixer with the place of its loop, and a file
   that cannot be had leaves the mixer without one. */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { loadMusic, TAVERN_LOOP } from './music';
import { Sound } from './sound';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('loadMusic', () => {
  it('fetches the tune from this origin and hands it over with its loop', async () => {
    const given = vi.spyOn(Sound, 'tune').mockImplementation(() => {});
    const asked: string[] = [];
    vi.stubGlobal('fetch', (url: string) => {
      asked.push(url);
      return Promise.resolve(new Response(new Uint8Array([4, 2])));
    });
    await loadMusic();
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatch(/^\/[^:]*tavern[^/]*\.mp3$/);
    expect(given).toHaveBeenCalledTimes(1);
    expect(Array.from(new Uint8Array(given.mock.calls[0]?.[0] ?? new ArrayBuffer(0)))).toEqual([4, 2]);
    expect(given.mock.calls[0]?.[1]).toBe(TAVERN_LOOP);
  });

  it('hands over nothing when the tune is missing or cannot be reached', async () => {
    const given = vi.spyOn(Sound, 'tune').mockImplementation(() => {});
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('gone', { status: 404 })));
    await expect(loadMusic()).resolves.toBeUndefined();
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));
    await expect(loadMusic()).resolves.toBeUndefined();
    expect(given).not.toHaveBeenCalled();
  });
});

describe('tavern.mp3', () => {
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

  it('holds the loop the mixer is told about, with the lead-in on either side of it', () => {
    const length = seconds(readFileSync(new URL('./music/tavern.mp3', import.meta.url)));
    // The encoder adds a frame or two of its own; the file must not be shorter than lead-in, loop, lead-in.
    expect(length).toBeGreaterThanOrEqual(TAVERN_LOOP.repeats + 2 * TAVERN_LOOP.starts);
    expect(length).toBeLessThan(TAVERN_LOOP.repeats + 2 * TAVERN_LOOP.starts + 0.1);
  });
});
