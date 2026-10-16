/* What every page of the frame has around it: the bar at the top with the logo and the way in, the
   footer, and the links between pages. A link is a real one: it has the page's address, so it can
   be opened in a new tab, and a plain click goes there without loading the page again. */
import { createContext, useContext, useEffect, useRef } from 'react';
import type { MouseEvent, ReactNode, RefObject } from 'react';
import type { Me } from '../protocol/generated';
import { initialOf } from '../online/parts';
import { AT } from '../router/addresses';
import type { FramePage } from '../router/addresses';
import { cssColor } from '../tableview/dom';
import { Logo } from './art';
import { Icon } from './icons';

/** To another page, as a link goes, or in this page's place. */
export type Go = (path: string, how?: { replace?: boolean }) => void;
export const GoContext = createContext<Go>(() => {});

/**
 * Who the frame is talking to. `asking` until the server has said; a `visitor` has no session;
 * `unknown` when the server could not be asked.
 */
export type Who = { is: 'asking' } | { is: 'unknown' } | { is: 'visitor' } | { is: 'player'; me: Me };

/** The account, when the player has one: a guest plays without. */
export const accountOf = (who: Who): Me | null => (who.is === 'player' && !who.me.guest ? who.me : null);

export function Link(props: {
  to: string;
  className?: string;
  label?: string;
  current?: boolean;
  /** What a plain click does in the place of going to the address: the page has more to do on the way. */
  onFollow?: () => void;
  children: ReactNode;
}) {
  const go = useContext(GoContext);
  const click = (e: MouseEvent): void => {
    // A new tab, a new window or a download is the browser's to do.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (props.onFollow) props.onFollow();
    else go(props.to);
  };
  return (
    <a
      href={props.to}
      className={props.className}
      aria-label={props.label}
      aria-current={props.current ? 'page' : undefined}
      onClick={click}
    >
      {props.children}
    </a>
  );
}

/**
 * A page's title takes the keyboard when the page opens, as the online screens' titles do
 * (src/online/parts.tsx): the link that led here is gone, and a screen reader says where the
 * player now is. The page starts at its top.
 */
export function useTitle(tab: string): RefObject<HTMLHeadingElement | null> {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const before = document.title;
    document.title = tab;
    title.current?.focus({ preventScroll: true });
    document.scrollingElement?.scrollTo?.(0, 0);
    return () => {
      document.title = before;
    };
  }, [tab]);
  return title;
}

function Avatar({ me }: { me: Me }) {
  return (
    <span className="avatar go-avatar" style={{ background: cssColor(me.user.color) }} aria-hidden="true">
      {initialOf(me.user.name)}
    </span>
  );
}

/** The signed-in player, at the right of the bar: it leads to their profile. */
function PlayerChip({ me, current }: { me: Me; current: boolean }) {
  return (
    <Link to={AT.profile} className="go-chip" label={`${me.user.name}, your profile`} current={current}>
      <Avatar me={me} />
      <span className="go-chip-text wide-only">
        <b>{me.user.name}</b>
        <small>{me.rating?.tier ?? me.username}</small>
      </span>
      <span className="wide-only go-chip-more">
        <Icon name="chevronDown" />
      </span>
    </Link>
  );
}

export interface NavProps {
  page: FramePage;
  who: Who;
  /** The landing's own link down to its "ways to play". */
  onWays?: () => void;
}

export function Nav({ page, who, onWays }: NavProps) {
  const account = accountOf(who),
    form = page === 'signIn' || page === 'signUp',
    // Only the landing and Games themselves are under Games.
    aside = page !== 'landing' && page !== 'games';
  return (
    <header className={page === 'games' ? 'go-nav go-wide' : 'go-nav'}>
      <div className="go-in">
        <div className="go-nav-left">
          <Link to={AT.landing} className="go-home" label="GameOn, the front page" current={page === 'landing'}>
            <Logo />
          </Link>
          {!form && (
            <nav className="go-links wide-only" aria-label="GameOn">
              <Link to={AT.games} className={aside ? 'go-link' : 'go-link on'} current={page === 'games'}>
                Games
              </Link>
              {onWays && (
                <button type="button" className="go-link" onClick={onWays}>
                  Ways to play
                </button>
              )}
              <Link to={AT.ladder} className={page === 'ladder' ? 'go-link on' : 'go-link'} current={page === 'ladder'}>
                Ladder
              </Link>
            </nav>
          )}
        </div>
        {page === 'signUp' ? (
          <div className="go-nav-right">
            <span className="go-switch wide-only">Already have an account?</span>
            <Link to={AT.signIn} className="btn ghost go-btn wide-only">
              Sign in
            </Link>
            <Link to={AT.signIn} className="go-text-link narrow-only">
              Sign in
            </Link>
          </div>
        ) : page === 'signIn' ? (
          <div className="go-nav-right">
            <span className="go-switch wide-only">New here?</span>
            <Link to={AT.signUp} className="btn ghost go-btn wide-only">
              Create account
            </Link>
            <Link to={AT.signUp} className="go-text-link narrow-only">
              Create account
            </Link>
          </div>
        ) : (
          <div className="go-nav-right">
            {account ? (
              <span className={page === 'landing' ? 'wide-only' : undefined}>
                <PlayerChip me={account} current={page === 'profile'} />
              </span>
            ) : (
              (who.is === 'visitor' || who.is === 'player' || who.is === 'unknown') && (
                <Link to={AT.signIn} className={`btn ghost go-btn${page === 'landing' ? ' wide-only' : ''}`}>
                  Sign in
                </Link>
              )
            )}
            {page === 'landing' && (
              <Link to={AT.home} className="btn go-btn" label="Play Skull King now">
                <span className="wide-only">Play now</span>
                <span className="narrow-only">Play</span>
              </Link>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

/** The four pages the footer leads to, beside Games and the ladder. */
const MORE: { page: FramePage; to: string; name: string }[] = [
  { page: 'howToPlay', to: AT.howToPlay, name: 'How to play' },
  { page: 'privacy', to: AT.privacy, name: 'Privacy' },
  { page: 'imprint', to: AT.imprint, name: 'Imprint' },
  { page: 'suggest', to: AT.suggest, name: 'Suggest a game' },
];

/** The footer of the landing, of Games, of the profile, of the ladder, and of the four pages it leads to. */
export function Footer({ page, who }: { page: FramePage; who: Who }) {
  return (
    <footer className={page === 'games' ? 'go-foot go-wide' : 'go-foot'}>
      <div className="go-in">
        <Link to={AT.landing} className="go-home" label="GameOn, the front page">
          <Logo />
        </Link>
        <nav className="go-foot-links" aria-label="More of GameOn">
          {page === 'landing' && !accountOf(who) && (
            <Link to={AT.signIn} className="go-foot-link narrow-only">
              Sign in
            </Link>
          )}
          <Link to={AT.games} className="go-foot-link">
            Games
          </Link>
          <Link to={AT.ladder} className="go-foot-link">
            Ladder
          </Link>
          {MORE.map((more) => (
            <Link key={more.page} to={more.to} className="go-foot-link" current={page === more.page}>
              {more.name}
            </Link>
          ))}
        </nav>
        <span className="go-copy">© {new Date().getFullYear()} GameOn</span>
      </div>
    </footer>
  );
}
