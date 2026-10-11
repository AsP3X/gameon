/* The recorded takes of the sounds that have them. The files are bundled with the app and fetched
   from its own origin. The mixer plays a sound's synthesised recipe until its takes are in, and for
   good if they never arrive.

   The takes in samples/ are 16-bit mono WAV: every browser decodes it, and it starts on the first
   sample (MP3 and AAC put silence in front). How they were made is in the web README. */
import cardPlayA from './samples/card-play-a.wav';
import cardPlayB from './samples/card-play-b.wav';
import cardPlayC from './samples/card-play-c.wav';
import cardPlayD from './samples/card-play-d.wav';
import { Sound } from './sound';
import type { SampledSound } from './sound';

const FILES: Record<SampledSound, string[]> = {
  cardPlay: [cardPlayA, cardPlayB, cardPlayC, cardPlayD],
};

async function fetchTake(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    // Offline, or the request was blocked: the sound has one take fewer.
    return null;
  }
}

/** Fetch every recorded take and hand it to the mixer. A take that cannot be fetched is left out. */
export async function loadSamples(): Promise<void> {
  await Promise.all(
    (Object.keys(FILES) as SampledSound[]).map(async (name) => {
      const files = await Promise.all(FILES[name].map(fetchTake));
      Sound.samples(
        name,
        files.filter((file) => file != null),
      );
    }),
  );
}
