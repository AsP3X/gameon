/* The three bot levels, on the cases the server's tests lock for the same policy
   (server/crates/skt-engine/src/tests.rs), and what a bot is allowed to know.

   Card ids, as buildDeck numbers them: green 0–13, yellow 14–27, purple 28–41, black 42–55,
   escapes 56–60, pirates 61–65 (helm, smuggler, gambler, seer, giant), Tigress 66, Skull King 67,
   mermaids 68–69, then loot, Kraken and Whale in that order when they are in the deck. */
import { describe, expect, it } from 'vite-plus/test';
import type { BotLevel, CardId, Scoring, Seat } from '../protocol/generated';
import { Bots, Engine } from './index';
import type { Action, GameState } from './types';

type Setup = Omit<Engine.CreateOptions, 'seats' | 'seed'>;

/** mulberry32: a stream of "random" numbers a test can repeat. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const seatsFor = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `Bot ${i}`, color: '#1cb0f6', bot: true }));

/** A first round with these hands. Every other card is in the pile, in deck order. */
function dealt(hands: CardId[][], dealer: Seat, setup: Setup = {}): GameState {
  const state = Engine.create({ seats: seatsFor(hands.length), format: 'swift', ...setup, seed: 1 });
  const held = new Set(hands.flat());
  state.dealer = dealer;
  state.trick = { leader: (dealer + 1) % hands.length, plays: [] };
  state.hands = hands.map((hand) => hand.slice());
  state.pile = state.deck.map((c) => c.id).filter((id) => !held.has(id));
  return state;
}

function step(state: GameState, action: Action): GameState {
  const result = Engine.reduce(state, action);
  expect(result.error, JSON.stringify(action)).toBeUndefined();
  return result.state;
}

const bidAll = (state: GameState, bids: number[]): GameState =>
  bids.reduce((s, bid, seat) => step(s, { type: 'bid', seat, bid }), state);
const playCard = (state: GameState, seat: Seat, card: CardId): GameState => step(state, { type: 'play', seat, card });
const at = (state: GameState, level: BotLevel): GameState => ({ ...state, cfg: { ...state.cfg, level } });
/** The card a bot of that level plays when every roll it draws is `roll`. */
const chosen = (state: GameState, seat: Seat, level: BotLevel, roll: number): CardId =>
  Bots.play(at(state, level), seat, () => roll).card;

const KRAKEN: Setup = { kraken: true };
const ALL: Setup = { loot: true, kraken: true, whale: true };

describe('bots: the bid', () => {
  it('lets Easy overbid a mermaid, and on a high roll bid what Normal bids', () => {
    const state = dealt(
      [
        [68, 12, 0, 1, 2],
        [3, 4, 5, 6, 7],
      ],
      1,
    );
    const normal = Bots.bid(at(state, 'normal'), 0, () => 0);
    const slipped = Bots.bid(at(state, 'easy'), 0, () => 0);
    const steady = Bots.bid(at(state, 'easy'), 0, () => 0.99);
    expect(slipped).toBeGreaterThan(normal);
    expect(steady).toBe(normal);
    expect(slipped).toBeLessThanOrEqual(5);
  });

  it('bids 0 on a hand of escapes', () => {
    const state = dealt(
      [
        [56, 57, 58, 59, 60],
        [0, 1, 2, 3, 4],
      ],
      1,
    );
    expect(Bots.bid(at(state, 'normal'), 0, () => 0.5)).toBe(0);
  });

  it('bids the tricks a hand is likely to win on Normal, whatever the roll', () => {
    const rest = [3, 4, 5, 6, 7];
    const normal = (hand: CardId[], other: CardId[], roll: number): number =>
      Bots.bid(at(dealt([hand, other], 1), 'normal'), 0, () => roll);
    for (const roll of [0, 0.5, 0.99]) {
      // Two pirates.
      expect(normal([61, 62, 0, 1, 2], rest, roll)).toBeGreaterThanOrEqual(2);
      // Black 14, black 13 and a side 14.
      expect(normal([55, 54, 27, 0, 1], rest, roll)).toBeGreaterThanOrEqual(2);
      // Five low cards.
      expect(normal([0, 1, 2, 3, 4], [5, 6, 7, 8, 9], roll)).toBe(0);
    }
  });

  it('draws no number on Normal and Hard', () => {
    const state = dealt(
      [
        [68, 12, 0, 1, 2],
        [3, 4, 5, 6, 7],
      ],
      1,
    );
    const never = (): number => {
      throw new Error('this level does not roll');
    };
    expect(Bots.bid(at(state, 'normal'), 0, never)).toBe(Bots.bid(at(state, 'hard'), 0, never));
  });
});

