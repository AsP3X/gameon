/* The end screen's awards: what earns each one, and which are kept when a game earns more than fit. */
import { describe, expect, it } from 'vite-plus/test';
import { Rules } from '../game';
import type { RoundRecord } from '../protocol/generated';
import { awards, AWARDS_SHOWN, AWARDS_TIGHT } from './awards';
import type { ScoreView } from './state';

/** A finished round. The bids and the tricks say how many seats there are. */
function round(cards: number, bids: number[], tricks: number[], extra: Partial<RoundRecord> = {}): RoundRecord {
  return { ...Rules.newRecord(bids.length, cards), bids, tricks, done: true, ...extra };
}
/** A game of classic scoring between seats named after the letters given. */
function game(names: string, log: RoundRecord[]): ScoreView {
  return {
    seats: names.split('').map((name) => ({ name, color: '#000', bot: false })),
    log,
    cfg: { scoring: 'classic' },
    rounds: log.length,
    me: 0,
  };
}
/** What the awards say, by title. */
const told = (v: ScoreView): Record<string, string> => Object.fromEntries(awards(v).map((a) => [a.t, a.d]));

describe('awards', () => {
  it('gives none before a round is scored', () => {
    expect(awards(game('AB', []))).toEqual([]);
    expect(awards(game('AB', [{ ...round(1, [1, 0], [1, 0]), done: false }]))).toEqual([]);
  });

  it('keeps the four the end screen always had', () => {
    const v = game('AB', [
      round(1, [1, 0], [1, 0], { b14: [1, 0] }),
      round(2, [1, 1], [1, 1]),
      round(3, [2, 1], [1, 2]),
    ]);
    expect(told(v)).toMatchObject({
      Sharpshooter: 'A & B · 2 bids made',
      'Hot streak': 'A & B · 2 in a row',
      'Bounty hunter': 'A · 10 bonus points',
      'Biggest haul': 'A · +30 in one round',
    });
  });

  it('names the seat that caught the Skull King, and how often', () => {
    const once = game('AB', [round(2, [1, 1], [1, 1], { sm: 1 })]);
    expect(told(once).Kingslayer).toBe('B · caught the Skull King');
    const twice = game('AB', [round(2, [1, 1], [1, 1], { sm: 1 }), round(3, [1, 1], [2, 1], { sm: 1 })]);
    expect(told(twice).Kingslayer).toBe('B · caught the Skull King 2 times');
    expect(told(game('AB', [round(2, [1, 1], [1, 1])])).Kingslayer).toBeUndefined();
  });

  it('counts the Pirates the King took, made bid or not', () => {
    const v = game('AB', [round(3, [1, 1], [2, 1], { ps: [1, 0] }), round(4, [2, 1], [2, 2], { ps: [2, 0] })]);
    expect(told(v)['Pirate hunter']).toBe('A · 3 Pirates taken by the King');
    expect(told(game('AB', [round(3, [1, 1], [2, 1], { ps: [0, 1] })]))['Pirate hunter']).toBe(
      'B · 1 Pirate taken by the King',
    );
  });

  it('wants a made bid of three or more for a bold call', () => {
    expect(told(game('AB', [round(4, [2, 2], [2, 2])]))['Bold call']).toBeUndefined();
    // A bid of four that missed is not one.
    const v = game('AB', [round(5, [4, 3], [2, 3])]);
    expect(told(v)['Bold call']).toBe('B · bid 3 and made it');
  });

  it('wants two zero bids made for a ghost ship', () => {
    expect(told(game('AB', [round(1, [0, 1], [0, 1])]))['Ghost ship']).toBeUndefined();
    const v = game('AB', [round(1, [0, 1], [0, 1]), round(2, [0, 0], [0, 2]), round(3, [0, 2], [0, 3])]);
    expect(told(v)['Ghost ship']).toBe('A · 3 zero bids made');
  });

  it('gives the most tricks to the plunderer', () => {
    const v = game('ABC', [round(2, [1, 1, 0], [2, 0, 0]), round(3, [1, 1, 1], [1, 1, 1])]);
    expect(told(v).Plunderer).toBe('A · 3 tricks taken');
    expect(told(game('AB', [round(1, [0, 0], [1, 0])])).Plunderer).toBe('A · 1 trick taken');
  });

  it('sends the worst round below zero down the plank', () => {
    const v = game('AB', [round(4, [0, 2], [1, 3]), round(5, [3, 1], [0, 1])]);
    expect(told(v)['Walk the plank']).toBe('A · -40 in one round');
    // Nobody lost points: nobody walks.
    expect(told(game('AB', [round(2, [1, 1], [1, 1])]))['Walk the plank']).toBeUndefined();
  });

  it('escapes the names', () => {
    const v = game('AB', [round(1, [1, 0], [1, 0])]);
    v.seats[0].name = '<b>&';
    expect(told(v).Sharpshooter).toBe('&lt;b&gt;&amp; & B · 1 bids made');
  });

  describe('when a game earns more than the end screen holds', () => {
    // All ten are earned. A and B share or take the first eight; C only takes the most tricks and D
    // only has the worst round, which are the last two.
    const v = game('ABCD', [
      round(3, [1, 0, 1, 1], [1, 0, 2, 0], { b14: [1, 0, 0, 0] }),
      round(4, [1, 0, 0, 2], [1, 0, 3, 0], { sm: 0 }),
      round(5, [3, 0, 1, 1], [3, 0, 2, 0], { ps: [2, 0, 0, 0] }),
      round(6, [1, 1, 1, 5], [1, 1, 4, 0]),
    ]);

    it('earns them all', () => {
      expect(AWARDS_SHOWN).toBe(6);
      expect(told(v)).toMatchObject({ Plunderer: 'C · 11 tricks taken', 'Walk the plank': 'D · -50 in one round' });
    });

    it('keeps one for every seat that earned one, then fills up in the order they are handed out', () => {
      expect(Object.keys(told(v))).toEqual([
        'Sharpshooter',
        'Hot streak',
        'Bounty hunter',
        'Biggest haul',
        'Plunderer',
        'Walk the plank',
      ]);
    });

    it('keeps one for every seat in the room a small phone has, too', () => {
      expect(awards(v, AWARDS_TIGHT).map((a) => a.t)).toEqual([
        'Sharpshooter',
        'Hot streak',
        'Plunderer',
        'Walk the plank',
      ]);
    });

    it('gives a seat with two of the later ones only the first', () => {
      // Three rounds in, C has the most tricks and the worst round, and D has earned nothing.
      const early = { ...v, log: v.log.slice(0, 3) };
      expect(Object.keys(told(early))).toEqual([
        'Sharpshooter',
        'Hot streak',
        'Bounty hunter',
        'Biggest haul',
        'Kingslayer',
        'Plunderer',
      ]);
    });
  });
});
