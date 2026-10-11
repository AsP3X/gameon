/* Small pieces the online screens share: the header row, a player's avatar, a rating and the stat tiles. */
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Rating, Stats, TableColor } from '../protocol/generated';
import { Sound } from '../sound/sound';
import { cssColor, whole } from '../tableview/dom';
import { BackIcon } from './icons';

export const initialOf = (name: string): string => (name.trim()[0] || '?').toUpperCase();

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
