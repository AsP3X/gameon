/* Sound: the table's effects and the sea ambience.
   Ported from the legacy build (legacy/Skull King Tavern.html, section 7). The synthesiser is that
   port, unchanged. Recorded takes are an addition the legacy build does not have.

   Every sound is synthesised with Web Audio: no files to load, nothing blocked by the page sandbox.
   A sound that was given recorded takes (Sound.samples) plays one of those instead, and keeps its
   recipe for as long as it has none. The menu music (Sound.tune, Sound.music) is a recording too:
   the one sound that has no recipe, so without its file the menu is quiet.
   Graph: voices -> master gain -> soft limiter -> speakers, with a small send to a room reverb.
   Sounds are named recipes; call Sound.play(name, arg). */

/** The settings the mixer reads on every call. The table points this at its saved preferences. */
export interface SoundPrefs {
  muted: boolean;
  /** 0 to 1. `null` plays at the default of 0.8. */
  volume: number | null;
  ambience: boolean;
  haptics: boolean;
}

/** The audio graph, built on the first sound: browsers only allow it after a user gesture. */
interface Rig {
  ctx: AudioContext;
  master: GainNode;
  wet: GainNode;
  noiseBuf: AudioBuffer;
}

interface Ambience {
  s: AudioBufferSourceNode;
  swell: OscillatorNode;
  g: GainNode;
}

/** Where the menu tune sits in its file, in seconds: it begins at `starts` and comes round again every `repeats`. */
export interface TuneLoop {
  starts: number;
  repeats: number;
}

interface Music {
  s: AudioBufferSourceNode;
  g: GainNode;
}

let prefs: SoundPrefs = { muted: false, volume: 0.8, ambience: false, haptics: true };
let rig: Rig | null = null;
let amb: Ambience | null = null;
let bus: GainNode | null = null;
const last: Partial<Record<SoundName, number>> = {};
/** Recorded takes that were handed in but could not be decoded yet, still encoded (see decoder). */
const waiting: Partial<Record<SoundName, ArrayBuffer[]>> = {};
/** The decoded takes of a sound, and which one it played last. */
const takes: Partial<Record<SoundName, AudioBuffer[]>> = {};
const lastTake: Partial<Record<SoundName, number>> = {};
/** The menu tune as it was handed in, still encoded: it is decoded when the music is first wanted. */
let tuneFile: ArrayBuffer | null = null;
let tune: AudioBuffer | null = null;
let tuneLoop: TuneLoop = { starts: 0, repeats: 0 };
/** Whether the page asks for the menu music, and the music that plays. */
let musicWanted = false;
let mus: Music | null = null;
const level = (): number => (prefs.muted ? 0 : Math.pow(prefs.volume == null ? 0.8 : prefs.volume, 1.6));

function boot(): Rig | null {
  if (rig) return rig;
  // A browser without Web Audio stays silent. The legacy build also tried the prefixed
  // webkitAudioContext of Safari before 14.1; that constructor is retired and is not used here.
  if (typeof AudioContext === 'undefined') return null;
  const AC = AudioContext;
  try {
    const ctx = new AC();
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -12;
    lim.knee.value = 8;
    lim.ratio.value = 6;
    lim.attack.value = 0.002;
    lim.release.value = 0.18;
    const master = ctx.createGain();
    master.gain.value = level();
    master.connect(lim).connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 1.2),
      ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    const room = ctx.createConvolver();
    room.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    wet.connect(room).connect(master);
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const n = noiseBuf.getChannelData(0);
    for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
    rig = { ctx, master, wet, noiseBuf };
  } catch {
    rig = null;
  }
  if (rig) for (const name of Object.keys(waiting) as SoundName[]) decode(rig.ctx, name);
  return rig;
}

/**
 * What can decode a take right now. Before the first tap the page may not start audio, but an
 * offline context may decode: so the takes are ready when the first sound is asked for. A browser
 * without one decodes when the audio graph is built.
 */
function decoder(): BaseAudioContext | null {
  if (rig) return rig.ctx;
  if (typeof OfflineAudioContext === 'undefined') return null;
  try {
    return new OfflineAudioContext(1, 1, 44100);
  } catch {
    return null;
  }
}

