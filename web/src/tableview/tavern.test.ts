// @vitest-environment jsdom
/* The table renderer in a document: mount, play through the real click handler, unmount.
   jsdom has no matchMedia, no Web Audio and no vibration. The renderer already does without the
   last two; matchMedia is stubbed here, answering "reduce motion", so nothing waits on an animation. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { Bots, Engine } from '../game';
import type { GameState } from '../game';
import type { Seat } from '../protocol/generated';
import { DISPATCH_TIMEOUT_MS } from '../table/table';
import type { DispatchResult, Table, TableListener } from '../table/table';
import { Sound } from '../sound/sound';
import { showTable } from './actions';
import { coverTavern, mountTavern } from './index';
import { go, render } from './render';
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
function key(selector: string, pressed: string): void {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`Nothing to press ${pressed} on: ${selector}`);
  el.dispatchEvent(new KeyboardEvent('keydown', { key: pressed, bubbles: true, cancelable: true }));
}
/** A finger on the page. The renderer hears it go down on the document and move and lift on the window. */
function pointer(type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, selector?: string): void {
  const on = selector ? document.querySelector(selector) : window;
  if (!on) throw new Error(`Nothing to touch: ${selector}`);
  on.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true, clientX: x, button: 0 }), { pointerId: 1 }));
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
    expect(app.querySelector('.bidsheet #bid')?.getAttribute('aria-valuemax')).toBe('6');
    expect(all('.bid-stops span').map((el) => el.textContent)).toEqual(['0', '1', '2', '3', '4', '5', '6']);

    // Bid 2: set the slider, then confirm.
    key('#bid', '2');
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

  describe('the bid sheet', () => {
    const send = (): HTMLButtonElement => {
      const el = app.querySelector<HTMLButtonElement>('.bidsheet [data-act="bid"]');
      if (!el) throw new Error('No bid sheet');
      return el;
    };
    const slider = (): HTMLElement => {
      const el = app.querySelector<HTMLElement>('#bid');
      if (!el) throw new Error('No bid slider');
      return el;
    };
    /** The track is 300 px wide and starts at the left edge: 50 px for each of the 6 cards. */
    const layOutTrack = (): void => {
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 300, 16));
    };

    it('offers nothing until the slider is touched, and 0 is a bid like any other', () => {
      mount();
      startSoloGame();
      expect(tableView().phase).toBe('bidding');
      expect(send().disabled).toBe(true);
      expect(send().textContent).toBe('Choose your bid');
      expect(slider().getAttribute('aria-valuetext')).toBe('No bid yet');
      expect(app.querySelector('.bid-out')?.textContent).toBe('Slide to set your bid');

      click('.bidsheet [data-act="bid"]'); // disabled: nothing is sent
      expect(tableView().bids[tableView().me]).toBeNull();

      key('#bid', 'ArrowLeft'); // from "nothing" one step down is 0, not a no-op
      expect(ui.bidPick).toBe(0);
      expect(send().disabled).toBe(false);
      expect(send().textContent).toBe('Bid 0');
      expect(slider().getAttribute('aria-valuetext')).toBe('0 tricks');
      click('.bidsheet [data-act="bid"]');
      expect(tableView().bids[tableView().me]).toBe(0);
      expect(app.querySelector('.bidsheet')).toBeNull();
    });

    it('steps with the arrows, jumps with Home, End and digits, and stays inside the round', () => {
      mount();
      startSoloGame();
      const steps: [string, number][] = [
        ['ArrowRight', 1],
        ['ArrowUp', 2],
        ['ArrowDown', 1],
        ['End', 6],
        ['ArrowRight', 6],
        ['9', 6], // six cards: there is no bid of 9
        ['4', 4],
        ['Home', 0],
        ['ArrowLeft', 0],
      ];
      for (const [pressed, bid] of steps) {
        key('#bid', pressed);
        expect([pressed, ui.bidPick]).toEqual([pressed, bid]);
        expect(slider().getAttribute('aria-valuenow')).toBe(String(bid));
        expect(send().textContent).toBe('Bid ' + bid);
      }
      expect(slider().getAttribute('aria-valuetext')).toBe('0 tricks');
      key('#bid', '1');
      expect(slider().getAttribute('aria-valuetext')).toBe('1 trick');
      expect(all('.bid-stops .on').map((el) => el.textContent)).toEqual(['1']);
    });

    it('keeps the keyboard on the slider when the table is redrawn', async () => {
      mount();
      startSoloGame();
      slider().focus();
      key('#bid', '3'); // redraws the table
      expect(document.activeElement).toBe(slider());
      await vi.advanceTimersByTimeAsync(3000); // every bot bids: three more redraws
      expect(tableView().bids.filter((b) => b === -1)).toHaveLength(3);
      expect(document.activeElement).toBe(slider());
      expect(ui.bidPick).toBe(3);
      expect(send().textContent).toBe('Bid 3');
    });

    it('follows a finger, through a redraw of the table, and settles on the nearest bid', async () => {
      mount();
      startSoloGame();
      layOutTrack();

      pointer('pointerdown', 110, '.bid-track');
      expect(ui.bidPick).toBe(2);
      expect(slider().classList.contains('dragging')).toBe(true);
      expect(slider().getAttribute('style')).toBe('--v:2.2;--max:6'); // under the finger, between two bids
      expect(app.querySelector('.bid-out')?.textContent).toBe('2');
      expect(send().textContent).toBe('Bid 2');

      await vi.advanceTimersByTimeAsync(3000); // the bots bid while the finger is down
      expect(tableView().bids.filter((b) => b === -1)).toHaveLength(3);
      pointer('pointermove', 260);
      expect(ui.bidPick).toBe(5);
      pointer('pointermove', 900); // past the end of the track
      expect(ui.bidPick).toBe(6);
      pointer('pointermove', 190);
      pointer('pointerup', 190);
      expect(ui.bidPick).toBe(4);
      expect(slider().classList.contains('dragging')).toBe(false);
      expect(slider().getAttribute('style')).toBe('--v:4;--max:6');

      pointer('pointermove', 20); // the finger is up: the slider no longer follows
      expect(ui.bidPick).toBe(4);
    });

    it('leaves the same sheet behind after a drag as after a key', () => {
      mount();
      startSoloGame();
      layOutTrack();
      pointer('pointerdown', 150, '.bid-track');
      pointer('pointerup', 150);
      const dragged = app.querySelector('.actions')?.innerHTML;
      ui.bidPick = null;
      key('#bid', '3');
      expect(dragged).toBe(app.querySelector('.actions')?.innerHTML);
      expect(dragged).toContain('Bid 3');
    });
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

  it('starts the menu music after Play and stops it on the home screen', () => {
    const music = vi.spyOn(Sound, 'music');
    const wanted = (): boolean | undefined => music.mock.calls.at(-1)?.[0];
    mount();
    expect(wanted()).toBe(false);
    click('[data-act="soundSheet"]'); // a sheet over the home screen does not start it
    expect(wanted()).toBe(false);
    click('[data-act="closeSheet"]');
    click('[data-act="setup"]');
    expect(wanted()).toBe(true);
    click('[data-act="start"]');
    expect(wanted()).toBe(true);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(wanted()).toBe(false);
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(wanted()).toBe(true);
    go('home');
    expect(wanted()).toBe(false);
    click('[data-act="online"]');
    expect(wanted()).toBe(true);
    coverTavern(true);
    expect(wanted()).toBe(true);
    coverTavern(false);
    expect(wanted()).toBe(false);
    const hush = vi.spyOn(Sound, 'hush');
    unmount?.();
    unmount = null;
    expect(hush).toHaveBeenCalledTimes(1);
    music.mockClear();
    document.dispatchEvent(new Event('visibilitychange')); // no listener left to ask for it
    expect(music).not.toHaveBeenCalled();
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

describe('the keyboard', () => {
  /** A solo game with the bids in and the cards in hand. */
  async function dealt(): Promise<void> {
    mount();
    startSoloGame();
    await vi.advanceTimersByTimeAsync(3000);
    key('#bid', '2');
    click('[data-act="bid"]');
    await vi.advanceTimersByTimeAsync(600);
    await untilMyTurn();
  }

  it('stays on the card it was on when the table is drawn again', async () => {
    await dealt();
    const cards = all('.hand button');
    expect(cards.length).toBeGreaterThan(2);
    cards[2].focus();
    const name = cards[2].getAttribute('aria-label');
    render();
    // A redraw replaces every element: it is the same card, not the same node.
    expect(document.activeElement).not.toBe(cards[2]);
    expect(document.activeElement).toBe(all('.hand button')[2]);
    expect(document.activeElement?.getAttribute('aria-label')).toBe(name);
  });

  it('goes into a sheet that opens, cannot reach what is behind it, and comes back when it closes', async () => {
    await dealt();
    const opener = (): HTMLElement | null => document.querySelector<HTMLElement>('.g-top [data-act="board"]');
    opener()?.focus();
    click('.g-top [data-act="board"]');
    const sheet = document.querySelector<HTMLElement>('.sheet');
    expect(sheet?.getAttribute('aria-label')).toBe('Scoreboard');
    expect(document.activeElement).toBe(sheet);
    expect(document.querySelector<HTMLElement>('.game')?.inert).toBe(true);
    // Tapping the scrim is how a sheet is closed: it has to stay live.
    expect(document.querySelector<HTMLElement>('.sheet-scrim')?.inert).toBe(false);
    expect(sheet?.inert).toBe(false);

    // The table is drawn again under the open sheet: the keyboard stays in the sheet.
    render();
    expect(document.activeElement).toBe(document.querySelector('.sheet'));

    key('.sheet', 'Escape');
    expect(document.querySelector('.sheet')).toBeNull();
    expect(document.querySelector<HTMLElement>('.game')?.inert).toBe(false);
    expect(document.activeElement).toBe(opener());
  });

  it('is left where it is when nothing in the page had it', async () => {
    await dealt();
    render();
    expect(document.activeElement).toBe(document.body);
  });
});

describe('a table that does not take an action', () => {
  const silent = (): Promise<DispatchResult> => new Promise(() => {});
  /** The open table. */
  function open(): Table {
    if (!session.table) throw new Error('No table is open');
    return session.table;
  }
  /** A solo game in which the three bots have bid and the human has set the slider to 2. */
  async function readyToBid(): Promise<void> {
    mount();
    startSoloGame();
    await vi.advanceTimersByTimeAsync(3000);
    key('#bid', '2');
    render(); // once more, so the page holds nothing that only the first drawing after a key shows
  }

  it('gives a refused bid back at once and an unanswered one at the limit, with the table as it was', async () => {
    await readyToBid();
    const page = app.innerHTML,
      view = session.view;
    const dispatch = vi
      .spyOn(open(), 'dispatch')
      .mockResolvedValue({ ok: false, code: 'NOT_YOUR_TURN', message: 'Wait for your turn.' });

    click('[data-act="bid"]');
    expect(ui.waiting).toBe(true);
    expect(app.querySelector('.actions')?.textContent).toBe('Locked in');
    await vi.advanceTimersByTimeAsync(0);
    expect(ui.waiting).toBe(false);
    expect(ui.bidPick).toBe(2);
    expect(session.view).toBe(view);
    expect(app.innerHTML).toBe(page);

    dispatch.mockImplementation(silent);
    click('[data-act="bid"]');
    click('.hand .hslot'); // input is locked: a tap on a card picks nothing
    expect(ui.sel).toBeNull();
    await vi.advanceTimersByTimeAsync(DISPATCH_TIMEOUT_MS - 1);
    expect(ui.waiting).toBe(true);
    expect(app.querySelector('.actions')?.textContent).toBe('Locked in');
    await vi.advanceTimersByTimeAsync(1);
    expect(ui.waiting).toBe(false);
    expect(ui.bidPick).toBe(2);
    expect(session.view).toBe(view);
    expect(app.innerHTML).toBe(page);
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'bid', seat: 0, bid: 2 });
    expect(tableView().bids[0]).toBeNull();

    // The same button still works once the table answers.
    dispatch.mockRestore();
    click('[data-act="bid"]');
    await vi.advanceTimersByTimeAsync(600); // the last bid of the round: shown after the "Yo-ho-ho!" banner
    expect(tableView().bids[0]).toBe(2);
    expect(ui.waiting).toBe(false);
  });

  it('puts an unanswered card back in the hand, still picked', async () => {
    await readyToBid();
    click('[data-act="bid"]');
    await vi.advanceTimersByTimeAsync(600);
    await untilMyTurn();
    const v = tableView(),
      card = v.legal.find((id) => v.deck[id].kind !== 'tigress') ?? v.legal[0],
      slot = `.hand .hslot[data-id="${card}"]`;
    click(slot);
    render();
    const page = app.innerHTML,
      view = session.view;
    const dispatch = vi.spyOn(open(), 'dispatch').mockImplementation(silent);

    if (v.deck[card].kind === 'tigress') click('[data-act="play"][data-as="pirate"]');
    else click(slot);
    expect(dispatch).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: 'play', seat: 0, card }));
    expect(ui.waiting).toBe(true);
    expect(ui.sel).toBeNull();
    expect(app.querySelector('.hand')?.classList.contains('myturn')).toBe(false);

    await vi.advanceTimersByTimeAsync(DISPATCH_TIMEOUT_MS);
    expect(ui.waiting).toBe(false);
    expect(ui.sel).toBe(card);
    expect(session.view).toBe(view);
    expect(tableView().hand).toContain(card);
    expect(app.innerHTML).toBe(page);
  });

  it('stays locked on a second action when late news comes about the first', async () => {
    await readyToBid();
    const table = open(),
      real = table.dispatch.bind(table);
    let fail: (r: DispatchResult) => void = () => {};
    const dispatch = vi.spyOn(table, 'dispatch').mockImplementationOnce((action) => {
      void real(action); // the bid goes through and its update is shown, but the answer is held back
      return new Promise((resolve) => {
        fail = resolve;
      });
    });
    click('[data-act="bid"]');
    await vi.advanceTimersByTimeAsync(600);
    expect(tableView().bids[0]).toBe(2);
    expect(ui.waiting).toBe(false);
    await untilMyTurn();

    const v = tableView(),
      card = v.legal.find((id) => v.deck[id].kind !== 'tigress') ?? v.legal[0];
    dispatch.mockImplementation(silent);
    click(`.hand .hslot[data-id="${card}"]`);
    if (v.deck[card].kind === 'tigress') click('[data-act="play"][data-as="pirate"]');
    else click(`.hand .hslot[data-id="${card}"]`);
    expect(ui.waiting).toBe(true);

    fail({ ok: false, code: 'TIMEOUT', message: 'The table did not answer in time.' });
    await vi.advanceTimersByTimeAsync(0);
    expect(ui.waiting).toBe(true);
    expect(ui.sel).toBeNull();
    expect(ui.bidPick).toBeNull();
  });
});

