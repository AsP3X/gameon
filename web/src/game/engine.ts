/* Engine: a pure reducer, reduce(state, action) -> { state, events }, and view(state, seat),
   which is what one seat is allowed to see.
   Ported from the legacy build (legacy/Skull King Tavern.html, section 3) without changing behavior.

   This copy runs the offline modes only. Online, the server's Rust engine is the authority and the
   client never runs this to predict a result (docs/agent-rules/server-authority.md). */
import type { Ability, BotLevel, EngineEvent, Format, RoundRecord, Scoring, Seat } from '../protocol/generated';
import * as Rules from './rules';
import type { Action, GameConfig, GameState, PendingAbility, ReduceResult, SeatConfig, TableView } from './types';
import { clone, fill } from './util';

export const VERSION = 2;

// mulberry32: tiny, seedable, and the seed lives in state so replays are exact.
function rand(s: GameState): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function shuffle<T>(s: GameState, a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface CreateOptions {
  /** In clockwise order. */
  seats: SeatConfig[];
  scoring?: Scoring;
  loot?: boolean;
  kraken?: boolean;
  whale?: boolean;
  abilities?: boolean;
  /** Read by bots only. */
  level?: BotLevel;
  format?: Format;
  seed?: number;
}

export function create({
  seats,
  scoring = 'classic',
  loot = false,
  kraken = false,
  whale = false,
  abilities = false,
  level = 'normal',
  format = 'classic',
  seed = Date.now(),
}: CreateOptions): GameState {
  const cfg: GameConfig = { scoring, loot, kraken, whale, abilities, level, format };
  const deck = Rules.buildDeck(cfg);
  const max = Math.floor(deck.length / seats.length);
  const s: GameState = {
    version: VERSION,
    seats,
    cfg,
    deck,
    schedule: Rules.FORMATS[format].seq.map((c) => Math.min(c, max)),
    rng: seed >>> 0 || 1,
    round: -1,
    dealer: 0,
    phase: 'bidding',
    hands: [],
    pile: [],
    played: [],
    bids: [],
    won: [],
    trick: { leader: 0, plays: [] },
    turn: null,
    lastTrick: null,
    pending: null,
    giantSeat: null,
    giantUsed: false,
    log: [],
    roundPlays: [],
    peeked: [],
  };
  s.dealer = Math.floor(rand(s) * seats.length);
  startRound(s, true);
  return s;
}

function startRound(s: GameState, first = false): void {
  const n = s.seats.length;
  s.round++;
  if (!first) s.dealer = (s.dealer + 1) % n;
  const cards = s.schedule[s.round];
  const pile = shuffle(
    s,
    s.deck.map((c) => c.id),
  );
  s.hands = s.seats.map((_, i) => pile.slice(i * cards, (i + 1) * cards));
  s.pile = pile.slice(n * cards); // undealt: Smuggler draws from it, Seer peeks at it
  s.played = [];
  s.bids = fill<number | null>(n, null);
  s.won = fill(n, 0);
  s.trick = { leader: (s.dealer + 1) % n, plays: [] };
  s.turn = null;
  s.lastTrick = null;
  s.pending = null;
  s.giantSeat = null;
  s.giantUsed = false;
  s.roundPlays = [];
  s.peeked = s.seats.map(() => []);
  s.phase = 'bidding';
  s.log.push(Rules.newRecord(n, cards));
}

function endRound(s: GameState, ev: EngineEvent[]): void {
  const R = s.log[s.round];
  R.tricks = s.won.slice();
  R.done = true;
  s.phase = 'roundEnd';
  s.turn = null;
  ev.push({ type: 'roundEnded', round: s.round });
}

function startAbility(s: GameState, ev: EngineEvent[], pending: PendingAbility): void {
  s.phase = 'ability';
  s.turn = null;
  s.pending = pending;
  ev.push({ type: 'abilityStarted', kind: pending.kind, seat: pending.seat });
}

/** After a trick (and any ability): next trick, the Giant's end-of-round choice, or round end. */
function afterTrick(s: GameState, ev: EngineEvent[]): void {
  if (s.hands[0].length > 0) {
    s.phase = 'playing';
    s.turn = s.trick.leader;
    return;
  }
  if (s.giantSeat != null && !s.giantUsed) {
    s.giantUsed = true;
    startAbility(s, ev, { kind: 'giant', seat: s.giantSeat });
    return;
  }
  endRound(s, ev);
}

/**
 * Actions:
 *   {type:'bid', seat, bid}
 *   {type:'play', seat, card, as?}        as = 'pirate' | 'escape' for the Tigress
 *   {type:'ability', seat, choice}        helm: seat · smuggler: [card ids] · gambler: 0|10|20 · seer: none · giant: -1|0|1
 *   {type:'advance'}                      trickEnd -> next step, roundEnd -> next round
 *
 * The values are checked at run time as well as by the type: a saved game or a careless caller
 * must get an error back, never a broken state.
 */
export function reduce(prev: GameState, a: Action): ReduceResult {
  const s = clone(prev);
  const n = s.seats.length;
  const ev: EngineEvent[] = [];
  const R: RoundRecord = s.log[s.round];
  const fail = (error: string): ReduceResult => ({ error, state: prev, events: [] });
  const seatOk = (x: unknown): x is Seat => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < n;
  switch (a?.type) {
    case 'bid': {
      if (s.phase !== 'bidding') return fail('Not bidding now');
      if (!seatOk(a.seat) || s.bids[a.seat] != null) return fail('Seat cannot bid');
      if (!Number.isInteger(a.bid) || a.bid < 0 || a.bid > R.cards) return fail('Bid out of range');
      s.bids[a.seat] = a.bid;
      ev.push({ type: 'bidPlaced', seat: a.seat });
      if (s.bids.every((b) => b != null)) {
        R.bids = s.bids.slice();
        s.phase = 'playing';
        s.turn = s.trick.leader;
        ev.push({ type: 'bidsRevealed', bids: s.bids.map((b) => b ?? 0) });
      }
      break;
    }
    case 'play': {
      if (s.phase !== 'playing' || a.seat !== s.turn) return fail('Not your turn');
      const hand = s.hands[a.seat];
      const card = s.deck[a.card];
      if (!hand.includes(a.card)) return fail('Card not in hand');
      if (!Rules.legal(hand, s.trick.plays, s.deck).includes(a.card)) return fail('Must follow suit');
      const tigress = card.kind === 'tigress';
      if (tigress && a.as !== 'pirate' && a.as !== 'escape') return fail('Choose Pirate or Escape');
      hand.splice(hand.indexOf(a.card), 1);
      const play = tigress ? { seat: a.seat, card: a.card, as: a.as } : { seat: a.seat, card: a.card };
      s.trick.plays.push(play);
      s.roundPlays.push(play);
      s.played.push(a.card);
      ev.push({ type: 'cardPlayed', ...play });
      if (s.trick.plays.length < n) {
        s.turn = (s.turn + 1) % n;
        break;
      }
      const r = Rules.resolveTrick(s.trick.plays, s.deck);
      let ability: Ability | null = null;
      if (r.winner != null) {
        const w = r.winner;
        const c = r.captures;
        const wc = s.deck[s.trick.plays[r.winIndex].card];
        s.won[w]++;
        R.b14[w] += c.b14;
        R.mp[w] += c.mp;
        R.ps[w] += c.ps;
        if (c.black14) R.black14 = w;
        if (c.sm) R.sm = w;
        R.loot.push(...r.loot);
        if (s.cfg.abilities && wc.kind === 'pirate') ability = wc.ability;
      } else R.destroyed++;
      s.lastTrick = { plays: s.trick.plays.slice(), result: r, ability };
      s.phase = 'trickEnd';
      s.turn = null;
      ev.push({ type: 'trickResolved', winner: r.winner, effect: r.effect, ability });
      break;
    }
    case 'advance': {
      if (s.phase === 'trickEnd' && s.lastTrick) {
        const r = s.lastTrick.result;
        const ab = s.lastTrick.ability;
        const w = r.winner;
        const last = s.hands[0].length === 0;
        s.trick = { leader: r.leader, plays: [] };
        ev.push({ type: 'trickCollected', winner: w });
        // An ability only exists when a pirate won, so there is a winner whenever `ab` is set.
        if (ab === 'giant') s.giantSeat = w;
        if (ab === 'helm' && !last && w != null) startAbility(s, ev, { kind: 'helm', seat: w });
        else if (ab === 'smuggler' && !last && s.pile.length && w != null) {
          const drawn = s.pile.splice(0, 2);
          s.hands[w].push(...drawn);
          startAbility(s, ev, { kind: 'smuggler', seat: w, drawn });
        } else if (ab === 'gambler' && w != null) startAbility(s, ev, { kind: 'gambler', seat: w });
        else if (ab === 'seer' && !last && s.pile.length && w != null) {
          s.peeked[w] = s.pile.slice(); // the Seer keeps what they saw after the ability closes
          startAbility(s, ev, { kind: 'seer', seat: w });
        } else afterTrick(s, ev);
      } else if (s.phase === 'roundEnd') {
        if (s.round < s.schedule.length - 1) {
          startRound(s);
          ev.push({ type: 'roundStarted', round: s.round });
        } else {
          s.phase = 'gameOver';
          ev.push({ type: 'gameOver' });
        }
      } else return fail('Nothing to advance');
      break;
    }
    case 'ability': {
      const p = s.pending;
      if (s.phase !== 'ability' || !p || a.seat !== p.seat) return fail('No ability to use');
      const choice = a.choice;
      if (p.kind === 'helm') {
        if (!seatOk(choice)) return fail('Pick a pirate to lead');
        s.trick.leader = choice;
        ev.push({ type: 'abilityUsed', kind: 'helm', seat: p.seat, choice });
      } else if (p.kind === 'smuggler') {
        const hand = s.hands[p.seat];
        const count = p.drawn?.length ?? 0;
        if (
          !Array.isArray(choice) ||
          choice.length !== count ||
          new Set(choice).size !== choice.length ||
          !choice.every((id) => hand.includes(id))
        )
          return fail(`Discard exactly ${count}`);
        choice.forEach((id) => hand.splice(hand.indexOf(id), 1));
        ev.push({ type: 'abilityUsed', kind: 'smuggler', seat: p.seat, count: choice.length }); // what was discarded stays secret
      } else if (p.kind === 'gambler') {
        if (choice !== 0 && choice !== 10 && choice !== 20) return fail('Bet 0, 10 or 20');
        R.wager[p.seat] = choice;
        ev.push({ type: 'abilityUsed', kind: 'gambler', seat: p.seat, choice });
      } else if (p.kind === 'giant') {
        const from = s.bids[p.seat] ?? 0;
        if (choice !== -1 && choice !== 0 && choice !== 1) return fail('Change by 1 or keep');
        const to = from + choice;
        if (to < 0 || to > R.cards) return fail('Change by 1 or keep');
        R.giant = { seat: p.seat, from, to };
        s.bids[p.seat] = to;
        R.bids[p.seat] = to;
        ev.push({ type: 'abilityUsed', kind: 'giant', seat: p.seat, choice, from, to });
      } else {
        ev.push({ type: 'abilityUsed', kind: 'seer', seat: p.seat });
      }
      s.pending = null;
      afterTrick(s, ev);
      break;
    }
    default:
      return fail('Unknown action');
  }
  return { state: s, events: ev };
}

/**
 * A game read back from a save. One saved before the bots kept a memory of the round has no
 * `roundPlays` and no `peeked`: it gets them empty, and the bots count from the current trick on.
 */
export function restore(saved: Omit<GameState, 'roundPlays' | 'peeked'> & Partial<GameState>): GameState {
  return { ...saved, roundPlays: saved.roundPlays ?? [], peeked: saved.peeked ?? saved.seats.map(() => []) };
}

/** What one seat is allowed to see. Other hands become counts, open bids and the deck stay hidden. */
export function view(s: GameState, seat: Seat): TableView {
  const hiding = s.phase === 'bidding';
  const p = s.pending;
  const mine = p != null && p.seat === seat;
  return {
    me: seat,
    phase: s.phase,
    round: s.round,
    rounds: s.schedule.length,
    cards: s.schedule[s.round],
    seats: s.seats,
    cfg: s.cfg,
    deck: s.deck,
    dealer: s.dealer,
    turn: s.turn,
    hand: s.hands[seat].slice(),
    handCounts: s.hands.map((h) => h.length),
    played: s.played.slice(),
    bids: s.bids.map((b, i) => (hiding && i !== seat && b != null ? -1 : b)), // -1 = placed but secret
    won: s.won.slice(),
    trick: clone(s.trick),
    lastTrick: clone(s.lastTrick),
    log: clone(s.log),
    pending: p
      ? {
          kind: p.kind,
          seat: p.seat,
          ...(mine && p.drawn ? { drawn: p.drawn } : {}),
          ...(mine && p.kind === 'seer' ? { peek: s.pile.slice() } : {}),
        }
      : null,
    legal: s.phase === 'playing' && s.turn === seat ? Rules.legal(s.hands[seat], s.trick.plays, s.deck) : [],
  };
}
