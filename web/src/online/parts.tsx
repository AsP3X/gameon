/* Small pieces the online screens share: the page and its bar, the header row of the older
   screens, a player's avatar, a rating and the stat tiles. */
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { GoContext, Link } from '../gameon/Frame';
import type { Go } from '../gameon/Frame';
import type { LinkStatus } from '../net/socket';
import type { Me, Rating, Stats, TableColor } from '../protocol/generated';
import { AT } from '../router/addresses';
import { ICON } from '../tableview/art';
import { cssColor, whole } from '../tableview/dom';
import { prefs } from '../tableview/state';
import { Sound } from '../sound/sound';
import { BackIcon } from './icons';

export const initialOf = (name: string): string => (name.trim()[0] || '?').toUpperCase();

/**
 * A screen drawn as design/skt.pen draws the tables (plan item W4): Skull King's bar over a body.
 * It is a page of the frame, so the frame's pieces (the keys, the chip, what only a wide window
 * shows) look here as they do on Skull King's home.
 */
export function Page(props: { go: Go; className?: string; children: ReactNode }) {
  return (
    <GoContext value={props.go}>
      <div id="gameon" className={props.className ? `on-page ${props.className}` : 'on-page'}>
        {props.children}
      </div>
    </GoContext>
  );
}

const STATUS_PILL: Record<LinkStatus, { tone: string; text: string }> = {
  idle: { tone: 'soft', text: 'Connecting…' },
  connecting: { tone: 'soft', text: 'Connecting…' },
  online: { tone: 'green', text: 'Connected' },
  offline: { tone: 'red', text: 'Offline' },
  superseded: { tone: 'soft', text: 'Paused' },
  unsupported: { tone: 'red', text: 'Update needed' },
};

export interface BarProps {
  title: string;
  /** What the back button is called, where "Back" would not say what it does. */
  back?: string;
  onBack: () => void;
  /** The player: at the right of a wide window's bar, with the way to their profile. */
  me: Me | null;
  /** The connection, on the pages that say how it is. */
  status?: LinkStatus;
  /** What stands next to the title: a pill, or the one small button of the page. */
  children?: ReactNode;
}

/**
 * The bar of a page: back, the title, and what belongs next to it. A wide window also has the
 * sound settings and the player there.
 *
 * A new page takes the keyboard to its title. The button that led here is gone with the page it
 * was on, and without this the next Tab would start from the top, and a screen reader would say
 * nothing about where the player now is.
 */
export function Bar({ title, back, onBack, me, status, children }: BarProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [title]);
  const pill = status && STATUS_PILL[status];
  return (
    <header className="sk-bar on-bar">
      <div className="sk-solo-head">
        <button
          type="button"
          className="icon-btn"
          aria-label={back ?? 'Back'}
          onClick={() => {
            Sound.play('back');
            onBack();
          }}
        >
          <BackIcon />
        </button>
        <h1 tabIndex={-1} ref={heading}>
          {title}
        </h1>
        {children}
      </div>
      <div className="sk-bar-right">
        {pill && (
          <span className={`pill ${pill.tone}`} role="status">
            {pill.text}
          </span>
        )}
        {/* The renderer's own sheet: it listens on the document for this. */}
        <button type="button" className="icon-btn wide-only" data-act="soundSheet" aria-label="Sound settings">
          <span
            className="sk-ic"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: ICON[prefs.muted ? 'mute' : 'sound'] }}
          />
        </button>
        {me && (
          <Link to={AT.profile} className="go-chip wide-only" label={`${me.user.name}, your profile`}>
            <span className="avatar sm" style={{ background: cssColor(me.user.color) }} aria-hidden="true">
              {initialOf(me.user.name)}
            </span>
            <span className="go-chip-text">
              <b>{me.user.name}</b>
              <small>{me.rating?.tier ?? me.username ?? 'Guest'}</small>
            </span>
          </Link>
        )}
      </div>
    </header>
  );
}

/**
 * The row at the top of a screen: back, the title, and whatever belongs at the right.
 *
 * A new screen takes the keyboard to its title. The button that led here is gone with the screen
 * it was on, and without this the next Tab would start from the top of the page, and a screen
 * reader would say nothing about where the player now is.
 */
export function Head(props: { title: string; back?: string; onBack: () => void; children?: ReactNode }) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, [props.title]);
  return (
    <div className="row head">
      <button
        type="button"
        className="icon-btn"
        aria-label={props.back ?? 'Back'}
        onClick={() => {
          Sound.play('back');
          props.onBack();
        }}
      >
        <BackIcon />
      </button>
      <h2 className="grow" tabIndex={-1} ref={title}>
        {props.title}
      </h2>
      {props.children}
    </div>
  );
}

export function Avatar(props: { name: string; color: TableColor; size?: 'sm' | 'lg' }) {
  return (
    <span className={`avatar ${props.size ?? 'sm'}`} style={{ background: cssColor(props.color) }} aria-hidden="true">
      {initialOf(props.name)}
    </span>
  );
}

/**
 * A ranked rating as the server sent it: the number, the tier's name, and whether these are still
 * placement games. The tier is never worked out from the number here.
 */
export function RatingBadge({ rating }: { rating: Rating }) {
  return (
    <span className="rating">
      <b className="num">{whole(rating.value)}</b>
      <span className="pill gold">{rating.tier}</span>
      {rating.provisional && <span className="pill soft">Placement</span>}
    </span>
  );
}

/** A player's online record. A bid counts as hit when the tricks taken matched it. */
export function StatTiles({ stats }: { stats: Stats }) {
  const tiles: [string, string][] = [
    [String(stats.games), 'Games'],
    [String(stats.wins), 'Wins'],
    [stats.bidsTotal > 0 ? `${Math.round((stats.bidsMade / stats.bidsTotal) * 100)}%` : '–', 'Bids hit'],
    [stats.bestScore != null ? String(stats.bestScore) : '–', 'Best'],
  ];
  return (
    <div className="stats">
      {tiles.map(([value, label]) => (
        <div className="stat" key={label}>
          <b>{value}</b>
          <small>{label}</small>
        </div>
      ))}
    </div>
  );
}
