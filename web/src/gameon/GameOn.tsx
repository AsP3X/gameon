/* GameOn: the frame around the game. The landing, Games, and signing up and in are its pages
   (plan item W1), and so are the profile, another player and the ladder (W5), and the four pages
   the footer leads to: how to play, privacy, the imprint and a game to suggest. Skull King is the
   one game inside it. React draws them next to the legacy renderer's #app and the online screens,
   and the page's address says which is up.

   The frame needs no connection. It asks the server who this browser is over REST and shows what
   it is told: a visitor without a session stays one on the landing, on the two forms, on the
   ladder and on another player's page, and gets a guest at Games, where they are on their way to
   a table. Nothing here decides anything about a
   game, a rating or a seat. */
import { useEffect, useState } from 'react';
import type { Online, OnlineState } from '../net/online';
import { OchoClient } from '../ocho/client';
import { ochoTransport } from '../ocho/transport';
import { OchoPage, OchoRules } from '../ocho/Ocho';
import type { LobbyId } from '../protocol/generated';
import { AT } from '../router/addresses';
import type { FrameRoute } from '../router/addresses';
import { SignIn, SignUp } from './Account';
import { accountOf, GoContext } from './Frame';
import type { Go } from './Frame';
import { Games } from './Games';
import { LadderPage } from './Ladder';
import { Landing } from './Landing';
import { HowToPlayPage, ImprintPage, PrivacyPage } from './Pages';
import { PlayerPage, ProfilePage } from './Profile';
import { SuggestPage } from './Suggest';
import { useWho } from './who';

export interface GameOnProps {
  online: Online;
  state: OnlineState;
  /** The page the address names. */
  route: FrameRoute;
  go: Go;
  /** The Back of a page that has one parent, and of a page that has none (src/router/router.ts). */
  up: (parent: string) => void;
  back: (fallback: string) => void;
  /** Sit down at a public table. The online screens take it from there. */
  onJoin: (id: LobbyId) => void;
  /** Ocho's connection, kept by the page so a table outlasts a visit to another page. A frame
      without one makes its own when it first needs it. */
  ocho?: OchoClient;
}

export function GameOn({ online, state, route, go, up, back, onJoin, ocho: given }: GameOnProps) {
  const [own] = useState(() => given ?? new OchoClient(ochoTransport));
  const ocho = given ?? own;
  // At Games and at Ocho's table the player is on their way in: a browser without a session gets
  // its guest there. Ocho's server reads that session and makes none of its own.
  const who = useWho(online, state.me, route.page === 'games' || route.page === 'ocho' || route.page === 'ochoTeams');
  const season = state.config ? state.config.season : undefined;
  const account = accountOf(who) != null;

  // Whoever has an account has nothing to sign up for.
  useEffect(() => {
    if (account && route.page === 'signUp') go(AT.games, { replace: true });
  }, [account, route.page, go]);

  // The form gives way to Games: Back from there does not return to a form that is done.
  const entered = (): void => go(AT.games, { replace: true });
  // A page the footer led to goes back to where it was reached from, and to the front page when
  // it was reached by its address.
  const toFooter = (): void => back(AT.landing);
  return (
    <GoContext value={go}>
      <div id="gameon">
        {route.page === 'ocho' || route.page === 'ochoTeams' ? (
          <OchoPage key={route.page} ocho={ocho} who={who} teams={route.page === 'ochoTeams'} go={go} />
        ) : route.page === 'ochoRules' ? (
          <OchoRules />
        ) : route.page === 'games' ? (
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
        ) : route.page === 'profile' ? (
          <ProfilePage online={online} who={who} season={season} go={go} />
        ) : route.page === 'player' ? (
          // Reached from a table, the ladder or its address: Back leads to where it was come from.
          <PlayerPage key={route.id} online={online} who={who} id={route.id} go={go} onBack={() => back(AT.ladder)} />
        ) : route.page === 'ladder' ? (
          // The ladder belongs to Skull King's ranked page, and goes back there.
          <LadderPage online={online} who={who} season={season} onBack={() => up(AT.ranked)} />
        ) : route.page === 'howToPlay' ? (
          <HowToPlayPage who={who} onBack={toFooter} />
        ) : route.page === 'privacy' ? (
          <PrivacyPage who={who} onBack={toFooter} />
        ) : route.page === 'imprint' ? (
          <ImprintPage who={who} onBack={toFooter} />
        ) : route.page === 'suggest' ? (
          <SuggestPage who={who} onBack={toFooter} />
        ) : (
          <Landing online={online} who={who} season={season} />
        )}
      </div>
    </GoContext>
  );
}
