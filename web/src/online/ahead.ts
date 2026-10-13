import { useEffect, useState } from 'react';
import type { Online } from '../net/online';

/**
 * Whether a time the server named is still ahead on the server's clock, looked at again when it
 * has come. The page only needs to know that, never how long it is: the wait is not drawn.
 */
export function useAhead(online: Online, until: number | null): boolean {
  const [, setTick] = useState(0);
  const left = until == null ? 0 : until - online.serverNow();
  useEffect(() => {
    if (left <= 0) return;
    // A day at most: the browser's timers do not take longer waits.
    const timer = setTimeout(() => setTick((n) => n + 1), Math.min(left + 50, 86_400_000));
    return () => clearTimeout(timer);
  }, [left]);
  return left > 0;
}

/**
 * The whole seconds left until a time the server named, on the server's clock, looked at again
 * when the next one begins. 0 once the time has come.
 */
export function useSecondsLeft(online: Online, until: number): number {
  const [, setTick] = useState(0);
  const seconds = Math.max(0, Math.ceil((until - online.serverNow()) / 1000));
  useEffect(() => {
    if (seconds === 0) return;
    const left = until - online.serverNow();
    const timer = setTimeout(() => setTick((n) => n + 1), left - (seconds - 1) * 1000 + 20);
    return () => clearTimeout(timer);
  }, [online, until, seconds]);
  return seconds;
}
