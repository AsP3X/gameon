/* RemoteTable: the seat the server gave this session, and what the renderer is told about each
   update. First against frames written by hand (the sample in fixtures/protocol), where the order is
   exact; then against the mock server through the socket client and the online state, where a
   whole table is alive on the other side. docs/protocol.md §5.2 and §5.5. */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { MockServer } from '../net/mock/server';
import { connectRaw, framesOf } from '../net/mock/raw';
import type { RawClient } from '../net/mock/raw';
import { Online } from '../net/online';
import { SocketClient } from '../net/socket';
import type { Transport, Wire } from '../net/socket';
import type { EngineEvent, GameSettings, GameUpdate, WelcomeGame } from '../protocol/generated';
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
  events: EngineEvent['type'][];
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

  it('drops an update that is older than the one on screen, and leaves out the events only a server has', () => {
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
    expect(heard).toEqual([{ events: ['bidPlaced'], info: { unlock: false, last: false }, bids: [2, -1] }]);
    expect(table.view(0).bids).toEqual([2, -1]);
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
    wire.say(update(2, { events: [{ type: 'seatStatus', seat: 0, status: 'bot' }] }));
    expect(await left).toEqual({ ok: true });
    expect(heard).toEqual([{ events: [], info: { unlock: true, last: true }, bids: [2, -1] }]);
    wire.say(update(3, { events: [{ type: 'bidPlaced', seat: 1 }] }));
    expect(heard).toHaveLength(1);
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
    online = new Online(client);
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
    expect(heard).toEqual([{ events: [], info: { unlock: true, last: true }, bids: [null, null, null] }]);
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
      place: over.result.places[0],
      seats: 3,
      forfeited: false,
      delta: null,
    });
    // With the table gone there is nothing left to leave.
    expect(await online.leaveTable()).toMatchObject({ ok: false, code: 'NOT_IN_GAME' });
  });
});
