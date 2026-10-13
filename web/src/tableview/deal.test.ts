// @vitest-environment jsdom
/* The deal as the table shows it: a stack that is riffled and dealt clockwise when a round starts,
   and only then. The table is held by the test, as in online.test.ts: nothing moves unless the
   test moves it. jsdom lays nothing out and animates nothing, so every element is given a box
   here and `animate` is a stand-in that writes down what was asked of it. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { Bots, Engine } from '../game';
import type { Action, GameState, TableView } from '../game';
import type { GameEvent, Seat } from '../protocol/generated';
import type { Table, TableListener, UpdateInfo } from '../table/table';
import { showTable } from './actions';
import { dealGap, dealOrder, dealing, FLIGHT_MS, pileSize, SHUFFLE_MS } from './deal';
import { closeOnlineTable, mountTavern, openOnlineTable } from './index';
import { go } from './render';
import { patchUi, tableView, ui } from './state';
import { sortHand } from './views';

const ANSWER: UpdateInfo = { unlock: true, last: false };
const OTHERS: UpdateInfo = { unlock: false, last: false };

let app: HTMLDivElement;
let unmount: (() => void) | null = null;
let state: GameState;
let subs: Set<TableListener>;
let sent: Action[];
/** What `prefers-reduced-motion` answers right now. */
let still: boolean;
/** The seat of every card that left the stack, in order, and every other element that was animated. */
let flights: Seat[];
let turned: Element[];

const all = (selector: string): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>(selector));
function click(selector: string): void {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`Nothing to click: ${selector}`);
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}
const settle = (ms = 0): Promise<void> => vi.advanceTimersByTimeAsync(ms).then(() => {});
const views =
  (snap: GameState = state) =>
  (seat: Seat): TableView =>
    Engine.view(snap, seat);
/** Whoever runs the game takes a step, and the table says what happened. */
function step(action: Action, info: UpdateInfo = OTHERS): GameEvent[] {
  const r = Engine.reduce(state, action);
  if (r.error != null) throw new Error(r.error);
  state = r.state;
  const getView = views();
  subs.forEach((fn) => fn(r.events, getView, info));
  return r.events;
}
/** A snapshot: the table as it stands, with nothing having happened (a reconnect). */
function resync(): void {
  const getView = views();
  subs.forEach((fn) => fn([], getView, ANSWER));
}
function nextMove(): Action {
  const s = state;
  if (s.phase === 'bidding') {
    const seat = s.bids.findIndex((b) => b == null);
    return { type: 'bid', seat, bid: Bots.bid(s, seat) };
  }
  if (s.phase === 'playing' && s.turn != null) return { type: 'play', seat: s.turn, ...Bots.play(s, s.turn) };
  return { type: 'advance' };
}
/** A table of four, one card in the first round and two in the second. `local` are this device's seats. */
function held(local: Seat[]): Table {
  state = Engine.create({
    seats: [
      { name: 'You', color: '#1cb0f6', bot: false },
      { name: 'Remy', color: '#ff9600', bot: local.includes(1) ? false : true },
      { name: 'Anne', color: '#ce82ff', bot: true },
      { name: 'Kidd', color: '#58cc02', bot: true },
    ],
    format: 'classic',
    seed: 9,
  });
  return {
    localSeats: local,
    view: (seat: Seat) => views()(seat),
    dispatch(action) {
      sent.push(action);
      return Promise.resolve({ ok: true });
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    schedule: () => {},
    stop: () => {},
  };
}
/** An online table through seat 0. `dealt` is what the page says about it: the game began just now, or not. */
function openOnline(dealt?: boolean): void {
  openOnlineTable(held([0]), {
    leave: () => Promise.resolve({ ok: true }),
    exit: () => {},
    now: () => Date.now(),
    ranked: false,
    solo: false,
    dealt,
    result: () => null,
    record: () => {},
  });
}
/** Play the first round out with nothing moving, up to its results: the next step starts round two. */
async function toRoundEnd(): Promise<void> {
  still = true;
  for (let i = 0; i < 40 && state.phase !== 'roundEnd'; i++) {
    step(nextMove());
    await settle(2000);
  }
  expect(state.phase).toBe('roundEnd');
  still = false;
}
/** Start round two: the one `roundStarted` of these tests. */
function startRoundTwo(): void {
  flights = [];
  expect(step({ type: 'advance' }).map((e) => e.type)).toContain('roundStarted');
}
/** The time at which the last card of a deal of `n` flights is down, and a little more. */
const dealt = (n: number): number => SHUFFLE_MS + n * dealGap(n) + FLIGHT_MS + 1000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockImplementation(() => 0.42);
  still = false;
  flights = [];
  turned = [];
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: still, media: query }));
  vi.stubGlobal('scrollTo', () => {});
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => new DOMRect(20, 30, 40, 56));
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value(this: HTMLElement) {
      if (this.className === 'dealfly') flights.push(Number(this.dataset.seat));
      else turned.push(this);
      return { finished: Promise.resolve() };
    },
  });
  localStorage.clear();
  document.body.innerHTML = '<div id="root"><div id="app"></div><canvas id="fx" hidden></canvas></div>';
  app = document.querySelector<HTMLDivElement>('#app') ?? document.createElement('div');
  const fx = document.querySelector<HTMLCanvasElement>('#fx') ?? document.createElement('canvas');
  subs = new Set();
  sent = [];
  unmount = mountTavern(app, fx);
});

