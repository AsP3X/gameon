/* GameOn: the frame around the game. The landing, Games, and signing up and in are its pages
   (plan item W1); Skull King is the one game inside it. React draws them next to the legacy
   renderer's #app and the online screens, and the page's address says which is up.

   The frame needs no connection. It asks the server who this browser is over REST and shows what
   it is told: a visitor without a session stays one on the landing and on the two forms, and gets
   a guest at Games, where they are on their way to a table. Nothing here decides anything about a
   game, a rating or a seat. */
import { useEffect } from 'react';
import type { Online, OnlineState } from '../net/online';
import type { LobbyId } from '../protocol/generated';
import { AT } from '../router/addresses';
import type { FrameRoute } from '../router/addresses';
import { SignIn, SignUp } from './Account';
import { accountOf, GoContext } from './Frame';
import type { Go } from './Frame';
import { Games } from './Games';
import { Landing } from './Landing';
import { useWho } from './who';

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
  // At Games the player is on their way in: a browser without a session gets its guest there.
  const who = useWho(online, state.me, route.page === 'games');
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