/** Decode the takes that are waiting for this sound. One that cannot be decoded is left out. */
function decode(ctx: BaseAudioContext, name: SoundName): void {
  const files = waiting[name];
  if (!files) return;
  delete waiting[name];
  const ready: AudioBuffer[] = [];
  takes[name] = ready;
  for (const file of files) {
    try {
      void ctx.decodeAudioData(file).then(
        (buffer) => {
          ready.push(buffer);
        },
        () => {
          // Not audio this browser can read: the sound has one take fewer.
        },
      );
    } catch {
      // The same, for a browser whose decodeAudioData does not return a promise.
    }
  }
}

/* --- voices --- */
function shape(g: GainNode, t: number, a: number, peak: number, d: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function send(r: Rig, node: AudioNode, amt: number): void {
  if (!amt) return;
  const g = r.ctx.createGain();
  g.gain.value = amt;
  node.connect(g);
  g.connect(r.wet);
}

interface ToneOptions {
  f: number;
  to?: number;
  type?: OscillatorType;
  a?: number;
  d?: number;
  v?: number;
  room?: number;
  detune?: number;
  lp?: number;
  lp2?: number;
}
/** Pitched voice. f -> to glides; lp adds a filter that opens from lp to lp2 (brass-like). */
function tone(
  t: number,
  { f, to, type = 'triangle', a = 0.006, d = 0.15, v = 0.2, room = 0.25, detune = 0, lp, lp2 }: ToneOptions,
): void {
  const r = rig;
  if (!r) return;
  const o = r.ctx.createOscillator(),
    g = r.ctx.createGain();
  o.type = type;
  o.detune.value = detune;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + a + d);
  let src: AudioNode = o;
  if (lp) {
    const fl = r.ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.setValueAtTime(lp, t);
    if (lp2) fl.frequency.exponentialRampToValueAtTime(lp2, t + a + d * 0.6);
    o.connect(fl);
    src = fl;
  }
  shape(g, t, a, v, d);
  src.connect(g);
  g.connect(bus || r.master);
  send(r, g, room);
  o.start(t);
  o.stop(t + a + d + 0.05);
}

interface HissOptions {
  a?: number;
  d?: number;
  v?: number;
  bp?: number;
  sweep?: number;
  q?: number;
  lp?: number;
  hp?: number;
  room?: number;
}
/** Noise voice: card slaps, riffles, whooshes, snare. bp/lp/hp filter it; sweep moves the band. */
function hiss(t: number, { a = 0.002, d = 0.08, v = 0.3, bp, sweep, q = 1, lp, hp, room = 0.12 }: HissOptions): void {
  const r = rig;
  if (!r) return;
  const s = r.ctx.createBufferSource();
  s.buffer = r.noiseBuf;
  let node: AudioNode = s;
  if (bp) {
    const f = r.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(bp, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + a + d);
    node.connect(f);
    node = f;
  }
  if (lp) {
    const f = r.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lp;
    node.connect(f);
    node = f;
  }
  if (hp) {
    const f = r.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    node.connect(f);
    node = f;
  }
  const g = r.ctx.createGain();
  shape(g, t, a, v, d);
  node.connect(g);
  g.connect(bus || r.master);
  send(r, g, room);
  s.start(t, Math.random() * 1.5);
  s.stop(t + a + d + 0.05);
}
const bell = (t: number, f: number, v = 0.09, d = 0.7): void => {
  tone(t, { f, type: 'sine', d, v, room: 0.5 });
  tone(t, { f: f * 2.76, type: 'sine', d: d * 0.5, v: v * 0.35, room: 0.5 });
};
interface NotesOptions {
  step?: number;
  type?: OscillatorType;
  d?: number;
  v?: number;
  room?: number;
}
const notes = (
  t: number,
  list: number[],
  { step = 0.06, type = 'triangle', d = 0.16, v = 0.12, room = 0.3 }: NotesOptions = {},
): void => list.forEach((f, k) => tone(t + k * step, { f, type, d, v, room }));

