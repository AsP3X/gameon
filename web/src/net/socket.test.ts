/* The socket client against wires the test holds in its hand: every frame is written by the test,
   so the order and the timing are exact. docs/protocol.md §5.1 and §5.2. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { Welcome } from '../protocol/generated';
import { BACKOFF_MAX_MS, HELLO_TIMEOUT_MS, PING_MS, SILENCE_MS, SocketClient } from './socket';
import type { LinkEvent, Wire } from './socket';

interface TestWire extends Wire {
  /** What the client sent, parsed. */
  sent: { t: string; id: number; [key: string]: unknown }[];
  closedByClient: boolean;
  /** Write one frame to the client. */
  say(frame: object): void;
  /** Close from the server's side. */
  end(code?: number): void;
}

const NOW = 1_700_000_000_000;
const ME = {
  user: { id: 'u1', name: 'Guest 1', color: '#1cb0f6', tier: null },
  guest: true,
  username: null,
  active: null,
  cooldownUntil: null,
  stats: { games: 0, wins: 0, bidsMade: 0, bidsTotal: 0, bestScore: null },
  rating: null,
} as const;
const welcome = (serverTime: number): Welcome => ({
  t: 'welcome',
  me: ME,
  serverTime,
  lobby: null,
  queue: null,
  game: null,
});

let wires: TestWire[];
/** Whether the next connection attempts fail before a socket opens. */
let down: boolean;
let client: SocketClient;
let events: LinkEvent[];

function transport(): Promise<Wire> {
  if (down) return Promise.reject(new Error('down'));
  const wire: TestWire = {
    sent: [],
    closedByClient: false,
    onmessage: null,
    onclose: null,
    send(data) {
      wire.sent.push(JSON.parse(data) as TestWire['sent'][number]);
    },
    close() {
      wire.closedByClient = true;
    },
    say(frame) {
      wire.onmessage?.(JSON.stringify(frame));
    },
    end(code = 1006) {
      wire.onclose?.(code);
    },
  };
  wires.push(wire);
  return Promise.resolve(wire);
}
const tick = (ms = 0): Promise<void> => vi.advanceTimersByTimeAsync(ms).then(() => {});
const wire = (): TestWire => {
  const w = wires.at(-1);
  if (!w) throw new Error('No connection was opened');
  return w;
};
/** Answer the hello on the newest wire. */
function greet(serverTime = NOW): void {
  const w = wire();
  w.say({ t: 'ok', re: w.sent[0].id });
  w.say(welcome(serverTime));
}
async function online(): Promise<void> {
  client.start();
  await tick();
  greet();
}
const statuses = (): string[] => events.flatMap((e) => (e.type === 'status' ? [e.status] : []));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  wires = [];
  down = false;
  events = [];
  // random() = 0.5 makes the jitter factor exactly 1: the pauses are 500, 1000, 2000 ms and so on.
  client = new SocketClient({ transport, build: 'test', random: () => 0.5 });
  client.subscribe((e) => events.push(e));
});

afterEach(() => {
  client.stop();
  vi.useRealTimers();
});

describe('connecting', () => {
  it('says hello, takes ok then welcome, and is online only then', async () => {
    expect(client.status).toBe('idle');
    client.start();
    expect(client.status).toBe('connecting');
    await tick();
    expect(wire().sent).toEqual([{ t: 'hello', id: 1, protocol: 1, build: 'test' }]);
    wire().say({ t: 'ok', re: 1 });
    expect(client.status).toBe('connecting');
    wire().say(welcome(NOW));
    expect(client.status).toBe('online');
    // The snapshot is handed out before anybody is told the link is up.
    expect(events.map((e) => e.type)).toEqual(['status', 'welcome', 'status']);
    expect(statuses()).toEqual(['connecting', 'online']);
  });

  it('does not take a welcome that comes before the ok, and gives up on a hello nobody answers', async () => {
    client.start();
    await tick();
    wire().say(welcome(NOW));
    expect(client.status).toBe('connecting');
    await tick(HELLO_TIMEOUT_MS);
    expect(client.status).toBe('offline');
    expect(wire().closedByClient).toBe(true);
  });

  it('answers a request with OFFLINE while there is no welcomed socket, and sends nothing', async () => {
    expect(await client.request({ t: 'lobby.addBot' })).toMatchObject({ ok: false, code: 'OFFLINE' });
    client.start();
    await tick();
    expect(await client.request({ t: 'lobby.addBot' })).toMatchObject({ ok: false, code: 'OFFLINE' });
    expect(wire().sent.map((m) => m.t)).toEqual(['hello']);
  });

  it('stays down when the server does not speak its protocol', async () => {
    client.start();
    await tick();
    wire().say({ t: 'err', re: 1, code: 'PROTOCOL_UNSUPPORTED', message: 'Reload.' });
    expect(client.status).toBe('unsupported');
    await tick(BACKOFF_MAX_MS * 4);
    expect(wires).toHaveLength(1);
    client.retry(); // a reload is the way out, not another try
    await tick();
    expect(wires).toHaveLength(1);
  });

  it('stays down when another socket took over, until the player asks for this one', async () => {
    await online();
    wire().say({ t: 'superseded' });
    expect(client.status).toBe('superseded');
    await tick(BACKOFF_MAX_MS * 4);
    expect(wires).toHaveLength(1);
    client.retry();
    await tick();
    expect(wires).toHaveLength(2);
    greet();
    expect(client.status).toBe('online');

    // The same by close code alone, if the frame was lost.
    wire().end(4001);
    expect(client.status).toBe('superseded');
  });
});

