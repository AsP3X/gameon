/* The harness of the parity tests: it compares the table renderer with the legacy build itself.
   The same clicks, the same clock and the same stream of "random" numbers go into the legacy script
   (legacy/Skull King Tavern.html, run as it is in a document of its own) and into the port. After
   every step the two must show the same markup, hold the same localStorage, and have asked the page
   for the same effects at the same moment: animations, Web Audio calls, vibration, confetti.
   That covers what a reading of the code cannot: copy, class names, timing constants, sounds and
   stored shapes across whole games.

   The scenarios are in the test files next to this one, one file each so they run side by side. */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInThisContext } from 'node:vm';
import { expect, vi } from 'vite-plus/test';

/** mulberry32, so both sides can be handed the same stream of "random" numbers. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- what the builds do to the page besides drawing it ---------- */

/** Every effect either build asks for, in order: animations, Web Audio calls, vibration, confetti, warnings. */
const effects: string[] = [];

function stubAnimations(): void {
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value(this: Element, keyframes: unknown, options: unknown) {
      effects.push(`animate ${JSON.stringify({ on: this.className, keyframes, options })}`);
      return { finished: Promise.resolve() };
    },
  });
}

function stubVibration(): void {
  Object.defineProperty(navigator, 'vibrate', {
    configurable: true,
    value(ms: number) {
      effects.push(`vibrate ${ms}`);
      return true;
    },
  });
}

/* A stand-in for Web Audio that plays nothing and writes down everything: which nodes are made,
   how they are wired, and every value and ramp, with its time. Two builds that make the same
   calls make the same sound. */
const labels = new WeakMap<object, string>();
let audioNodes = 0;
const show = (v: unknown): string => {
  if (typeof v === 'number') return String(Math.round(v * 1e6) / 1e6);
  if ((typeof v === 'object' && v !== null) || typeof v === 'function') return labels.get(v) ?? 'data';
  return String(v);
};
/** A node, an AudioParam or a method, depending on how it is used: reading gives parts, writes and calls are logged. */
function part(label: string): object {
  const parts = new Map<string, object>();
  const proxy: object = new Proxy(() => {}, {
    get(_target, prop) {
      if (typeof prop !== 'string' || prop === 'then') return undefined;
      if (prop === 'currentTime') return 5;
      if (prop === 'sampleRate') return 200;
      if (prop === 'state') return 'running';
      const known = parts.get(prop);
      if (known) return known;
      const made = part(`${label}.${prop}`);
      parts.set(prop, made);
      return made;
    },
    set(_target, prop, value: unknown) {
      effects.push(`${label}.${String(prop)} = ${show(value)}`);
      return true;
    },
    apply(_target, _self, args: unknown[]) {
      effects.push(`${label}(${args.map(show).join(', ')})`);
      const method = label.slice(label.lastIndexOf('.') + 1);
      if (method === 'createBuffer') {
        const buffer = { getChannelData: () => new Float32Array(Number(args[1])) };
        labels.set(buffer, `buffer#${++audioNodes}`);
        return buffer;
      }
      if (method.startsWith('create')) return part(`${method.slice('create'.length)}#${++audioNodes}`);
      if (method === 'connect') return args[0];
      if (method === 'resume') return Promise.resolve();
      return undefined;
    },
  });
  labels.set(proxy, label);
  return proxy;
}
class RecordingAudioContext {
  constructor() {
    return part(`AudioContext#${++audioNodes}`);
  }
}

/* ---------- the two builds ---------- */

/** One of the two builds, in a document, ready to be used. */
interface Stage {
  doc: Document;
  app: HTMLElement;
  fx: HTMLCanvasElement;
  /** Where the build listens for what it does not hear on the document: pointer moves, resize. */
  win: EventTarget;
  /** What the build has saved, by key. */
  stored: () => Record<string, string>;
  /** Has anything in the document changed since this was last asked? */
  changed: () => boolean;
  /** The build's own sound module. */
  sounds: () => string[];
  play: (name: string, arg?: number) => void;
  close: () => void;
}

const PAGE = '<div id="app"></div><canvas id="fx" hidden></canvas>';
function elements(doc: Document): Pick<Stage, 'doc' | 'app' | 'fx' | 'changed'> {
  const app = doc.querySelector<HTMLElement>('#app'),
    fx = doc.querySelector<HTMLCanvasElement>('#fx');
  if (!app || !fx) throw new Error('The page has no #app or #fx');
  const watch = new MutationObserver(() => {});
  watch.observe(doc.body, { subtree: true, childList: true, attributes: true, characterData: true });
  return { doc, app, fx, changed: () => watch.takeRecords().length > 0 };
}
const byKey = (a: [string, string], b: [string, string]): number => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