/** A named sound. `t` is the audio-clock time to start at; `arg` is what a few of them vary by (a seat, a count, a step). */
type Recipe = (t: number, arg?: number) => void;

/* --- the sound library --- */
const D4 = 294,
  G4 = 392,
  A4 = 440,
  B4 = 494,
  C5 = 523,
  D5 = 587,
  E5 = 659,
  G5 = 784,
  A5 = 880,
  C6 = 1047,
  E6 = 1319;
const RECIPES = {
  /* interface */
  tap: (t) => {
    tone(t, { f: 900, type: 'sine', d: 0.045, v: 0.09, room: 0.05 });
    hiss(t, { bp: 3200, q: 2, d: 0.018, v: 0.05, room: 0 });
  },
  back: (t) => {
    tone(t, { f: 700, to: 520, type: 'sine', d: 0.07, v: 0.08, room: 0.05 });
  },
  select: (t) => {
    tone(t, { f: 1150, to: 1500, type: 'sine', d: 0.05, v: 0.08, room: 0.1 });
    hiss(t, { bp: 2600, q: 1.5, d: 0.025, v: 0.06, room: 0 });
  },
  confirm: (t) => notes(t, [E5, A5], { step: 0.07, d: 0.12, v: 0.1 }),
  nope: (t) => {
    tone(t, { f: 200, to: 150, type: 'square', d: 0.1, v: 0.05, room: 0, lp: 900 });
    tone(t + 0.1, { f: 150, to: 120, type: 'square', d: 0.12, v: 0.05, room: 0, lp: 700 });
  },
  toggleOn: (t) => notes(t, [G5, C6], { step: 0.05, type: 'sine', d: 0.07, v: 0.09 }),
  toggleOff: (t) => notes(t, [C6, G5], { step: 0.05, type: 'sine', d: 0.07, v: 0.07 }),
  stepUp: (t) => tone(t, { f: 820, to: 980, type: 'sine', d: 0.05, v: 0.08, room: 0.05 }),
  stepDown: (t) => tone(t, { f: 820, to: 660, type: 'sine', d: 0.05, v: 0.08, room: 0.05 }),
  sheetUp: (t) => {
    hiss(t, { a: 0.06, d: 0.16, bp: 500, sweep: 1800, q: 0.9, v: 0.07, room: 0.1 });
    tone(t, { f: 420, to: 640, type: 'sine', d: 0.12, v: 0.03, room: 0.1 });
  },
  sheetDown: (t) => {
    hiss(t, { a: 0.04, d: 0.16, bp: 1600, sweep: 450, q: 0.9, v: 0.06, room: 0.1 });
  },
  whoosh: (t) => {
    hiss(t, { a: 0.12, d: 0.28, bp: 300, sweep: 2400, q: 0.7, v: 0.12, room: 0.2 });
  },
  swipeOpen: (t) => {
    hiss(t, { bp: 4200, q: 3, d: 0.012, v: 0.16, room: 0 });
    tone(t, { f: 1500, type: 'sine', d: 0.03, v: 0.04, room: 0 });
  },
  trash: (t) => {
    hiss(t, { a: 0.02, d: 0.3, bp: 1800, sweep: 260, q: 0.8, v: 0.2, room: 0.15 });
    tone(t + 0.04, { f: 330, to: 110, type: 'sine', d: 0.26, v: 0.09, room: 0.1 });
  },
  undo: (t) => {
    tone(t, { f: 330, to: 880, type: 'sine', d: 0.12, v: 0.08, room: 0.2 });
    tone(t + 0.13, { f: A5, type: 'sine', d: 0.12, v: 0.07, room: 0.3 });
  },
  /* cards */
  select2: (t) => {
    hiss(t, { bp: 2800, q: 0.8, d: 0.045, v: 0.22, room: 0 });
    tone(t, { f: 1300, to: 1700, type: 'sine', d: 0.035, v: 0.04, room: 0 });
  },
  cardPlay: (t, seat = 0) => {
    const b = 1500 + (seat % 5) * 140;
    hiss(t, { bp: b, q: 0.7, d: 0.065, v: 0.5, room: 0.08 });
    hiss(t, { lp: 420, d: 0.09, v: 0.32, room: 0 });
    tone(t, { f: 130, to: 70, type: 'sine', d: 0.08, v: 0.22, room: 0 });
  },
  deal: (t, n = 5) => {
    for (let k = 0; k < Math.min(n, 10); k++)
      hiss(t + k * 0.068, { bp: 2000 + Math.random() * 900, q: 0.9, d: 0.04, v: 0.22, room: 0.06 });
  },
  sweep: (t) => {
    hiss(t, { a: 0.06, d: 0.26, bp: 600, sweep: 2800, q: 0.6, v: 0.16, room: 0.12 });
  },
  trickWin: (t) => {
    [C6 * 1.5, E6 * 1.5, C6 * 2].forEach((f, k) => bell(t + k * 0.06, f, 0.05, 0.35));
    hiss(t, { hp: 6000, d: 0.14, v: 0.04 });
  },
  trickLose: (t) => {
    hiss(t, { a: 0.05, d: 0.24, bp: 1900, sweep: 650, q: 0.7, v: 0.1, room: 0.1 });
  },
  yourTurn: (t) => {
    bell(t, 988, 0.06, 0.45);
    bell(t + 0.13, 1319, 0.06, 0.6);
  },
  bidTick: (t, k = 0) => tone(t, { f: G4 * Math.pow(2, (k * 2) / 12), type: 'triangle', d: 0.09, v: 0.12, room: 0.15 }),
  yoho: (t) =>
    [0, 0.26, 0.52].forEach((o, k) => {
      tone(t + o, { f: k < 2 ? 150 : 185, to: k < 2 ? 75 : 90, type: 'sine', d: 0.28, v: 0.42, room: 0.15 });
      hiss(t + o, { lp: 1500, d: 0.06, v: 0.28, room: 0.1 });
    }),
  /* captures and beasts */
  coins: (t) =>
    [0, 0.07, 0.15].forEach((o, k) => {
      bell(t + o, [2093, 2637, 3136][k], 0.045, 0.25);
      hiss(t + o, { hp: 7000, d: 0.04, v: 0.05, room: 0 });
    }),
  harp: (t) =>
    notes(t, [C5, D5, E5, G5, A5, C6, D5 * 2, E6], { step: 0.035, type: 'sine', d: 0.55, v: 0.07, room: 0.5 }),
  clash: (t) => {
    [C5, 1080, 1620].forEach((f, k) =>
      tone(t, { f, type: 'square', d: 0.28, v: 0.035, room: 0.4, detune: k * 14, lp: 3000 }),
    );
    hiss(t, { hp: 4000, d: 0.3, v: 0.16, room: 0.3 });
  },
  gong: (t) => {
    tone(t, { f: 98, type: 'sine', a: 0.01, d: 2.2, v: 0.3, room: 0.5 });
    tone(t, { f: 147.5, type: 'sine', d: 1.6, v: 0.14, room: 0.5 });
    tone(t, { f: 271, type: 'sine', d: 1.1, v: 0.06, room: 0.5, detune: 9 });
    hiss(t, { lp: 900, d: 0.35, v: 0.12, room: 0.3 });
  },
  kraken: (t) => {
    tone(t, { f: 55, to: 38, type: 'sawtooth', a: 0.15, d: 1.3, v: 0.22, room: 0.3, lp: 220 });
    hiss(t, { a: 0.2, d: 1.2, lp: 260, v: 0.35, room: 0.2 });
    for (let k = 0; k < 9; k++) {
      const f = 260 + Math.random() * 420;
      tone(t + 0.25 + k * 0.09 + Math.random() * 0.05, { f, to: f * 1.8, type: 'sine', d: 0.05, v: 0.06, room: 0.3 });
    }
  },
  whale: (t) => {
    tone(t, { f: 250, to: 430, type: 'sine', a: 0.25, d: 0.95, v: 0.14, room: 0.7 });
    tone(t + 1.05, { f: 430, to: 290, type: 'sine', a: 0.1, d: 0.8, v: 0.1, room: 0.7 });
    hiss(t, { a: 0.4, d: 1.4, lp: 400, v: 0.14, room: 0.2 });
  },
  power: (t) => {
    notes(t, [C5, E5, G5, C6, E6], { step: 0.05, type: 'triangle', d: 0.3, v: 0.08, room: 0.5 });
    hiss(t, { a: 0.15, d: 0.5, bp: 5000, sweep: 9000, q: 0.6, v: 0.05, room: 0.4 });
  },
  /* rounds and finale */
  start: (t) => {
    const m = [
      [D4, 0.14],
      [G4, 0.14],
      [G4, 0.07],
      [A4, 0.07],
      [B4, 0.14],
      [G4, 0.14],
      [B4, 0.07],
      [D5, 0.28],
    ];
    let o = 0;
    m.forEach(([f, d]) => {
      tone(t + o, { f, type: 'square', d: d * 0.9, v: 0.045, room: 0.2, lp: 1600 });
      tone(t + o, { f: f / 2, type: 'triangle', d: d * 0.9, v: 0.07, room: 0.1 });
      o += d + 0.015;
    });
  },
  roundGood: (t) => {
    notes(t, [C5, E5, G5], { step: 0.08, d: 0.14, v: 0.11 });
    bell(t + 0.26, C6, 0.07, 0.6);
  },
  roundBad: (t) => {
    [
      [G4, 370],
      [349, 330],
      [330, 250],
    ].forEach(([f, to], k) =>
      tone(t + k * 0.26, { f, to, type: 'triangle', d: k < 2 ? 0.22 : 0.55, v: 0.11, room: 0.2 }),
    );
  },
  streak: (t, n = 3) =>
    notes(
      t,
      Array.from({ length: Math.min(n, 6) }, (_, k) => C6 * Math.pow(2, (k * 2) / 12)),
      { step: 0.045, type: 'sine', d: 0.2, v: 0.06, room: 0.4 },
    ),
  tick: (t, k = 0) => {
    tone(t, { f: 620 * Math.pow(1.12, k), type: 'sine', d: 0.07, v: 0.12, room: 0.2 });
    hiss(t, { bp: 2600, q: 2, d: 0.02, v: 0.06, room: 0 });
  },
  drum: (t) => {
    let o = 0;
    for (let k = 0; k < 22; k++) {
      hiss(t + o, { bp: 1700, q: 0.6, d: 0.05, v: 0.06 + k * 0.012, room: 0.15 });
      o += 0.1 * Math.pow(0.94, k);
    }
    hiss(t + o + 0.02, { hp: 5000, a: 0.005, d: 0.9, v: 0.18, room: 0.5 });
  },
  fanfare: (t) => {
    const brass = (o: number, f: number, d: number): void =>
      [1, 1.5, 2].forEach((m, k) =>
        tone(t + o, {
          f: f * m,
          type: 'sawtooth',
          a: 0.03,
          d,
          v: 0.05 / (k + 1),
          room: 0.4,
          lp: 600,
          lp2: 3200,
          detune: k ? 6 : 0,
        }),
      );
    brass(0, G4, 0.13);
    brass(0.15, C5, 0.13);
    brass(0.3, E5, 0.13);
    brass(0.45, G5, 0.75);
    [C5, E5, G5].forEach((f) =>
      tone(t + 0.45, { f, type: 'sawtooth', a: 0.05, d: 0.8, v: 0.03, room: 0.5, lp: 800, lp2: 2600 }),
    );
  },
  chime: (t, k = 0) => bell(t, 880 * Math.pow(1.12, k), 0.08, 0.7),
} satisfies Record<string, Recipe>;

