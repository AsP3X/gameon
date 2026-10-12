/* Ranked: Skull King's ranked page, as design/skt.pen draws it (`Skull King · ranked` and its
   states), and the ladder. Nothing here works a rating, a tier or a cooldown out. The number, the
   tier's name, the placement flag, the season and whether the queue is closed for this player are
   the server's (`Me.rating`, `Me.cooldownUntil`, `GET /config`, `GET /ladder`), and are shown as
   they came. The standard rules are the ones the server says it plays (`ServerConfig.standard`). */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { TIERS } from '../gameon/catalog';
import type { Go } from '../gameon/Frame';
import { Icon } from '../gameon/icons';
import { Rules } from '../game';
import type { Online, OnlineState } from '../net/online';
import type { GameSettings, LadderEntry, Season, UserId } from '../protocol/generated';
import { EXTRAS, formatName, scoringName } from '../skullking/rulesets';
import { Sound } from '../sound/sound';
import { whole } from '../tableview/dom';
import { useAhead } from './ahead';
import { failureText } from './copy';
import { Avatar, Bar, Head, Page, RatingBadge } from './parts';

/** Where each tier above the lowest starts, on the rating's number (docs/protocol.md §4). For reading only: a player's tier is the name the server sent. */
const FLOORS = [8, 16, 24, 32, 40, 48];
const bandOf = (i: number): string =>
  i === 0
    ? `below ${FLOORS[0]}`
    : i === TIERS.length - 1
      ? `from ${FLOORS[i - 1]}`
      : `${FLOORS[i - 1]} to ${FLOORS[i] - 1}`;

const COUNT = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];
/** A season is a UTC calendar quarter, so its days are named in UTC: the same dates for everyone. */
const LAST_DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/** The rules of a ranked table, a line each: what is played, and what is left out of the deck. */
function StandardRules({ rules }: { rules: GameSettings }) {
  const rounds = Rules.FORMATS[rules.format].seq.length;
  const lines: { on: boolean; text: string; note?: string }[] = [
    { on: true, text: `${COUNT[rules.maxPlayers] ?? rules.maxPlayers} players` },
    { on: true, text: `${scoringName(rules.scoring)} scoring` },
    { on: true, text: formatName(rules.format), note: `${rounds} rounds` },
    ...EXTRAS.map(([key, name]) => ({ on: rules[key], text: rules[key] ? name : `No ${name.toLowerCase()}` })),
  ];
  return (
    <section className="on-block" aria-labelledby="on-standard">
      <h2 className="label" id="on-standard">
        The standard rules
      </h2>
      <ul className="on-lines">
        {lines.map((line) => (
          <li key={line.text} className={line.on ? undefined : 'off'}>
            <Icon name={line.on ? 'check' : 'minus'} />
            <b>{line.text}</b>
            {line.note && <small>{line.note}</small>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface RankedScreenProps {
  online: Online;
  state: OnlineState;
  go: Go;
  onBack: () => void;
  onLadder: () => void;
  onSignUp: () => void;
  /** What stands between the player and the server, if anything. */
  children?: ReactNode;
}

/** The one door into the ranked queue: no rules to pick, no bots to seat. */
export function RankedScreen({ online, state, go, onBack, onLadder, onSignUp, children }: RankedScreenProps) {
  const me = state.me,
    live = state.status === 'online',
    season = state.config?.season ?? null,
    standard = state.config?.standard ?? null;
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The server closed ranked for this player until a time it named. The page says so, and no more.
  const closed = useAhead(online, me?.cooldownUntil ?? null);
  const guest = me?.guest === true;
  const to = (follow: () => void) => () => {
    Sound.play('tap');
    follow();
  };
  const find = (): void => {
    // A guest and a closed queue get no question sent: the answer is known.
    if (!me || guest || closed || finding) return;
    Sound.play('confirm');
    setFinding(true);
    setError(null);
    void online.joinQueue('ranked').then((r) => {
      setFinding(false);
      if (!r.ok) setError(failureText(r));
    });
  };
  const rating = me?.rating ?? null;

  return (
    <Page go={go}>
      <Bar title="Ranked" onBack={onBack} me={me} status={state.status} />
      <main className="on-body">
        {children}
        {season && (
          <div className="on-season">
            <span className="pill gold caps">Season {season.name}</span>
            <b>The season runs until {LAST_DAY.format(season.endsAt - 1)}</b>
            <p>Five placement games set your tier. Then every ranked game moves your rating.</p>
          </div>
        )}
        <section aria-label="Ranked">
          {guest ? (
            <div className="notice">
              <b>Ranked needs a free account.</b>
              <button type="button" className="btn" onClick={to(onSignUp)}>
                Sign up
              </button>
            </div>
          ) : (
            me && (
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
            )
          )}
          {closed && !guest && (
            <div className="notice" role="status">
              <span className="pill red">Cooldown</span>
              <b>Ranked is closed for you</b>
              <p>You forfeited a ranked game.</p>
            </div>
          )}
          <button
            type="button"
            className="btn blue"
            disabled={!live || !me || guest || closed || finding}
            onClick={find}
          >
            Find a ranked game
          </button>
          <p className="on-lead">This quarter. The standard rules. No bots.</p>
          {error ? (
            <p className="alert" role="alert">
              {error}
            </p>
          ) : (
            <p className="muted">
              Leaving a ranked game, losing your seat, or staying away for most of it scores last place and starts a
              cooldown.
            </p>
          )}
        </section>
        {standard && <StandardRules rules={standard} />}
        <section className="on-block" aria-labelledby="on-tiers">
          <h2 className="label" id="on-tiers">
            Tiers
          </h2>
          <ol className="on-lines" reversed>
            {TIERS.map((tier, i) => ({ tier, band: bandOf(i) }))
              .reverse()
              .map(({ tier, band }, i) => {
                // The player's tier is the name the server sent, found here by that name.
                const mine = rating != null && rating.tier === tier;
                return (
                  <li key={tier} className={mine ? 'you' : undefined}>
                    {i === 0 && <Icon name="crown" />}
                    <b>{tier}</b>
                    {mine && <span className="pill blue">You · {whole(rating.value)}</span>}
                    <small>{band}</small>
                  </li>
                );
              })}
          </ol>
        </section>
      </main>
    </Page>
  );
}

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