interface LegacySound {
  play: (name: string, arg?: number) => void;
  names: () => string[];
}
/** What the legacy script reads from, and leaves on, `window`. */
interface LegacyWindow {
  scrollTo: () => void;
  AudioContext: unknown;
  SKT?: { Sound: LegacySound };
}
type LegacyPage = (
  document: Document,
  window: LegacyWindow,
  localStorage: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void },
  addEventListener: EventTarget['addEventListener'],
) => void;

/** The whole legacy script, with the page globals it touches turned into parameters. */
function loadLegacy(): LegacyPage {
  // Not `new URL(…, import.meta.url)`: in this environment URL is the page's, and Node wants its own.
  const path = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../legacy/Skull King Tavern.html');
  const html = readFileSync(path, 'utf8');
  const script = html.slice(html.indexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'));
  // The legacy script is the reference itself, read from this repo.
  const source = `(function (document, window, localStorage, addEventListener) {${script}\n})`;
  return runInThisContext(source, { filename: 'Skull King Tavern.html' }) as LegacyPage;
}
const legacyPage = loadLegacy();

async function openLegacy(): Promise<Stage> {
  const doc = document.implementation.createHTMLDocument('legacy');
  doc.body.innerHTML = PAGE;
  const saved = new Map<string, string>();
  const win = new EventTarget();
  const legacyWindow: LegacyWindow = { scrollTo: () => {}, AudioContext: RecordingAudioContext };
  legacyPage(
    doc,
    legacyWindow,
    { getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => void saved.set(k, v) },
    win.addEventListener.bind(win),
  );
  const sound = legacyWindow.SKT?.Sound;
  if (!sound) throw new Error('The legacy script did not start');
  return Promise.resolve({
    ...elements(doc),
    win,
    stored: () => Object.fromEntries([...saved].sort(byKey)),
    sounds: () => sound.names(),
    play: (name, arg) => sound.play(name, arg),
    close: () => {},
  });
}

async function openPort(): Promise<Stage> {
  // Fresh modules: the port keeps its state (and its audio graph) in them, as the legacy page kept it in a closure.
  vi.resetModules();
  const { mountTavern } = await import('../index');
  const { Sound } = await import('../../sound/sound');
  localStorage.clear();
  document.body.innerHTML = PAGE;
  const page = elements(document);
  const close = mountTavern(page.app, page.fx);
  const stored = (): Record<string, string> => {
    const out: [string, string][] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k != null) out.push([k, localStorage.getItem(k) ?? '']);
    }
    return Object.fromEntries(out.sort(byKey));
  };
  const play = (name: string, arg?: number): void => {
    const known = Sound.names().find((n) => n === name);
    if (!known) throw new Error(`The port has no sound called ${name}`);
    Sound.play(known, arg);
  };
  return { ...page, win: window, stored, sounds: () => Sound.names(), play, close };
}

/* ---------- the one place the port is drawn differently on purpose ---------- */

/* The legacy page asks for a bid with a row of chips; the port asks with a slider on a sheet
   (views.ts, bidSheet). Both end in the same button. So the two are compared on what a bid control
   says, not on how it is drawn: how many bids it offers, and what its button reads and whether it
   can be pressed. Everything around it is still compared as markup. */
function pageHtml(app: HTMLElement): string {
  // The port's home screen offers "Play online" next to "Play", in a row the legacy page does not
  // have. What is compared is the button both builds share.
  const row = app.querySelector('.play-row'),
    shared = row?.querySelector('[data-act="setup"]');
  const html = row && shared ? app.innerHTML.replace(row.outerHTML, shared.outerHTML) : app.innerHTML,
    actions = app.querySelector('.actions'),
    send = actions?.querySelector<HTMLButtonElement>('[data-act="bid"]');
  if (!actions || !send) return html;
  const slider = actions.querySelector('#bid');
  const offered = slider
    ? Number(slider.getAttribute('aria-valuemax')) + 1
    : actions.querySelectorAll('[data-act="bidPick"]').length;
  const drawn = actions.innerHTML,
    at = html.indexOf(drawn);
  const said = `[bid control: ${offered} bids, "${send.textContent}"${send.disabled ? ', disabled' : ''}]`;
  return at < 0 ? html : html.slice(0, at) + said + html.slice(at + drawn.length);
}

/* ---------- driving a build ---------- */

/** Where a pointer is, for the swipe gesture. */
interface Point {
  x: number;
  y?: number;
}

/** Drives one build and writes down what it looks like whenever that changes. */
export class Run {
  readonly log: string[] = [];
  private tick = 0;
  private last = '';
  /** The page changed since playToEnd() last decided what to do. */
  private fresh = true;
  constructor(readonly stage: Stage) {
    this.note('boot', stage.doc.body.firstElementChild?.outerHTML);
  }

