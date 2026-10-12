/* Storage: the per-device saves in localStorage.
   Ported from the legacy build (legacy/Skull King Tavern.html, section 6) without changing behavior:
   the keys and the stored shapes are the legacy ones, so a save made by the single-file build still loads. */
import { Engine } from '../game';
import type { GameState } from '../game';

export const Store = {
  GAME: 'skullking-tavern.game.v2',
  PREFS: 'skullking-tavern.prefs.v2',
  STATS: 'skullking-tavern.stats.v1',
  /** The parsed value, or null when the key is empty, unreadable or storage is blocked. The caller names the shape. */
  get<T>(k: string): T | null {
    try {
      const r = localStorage.getItem(k);
      return r ? (JSON.parse(r) as T) : null;
    } catch {
      return null;
    }
  },
  set(k: string, v: unknown): void {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      // Private mode or a full quota: the game goes on without the save.
    }
  },
  saveGame(state: GameState): void {
    Store.set(Store.GAME, state);
  },
  loadGame(): GameState | null {
    const s = Store.get<GameState>(Store.GAME);
    return s && s.version === Engine.VERSION ? s : null;
  },
  /** Drop the saved game. The key is taken away, which `loadGame` reads as no game. */
  forgetGame(): void {
    try {
      localStorage.removeItem(Store.GAME);
    } catch {
      // Storage is blocked: there was no save to drop.
    }
  },
};
