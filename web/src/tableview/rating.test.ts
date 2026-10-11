/* What a ranked game adds to the end screen: the server's places and forfeits in the standings, and
   the line with the rating change. Nothing of it is worked out from the points. */
import { describe, expect, it } from 'vite-plus/test';
import type { GameResult, Rating, RatingChange } from '../protocol/generated';
import { ratingLine, standings } from './views';

const rating = (value: number, provisional = false): Rating => ({ value, tier: 'Bosun', provisional, games: 12 });
/** What a player reads: the markup without its tags. */
const text = (html: string): string => html.replace(/<[^>]+>/g, '');

describe('ratingLine', () => {
  it('shows before, after and a gain in green', () => {
    const line = ratingLine({ before: rating(1240), after: rating(1252), delta: 12 });
    expect(text(line)).toBe('Rating 1240 → 1252 +12');
    expect(line).toContain('<b class="num pos">+12</b>');
  });

  it('shows a loss in red with a real minus sign, also below zero', () => {
    const line = ratingLine({ before: rating(3), after: rating(-5), delta: -8 });
    expect(text(line)).toBe('Rating 3 → −5 −8');
    expect(line).toContain('<b class="num neg">−8</b>');
  });

  it('marks a placement game, and shows no change as no change', () => {
    const line = ratingLine({ before: rating(0, true), after: rating(0, true), delta: 0 });
    expect(text(line)).toBe('Rating 0 → 0 0 Placement');
    expect(line).toContain('<b class="num zero">0</b>');
  });

  it('rounds what the server sent to whole numbers and works nothing out itself', () => {
    // The delta shown is the one that was sent, not the difference of the two values.
    expect(text(ratingLine({ before: rating(1240.4), after: rating(1251.6), delta: 11.2 }))).toBe(
      'Rating 1240 → 1252 +11',
    );
  });

  it('never lets a value through as markup', () => {
    const hostile = { before: rating(1), after: rating(2), delta: '<img src=x onerror=alert(1)>' } as unknown;
    expect(ratingLine(hostile as RatingChange)).not.toContain('<img');
  });
});

describe('standings', () => {
  const result = (places: number[], forfeited: number[] = []): GameResult => ({
    totals: [],
    places,
    forfeited,
    rating: null,
    lobbyId: null,
  });

  it('are the order of the points while the server has said nothing: offline, and before the result', () => {
    expect(standings([20, 110, -30, 110], null)).toEqual([
      { i: 1, t: 110, rank: 1, forfeit: false },
      { i: 3, t: 110, rank: 1, forfeit: false },
      { i: 0, t: 20, rank: 3, forfeit: false },
      { i: 2, t: -30, rank: 4, forfeit: false },
    ]);
  });

  it('put a forfeited seat last though it has the most points, because the server placed it there', () => {
    // The second ranked game of the smoke against the server: the seat that left scored 120.
    const order = standings([120, -240, -400, -100], result([4, 2, 3, 1], [0]));
    expect(order.map((x) => [x.i, x.rank, x.forfeit])).toEqual([
      [3, 1, false],
      [1, 2, false],
      [2, 3, false],
      [0, 4, true],
    ]);
  });

  it('place two forfeits both last, the one with more points first of the two', () => {
    const order = standings([50, 300, 10, 200], result([1, 4, 2, 4], [3, 1]));
    expect(order.map((x) => [x.i, x.rank, x.forfeit])).toEqual([
      [0, 1, false],
      [2, 2, false],
      [1, 4, true],
      [3, 4, true],
    ]);
  });

  it('take the places from the server also when nobody forfeited, and ignore a result that is not for these seats', () => {
    expect(standings([10, 30, 20], result([3, 1, 2])).map((x) => x.i)).toEqual([1, 2, 0]);
    expect(standings([10, 30, 20], result([1, 2])).map((x) => [x.i, x.rank])).toEqual([
      [1, 1],
      [2, 2],
      [0, 3],
    ]);
  });
});