  /** Record the page if it changed since the last look. `what` says which step led here. */
  note(what: string, extra?: string): void {
    const s = this.stage;
    const shot = JSON.stringify({
      html: pageHtml(s.app),
      enter: s.app.hasAttribute('data-enter'),
      cls: s.app.className,
      banners: Array.from(s.doc.querySelectorAll('.banner'), (b) => b.outerHTML),
      fxHidden: s.fx.hidden,
      stored: s.stored(),
      effects: effects.splice(0),
      extra,
    });
    if (shot === this.last) return;
    this.log.push(`${this.tick} ${what} ${shot}`);
    this.last = shot;
    this.fresh = true;
  }

  has(selector: string): boolean {
    return this.stage.app.querySelector(selector) != null;
  }
  private find(selector: string): HTMLElement {
    const el = this.stage.app.querySelector<HTMLElement>(selector);
    if (!el) throw new Error(`Step ${this.tick}: nothing matches ${selector}`);
    return el;
  }
  click(selector: string, what = `click ${selector}`): void {
    this.find(selector).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    this.note(what);
  }
  /**
   * Bid the way the build on stage asks for it: a chip on the legacy page, the slider in the port
   * (a digit key sets it in one step, as one tap on a chip did). `i` picks which bid.
   */
  bid(i: number): void {
    const slider = this.stage.app.querySelector('.actions #bid');
    if (slider) {
      const bid = i % (Number(slider.getAttribute('aria-valuemax')) + 1);
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: bid > 9 ? 'End' : String(bid), bubbles: true }));
      this.note('pick a bid');
    } else {
      const chips = this.stage.app.querySelectorAll('.actions [data-act="bidPick"]').length;
      this.click(`.actions [data-act="bidPick"][data-v="${i % chips}"]`, 'pick a bid');
    }
    this.click('.actions [data-act="bid"]', 'send the bid');
  }
  type(selector: string, value: string): void {
    const el = this.find(selector);
    if (!(el instanceof HTMLInputElement)) throw new Error(`${selector} is not a text field`);
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    this.note(`type ${selector}`);
  }
  /** A range input reports while it is dragged (input) and once it is let go (change). */
  slide(selector: string, value: string): void {
    const el = this.find(selector);
    if (!(el instanceof HTMLInputElement)) throw new Error(`${selector} is not a slider`);
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    this.note(`slide ${selector}`);
  }
  choose(selector: string, value: string): void {
    const el = this.find(selector);
    if (!(el instanceof HTMLSelectElement)) throw new Error(`${selector} is not a select`);
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    this.note(`choose ${selector}`);
  }
  key(selector: string, key: string): void {
    this.find(selector).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    this.note(`key ${key} on ${selector}`);
  }
  /** A finger or the mouse goes down on an element. The first one of a page also unlocks its audio. */
  press(selector: string, at: Point): void {
    const init = { bubbles: true, pointerId: 1, button: 0, clientX: at.x, clientY: at.y ?? 0 };
    this.stage.win.dispatchEvent(new MouseEvent('pointerdown', init));
    this.find(selector).dispatchEvent(Object.assign(new MouseEvent('pointerdown', init), { pointerId: 1 }));
    this.note(`press ${selector}`);
  }
  /** The pointer moves, lifts or is taken away. Both builds listen for these on the window. */
  pointer(type: 'pointermove' | 'pointerup' | 'pointercancel', at: Point): void {
    const event = new MouseEvent(type, { clientX: at.x, clientY: at.y ?? 0 });
    this.stage.win.dispatchEvent(Object.assign(event, { pointerId: 1 }));
    this.note(`${type} ${at.x},${at.y ?? 0}`);
  }
  resize(): void {
    this.stage.win.dispatchEvent(new Event('resize'));
    this.note('resize');
  }
  /** Ask the build's sound module for a sound, as its own code would. */
  sound(name: string, arg?: number): void {
    this.stage.play(name, arg);
    this.note(`sound ${name}`);
  }
  sounds(): string[] {
    const names = this.stage.sounds();
    this.note('sounds', names.join(' '));
    return names;
  }
  /**
   * Let the clock run, 10 ms at a time, so a changed timing constant shows up as a different tick.
   * After each step everything that was waiting on a timer gets to finish (setImmediate is left real).
   */
  async wait(ms: number): Promise<void> {
    for (let t = 0; t < ms; t += 10) {
      vi.advanceTimersByTime(10);
      await new Promise((done) => setImmediate(done));
      this.tick++;
      if (this.stage.changed() || effects.length) this.note('wait');
    }
    this.note('waited');
  }

  /**
   * Play the game on screen to its end the way a player could: by what the page offers.
   * Every human seat is played, so this also walks through the pass-and-play handoffs.
   */
  async playToEnd(): Promise<void> {
    for (let i = 0; i < 6000 && !this.has('.end'); i++) {
      // Nothing new on the page means nothing new to do; look again once a second all the same.
      if (!this.fresh && i % 10) {
        await this.wait(100);
        continue;
      }
      this.fresh = false;
      if (this.has('.curtain')) this.click('[data-act="reveal"]');
      else if (this.has('.sheet [data-act="next"]')) this.click('.sheet [data-act="next"]');
      else if (this.has('.sheet button[data-act="seerDone"]')) this.click('.sheet button[data-act="seerDone"]');
      else if (this.has('.actions [data-act="results"]')) this.click('.actions [data-act="results"]');
      else if (this.has('.actions [data-act="bid"]')) this.bid(i);
      else if (this.has('.actions [data-act="peek"]')) this.click('.actions [data-act="peek"]');
      else if (this.has('.actions .seatpick button')) this.click('.actions .seatpick button:last-child');
      else if (this.has('.actions [data-act="ability"][disabled]')) this.click('.hand .hslot:not(.discard)'); // Smuggler: one more card to throw back
      else if (this.has('.actions [data-act="ability"]')) this.click('.actions [data-act="ability"]:last-child');
      else if (this.has('.actions [data-act="play"]'))
        this.click(`.actions [data-act="play"]:nth-child(${1 + (i % 2)})`);
      else if (this.has('.hand.myturn .hslot.locked')) {
        this.click('.hand .hslot.locked'); // "must follow suit": refused with a shake
        this.click(this.has('.hand .hslot.sel:not(.locked)') ? '.hand .hslot.sel' : '.hand .hslot:not(.locked)');
      } else if (this.has('.hand.myturn'))
        this.click(this.has('.hand .hslot.sel') ? '.hand .hslot.sel' : '.hand .hslot');
      else if (this.has('.lastbtn') && i % 7 === 0) {
        this.click('.lastbtn');
        this.click('.sheet [data-act="closeSheet"]');
      }
      await this.wait(100);
    }
    if (!this.has('.end')) throw new Error('The game did not end');
  }
}

