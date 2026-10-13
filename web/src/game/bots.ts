/* Bots: three levels that share one plan. The policy is the server's
   (server/crates/skt-engine/src/bots.rs), ported onto this engine so an offline table plays the way
   an online one does.

   The plan: count the tricks the hand can really win, bid that, then win what the bid still needs and
   duck the rest. Normal plays the plan on every card. Easy plays it too, and slips the way a beginner
   does. Hard plays the card Normal would, unless another card of the same kind leans on the next
   seat's bid without touching its own.

   A bot decides from what its seat can see: view(state, seat), the plays everybody saw this round,
   and the pile if the Seer showed it to this seat. It never reads another hand or the rest of the pile. */
import type { AbilityChoice, BotLevel, Card, CardId, Play, PlayedAs, Seat, Suit } from '../protocol/generated';
import { view } from './engine';
import * as Rules from './rules';
import type { GameState, PlayChoice, TableView } from './types';
import { clamp } from './util';

/** Where Easy's slips come from: a number in [0, 1). A test hands in its own. */
export type Rng = () => number;

/** What a seat decides from: its own view, and what it has already seen this round. */
interface Sight {
  v: TableView;
  /** Every face-up play of the round, in order. */
  plays: Play[];
  /** The pile the Seer showed this seat. */
  peeked: CardId[];
}

function sightOf(s: GameState, seat: Seat): Sight {
  return { v: view(s, seat), plays: s.roundPlays, peeked: s.peeked[seat] };
}

/** How a play stands against the seats still to come. */
type Kind = 'safe' | 'risky' | 'duck';
type Note = 'stopper' | 'escape' | 'kraken' | 'whale' | 'plain';
type Aim = 'duck' | 'cashSure' | 'mustTake';

interface Opt {
  play: PlayChoice;
  kind: Kind;
  note: Note;
  /** What taking with this card costs: the cheapest winner is spent first. */
  spend: number;
  /** How much the hand wants to be rid of this card when it ducks. */
  shed: number;
  /** Hard only: what the play does to the next seat's bid. */
  pressure: number;
  /** One of the tricks the hand counts on. */
  sure: boolean;
}

interface Read {
  players: number;
  /** The next seat clockwise, the one Hard leans on. */
  neighbor: Seat;
  rascal: boolean;
  level: BotLevel;
  /** Per seat, the suits it has shown it cannot follow. */
  voids: Set<Suit>[];
  /** Cards this seat has not seen: in another hand or in the pile. */
  unseen: Card[];
  /** Cards in the other hands. */
  holders: number;
}

interface Plan {
  /** Bid minus tricks taken. */
  need: number;
  left: number;
  /** Tricks still to take: `need`, cut down to what the hand and the scoring allow. */
  target: number;
  sure: number;
  ducks: number;
  /** Rascal only: the round can no longer score, whatever is played. */
  doomed: boolean;
  /** Null while the next seat's bid is hidden. */
  neighborNeed: number | null;
  neighborChances: number;
}

/* ---------- reading the table ---------- */

/** A seat that played a numbered card off the lead suit cannot follow that suit. */
function noteVoids(plays: Play[], deck: Card[], voids: Set<Suit>[]): void {
  for (let start = 0; start < plays.length; start += voids.length) {
    const trick = plays.slice(start, start + voids.length);
    const lead = Rules.leadSuit(trick, deck);
    if (!lead) continue;
    for (const p of trick) {
      const c = deck[p.card];
      if (c.kind === 'num' && c.suit !== lead) voids[p.seat].add(lead);
    }
  }
}

function readOf({ v, plays, peeked }: Sight): Read {
  const players = v.handCounts.length;
  const voids = v.handCounts.map(() => new Set<Suit>());
  noteVoids(plays, v.deck, voids);
  noteVoids(v.trick.plays, v.deck, voids);
  const seen = new Set([...v.hand, ...v.played, ...peeked]);
  return {
    players,
    neighbor: (v.me + 1) % players,
    rascal: v.cfg.scoring === 'rascal',
    level: v.cfg.level,
    voids,
    unseen: v.deck.filter((c) => !seen.has(c.id)),
    holders: v.handCounts.reduce((sum, count, seat) => (seat === v.me ? sum : sum + count), 0),
  };
}