describe('bots: the card', () => {
  it('does not lead the Skull King on Normal, and does on Easy when the roll says so', () => {
    const state = bidAll(
      dealt(
        [
          [67, 55, 0, 1, 2],
          [3, 4, 5, 6, 7],
        ],
        1,
      ),
      [1, 0],
    );
    expect(chosen(state, 0, 'normal', 0.99)).not.toBe(67);
    expect(chosen(state, 0, 'easy', 0)).toBe(67);
  });

  it('leads a high number it bid on though something unseen beats it, and not a middling one', () => {
    const leading = (hand: CardId[]): GameState => bidAll(dealt([hand, [4, 5, 6, 7, 8]], 1), [1, 0]);
    // Black 11, yellow 13: below the stopper line, and still the trick the bid counts on.
    expect(chosen(leading([52, 0, 1, 2, 3]), 0, 'normal', 0.99)).toBe(52);
    expect(chosen(leading([26, 0, 1, 2, 3]), 0, 'normal', 0.99)).toBe(26);
    expect(chosen(leading([26, 0, 1, 2, 3]), 0, 'hard', 0.99)).toBe(26);
    // Black 9, yellow 12: no take at all, so the cheapest card goes.
    expect(chosen(leading([50, 0, 1, 2, 3]), 0, 'normal', 0.99)).toBe(0);
    expect(chosen(leading([25, 0, 1, 2, 3]), 0, 'normal', 0.99)).toBe(0);
  });

  it('Krakens a trick Normal does not need, where Easy takes it', () => {
    let state = bidAll(
      dealt(
        [
          [67, 61, 70, 55, 68],
          [23, 0, 1, 2, 3],
        ],
        0,
        KRAKEN,
      ),
      [0, 1],
    );
    state = playCard(state, 1, 23);
    expect(chosen(state, 0, 'normal', 0.99)).toBe(70);
    expect(chosen(state, 0, 'easy', 0)).toBe(67);
  });

  it('does not play the King on its own zero to sink the next seat, even on Hard', () => {
    let state = bidAll(
      dealt(
        [
          [67, 28, 29, 30, 56],
          [18, 0, 1, 2, 3],
          [17, 4, 5, 6, 7],
        ],
        0,
      ),
      [0, 5, 0],
    );
    state = playCard(playCard(state, 1, 18), 2, 17);
    expect(chosen(state, 0, 'hard', 0.99)).not.toBe(67);
    expect(chosen(state, 0, 'normal', 0.99)).not.toBe(67);
  });

  it('Krakens the trick the next seat must win, on Hard only', () => {
    let state = bidAll(
      dealt(
        [
          [70, 14, 15, 16, 56],
          [67, 0, 1, 2, 3],
          [4, 5, 6, 7, 8],
        ],
        0,
        KRAKEN,
      ),
      [0, 5, 0],
    );
    state = playCard(playCard(state, 1, 67), 2, 4);
    expect(chosen(state, 0, 'hard', 0.99)).toBe(70);
    expect(chosen(state, 0, 'normal', 0.99)).not.toBe(70);
  });

  it('Whales a trick onto the next seat to bust its zero, on Hard only', () => {
    let state = bidAll(
      dealt(
        [
          [73, 14, 15, 16, 56],
          [13, 0, 1, 2, 3],
          [43, 27, 28, 29, 30],
        ],
        0,
        ALL,
      ),
      [0, 0, 1],
    );
    state = playCard(playCard(state, 1, 13), 2, 43);
    expect(chosen(state, 0, 'hard', 0.99)).toBe(73);
    expect(chosen(state, 0, 'normal', 0.99)).not.toBe(73);
  });

  it('does not Kraken a trick that already busts the next seat’s zero', () => {
    let state = bidAll(
      dealt(
        [
          [70, 14, 15, 16, 56],
          [13, 0, 1, 2, 3],
          [4, 5, 6, 7, 8],
        ],
        0,
        KRAKEN,
      ),
      [0, 0, 0],
    );
    state = playCard(playCard(state, 1, 13), 2, 4);
    expect(chosen(state, 0, 'hard', 0.99)).toBe(16);
    expect(chosen(state, 0, 'normal', 0.99)).not.toBe(70);
  });

  it('plays the only legal card without rolling', () => {
    let state = bidAll(dealt([[0], [1]], 0, { format: 'classic' }), [0, 0]);
    state = playCard(state, 1, 1);
    const never = (): number => {
      throw new Error('one legal card needs no roll');
    };
    expect(Bots.play(at(state, 'easy'), 0, never)).toEqual({ card: 0 });
  });
});