afterEach(() => {
  closeOnlineTable();
  unmount?.();
  unmount = null;
  Reflect.deleteProperty(Element.prototype, 'animate');
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the order and the pace of a deal', () => {
  it('goes clockwise by seat, starting after the dealer, one lap per card', () => {
    expect(dealOrder(3, 4, 2)).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
    expect(dealOrder(0, 3, 2)).toEqual([1, 2, 0, 1, 2, 0]);
    expect(dealOrder(1, 2, 1)).toEqual([0, 1]);
  });
  it('launches slowly when few cards are dealt and stays under two seconds for a full table', () => {
    expect(dealGap(4)).toBe(90);
    expect(dealGap(40)).toBe(40);
    expect(dealGap(80)).toBe(28);
    expect(79 * dealGap(80)).toBeLessThan(2300);
  });
});

describe('a round that starts', () => {
  it('is dealt from the stack, clockwise from the seat after the dealer, and the hand ends as the sorted hand', async () => {
    openOnline();
    await toRoundEnd();
    startRoundTwo();
    const v = tableView(),
      n = v.seats.length,
      order = dealOrder(v.dealer, n, v.cards);
    expect(v.round).toBe(1);
    expect(dealing()).toBe(true);

    // The riffle: the whole deck is one short stack, no card is out yet, and the felt's words wait.
    expect(app.querySelector<HTMLElement>('.pile')?.dataset.deal).toBe('shuffle');
    expect(app.querySelector('.pile .cnt')?.textContent).toBe(String(v.deck.length));
    expect(app.querySelectorAll('.pile .card')).toHaveLength(3);
    expect(all('.hand .hslot').map((s) => s.dataset.deal)).toEqual(Array.from({ length: v.cards }, () => 'wait'));
    expect(app.querySelector('.trick .empty')?.hasAttribute('data-deal')).toBe(true);
    expect(flights).toEqual([]);

    // The first card goes to the seat after the dealer, and lands face down.
    await settle(SHUFFLE_MS);
    expect(flights[0]).toBe((v.dealer + 1) % n);
    expect(app.querySelector<HTMLElement>('.pile')?.dataset.deal).toBe('deal');
    await settle(order.indexOf(v.me) * dealGap(order.length) + FLIGHT_MS + 40);
    const first = all('.hand .hslot')[0];
    expect(first.dataset.deal).toBe('down');
    expect(first.querySelector('.cover')).not.toBeNull();
    // Never one element per card of the deck: only the cards in the air.
    expect(all('.dealfly').length).toBeLessThanOrEqual(order.length);

    await settle(dealt(order.length));
    expect(flights).toEqual(order);
    expect(dealing()).toBe(false);
    expect(all('.dealfly')).toEqual([]);
    expect(all('[data-deal], .cover')).toEqual([]);
    // The hand turned face up, each card once, into the order the screen shows it in.
    expect(turned.filter((el) => el.className === 'hc')).toHaveLength(v.cards);
    expect(all('.hand .hslot').map((s) => Number(s.dataset.id))).toEqual(sortHand(v.hand, v.deck));
    // What is left lies on the felt with its count, and every other seat has its hand as a count.
    expect(app.querySelector('.pile .cnt')?.textContent).toBe(String(pileSize(v)));
    expect(pileSize(v)).toBe(v.deck.length - n * v.cards);
    expect(all('.spile').map((s) => [Number(s.dataset.seat), s.textContent])).toEqual(
      [1, 2, 3].map((seat) => [seat, String(v.handCounts[seat])]),
    );
    expect(app.querySelector('.trick .empty')?.textContent).toBe('Cards are dealt.Place your bids.');
  });

  it('takes a bid while the cards are still in the air', async () => {
    openOnline();
    await toRoundEnd();
    startRoundTwo();
    await settle(SHUFFLE_MS + 100);
    expect(dealing()).toBe(true);
    const slider = app.querySelector<HTMLElement>('#bid');
    expect(slider).not.toBeNull();
    slider?.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
    expect(app.querySelector<HTMLButtonElement>('[data-act="bid"]')?.disabled).toBe(false);
    click('[data-act="bid"]');
    expect(sent).toEqual([{ type: 'bid', seat: 0, bid: 1 }]);
  });

  it('moves nothing with reduced motion: the hand and the pile are in their places', async () => {
    openOnline();
    await toRoundEnd();
    still = true;
    startRoundTwo();
    const v = tableView();
    expect(dealing()).toBe(false);
    await settle(dealt(v.seats.length * v.cards));
    expect(flights).toEqual([]);
    expect(turned).toEqual([]);
    expect(all('.dealfly, [data-deal], .cover')).toEqual([]);
    expect(all('.hand .hslot').map((s) => Number(s.dataset.id))).toEqual(sortHand(v.hand, v.deck));
    expect(app.querySelector('.pile .cnt')?.textContent).toBe(String(pileSize(v)));
  });
});