/** Every sound the table can play. */
export type SoundName = keyof typeof RECIPES;
const LIB: Record<SoundName, Recipe> = RECIPES;

/* --- recorded takes --- */
/** How a sound's takes are played: level, room send, and how far the speed (and with it the pitch) drifts either way. */
interface TakeMix {
  v: number;
  room: number;
  drift: number;
}
/* Every take is stored at the same loudness (web README, "Recorded sounds"). `v` puts it where the
   sound's recipe sat in the mix: the card recipe renders about that loud, the tap a third of it. */
const TAKES = {
  tap: { v: 0.32, room: 0.05, drift: 0.04 },
  cardPlay: { v: 1, room: 0.08, drift: 0.06 },
} satisfies Partial<Record<SoundName, TakeMix>>;
/** The sounds that can be given recorded takes. */
export type SampledSound = keyof typeof TAKES;
const TAKE_MIX: Partial<Record<SoundName, TakeMix>> = TAKES;

/** Play one of the sound's takes: never the one it played last, each time a little faster or slower. False if it has none. */
function take(r: Rig, t: number, name: SoundName): boolean {
  const ready = takes[name],
    mix = TAKE_MIX[name];
  if (!ready?.length || !mix) return false;
  const n = ready.length,
    prev = lastTake[name];
  const k =
    prev == null || n < 2 ? Math.floor(Math.random() * n) : (prev + 1 + Math.floor(Math.random() * (n - 1))) % n;
  lastTake[name] = k;
  const s = r.ctx.createBufferSource(),
    g = r.ctx.createGain();
  s.buffer = ready[k];
  s.playbackRate.value = 1 + (Math.random() * 2 - 1) * mix.drift;
  g.gain.value = mix.v;
  s.connect(g);
  g.connect(bus || r.master);
  send(r, g, mix.room);
  s.start(t);
  return true;
}

