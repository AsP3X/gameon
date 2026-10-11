/* The standard clocks of docs/protocol.md §5.6. The server owns the real ones and says when each
   deadline is (`table.deadline.at`). These are for the two places that need a length without being
   told one: the mock server, and the deadline ring when it meets a clock that is already running. */
import type { DeadlineKind, Pace, Timers } from '../protocol/generated';

export const STANDARD_TIMERS: Timers = {
  bidMs: 45_000,
  playMs: 30_000,
  abilityMs: 30_000,
  trickEndMs: 2500,
  roundEndMs: 20_000,
  disconnectGraceMs: 60_000,
};
/** `pace` scales the bid, the play and the ability clock. The pause after a round is the same for all. */
export const PACE_SCALE: Record<Pace, number> = { relaxed: 2, standard: 1, fast: 0.5 };

/** How long the clock of a deadline of this kind runs from start to finish. */
export function deadlineMs(kind: DeadlineKind, pace: Pace, timers: Timers = STANDARD_TIMERS): number {
  switch (kind) {
    case 'bid':
      return timers.bidMs * PACE_SCALE[pace];
    case 'play':
      return timers.playMs * PACE_SCALE[pace];
    case 'ability':
      return timers.abilityMs * PACE_SCALE[pace];
    case 'nextRound':
      return timers.roundEndMs;
  }
}