describe('an update that is no round start', () => {
  it('does not deal again: a bid during the deal, a bid after it, and a snapshot', async () => {
    openOnline();
    await toRoundEnd();
    startRoundTwo();
    const cards = tableView().seats.length * tableView().cards;
    // Another seat bids while the cards fly: the table is redrawn, and the deal goes on where it was.
    await settle(SHUFFLE_MS + 150);
    const before = flights.length;
    expect(before).toBeGreaterThan(0);
    step({ type: 'bid', seat: 1, bid: 0 });
    expect(dealing()).toBe(true);
    expect(app.querySelector<HTMLElement>('.pile')?.dataset.deal).toBe('deal');
    expect(flights).toHaveLength(before);
    await settle(dealt(cards));
    expect(flights).toHaveLength(cards);

    // Afterwards: a bid, then the server's snapshot after a reconnect.
    step({ type: 'bid', seat: 2, bid: 0 });
    await settle(3000);
    resync();
    await settle(3000);
    expect(flights).toHaveLength(cards);
    expect(dealing()).toBe(false);
    expect(all('.dealfly, [data-deal]')).toEqual([]);
  });

  it('shows a table that is come back to as it stands, and a game that begins being dealt', async () => {
    openOnline(false);
    await settle(4000);
    expect(flights).toEqual([]);
    expect(all('[data-deal]')).toEqual([]);
    expect(all('.hand .hslot[data-key]')).toHaveLength(1);
    closeOnlineTable();

    openOnline(true);
    expect(dealing()).toBe(true);
    await settle(dealt(4));
    expect(flights).toEqual(dealOrder(tableView().dealer, 4, 1));
  });
});

describe('the Smuggler', () => {
  it('is seen by the rest of the table as backs going from the pile to that seat, and nothing else', async () => {
    openOnline();
    await settle(100);
    flights = [];
    const getView = views();
    subs.forEach((fn) => fn([{ type: 'abilityUsed', seat: 2, kind: 'smuggler', count: 2 }], getView, OTHERS));
    await settle(1000);
    expect(flights).toEqual([2, 2]);
    expect(all('.dealfly')).toEqual([]);
    expect(dealing()).toBe(false);
    // The count on the pile is what it was: as many cards went back as came out.
    expect(app.querySelector('.pile .cnt')?.textContent).toBe(String(pileSize(tableView())));
  });
});

describe('pass-and-play', () => {
  /** Two people on one device, as the offline game opens it: the first round is dealt just now. */
  function openShared(): void {
    showTable(held([0, 1]));
    patchUi({ deal: true });
    go('game');
  }

  it('deals nothing under the curtain: the hand is simply there when it opens', async () => {
    openShared();
    expect(ui.curtain).toBe(true);
    expect(dealing()).toBe(false);
    await settle(4000);
    click('[data-act="reveal"]');
    await settle(4000);
    expect(flights).toEqual([]);
    expect(turned.filter((el) => el.className === 'hc')).toEqual([]);
    expect(all('.dealfly, [data-deal], .cover')).toEqual([]);
    expect(all('.hand .hslot[data-key]')).toHaveLength(1);
  });

  it('stops the deal when the device changes hands, and never turns the next hand up by itself', async () => {
    openShared();
    click('[data-act="reveal"]');
    await toRoundEnd();
    // Whoever played last has the device, and looks at the results.
    if (ui.curtain) click('[data-act="reveal"]');
    startRoundTwo();
    // The round starts in front of that person: their own hand is dealt to them.
    expect(ui.curtain).toBe(false);
    const first = ui.seat,
      next = first === 0 ? 1 : 0;
    await settle(SHUFFLE_MS + 150);
    expect(dealing()).toBe(true);
    expect(all('.dealfly').length).toBeGreaterThan(0);

    // They bid while cards are in the air, and the curtain goes up for the other person.
    step({ type: 'bid', seat: first, bid: 0 }, ANSWER);
    expect(ui.curtain).toBe(true);
    expect(ui.seat).toBe(next);
    expect(dealing()).toBe(false);
    expect(all('.dealfly')).toEqual([]);
    const flown = flights.length;
    await settle(4000);
    expect(flights).toHaveLength(flown);
    expect(turned.filter((el) => el.className === 'hc')).toEqual([]);
    expect(all('[data-deal], .cover')).toEqual([]);
  });
});