/* --- sea ambience: brown noise through a low filter, swelling like waves --- */
/* Mix: three tiers, measured from rendered peaks. Interface ~0.06, game events ~0.12-0.2, highlights ~0.25. */
const MIX: Partial<Record<SoundName, number>> = {
  tap: 2.4,
  back: 2.6,
  select: 2.6,
  stepUp: 2.6,
  stepDown: 2.6,
  sheetUp: 2.8,
  sheetDown: 2.8,
  swipeOpen: 3,
  select2: 1.7,
  tick: 2,
  bidTick: 1.7,
  chime: 1.8,
  trickLose: 1.4,
  sweep: 1.4,
  yoho: 0.55,
  gong: 0.7,
  harp: 0.85,
  fanfare: 3,
  whale: 1.2,
};
function ambience(on: boolean): void {
  const r = boot();
  if (!r) return;
  if (on && !amb) {
    const s = r.ctx.createBufferSource();
    s.buffer = r.noiseBuf;
    s.loop = true;
    const lp = r.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const g = r.ctx.createGain();
    g.gain.value = 0;
    const swell = r.ctx.createOscillator(),
      depth = r.ctx.createGain();
    swell.frequency.value = 0.11;
    depth.gain.value = 0.05;
    swell.connect(depth).connect(g.gain);
    s.connect(lp).connect(g).connect(r.master);
    s.start();
    swell.start();
    g.gain.setTargetAtTime(0.07, r.ctx.currentTime, 1.2);
    amb = { s, swell, g };
  } else if (!on && amb) {
    const a = amb;
    amb = null;
    a.g.gain.setTargetAtTime(0, r.ctx.currentTime, 0.4);
    setTimeout(() => {
      try {
        a.s.stop();
        a.swell.stop();
      } catch {
        // Already stopped.
      }
    }, 1600);
  }
}

