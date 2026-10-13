/* The awards on the end screen: who did what best in the game that just finished. Every one is read
   off the round log the scoreboard shows, so a scoresheet earns them like a played game does. */
import { Rules } from '../game';
import type { Seat } from '../protocol/generated';
import { ICON } from './art';
import { esc, sgn } from './dom';
import type { ScoreView } from './state';

export interface Award {
  c: string;
  i: string;
  t: string;
  d: string;
}
/** An award somebody won, and the seats that share it. */
interface Earned extends Award {
  seats: Seat[];
}
interface SeatRecord {
  hits: number;
  bonus: number;
  best: number;
  worst: number;
  long: number;
  cur: number;
  zeros: number;
  bold: number;
  tricks: number;
  kings: number;
  pirates: number;
}
/** The end screen is one screen without scrolling: it has room for this many awards. */
export const AWARDS_SHOWN = 6;
/** And for this many on a phone too small for six. */
export const AWARDS_TIGHT = 4;

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * The awards of a finished game, in the order they are handed out. A game can earn more than there
 * is room for. Then the ones that go to a seat without an award yet are kept first, so as many
 * players as possible get one, and the rest of the room goes to the others in order.
 */
export function awards(v: ScoreView, room = AWARDS_SHOWN): Award[] {
  const n = v.seats.length,
    stat: SeatRecord[] = v.seats.map(() => ({
      hits: 0,
      bonus: 0,
      best: -Infinity,
      worst: Infinity,
      long: 0,
      cur: 0,
      zeros: 0,
      bold: 0,
      tricks: 0,
      kings: 0,
      pirates: 0,
    }));
  v.log
    .filter((R) => R.done)
    .forEach((R) => {
      for (let i = 0; i < n; i++) {
        const s = Rules.scoreSeat(v.cfg, R, i),
          x = stat[i],
          bid = R.bids[i] ?? 0;
        if (!s) continue;
        if (s.hit) {
          x.hits++;
          x.cur++;
          x.long = Math.max(x.long, x.cur);
          x.bold = Math.max(x.bold, bid);
          if (bid === 0) x.zeros++;
        } else x.cur = 0;
        x.bonus += s.bonus;
        x.best = Math.max(x.best, s.total);
        x.worst = Math.min(x.worst, s.total);
        x.tricks += R.tricks[i] ?? 0;
        x.pirates += R.ps[i];
        if (R.sm === i) x.kings++;
      }
    });
  const top = (f: (x: SeatRecord) => number, min = 0): { v: number; who: string; seats: Seat[] } | null => {
    const m = Math.max(...stat.map(f));
    if (!(m > min)) return null;
    const seats = stat.flatMap((x, i) => (f(x) === m ? [i] : []));
    return { v: m, who: seats.map((i) => esc(v.seats[i].name)).join(' & '), seats };
  };
  const A: Earned[] = [];
  let a: ReturnType<typeof top>;
  if ((a = top((x) => x.hits)))
    A.push({ c: 'var(--green)', i: ICON.target, t: 'Sharpshooter', d: `${a.who} · ${a.v} bids made`, seats: a.seats });
  if ((a = top((x) => x.long, 1)))
    A.push({ c: 'var(--orange)', i: ICON.wave, t: 'Hot streak', d: `${a.who} · ${a.v} in a row`, seats: a.seats });
  if ((a = top((x) => x.bonus)))
    A.push({
      c: 'var(--gold-d)',
      i: ICON.chest,
      t: 'Bounty hunter',
      d: `${a.who} · ${a.v} bonus points`,
      seats: a.seats,
    });
  if ((a = top((x) => x.best)))
    A.push({
      c: 'var(--blue)',
      i: ICON.crown,
      t: 'Biggest haul',
      d: `${a.who} · ${sgn(a.v)} in one round`,
      seats: a.seats,
    });
  if ((a = top((x) => x.kings)))
    A.push({
      c: 'var(--c-mermaid)',
      i: ICON.skull,
      t: 'Kingslayer',
      d: `${a.who} · caught the Skull King${a.v > 1 ? ` ${a.v} times` : ''}`,
      seats: a.seats,
    });
  if ((a = top((x) => x.pirates)))
    A.push({
      c: 'var(--c-tigress)',
      i: ICON.hook,
      t: 'Pirate hunter',
      d: `${a.who} · ${count(a.v, 'Pirate', 'Pirates')} taken by the King`,
      seats: a.seats,
    });
  if ((a = top((x) => x.bold, 2)))
    A.push({
      c: 'var(--purple)',
      i: ICON.flag,
      t: 'Bold call',
      d: `${a.who} · bid ${a.v} and made it`,
      seats: a.seats,
    });
  if ((a = top((x) => x.zeros, 1)))
    A.push({
      c: 'var(--c-kraken)',
      i: ICON.ghost,
      t: 'Ghost ship',
      d: `${a.who} · ${a.v} zero bids made`,
      seats: a.seats,
    });
  if ((a = top((x) => x.tricks)))
    A.push({
      c: 'var(--c-purple)',
      i: ICON.stack,
      t: 'Plunderer',
      d: `${a.who} · ${count(a.v, 'trick', 'tricks')} taken`,
      seats: a.seats,
    });
  if ((a = top((x) => -x.worst)))
    A.push({
      c: 'var(--red)',
      i: ICON.anchor,
      t: 'Walk the plank',
      d: `${a.who} · ${sgn(-a.v)} in one round`,
      seats: a.seats,
    });
  if (A.length <= room) return A;
  const kept = new Set<Earned>(),
    awarded = new Set<Seat>();
  for (const e of A) {
    if (kept.size === room || e.seats.every((s) => awarded.has(s))) continue;
    kept.add(e);
    e.seats.forEach((s) => awarded.add(s));
  }
  for (const e of A) if (kept.size < room) kept.add(e);
  return A.filter((e) => kept.has(e));
}
