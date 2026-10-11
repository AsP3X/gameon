// @vitest-environment jsdom
/* The solo player's record: what one finished game adds to it, and how it is stored. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { Rules } from '../game';
import type { RoundRecord } from '../protocol/generated';
import { loadState, stats } from './state';
import type { ScoreView } from './state';
import { dayKey, recordGame } from './stats';

const seat = (name: string, bot: boolean) => ({ name, color: '#000', bot });

/** A finished round of `cards` cards for three seats. */
function round(cards: number, bids: number[], tricks: number[]): RoundRecord {
  return { ...Rules.newRecord(3, cards), bids, tricks, done: true };
}
/** Seat 0 is the human unless `humans` says otherwise. Classic scoring. */
function game(log: RoundRecord[], humans: number[] = [0]): ScoreView {
  return {
    seats: [0, 1, 2].map((i) => seat(`P${i}`, !humans.includes(i))),
    log,
    cfg: { scoring: 'classic' },
    rounds: log.length,
    me: 0,
  };
}
const stored = (): string | null => localStorage.getItem('skullking-tavern.stats.v1');

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 4, 17, 20, 30), toFake: ['Date'] });
  localStorage.clear();
  loadState();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('dayKey', () => {
  it('is the local date without padding, as the legacy build stored it', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-1-5');
    expect(dayKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('recordGame', () => {
  it('counts a solo win, the bids made and the best score, and saves it under the legacy key', () => {
    // Round 1: the human bids 1, takes 1 (+20). Round 2: bids 2, takes 1 (-10). An unfinished round is ignored.
    const open = { ...round(3, [1, 0, 0], [0, 0, 0]), done: false };
    recordGame(game([round(1, [1, 0, 0], [1, 0, 0]), round(2, [2, 0, 1], [1, 0, 1]), open]));
    expect(stats).toEqual({ games: 1, wins: 0, made: 1, bids: 2, best: 10, streak: 1, lastDay: '2026-5-17' });
    expect(stored()).toBe('{"games":1,"wins":0,"made":1,"bids":2,"best":10,"streak":1,"lastDay":"2026-5-17"}');
  });

  it('calls a shared first place a win and keeps the best score ever', () => {
    recordGame(game([round(2, [1, 1, 0], [1, 1, 0])])); // 20 each: two made a bid of 1, one a bid of 0 with 2 cards
    expect(stats).toMatchObject({ games: 1, wins: 1, best: 20 });
    recordGame(game([round(1, [0, 1, 0], [1, 0, 0])])); // the human bid 0 and took one: -10
    expect(stats).toMatchObject({ games: 2, wins: 1, made: 1, bids: 2, best: 20 });
  });

  it('keeps a day streak: one game a day counts once, a missed day starts over', () => {
    const win = game([round(1, [1, 0, 0], [1, 0, 0])]);
    recordGame(win);
    recordGame(win);
    expect(stats.streak).toBe(1);
    vi.setSystemTime(new Date(2026, 4, 18, 9, 0));
    recordGame(win);
    expect(stats).toMatchObject({ streak: 2, lastDay: '2026-5-18', games: 3 });
    vi.setSystemTime(new Date(2026, 4, 20, 9, 0));
    recordGame(win);
    expect(stats).toMatchObject({ streak: 1, lastDay: '2026-5-20', games: 4 });
  });

  it('counts the streak across a month end', () => {
    const win = game([round(1, [1, 0, 0], [1, 0, 0])]);
    vi.setSystemTime(new Date(2026, 4, 31, 22, 0));
    recordGame(win);
    vi.setSystemTime(new Date(2026, 5, 1, 7, 0));
    recordGame(win);
    expect(stats).toMatchObject({ streak: 2, lastDay: '2026-6-1' });
  });

  it('records nothing for pass-and-play or for a table of bots', () => {
    const log = [round(1, [1, 0, 0], [1, 0, 0])];
    recordGame(game(log, [0, 1]));
    recordGame(game(log, []));
    expect(stats.games).toBe(0);
    expect(stored()).toBeNull();
  });

  it('picks up where the saved record left off', () => {
    localStorage.setItem(
      'skullking-tavern.stats.v1',
      '{"games":4,"wins":2,"made":9,"bids":20,"best":120,"streak":3,"lastDay":"2026-5-16"}',
    );
    loadState();
    recordGame(game([round(1, [1, 0, 0], [1, 0, 0])]));
    expect(stats).toEqual({ games: 5, wins: 3, made: 10, bids: 21, best: 120, streak: 4, lastDay: '2026-5-17' });
  });
});