describe('bots: the abilities', () => {
  /** Seat 1 holds two cards and `drawn` more from the Smuggler, bid `bid`, and has taken one trick. */
  function smuggling(bid: number): GameState {
    let state = bidAll(
      dealt(
        [
          [0, 1, 2],
          [62, 67, 56],
        ],
        0,
        { abilities: true },
      ),
      [0, bid],
    );
    state = playCard(playCard(state, 1, 62), 0, 0);
    return step(state, { type: 'advance' });
  }

  it('steps the Giant’s bid onto the trick it took', () => {
    let state = bidAll(
      dealt(
        [
          [0, 1],
          [65, 56],
        ],
        0,
        { abilities: true, format: 'even' },
      ),
      [1, 0],
    );
    state = playCard(playCard(state, 1, 65), 0, 0);
    state = step(state, { type: 'advance' });
    state = playCard(playCard(state, 1, 56), 0, 1);
    state = step(state, { type: 'advance' });
    expect(state.pending).toEqual({ kind: 'giant', seat: 1 });
    expect(Bots.ability(at(state, 'normal'), 1, () => 0.99)).toBe(1);
    // Easy's flip would take the bid below zero, so it steps the right way after all.
    expect(Bots.ability(at(state, 'easy'), 1, () => 0)).toBe(1);
  });

  it('has the Smuggler throw away low cards while tricks are needed, and high ones once the bid is safe', () => {
    // Drawn from the top of the pile: green 4 and green 5 (ids 3 and 4).
    const needing = smuggling(3);
    expect(needing.pending).toEqual({ kind: 'smuggler', seat: 1, drawn: [3, 4] });
    expect(Bots.ability(at(needing, 'normal'), 1, () => 0.99)).toEqual([56, 3]);
    const made = smuggling(1);
    expect(Bots.ability(at(made, 'normal'), 1, () => 0.99)).toEqual([67, 4]);
    // Easy, on a low roll, does the opposite.
    expect(Bots.ability(at(needing, 'easy'), 1, () => 0)).toEqual([67, 4]);
  });

  it('names the next seat at the helm, and Easy sometimes itself', () => {
    let state = bidAll(
      dealt(
        [
          [0, 1],
          [61, 56],
          [2, 3],
        ],
        0,
        { abilities: true, format: 'even' },
      ),
      [0, 1, 0],
    );
    state = playCard(playCard(playCard(state, 1, 61), 2, 2), 0, 0);
    state = step(state, { type: 'advance' });
    expect(state.pending).toEqual({ kind: 'helm', seat: 1 });
    expect(Bots.ability(at(state, 'hard'), 1, () => 0)).toBe(2);
    expect(Bots.ability(at(state, 'easy'), 1, () => 0.99)).toBe(2);
    expect(Bots.ability(at(state, 'easy'), 1, () => 0)).toBe(1);
  });
});

/** Plays a whole game with the bots, and hands every decision to `see` before it is applied. */
function playOut(
  state: GameState,
  random: () => number,
  see: (state: GameState, seat: Seat, decide: (s: GameState) => unknown) => void = () => {},
): GameState {
  for (let guard = 0; state.phase !== 'gameOver'; guard++) {
    expect(guard).toBeLessThan(5000);
    let action: Action = { type: 'advance' };
    if (state.phase === 'bidding') {
      const seat = state.bids.findIndex((b) => b == null);
      const roll = random();
      see(state, seat, (s) => Bots.bid(s, seat, () => roll));
      action = { type: 'bid', seat, bid: Bots.bid(state, seat, () => roll) };
    } else if (state.phase === 'playing' && state.turn != null) {
      const seat = state.turn;
      const roll = random();
      see(state, seat, (s) => Bots.play(s, seat, () => roll));
      action = { type: 'play', seat, ...Bots.play(state, seat, () => roll) };
    } else if (state.phase === 'ability' && state.pending) {
      const seat = state.pending.seat;
      const roll = random();
      see(state, seat, (s) => Bots.ability(s, seat, () => roll));
      action = { type: 'ability', seat, choice: Bots.ability(state, seat, () => roll) };
    }
    state = step(state, action);
  }
  return state;
}

const LEVELS: BotLevel[] = ['easy', 'normal', 'hard'];
const SCORINGS: Scoring[] = ['classic', 'rascal'];