describe('requests', () => {
  it('gives every id exactly one reply, whatever order they come back in', async () => {
    await online();
    const first = client.request({ t: 'lobby.ready', ready: true }),
      second = client.request({ t: 'lobby.start' });
    const [a, b] = wire().sent.slice(1);
    expect([a, b]).toEqual([
      { t: 'lobby.ready', id: 2, ready: true },
      { t: 'lobby.start', id: 3 },
    ]);
    wire().say({ t: 'err', re: b.id, code: 'NOT_READY', message: 'Not everyone is ready.' });
    wire().say({ t: 'ok', re: a.id });
    wire().say({ t: 'ok', re: a.id }); // a second reply to the same id answers nothing
    wire().say({ t: 'ok', re: 999 }); // and neither does one to an id never sent
    expect(await first).toEqual({ ok: true, reply: { t: 'ok', re: a.id } });
    expect(await second).toEqual({ ok: false, code: 'NOT_READY', message: 'Not everyone is ready.' });
    expect(events.filter((e) => e.type === 'reply')).toHaveLength(2);
  });

  it('hands out replies and pushes in the order the frames arrived, before any promise continues', async () => {
    await online();
    events.length = 0;
    const seen: string[] = [];
    client.subscribe((e) =>
      seen.push(e.type === 'reply' ? `reply ${e.reply.t}` : e.type === 'push' ? e.message.t : e.type),
    );
    void client.request({ t: 'game.ready' }).then(() => seen.push('promise'));
    const id = wire().sent[1].id;
    wire().say({ t: 'ok', re: id });
    wire().say({ t: 'game.update', gameId: 'g', rev: 1, events: [], view: {}, table: {} });
    wire().say({ t: 'lobby.unheard-of', x: 1 });
    expect(seen).toEqual(['reply ok', 'game.update']);
    await tick();
    expect(seen).toEqual(['reply ok', 'game.update', 'promise']);
  });
});

describe('the clock', () => {
  it('takes the server time from welcome, halfway between the hello and its answer', async () => {
    client.start();
    await tick();
    await tick(200);
    greet(NOW + 5100); // the server stamped it 100 ms after the hello left
    expect(client.serverNow()).toBe(Date.now() + 5000);
  });

  it('pings every 15 seconds, corrects the clock from the reply, and tells nobody about it', async () => {
    await online();
    events.length = 0;
    await tick(PING_MS);
    const ping = wire().sent.at(-1);
    expect(ping).toMatchObject({ t: 'ping' });
    await tick(40);
    wire().say({ t: 'ok', re: ping?.id, serverTime: NOW + PING_MS + 20 - 300 });
    expect(client.serverNow()).toBe(Date.now() - 300);
    expect(events).toEqual([]);
  });

  it('gives up on a socket that has been silent for 45 seconds', async () => {
    await online();
    await tick(SILENCE_MS);
    expect(client.status).toBe('offline');
    expect(wires[0].closedByClient).toBe(true);
  });
});

describe('a dropped connection', () => {
  it('reconnects with a pause that doubles, up to a ceiling, and starts short again after a welcome', async () => {
    await online();
    down = true;
    wire().end();
    expect(client.status).toBe('offline');
    const attempts: number[] = [];
    const real = transport;
    let last = Date.now();
    client.stop();
    client = new SocketClient({
      transport: () => {
        attempts.push(Date.now() - last);
        last = Date.now();
        return real();
      },
      build: 'test',
      random: () => 0.5,
    });
    client.subscribe((e) => events.push(e));
    client.start();
    await tick(60_000);
    expect(attempts.slice(0, 7)).toEqual([0, 500, 1000, 2000, 4000, 8000, 15000]);
    expect(attempts[7]).toBe(15000);

    down = false;
    const before = wires.length;
    while (wires.length === before) await tick(100);
    greet();
    expect(client.status).toBe('online');
    down = true;
    last = Date.now();
    attempts.length = 0;
    wire().end();
    await tick(600);
    expect(attempts).toEqual([500]);
  });

  it('ends every id waiting on the closed socket, forgets it, and sends nothing again on the next one', async () => {
    await online();
    const bid = client.request({ t: 'game.bid', at: { round: 0, trick: 0 }, bid: 2 });
    const old = wire(),
      id = old.sent[1].id;
    old.end();
    expect(await bid).toEqual({ ok: false, code: 'OFFLINE', message: 'Not connected to the server.' });
    expect(events.filter((e) => e.type === 'reply')).toEqual([]);

    await tick(500);
    expect(wires).toHaveLength(2);
    greet();
    expect(client.status).toBe('online');
    // The new socket carried a hello and nothing else: the bid was not sent a second time.
    expect(wire().sent.map((m) => m.t)).toEqual(['hello']);
    // Ids are never reused, so a stray reply to the old id cannot answer something new.
    const next = client.request({ t: 'game.ready' });
    expect(wire().sent[1].id).toBeGreaterThan(id);
    wire().say({ t: 'ok', re: id });
    old.say({ t: 'ok', re: wire().sent[1].id }); // and the old socket has nothing left to say
    let settled = false;
    void next.then(() => {
      settled = true;
    });
    await tick();
    expect(settled).toBe(false);
    expect(events.filter((e) => e.type === 'reply')).toEqual([]);
    // What the world looks like now is what the second welcome said.
    expect(events.filter((e) => e.type === 'welcome')).toHaveLength(2);
  });

  it('stops for good on stop(): no reconnect, and what was waiting is answered', async () => {
    await online();
    const waiting = client.request({ t: 'lobby.addBot' });
    client.stop();
    expect(await waiting).toMatchObject({ ok: false, code: 'OFFLINE' });
    expect(client.status).toBe('idle');
    expect(wire().closedByClient).toBe(true);
    await tick(BACKOFF_MAX_MS * 4);
    expect(wires).toHaveLength(1);
  });
});