/** A list of steps to run on a build. Both builds get the very same one. */
export type Scenario = (run: Run) => Promise<void>;

const CLOCK = {
  now: new Date(2026, 4, 17, 20, 30),
  toFake: [
    'setTimeout',
    'clearTimeout',
    'setInterval',
    'clearInterval',
    'Date',
    'performance',
    'requestAnimationFrame',
    'cancelAnimationFrame',
  ],
} satisfies Parameters<typeof vi.useFakeTimers>[0];

async function record(open: () => Promise<Stage>, scenario: Scenario, seed: number): Promise<string[]> {
  vi.useFakeTimers(CLOCK);
  vi.spyOn(Math, 'random').mockImplementation(seeded(seed));
  effects.length = 0;
  audioNodes = 0;
  const stage = await open();
  try {
    const run = new Run(stage);
    await scenario(run);
    return run.log;
  } finally {
    stage.close();
    vi.clearAllTimers();
    vi.useRealTimers();
  }
}

export interface ParityOptions {
  /** What `prefers-reduced-motion` answers. The two settings take different paths through the code. */
  reducedMotion: boolean;
  seed: number;
  /** Text the legacy build must have shown, or effects it must have asked for: what this scenario is there to exercise. */
  covers: string[];
}

/** Run the scenario on the legacy page, then on the port, and hold the two records against each other. */
export async function expectParity(scenario: Scenario, { reducedMotion, seed, covers }: ParityOptions): Promise<void> {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reducedMotion, media: query }));
  vi.stubGlobal('scrollTo', () => {});
  vi.stubGlobal('AudioContext', RecordingAudioContext);
  // The swipe rows read their width from the stylesheet, which the test page does not load.
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: (name: string) => (name === '--del' ? '56px' : '') }));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
    effects.push('confetti asks for the canvas');
    return null;
  });
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    effects.push(`warn ${JSON.stringify(args)}`);
  });
  stubAnimations();
  stubVibration();
  try {
    const legacy = await record(openLegacy, scenario, seed);
    const port = await record(openPort, scenario, seed);
    expect(covers.filter((text) => !legacy.some((shot) => shot.includes(text)))).toEqual([]);
    const firstDifference = legacy.findIndex((shot, i) => shot !== port[i]);
    if (firstDifference >= 0) expect(port[firstDifference]).toBe(legacy[firstDifference]);
    expect(port).toHaveLength(legacy.length);
  } finally {
    Reflect.deleteProperty(Element.prototype, 'animate');
    Reflect.deleteProperty(navigator, 'vibrate');
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
}
