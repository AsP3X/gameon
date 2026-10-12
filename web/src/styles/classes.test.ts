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
const RANKED = ['rating', 'unrated', 'searching', 'queue-seat', 'queue-seats', 'end-rating'];

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

/** The classes gameon.css introduces for the profile and the ladder, which are pages of the frame. */
const W5 = [
  'go-who',
  'go-card',
  'go-quarter',
  'go-lines',
  'go-best',
  'go-played',
  'go-account-card',
  'go-ladder-list',
  'go-ladder-rank',
  'go-ladder-rating',
];

describe('the class names of the profile and the ladder', () => {
  it('are styled by gameon.css and by nothing in the table renderer', () => {
    const tavern = sheet('tavern.css'),
      gameon = sheet('gameon.css');
    expect(W5.filter((name) => !styles(gameon, name))).toEqual([]);
    expect(W5.filter((name) => styles(tavern, name))).toEqual([]);
  });

  it("take the five lines' cells back from the scoresheet's table", () => {
    // tavern.css styles every `th` and `td` of the page for the scoresheet: upper case, a grey
    // first column, a sticky cell. The five lines are a table too, and came out drawn like one.
    const tavern = sheet('tavern.css'),
      gameon = sheet('gameon.css');
    expect(/(^|\n)th,\s*td\s*\{/.test(tavern)).toBe(true);
    const own = /#gameon \.go-lines :is\(th, td\) \{([^}]*)\}/.exec(gameon)?.[1] ?? '';
    for (const taken of ['position: static', 'border: 0', 'background: none', 'text-transform: none'])
      expect(own).toContain(taken);
  });
});
