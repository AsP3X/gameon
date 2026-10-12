/* Who a page of the frame is talking to, asked of the server over REST (`Online.identify`). The
   pages need no connection for it. A server that does not answer is asked again by itself. */
import { useEffect, useState } from 'react';
import type { Identity, Online } from '../net/online';
import type { Me } from '../protocol/generated';
import type { Who } from './Frame';

/** How long a page waits before it asks again a server that could not be reached. */
const RETRY_MS = 5000;

/**
 * `me` is what the session state knows (`OnlineState.me`). `create` says the player is on their
 * way in: a browser without a session then gets a guest, as a connection would give it.
 */
export function useWho(online: Online, me: Me | null, create: boolean): Who {
  const [asked, setAsked] = useState<Identity | 'asking'>('asking');
  /** Counts the times the player this page knew was gone: each one is asked about again. */
  const [round, setRound] = useState(0);

  useEffect(() => {
    let stale = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    const ask = (): void => {
      void online.identify(create).then((answer) => {
        if (stale) return;
        setAsked(answer);
        if (answer === 'failed') timer = setTimeout(ask, RETRY_MS);
      });
    };
    ask();
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [online, create, round]);

  // The player the server named is gone from the page (they signed out): who this browser is now
  // is the server's to say again.
  useEffect(() => {
    if (me != null || asked !== 'known') return;
    setAsked('asking');
    setRound((n) => n + 1);
  }, [me, asked]);

  if (me) return { is: 'player', me };
  if (asked === 'failed') return { is: 'unknown' };
  return asked === 'nobody' && !create ? { is: 'visitor' } : { is: 'asking' };
}
