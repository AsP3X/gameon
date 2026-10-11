// @vitest-environment jsdom
/* The table renderer in a document: mount, play through the real click handler, unmount.
   jsdom has no matchMedia, no Web Audio and no vibration. The renderer already does without the
   last two; matchMedia is stubbed here, answering "reduce motion", so nothing waits on an animation. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { mountTavern } from './index';
import { prefs, session, tableView, ui } from './state';
import { Store } from './store';

/** mulberry32, so the deal and the bots are the same on every run. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let app: HTMLDivElement;
let fx: HTMLCanvasElement;
let unmount: (() => void) | null = null;

const all = (selector: string): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>(selector));
/** A click where a user would click: on the element, bubbling up to the document's one listener. */
function click(selector: string): void {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`Nothing to click: ${selector}`);
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}
const mount = (): void => {
  unmount = mountTavern(app, fx);
};
/** Solo game against three bots, 6 cards in the first round ("Skip to the Brawl"). */
function startSoloGame(): void {
  click('[data-act="setup"]');
  click('[data-act="format"][data-v="brawl"]');
  click('[data-act="start"]');
}
/** Let the table run until it is the human's turn to play a card. */
async function untilMyTurn(): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const v = tableView();
    if (v.phase === 'playing' && v.turn === v.me && !ui.waiting) return;
    await vi.advanceTimersByTimeAsync(250);
  }
  throw new Error('The human never got the turn');
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockImplementation(seeded(7));
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }));
  vi.stubGlobal('scrollTo', () => {});
  localStorage.clear();
  document.body.innerHTML = '<div id="root"><div id="app"></div><canvas id="fx" hidden></canvas></div>';
  app = document.querySelector<HTMLDivElement>('#app') ?? document.createElement('div');
  fx = document.querySelector<HTMLCanvasElement>('#fx') ?? document.createElement('canvas');
});