/** A seat's bid once it is known, or null while it is unplaced or still hidden. */
function bidOf(v: TableView, seat: Seat): number | null {
  const bid = v.bids[seat];
  return bid != null && bid >= 0 ? bid : null;
}

function targetTakes(need: number, left: number, rascal: boolean): number {
  if (need <= 0) return 0;
  if (need <= left) return need;
  if (rascal) return need === left + 1 ? left : 0; // one short still glances; further off, nothing does
  return left;
}

function planOf(v: TableView, read: Read): Plan {
  const mine = bidOf(v, v.me);
  const need = mine == null ? 0 : mine - v.won[v.me];
  const left = v.hand.length;
  const theirs = bidOf(v, read.neighbor);
  const played = v.trick.plays.some((p) => p.seat === read.neighbor);
  return {
    need,
    left,
    target: targetTakes(need, left, read.rascal),
    sure: sureCount(v.hand, v.deck, read),
    ducks: v.hand.filter((id) => ['escape', 'loot', 'kraken'].includes(v.deck[id].kind)).length,
    doomed: read.rascal && (need <= -2 || need > left + 1),
    neighborNeed: theirs == null ? null : theirs - v.won[read.neighbor],
    neighborChances: v.handCounts[read.neighbor] + (played ? 1 : 0),
  };
}

/* ---------- counting the hand ---------- */

/** How many of the unseen cards that match are expected in the other hands, not in the pile. */
function expected(read: Read, match: (c: Card) => boolean): number {
  const count = read.unseen.filter(match).length;
  const unseen = read.unseen.length;
  if (unseen <= 0 || count <= 0 || read.holders <= 0) return 0;
  return Math.floor((count * Math.min(read.holders, unseen) + Math.floor(unseen / 2)) / unseen);
}

/** The card's rank when it is a number of that suit, else 0. */
const rankIn = (c: Card, suit: Suit): number => (c.kind === 'num' && c.suit === suit ? c.rank : 0);
const beatsBlack = (c: Card): boolean =>
  c.kind === 'pirate' || c.kind === 'tigress' || c.kind === 'sk' || c.kind === 'mermaid';
const SIDE_SUITS: readonly Suit[] = ['green', 'yellow', 'purple'];

/** A black number counts when nothing higher and no character is expected. An expected character is spent on the first one. */
function trumpTricks(cards: Card[], read: Read): number {
  const ranks = cards
    .map((c) => rankIn(c, 'black'))
    .filter((rank) => rank > 0)
    .sort((a, b) => b - a);
  let specials = expected(read, beatsBlack);
  let tricks = 0;
  for (const rank of ranks) {
    const higher = expected(read, (c) => rankIn(c, 'black') > rank);
    if (higher === 0 && specials === 0) tricks++;
    else if (higher === 0) specials--;
  }
  return tricks;
}

/** The best card of a side suit counts only when nothing at all is expected to beat it. */
function sideTricks(cards: Card[], read: Read): number {
  const trumps = expected(read, (c) => rankIn(c, 'black') > 0) + expected(read, beatsBlack);
  let tricks = 0;
  for (const suit of SIDE_SUITS) {
    const best = Math.max(0, ...cards.map((c) => rankIn(c, suit)));
    if (best > 0 && trumps + expected(read, (c) => rankIn(c, suit) > best) === 0) tricks++;
  }
  return tricks;
}

/** The tricks this hand can count on. */
function sureCount(hand: CardId[], deck: Card[], read: Read): number {
  const cards = hand.map((id) => deck[id]);
  let tricks = cards.filter((c) => c.kind === 'pirate' || c.kind === 'tigress').length;
  if (cards.some((c) => c.kind === 'sk')) {
    const mermaids = expected(read, (c) => c.kind === 'mermaid');
    if (mermaids === 0 || (read.level === 'hard' && mermaids <= 1 && read.players <= 3)) tricks++;
  }
  return Math.min(tricks + trumpTricks(cards, read) + sideTricks(cards, read), hand.length);
}

