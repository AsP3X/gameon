/* What the table moves between two views: worked out from the views alone, with nothing extra from
   the server. */
import { describe, expect, it } from 'vite-plus/test';
import { aView, card } from './fake';
import { changes, pileLayers } from './motion';

describe('what moves between two views', () => {
  it('deals when the table first shows a hand, to every seat and into your hand', () => {
    const c = changes(null, aView({}, 8));
    expect(c.deal).toBe(true);
    expect(c.drawn).toEqual([1, 2, 3, 4, 5, 6, 7].map((seat) => ({ seat, n: 8 })));
    expect(c.mine).toEqual([10, 11, 12, 13]);
  });

  it('deals again when the hand number changes, and not after an ordinary draw', () => {
    expect(changes(aView(), aView({ handNo: 2 })).deal).toBe(true);
    expect(changes(aView(), aView({ drawCount: 40 })).deal).toBe(false);
    expect(changes(null, aView({ phase: 'between', must: 'nextHand' })).deal).toBe(false);
  });

  it('flies your card from the hand, and another seat’s from that seat', () => {
    const before = aView();
    const yours = changes(
      before,
      aView({ hand: before.hand.filter((c) => c.id !== 11), top: card(11, 'yellow', { number: 7 }) }),
    );
    expect(yours.played).toEqual({ card: card(11, 'yellow', { number: 7 }), from: 'you' });
    const counts = [...before.counts];
    counts[3] = 7;
    const theirs = changes({ ...before, turn: 3 }, aView({ counts, top: card(40, 'red', 'skip') }));
    expect(theirs.played).toEqual({ card: card(40, 'red', 'skip'), from: 3 });
  });

  it('sends backs to each seat whose count grew, as many as it grew', () => {
    const counts = aView().counts.map((n, s) => (s === 2 || s === 5 ? n + 2 : n));
    const c = changes(aView(), aView({ counts, top: card(41, 'red', 'deadRed') }));
    expect(c.drawn).toEqual([
      { seat: 2, n: 2 },
      { seat: 5, n: 2 },
    ]);
  });

  it('brings a card you drew into the hand, and turns the arrow and the stack when they change', () => {
    const c = changes(
      aView(),
      aView({ hand: [...aView().hand, card(14, 'blue', { number: 1 })], direction: -1, stack: 4 }),
    );
    expect(c.mine).toEqual([14]);
    expect(c.turned).toBe(true);
    expect(c.stacked).toBe(true);
  });

  it('gives two players a thicker pile than eight', () => {
    expect(pileLayers(95)).toBe(10);
    expect(pileLayers(47)).toBe(5);
    expect(pileLayers(3)).toBe(1);
    expect(pileLayers(0)).toBe(0);
  });
});
