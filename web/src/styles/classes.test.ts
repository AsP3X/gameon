/* The online screens share a page with the table renderer's stylesheet. A class of theirs that
   tavern.css already styles for something else is drawn with those rules too, and no DOM test sees
   it: the ladder once came out shrunk and faint, as the how-to-play sheet's `.ladder`, with the
   standings' `.rank` for its numbers. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';

/** A stylesheet without its comments: a class that is only talked about is not styled. */
const sheet = (name: string): string =>
  readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const styles = (css: string, name: string): boolean => new RegExp(`\\.${name}(?![\\w-])`).test(css);

/** The classes online.css introduces for the ranked screens, each meant to be styled by it alone. */
const RANKED = [
  'ranking',
  'place',
  'season',
  'rating',
  'unrated',
  'searching',
  'queue-seat',
  'queue-seats',
  'end-rating',
];

describe('the class names of the ranked screens', () => {
  it('are styled by online.css and by nothing in the table renderer', () => {
    const tavern = sheet('tavern.css'),
      online = sheet('online.css');
    expect(RANKED.filter((name) => !styles(online, name))).toEqual([]);
    expect(RANKED.filter((name) => styles(tavern, name))).toEqual([]);
    // The two names that were taken, so the check is known to bite.
    expect(styles(tavern, 'ladder') && styles(tavern, 'rank')).toBe(true);
    expect(styles(online, 'ladder') || styles(online, 'rank')).toBe(false);
  });
});
