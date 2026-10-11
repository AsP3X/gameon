/* Stats: the solo player's record across games, shown on the home screen.
   Ported from the legacy build (legacy/Skull King Tavern.html, section 11) without changing behavior. */
import { Rules } from '../game';
import type { Seat } from '../protocol/generated';
import { stats } from './state';
import type { ScoreView } from './state';
import { Store } from './store';

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
/**
 * `local` are the seats that were played on this device. One of them is a solo game, and only that
 * is recorded: pass-and-play results would mix several people's records.
 */
export function recordGame(v: ScoreView, local: readonly Seat[]): void {
  if (local.length !== 1) return;
  const me = local[0],
    tot = Rules.totals(v.log, v.cfg, v.seats.length);
  stats.games++;
  if (tot[me] === Math.max(...tot)) stats.wins++;
  v.log.forEach((R) => {
    if (!R.done) return;
    stats.bids++;
    if (R.bids[me] === R.tricks[me]) stats.made++;
  });
  stats.best = stats.best == null ? tot[me] : Math.max(stats.best, tot[me]);
  const today = dayKey(new Date()),
    y = new Date();
  y.setDate(y.getDate() - 1);
  if (stats.lastDay !== today) stats.streak = stats.lastDay === dayKey(y) ? stats.streak + 1 : 1;
  stats.lastDay = today;
  Store.set(Store.STATS, stats);
}
