/* The menu music: one tune, bundled with the app and fetched from its own origin. The mixer plays
   it under the home screen (Sound.music). If it cannot be fetched or decoded, the menu is quiet.

   The file is an MP3: a minute and a quarter of stereo is too large as WAV. How it was made, and why
   its loop survives the silence MP3 puts in front, is in the web README. */
import tavern from './music/tavern.mp3';
import { Sound } from './sound';
import type { TuneLoop } from './sound';

/** Where the tune sits in tavern.mp3: after half a second of lead-in, 64 bars at 100 beats a minute. */
export const TAVERN_LOOP: TuneLoop = { starts: 0.5, repeats: 76.808 };

/** Fetch the menu tune and hand it to the mixer. */
export async function loadMusic(): Promise<void> {
  try {
    const res = await fetch(tavern);
    if (res.ok) Sound.tune(await res.arrayBuffer(), TAVERN_LOOP);
  } catch {
    // Offline, or the request was blocked: no music.
  }
}