/* ---------- ranking the legal plays ---------- */

function optionsOf(v: TableView): PlayChoice[] {
  const out: PlayChoice[] = [];
  Rules.legal(v.hand, v.trick.plays, v.deck).forEach((id) => {
    if (v.deck[id].kind === 'tigress') out.push({ card: id, as: 'pirate' }, { card: id, as: 'escape' });
    else out.push({ card: id });
  });
  return out;
}

function noteOf(c: Card, as?: PlayedAs): Note {
  switch (c.kind) {
    case 'kraken':
    case 'whale':
      return c.kind;
    case 'escape':
    case 'loot':
      return 'escape';
    case 'tigress':
      return as === 'escape' ? 'escape' : 'stopper';
    case 'num':
      return c.suit === 'black' && c.rank >= 12 ? 'stopper' : 'plain';
    default:
      return 'stopper';
  }
}

function spendOf(c: Card, as?: PlayedAs): number {
  switch (c.kind) {
    case 'escape':
    case 'loot':
      return 0;
    case 'tigress':
      return as === 'escape' ? 0 : 80;
    case 'num':
      return c.suit === 'black' ? 30 + c.rank : c.rank;
    case 'mermaid':
      return 60;
    case 'whale':
      return 70;
    case 'pirate':
      return 80;
    case 'kraken':
      return 90;
    default:
      return 100;
  }
}

function shedOf(c: Card, note: Note, sure: boolean, target: number): number {
  if (target > 0 && (sure || note === 'stopper')) return 0; // still needed: keep it
  switch (note) {
    case 'kraken':
      return 80;
    case 'escape':
      return 40;
    case 'whale':
      return 20;
    default:
      return c.kind === 'num' ? (c.suit === 'black' ? 300 : 200) + c.rank : 400;
  }
}

/** The seats still to play to this trick. */
function rivalsOf(v: TableView): Seat[] {
  return v.handCounts.flatMap((_, seat) => (seat === v.me || v.trick.plays.some((p) => p.seat === seat) ? [] : [seat]));
}

const withPlay = (v: TableView, o: PlayChoice): Play[] => v.trick.plays.concat({ seat: v.me, ...o });

/** Can a seat still to play beat this card with a card nobody has seen and that it could legally hold? */
function threatened(v: TableView, o: PlayChoice, rivals: Seat[], read: Read): boolean {
  const base = withPlay(v, o);
  const lead = Rules.leadSuit(base, v.deck);
  return read.unseen.some((c) =>
    rivals.some((rival) => {
      if (lead && read.voids[rival].has(lead) && rankIn(c, lead) > 0) return false;
      const reply: Play =
        c.kind === 'tigress' ? { seat: rival, card: c.id, as: 'pirate' } : { seat: rival, card: c.id };
      return Rules.resolveTrick(base.concat(reply), v.deck).winner !== v.me;
    }),
  );
}

function kindOf(leading: boolean, note: Note, wins: boolean, threat: boolean): Kind {
  if (note === 'escape' || note === 'kraken' || note === 'whale') return 'duck';
  if (leading) return !threat ? 'safe' : note === 'stopper' ? 'risky' : 'duck';
  return !wins ? 'duck' : threat ? 'risky' : 'safe';
}

/** Leading a duck into a suit the next seat cannot follow: good when they want no trick, bad when they need every one. */
function leadPressure(c: Card, need: number, chances: number, read: Read): number {
  if (c.kind !== 'num' || !read.voids[read.neighbor].has(c.suit)) return 0;
  if (need <= 0) return 2;
  return need >= Math.max(chances, 1) ? -3 : 0;
}

/** Playing last: what it does to the next seat's bid whether or not they take this trick. */
function bidPressure(need: number, chances: number, theyWin: boolean, rascal: boolean): number {
  if (rascal && (need <= -2 || need > chances)) return 0;
  if (need <= 0) return theyWin ? 5 : -2;
  if (need > chances) return theyWin ? 0 : 2;
  if (need === chances) return theyWin ? -3 : 5;
  return theyWin ? -2 : 1;
}