/* --- menu music: one recorded tune, round and round for as long as the page asks for it --- */
/* The tune is stored at -16 LUFS. At 0.3 it plays about as loud as a button tap, under the game's sounds. */
const MUSIC_V = 0.3;

/** Decode the tune. Decoded it takes some 30 MB, so this waits until the music is wanted. */
function decodeTune(): void {
  const file = tuneFile,
    ctx = decoder();
  if (!file || !ctx) return;
  tuneFile = null;
  try {
    void ctx.decodeAudioData(file).then(
      (buffer) => {
        tune = buffer;
        syncMusic();
      },
      () => {
        // Not audio this browser can read: the menu stays quiet.
      },
    );
  } catch {
    // The same, for a browser whose decodeAudioData does not return a promise.
  }
}

/** Start or stop the tune, so that it plays exactly while it is wanted and sound is on. */
function syncMusic(): void {
  const on = musicWanted && !prefs.muted;
  if (on && !tune) decodeTune();
  // Without an audio graph nothing plays: it is built on the first tap, and unlock() comes back here.
  const r = rig;
  if (!r) return;
  const t = r.ctx.currentTime;
  if (on && tune && !mus) {
    const s = r.ctx.createBufferSource(),
      g = r.ctx.createGain();
    s.buffer = tune;
    // Any stretch of the file that is `repeats` long joins up with itself (web README, "Menu
    // music"). This one begins half-way into the lead-in, clear of the silence a decoder may leave
    // at the front of an MP3.
    s.loop = true;
    s.loopStart = tuneLoop.starts / 2;
    s.loopEnd = tuneLoop.starts / 2 + tuneLoop.repeats;
    g.gain.value = 0;
    s.connect(g).connect(r.master);
    s.start(t, tuneLoop.starts);
    g.gain.setTargetAtTime(MUSIC_V, t, 0.4);
    mus = { s, g };
  } else if (!on && mus) {
    const m = mus;
    mus = null;
    m.g.gain.setTargetAtTime(0, t, 0.15);
    m.s.stop(t + 1);
  }
}

