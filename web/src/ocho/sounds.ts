/* What Ocho's table sounds like. Each event plays once: the page hands every view it is pushed to
   `view`, and a view seen before, or a card already heard leaving your hand, plays nothing again.

   The sounds follow the views, not the motion: with reduced motion nothing travels, but a play
   still sounds. Mute and volume are the mixer's (`Sound.play` reads them on every call). */
import { Sound } from '../sound/sound';
import type { SoundName } from '../sound/sound';
import { changes } from './motion';
import type { Card, View } from './wire';

export type Play = (name: SoundName, arg?: number) => void;

/** Your turn to play or draw: the view asks you for a move at the table. */
const yours = (view: View): boolean =>
  view.phase !== 'between' && view.phase !== 'over' && view.must !== 'none' && view.must !== 'nextHand';

/** The seats that won the match: both partners in 2v2. */
export function winnersOf(view: View, teams: boolean): number[] {
  const w = view.matchWinner;
  return w == null ? [] : teams ? [w, (w + 2) % 4] : [w];
}

export class OchoSounds {
  private last: View | null = null;
  /** The card you played that is the discard already, until the server's view says the same. */
  private held: number | null = null;
  /** The hand whose score sheet sounded, and whether the match's end did. */
  private scored: number | null = null;
  private ended = false;

  constructor(private play: Play = (name, arg) => Sound.play(name, arg)) {}

  /** The page forgot the table: the next one starts fresh. */
  reset(): void {
    this.last = null;
    this.held = null;
    this.scored = null;
    this.ended = false;
  }

  /** You put `card` on the discard. Its view will not play it again. */
  played(card: Card, you: number): void {
    this.held = card.id;
    this.play('cardPlay', you);
  }

  /** The server refused the card you played: it goes back to your hand. */
  refused(): void {
    this.held = null;
    this.play('nope');
  }

  /** A tap on a button that moves the game on: Next hand, Back to games, the pile. */
  tap(): void {
    this.play('tap');
  }

  view(next: View, teams: boolean): void {
    const prev = this.last;
    if (next === prev) return;
    this.last = next;

    if (next.phase === 'over') {
      if (this.ended) return;
      this.ended = true;
      const winners = winnersOf(next, teams);
      if (winners.includes(next.you)) this.play('fanfare');
      else if (winners.length > 0) this.play('roundBad');
      return;
    }
    if (next.phase === 'between') {
      if (this.scored === next.handNo) return;
      this.scored = next.handNo;
      if (next.handWinner === next.you) this.play('roundGood');
      else if (next.handWinner != null) this.play('roundBad');
      return;
    }

    const c = changes(prev, next);
    if (c.deal) {
      this.held = null;
      this.play('deal', next.hand.length);
    } else {
      if (c.played) {
        const from = c.played.from === 'you' ? next.you : c.played.from;
        if (c.played.card.id === this.held) this.held = null;
        else this.play('cardPlay', from);
      }
      this.cards(next.you, c.mine.length);
      for (const d of c.drawn) this.cards(d.seat, d.n);
      if (c.turned) this.play('whoosh');
    }
    if (yours(next) && !(prev && yours(prev) && prev.handNo === next.handNo)) this.play('yourTurn');
  }

  /** Cards that joined a hand outside a deal: one is a card, several at once are dealt. */
  private cards(seat: number, n: number): void {
    if (n === 1) this.play('cardPlay', seat);
    else if (n > 1) this.play('deal', n);
  }
}
