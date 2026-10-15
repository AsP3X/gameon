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

/** The classes gameon.css introduces for Games' two choices and the four pages the footer leads to. */
const FOOTER_PAGES = ['go-choices', 'go-suggest', 'go-plus', 'go-doc', 'go-doc-block', 'go-doc-way', 'go-saved'];
/** The classes skullking.css introduces for dropping the game saved on the device. */
const FORGET = ['sk-jump-device', 'sk-jump-forget', 'sk-forget-actions'];

describe("the class names of the footer's pages and of forgetting a game", () => {
  it('are styled by their own stylesheet and by nothing in the table renderer', () => {
    const tavern = sheet('tavern.css'),
      gameon = sheet('gameon.css'),
      skullking = sheet('skullking.css');
    expect(FOOTER_PAGES.filter((name) => !styles(gameon, name))).toEqual([]);
    expect(FORGET.filter((name) => !styles(skullking, name))).toEqual([]);
    expect([...FOOTER_PAGES, ...FORGET].filter((name) => styles(tavern, name))).toEqual([]);
  });
});

describe('the way cards on a wide window', () => {
  it("are as wide as the index's column, whatever the home's grid says", () => {
    // From 1280 px skullking.css lays `.sk-ways` out as the home's grid: `align-content: start`
    // and room kept for an open card. The index uses the same list as one column, and its three
    // doors once came out as wide as their own lines, each a different width.
    const skullking = sheet('skullking.css'),
      online = sheet('online.css');
    expect(/\.sk-ways \{[^}]*display: grid;[^}]*min-height: 272px;/.test(skullking)).toBe(true);
    const own = /\.on-body \.sk-ways \{([^}]*)\}/.exec(online)?.[1] ?? '';
    for (const taken of ['display: flex', 'align-items: stretch', 'min-height: 0']) expect(own).toContain(taken);
  });
});

describe('the bar at the foot of a screen', () => {
  it('is as wide as the column above it', () => {
    // The column is `.wrap` less its padding. The bar was the whole 560 px, so on anything wider
    // than a phone its button stood 16 px out on each side of the field above it.
    const tavern = sheet('tavern.css');
    const px = (rule: RegExp): number => Number(rule.exec(tavern)?.[1] ?? Number.NaN);
    const wrap = px(/\.wrap \{[^}]*max-width: (\d+)px;/),
      pad = px(/\.wrap \{[^}]*padding-inline: (\d+)px;/),
      bar = px(/\.footbar > div \{[^}]*max-width: (\d+)px;/);
    expect(bar).toBe(wrap - 2 * pad);
  });
});

describe('the final scores on a desk window', () => {
  /** The body of the rule for `selector` inside the desk block of responsive.css. */
  const desk = sheet('responsive.css').split('@media (min-width: 1024px) {')[1] ?? '';
  const rule = (selector: string): string => new RegExp(`${selector} \\{([^}]*)\\}`).exec(desk)?.[1] ?? '';
  const row = (selector: string): number[] =>
    (/grid-row: ([^;]+);/.exec(rule(selector))?.[1] ?? '').split('/').map((n) => Number(n.trim()));

  it('give the solo note a place of its own and do not stretch its pill', () => {
    // The note had no place in the grid: it fell into a row that takes up the room, and its pill
    // was stretched into a green disc above the winner.
    expect(/\.end-rating,\s*\.end-note \{[^}]*grid-column: 2;[^}]*grid-row: 5;/.test(desk)).toBe(true);
    expect(/\.end-note \{[^}]*align-items: center;/.test(sheet('skullking.css'))).toBe(true);
  });

  it('share their rows with the winner, so the awards never push the buttons away', () => {
    // Six awards are three rows. They had rows of their own under the winner's, and the buttons in
    // the last of them: the buttons came out 200 px under the winner.
    const [hero, heroEnd] = row('\\.hero-win'),
      [awards, awardsEnd] = row('\\.awards'),
      [actions] = row('\\.end-actions');
    expect(heroEnd).toBeGreaterThan(awards);
    expect(awards).toBeGreaterThan(hero);
    expect(awardsEnd).toBeGreaterThan(actions);
  });
});

/** The bare names Ocho's pages put next to an `oc-` class: a card's size and colour, the clock's way. */
const OCHO_BARE = ['sm', 'md', 'lg', 'red', 'blue', 'green', 'yellow', 'black', 'back', 'ccw'];

describe("the class names of Ocho's pages", () => {
  it('are their own: no other stylesheet styles a bare name they use, and none of them is `oc-`', () => {
    const ocho = sheet('ocho.css');
    // A bare name styled by itself, not as part of another class's rule, would reach Ocho's cards.
    const alone = (css: string, name: string): boolean =>
      new RegExp(`(^|[\\s,>+~(])\\.${name}(?![\\w-])`, 'm').test(css);
    for (const other of ['tavern.css', 'online.css', 'gameon.css', 'responsive.css', 'skullking.css']) {
      const css = sheet(other);
      expect(OCHO_BARE.filter((name) => alone(css, name))).toEqual([]);
      expect(styles(css, 'oc-[a-z-]+')).toBe(false);
    }
    // The two that were taken: Skull King's `.lead` and `.num` once moved Ocho's leader over its top bar.
    expect(alone(sheet('tavern.css'), 'lead') && alone(sheet('tavern.css'), 'num')).toBe(true);
    expect(alone(ocho, 'lead') || alone(ocho, 'num') || /\.oc-[\w-]+\.(lead|num)(?![\w-])/.test(ocho)).toBe(false);
  });
});