export const Sound = {
  /** Point the mixer at the settings to read. They are read on every call, so later changes apply at once. */
  use(settings: SoundPrefs): void {
    prefs = settings;
  },
  /** Play a named sound. Repeats of the same sound within 30ms are merged. */
  play(name: SoundName, arg?: number): void {
    if (prefs.muted) return;
    const r = boot();
    if (!r) return;
    if (r.ctx.state === 'suspended') void r.ctx.resume();
    const now = performance.now();
    const prev = last[name];
    if (prev && now - prev < 30) return;
    last[name] = now;
    bus = r.ctx.createGain();
    bus.gain.value = MIX[name] || 1;
    bus.connect(r.master);
    try {
      const t = r.ctx.currentTime + 0.01;
      if (!take(r, t, name)) LIB[name](t, arg);
    } catch {
      // A sound that cannot be built is skipped; the game goes on.
    }
    bus = null;
  },
  /** Short vibration on phones that support it. */
  buzz(ms = 10): void {
    if (prefs.haptics !== false && !prefs.muted)
      try {
        if (typeof navigator.vibrate === 'function') navigator.vibrate(ms);
      } catch {
        // Vibration is a nicety.
      }
  },
  setLevel(): void {
    if (rig) rig.master.gain.setTargetAtTime(level(), rig.ctx.currentTime, 0.05);
    ambience(!prefs.muted && prefs.ambience);
    syncMusic();
  },
  ambience,
  /** Stop the ambience and the music without waking the audio graph: for when the table leaves the page. */
  hush(): void {
    if (rig && amb) ambience(false);
    musicWanted = false;
    syncMusic();
  },
  /** Audio may only start after a user gesture; this unlocks it on the first tap. */
  unlock(): void {
    const r = boot();
    if (r && r.ctx.state === 'suspended') void r.ctx.resume();
    if (prefs.ambience && !prefs.muted) ambience(true);
    syncMusic();
  },
  /**
   * Give a sound recorded takes to play in place of its recipe: encoded audio files, as fetched.
   * Until one is decoded the recipe plays.
   */
  samples(name: SampledSound, files: ArrayBuffer[]): void {
    waiting[name] = files;
    const ctx = decoder();
    if (ctx) decode(ctx, name);
  },
  /**
   * Give the mixer the menu tune: an encoded audio file, as fetched, and where the tune sits in it.
   * It is decoded when the music is first wanted.
   */
  tune(file: ArrayBuffer, loop: TuneLoop): void {
    tuneFile = file;
    tuneLoop = loop;
    syncMusic();
  },
  /**
   * Say whether the menu music is wanted. It plays once the tune is in and audio is unlocked, and
   * not while sound is off. Asking again for what already is changes nothing.
   */
  music(on: boolean): void {
    musicWanted = on;
    syncMusic();
  },
  /** Every sound there is. */
  names: (): SoundName[] => Object.keys(LIB) as SoundName[],
};
