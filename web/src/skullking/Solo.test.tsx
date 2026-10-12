// @vitest-environment jsdom
/* Solo, on the whole page against the mock server: what the setup sends, what the server's answers
   do, the table of a solo game, a drop, a leave, and the ends. And the same page with a server that
   cannot be reached, where the game runs on the device. */
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { App } from '../App';
import type { Action } from '../game';
import type { Backend } from '../net/api';
import { connectRaw } from '../net/mock/raw';
import { MockServer, STANDARD } from '../net/mock/server';
import type { ServerMessage } from '../net/messages';
import type { Wire } from '../net/socket';
import type { GameSettings, GameUpdate, Me, Welcome } from '../protocol/generated';
import { memoryPlaces } from '../router/places';
import type { MemoryPlaces } from '../router/places';
import { DISPATCH_TIMEOUT_MS } from '../table/table';
import { session, stats, ui } from '../tableview/state';
import { loadChoice, settingsOf } from './Solo';

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GAME_KEY = 'skullking-tavern.game.v2';
const MEMORY_KEY = 'skullking-tavern.online.v1';

let host: HTMLDivElement;
let root: Root | null = null;
let places: MemoryPlaces;
let server: MockServer;
/** The browser the page runs in. */
let page: Backend;
/** Every frame the page wrote to its socket, and every frame it was sent. */
let sent: { t: string; settings?: GameSettings }[];
let heard: ServerMessage[];
/** Changes a frame on its way out, to say what an honest page never would. */
let forge: ((frame: Record<string, unknown>) => Record<string, unknown>) | null;

const $ = (selector: string): HTMLElement | null => document.querySelector<HTMLElement>(selector);
const texts = (selector: string): string[] =>
  Array.from(document.querySelectorAll<HTMLElement>(selector), (el) => el.textContent ?? '');
const settle = (ms = 0): Promise<void> => act(() => vi.advanceTimersByTimeAsync(ms).then(() => {}));
async function click(selector: string): Promise<void> {
  const el = $(selector);
  if (!el) throw new Error(`Nothing to click: ${selector}`);
  if (el instanceof HTMLButtonElement && el.disabled) throw new Error(`${selector} is disabled`);
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);
  });
}
/** A button of the setup, by what it says first: "3", "Hard", "Swift", "Kraken". */
async function choose(label: string): Promise<void> {
  const el = Array.from(document.querySelectorAll<HTMLButtonElement>('.sk-solo-body button')).find(
    (b) => b.firstChild?.textContent === label || b.querySelector('.grow')?.firstChild?.textContent === label,
  );
  if (!el) throw new Error(`The setup has no "${label}"`);
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);
  });
}
/** "Start", as Enter in the form or a tap on the button does. */
async function start(): Promise<void> {
  const form = $('form.sk-solo');
  if (!form) throw new Error('The setup is not on screen');
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);
  });
}
/** The page's backend, with the frames in both directions kept. */
function recording(inner: Backend): Backend {
  return {
    rest: inner.rest,
    transport: async () => {
      const wire = await inner.transport();
      const tapped: Wire = {
        send: (data) => {
          const frame = JSON.parse(data) as Record<string, unknown>,
            out = forge ? forge(frame) : frame;
          sent.push(out as { t: string });
          wire.send(JSON.stringify(out));
        },
        close: () => wire.close(),
        onmessage: null,
        onclose: null,
      };
      wire.onmessage = (data) => {
        if (typeof data === 'string') heard.push(JSON.parse(data) as ServerMessage);
        tapped.onmessage?.(data);
      };
      wire.onclose = (code) => tapped.onclose?.(code);
      return tapped;
    },
  };
}
async function openAt(at: string, backend: Backend = page): Promise<void> {
  places = memoryPlaces(at);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <StrictMode>
        <App backend={backend} places={places} />
      </StrictMode>,
    );
    await vi.advanceTimersByTimeAsync(0);
  });
  await settle();
}
function closePage(): void {
  act(() => root?.unmount());
  root = null;
}
const me = async (): Promise<Me> => (await page.rest('GET', '/me')).body as Me;
const sentOf = (t: string): typeof sent => sent.filter((m) => m.t === t);
const updates = (): GameUpdate[] => heard.filter((m): m is GameUpdate => m.t === 'game.update');
/** What a seat can see of where the game stands: enough to tell whether anything was played. */
const standing = (update: GameUpdate): string =>
  JSON.stringify([update.view.phase, update.view.round, update.view.bids, update.view.trick, update.view.hand]);

