/* Ocho's wire, as docs/ocho-protocol.md writes it and `ocho-server` sends it. Ocho is not in
   `skt-protocol`, so there is nothing generated for it: these types follow the server's serde
   shapes (server/crates/ocho-server/src/room.rs, server/crates/ocho-engine/src/game.rs).

   A frame from the server is checked before the page uses it. A frame that is not one of the four
   kinds, or that lacks what its kind must carry, is dropped: the page draws only what it can read. */

export type Color = 'red' | 'blue' | 'green' | 'yellow';
export const COLORS: Color[] = ['red', 'blue', 'green', 'yellow'];

/** What is printed on a card besides its colour. */
export type Kind =
  | { number: number }
  | 'skip'
  | 'reverse'
  | 'draw2'
  | 'wild'
  | 'wildDraw4'
  | 'shield'
  | 'xRay'
  | 'deadRed'
  | 'booBlue';

/** The colour and symbol the next card has to match. `color`: only the colour matters. */
export type Sign = { number: number } | 'skip' | 'reverse' | 'draw2' | 'color' | 'deadRed' | 'booBlue';

export interface Card {
  id: number;
  /** A wild that names a colour has none. */
  color: Color | null;
  kind: Kind;
}

export type Must = 'chooseColor' | 'playOrDraw' | 'playDrawnOrKeep' | 'answerStack' | 'nextHand' | 'none';
export type Phase = 'chooseColor' | 'turn' | 'drawn' | 'between' | 'over';

/** What one seat is allowed to see. Another seat's hand is never in it. */
export interface View {
  you: number;
  phase: Phase;
  must: Must;
  hand: Card[];
  /** The partner's hand in a 2v2 match. Absent (null) otherwise. */
  partnerHand: Card[] | null;
  counts: number[];
  top: Card;
  drawCount: number;
  color: Color;
  symbol: Sign;
  /** 1 clockwise, -1 counter-clockwise. */
  direction: number;
  turn: number;
  legal: number[];
  /** An open draw total aimed at `turn`. */
  stack: number | null;
  /** The cards X-Ray showed this seat. Empty for everyone else. */
  xray: { seat: number; card: Card }[];
  scores: number[];
  handNo: number;
  target: number | null;
  handWinner: number | null;
  matchWinner: number | null;
  handPoints: number[] | null;
}

export interface Member {
  user: string;
  name: string;
  ready: boolean;
}

export interface Lobby {
  id: string;
  code: string;
  host: string;
  players: number;
  teams: boolean;
  firstTo500: boolean;
  /** In seat order: the first member is seat 0 once the hand is dealt. */
  members: Member[];
  started: boolean;
}

export type ErrorCode =
  | 'NOT_YOUR_TURN'
  | 'ILLEGAL_MOVE'
  | 'VALIDATION'
  | 'ALREADY_SEATED'
  | 'NOT_FOUND'
  | 'LOBBY_FULL'
  | 'NOT_SEATED'
  | 'GAME_RUNNING'
  | 'NOT_HOST'
  | 'NOT_READY'
  | 'NOT_STARTED'
  | 'INTERNAL';

export type ServerFrame =
  | { t: 'ok'; re: number }
  | { t: 'err'; re: number; code: string; message: string }
  | { t: 'ocho.lobby'; lobby: Lobby }
  | { t: 'ocho.view'; view: View };

/** A frame to the server, without its correlation id. */
export type Intent =
  | { t: 'ocho.create'; players: number; teams: boolean; match: 'one' | 'to500' }
  | { t: 'ocho.join'; code: string }
  | { t: 'ocho.leave' }
  | { t: 'ocho.ready'; ready: boolean }
  | { t: 'ocho.start' }
  | { t: 'ocho.play'; card: number; color?: Color }
  | { t: 'ocho.draw' }
  | { t: 'ocho.keep' }
  | { t: 'ocho.color'; color: Color }
  | { t: 'ocho.next' };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const ints = (v: unknown): number[] | null => (Array.isArray(v) && v.every(isInt) ? v : null);
const optional = <T>(v: unknown, read: (v: unknown) => T | null): T | null | undefined =>
  v === null || v === undefined ? null : (read(v) ?? undefined);

function color(v: unknown): Color | null {
  return COLORS.find((c) => c === v) ?? null;
}

const KINDS = ['skip', 'reverse', 'draw2', 'wild', 'wildDraw4', 'shield', 'xRay', 'deadRed', 'booBlue'] as const;
const SYMBOLS = ['skip', 'reverse', 'draw2', 'color', 'deadRed', 'booBlue'] as const;

function numbered(v: unknown): { number: number } | null {
  return isObj(v) && isInt(v.number) && v.number >= 0 && v.number <= 9 ? { number: v.number } : null;
}

function kind(v: unknown): Kind | null {
  return KINDS.find((k) => k === v) ?? numbered(v);
}