function pressureOf(v: TableView, o: PlayChoice, kind: Kind, rivals: Seat[], read: Read, plan: Plan): number {
  const need = plan.neighborNeed;
  if (need == null) return 0;
  let pressure = 0;
  if (!v.trick.plays.length && kind === 'duck')
    pressure += leadPressure(v.deck[o.card], need, plan.neighborChances, read);
  if (!rivals.length) {
    const theyWin = Rules.resolveTrick(withPlay(v, o), v.deck).winner === read.neighbor;
    pressure += bidPressure(need, plan.neighborChances, theyWin, read.rascal);
  }
  return pressure;
}

function rank(v: TableView, o: PlayChoice, read: Read, plan: Plan): Opt {
  const c = v.deck[o.card];
  const note = noteOf(c, o.as);
  const rivals = rivalsOf(v);
  const leading = !v.trick.plays.length;
  const wins = !leading && Rules.resolveTrick(withPlay(v, o), v.deck).winner === v.me;
  const kind = kindOf(leading, note, wins, rivals.length > 0 && threatened(v, o, rivals, read));
  const rest = v.hand.slice();
  rest.splice(rest.indexOf(o.card), 1);
  const sure = plan.sure > sureCount(rest, v.deck, read);
  return {
    play: o,
    kind,
    note,
    spend: spendOf(c, o.as),
    shed: shedOf(c, note, sure, plan.target),
    pressure: read.level === 'hard' ? pressureOf(v, o, kind, rivals, read, plan) : 0,
    sure,
  };
}

/* ---------- choosing ---------- */

function aimOf(opts: Opt[], plan: Plan): Aim {
  if (plan.target <= 0) return 'duck';
  if (plan.target >= plan.left || plan.sure < plan.target) return 'mustTake';
  return opts.some((x) => x.kind === 'safe' && x.sure) ? 'cashSure' : 'duck';
}

/** The first of the best: cheapest when taking, most dangerous when ducking. On Hard, pressure comes first. */
function best(opts: Opt[], taking: boolean, hard: boolean): Opt {
  return opts.reduce((chosen, x) => {
    if (hard && x.pressure !== chosen.pressure) return x.pressure > chosen.pressure ? x : chosen;
    return (taking ? x.spend < chosen.spend : x.shed > chosen.shed) ? x : chosen;
  });
}

/** Hard may choose any card once the round can no longer score, and otherwise only a card from the plan. */
function pick(opts: Opt[], aim: Aim, hard: boolean, doomed: boolean): Opt {
  if (doomed) return best(opts, false, true);
  if (aim === 'duck') {
    const ducks = opts.filter((x) => x.kind === 'duck');
    return ducks.length ? best(ducks, false, hard) : best(opts, true, hard);
  }
  let pool: Opt[];
  if (aim === 'cashSure') pool = opts.filter((x) => x.kind === 'safe' && x.sure);
  else {
    pool = opts.filter((x) => x.kind === 'safe');
    if (!pool.length) pool = opts.filter((x) => x.kind === 'risky');
  }
  return best(pool.length ? pool : opts, true, hard);
}

/** The last of the most expensive, the order the server's bots break that tie in. */
const dearest = (opts: Opt[]): Opt | undefined =>
  opts.reduce<Opt | undefined>((a, b) => (a && a.spend > b.spend ? a : b), undefined);

/**
 * Easy's mistakes, in order: the first one that can happen and whose roll comes up is played.
 * A slip that cannot happen draws no number.
 */
function easySlip(v: TableView, opts: Opt[], chosen: Opt, plan: Plan, rng: Rng): Opt {
  const stopper = !v.trick.plays.length && plan.target > 0 ? dearest(opts.filter((x) => x.note === 'stopper')) : null;
  if (stopper && rng() < 0.33) return stopper; // leads the big card
  const take = chosen.kind === 'duck' ? dearest(opts.filter((x) => x.kind !== 'duck')) : null;
  if (take && rng() < 0.25) return take; // takes a trick it meant to duck, with the dearest winner
  const escape = chosen.note !== 'escape' ? opts.find((x) => x.note === 'escape' && x.kind === 'duck') : null;
  if (escape && rng() < 0.2) return escape; // wastes an escape
  const kraken = chosen.note !== 'kraken' ? opts.find((x) => x.note === 'kraken') : null;
  if (kraken && rng() < 0.5) return kraken; // throws the Kraken away
  const pirate =
    chosen.note === 'escape' && v.deck[chosen.play.card].kind === 'tigress'
      ? opts.find((x) => x.play.card === chosen.play.card && x.play.as === 'pirate')
      : null;
  if (pirate && rng() < 0.33) return pirate; // calls the Tigress a pirate
  return chosen;
}