/**
 * Play the open table to its end as its one seat: bid nothing, play the first card that may be
 * played, and go on after every round. It is the table that is asked, whoever runs the game.
 */
async function playOut(): Promise<void> {
  for (let i = 0; i < 6000 && ui.screen !== 'end'; i++) {
    await settle(60);
    const table = session.table;
    if (!table || ui.screen !== 'game') continue;
    const view = table.view(0);
    let action: Action | null = null;
    if (view.phase === 'bidding' && view.bids[0] == null) action = { type: 'bid', seat: 0, bid: 0 };
    else if (view.phase === 'playing' && view.turn === 0) {
      const card = view.legal[0];
      action =
        view.deck[card].kind === 'tigress'
          ? { type: 'play', seat: 0, card, as: 'escape' }
          : { type: 'play', seat: 0, card };
    } else if (view.phase === 'roundEnd') action = { type: 'advance' };
    if (action) await act(() => table.dispatch(action).then(() => {}));
  }
  await settle(8000);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockImplementation(seeded(21));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }));
  vi.stubGlobal('scrollTo', () => {});
  localStorage.clear();
  document.body.innerHTML = '<div id="root"></div>';
  host = document.querySelector<HTMLDivElement>('#root') ?? document.createElement('div');
  server = new MockServer({
    random: seeded(4),
    timers: { bidMs: 300, playMs: 200, abilityMs: 200, trickEndMs: 60, roundEndMs: 100 },
    bot: { minMs: 20, maxMs: 40 },
  });
  sent = [];
  heard = [];
  forge = null;
  page = recording(server.browser());
  Object.assign(stats, { games: 0, wins: 0, made: 0, bids: 0, best: null, streak: 0, lastDay: null });
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the solo setup', () => {
  it('asks for a table of the player and their bots, with no pace to choose', () => {
    const choice = loadChoice();
    for (let bots = 1; bots <= 7; bots++) {
      const settings = settingsOf({ ...choice, bots });
      expect(settings.maxPlayers).toBe(bots + 1);
      expect(settings.pace).toBe('standard');
    }
    expect(settingsOf({ ...choice, level: 'hard', scoring: 'rascal', format: 'whirl', kraken: true })).toEqual({
      maxPlayers: choice.bots + 1,
      scoring: 'rascal',
      format: 'whirl',
      abilities: false,
      botLevel: 'hard',
      pace: 'standard',
      loot: false,
      kraken: true,
      whale: false,
    });
  });

  it('is a page of its own, with seven bots to choose from and nothing about a clock', async () => {
    await openAt('/skull-king/solo');
    expect($('.sk-solo h1')?.textContent).toBe('Solo game');
    expect(document.title).toBe('Solo game · Skull King');
    expect($('#app')?.innerHTML).toBe('');
    expect(texts('.sk-solo .label')).toEqual(['Bots', 'Bot skill', 'Scoring', 'Rounds', 'Advanced']);
    expect(texts('.sk-bots .chip')).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(texts('.sk-formats button')).toEqual([
      'Classic10 rounds12345678910',
      'Brawl5 rounds678910',
      'Swift5 rounds55555',
      'Even10 rounds224466881010',
      'Whirl10 rounds9977553311',
    ]);
    expect(texts('.sk-extras .toggle .grow')).toEqual([
      'LootWin a Loot to form an alliance: +20 each if both make their bids.',
      'KrakenSwallows the trick. Nobody wins it.',
      'WhaleSpecial cards stop counting; the highest number wins.',
      'AbilitiesWin a trick with a Pirate to use its power: Helmsman, Smuggler, Gambler, Seer or Giant.',
    ]);
    expect($('.sk-start .btn')?.textContent).toBe('Start');
    expect(texts('.sk-hints p')).toEqual([
      'No clock. Bots play up to your turn and wait.',
      'One game at a time. It stays until you finish it or you leave it. Leaving it does not count.',
      'Saved to your account, so you can pick the game up on any device. Offline, it runs on this device and is not counted in your stats.',
    ]);
    expect($('.sk-solo')?.textContent).not.toMatch(/pace/i);
    // Looking at the setup makes nobody and connects nowhere.
    expect((await page.rest('GET', '/me')).status).toBe(401);
    expect(sent).toEqual([]);
    // Back is Skull King's home.
    await click('.sk-solo [aria-label="Back"]');
    expect(places.path()).toBe('/skull-king');
    expect($('.sk-home')).not.toBeNull();
  });

  it('sends what was chosen: the bots plus the player, the rules, and a standard pace', async () => {
    await openAt('/skull-king/solo');
    await choose('5');
    await choose('Hard');
    await choose('Rascal');
    await choose('Swift');
    await choose('Kraken');
    await choose('Abilities');
    await start();
    await settle(100);
    expect(sentOf('solo.start')).toHaveLength(1);
    expect(sentOf('solo.start')[0].settings).toEqual({
      maxPlayers: 6,
      scoring: 'rascal',
      format: 'swift',
      abilities: true,
      botLevel: 'hard',
      pace: 'standard',
      loot: false,
      kraken: true,
      whale: false,
    });
    // The visitor got a guest on the way, as a connection gives one.
    expect((await me()).guest).toBe(true);
    // The table takes the setup's place: Back from it is not a setup that is done.
    expect(places.entries()).toEqual({ paths: ['/skull-king/table'], at: 0 });
    expect($('.sk-solo')).toBeNull();
    expect(session.table?.view(0).seats.map((seat) => seat.bot)).toEqual([false, true, true, true, true, true]);
    // The setup is remembered on this device for the next game.
    expect(loadChoice()).toMatchObject({ bots: 5, level: 'hard', scoring: 'rascal', format: 'swift', kraken: true });
  });

  it('says what the server said when it refuses the table, and starts no game anywhere', async () => {
    await openAt('/skull-king/solo');
    // Nothing the page offers is refused. This is a table the game does not have.
    forge = (frame) =>
      frame.t === 'solo.start' ? { ...frame, settings: { ...(frame.settings as GameSettings), maxPlayers: 9 } } : frame;
    await start();
    await settle(DISPATCH_TIMEOUT_MS + 1000);
    expect(heard.some((m) => m.t === 'err' && m.code === 'VALIDATION')).toBe(true);
    expect($('.sk-start [role="alert"]')?.textContent).toBeTruthy();
    expect(places.path()).toBe('/skull-king/solo');
    expect($('#app .game')).toBeNull();
    expect(session.table).toBeNull();
    expect(localStorage.getItem(GAME_KEY)).toBeNull();
    // The button is back: the player can choose again.
    expect(($('.sk-start .btn') as HTMLButtonElement).disabled).toBe(false);
  });

  it('goes back to the solo game the server already keeps, and asks for no second one', async () => {
    await openAt('/skull-king/solo');
    await choose('2');
    await start();
    await settle(500);
    const game = session.table && 'gameId' in session.table ? session.table.gameId : null;
    expect(game).not.toBeNull();
    closePage();

    // The same browser on a device that remembers no seat: the setup, and "Start" once more.
    localStorage.removeItem(MEMORY_KEY);
    sent = [];
    await openAt('/skull-king/solo');
    await choose('7');
    await start();
    await settle(500);
    // The `welcome` had the seat. Nothing was asked for, and nothing was started on the device.
    expect(sentOf('solo.start')).toEqual([]);
    expect(places.path()).toBe('/skull-king/table');
    expect(session.table && 'gameId' in session.table ? session.table.gameId : null).toBe(game);
    expect(session.online?.solo).toBe(true);
    expect(session.table?.view(0).seats).toHaveLength(3);
    expect(localStorage.getItem(GAME_KEY)).toBeNull();
  });

  it('leads a player who sits at a table of friends to that table, and starts nothing', async () => {
    // The same browser, seated in a lobby through a socket of its own.
    const other = await connectRaw(page.transport);
    await settle();
    other.send({ t: 'lobby.create', visibility: 'private', settings: { ...STANDARD, maxPlayers: 3 } });
    await settle();
    other.close();
    await settle();
    sent = [];

    await openAt('/skull-king/solo');
    await start();
    await settle(500);
    expect(sentOf('solo.start')).toEqual([]);
    expect($('#online h2')?.textContent).toBe('Table');
    expect(places.path()).toBe('/skull-king/online');
    expect($('#app .game')).toBeNull();
    expect(localStorage.getItem(GAME_KEY)).toBeNull();
  });
});

