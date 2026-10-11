/* The online state against frames written by hand: what the page believes after each thing the
   server says. The table and the lobby as a living whole are in remoteTable.test.ts and in the
   screens' test; here the order is exact. */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { Lobby, WelcomeGame } from '../protocol/generated';
import { Online } from './online';
import type { OnlineMemory, Remembered } from './online';
import { SocketClient } from './socket';
import type { Wire } from './socket';

const read = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../../../fixtures/protocol/${name}.json`, import.meta.url), 'utf8')) as T;
const game = read<WelcomeGame>('welcome-game');
const lobby = read<Lobby>('lobby');
const ME = { user: lobby.members[0].kind === 'human' ? lobby.members[0].user : null };

type TestWire = Wire & { sent: { t: string; id: number; [key: string]: unknown }[]; say(frame: object): void };
let wires: TestWire[];
let online: Online;
let changes: number;

const tick = (ms = 0): Promise<void> => vi.advanceTimersByTimeAsync(ms).then(() => {});
const wire = (): TestWire => {
  const w = wires.at(-1);
  if (!w) throw new Error('No connection was opened');
  return w;
};
function welcome(snapshot: { lobby?: Lobby | null; game?: WelcomeGame | null } = {}): void {
  const w = wire();
  w.say({ t: 'ok', re: w.sent[0].id });
  w.say({ t: 'welcome', me: ME, serverTime: Date.now(), lobby: null, queue: null, game: null, ...snapshot });
}
/** Answer the newest message of the page with ok. */
const ok = (extra: object = {}): void => wire().say({ t: 'ok', re: wire().sent.at(-1)?.id, ...extra });

/** Opens another hand-held wire. */
let reopen: () => Promise<Wire>;

beforeEach(async () => {
  vi.useFakeTimers();
  wires = [];
  changes = 0;
  const transport = (reopen = (): Promise<Wire> => {
    const sent: TestWire['sent'] = [];
    const w: TestWire = {
      sent,
      onmessage: null,
      onclose: null,
      send: (data) => void sent.push(JSON.parse(data) as TestWire['sent'][number]),
      close: () => {},
      say: (frame) => w.onmessage?.(JSON.stringify(frame)),
    };
    wires.push(w);
    return Promise.resolve(w);
  });
  online = new Online(new SocketClient({ transport, build: 'test', random: () => 0.5 }));
  online.subscribe(() => changes++);
  online.open();
  await tick();
});
afterEach(() => {
  online.dispose();
  vi.useRealTimers();
});

describe('Online', () => {
  it('knows nothing until the first welcome, and then exactly what it said', () => {
    expect(online.getState()).toEqual({ status: 'connecting', me: null, lobby: null, table: null, notice: null });
    welcome({ lobby });
    expect(online.getState()).toMatchObject({ status: 'online', me: ME, lobby, table: null });
  });

  it('returns the same state object until something changes', () => {
    welcome();
    const before = online.getState(),
      n = changes;
    wire().say({ t: 'queue.status', queue: { mode: 'casual', since: 0, found: 1, needed: 4 } });
    wire().say({ t: 'game.emote', seat: 1, emote: 'example' });
    expect(online.getState()).toBe(before);
    expect(changes).toBe(n);
    online.dismissNotice();
    expect(online.getState()).toBe(before);
  });

  it('takes the lobby from the reply to create and join, and every change from lobby.state after it', async () => {
    welcome();
    const created = online.createLobby('private', lobby.settings);
    expect(wire().sent.at(-1)).toMatchObject({ t: 'lobby.create', visibility: 'private', settings: lobby.settings });
    // The reply and the push that follows it arrive back to back: the push is the newer one and must win.
    const ready: Lobby = {
      ...lobby,
      members: lobby.members.map((m) => (m.kind === 'human' ? { ...m, ready: false } : m)),
    };
    ok({ lobby });
    wire().say({ t: 'lobby.state', lobby: ready });
    expect(await created).toEqual({ ok: true });
    expect(online.getState().lobby).toEqual(ready);

    // An intent that only gets ok changes nothing by itself.
    const adding = online.addBot();
    ok();
    expect(await adding).toEqual({ ok: true });
    expect(online.getState().lobby).toEqual(ready);

    const leaving = online.leaveLobby();
    ok();
    expect(await leaving).toEqual({ ok: true });
    expect(online.getState().lobby).toBeNull();
  });

  it('reports a refused intent with its code and keeps the state', async () => {
    welcome({ lobby });
    const start = online.startGame();
    wire().say({ t: 'err', re: wire().sent.at(-1)?.id, code: 'NOT_READY', message: 'Not everyone is ready.' });
    expect(await start).toEqual({ ok: false, code: 'NOT_READY', message: 'Not everyone is ready.' });
    expect(online.getState().lobby).toEqual(lobby);
    expect(wire().sent.map((m) => m.t)).toEqual(['hello', 'lobby.start']);
  });

  it('says why a lobby is gone', () => {
    welcome({ lobby });
    wire().say({ t: 'lobby.closed', reason: 'kicked' });
    expect(online.getState()).toMatchObject({ lobby: null, notice: { kind: 'lobbyClosed', reason: 'kicked' } });
    online.dismissNotice();
    expect(online.getState().notice).toBeNull();
  });

  it('opens a table when game.start has been followed by its first update, not before', () => {
    welcome({ lobby });
    wire().say({ t: 'lobby.state', lobby: { ...lobby, state: 'inGame', gameId: game.start.gameId } });
    wire().say(game.start);
    expect(online.getState().table).toBeNull();
    wire().say({ ...game.update, gameId: 'some-other-game' });
    expect(online.getState().table).toBeNull();
    wire().say(game.update);
    const table = online.getState().table;
    expect(table?.gameId).toBe(game.start.gameId);
    expect(table?.view(0).hand).toEqual(game.update.view.hand);
    // Later updates are the table's own business: the state object does not change for them.
    const before = online.getState();
    wire().say({ ...game.update, rev: game.update.rev + 1 });
    expect(online.getState()).toBe(before);
  });

  it('replaces everything with the welcome of a new socket: the open table is resynced, a finished one is gone', async () => {
    welcome({ lobby, game });
    const table = online.getState().table;
    expect(table).not.toBeNull();
    let snapshots = 0;
    table?.subscribe((events, _getView, info) => {
      if (!events.length && info?.unlock) snapshots++;
    });

    wire().onclose?.(1006);
    expect(online.getState()).toMatchObject({ status: 'offline', lobby, table });
    await tick(500);
    const later = { ...game, update: { ...game.update, rev: 40, view: { ...game.update.view, bids: [2, 4] } } };
    welcome({ lobby: null, game: later });
    expect(online.getState()).toMatchObject({ status: 'online', lobby: null });
    expect(online.getState().table).toBe(table);
    expect(snapshots).toBe(1);
    expect(table?.view(0).bids).toEqual([2, 4]);

    wire().onclose?.(1006);
    await tick(500);
    welcome({ lobby });
    expect(online.getState()).toMatchObject({ lobby, table: null });
    // The table that was taken away hears nothing more.
    wire().say({ ...game.update, rev: 99 });
    expect(snapshots).toBe(1);
  });

  it('keeps the lobby when a finished game is closed: that is where the rematch starts', () => {
    welcome({ lobby, game });
    wire().say({
      ...game.update,
      rev: 50,
      events: [{ type: 'gameOver' }],
      view: { ...game.update.view, phase: 'gameOver' },
    });
    wire().say({
      t: 'game.over',
      gameId: game.start.gameId,
      result: { totals: [80, 20], places: [1, 2], forfeited: [], rating: null, lobbyId: lobby.id },
    });
    // The table is still on screen with its end: the result is no news.
    expect(online.getState()).toMatchObject({ notice: null, lobby });
    expect(online.getState().table).not.toBeNull();
    online.closeTable();
    expect(online.getState()).toMatchObject({ table: null, lobby, notice: null });
  });

  it('leaves a table for good: the lobby goes with the seat, and the result is a notice with the forfeit and the rating', async () => {
    welcome({ lobby, game });
    const leaving = online.leaveTable();
    expect(wire().sent.at(-1)).toMatchObject({ t: 'game.leave' });
    ok();
    wire().say({ ...game.update, rev: 2, events: [{ type: 'seatStatus', seat: 0, status: 'bot' }] });
    expect(await leaving).toEqual({ ok: true });
    online.closeTable();
    expect(online.getState()).toMatchObject({ table: null, lobby: null, notice: null });

    const rating = { value: 1000, tier: 'Sailor', provisional: true, games: 3 };
    wire().say({
      t: 'game.over',
      gameId: game.start.gameId,
      result: {
        totals: [-40, 60],
        places: [2, 1],
        forfeited: [0],
        rating: { before: rating, after: { ...rating, value: 982, games: 4 }, delta: -18 },
        lobbyId: null,
      },
    });
    expect(online.getState().table).toBeNull();
    expect(online.getState().notice).toEqual({
      kind: 'gameOver',
      left: true,
      place: 2,
      seats: 2,
      forfeited: true,
      delta: -18,
    });
  });

  it('takes the result of a game it knows nothing about as news too: after a reload it follows the welcome', () => {
    welcome({ lobby: null, game: null });
    wire().say({
      t: 'game.over',
      gameId: 'a-game-from-before-the-reload',
      result: { totals: [10, 20, 30], places: [3, 2, 1], forfeited: [], rating: null, lobbyId: null },
    });
    expect(online.getState()).toMatchObject({
      table: null,
      notice: { kind: 'gameOver', left: false, place: null, seats: 3, forfeited: false, delta: null },
    });
  });

  describe('what one page leaves for the next', () => {
    /** The device's memory, and a second page that reads it. */
    function device(): { kept: Remembered | null; memory: OnlineMemory; page(): Online } {
      const d = {
        kept: null as Remembered | null,
        memory: {
          load: () => d.kept,
          save: (r: Remembered) => {
            d.kept = structuredClone(r);
          },
        },
        page: () => new Online(new SocketClient({ transport: () => new Promise(() => {}), build: 'test' }), d.memory),
      };
      return d;
    }
    /** This test's own page, on the shared wires, with a memory. */
    async function pageWith(memory: OnlineMemory): Promise<Online> {
      online.dispose();
      online = new Online(new SocketClient({ transport: reopen, build: 'test' }), memory);
      online.open();
      await tick();
      return online;
    }

    it('remembers a seat once the server has said there is one, and nothing before', async () => {
      const d = device();
      expect(d.page().wasSeated).toBe(false);
      await pageWith(d.memory);
      expect(d.kept).toBeNull();
      welcome();
      expect(d.kept).toEqual({ seated: false, games: {} });
      wire().say({ t: 'lobby.state', lobby });
      expect(d.kept).toEqual({ seated: true, games: {} });
      expect(d.page().wasSeated).toBe(true);
    });

    it('keeps the seat remembered while the link is down, and forgets it when the player walks away', async () => {
      const d = device();
      await pageWith(d.memory);
      welcome({ lobby, game });
      expect(d.kept).toEqual({ seated: true, games: { [game.start.gameId]: { seat: 0, left: false } } });
      wire().onclose?.(1006);
      expect(d.page().wasSeated).toBe(true);
      online.close(); // the page goes away
      expect(d.page().wasSeated).toBe(true);
      online.close(true); // the player goes away
      expect(d.page().wasSeated).toBe(false);
    });

    it('knows on the next page which seat was played, so a late result can say the place', async () => {
      const d = device();
      await pageWith(d.memory);
      welcome({ lobby, game: { ...game, start: { ...game.start, me: 1 } } });
      online.close();

      await pageWith(d.memory);
      welcome({ lobby: null, game: null });
      wire().say({
        t: 'game.over',
        gameId: game.start.gameId,
        result: { totals: [80, 20], places: [1, 2], forfeited: [], rating: null, lobbyId: null },
      });
      expect(online.getState().notice).toEqual({
        kind: 'gameOver',
        left: false,
        place: 2,
        seats: 2,
        forfeited: false,
        delta: null,
      });
      expect(online.getState().table).toBeNull();
      // The result is in: that game is not kept any longer.
      expect(d.kept).toEqual({ seated: false, games: {} });
    });
  });

  it('takes the seat a result is about from the message, and from memory only when it names none', async () => {
    const result = { totals: [10, 20, 30], places: [3, 2, 1], forfeited: [2], rating: null, lobbyId: null };
    // A device that knows nothing about the game: the message says it all.
    welcome();
    wire().say({ t: 'game.over', gameId: 'played-elsewhere', seat: 2, result });
    expect(online.getState().notice).toMatchObject({
      kind: 'gameOver',
      left: false,
      place: 1,
      seats: 3,
      forfeited: true,
    });

    // A device that remembers seat 0 is told seat 1: the server is the one that knows.
    wire().onclose?.(1006);
    await tick(500);
    welcome({ lobby, game });
    online.closeTable();
    wire().say({ t: 'game.over', gameId: game.start.gameId, seat: 1, result: { ...result, places: [2, 1] } });
    expect(online.getState().notice).toMatchObject({ place: 1, seats: 2 });

    // Seat 0 is a real seat, not "no seat".
    wire().say({ t: 'game.over', gameId: 'another', seat: 0, result });
    expect(online.getState().notice).toMatchObject({ place: 3, forfeited: false });
  });

  it('forgets everything on close()', () => {
    welcome({ lobby, game });
    online.close();
    expect(online.getState()).toEqual({ status: 'idle', me: null, lobby: null, table: null, notice: null });
  });
});