afterEach(() => {
  unmount?.();
  unmount = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('mountTavern', () => {
  it('renders the home screen and puts the sprite first in <body>', () => {
    mount();
    expect(app.querySelector('.home .logo')?.textContent).toBe('Skull King');
    expect(app.querySelector('[data-act="setup"]')?.textContent).toBe('Play');
    expect(app.classList.contains('full')).toBe(true);
    expect(document.body.firstElementChild?.tagName.toLowerCase()).toBe('svg');
    expect(document.querySelectorAll('symbol#ill-back')).toHaveLength(1);
  });

  it('plays a solo game through the click handler: bots bid, the human bids and plays a card', async () => {
    mount();
    startSoloGame();
    expect(ui.screen).toBe('game');
    expect(app.querySelector('.game')).not.toBeNull();

    // The three bots bid on their timers; the human's bid stays open.
    await vi.advanceTimersByTimeAsync(3000);
    let v = tableView();
    expect(v.phase).toBe('bidding');
    expect(v.cards).toBe(6);
    expect(v.bids.filter((b) => b === -1)).toHaveLength(3);
    expect(all('.seat .ready').map((el) => el.textContent)).toEqual(['Ready', 'Ready', 'Ready']);
    expect(all('.hand .hslot')).toHaveLength(6);
    expect(
      all('.hand .hslot')
        .map((el) => Number(el.dataset.id))
        .sort((a, b) => a - b),
    ).toEqual(v.hand.slice().sort((a, b) => a - b));
    expect(all('.chips [data-act="bidPick"]')).toHaveLength(7);

    // Bid 2: pick the chip, then confirm.
    click('[data-act="bidPick"][data-v="2"]');
    expect(app.querySelector('[data-act="bid"]')?.textContent).toBe('Bid 2');
    click('[data-act="bid"]');
    await vi.advanceTimersByTimeAsync(600); // the "Yo-ho-ho!" banner, shortened by reduced motion
    v = tableView();
    expect(v.phase).toBe('playing');
    expect(v.bids[v.me]).toBe(2);
    expect(v.bids.every((b) => b != null && b >= 0)).toBe(true);
    expect(app.querySelector('.mebar .bidline .num')?.textContent).toBe('0/2');

    // Play a legal card: the first tap lifts it, the second plays it.
    await untilMyTurn();
    v = tableView();
    const card = v.legal.find((id) => v.deck[id].kind !== 'tigress') ?? v.legal[0];
    const slot = `.hand .hslot[data-id="${card}"]`;
    click(slot);
    expect(ui.sel).toBe(card);
    expect(app.querySelector(slot)?.classList.contains('sel')).toBe(true);
    if (v.deck[card].kind === 'tigress') click('[data-act="play"][data-as="pirate"]');
    else click(slot);

    const after = tableView();
    expect(after.hand).not.toContain(card);
    expect(after.hand).toHaveLength(5);
    expect(after.played).toContain(card);
    expect(app.querySelector(slot)).toBeNull();
    expect(app.querySelector(`.trick .slot[data-key="c${card}"]`)).not.toBeNull();
    expect(all('.hand .hslot')).toHaveLength(5);

    // Every accepted action is saved under the legacy key.
    expect(Store.loadGame()?.played).toContain(card);
    expect(localStorage.getItem('skullking-tavern.game.v2')).not.toBeNull();
  });

  it('escapes a name the player typed', () => {
    mount();
    click('[data-act="setup"]');
    const input = app.querySelector<HTMLInputElement>('#crew-0');
    if (!input) throw new Error('No name field');
    const name = '<img src=x>"\'&';
    input.value = name;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(prefs.crew[0].name).toBe(name);
    click('[data-act="start"]');
    expect(app.querySelector('.mebar .pname')?.textContent).toBe(name);
    expect(app.querySelector('img')).toBeNull();
    click('[data-act="board"]');
    expect(all('.sheet .lb .pname').map((el) => el.textContent)).toContain(name);
    expect(app.querySelector('img')).toBeNull();
  });

  it('cleans up: no sprite, no listeners, no running table', async () => {
    mount();
    startSoloGame();
    unmount?.();

    expect(document.querySelector('symbol#ill-back')).toBeNull();
    expect(document.querySelector('svg')).toBeNull();
    expect(app.innerHTML).toBe('');
    expect(app.hasAttribute('data-enter')).toBe(false);

    // A button like the ones the renderer draws: nothing listens for it any more.
    app.innerHTML = '<button data-act="home">Home</button><button data-act="crewAdd">Add</button>';
    const crew = prefs.crew.length;
    click('[data-act="crewAdd"]');
    click('[data-act="home"]');
    await vi.advanceTimersByTimeAsync(5000);
    expect(prefs.crew).toHaveLength(crew);
    expect(ui.screen).toBe('game');
    expect(app.querySelectorAll('button')).toHaveLength(2);
    expect(session.table).not.toBeNull();
    expect(tableView().bids.every((b) => b == null)).toBe(true); // the stopped bots never bid
  });

  it('survives mount, cleanup, mount (React StrictMode): one sprite, one listener', () => {
    mount();
    unmount?.();
    mount();
    expect(document.querySelectorAll('symbol#ill-back')).toHaveLength(1);
    expect(app.querySelector('.home')).not.toBeNull();
    click('[data-act="setup"]');
    click('[data-act="crewAdd"]');
    expect(prefs.crew).toHaveLength(5); // a second listener would have added two pirates
    expect(app.querySelectorAll('.crew-row')).toHaveLength(5);
  });

  it('replaces a renderer that was never cleaned up instead of doubling it', () => {
    mount();
    mount();
    expect(document.querySelectorAll('symbol#ill-back')).toHaveLength(1);
    click('[data-act="setup"]');
    click('[data-act="crewAdd"]');
    expect(prefs.crew).toHaveLength(5);
  });

  it('keeps the one-time swipe hint for a mount that stays (StrictMode throws the first one away)', async () => {
    mount();
    startSoloGame();
    await vi.advanceTimersByTimeAsync(3000);
    unmount?.();
    expect(prefs.swipeHinted).toBeUndefined(); // the home screen with a saved game was never shown

    mount(); // shows the hint, and is taken away at once
    expect(app.querySelector('.swipe.hint')).not.toBeNull();
    unmount?.();
    mount();
    expect(app.querySelector('.swipe.hint')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(3000); // this time it plays
    unmount?.();
    mount();
    expect(app.querySelector('.swipe')).not.toBeNull();
    expect(app.querySelector('.swipe.hint')).toBeNull();
    expect(JSON.parse(localStorage.getItem('skullking-tavern.prefs.v2') ?? '{}')).toHaveProperty('swipeHinted', true);
  });

  it('starts again from what is saved on the device', async () => {
    mount();
    startSoloGame();
    await vi.advanceTimersByTimeAsync(3000);
    unmount?.();
    mount();
    expect(ui.screen).toBe('home');
    expect(app.querySelector('[data-act="resume"]')?.textContent).toBe('Continue · Round 1 of 5');
    expect(prefs.format).toBe('brawl');
    click('[data-act="resume"]');
    expect(tableView().bids.filter((b) => b === -1)).toHaveLength(3);
    expect(all('.hand .hslot')).toHaveLength(6);
  });
});