describe('a solo game on the server', () => {
  async function startSolo(bots = '2'): Promise<void> {
    await openAt('/skull-king/solo');
    await choose(bots);
    await choose('Swift');
    await start();
    await settle(500);
    expect(ui.screen).toBe('game');
  }

  it('is a table that says it is saved, with no ring on the player and no clock on their bid', async () => {
    await startSolo();
    expect(session.online?.solo).toBe(true);
    expect($('#app .g-info .pill.green')?.textContent).toBe('Saved');
    expect($('#app .g-note')).toBeNull();
    // The bots have bid and wait. Nothing counts down on the player, now or a minute from now.
    expect($('#app .ring')).toBeNull();
    const round = updates().at(-1);
    expect(round?.table.deadline).toBeNull();
    await settle(60_000);
    expect($('#app .ring')).toBeNull();
    expect(updates().some((u) => u.events.some((e) => e.type === 'timedOut'))).toBe(false);
    expect(session.table?.view(0).bids[0]).toBeNull();
    // The menu theme is the home's: the renderer is at its game screen.
    expect(ui.screen).toBe('game');
  });

  it('plays no card while the connection is down, says so in its own words, and comes back to the same hand', async () => {
    await startSolo();
    await act(() => session.table?.dispatch({ type: 'bid', seat: 0, bid: 1 }).then(() => {}) ?? Promise.resolve());
    await settle(1000);
    const before = updates().at(-1);
    if (!before) throw new Error('No update before the drop');
    expect(before.view.phase).toBe('playing');

    server.drop(true);
    await settle(200);
    expect($('.table-overlay h2')?.textContent).toBe('Connection lost');
    expect($('.table-overlay p')?.textContent).toBe(
      'Your game is saved on the server and waits for you. No card is played while you are away.',
    );
    expect($('.table-overlay .btn')?.textContent).toBe('Try now');
    expect($('#app')?.inert || $('#app')?.hasAttribute('inert')).toBeTruthy();
    // Nothing runs on the device in its place.
    expect(session.online?.solo).toBe(true);
    expect(localStorage.getItem(GAME_KEY)).toBeNull();

    await settle(5 * 60_000);
    server.restore();
    await settle(60_000);
    expect($('.table-overlay')).toBeNull();
    const welcome = heard.filter((m): m is Welcome => m.t === 'welcome').at(-1);
    // The hand, the bids and the trick are what they were. No turn was played for the player.
    expect(welcome?.game && standing(welcome.game.update)).toBe(standing(before));
    expect(updates().some((u) => u.events.some((e) => e.type === 'timedOut'))).toBe(false);
    expect(session.table?.view(0).seats.map((seat) => seat.bot)).toEqual([false, true, true]);
  });

  it('asks before leaving, comes down on the ok alone, and says the game did not count', async () => {
    await startSolo();
    await click('#app .g-top [data-act="home"]');
    expect($('#app .sheet h2')?.textContent).toBe('Leave this game?');
    expect($('#app .sheet p')?.textContent).toBe('It will not be saved to your stats.');
    expect(texts('#app .sheet .btn')).toEqual(['Leave', 'Keep playing']);
    await click('#app .sheet .btn.ghost');
    await settle(300);
    expect(sentOf('game.leave')).toEqual([]);

    const frames = heard.length;
    await click('#app .g-top [data-act="home"]');
    await click('[data-act="leaveTable"]');
    await settle(300);
    expect(sentOf('game.leave')).toHaveLength(1);
    // One frame answered the leave. No update and no result followed, and none was waited for.
    expect(heard.slice(frames).map((m) => m.t)).toEqual(['ok']);
    expect($('#app .game')).toBeNull();
    expect($('.sk-left h1')?.textContent).toBe('You left this game.');
    expect($('.sk-left p')?.textContent).toBe('It was not counted.');
    expect(texts('.sk-left-actions .btn')).toEqual(['Play again', 'Home']);
    expect($('#online')).toBeNull();
    expect(places.path()).toBe('/skull-king/table');
    expect(await me()).toMatchObject({ active: null, cooldownUntil: null, stats: { games: 0 } });

    // "Play again" is the setup, and another game can be started at once.
    await click('.sk-left-actions .btn');
    expect(places.entries()).toEqual({ paths: ['/skull-king/solo'], at: 0 });
    expect($('.sk-left')).toBeNull();
    await start();
    await settle(500);
    expect(sentOf('solo.start')).toHaveLength(2);
    expect(ui.screen).toBe('game');
  });

  it('goes home from what is said after a leave', async () => {
    await startSolo();
    await click('#app .g-top [data-act="home"]');
    await click('[data-act="leaveTable"]');
    await settle(300);
    await click('.sk-left-actions .btn.ghost');
    expect(places.entries()).toEqual({ paths: ['/skull-king'], at: 0 });
    expect($('.sk-home')).not.toBeNull();
    // Nothing is left to jump back into.
    await settle();
    expect($('.sk-jump')).toBeNull();
  });

  it("ends with the server's places, says it was saved to the stats, and sets the next game up afresh", async () => {
    await startSolo('1');
    await playOut();
    expect(ui.screen).toBe('end');
    const over = heard.find((m) => m.t === 'game.over');
    expect(over?.t === 'game.over' && over.result.places).toHaveLength(2);
    expect($('#app .end-note .pill.green')?.textContent).toBe('Saved to your stats');
    expect(texts('#app .end-actions button')).toEqual(['Play again', 'Home']);
    // A guest's game counts too.
    expect(await me()).toMatchObject({ guest: true, active: null, stats: { games: 1 } });
    // The device kept no tally of it: it is the server's game.
    expect(stats.games).toBe(0);

    await click('#app [data-act="again"]');
    await settle();
    expect(places.entries()).toEqual({ paths: ['/skull-king/solo'], at: 0 });
    expect($('.sk-solo h1')?.textContent).toBe('Solo game');
  });
});

