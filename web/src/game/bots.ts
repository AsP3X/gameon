/* Bots: pick an action from public information plus their own hand.
   Ported from the legacy build (legacy/Skull King Tavern.html, section 4) without changing behavior,
   down to the order of the Math.random calls, so a reference test can compare the two move by move.

   A bot reads only state.hands[seat] and state.played, never another hand or the pile. */
import type { AbilityChoice, Card, CardId, PlayedAs, Seat } from '../protocol/generated';
import * as Rules from './rules';
import type { GameState, PlayChoice } from './types';
import { clamp } from './util';

/** Rough chance a card wins a trick at a 4-player table (Normal level). */
function staticPower(c: Card, as?: PlayedAs): number {
  switch (c.kind) {
    case 'sk':
      return 0.95;
    case 'pirate':
      return 0.82;
    case 'mermaid':
      return 0.6;
    case 'tigress':
      return as === 'escape' ? 0 : 0.74;
    case 'whale':
      return 0.25;
    case 'kraken':
      return 0.1;
    case 'escape':
      return 0;
    case 'loot':
      return 0.02;
    default:
      return c.suit === 'black' ? 0.3 + c.rank * 0.035 : Math.max(0.02, (c.rank - 7) / 12);
  }
}

/** Hard level: share of still-unseen cards this card beats head-to-head, raised to the number of rivals. */
function livePower(s: GameState, seat: Seat, id: CardId, as: PlayedAs | undefined, rivals: number): number {
  const known = new Set(s.hands[seat].concat(s.played));
  const unseen = s.deck.filter((c) => !known.has(c.id));
  const kind = s.deck[id].kind;
  if (!unseen.length || as === 'escape' || kind === 'escape' || kind === 'loot') return staticPower(s.deck[id], as);
  let beats = 0;
  unseen.forEach((u) => {
    const duel = [
      { seat: 0, card: id, as },
      { seat: 1, card: u.id, as: 'pirate' as const },
    ];
    if (Rules.resolveTrick(duel, s.deck).winner === 0) beats++;
  });
  return Math.pow(beats / unseen.length, Math.max(1, rivals));
}

type Power = (id: CardId, as?: PlayedAs) => number;

/** Win chance against a number of rivals still to play. Normal level scales the 4-player table by player count. */
function powerFn(s: GameState, seat: Seat, rivals: number): Power {
  return s.cfg.level === 'hard'
    ? (id, as) => livePower(s, seat, id, as, rivals)
    : (id, as) => Math.pow(staticPower(s.deck[id], as), Math.max(1, rivals) / 3);
}

export function bid(s: GameState, seat: Seat): number {
  const n = s.seats.length;
  const hand = s.hands[seat];
  const pw = powerFn(s, seat, n - 1);
  const expect = hand.reduce((a, id) => a + pw(id, 'pirate'), 0);
  if (s.cfg.level === 'easy') return clamp(Math.round(expect * 0.85 + (Math.random() - 0.5) * 2.2), 0, hand.length);
  return clamp(Math.round(expect + (Math.random() - 0.5) * (s.cfg.level === 'hard' ? 0.3 : 0.6)), 0, hand.length);
}

function options(s: GameState, seat: Seat): PlayChoice[] {
  const out: PlayChoice[] = [];
  Rules.legal(s.hands[seat], s.trick.plays, s.deck).forEach((id) => {
    if (s.deck[id].kind === 'tigress') out.push({ card: id, as: 'pirate' }, { card: id, as: 'escape' });
    else out.push({ card: id });
  });
  return out;
}

interface Scored {
  o: PlayChoice;
  win: boolean;
  p: number;
}

export function play(s: GameState, seat: Seat): PlayChoice {
  const plays = s.trick.plays;
  const deck = s.deck;
  const opts = options(s, seat);
  if (s.cfg.level === 'easy' && Math.random() < 0.35) return opts[Math.floor(Math.random() * opts.length)];
  const rivalsAfter = s.seats.length - 1 - plays.length;
  const pw = powerFn(s, seat, rivalsAfter);
  const scored: Scored[] = opts.map((o) => {
    const win = !plays.length || Rules.resolveTrick(plays.concat({ seat, ...o }), deck).winner === seat;
    return { o, win, p: win && rivalsAfter === 0 ? 1 : pw(o.card, o.as) };
  });
  const lo = (a: Scored[]): Scored => a.reduce((x, y) => (y.p < x.p ? y : x));
  const hi = (a: Scored[]): Scored => a.reduce((x, y) => (y.p > x.p ? y : x));
  const need = (s.bids[seat] ?? 0) - s.won[seat];
  const left = s.hands[seat].length;
  if (need > 0) {
    if (!plays.length) {
      const top = hi(scored);
      return (need >= left || top.p > 0.55 ? top : lo(scored)).o;
    }
    const wins = scored.filter((x) => x.win);
    if (wins.length) {
      if (rivalsAfter === 0) return lo(wins).o;
      const safe = wins.filter((x) => x.p >= 0.6);
      return (safe.length ? lo(safe) : need >= left ? hi(wins) : lo(wins)).o;
    }
    // can't win this one: dump the weakest card but keep escapes for later
    const keep = (x: Scored): number => {
      const kind = deck[x.o.card].kind;
      return kind === 'escape' || kind === 'loot' ? 0.5 : x.p;
    };
    return scored.reduce((a, b) => (keep(b) < keep(a) ? b : a)).o;
  }
  const loses = scored.filter((x) => !x.win);
  return (loses.length ? hi(loses) : lo(scored)).o; // shed the most dangerous card that still loses
}

export function ability(s: GameState, seat: Seat): AbilityChoice {
  const p = s.pending;
  if (!p) return null;
  const n = s.seats.length;
  const need = (s.bids[seat] ?? 0) - s.won[seat];
  const hand = s.hands[seat];
  const pw = (id: CardId): number => staticPower(s.deck[id], 'pirate');
  switch (p.kind) {
    case 'helm':
      return (seat + 1) % n; // the bot plays last: the most control
    case 'smuggler': {
      const count = p.drawn?.length ?? 0;
      const sorted = hand.slice().sort((a, b) => pw(a) - pw(b));
      return need > 0 ? sorted.slice(0, count) : sorted.slice(-count);
    }
    case 'gambler': {
      if (need < 0) return 0;
      if (!hand.length) return need === 0 ? 20 : 0;
      const gap = Math.abs(hand.reduce((a, id) => a + pw(id), 0) - need);
      return gap < 0.4 ? 20 : gap < 0.9 ? 10 : 0;
    }
    case 'giant':
      return clamp(s.won[seat] - (s.bids[seat] ?? 0), -1, 1);
    default:
      return null;
  }
}
