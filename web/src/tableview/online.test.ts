// @vitest-environment jsdom
/* The renderer at an online table: the same table the offline modes use, with somebody else running
   the game. The table here is held by the test: nothing moves unless the test moves it, and the
   test says what each update is, as RemoteTable would (see table.ts, UpdateInfo). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { Bots, Engine } from '../game';
import type { Action, GameState, OnlineInfo, TableView } from '../game';
import type { GameEvent, Seat } from '../protocol/generated';
import type { DispatchResult, Table, TableListener, UpdateInfo } from '../table/table';
import { closeOnlineTable, mountTavern, openOnlineTable } from './index';
import { session, stats, tableView, ui } from './state';
import { Store } from './store';

const ANSWER: UpdateInfo = { unlock: true, last: false };
const OTHERS: UpdateInfo = { unlock: false, last: false };

let app: HTMLDivElement;
let unmount: (() => void) | null = null;
let state: GameState;
/** What the server says about the table itself. The test sets it; every view from then on carries it. */
let online: OnlineInfo | undefined;
let subs: Set<TableListener>;
/** What the local seat sent, in order. Nothing is applied until the test says so. */
let sent: Action[];
let leave: ReturnType<typeof vi.fn<() => Promise<DispatchResult>>>;
let exit: ReturnType<typeof vi.fn<() => void>>;
let record: ReturnType<typeof vi.fn<() => void>>;

function click(selector: string): void {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`Nothing to click: ${selector}`);
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}
const text = (selector: string): string | undefined => app.querySelector(selector)?.textContent ?? undefined;
const settle = (ms = 0): Promise<void> => vi.advanceTimersByTimeAsync(ms).then(() => {});

/** The views of one moment: the engine's, with what the server says about the table. */
function views(): (seat: Seat) => TableView {
  const snap = state,
    info = online;
  return (seat) => ({ ...Engine.view(snap, seat), online: info });
}
/** The server takes a step: the state moves on and the table says what happened, and what kind of update it is. */
function step(action: Action, info: UpdateInfo, extra: GameEvent[] = []): void {
  const r = Engine.reduce(state, action);
  if (r.error != null) throw new Error(r.error);
  state = r.state;
  const getView = views();
  subs.forEach((fn) => fn([...r.events, ...extra], getView, info));
}
/** A step that moves no card: somebody's connection, somebody's "ready". */
function tell(about: OnlineInfo, info: UpdateInfo, events: GameEvent[] = []): void {
  online = about;
  const getView = views();
  subs.forEach((fn) => fn(events, getView, info));
}
const present = (status: OnlineInfo['status'] = ['online', 'online', 'bot']): OnlineInfo => ({
  status,
  ready: [false, false, false],
  deadline: null,
});
/** The move the seat whose turn it is would make, if it were a bot. */
function nextMove(): Action {
  const s = state;
  if (s.phase === 'bidding') {
    const seat = s.bids.findIndex((b) => b == null);
    return { type: 'bid', seat, bid: Bots.bid(s, seat) };
  }
  if (s.phase === 'playing' && s.turn != null) return { type: 'play', seat: s.turn, ...Bots.play(s, s.turn) };
  return { type: 'advance' };
}

/** Seat 0 is this device's. Seats 1 and 2 are played from somewhere else. */
function openTable(): void {
  state = Engine.create({
    seats: [
      { name: 'You', color: '#1cb0f6', bot: false },
      { name: '<b>Remy</b>', color: '#ff9600', bot: false },
      { name: 'Anne', color: '#ce82ff', bot: true },
    ],
    format: 'swift',
    seed: 9,
  });
  const table: Table = {
    localSeats: [0],
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
  openOnlineTable(table, { leave, exit, now: () => Date.now(), ranked: false, result: () => null, record });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockImplementation(() => 0.42);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }));
  vi.stubGlobal('scrollTo', () => {});
  localStorage.clear();
  document.body.innerHTML = '<div id="root"><div id="app"></div><canvas id="fx" hidden></canvas></div>';
  app = document.querySelector<HTMLDivElement>('#app') ?? document.createElement('div');
  const fx = document.querySelector<HTMLCanvasElement>('#fx') ?? document.createElement('canvas');
  subs = new Set();
  online = undefined;
  sent = [];
  leave = vi.fn<() => Promise<DispatchResult>>().mockResolvedValue({ ok: true });
  exit = vi.fn<() => void>();
  record = vi.fn<() => void>();
  unmount = mountTavern(app, fx);
});

