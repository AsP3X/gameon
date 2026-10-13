import { describe, expect, it } from 'vite-plus/test';
import { Rules } from '../game';
import { FORMATS, formatName, ROUNDS } from './rulesets';

describe('the lengths of a game', () => {
  it('names every length the rules have, and counts its rounds as the rules do', () => {
    expect(FORMATS.map(([format]) => format)).toEqual(Object.keys(Rules.FORMATS));
    expect(FORMATS.map(([format]) => [formatName(format), ROUNDS[format]])).toEqual([
      ['Classic', '10 rounds · 1 to 10 cards'],
      ['Brawl', '5 rounds · 6 to 10 cards'],
      ['Swift', '5 rounds · 5 cards each'],
      ['Even', '10 rounds · 2, 4, 6, 8, 10 twice'],
      ['Whirl', '10 rounds · 9, 7, 5, 3, 1 twice'],
    ]);
    for (const [format] of FORMATS)
      expect(ROUNDS[format].startsWith(`${Rules.FORMATS[format].seq.length} rounds · `)).toBe(true);
  });
});
