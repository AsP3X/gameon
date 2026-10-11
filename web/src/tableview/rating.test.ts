/* The one line a ranked game adds to the end screen: the server's numbers, as text. */
import { describe, expect, it } from 'vite-plus/test';
import type { Rating, RatingChange } from '../protocol/generated';
import { ratingLine } from './views';

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
