/* Rules: pure card, trick and scoring logic. No state.
   Ported from the legacy build (legacy/Skull King Tavern.html, section 2) without changing behavior;
   fixtures/engine pins it, and the Rust engine on the server replays the same fixtures. */
import type {
  Ability,
  Beast,
  Captures,
  Card,
  CardId,
  Format,
  LootMove,
  Play,
  PlayedAs,
  RoundRecord,
  Suit,
  TrickResult,
} from '../protocol/generated';
import type { DeckConfig, Score, ScoreConfig, ScoreRecord } from './types';
import { fill } from './util';

type Kind = Card['kind'];
/** How a card behaves once it is on the table: the Tigress has picked, Loot acts as an Escape. */
export type Role = Exclude<Kind, 'tigress' | 'loot'>;

export const SUITS: readonly Suit[] = ['green', 'yellow', 'purple', 'black'];
export const SUIT_NAME: Record<Suit, string> = {
  green: 'Parrot',
  yellow: 'Chest',
  purple: 'Map',
  black: 'Jolly Roger',
};
export const LABEL: Record<Exclude<Kind, 'num'>, string> = {
  escape: 'Escape',
  pirate: 'Pirate',
  tigress: 'Tigress',
  sk: 'Skull King',
  mermaid: 'Mermaid',
  loot: 'Loot',
  kraken: 'Kraken',
  whale: 'White Whale',
};
export const SHORT: Record<Exclude<Kind, 'num'>, string> = {
  escape: 'Escape',
  pirate: 'Pirate',
  tigress: 'Tigress',
  sk: 'King',
  mermaid: 'Mermaid',
  loot: 'Loot',
  kraken: 'Kraken',
  whale: 'Whale',
};
/** Pirate abilities trigger when that Pirate WINS a trick (not when captured). */
export const ABILITY: Record<Ability, { name: string; short: string; desc: string }> = {
  helm: { name: 'Helmsman', short: 'Helm', desc: 'Choose who leads the next trick.' },
  smuggler: { name: 'Smuggler', short: 'Swap', desc: 'Draw 2 cards from the deck, then discard 2.' },
  gambler: {
    name: 'Gambler',
    short: 'Bet',
    desc: 'Bet 0, 10 or 20 points: won if you make your bid, lost if not.',
  },
  seer: { name: 'Seer', short: 'Seer', desc: 'Secretly look at the cards nobody was dealt.' },
  giant: { name: 'Giant', short: 'Giant', desc: 'At the end of the round, change your bid by 1 or keep it.' },
};
export const ABILITY_ORDER: readonly Ability[] = ['helm', 'smuggler', 'gambler', 'seer', 'giant'];
export const FORMATS: Record<Format, { name: string; desc: string; seq: number[] }> = {
  classic: { name: 'Classic', desc: '10 rounds, 1 to 10 cards', seq: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  brawl: { name: 'Skip to the Brawl', desc: 'One round each of 6 to 10', seq: [6, 7, 8, 9, 10] },
  swift: { name: 'Swift-n-Salty', desc: 'Five rounds of 5 cards', seq: [5, 5, 5, 5, 5] },
  even: { name: 'Even Keeled', desc: 'Two rounds each of 2, 4, 6, 8, 10', seq: [2, 2, 4, 4, 6, 6, 8, 8, 10, 10] },
  whirl: { name: 'Whirlpool', desc: 'Two each of 9, 7, 5, 3, 1', seq: [9, 9, 7, 7, 5, 5, 3, 3, 1, 1] },
};

/** 70-card 2021 deck plus optional advanced cards. Card ids are array indexes. */
export function buildDeck(cfg: DeckConfig): Card[] {
  const deck: Card[] = [];
  SUITS.forEach((suit) => {
    for (let rank = 1; rank <= 14; rank++) deck.push({ id: deck.length, kind: 'num', suit, rank });
  });
  for (let i = 0; i < 5; i++) deck.push({ id: deck.length, kind: 'escape' });
  ABILITY_ORDER.forEach((ability) => deck.push({ id: deck.length, kind: 'pirate', ability }));
  deck.push({ id: deck.length, kind: 'tigress' });
  deck.push({ id: deck.length, kind: 'sk' });
  deck.push({ id: deck.length, kind: 'mermaid' });
  deck.push({ id: deck.length, kind: 'mermaid' });
  if (cfg.loot) {
    deck.push({ id: deck.length, kind: 'loot' });
    deck.push({ id: deck.length, kind: 'loot' });
  }
  if (cfg.kraken) deck.push({ id: deck.length, kind: 'kraken' });
  if (cfg.whale) deck.push({ id: deck.length, kind: 'whale' });
  return deck;
}

/** How a played card behaves in a trick. Tigress picks, Loot acts as an Escape. */
export function role(card: Card, as?: PlayedAs): Role {
  if (card.kind === 'tigress') return as === 'pirate' ? 'pirate' : 'escape';
  if (card.kind === 'loot') return 'escape';
  return card.kind;
}

export function cardName(c: Card, { as, abilities }: { as?: PlayedAs; abilities?: boolean } = {}): string {
  if (c.kind === 'num') return `${SUIT_NAME[c.suit]} ${c.rank}`;
  if (c.kind === 'pirate' && abilities) return `${ABILITY[c.ability].name} (Pirate)`;
  return LABEL[c.kind] + (c.kind === 'tigress' && as ? ` as ${as === 'pirate' ? 'Pirate' : 'Escape'}` : '');
}

/** The suit to follow: set by the first numbered card, unless a character or beast got there first. */
export function leadSuit(plays: Play[], deck: Card[]): Suit | null {
  for (const p of plays) {
    const c = deck[p.card];
    if (role(c, p.as) === 'escape') continue;
    return c.kind === 'num' ? c.suit : null;
  }
  return null;
}

const isSuit = (card: Card, suit: Suit): boolean => card.kind === 'num' && card.suit === suit;

export function legal(hand: CardId[], plays: Play[], deck: Card[]): CardId[] {
  const ls = leadSuit(plays, deck);
  if (!ls || !hand.some((id) => isSuit(deck[id], ls))) return hand.slice();
  return hand.filter((id) => deck[id].kind !== 'num' || isSuit(deck[id], ls));
}

/** Index of the play currently winning, ignoring beasts. */
function standing(plays: Play[], deck: Card[]): number {
  const roles = plays.map((p) => role(deck[p.card], p.as));
  const sk = roles.indexOf('sk');
  const mer = roles.indexOf('mermaid');
  const pir = roles.indexOf('pirate');
  if (sk >= 0 && mer >= 0) return mer; // a Mermaid always catches the Skull King
  if (sk >= 0) return sk;
  if (pir >= 0) return pir;
  if (mer >= 0) return mer;
  let best = -1;
  plays.forEach((p, i) => {
    const c = deck[p.card];
    if (c.kind !== 'num') return;
    if (best < 0) {
      best = i;
      return;
    }
    const b = deck[plays[best].card];
    if (b.kind !== 'num') return;
    if (c.suit === 'black' && b.suit !== 'black') best = i;
    else if (c.suit === b.suit && c.rank > b.rank) best = i;
  });
  return best >= 0 ? best : 0; // all escapes: first card wins
}

const beastOf = (card: Card): Beast | null => (card.kind === 'kraken' || card.kind === 'whale' ? card.kind : null);
const rankOf = (card: Card): number => (card.kind === 'num' ? card.rank : 0);

/** Full trick result. Works on a partial trick too (bots use it to test a play). */
export function resolveTrick(plays: Play[], deck: Card[]): TrickResult {
  const captures: Captures = { b14: 0, black14: false, mp: 0, ps: 0, sm: false };
  const loot: LootMove[] = [];
  const beasts = plays.filter((p) => beastOf(deck[p.card]) != null);
  const lastBeast = beasts.length ? beasts[beasts.length - 1] : null;
  const effect = lastBeast ? beastOf(deck[lastBeast.card]) : null; // the later beast wins their fight
  let wi: number;
  if (effect === 'kraken') {
    // would-be winner leads next
    return { winner: null, winIndex: -1, leader: plays[standing(plays, deck)].seat, effect, captures, loot };
  }
  if (lastBeast && effect === 'whale') {
    wi = -1;
    plays.forEach((p, i) => {
      const c = deck[p.card];
      if (c.kind === 'num' && (wi < 0 || c.rank > rankOf(deck[plays[wi].card]))) wi = i;
    });
    if (wi < 0) return { winner: null, winIndex: -1, leader: lastBeast.seat, effect, captures, loot };
  } else wi = standing(plays, deck);
  const w = plays[wi].seat;
  plays.forEach((p) => {
    const c = deck[p.card];
    if (c.kind === 'num' && c.rank === 14) {
      if (c.suit === 'black') captures.black14 = true;
      else captures.b14++;
    }
  });
  if (effect !== 'whale') {
    const roles = plays.map((p) => role(deck[p.card], p.as));
    const wr = roles[wi];
    if (wr === 'mermaid' && roles.includes('sk')) captures.sm = true;
    else if (wr === 'sk') captures.ps = roles.filter((r) => r === 'pirate').length;
    else if (wr === 'pirate') captures.mp = roles.filter((r) => r === 'mermaid').length;
  }
  plays.forEach((p) => {
    if (deck[p.card].kind === 'loot' && p.seat !== w) loot.push({ from: p.seat, to: w });
  });
  return { winner: w, winIndex: wi, leader: w, effect, captures, loot };
}

/* Round record — same shape as the scorekeeper app, so scoring is shared. */
export function newRecord(n: number, cards: number): RoundRecord {
  return {
    cards,
    bids: fill<number | null>(n, null),
    tricks: fill<number | null>(n, null),
    b14: fill(n, 0),
    mp: fill(n, 0),
    ps: fill(n, 0),
    wager: fill(n, 0),
    black14: -1,
    sm: -1,
    loot: [],
    destroyed: 0,
    giant: null,
    done: false,
  };
}

function rawBonus(R: RoundRecord, i: number): number {
  return 10 * R.b14[i] + (R.black14 === i ? 20 : 0) + 20 * R.mp[i] + 30 * R.ps[i] + (R.sm === i ? 40 : 0);
}

function lootBonus(R: RoundRecord, i: number): number {
  const hit = (x: number): boolean => R.bids[x] === R.tricks[x];
  return R.loot.reduce((a, l) => a + ((l.from === i || l.to === i) && hit(l.from) && hit(l.to) ? 20 : 0), 0);
}

/** One seat's score for one round, or null while its bid or its tricks are not known yet. */
export function scoreSeat(cfg: ScoreConfig, R: ScoreRecord, i: number): Score | null {
  const c = R.cards;
  const bid = R.bids[i];
  const t = R.tricks[i];
  if (bid == null || t == null) return null;
  const diff = Math.abs(bid - t);
  const hit = diff === 0;
  const raw = rawBonus(R, i) + lootBonus(R, i);
  let base: number;
  let bonus: number;
  let kind: Score['kind'];
  if (cfg.scoring === 'rascal' && cfg.cannonball && R.cannon && R.cannon[i]) {
    base = hit ? 15 * c : 0;
    bonus = hit ? raw : 0;
    kind = hit ? 'hit' : 'miss';
  } else if (cfg.scoring === 'rascal') {
    if (hit) {
      base = 10 * c;
      bonus = raw;
      kind = 'hit';
    } else if (diff === 1) {
      base = 5 * c;
      bonus = raw / 2;
      kind = 'glance';
    } else {
      base = 0;
      bonus = 0;
      kind = 'miss';
    }
  } else {
    base = bid === 0 ? (hit ? 10 * c : -10 * c) : hit ? 20 * bid : -10 * diff;
    bonus = hit ? raw : 0;
    kind = hit ? 'hit' : 'miss';
  }
  const w = (R.wager && R.wager[i]) || 0;
  const wager = w ? (hit ? w : -w) : 0;
  return { base, bonus, wager, total: base + bonus + wager, hit, diff, kind };
}

/** Running totals over the finished rounds of a log. */
export function totals(log: ScoreRecord[], cfg: ScoreConfig, n: number): number[] {
  const t = fill(n, 0);
  log.forEach((R) => {
    if (!R.done) return;
    for (let i = 0; i < n; i++) t[i] += scoreSeat(cfg, R, i)?.total ?? 0;
  });
  return t;
}
