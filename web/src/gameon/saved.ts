/* The offline game this device has saved, in the few words the "Jump back in" block needs. The save
   is the legacy renderer's (src/tableview/store.ts) and is only read here. */
import { Store } from '../tableview/store';

export interface SavedGame {
  /** Seats played on this device. One is a solo game, more is one screen for everybody. */
  humans: number;
  bots: number;
  /** 1-based. */
  round: number;
  rounds: number;
}

/** The saved game, when there is one that is not over. */
export function savedGame(): SavedGame | null {
  const saved = Store.loadGame();
  if (!saved || saved.phase === 'gameOver') return null;
  const bots = saved.seats.filter((seat) => seat.bot).length;
  return { humans: saved.seats.length - bots, bots, round: saved.round + 1, rounds: saved.schedule.length };
}

const count = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`;

/** "solo against 3 bots", "one screen, 4 players". */
export const savedTitle = (game: SavedGame): string =>
  game.humans === 1 ? `solo against ${count(game.bots, 'bot')}` : `one screen, ${count(game.humans, 'player')}`;