/* ---------- the three decisions ---------- */

export function bid(s: GameState, seat: Seat, rng: Rng = Math.random): number {
  const sight = sightOf(s, seat);
  const { v } = sight;
  const read = readOf(sight);
  const plan = planOf(v, read);
  const cards = v.hand.map((id) => v.deck[id]);
  let tricks = plan.sure;
  if (tricks === 0 && plan.ducks === 0 && cards.some((c) => rankIn(c, 'black') >= 12)) tricks = 1;
  if (read.level === 'easy') {
    const slip = rng();
    if (slip < 0.5) {
      if (cards.some((c) => c.kind === 'mermaid')) tricks++;
      if (cards.some((c) => c.kind === 'num' && c.suit !== 'black' && c.rank >= 13)) tricks++;
    }
    if (slip < 0.25 && tricks === 0 && cards.length) tricks = 1;
  }
  return clamp(tricks, 0, cards.length);
}

export function play(s: GameState, seat: Seat, rng: Rng = Math.random): PlayChoice {
  const sight = sightOf(s, seat);
  const { v } = sight;
  const options = optionsOf(v);
  if (options.length === 1) return options[0];
  const read = readOf(sight);
  const plan = planOf(v, read);
  const ranked = options.map((o) => rank(v, o, read, plan));
  const hard = read.level === 'hard';
  const chosen = pick(ranked, aimOf(ranked, plan), hard, hard && plan.doomed);
  return (read.level === 'easy' ? easySlip(v, ranked, chosen, plan, rng) : chosen).play;
}

/** Bet 20 only when the counted tricks are exactly the need and every other card can be ducked. */
function gamblerStake(plan: Plan, level: BotLevel, rng: Rng): number {
  const blind = (): number => (level === 'easy' && rng() < 0.25 ? 20 : 0);
  if (!plan.left) return plan.need === 0 ? 20 : 0;
  if (plan.need < 0) return blind();
  const loose = Math.max(plan.left - plan.sure, 0);
  if (plan.sure === plan.need && plan.ducks >= loose) return 20;
  if (level === 'hard' && plan.sure === plan.need && plan.ducks + 1 >= loose) return 10;
  return blind();
}

export function ability(s: GameState, seat: Seat, rng: Rng = Math.random): AbilityChoice {
  const sight = sightOf(s, seat);
  const { v } = sight;
  const p = v.pending;
  if (!p || p.seat !== seat) return null;
  const read = readOf(sight);
  const plan = planOf(v, read);
  const easy = read.level === 'easy';
  switch (p.kind) {
    case 'helm':
      return easy && rng() < 0.4 ? seat : read.neighbor; // the next seat leads, so this one plays last
    case 'smuggler': {
      // Throw the low cards away while tricks are needed, the high ones once the bid is safe.
      const low = plan.target > 0 !== (easy && rng() < 0.3);
      const cost = (id: CardId): number => spendOf(v.deck[id], 'pirate');
      const sorted = v.hand.slice().sort((a, b) => (low ? cost(a) - cost(b) : cost(b) - cost(a)) || a - b);
      return sorted.slice(0, p.drawn?.length ?? 0);
    }
    case 'gambler':
      return gamblerStake(plan, read.level, rng);
    case 'giant': {
      const from = bidOf(v, seat) ?? 0;
      const toward = clamp(v.won[seat] - from, -1, 1);
      const fits = (change: number): boolean => from + change >= 0 && from + change <= v.cards;
      const change = easy && rng() < 0.5 ? 0 - toward : toward;
      return fits(change) ? change : fits(toward) ? toward : 0;
    }
    default:
      return null;
  }
}
