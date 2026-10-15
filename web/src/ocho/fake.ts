/* A stand-in for Ocho's server in tests: a transport whose socket records what the page sends and
   lets the test push the frames `ocho-server` would. The views are built the way the server's serde
   writes them (server/crates/ocho-engine/src/game.rs). */
import type { Transport, Wire } from '../net/socket';
import type { Card, Lobby, View } from './wire';

export interface FakeOcho {
  transport: Transport;
  /** Every frame the page sent, parsed, in order. */
  sent: Record<string, unknown>[];
  /** Push one frame to the page. */
  push(frame: unknown): void;
  /** Answer the last frame the page sent with `ok`, or with `err`. */
  ok(): void;
  err(code: string, message: string): void;
  /** Drop the socket, as a lost network would. */
  drop(): void;
  /** How many sockets were opened. */
  opened: number;
}

export function fakeOcho(): FakeOcho {
  let wire: Wire | null = null;
  const fake: FakeOcho = {
    sent: [],
    opened: 0,
    transport: () => {
      fake.opened++;
      const made: Wire = {
        send: (data) => fake.sent.push(JSON.parse(data) as Record<string, unknown>),
        close: () => {},
        onmessage: null,
        onclose: null,
      };
      wire = made;
      return Promise.resolve(made);
    },
    push: (frame) => wire?.onmessage?.(JSON.stringify(frame)),
    ok: () => fake.push({ t: 'ok', re: fake.sent[fake.sent.length - 1]?.id }),
    err: (code, message) => fake.push({ t: 'err', re: fake.sent[fake.sent.length - 1]?.id, code, message }),
    drop: () => {
      const gone = wire;
      wire = null;
      gone?.onclose?.(1006);
    },
  };
  return fake;
}

export const card = (id: number, color: Card['color'], kind: Card['kind']): Card => ({ id, color, kind });

/** Seat 0's view of a free-for-all of `players`, on its turn, with a yellow 4 on the discard. */
export function aView(change: Partial<View> = {}, players = 8): View {
  return {
    you: 0,
    phase: 'turn',
    must: 'playOrDraw',
    hand: [
      card(10, 'red', { number: 3 }),
      card(11, 'yellow', { number: 7 }),
      card(12, 'blue', 'skip'),
      card(13, null, 'wild'),
    ],
    partnerHand: null,
    counts: Array.from({ length: players }, (_, i) => (i === 0 ? 4 : 8)),
    top: card(20, 'yellow', { number: 4 }),
    drawCount: 41,
    color: 'yellow',
    symbol: { number: 4 },
    direction: 1,
    turn: 0,
    legal: [11, 13],
    stack: null,
    xray: [],
    scores: Array.from({ length: players }, () => 0),
    handNo: 1,
    target: null,
    handWinner: null,
    matchWinner: null,
    handPoints: null,
    ...change,
  };
}

const NAMES = ['Remy', 'Ana', 'Ben', 'Cleo', 'Dev', 'Eli', 'Fay', 'Gus'];

/** A lobby of `players` seats with the first `seated` of NAMES in it. Remy (user u0) is the host. */
export function aLobby(change: Partial<Lobby> = {}, seated = 8, players = 8): Lobby {
  return {
    id: 'l1',
    code: 'K7QX2P',
    host: 'u0',
    players,
    teams: false,
    firstTo500: false,
    members: NAMES.slice(0, seated).map((name, i) => ({ user: `u${i}`, name, ready: true, bot: false })),
    started: false,
    ...change,
  };
}
