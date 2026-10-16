/* Ocho's sounds without an audio graph: which sound each change of view plays, and that each plays once. */
import { describe, expect, it } from 'vite-plus/test';
import type { SoundName } from '../sound/sound';
import { aView, card } from './fake';
import { OchoSounds } from './sounds';
import type { View } from './wire';

function heard(): { sounds: OchoSounds; log: [SoundName, number | undefined][] } {
  const log: [SoundName, number | undefined][] = [];
  return { sounds: new OchoSounds((name, arg) => log.push([name, arg])), log };
}

/** Seat 0 on another seat's turn, mid-hand. */
const waiting = (change: Partial<View> = {}): View => aView({ must: 'none', turn: 1, legal: [], ...change }, 4);

describe("Ocho's sounds", () => {
  it('deals a new hand with one deal sound the size of your hand, and no card sounds', () => {
    const { sounds, log } = heard();
    sounds.view(waiting(), false);
    expect(log).toEqual([['deal', 4]]);
  });

  it('plays your card once: the view that shows it on the discard is silent', () => {
    const { sounds, log } = heard();
    const before = aView({}, 4);
    sounds.view(before, false);
    log.length = 0;
    const yellow7 = card(11, 'yellow', { number: 7 });
    sounds.played(yellow7, 0);
    const after = waiting({ top: yellow7, hand: before.hand.filter((c) => c.id !== 11), counts: [3, 8, 8, 8] });
    sounds.view(after, false);
    sounds.view(after, false);
    expect(log).toEqual([['cardPlay', 0]]);
  });

  it('says no to a refused play, once', () => {
    const { sounds, log } = heard();
    sounds.view(aView({}, 4), false);
    log.length = 0;
    sounds.played(card(11, 'yellow', { number: 7 }), 0);
    sounds.refused();
    expect(log).toEqual([
      ['cardPlay', 0],
      ['nope', undefined],
    ]);
  });

  it("plays another seat's card at that seat", () => {
    const { sounds, log } = heard();
    sounds.view(waiting(), false);
    log.length = 0;
    sounds.view(waiting({ top: card(40, 'yellow', { number: 9 }), counts: [4, 7, 8, 8], turn: 2 }), false);
    expect(log).toEqual([['cardPlay', 1]]);
  });

  it('draws one card as a card, and a penalty of several as one deal', () => {
    const { sounds, log } = heard();
    const start = waiting();
    sounds.view(start, false);
    log.length = 0;
    sounds.view(waiting({ counts: [4, 9, 8, 8] }), false);
    expect(log).toEqual([['cardPlay', 1]]);
    log.length = 0;
    const more = [card(70, 'red', { number: 1 }), card(71, 'red', { number: 2 })];
    sounds.view(waiting({ counts: [6, 9, 8, 8], hand: [...start.hand, ...more] }), false);
    expect(log).toEqual([['deal', 2]]);
  });

  it('whooshes when the direction flips', () => {
    const { sounds, log } = heard();
    sounds.view(waiting(), false);
    log.length = 0;
    sounds.view(waiting({ direction: -1 }), false);
    expect(log).toEqual([['whoosh', undefined]]);
  });

  it('rings your turn when it becomes yours, not while it stays yours', () => {
    const { sounds, log } = heard();
    sounds.view(waiting(), false);
    log.length = 0;
    sounds.view(aView({}, 4), false);
    expect(log).toEqual([['yourTurn', undefined]]);
    log.length = 0;
    sounds.view(aView({ phase: 'drawn', must: 'playDrawnOrKeep', legal: [] }, 4), false);
    expect(log).toEqual([]);
  });

  it('sounds the score sheet once per hand: good when you went out, bad when another did', () => {
    const { sounds, log } = heard();
    const between = (handWinner: number, handNo: number): View =>
      aView({ phase: 'between', must: 'none', hand: [], legal: [], handWinner, handNo }, 4);
    sounds.view(between(0, 1), false);
    sounds.view({ ...between(0, 1) }, false);
    sounds.view(between(2, 2), false);
    expect(log).toEqual([
      ['roundGood', undefined],
      ['roundBad', undefined],
    ]);
  });

  it('sounds the end of the match once: a fanfare for the winners, a loss for the rest, nothing with no winner', () => {
    const over = (matchWinner: number | null): View =>
      aView({ phase: 'over', must: 'none', hand: [], legal: [], matchWinner }, 4);
    const won = heard();
    // 2v2: seat 2 won, and seat 0 is their partner.
    won.sounds.view(over(2), true);
    won.sounds.view({ ...over(2) }, true);
    expect(won.log).toEqual([['fanfare', undefined]]);
    const lost = heard();
    lost.sounds.view(over(1), false);
    expect(lost.log).toEqual([['roundBad', undefined]]);
    const none = heard();
    none.sounds.view(over(null), false);
    expect(none.log).toEqual([]);
  });
});
