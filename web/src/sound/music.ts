/* The menu music: the tunes, bundled with the app and fetched from its own origin. The mixer plays
   one of them under the home screen (Sound.music): a random one first, then they take turns. A tune
   that cannot be fetched or decoded is left out; with none, the menu is quiet.

   The files are MP3s: a minute and a quarter of stereo is too large as WAV. How they were made, and
   why their loops survive the silence MP3 puts in front, is in the web README. */
import tavernB from './music/tavern-b.mp3';
import tavern from './music/tavern.mp3';
import { Sound } from './sound';
import type { Tune, TuneLoop } from './sound';

/**
 * The tunes, and where each sits in its file: after half a second of lead-in, 64 bars at 100 beats
 * a minute. The two takes do not keep quite the same time.
 */
export const TUNES: readonly { url: string; loop: TuneLoop }[] = [
  { url: tavern, loop: { starts: 0.5, repeats: 76.808 } },
  { url: tavernB, loop: { starts: 0.5, repeats: 76.8 } },
];

/** Fetch one tune. Offline, blocked or missing, it is left out. */
async function fetched(url: string, loop: TuneLoop): Promise<Tune | null> {
  try {
    const res = await fetch(url);
    return res.ok ? { file: await res.arrayBuffer(), loop } : null;
  } catch {
    return null;
  }
}

/** Fetch the menu tunes and hand the mixer the ones that came, all at once so its first draw is among all of them. */
export async function loadMusic(): Promise<void> {
  const tunes = (await Promise.all(TUNES.map(({ url, loop }) => fetched(url, loop)))).filter((tune) => tune !== null);
  if (tunes.length) Sound.tunes(tunes);
}
