/* Ranked: the hub's way into the ranked queue, and the ladder. Nothing here works a rating, a tier
   or a cooldown out. The number, the tier's name, the placement flag and the time the queue opens
   again are the server's (`Me.rating`, `Me.cooldownUntil`, `GET /ladder`), and are shown as they came. */
import { useEffect, useState } from 'react';
import type { Online } from '../net/online';
import type { LadderEntry, Me, Season, UserId } from '../protocol/generated';
import { Sound } from '../sound/sound';
import { whole } from '../tableview/dom';
import { failureText } from './copy';
import { Avatar, Head, RatingBadge } from './parts';

/** How often the hub looks at the clock while the ranked queue is closed for this player. */
const COOLDOWN_TICK_MS = 1000;
const MINUTE_MS = 60_000;

/**
 * How long until `until` on the server's clock, or null when that time has passed or there is none.
 * The server decides when the queue opens again; this only counts down to the time it named.
 */
function useTimeLeft(online: Online, until: number | null): number | null {
  const [now, setNow] = useState(() => online.serverNow());
  useEffect(() => {
    if (until == null) return;
    const tick = (): void => setNow(online.serverNow());
    tick();
    const timer = setInterval(tick, COOLDOWN_TICK_MS);
    return () => clearInterval(timer);
  }, [online, until]);
  return until != null && until > now ? until - now : null;
}

/** "14 min", "3 h 45 min", "24 h": a cooldown is minutes the first time and can be a day. Rounded up, so it never says too little. */
export function waitText(ms: number): string {
  if (ms < MINUTE_MS) return 'less than a minute';
  const minutes = Math.ceil(ms / MINUTE_MS),
    hours = Math.floor(minutes / 60),
    rest = minutes % 60;
  return [hours ? `${hours} h` : '', rest ? `${rest} min` : ''].filter(Boolean).join(' ');
}

export interface RankedSectionProps {
  online: Online;
  me: Me | null;
  live: boolean;
  onLadder: () => void;
  onSignUp: () => void;
}

/** The hub's ranked block: the player's rating, the way into the queue, and the ladder. */
export function RankedSection({ online, me, live, onLadder, onSignUp }: RankedSectionProps) {
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const left = useTimeLeft(online, me?.cooldownUntil ?? null);
  const to = (go: () => void) => () => {
    Sound.play('tap');
    go();
  };
  const find = (): void => {
    // While the server's cooldown runs, nothing is sent: the answer is known.
    if (left != null || finding) return;
    Sound.play('confirm');
    setFinding(true);
    setError(null);
    void online.joinQueue('ranked').then((r) => {
      setFinding(false);
      if (!r.ok) setError(failureText(r));
    });
  };

  // A guest cannot queue for ranked, so the hub does not ask the server to say so.
  if (!me || me.guest)
    return (
      <section className="stack" aria-label="Ranked">
        <span className="label">Ranked</span>
        <p className="muted">Ranked needs an account.</p>
        <button type="button" className="btn ghost" disabled={!me} onClick={to(onSignUp)}>
          Create an account
        </button>
        <button type="button" className="btn ghost" disabled={!live} onClick={to(onLadder)}>
          Ladder
        </button>
      </section>
    );
  const rating = me.rating;
  return (
    <section className="stack" aria-label="Ranked">
      <span className="label">Ranked</span>
      <div className="plate">
        <span className="grow">
          <small>Rating</small>
          {rating ? (
            <RatingBadge rating={rating} />
          ) : (
            <>
              <b className="unrated">Unrated</b>
              <small>Play a ranked game to get a rating.</small>
            </>
          )}
        </span>
        <button type="button" className="mini" disabled={!live} onClick={to(onLadder)}>
          Ladder
        </button>
      </div>
      {rating?.provisional && <p className="muted">These are placement games. Your tier is not settled yet.</p>}
      {left != null && (
        <div className="notice" role="status">
          <b>Ranked is closed for you</b>
          <p>You forfeited a ranked game. It opens again in {waitText(left)}.</p>
        </div>
      )}
      <button type="button" className="btn blue" disabled={!live || finding || left != null} onClick={find}>
        Find a ranked game
      </button>
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : (
        <p className="muted">
          The standard rules against other pirates, no bots. Leaving a ranked game, or staying away for most of it,
          scores last place and starts a cooldown.
        </p>
      )}
    </section>
  );
}

