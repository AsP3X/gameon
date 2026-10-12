/* Recorded takes in the mixer: a sound that has them plays one of them, varied, and a sound that has
   none (yet, or because they could not be read) plays its synthesised recipe. The recipes themselves
   are held against the legacy build in tableview/parity/sound.test.ts.
   And the menu music: recorded tunes, one of which goes round while it is wanted and sound is on. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

/** What the mixer built, in order: just enough of Web Audio to see which voices a sound used. */
interface FakeNode {
  kind: string;
  buffer: unknown;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  playbackRate: { value: number };
  /** `target` is where the last setTargetAtTime sends the value. */
  gain: { value: number; target: number | null };
  startedAt: number | null;
  /** Where in its buffer the source started. */
  offset: number | null;
  stoppedAt: number | null;
}
let made: FakeNode[] = [];
/** What decodeAudioData does with a file; a test swaps it to make decoding fail. */
let decodeFile: (file: ArrayBuffer) => Promise<unknown>;

const param = () => {
  const self = {
    value: 0,
    target: null as number | null,
    setValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
    setTargetAtTime: (target: number) => {
      self.target = target;
    },
  };
  return self;
};
function node(kind: string) {
  const self = {
    kind,
    buffer: null as unknown,
    type: '',
    loop: false,
    loopStart: 0,
    loopEnd: 0,
    gain: param(),
    frequency: param(),
    detune: param(),
    Q: param(),
    playbackRate: param(),
    threshold: param(),
    knee: param(),
    ratio: param(),
    attack: param(),
    release: param(),
    startedAt: null as number | null,
    offset: null as number | null,
    stoppedAt: null as number | null,
    connect: <T>(to: T): T => to,
    start: (at: number, offset?: number) => {
      self.startedAt = at;
      self.offset = offset ?? null;
    },
    stop: (at?: number) => {
      self.stoppedAt = at ?? 0;
    },
  };
  made.push(self);
  return self;
}
class FakeAudioContext {
  currentTime = 5;
  sampleRate = 200;
  state = 'running';
  destination = {};
  createGain = () => node('gain');
  createOscillator = () => node('oscillator');
  createBiquadFilter = () => node('filter');
  createBufferSource = () => node('source');
  createConvolver = () => node('convolver');
  createDynamicsCompressor = () => node('limiter');
  createBuffer = (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) });
  decodeAudioData = (file: ArrayBuffer) => decodeFile(file);
  onstatechange: (() => void) | null = null;
  resume = (): Promise<void> => Promise.resolve();
}

/** Four files, each one byte long so the decoded take can say which file it came from. */
const files = (): ArrayBuffer[] => [0, 1, 2, 3].map((k) => new Uint8Array([k]).buffer);
const takeOf = (file: ArrayBuffer): string => `take ${new Uint8Array(file)[0]}`;

/** A fresh mixer: it keeps its audio graph and its takes in the module. */
async function mixer() {
  vi.resetModules();
  const { Sound } = await import('./sound');
  return Sound;
}
/** Play the card sound once and return the voices it used. Each call is 50 ms on, past the 30 ms merge. */
function playCard(Sound: Awaited<ReturnType<typeof mixer>>): FakeNode[] {
  vi.advanceTimersByTime(50);
  const before = made.length;
  Sound.play('cardPlay', 2);
  return made.slice(before);
}
const sources = (voices: FakeNode[]): FakeNode[] => voices.filter((v) => v.kind === 'source');
const synthesised = (voices: FakeNode[]): boolean => voices.some((v) => v.kind === 'oscillator');
/** Let the decoding promises settle. */
const settle = (): Promise<void> => vi.advanceTimersByTimeAsync(0).then(() => {});