function symbol(v: unknown): Sign | null {
  return SYMBOLS.find((s) => s === v) ?? numbered(v);
}

function card(v: unknown): Card | null {
  if (!isObj(v) || !isInt(v.id)) return null;
  const k = kind(v.kind);
  const c = v.color === null || v.color === undefined ? null : color(v.color);
  if (k == null || (c == null && v.color != null)) return null;
  return { id: v.id, color: c, kind: k };
}

function cards(v: unknown): Card[] | null {
  if (!Array.isArray(v)) return null;
  const out: Card[] = [];
  for (const item of v) {
    const c = card(item);
    if (!c) return null;
    out.push(c);
  }
  return out;
}

const MUSTS: Must[] = ['chooseColor', 'playOrDraw', 'playDrawnOrKeep', 'answerStack', 'nextHand', 'none'];
const PHASES: Phase[] = ['chooseColor', 'turn', 'drawn', 'between', 'over'];

export function parseView(v: unknown): View | null {
  if (!isObj(v)) return null;
  const must = MUSTS.find((m) => m === v.must);
  const phase = PHASES.find((p) => p === v.phase);
  const hand = cards(v.hand);
  const partnerHand = optional(v.partnerHand, cards);
  const counts = ints(v.counts);
  const top = card(v.top);
  const c = color(v.color);
  const s = symbol(v.symbol);
  const legal = ints(v.legal);
  const scores = ints(v.scores);
  const handPoints = optional(v.handPoints, ints);
  const stack = optional(v.stack, (x) => (isInt(x) ? x : null));
  const target = optional(v.target, (x) => (isInt(x) ? x : null));
  const handWinner = optional(v.handWinner, (x) => (isInt(x) ? x : null));
  const matchWinner = optional(v.matchWinner, (x) => (isInt(x) ? x : null));
  if (!Array.isArray(v.xray)) return null;
  const xray: View['xray'] = [];
  for (const item of v.xray) {
    const shown = isObj(item) && isInt(item.seat) ? card(item.card) : null;
    if (!shown || !isObj(item) || !isInt(item.seat)) return null;
    xray.push({ seat: item.seat, card: shown });
  }
  if (
    must === undefined ||
    phase === undefined ||
    !hand ||
    partnerHand === undefined ||
    !counts ||
    !top ||
    !c ||
    !s ||
    !legal ||
    !scores ||
    handPoints === undefined ||
    stack === undefined ||
    target === undefined ||
    handWinner === undefined ||
    matchWinner === undefined ||
    !isInt(v.you) ||
    !isInt(v.drawCount) ||
    !isInt(v.direction) ||
    !isInt(v.turn) ||
    !isInt(v.handNo)
  )
    return null;
  return {
    you: v.you,
    phase,
    must,
    hand,
    partnerHand,
    counts,
    top,
    drawCount: v.drawCount,
    color: c,
    symbol: s,
    direction: v.direction,
    turn: v.turn,
    legal,
    stack,
    xray,
    scores,
    handNo: v.handNo,
    target,
    handWinner,
    matchWinner,
    handPoints,
  };
}

export function parseLobby(v: unknown): Lobby | null {
  if (!isObj(v) || !Array.isArray(v.members)) return null;
  const members: Member[] = [];
  for (const m of v.members) {
    if (!isObj(m) || !isStr(m.user) || !isStr(m.name) || !isBool(m.ready)) return null;
    members.push({ user: m.user, name: m.name, ready: m.ready });
  }
  if (
    !isStr(v.id) ||
    !isStr(v.code) ||
    !isStr(v.host) ||
    !isInt(v.players) ||
    !isBool(v.teams) ||
    !isBool(v.firstTo500) ||
    !isBool(v.started)
  )
    return null;
  return {
    id: v.id,
    code: v.code,
    host: v.host,
    players: v.players,
    teams: v.teams,
    firstTo500: v.firstTo500,
    members,
    started: v.started,
  };
}

/** One text frame from the server, or null when it is not one the page can read. */
export function parseFrame(data: unknown): ServerFrame | null {
  if (typeof data !== 'string') return null;
  let v: unknown;
  try {
    v = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isObj(v)) return null;
  switch (v.t) {
    case 'ok':
      return isInt(v.re) ? { t: 'ok', re: v.re } : null;
    case 'err':
      return isInt(v.re) && isStr(v.code) && isStr(v.message)
        ? { t: 'err', re: v.re, code: v.code, message: v.message }
        : null;
    case 'ocho.lobby': {
      const lobby = parseLobby(v.lobby);
      return lobby && { t: 'ocho.lobby', lobby };
    }
    case 'ocho.view': {
      const view = parseView(v.view);
      return view && { t: 'ocho.view', view };
    }
    default:
      return null;
  }
}