describe('solo with a server that cannot be reached', () => {
  /** The page's backend with a socket that never opens. REST is as it is. */
  const unreachable = (): Backend => ({ rest: page.rest, transport: () => new Promise<Wire>(() => {}) });

  it('waits as long as an action gets, then plays on the device and says the game is offline', async () => {
    await openAt('/skull-king/solo', unreachable());
    await choose('2');
    await choose('Swift');
    await start();
    // Nothing is started while the server may still answer.
    await settle(DISPATCH_TIMEOUT_MS - 500);
    expect($('#app .game')).toBeNull();
    expect(($('.sk-start .btn') as HTMLButtonElement).disabled).toBe(true);

    await settle(1000);
    expect(ui.screen).toBe('game');
    expect(session.online).toBeNull();
    expect(session.table?.view(0).seats.map((seat) => seat.bot)).toEqual([false, true, true]);
    expect(session.table?.view(0).rounds).toBe(5);
    expect($('#app .g-info .pill.gold')?.textContent).toBe('Offline');
    expect($('#app .g-note')?.textContent).toBe('Offline game · not counted in your stats');
    expect($('#app .g-info .pill.green')).toBeNull();
    expect(places.entries()).toEqual({ paths: ['/skull-king/table'], at: 0 });
    expect(sent).toEqual([]);
    // It is saved on the device with its first step, as every device game is.
    await settle(3000);
    expect(localStorage.getItem(GAME_KEY)).toContain('"phase":"bidding"');
  });

  it('plays on the device when the server is down, and never opens a table the server speaks of later', async () => {
    server.drop(true);
    await openAt('/skull-king/solo');
    await start();
    await settle(DISPATCH_TIMEOUT_MS + 500);
    expect(ui.screen).toBe('game');
    expect(session.online).toBeNull();
    expect($('#app .g-info .pill.gold')?.textContent).toBe('Offline');
    // The server comes back. The page is done asking: the device game goes on.
    server.restore();
    await settle(60_000);
    expect(session.online).toBeNull();
    expect(sentOf('solo.start')).toEqual([]);
    expect($('#online')).toBeNull();
  });

  it('ends a device game with the line that it did not count, and sets the next one up on the solo page', async () => {
    await openAt('/skull-king/solo', unreachable());
    await choose('1');
    await choose('Swift');
    await start();
    await settle(DISPATCH_TIMEOUT_MS + 500);
    await playOut();
    expect(ui.screen).toBe('end');
    expect($('#app .end-note .pill.soft')?.textContent).toBe('Offline game · not counted in your stats');
    expect($('#app .end-note .pill.green')).toBeNull();
    expect(texts('#app .end-actions button')).toEqual(['Play again', 'Home']);
    await click('#app [data-act="again"]');
    expect(places.path()).toBe('/skull-king/solo');
    expect($('.sk-solo h1')?.textContent).toBe('Solo game');
  });
});

describe('one screen', () => {
  it('is still the new-game screen, and never asks the server for a solo game', async () => {
    await openAt('/skull-king/one-screen');
    expect($('#app h2')?.textContent).toBe('New game');
    await click('[data-act="start"]');
    await settle(DISPATCH_TIMEOUT_MS + 3000);
    expect(ui.screen).toBe('game');
    expect(session.online).toBeNull();
    expect(sent).toEqual([]);
    expect(places.path()).toBe('/skull-king/table');
  });
});