/** A season is a UTC calendar quarter, so its days are named in UTC: the same dates for everyone. */
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
/** `endsAt` is the first millisecond of the next season: the last day of this one is the day before. */
const seasonDays = (season: Season): string => `${DAY.format(season.startsAt)} – ${DAY.format(season.endsAt - 1)}`;

type Ladder =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; season: Season; entries: LadderEntry[]; next: string | null };

export interface LadderScreenProps {
  online: Online;
  /** The player looking at it, so their own row can be marked. */
  me: UserId | null;
  live: boolean;
  onBack: () => void;
}

/** The current season's ladder, a page at a time. */
export function LadderScreen({ online, me, live, onBack }: LadderScreenProps) {
  const [ladder, setLadder] = useState<Ladder>({ state: 'loading' });
  const [round, setRound] = useState(0);
  const [more, setMore] = useState<'idle' | 'loading' | 'failed'>('idle');

  useEffect(() => {
    if (!live) return;
    let stale = false;
    void online.ladder().then((r) => {
      if (stale) return;
      setLadder(
        r.ok
          ? { state: 'ready', season: r.value.season, entries: r.value.entries, next: r.value.next ?? null }
          : { state: 'failed' },
      );
    });
    return () => {
      stale = true;
    };
  }, [online, live, round]);

  const again = (): void => {
    Sound.play('tap');
    setLadder({ state: 'loading' });
    setMore('idle');
    setRound((n) => n + 1);
  };
  const showMore = (): void => {
    if (ladder.state !== 'ready' || ladder.next == null || more === 'loading') return;
    Sound.play('tap');
    setMore('loading');
    const from = ladder;
    void online.ladder(ladder.next).then((r) => {
      if (!r.ok) return setMore('failed');
      setMore('idle');
      // The page belongs behind the rows it was asked after: if the ladder was read again meanwhile, it is dropped.
      setLadder((now) =>
        now === from ? { ...from, entries: [...from.entries, ...r.value.entries], next: r.value.next ?? null } : now,
      );
    });
  };

  return (
    <>
      <div className="wrap">
        <Head title="Ladder" onBack={onBack} />
        <div className="stack">
          {ladder.state === 'loading' ? (
            <div className="notice" role="status">
              <b>Reading the ladder…</b>
              <p>One moment.</p>
            </div>
          ) : ladder.state === 'failed' ? (
            <div className="notice" role="alert">
              <b>Couldn't load the ladder</b>
              <p>Check your connection and try again.</p>
              <button type="button" className="btn ghost" disabled={!live} onClick={again}>
                Try again
              </button>
            </div>
          ) : (
            <>
              <div className="season">
                <b>{ladder.season.name}</b>
                <small>{seasonDays(ladder.season)}</small>
              </div>
              {ladder.entries.length === 0 ? (
                <div className="notice" role="status">
                  <b>Nobody is on the ladder yet</b>
                  <p>Play a ranked game to be the first.</p>
                </div>
              ) : (
                <ol className="ranking" aria-label="Ladder">
                  {ladder.entries.map((entry) => {
                    const you = entry.user.id === me;
                    return (
                      <li key={entry.user.id} className={you ? 'you' : undefined}>
                        <span className="place num">{entry.rank}</span>
                        <Avatar name={entry.user.name} color={entry.user.color} />
                        <span className="grow">
                          <b>{entry.user.name}</b>
                          <small>
                            {[entry.rating.tier, entry.rating.provisional ? 'Placement' : '', you ? 'You' : '']
                              .filter(Boolean)
                              .join(' · ')}
                          </small>
                        </span>
                        <b className="num">{whole(entry.rating.value)}</b>
                      </li>
                    );
                  })}
                </ol>
              )}
            </>
          )}
        </div>
      </div>
      {(!live || (ladder.state === 'ready' && ladder.next != null)) && (
        <div className="footbar">
          <div>
            {more === 'failed' ? (
              <p className="foot-hint alert" role="alert">
                Couldn't load more. Try again.
              </p>
            ) : (
              !live && (
                <p className="foot-hint" role="status">
                  Not connected. Trying again…
                </p>
              )
            )}
            {ladder.state === 'ready' && ladder.next != null && (
              <button type="button" className="btn ghost" disabled={!live || more === 'loading'} onClick={showMore}>
                Show more
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