afterEach(() => {
  unmount?.();
  unmount = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('an online table', () => {
  it('opens on the game screen through the one local seat, with the other names escaped', () => {
    openTable();
    expect(ui.screen).toBe('game');
    expect(tableView().me).toBe(0);
    expect(app.querySelector('.curtain')).toBeNull();
    expect(app.querySelectorAll('.hand .hslot')).toHaveLength(5);
    expect(app.querySelectorAll('.seat .sname')[0].textContent).toBe('<b>Remy</b>');
    expect(app.querySelector('.seat b')).toBeNull();
    expect(app.querySelector('.g-top [data-act="home"]')?.getAttribute('aria-label')).toBe('Leave table');
  });

  it('stays locked through the steps of other seats and unlocks with the update that answers its own action', async () => {
    openTable();
    document
      .querySelector('#bid')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true, cancelable: true }));
    click('[data-act="bid"]');
    expect(sent).toEqual([{ type: 'bid', seat: 0, bid: 2 }]);
    expect(ui.waiting).toBe(true);
    expect(text('.actions')).toBe('Locked in');
    // Nothing was drawn from the action itself: the bid is not on the table yet.
    expect(tableView().bids[0]).toBeNull();

    // Remy bids before the server gets to ours. That is shown, and the lock holds.
    step({ type: 'bid', seat: 1, bid: 1 }, OTHERS);
    await settle();
    expect(tableView().bids).toEqual([null, -1, null]);
    expect(ui.waiting).toBe(true);
    expect(text('.actions')).toBe('Locked in');
    click('.hand .hslot'); // and a tap still picks nothing
    expect(ui.sel).toBeNull();

    // Our own step, marked as the answer.
    step({ type: 'bid', seat: 0, bid: 2 }, ANSWER);
    await settle();
    expect(ui.waiting).toBe(false);
    expect(text('.actions')).toBe('You bid 2 · waiting for the crew');
  });

  it('asks before leaving, leaves through the hook, and comes down when the last update has been shown', async () => {
    openTable();
    click('.g-top [data-act="home"]');
    expect(ui.screen).toBe('game');
    expect(text('.sheet h2')).toBe('Leave the table?');
    click('.sheet [data-act="closeSheet"]');
    expect(app.querySelector('.sheet')).toBeNull();
    expect(leave).not.toHaveBeenCalled();

    click('.g-top [data-act="home"]');
    click('[data-act="leaveTable"]');
    expect(leave).toHaveBeenCalledTimes(1);
    expect(app.querySelector('.sheet')).toBeNull();
    expect(ui.waiting).toBe(true);
    await settle();
    expect(exit).not.toHaveBeenCalled(); // the leave was accepted: its update is still to come

    step({ type: 'bid', seat: 1, bid: 0 }, { unlock: true, last: true });
    await settle();
    expect(exit).toHaveBeenCalledTimes(1);
    // The page around the renderer answers by taking the table away.
    closeOnlineTable();
    expect(ui.screen).toBe('home');
    expect(session.table).toBeNull();
    expect(session.online).toBeNull();
    expect(ui.waiting).toBe(false);
    expect(app.querySelector('.home')).not.toBeNull();
    // Whatever the old table still says is no longer shown.
    step({ type: 'bid', seat: 2, bid: 0 }, OTHERS);
    await settle();
    expect(ui.screen).toBe('home');
  });

  it('goes back to the online screens when the leave could not be made', async () => {
    leave.mockResolvedValue({ ok: false, code: 'OFFLINE', message: 'Not connected to the server.' });
    openTable();
    click('.g-top [data-act="home"]');
    click('[data-act="leaveTable"]');
    await settle();
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('ends on the final scores without touching the offline stats or the saved offline game', async () => {
    const saved = Engine.create({
      seats: [
        { name: 'Solo', color: '#1cb0f6', bot: false },
        { name: 'Anne', color: '#ff9600', bot: true },
      ],
      seed: 3,
    });
    Store.saveGame(saved);
    openTable();
    for (let i = 0; i < 400 && state.phase !== 'gameOver'; i++) {
      step(nextMove(), OTHERS);
      await settle(20);
    }
    await settle(5000);
    expect(state.phase).toBe('gameOver');
    expect(ui.screen).toBe('end');
    expect(stats.games).toBe(0);
    expect(localStorage.getItem(Store.STATS)).toBeNull();
    expect(Store.loadGame()).toEqual(saved);

    // Two buttons, side by side: the record is the page's to show, and the way on is back to the
    // lobby, where the next game starts.
    expect(Array.from(app.querySelectorAll('.end-actions.online button'), (b) => b.textContent)).toEqual([
      'Play again',
      'The record',
    ]);
    click('[data-act="record"]');
    expect(record).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();
    click('[data-act="again"]');
    expect(exit).toHaveBeenCalledTimes(1);
    click('.end-top [data-act="home"]');
    expect(exit).toHaveBeenCalledTimes(2);
    expect(app.querySelector('.sheet')).toBeNull(); // nothing to ask: the game is over
  });
});

describe('the clock of an online table', () => {
  const NOW = 1_700_000_000_000;
  const ringOf = (el: Element | null): Record<string, string> =>
    Object.fromEntries(
      (el?.getAttribute('style') ?? '')
        .split(';')
        .filter(Boolean)
        .map((pair) => pair.split(':')),
    );

  it('draws a ring on every seat the deadline names, from what is left of the clock right now', async () => {
    vi.setSystemTime(NOW);
    online = { ...present(), deadline: { kind: 'bid', seats: [0, 1], at: NOW + 30_000, total: 45_000 } };
    openTable();
    // Remy and this seat are on the clock. Anne is a bot: nobody waits for her.
    const seats = Array.from(app.querySelectorAll('.seat'));
    expect(seats.map((s) => s.querySelector('.ring') != null)).toEqual([true, false]);
    expect(app.querySelector('.mebar .ring')).not.toBeNull();
    // A third of the clock is gone, 30 seconds are left, and the last five of them are red.
    expect(ringOf(app.querySelector('.mebar .ring'))).toEqual({
      '--gone': '33.3',
      '--left': '30000ms',
      '--calm': '25000ms',
      '--ticks': '30',
    });
    expect(app.querySelector('.ring-left.hurry')).toBeNull();
    expect(app.querySelector('.ring')?.getAttribute('aria-hidden')).toBe('true');

    // Remy bids: the same clock runs on for this seat alone, 26 seconds later.
    vi.setSystemTime(NOW + 26_000);
    online = { ...present(), deadline: { kind: 'bid', seats: [0], at: NOW + 30_000, total: 45_000 } };
    step({ type: 'bid', seat: 1, bid: 1 }, OTHERS);
    await settle();
    expect(app.querySelectorAll('.seat .ring')).toHaveLength(0);
    expect(ringOf(app.querySelector('.mebar .ring'))).toEqual({
      '--gone': '91.1',
      '--left': '4000ms',
      '--calm': '0ms',
      '--ticks': '4',
    });
    expect(app.querySelector('.mebar .ring-left.hurry')).not.toBeNull();

    // Past the deadline the ring is empty and stays: the move is the server's to make.
    vi.setSystemTime(NOW + 31_000);
    step({ type: 'bid', seat: 2, bid: 0 }, OTHERS);
    await settle();
    expect(ringOf(app.querySelector('.mebar .ring'))).toMatchObject({ '--gone': '100.0', '--left': '0ms' });
    expect(tableView().bids[0]).toBeNull();
    expect(sent).toEqual([]);
  });

  it('says so when the server played for a seat whose time ran out', async () => {
    openTable();
    online = present();
    step({ type: 'bid', seat: 1, bid: 1 }, OTHERS, [{ type: 'timedOut', seat: 1 }]);
    await settle();
    expect(text('.felt .pill.gold')).toBe('<b>Remy</b> ran out of time');
    expect(app.querySelector('.felt .pill.gold b')).toBeNull();
    step({ type: 'bid', seat: 0, bid: 1 }, OTHERS, [{ type: 'timedOut', seat: 0 }]);
    await settle();
    expect(text('.felt .pill.gold')).toBe('Time ran out · the table played for you');
  });

  it('has no ring, no tag and no note at a table that is not online', () => {
    openTable();
    expect(app.querySelector('.ring, .presence, .sheet-note')).toBeNull();
    expect(app.querySelector('.seat.gone')).toBeNull();
  });
});

describe('who is at an online table', () => {
  it('tags a seat whose player is offline, away, out, or replaced by a bot, and says whom the table waits for', async () => {
    online = present();
    openTable();
    expect(app.querySelector('.presence')).toBeNull();

    tell(present(['online', 'offline', 'bot']), OTHERS, [{ type: 'seatStatus', seat: 1, status: 'offline' }]);
    await settle();
    const remy = (): Element => app.querySelectorAll('.seat')[0];
    expect(remy().querySelector('.presence.off')?.textContent).toBe('Offline');
    expect(remy().classList.contains('gone')).toBe(true);
    // Anne has been a bot from the start: that is not news.
    expect(app.querySelectorAll('.seat')[1].querySelector('.presence')).toBeNull();

    // The cards go round until it is Remy's turn.
    step({ type: 'bid', seat: 0, bid: 1 }, ANSWER);
    step({ type: 'bid', seat: 1, bid: 0 }, OTHERS);
    step({ type: 'bid', seat: 2, bid: 0 }, OTHERS);
    while (state.phase !== 'gameOver' && !(state.phase === 'playing' && state.turn === 1)) step(nextMove(), OTHERS);
    await settle(1000);
    expect(text('.status')).toBe('<b>Remy</b> is offline…');

    tell(present(['online', 'away', 'bot']), OTHERS, [{ type: 'seatStatus', seat: 1, status: 'away' }]);
    await settle();
    expect(remy().querySelector('.presence.away')?.textContent).toBe('Away');
    expect(remy().classList.contains('gone')).toBe(false);
    expect(text('.status')).toBe('<b>Remy</b> is away…');

    // Two turns missed while offline: the seat is closed. The name stays, and the table plays it.
    tell(present(['online', 'out', 'bot']), OTHERS, [{ type: 'seatStatus', seat: 1, status: 'out' }]);
    await settle();
    expect(remy().querySelector('.presence.out')?.textContent).toBe('Out');
    expect(remy().classList.contains('gone')).toBe(true);
    expect(remy().querySelector('.sname')?.textContent).toBe('<b>Remy</b>');
    expect(remy().querySelector('.ring')).toBeNull();
    expect(text('.status')).toBe('The table plays for <b>Remy</b>…');
    expect(app.querySelector('.status b')).toBeNull();

    tell(present(['online', 'bot', 'bot']), OTHERS, [{ type: 'seatStatus', seat: 1, status: 'bot' }]);
    await settle();
    expect(remy().querySelector('.presence.bot')?.textContent).toBe('Bot');
    expect(remy().classList.contains('gone')).toBe(true);
    expect(text('.status')).toBe('<b>Remy</b> is thinking…');

    tell(present(), OTHERS, [{ type: 'seatStatus', seat: 1, status: 'online' }]);
    await settle();
    expect(app.querySelector('.presence')).toBeNull();
  });

  it('waits after "ready" until the others are, and shows who is', async () => {
    online = present();
    openTable();
    for (let i = 0; i < 100 && state.phase !== 'roundEnd'; i++) {
      step(nextMove(), OTHERS);
      await settle(20);
    }
    await settle(3000);
    expect(state.phase).toBe('roundEnd');
    // The results came up by themselves, with what happens next.
    expect(text('.sheet .sheet-note')).toBe('The next round starts when everyone is ready, or on its own.');
    click('[data-act="next"]');
    expect(sent).toEqual([{ type: 'advance' }]);
    expect(app.querySelector('.sheet')).toBeNull();
    expect(text('.actions')).toBe('Locked in');

    // The server's answer: this seat is ready, Remy is not. The round does not start yet.
    tell({ ...present(), ready: [true, false, false] }, ANSWER);
    await settle();
    expect(state.phase).toBe('roundEnd');
    expect(text('.actions')).toBe('Ready · waiting for 1 more');
    expect(app.querySelector<HTMLButtonElement>('.actions button')?.disabled).toBe(true);
    expect(text('.mebar .ready')).toBe('Ready');
    expect(app.querySelectorAll('.seat .ready')).toHaveLength(0);

    // A player who is not connected is not waited for, and neither is one whose seat is closed.
    tell({ ...present(['online', 'offline', 'bot']), ready: [true, false, false] }, OTHERS);
    await settle();
    expect(text('.actions')).toBe('Ready · next round is coming');
    tell({ ...present(['online', 'out', 'bot']), ready: [true, false, false] }, OTHERS);
    await settle();
    expect(text('.actions')).toBe('Ready · next round is coming');

    tell({ ...present(), ready: [true, true, false] }, OTHERS);
    await settle();
    expect(text('.actions')).toBe('Ready · next round is coming');
    expect(app.querySelectorAll('.seat .ready')).toHaveLength(1);

    // The advance is the server's step. The new round deals, and nobody is ready for the one after.
    online = present();
    step({ type: 'advance' }, OTHERS);
    await settle();
    expect(tableView()).toMatchObject({ phase: 'bidding', round: 1 });
    expect(app.querySelector('.bidsheet')).not.toBeNull();
  });
});

describe('the home screen', () => {
  it('offers online play next to the offline game and hands over to the page around it', () => {
    unmount?.();
    const online = vi.fn<() => void>();
    const fx = document.querySelector<HTMLCanvasElement>('#fx') ?? document.createElement('canvas');
    unmount = mountTavern(app, fx, { online });
    expect(Array.from(app.querySelectorAll('.play-row button'), (b) => b.textContent)).toEqual(['Play', 'Play online']);
    click('[data-act="online"]');
    expect(online).toHaveBeenCalledTimes(1);
    expect(ui.screen).toBe('home');
  });
});