describe('local seats', () => {
  it('a solo game has one, and no curtain', () => {
    mount();
    startSoloGame();
    expect(session.table?.localSeats).toEqual([0]);
    expect(ui.curtain).toBe(false);
    expect(app.querySelector('.curtain')).toBeNull();
    expect(app.querySelector('.human-tag')).toBeNull();
  });

  it('pass-and-play has one per human, and hands the device from each to the next', async () => {
    mount();
    click('[data-act="setup"]');
    click('[data-act="crewKind"][data-i="1"][data-v="human"]');
    click('[data-act="format"][data-v="brawl"]');
    click('[data-act="start"]');
    expect(session.table?.localSeats).toEqual([0, 1]);
    expect(app.querySelector('.curtain h1')?.textContent).toBe('Pass to You');

    click('[data-act="reveal"]');
    expect(tableView().me).toBe(0);
    expect(app.querySelector('.hand.hidden')).toBeNull();
    expect(all('.seat .human-tag')).toHaveLength(1); // the other human at the table
    key('#bid', '1');
    click('[data-act="bid"]');

    // Seat 0 has bid, seat 1 has not: the curtain comes down and the screen now belongs to seat 1.
    expect(ui.seat).toBe(1);
    expect(app.querySelector('.curtain h1')?.textContent).toBe('Pass to Anne');
    click('[data-act="reveal"]');
    expect(tableView().me).toBe(1);
    expect(app.querySelector('.mebar .pname')?.textContent).toContain('Anne');
    expect(all('.hand .hslot')).toHaveLength(6);
    expect(app.querySelector('.bidsheet')).not.toBeNull();
    key('#bid', '0');
    click('[data-act="bid"]');
    await vi.advanceTimersByTimeAsync(4000); // the two bots bid, the bids are revealed
    expect(tableView().phase).not.toBe('bidding');
    expect(tableView().bids.slice(0, 2)).toEqual([1, 0]);
  });

  it('do not include a human who plays somewhere else: that seat is never looked through', async () => {
    mount();
    const seats = [
      { name: 'You', color: '#1cb0f6', bot: false },
      { name: 'Remy', color: '#ff9600', bot: false },
      { name: 'Anne', color: '#ce82ff', bot: true },
    ];
    let state: GameState = Engine.create({ seats, format: 'brawl', seed: 5 });
    const subs = new Set<TableListener>(),
      asked = new Set<Seat>();
    const viewOf =
      (s: GameState) =>
      (seat: Seat): ReturnType<Table['view']> => {
        asked.add(seat);
        return Engine.view(s, seat);
      };
    /** Seat 0 is here. Seat 1 is a person too, but not on this device. Nothing moves unless the test moves it. */
    const table: Table = {
      localSeats: [0],
      view: (seat) => viewOf(state)(seat),
      dispatch(action) {
        const r = Engine.reduce(state, action);
        if (r.error) return Promise.resolve({ ok: false, code: 'REJECTED', message: r.error });
        state = r.state;
        subs.forEach((fn) => fn(r.events, viewOf(r.state)));
        return Promise.resolve({ ok: true });
      },
      subscribe(fn) {
        subs.add(fn);
        return () => subs.delete(fn);
      },
      schedule: () => {},
      stop: () => {},
    };
    showTable(table);
    go('game');
    expect(app.querySelector('.curtain')).toBeNull();
    expect(app.querySelector('.human-tag')).toBeNull();

    // The local seat bids. Remy has not: the screen stays with seat 0 and waits.
    key('#bid', '1');
    click('[data-act="bid"]');
    await vi.advanceTimersByTimeAsync(0);
    expect(ui.seat).toBe(0);
    expect(ui.curtain).toBe(false);
    expect(app.querySelector('.actions')?.textContent).toBe('You bid 1 · waiting for the crew');
    expect(app.querySelector('.hand.hidden')).toBeNull();

    // The others bid from wherever they are, and the cards go round until it is Remy's turn.
    await table.dispatch({ type: 'bid', seat: 1, bid: 0 });
    await table.dispatch({ type: 'bid', seat: 2, bid: 0 });
    while (state.phase === 'playing' && state.turn != null && state.turn !== 1)
      await table.dispatch({ type: 'play', seat: state.turn, ...Bots.play(state, state.turn) });
    await vi.advanceTimersByTimeAsync(1000);
    expect([state.phase, state.turn]).toEqual(['playing', 1]);

    expect(ui.seat).toBe(0);
    expect(tableView().me).toBe(0);
    expect(app.querySelector('.curtain')).toBeNull();
    expect(app.querySelector('.hand.hidden')).toBeNull();
    expect(app.querySelector('.hand.myturn')).toBeNull();
    expect(app.querySelector('.status')?.textContent).toBe('Remy is thinking…');
    expect([...asked]).toEqual([0]);
  });
});