beforeEach(() => {
  made = [];
  decodeFile = (file) => Promise.resolve(takeOf(file));
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  vi.stubGlobal('AudioContext', FakeAudioContext);
  // A fixed stream of "random" numbers, so the takes drawn are the same on every run.
  let seed = 11;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('recorded takes', () => {
  it('plays the recipe while the sound has no takes', async () => {
    const Sound = await mixer();
    const voices = playCard(Sound);
    expect(synthesised(voices)).toBe(true);
    // The recipe's own noise voices are buffer sources too, but none of them plays a take.
    expect(sources(voices).every((v) => typeof v.buffer !== 'string')).toBe(true);
  });

  it('plays the recipe until the takes handed in before the first sound are decoded', async () => {
    const Sound = await mixer();
    Sound.samples('cardPlay', files());
    expect(made).toEqual([]); // no audio graph before the first sound: browsers want a gesture first
    expect(synthesised(playCard(Sound))).toBe(true);
    await settle();
    const voices = playCard(Sound);
    expect(synthesised(voices)).toBe(false);
    expect(sources(voices).map((v) => v.buffer)).toEqual([expect.stringMatching(/^take [0-3]$/)]);
  });

  it('decodes ahead of the first tap where the browser can, so the first sound is already a take', async () => {
    let offline = 0;
    vi.stubGlobal(
      'OfflineAudioContext',
      class {
        constructor() {
          offline++;
        }
        decodeAudioData = (file: ArrayBuffer) => decodeFile(file);
      },
    );
    const Sound = await mixer();
    Sound.samples('cardPlay', files());
    await settle();
    expect(offline).toBe(1);
    expect(made).toEqual([]); // still no audio graph: that waits for the first sound
    const voices = playCard(Sound);
    expect(synthesised(voices)).toBe(false);
    expect(sources(voices).map((v) => v.buffer)).toEqual([expect.stringMatching(/^take [0-3]$/)]);
  });

  it('waits for the audio graph where an offline context cannot be made', async () => {
    vi.stubGlobal(
      'OfflineAudioContext',
      class {
        constructor() {
          throw new Error('not here');
        }
      },
    );
    const Sound = await mixer();
    Sound.samples('cardPlay', files());
    await settle();
    expect(synthesised(playCard(Sound))).toBe(true);
    await settle();
    expect(synthesised(playCard(Sound))).toBe(false);
  });

  it('decodes takes that arrive after audio is unlocked', async () => {
    const Sound = await mixer();
    Sound.unlock();
    Sound.samples('cardPlay', files());
    await settle();
    expect(synthesised(playCard(Sound))).toBe(false);
  });

  it('never plays the same take twice in a row, uses all of them, and drifts the speed a little', async () => {
    const Sound = await mixer();
    Sound.samples('cardPlay', files());
    Sound.unlock();
    await settle();
    const played: FakeNode[] = [];
    for (let k = 0; k < 60; k++) {
      const voices = playCard(Sound);
      expect(synthesised(voices)).toBe(false);
      expect(sources(voices)).toHaveLength(1);
      played.push(...sources(voices));
    }
    const drawn = played.map((v) => v.buffer);
    expect(drawn.filter((take, k) => take === drawn[k - 1])).toEqual([]);
    expect(new Set(drawn)).toEqual(new Set(['take 0', 'take 1', 'take 2', 'take 3']));
    const rates = played.map((v) => v.playbackRate.value);
    expect(Math.min(...rates)).toBeGreaterThanOrEqual(0.94);
    expect(Math.max(...rates)).toBeLessThanOrEqual(1.06);
    expect(new Set(rates).size).toBeGreaterThan(50);
    expect(played.every((v) => v.startedAt === 5.01)).toBe(true);
  });

  it('leaves out a take that cannot be decoded', async () => {
    decodeFile = (file) =>
      new Uint8Array(file)[0] === 2 ? Promise.resolve(takeOf(file)) : Promise.reject(new Error('not audio'));
    const Sound = await mixer();
    Sound.samples('cardPlay', files());
    Sound.unlock();
    await settle();
    for (let k = 0; k < 5; k++) expect(sources(playCard(Sound)).map((v) => v.buffer)).toEqual(['take 2']);
  });

  it('keeps the recipe when no take can be decoded', async () => {
    decodeFile = () => {
      throw new TypeError('decodeAudioData wants callbacks here');
    };
    const Sound = await mixer();
    Sound.samples('cardPlay', files());
    Sound.unlock();
    await settle();
    expect(synthesised(playCard(Sound))).toBe(true);

    decodeFile = () => Promise.reject(new Error('not audio'));
    Sound.samples('cardPlay', files());
    await settle();
    expect(synthesised(playCard(Sound))).toBe(true);

    Sound.samples('cardPlay', []);
    await settle();
    expect(synthesised(playCard(Sound))).toBe(true);
  });

  it('gives each sound its own takes and its own place in the mix', async () => {
    const Sound = await mixer();
    Sound.samples('cardPlay', files());
    Sound.samples('tap', [new Uint8Array([7]).buffer]);
    Sound.unlock();
    await settle();
    const voicesOf = (name: 'tap' | 'cardPlay' | 'select'): FakeNode[] => {
      vi.advanceTimersByTime(50);
      const before = made.length;
      Sound.play(name);
      return made.slice(before);
    };
    const tap = voicesOf('tap');
    expect(sources(tap).map((v) => v.buffer)).toEqual(['take 7']);
    expect(synthesised(tap)).toBe(false);
    // [the sound's bus, the take's own gain, its send to the room]: the tap sits lower than the card.
    expect(tap.filter((v) => v.kind === 'gain').map((v) => v.gain.value)).toEqual([2.4, 0.32, 0.05]);
    expect(
      voicesOf('cardPlay')
        .filter((v) => v.kind === 'gain')
        .map((v) => v.gain.value),
    ).toEqual([1, 1, 0.08]);
    for (let k = 0; k < 20; k++) {
      const rate = sources(voicesOf('tap'))[0]?.playbackRate.value ?? 0;
      expect(Math.abs(rate - 1)).toBeLessThanOrEqual(0.04);
    }
    // A sound without takes is not touched by the takes of others.
    expect(synthesised(voicesOf('select'))).toBe(true);
  });

  it('plays nothing when sound is off', async () => {
    const Sound = await mixer();
    Sound.samples('cardPlay', files());
    Sound.unlock();
    await settle();
    Sound.use({ muted: true, volume: 0.8, ambience: false, haptics: true });
    expect(playCard(Sound)).toEqual([]);
  });
});

describe('menu music', () => {
  const LOOP = { starts: 0.5, repeats: 60 };
  const file = (): ArrayBuffer => new Uint8Array([9]).buffer;
  /** The sources that play the tune, in the order they were started. */
  const tunes = (): FakeNode[] => made.filter((v) => v.kind === 'source' && v.buffer === 'take 9');
  /** Three tunes, each with a loop of its own length, and which of them the mixer started, in order. */
  const three = () =>
    [7, 8, 9].map((k) => ({ file: new Uint8Array([k]).buffer, loop: { starts: 0.5, repeats: k * 10 } }));
  const started = (): unknown[] => made.filter((v) => v.kind === 'source').map((v) => v.buffer);
  /** Leave the menu and come back to it. */
  async function again(Sound: Awaited<ReturnType<typeof mixer>>): Promise<void> {
    Sound.music(false);
    Sound.music(true);
    await settle();
  }
  /** The gain the tune was last sent to. Its own gain node is the one made right after its source. */
  const sentTo = (tune: FakeNode | undefined): number | null | undefined =>
    tune && made[made.indexOf(tune) + 1]?.gain.target;

  it('does not start the tune while the context is suspended, and does on the next try', async () => {
    const held: { resume: (() => void) | null } = { resume: null };
    class Held extends FakeAudioContext {
      override state = 'suspended';
      resume = (): Promise<void> =>
        new Promise((done) => {
          held.resume = () => {
            this.state = 'running';
            done();
          };
        });
    }
    vi.stubGlobal('AudioContext', Held);
    const Sound = await mixer();
    Sound.tunes([{ file: file(), loop: LOOP }]);
    Sound.music(true);
    await settle();
    expect(Sound.unlock()).toBe(false);
    expect(tunes()).toEqual([]);
    const resume = held.resume;
    if (!resume) throw new Error('the context was not asked to resume');
    resume();
    await settle();
    expect(tunes()).toHaveLength(1);
    expect(Sound.unlock()).toBe(true);
  });

  it('resumes on every tap, and starts the tune again after the context suspends', async () => {
    let resumes = 0;
    class Watching extends FakeAudioContext {
      static current: Watching | null = null;
      constructor() {
        super();
        Watching.current = this;
      }
      override resume = (): Promise<void> => {
        resumes += 1;
        return Promise.resolve();
      };
    }
    vi.stubGlobal('AudioContext', Watching);
    const Sound = await mixer();
    Sound.tunes([{ file: file(), loop: LOOP }]);
    Sound.music(true);
    await settle();
    Sound.unlock();
    await settle();
    Sound.unlock();
    expect(resumes).toBe(2);
    expect(tunes()).toHaveLength(1);
    const audio = Watching.current;
    if (!audio?.onstatechange) throw new Error('the context has no state handler');
    audio.state = 'suspended';
    audio.onstatechange();
    audio.state = 'running';
    audio.onstatechange();
    await settle();
    expect(tunes()).toHaveLength(2);
  });

  it('waits for the first tap, then plays the tune round its loop, fading in', async () => {
    const Sound = await mixer();
    Sound.tunes([{ file: file(), loop: LOOP }]);
    Sound.music(true);
    await settle();
    expect(made).toEqual([]); // no audio graph before the first tap
    Sound.unlock();
    await settle();
    const [tune, ...more] = tunes();
    expect(more).toEqual([]);
    expect(tune).toMatchObject({ loop: true, loopStart: 0.25, loopEnd: 60.25, startedAt: 5, offset: 0.5 });
    expect(sentTo(tune)).toBe(0.3);
    expect(tune?.stoppedAt).toBeNull();
  });

  it('decodes the tune only once it is wanted, and ahead of the first tap where the browser can', async () => {
    let decoded = 0;
    vi.stubGlobal(
      'OfflineAudioContext',
      class {
        decodeAudioData = (f: ArrayBuffer) => {
          decoded++;
          return decodeFile(f);
        };
      },
    );
    const Sound = await mixer();
    Sound.tunes([{ file: file(), loop: LOOP }]);
    await settle();
    expect(decoded).toBe(0);
    Sound.music(true);
    Sound.music(true);
    await settle();
    expect(decoded).toBe(1);
    Sound.unlock();
    expect(tunes()).toHaveLength(1); // decoded already: it starts with the tap
  });

  it('starts when the tune arrives after it was asked for', async () => {
    const Sound = await mixer();
    Sound.unlock();
    Sound.music(true);
    expect(tunes()).toEqual([]);
    Sound.tunes([{ file: file(), loop: LOOP }]);
    await settle();
    expect(tunes()).toHaveLength(1);
  });

  it('plays the tune once however often it is asked for, and fades it out when it is no longer wanted', async () => {
    const Sound = await mixer();
    Sound.tunes([{ file: file(), loop: LOOP }]);
    Sound.unlock();
    Sound.music(true);
    await settle();
    Sound.music(true);
    Sound.setLevel();
    expect(tunes()).toHaveLength(1);
    Sound.music(false);
    expect(sentTo(tunes()[0])).toBe(0);
    expect(tunes()[0]?.stoppedAt).toBe(6);
    Sound.music(false);
    Sound.music(true); // back on the menu: from the top
    expect(tunes()).toHaveLength(2);
    expect(tunes()[1]).toMatchObject({ offset: 0.5, stoppedAt: null });
  });

  it('is silent while sound is off and comes back when it is turned on', async () => {
    const prefs = { muted: true, volume: 0.8, ambience: false, haptics: true };
    const Sound = await mixer();
    Sound.use(prefs);
    Sound.tunes([{ file: file(), loop: LOOP }]);
    Sound.unlock();
    Sound.music(true);
    await settle();
    expect(tunes()).toEqual([]);
    prefs.muted = false;
    Sound.setLevel();
    await settle();
    expect(tunes()).toHaveLength(1);
    prefs.muted = true;
    Sound.setLevel();
    expect(tunes()[0]?.stoppedAt).toBe(6);
  });

  it('stops when the table leaves the page, without building an audio graph for it', async () => {
    const Sound = await mixer();
    Sound.tunes([{ file: file(), loop: LOOP }]);
    Sound.music(true);
    Sound.hush();
    expect(made).toEqual([]);
    Sound.unlock();
    await settle();
    expect(tunes()).toEqual([]); // no longer wanted
    Sound.music(true);
    await settle();
    Sound.hush();
    expect(tunes().map((v) => v.stoppedAt)).toEqual([6]);
  });

  it('draws the first tune at random and then gives each its turn', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const Sound = await mixer();
    Sound.tunes(three());
    Sound.unlock();
    Sound.music(true);
    await settle();
    expect(started()).toEqual(['take 8']);
    for (let k = 0; k < 4; k++) await again(Sound);
    expect(started()).toEqual(['take 8', 'take 9', 'take 7', 'take 8', 'take 9']);
    // Each plays round its own loop, and only the last one started is still playing.
    const sources = made.filter((v) => v.kind === 'source');
    expect(sources.map((v) => v.loopEnd)).toEqual([80.25, 90.25, 70.25, 80.25, 90.25]);
    expect(sources.map((v) => v.stoppedAt)).toEqual([6, 6, 6, 6, null]);
  });

  it('can start with any of the tunes', async () => {
    for (const [drawn, first] of [
      [0, 'take 7'],
      [0.34, 'take 8'],
      [0.999, 'take 9'],
    ] as const) {
      made = [];
      vi.spyOn(Math, 'random').mockReturnValue(drawn);
      const Sound = await mixer();
      Sound.tunes(three());
      Sound.unlock();
      Sound.music(true);
      await settle();
      expect(started()).toEqual([first]);
    }
  });

  it('decodes each tune when its turn comes, and again the next time round', async () => {
    const decoded: string[] = [];
    const real = decodeFile;
    decodeFile = (f) => {
      decoded.push(takeOf(f));
      return real(f);
    };
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const Sound = await mixer();
    Sound.tunes(three());
    Sound.unlock();
    Sound.music(true);
    await settle();
    expect(decoded).toEqual(['take 7']);
    for (let k = 0; k < 3; k++) await again(Sound);
    // The file is still whole after it was decoded: decoding was given a copy.
    expect(decoded).toEqual(['take 7', 'take 8', 'take 9', 'take 7']);
    expect(started()).toEqual(['take 7', 'take 8', 'take 9', 'take 7']);
  });

  it('does not move on when the music is asked for and dropped before it could start', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const Sound = await mixer();
    Sound.tunes(three());
    Sound.music(true); // no tap yet: the first tune is decoded and waits
    await settle();
    Sound.music(false);
    Sound.music(true);
    Sound.unlock();
    await settle();
    expect(started()).toEqual(['take 7']);
  });

  it('leaves out a tune that cannot be decoded and plays the others in turn', async () => {
    decodeFile = (f) => (takeOf(f) === 'take 8' ? Promise.reject(new Error('not audio')) : Promise.resolve(takeOf(f)));
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // the broken one is drawn first
    const Sound = await mixer();
    Sound.tunes(three());
    Sound.unlock();
    Sound.music(true);
    await settle();
    expect(started()).toEqual(['take 9']);
    for (let k = 0; k < 3; k++) await again(Sound);
    expect(started()).toEqual(['take 9', 'take 7', 'take 9', 'take 7']);
  });

  it('leaves the menu quiet when the tune cannot be decoded', async () => {
    decodeFile = () => Promise.reject(new Error('not audio'));
    const Sound = await mixer();
    Sound.tunes([{ file: file(), loop: LOOP }]);
    Sound.unlock();
    Sound.music(true);
    await settle();
    expect(made.filter((v) => v.kind === 'source')).toEqual([]);
    decodeFile = () => {
      throw new TypeError('decodeAudioData wants callbacks here');
    };
    Sound.tunes([{ file: file(), loop: LOOP }]);
    await settle();
    expect(made.filter((v) => v.kind === 'source')).toEqual([]);
  });
});