describe('bots: whole games', () => {
  it.each(LEVELS)('finishes a game on %s, at every table size and both scorings', (level) => {
    for (let players = 2; players <= 8; players++) {
      for (const scoring of SCORINGS) {
        const state = Engine.create({
          seats: seatsFor(players),
          scoring,
          format: 'swift',
          ...ALL,
          abilities: true,
          level,
          seed: 97 * players + scoring.length,
        });
        expect(playOut(state, seeded(players)).log.every((round) => round.done)).toBe(true);
      }
    }
  });
});

describe('bots: what a seat may know', () => {
  /** The same table with every card this seat has not seen dealt differently among the other hands and the pile. */
  function reshuffled(state: GameState, seat: Seat, random: () => number): GameState {
    const copy = structuredClone(state);
    const known = new Set(copy.peeked[seat]);
    // The Smuggler knows what they drew, and the Seer the pile, while their ability is open: leave those be.
    if (copy.pending?.seat === seat) return copy;
    const hidden = copy.hands
      .flatMap((hand, i) => (i === seat ? [] : hand))
      .concat(copy.pile.filter((id) => !known.has(id)));
    for (let i = hidden.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [hidden[i], hidden[j]] = [hidden[j], hidden[i]];
    }
    copy.hands = copy.hands.map((hand, i) => (i === seat ? hand : hidden.splice(0, hand.length)));
    copy.pile = copy.pile.map((id) => (known.has(id) ? id : (hidden.shift() ?? id)));
    return copy;
  }

  it.each(LEVELS)('decides the same on %s whatever the other hands and the pile hold', (level) => {
    const shuffle = seeded(9);
    let decisions = 0;
    for (const players of [2, 3, 5]) {
      const state = Engine.create({
        seats: seatsFor(players),
        format: 'swift',
        ...ALL,
        abilities: true,
        level,
        seed: 40 + players,
      });
      playOut(state, seeded(players + 20), (now, seat, decide) => {
        expect(decide(reshuffled(now, seat, shuffle))).toEqual(decide(now));
        decisions++;
      });
    }
    expect(decisions).toBeGreaterThan(200);
  });
});

describe('engine: what the round remembers for the bots', () => {
  it('keeps every play with the Tigress’s call, and forgets them when the next round starts', () => {
    let state = bidAll(dealt([[66], [0]], 1, { format: 'classic' }), [1, 0]);
    state = step(state, { type: 'play', seat: 0, card: 66, as: 'pirate' });
    state = playCard(state, 1, 0);
    expect(state.roundPlays).toEqual([
      { seat: 0, card: 66, as: 'pirate' },
      { seat: 1, card: 0 },
    ]);
    state = step(step(state, { type: 'advance' }), { type: 'advance' });
    expect(state.round).toBe(1);
    expect(state.roundPlays).toEqual([]);
  });

  it('keeps the Seer’s look at the pile for that seat only, after the ability closes, until the round ends', () => {
    let state = bidAll(
      dealt(
        [
          [0, 1],
          [64, 56],
        ],
        0,
        { abilities: true, format: 'even' },
      ),
      [0, 1],
    );
    state = playCard(playCard(state, 1, 64), 0, 0);
    state = step(state, { type: 'advance' });
    expect(state.pending).toEqual({ kind: 'seer', seat: 1 });
    expect(state.peeked).toEqual([[], state.pile]);
    state = step(state, { type: 'ability', seat: 1, choice: null });
    expect(state.peeked).toEqual([[], state.pile]);
    // No view carries it: the Seer saw the pile while the ability was open, and nobody is told again.
    for (const seat of [0, 1]) expect(JSON.stringify(Engine.view(state, seat))).not.toContain('peeked');
    state = playCard(playCard(state, 1, 56), 0, 1);
    state = step(step(state, { type: 'advance' }), { type: 'advance' });
    expect(state.peeked).toEqual([[], []]);
  });

  it('reads a game saved before the memory existed as one that remembers nothing', () => {
    const {
      roundPlays: _roundPlays,
      peeked: _peeked,
      ...old
    } = bidAll(dealt([[66], [0]], 1, { format: 'classic' }), [1, 0]);
    const restored = Engine.restore(structuredClone(old));
    expect(restored.roundPlays).toEqual([]);
    expect(restored.peeked).toEqual([[], []]);
    expect(Bots.play(restored, 0, () => 0.99)).toEqual({ card: 66, as: 'pirate' });
  });
});
