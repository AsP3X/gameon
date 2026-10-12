/* GameOn: the frame around the game. The landing, Games, and signing up and in are its pages
   (plan item W1); Skull King is the one game inside it. React draws them next to the legacy
   renderer's #app and the online screens, and the page's address says which is up.

   The frame needs no connection. It asks the server who this browser is over REST and shows what
   it is told: a visitor without a session stays one on the landing and on the two forms, and gets
   a guest at Games, where they are on their way to a table. Nothing here decides anything about a
   game, a rating or a seat. */
import { useEffect, useState } from 'react';
import type { Identity, Online, OnlineState } from '../net/online';
import type { LobbyId } from '../protocol/generated';
import { AT } from '../router/addresses';
import type { FrameRoute } from '../router/addresses';
import { SignIn, SignUp } from './Account';
import { accountOf, GoContext } from './Frame';
import type { Go, Who } from './Frame';
import { Games } from './Games';
import { Landing } from './Landing';

/** How long the frame waits before it asks a server again that could not be reached. */
const RETRY_MS = 5000;

export interface GameOnProps {
  online: Online;
  state: OnlineState;
  /** The page the address names. */
  route: FrameRoute;
  go: Go;
  /** Sit down at a public table. The online screens take it from there. */
  onJoin: (id: LobbyId) => void;
}

export function GameOn({ online, state, route, go, onJoin }: GameOnProps) {
  const [asked, setAsked] = useState<Identity | 'asking'>('asking');
  // At Games the player is on their way in: a browser without a session gets its guest there.
  const create = route.page === 'games';

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
  }, [online, create]);

  const me = state.me;
  const who: Who = me
    ? { is: 'player', me }
    : asked === 'failed'
      ? { is: 'unknown' }
      : asked === 'nobody' && !create
        ? { is: 'visitor' }
        : { is: 'asking' };
  const season = state.config ? state.config.season : undefined;
  const account = accountOf(who) != null;

  // Whoever has an account has nothing to sign up for.
  useEffect(() => {
    if (account && route.page === 'signUp') go(AT.games, { replace: true });
  }, [account, route.page, go]);

  // The form gives way to Games: Back from there does not return to a form that is done.
  const entered = (): void => go(AT.games, { replace: true });
  return (
    <GoContext value={go}>
      <div id="gameon">
        {route.page === 'games' ? (
          <Games online={online} who={who} seated={state.lobby != null} season={season} onJoin={onJoin} />
        ) : route.page === 'signUp' ? (
          <SignUp
            who={who}
            onSubmit={async (credentials) => {
              const r = await online.signUp(credentials);
              if (r.ok) entered();
              return r;
            }}
          />
        ) : route.page === 'signIn' ? (
          <SignIn
            who={who}
            season={season}
            onSubmit={async (credentials) => {
              const r = await online.login(credentials);
              if (r.ok) entered();
              return r;
            }}
          />
        ) : (
          <Landing online={online} who={who} season={season} />
        )}
      </div>
    </GoContext>
  );
}
