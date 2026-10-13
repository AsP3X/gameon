/* RemoteTable: the seat the server gave this session, and what the renderer is told about each
   update. First against frames written by hand (the sample in fixtures/protocol), where the order is
   exact; then against the mock server through the socket client and the online state, where a
   whole table is alive on the other side. docs/protocol.md §5.2 and §5.5. */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { Api } from '../net/api';
import { MockServer } from '../net/mock/server';
import { connectRaw, framesOf } from '../net/mock/raw';
import type { RawClient } from '../net/mock/raw';
import { Online } from '../net/online';
import { SocketClient } from '../net/socket';
import type { Transport, Wire } from '../net/socket';
import type { GameEvent, GameSettings, GameUpdate, WelcomeGame } from '../protocol/generated';
import { RemoteTable } from './remoteTable';
import type { UpdateInfo } from './table';

const sample = JSON.parse(
  readFileSync(new URL('../../../fixtures/protocol/welcome-game.json', import.meta.url), 'utf8'),
) as WelcomeGame;

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const tick = (ms = 0): Promise<void> => vi.advanceTimersByTimeAsync(ms).then(() => {});
/** What a listener of the table was told, one line per update. */
interface Heard {
  events: GameEvent['type'][];
  info: UpdateInfo | undefined;
  bids: (number | null)[];
}
function listen(table: RemoteTable): Heard[] {
  const heard: Heard[] = [];
  table.subscribe((events, getView, info) =>
    heard.push({ events: events.map((e) => e.type), info, bids: getView(table.localSeats[0]).bids }),
  );
  return heard;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockImplementation(seeded(3));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('RemoteTable, frame by frame', () => {
  let wire: Wire & { sent: { t: string; id: number; [key: string]: unknown }[]; say(frame: object): void };
  let client: SocketClient;
  let table: RemoteTable;
  let heard: Heard[];
  const update = (rev: number, patch: Partial<GameUpdate> = {}): GameUpdate => ({ ...sample.update, rev, ...patch });

  beforeEach(async () => {
    const sent: (typeof wire)['sent'] = [];
    wire = {
      sent,
      onmessage: null,
      onclose: null,
      send: (data) => void sent.push(JSON.parse(data) as (typeof sent)[number]),
      close: () => {},
      say: (frame) => wire.onmessage?.(JSON.stringify(frame)),
    };
    client = new SocketClient({ transport: () => Promise.resolve(wire), build: 'test' });
    client.start();
    await tick();
    wire.say({ t: 'ok', re: wire.sent[0].id });
    wire.say({ t: 'welcome', me: {}, serverTime: Date.now(), lobby: null, queue: null, game: sample });
    table = new RemoteTable(client, sample.start, sample.update);
    heard = listen(table);
  });
  afterEach(() => client.stop());

  it('plays the one seat game.start calls me, and shows no other', () => {
    expect(table.localSeats).toEqual([0]);
    expect(table.gameId).toBe(sample.start.gameId);
    const v = table.view(0);
    expect(v).toMatchObject({ me: 0, phase: 'bidding', hand: [0, 67], bids: [2, -1] });
    // What game.start said once is on every view: the seats, the rules and the cards by id.
    expect(v.seats).toEqual([
      { name: 'Anne', color: '#1cb0f6', bot: false },
      { name: 'Calico', color: '#ff9600', bot: true },
    ]);
    expect(v.cfg).toEqual({
      scoring: 'classic',
      abilities: false,
      level: 'normal',
      format: 'brawl',
      loot: false,
      kraken: false,
      whale: false,
    });
    expect(v.deck[67]).toEqual({ kind: 'sk', id: 67 });
    expect(() => table.view(1)).toThrow(/one seat/);
  });

  it('sends a bid, a card and an ability choice without a seat, stamped with the round and trick on screen', async () => {
    void table.dispatch({ type: 'bid', seat: 0, bid: 3 });
    void table.dispatch({ type: 'play', seat: 0, card: 67 });
    void table.dispatch({ type: 'play', seat: 0, card: 66, as: 'escape' });
    void table.dispatch({ type: 'ability', seat: 0, choice: [1, 2] });
    void table.dispatch({ type: 'advance' });
    const at = { round: 0, trick: 0 };
    expect(wire.sent.slice(1).map(({ id: _id, ...message }) => message)).toEqual([
      { t: 'game.bid', at, bid: 3 },
      { t: 'game.play', at, card: 67 },
      { t: 'game.play', at, card: 66, as: 'escape' },
      { t: 'game.ability', at, choice: [1, 2] },
      { t: 'game.ready' },
    ]);
    // Somebody else's seat is not played from here: nothing goes out at all.
    expect(await table.dispatch({ type: 'bid', seat: 1, bid: 0 })).toMatchObject({ ok: false, code: 'REJECTED' });
    expect(wire.sent).toHaveLength(6);

    // Two tricks in, one of them destroyed: `at` counts both.
    const v = sample.update.view;
    wire.say(update(2, { view: { ...v, phase: 'playing', won: [1, 0], log: [{ ...v.log[0], destroyed: 1 }] } }));
    void table.dispatch({ type: 'play', seat: 0, card: 0 });
    expect(wire.sent.at(-1)).toMatchObject({ t: 'game.play', at: { round: 0, trick: 2 }, card: 0 });
  });

  it('gives the input back with the update that follows ok, and with no other', async () => {
    const answer = table.dispatch({ type: 'bid', seat: 0, bid: 3 });
    const id = wire.sent[1].id;
    // Another seat's step lands first: it is shown, and the lock stays.
    wire.say(update(2, { events: [{ type: 'bidPlaced', seat: 1 }] }));
    expect(heard).toEqual([{ events: ['bidPlaced'], info: { unlock: false, last: false }, bids: [2, -1] }]);
    wire.say({ t: 'ok', re: id });
    expect(await answer).toEqual({ ok: true });
    expect(heard).toHaveLength(1); // ok says accepted, nothing more: nothing is drawn from it
    wire.say(update(3, { events: [{ type: 'bidPlaced', seat: 0 }], view: { ...sample.update.view, bids: [3, -1] } }));
    expect(heard[1]).toEqual({ events: ['bidPlaced'], info: { unlock: true, last: false }, bids: [3, -1] });
    // And the next one is somebody else's again.
    wire.say(update(4));
    expect(heard[2].info).toEqual({ unlock: false, last: false });
  });

  it('takes an err as the whole answer: the action failed with the code, and no update is waited for', async () => {
    const answer = table.dispatch({ type: 'bid', seat: 0, bid: 9 });
    wire.say({ t: 'err', re: wire.sent[1].id, code: 'BID_OUT_OF_RANGE', message: 'That bid is out of range.' });
    expect(await answer).toEqual({ ok: false, code: 'BID_OUT_OF_RANGE', message: 'That bid is out of range.' });
    expect(heard).toEqual([]);
    wire.say(update(2));
    expect(heard[0].info).toEqual({ unlock: false, last: false });
  });

  it('drops an update that is older than the one on screen, and passes on the events only a server has', () => {
    wire.say(
      update(5, {
        events: [
          { type: 'seatStatus', seat: 1, status: 'away' },
          { type: 'bidPlaced', seat: 1 },
          { type: 'timedOut', seat: 1 },
        ],
      }),
    );
    wire.say(update(5, { view: { ...sample.update.view, bids: [9, 9] } }));
    wire.say(update(4, { view: { ...sample.update.view, bids: [9, 9] } }));
    wire.say(update(9, { gameId: 'another-game' }));
    expect(heard).toEqual([
      { events: ['seatStatus', 'bidPlaced', 'timedOut'], info: { unlock: false, last: false }, bids: [2, -1] },
    ]);
    expect(table.view(0).bids).toEqual([2, -1]);
  });

  it('says who is there, who is ready and whose clock is running, and how long that clock is', () => {
    // The table opened on a snapshot whose clock was already running: taken to be the standard one.
    const now = Date.now();
    expect(table.view(0).online).toEqual({
      status: ['online', 'bot'],
      ready: [false, false],
      deadline: { kind: 'bid', seats: [0, 1], at: sample.update.table.deadline?.at, total: expect.any(Number) },
    });
    const table2 = (at: number, seats: number[], kind: 'bid' | 'play' = 'play'): GameUpdate['table'] => ({
      status: ['offline', 'bot'],
      ready: [true, false],
      deadline: { kind, seats, at },
    });
    // A step that brings a new deadline starts its clock: what is left is the whole of it.
    wire.say(update(2, { table: table2(now + 12_000, [0]) }));
    expect(table.view(0).online).toEqual({
      status: ['offline', 'bot'],
      ready: [true, false],
      deadline: { kind: 'play', seats: [0], at: now + 12_000, total: 12_000 },
    });
    // The same deadline in a later step is the same clock, however much of it has run.
    vi.setSystemTime(now + 9000);
    wire.say(update(3, { table: table2(now + 12_000, [0]) }));
    expect(table.view(0).online?.deadline?.total).toBe(12_000);
    // No deadline, no clock.
    wire.say(update(4, { table: { ...table2(0, []), deadline: null } }));
    expect(table.view(0).online?.deadline).toBeNull();
    // After a reconnect the clock is met while it runs: a standard play clock at standard pace is 30 seconds,
    table.resync(sample.start, update(5, { table: table2(now + 20_000, [0]) }));
    expect(table.view(0).online?.deadline?.total).toBe(30_000);
    // unless more than that is left of it.
    table.resync(sample.start, update(6, { table: table2(now + 80_000, [0], 'bid') }));
    expect(table.view(0).online?.deadline?.total).toBe(71_000);
  });

  it('gives the input back even when the server breaks the pair', async () => {
    void table.dispatch({ type: 'bid', seat: 0, bid: 3 });
    wire.say({ t: 'ok', re: wire.sent[1].id });
    wire.say({ t: 'game.emote', seat: 1, emote: 'example' });
    expect(heard).toEqual([{ events: [], info: { unlock: true, last: false }, bids: [2, -1] }]);
    // The update that comes late is then just an update.
    wire.say(update(2));
    expect(heard[1].info).toEqual({ unlock: false, last: false });
  });

  it('ends with the update that answers game.leave, and shows nothing after it', async () => {
    const left = table.leave();
    expect(wire.sent[1]).toMatchObject({ t: 'game.leave' });
    wire.say({ t: 'ok', re: wire.sent[1].id });
    wire.say(
      update(2, {
        events: [{ type: 'seatStatus', seat: 0, status: 'out' }],
        table: { ...sample.update.table, status: ['out', 'online'] },
      }),
    );
    expect(await left).toEqual({ ok: true });
    expect(table.hasLeft).toBe(true);
    expect(heard).toEqual([{ events: ['seatStatus'], info: { unlock: true, last: true }, bids: [2, -1] }]);
    // The seat is out in the view that was shown last.
    expect(table.view(0).online?.status).toEqual(['out', 'online']);
    wire.say(update(3, { events: [{ type: 'bidPlaced', seat: 1 }] }));
    expect(heard).toHaveLength(1);
  });

  it('ends the same way on the update of a leave that cancelled the game: nobody else was a person', async () => {
    const left = table.leave();
    wire.say({ t: 'ok', re: wire.sent[1].id });
    // Not over until the update has come: only a solo game ends with the `ok`.
    expect(table.hasLeft).toBe(false);
    expect(heard).toEqual([]);
    wire.say(
      update(2, {
        events: [{ type: 'seatStatus', seat: 0, status: 'out' }],
        table: { ...sample.update.table, status: ['out', 'bot'] },
      }),
    );
    expect(await left).toEqual({ ok: true });
    expect(table.hasLeft).toBe(true);
    expect(heard).toEqual([{ events: ['seatStatus'], info: { unlock: true, last: true }, bids: [2, -1] }]);
    // The server sends nothing more for this game, and the table has no result.
    expect(table.result).toBeNull();
  });

  it('is a table like any other unless game.start names it: only a solo game is named', () => {
    expect(table.kind).toBeNull();
    expect(new RemoteTable(client, { ...sample.start, table: 'solo' }, sample.update).kind).toBe('solo');
  });

  it('ends a solo game with the ok alone: no update follows a leave there, and none is waited for', async () => {
    const solo = new RemoteTable(client, { ...sample.start, table: 'solo', lobbyId: null }, sample.update),
      said = listen(solo);
    const left = solo.leave();
    expect(wire.sent[1]).toMatchObject({ t: 'game.leave' });
    expect(solo.hasLeft).toBe(false);
    wire.say({ t: 'ok', re: wire.sent[1].id });
    expect(await left).toEqual({ ok: true });
    // The table is over the moment the server said yes.
    expect(solo.hasLeft).toBe(true);
    expect(said).toEqual([{ events: [], info: { unlock: true, last: true }, bids: [2, -1] }]);
    // Whatever might still arrive is not shown.
    wire.say(update(3, { events: [{ type: 'bidPlaced', seat: 1 }] }));
    expect(said).toHaveLength(1);
  });

  it('keeps a solo game when the leave is refused', async () => {
    const solo = new RemoteTable(client, { ...sample.start, table: 'solo', lobbyId: null }, sample.update),
      said = listen(solo);
    const left = solo.leave();
    wire.say({ t: 'err', re: wire.sent[1].id, code: 'NOT_IN_GAME', message: 'No game.' });
    expect(await left).toMatchObject({ ok: false, code: 'NOT_IN_GAME' });
    expect(solo.hasLeft).toBe(false);
    expect(said).toEqual([]);
  });

  it('forgets what it waited for when the socket closes, and starts over from the snapshot of the next one', async () => {
    const answer = table.dispatch({ type: 'bid', seat: 0, bid: 3 });
    wire.say({ t: 'ok', re: wire.sent[1].id });
    wire.onclose?.(1006);
    expect(await answer).toEqual({ ok: true });
    table.resync(sample.start, update(7, { events: [], view: { ...sample.update.view, bids: [3, -1] } }));
    expect(heard).toEqual([{ events: [], info: { unlock: true, last: false }, bids: [3, -1] }]);
    expect(table.view(0).bids).toEqual([3, -1]);
  });
});

describe('RemoteTable at a table on the mock server', () => {
  const SETTINGS: GameSettings = {
    maxPlayers: 3,
    scoring: 'classic',
    format: 'swift',
    loot: false,
    kraken: false,
    whale: false,
    abilities: false,
    botLevel: 'normal',
    pace: 'standard',
  };
  let server: MockServer;
  let online: Online;
  let client: SocketClient;
  /** Every frame this page sent. */
  let out: { t: string; [key: string]: unknown }[];
  let friend: RawClient;

  /** A started table: this page hosts, a second player joined, and a bot has the third seat. */
  async function seated(): Promise<RemoteTable> {
    online.open();
    await tick();
    await online.createLobby('private', SETTINGS);
    friend = await connectRaw(server.transport());
    await tick();
    friend.send({ t: 'lobby.join', code: online.getState().lobby?.code });
    friend.send({ t: 'lobby.ready', ready: true });
    await online.addBot();
    await online.setReady(true);
    await tick();
    expect(await online.startGame()).toEqual({ ok: true });
    await tick();
    const table = online.getState().table;
    if (!table) throw new Error('The game did not start');
    return table;
  }

  beforeEach(() => {
    out = [];
    server = new MockServer({
      random: seeded(8),
      // A bid has two seconds: longer than the half second a reconnect takes below.
      timers: { bidMs: 2000, playMs: 300, abilityMs: 300, trickEndMs: 100, roundEndMs: 200 },
      bot: { minMs: 40, maxMs: 80 },
    });
    const inner = server.transport();
    const transport: Transport = async () => {
      const wire = await inner();
      const send = wire.send.bind(wire);
      wire.send = (data) => {
        out.push(JSON.parse(data) as (typeof out)[number]);
        send(data);
      };
      return wire;
    };
    client = new SocketClient({ transport, build: 'test', random: () => 0.5 });
    online = new Online(client, new Api(() => Promise.reject(new Error('These tests have no REST'))));
  });
  afterEach(() => online.dispose());

  it('opens once game.start and its first update are in, as seat 0 of three', async () => {
    const table = await seated();
    expect(online.getState().lobby?.state).toBe('inGame');
    expect(table.localSeats).toEqual([0]);
    const v = table.view(0);
    expect(v.seats.map((s) => s.bot)).toEqual([false, false, true]);
    expect(v).toMatchObject({ phase: 'bidding', round: 0, cards: 5 });
    expect(v.hand).toHaveLength(5);
  });

  it('comes down on the one update of a leave, whether the friend plays on or the game is cancelled', async () => {
    const table = await seated(),
      heard = listen(table);
    expect(await table.leave()).toEqual({ ok: true });
    await tick();
    // The friend is still a person at the table: the seat is out and the game goes on without it.
    expect(heard.at(-1)).toMatchObject({ events: ['seatStatus'], info: { unlock: true, last: true } });
    expect(table.view(0).online?.status).toEqual(['out', 'online', 'bot']);
    expect(table.hasLeft).toBe(true);
    online.closeTable();
    expect(online.getState()).toMatchObject({ table: null, lobby: null, notice: null });

    // The friend resigns as the last person: one update that says out, and the game is cancelled.
    const mark = friend.frames.length;
    friend.send({ t: 'game.leave' });
    await tick(60_000);
    expect(friend.frames.slice(mark).map((f) => f.t)).toEqual(['ok', 'game.update']);
    expect(friend.frames.at(-1)).toMatchObject({
      events: [{ type: 'seatStatus', seat: 1, status: 'out' }],
      table: { status: ['out', 'out', 'bot'] },
    });
    // No result is owed to the page that left first, so nothing brings news of the game.
    expect(online.getState()).toMatchObject({ table: null, notice: null });
  });

  it('never names a seat in what it sends, and is locked only until its own update', async () => {
    const table = await seated(),
      heard = listen(table);
    // The friend bids in the same breath: the server takes that step first.
    friend.send({ t: 'game.bid', at: { round: 0, trick: 0 }, bid: 1 });
    expect(await table.dispatch({ type: 'bid', seat: 0, bid: 2 })).toEqual({ ok: true });
    await tick();
    expect(heard.map((h) => `${h.events.join('+')} ${h.info?.unlock}`)).toEqual(['bidPlaced false', 'bidPlaced true']);
    expect(heard[0].bids).toEqual([null, -1, null]);
    expect(heard[1].bids).toEqual([2, -1, null]);
    expect(out.at(-1)).toEqual({ t: 'game.bid', id: expect.any(Number), at: { round: 0, trick: 0 }, bid: 2 });
    expect(out.some((m) => 'seat' in m)).toBe(false);
    // The bot's bid is nobody's answer.
    await tick(100);
    expect(heard.at(-1)).toMatchObject({ events: ['bidPlaced', 'bidsRevealed'], info: { unlock: false } });
  });

  it('hears err and nothing else for a move the server refuses', async () => {
    const table = await seated(),
      heard = listen(table);
    expect(await table.dispatch({ type: 'play', seat: 0, card: table.view(0).hand[0] })).toMatchObject({
      ok: false,
      code: 'NOT_YOUR_TURN',
    });
    expect(await table.dispatch({ type: 'bid', seat: 0, bid: 6 })).toMatchObject({
      ok: false,
      code: 'BID_OUT_OF_RANGE',
    });
    await tick();
    expect(heard).toEqual([]);
    expect(table.view(0).bids[0]).toBeNull();
  });

  it('loses the answer with the socket, sends nothing twice, and reads from welcome that the bid landed', async () => {
    const table = await seated(),
      heard = listen(table);
    const answer = table.dispatch({ type: 'bid', seat: 0, bid: 2 });
    await Promise.resolve(); // the server has the bid; its ok and update are on the way
    server.drop();
    expect(await answer).toMatchObject({ ok: false, code: 'OFFLINE' });
    expect(online.getState().status).toBe('offline');
    expect(heard).toEqual([]);
    const sent = out.length;

    await tick(500);
    expect(online.getState().status).toBe('online');
    // The same table, told to start over from the snapshot: the bid is in it.
    expect(online.getState().table).toBe(table);
    expect(heard[0]).toMatchObject({ events: [], info: { unlock: true, last: false } });
    expect(table.view(0).bids[0]).toBe(2);
    expect(out.slice(sent).map((m) => m.t)).toEqual(['hello']);
  });

  it('reads from welcome that a bid did not land, and still does not send it again', async () => {
    const table = await seated(),
      heard = listen(table);
    const answer = table.dispatch({ type: 'bid', seat: 0, bid: 2 });
    server.drop(); // before the server read it
    expect(await answer).toMatchObject({ ok: false, code: 'OFFLINE' });
    const sent = out.length;
    await tick(500);
    expect(online.getState().status).toBe('online');
    expect(heard[0]).toMatchObject({ events: [], info: { unlock: true } });
    expect(table.view(0).bids[0]).toBeNull();
    expect(out.slice(sent).map((m) => m.t)).toEqual(['hello']);
    // The player can say it again, and this time it is heard.
    expect(await table.dispatch({ type: 'bid', seat: 0, bid: 2 })).toEqual({ ok: true });
    await tick();
    expect(table.view(0).bids[0]).toBe(2);
  });

  it('comes down with the update that answers the leave, and the result later does not put it back', async () => {
    const table = await seated(),
      heard = listen(table);
    expect(await online.leaveTable()).toEqual({ ok: true });
    await tick();
    expect(heard).toEqual([{ events: ['seatStatus'], info: { unlock: true, last: true }, bids: [null, null, null] }]);
    // Whoever shows the table takes it down now.
    online.closeTable();
    expect(online.getState()).toMatchObject({ table: null, lobby: null, notice: null });

    // The friend and the bots play on. Nothing of it reaches the seat that was left.
    for (let i = 0; i < 4000 && !framesOf(friend, 'game.over').length; i++) await tick(50);
    const over = framesOf(friend, 'game.over')[0];
    expect(over).toBeDefined();
    expect(heard).toHaveLength(1);
    expect(online.getState().table).toBeNull();
    expect(online.getState().notice).toEqual({
      kind: 'gameOver',
      left: true,
      lost: false,
      place: over.result.places[0],
      seats: 3,
      forfeited: false,
      delta: null,
    });
    // With the table gone there is nothing left to leave.
    expect(await online.leaveTable()).toMatchObject({ ok: false, code: 'NOT_IN_GAME' });
  });
});
