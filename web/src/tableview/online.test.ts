// @vitest-environment jsdom
/* The renderer at an online table: the same table the offline modes use, with somebody else running
   the game. The table here is held by the test: nothing moves unless the test moves it, and the
   test says what each update is, as RemoteTable would (see table.ts, UpdateInfo). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { Bots, Engine } from '../game';
import type { Action, GameState } from '../game';
import type { Seat } from '../protocol/generated';
import type { DispatchResult, Table, TableListener, UpdateInfo } from '../table/table';
import { closeOnlineTable, mountTavern, openOnlineTable } from './index';
import { session, stats, tableView, ui } from './state';
import { Store } from './store';

const ANSWER: UpdateInfo = { unlock: true, last: false };
const OTHERS: UpdateInfo = { unlock: false, last: false };

let app: HTMLDivElement;
let unmount: (() => void) | null = null;
let state: GameState;
let subs: Set<TableListener>;
/** What the local seat sent, in order. Nothing is applied until the test says so. */
let sent: Action[];
let leave: ReturnType<typeof vi.fn<() => Promise<DispatchResult>>>;
let exit: ReturnType<typeof vi.fn<() => void>>;

function click(selector: string): void {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`Nothing to click: ${selector}`);
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}
const text = (selector: string): string | undefined => app.querySelector(selector)?.textContent ?? undefined;
const settle = (ms = 0): Promise<void> => vi.advanceTimersByTimeAsync(ms).then(() => {});

/** The server takes a step: the state moves on and the table says what happened, and what kind of update it is. */
function step(action: Action, info: UpdateInfo): void {
  const r = Engine.reduce(state, action);
  if (r.error != null) throw new Error(r.error);
  state = r.state;
  const snap = r.state;
  subs.forEach((fn) => fn(r.events, (seat) => Engine.view(snap, seat), info));
}
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
    view: (seat: Seat) => Engine.view(state, seat),
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
  openOnlineTable(table, { leave, exit, ranked: false, result: () => null });
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
  sent = [];
  leave = vi.fn<() => Promise<DispatchResult>>().mockResolvedValue({ ok: true });
  exit = vi.fn<() => void>();
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

    // One way on from here: back to the lobby, where the next game starts.
    expect(Array.from(app.querySelectorAll('.end-actions button'), (b) => b.textContent)).toEqual(['Play again']);
    click('[data-act="again"]');
    expect(exit).toHaveBeenCalledTimes(1);
    click('.end-top [data-act="home"]');
    expect(exit).toHaveBeenCalledTimes(2);
    expect(app.querySelector('.sheet')).toBeNull(); // nothing to ask: the game is over
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
