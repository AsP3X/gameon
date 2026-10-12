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
