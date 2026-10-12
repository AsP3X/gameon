/* The profile (plan item W5), as design/gameon.pen draws it (`Profile · desktop`, `Profile · phone`,
   `Profile · states`): who the player is, their quarter, the five lines, the best score, the games
   they finished, and the account. And another player's page, which has the name, the colour, the
   tier and the five lines, and nothing that is only the player's own.

   Both are pages of the frame: they need no connection, and they make no guest. A browser without a
   session can read neither (`GET /me` and `GET /users/{id}` both ask for one) and is led to sign in.
   Everything shown is
   what the server said (`GET /me`, `GET /config`, `GET /me/games`, `GET /users/{id}`). Nothing here
   works a rating, a tier, a place or a total out. A reply without `stats.byMode` is read as five
   empty lines, and the headline numbers are never put on one of them. A server that has no list of
   games (`NOT_FOUND`) is a player with no finished games, not a page that failed. */
import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { ApiResult } from '../net/api';
import type { Online } from '../net/online';
import { TABLE_COLORS } from '../online/colors';
import { failureText, NAME_MAX, ordinal } from '../online/copy';
import { initialOf } from '../online/parts';
import type {
  FinishedGame,
  Me,
  ModeLine,
  Profile,
  ProfilePatch,
  Season,
  Stats,
  TableKind,
  User,
  UserId,
} from '../protocol/generated';
import { AT } from '../router/addresses';
import { Sound } from '../sound/sound';
import { cssColor, whole } from '../tableview/dom';
import { Footer, Link, Nav, useTitle } from './Frame';
import type { Go, Who } from './Frame';
import { Icon } from './icons';

/** How long a page waits before it asks again a server that did not answer. */
export const RETRY_MS = 5000;
/** The rows "Your games" asks for at a time: what a phone shows, and what a wide window shows. */
export const GAMES_NARROW = 5;
export const GAMES_WIDE = 8;

/** The five lines, in the order the page has them, and what each table is called. */
const TABLES: readonly (readonly [TableKind, string])[] = [
  ['solo', 'Solo'],
  ['friends', 'Friends'],
  ['public', 'Public'],
  ['casual', 'Casual'],
  ['ranked', 'Ranked'],
];
const tableName = (kind: TableKind): string => TABLES.find(([k]) => k === kind)?.[1] ?? kind;
/** A line the server did not send: nothing was counted on it. */
const NO_LINE: ModeLine = { games: 0, wins: 0, bidsMade: 0, bidsTotal: 0, bestScore: null };
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const wide = (): boolean => typeof matchMedia === 'function' && matchMedia('(min-width: 1000px)').matches;

/** Who the page is about: the colour, the name, and under it what the server says of them. */
function Identity(props: {
  title: RefObject<HTMLHeadingElement | null>;
  user: User;
  /** The username, or the word for a player without one. Another player has neither. */
  handle?: string;
  tier: string | null;
}) {
  const { user } = props;
  return (
    <header className="go-who">
      <span className="avatar go-who-avatar" style={{ background: cssColor(user.color) }} aria-hidden="true">
        {initialOf(user.name)}
      </span>
      <div className="go-who-text">
        <h1 tabIndex={-1} ref={props.title}>
          {user.name}
        </h1>
        {(props.handle != null || props.tier != null) && (
          <p>
            {props.handle != null && <span>{props.handle}</span>}
            {props.tier != null && <span className="pill gold">{props.tier}</span>}
          </p>
        )}
      </div>
    </header>
  );
}

/** Games, wins and bids hit at each of the five tables. A line the server left out is empty. */
function FiveLines({ stats }: { stats: Stats }) {
  return (
    <section className="go-card go-lines" aria-label="Games by table">
      <table>
        <thead>
          <tr>
            <th scope="col">
              <span className="go-sr">Table</span>
            </th>
            <th scope="col">Games</th>
            <th scope="col">Wins</th>
            <th scope="col">Bids hit</th>
          </tr>
        </thead>
        <tbody>
          {TABLES.map(([kind, name]) => {
            const line = stats.byMode?.[kind] ?? NO_LINE;
            return (
              <tr key={kind}>
                <th scope="row">{name}</th>
                <td>{line.games}</td>
                <td>{line.wins}</td>
                <td>
                  {line.bidsMade} of {line.bidsTotal}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/** The player's ranked quarter: the season, and the rating when they have one. */
function Quarter({ me, season }: { me: Me; season: Season | null | undefined }) {
  const rating = me.guest ? null : me.rating;
  return (
    <section className="go-card go-quarter" aria-labelledby="go-quarter-title">
      <div className="go-quarter-head">
        <h2 id="go-quarter-title">This quarter</h2>
        {season && <span className="pill gold">{season.name}</span>}
        {rating?.provisional && <span className="pill blue">Provisional</span>}
      </div>
      {me.guest ? (
        <>
          <p>Ranked needs a free account.</p>
          <Link to={AT.signUp} className="btn blue go-btn full">
            Create an account
          </Link>
        </>
      ) : (
        <>
          {rating ? (
            <dl className="go-quarter-tiles">
              <div>
                <dt>Rating</dt>
                <dd>{whole(rating.value)}</dd>
              </div>
              <div>
                <dt>Ranked games</dt>
                <dd>{rating.games}</dd>
              </div>
            </dl>
          ) : (
            <p>Play a ranked game to be rated.</p>
          )}
          <Link to={AT.ladder} className="go-text-link go-quarter-ladder">
            See the ladder
            <Icon name="chevronRight" />
          </Link>
        </>
      )}
    </section>
  );
}

/** The headline best score. A ranked game is not in it. */
function BestScore({ stats }: { stats: Stats }) {
  return (
    <section className="go-card go-best" aria-labelledby="go-best-title">
      <div>
        <h2 id="go-best-title">Best score</h2>
        <p>Solo, Friends, Public and Casual</p>
      </div>
      <b>{stats.bestScore == null ? '–' : whole(stats.bestScore)}</b>
    </section>
  );
}

type Games =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; games: FinishedGame[]; next: string | null };

/** The games the player finished, newest first, a page at a time. */
function YourGames({ online, me }: { online: Online; me: UserId }) {
  // A phone lists five at a time and a wide window eight. The page keeps the size it opened with.
  const [limit] = useState(() => (wide() ? GAMES_WIDE : GAMES_NARROW));
  const [list, setList] = useState<Games>({ state: 'loading' });
  const [more, setMore] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [round, setRound] = useState(0);

  useEffect(() => {
    let stale = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    void online.games(limit).then((r) => {
      if (stale) return;
      if (r.ok) return setList({ state: 'ready', games: r.value.games, next: r.value.next ?? null });
      // A server that keeps no list has nothing to list. That is no failure of the page.
      if (r.code === 'NOT_FOUND') return setList({ state: 'ready', games: [], next: null });
      setList({ state: 'failed' });
      timer = setTimeout(() => setRound((n) => n + 1), RETRY_MS);
    });
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [online, limit, round]);

  const loadMore = (): void => {
    if (list.state !== 'ready' || list.next == null || more === 'loading') return;
    Sound.play('tap');
    setMore('loading');
    const from = list;
    void online.games(limit, list.next).then((r) => {
      if (!r.ok) return setMore('failed');
      setMore('idle');
      // The page belongs behind the rows it was asked after: if the list was read again meanwhile, it is dropped.
      setList((now) =>
        now === from ? { ...from, games: [...from.games, ...r.value.games], next: r.value.next ?? null } : now,
      );
    });
  };

  return (
    <section className="go-card go-played" aria-labelledby="go-played-title">
      <h2 id="go-played-title">Your games</h2>
      {list.state === 'loading' ? (
        <p className="go-played-note" role="status">
          Loading your games…
        </p>
      ) : list.state === 'failed' ? (
        <div className="go-played-note">
          <p className="alert" role="alert">
            Your games could not be loaded.
          </p>
          <button
            type="button"
            className="go-text-link"
            onClick={() => {
              Sound.play('tap');
              setList({ state: 'loading' });
              setRound((n) => n + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : list.games.length === 0 ? (
        <p className="go-played-note">No finished games yet.</p>
      ) : (
        <>
          <ol>
            {list.games.map((game) => {
              // The caller's own seat line. The place and the score on it are the server's.
              const seat = game.seats.find((s) => s.userId === me);
              return (
                <li key={game.id}>
                  <span className="go-played-what">
                    <b>{tableName(game.table)}</b>
                    <small>{DAY.format(game.endedAt)}</small>
                  </span>
                  {seat && <span className={seat.place === 1 ? 'pill gold' : 'pill soft'}>{ordinal(seat.place)}</span>}
                  <b className="go-played-score">{seat ? whole(seat.score) : '–'}</b>
                </li>
              );
            })}
          </ol>
          {list.next != null && (
            <div className="go-more">
              {more === 'failed' && (
                <p className="alert" role="alert">
                  The next games could not be loaded.
                </p>
              )}
              <button type="button" className="go-text-link" disabled={more === 'loading'} onClick={loadMore}>
                {more === 'failed' ? 'Try again' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

type Note = { tone: 'error' | 'ok'; text: string };

/** The name and the colour others see, and the way out of the account. */
function Account({ online, me, onSignedOut }: { online: Online; me: Me; onSignedOut: () => void }) {
  const [name, setName] = useState(me.user.name);
  const [color, setColor] = useState(me.user.color);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const trimmed = name.trim(),
    valid = trimmed.length >= 1 && Array.from(trimmed).length <= NAME_MAX,
    dirty = trimmed !== me.user.name || color !== me.user.color;

  const save = (): void => {
    Sound.play('confirm');
    setBusy(true);
    setNote(null);
    // Only what changed is sent: an omitted field stays as it is.
    const patch: ProfilePatch = {};
    if (trimmed !== me.user.name) patch.name = trimmed;
    if (color !== me.user.color) patch.color = color;
    void online.saveProfile(patch).then((r) => {
      setBusy(false);
      if (r.ok) {
        setName(trimmed);
        setNote({ tone: 'ok', text: 'Saved.' });
      } else
        setNote({
          tone: 'error',
          text: r.code === 'VALIDATION' ? "That name can't be used. Use 1 to 16 characters." : failureText(r),
        });
    });
  };
  const signOut = (): void => {
    Sound.play('tap');
    setBusy(true);
    setNote(null);
    void online.logout().then((r) => {
      if (r.ok) return onSignedOut();
      setBusy(false);
      setNote({ tone: 'error', text: failureText(r) });
    });
  };

  return (
    <section className="go-card go-account-card" aria-labelledby="go-account-title">
      <h2 id="go-account-title">Account</h2>
      <div className="go-account-fields">
        <div className="go-field">
          <label htmlFor="go-display-name">Display name</label>
          <input
            id="go-display-name"
            value={name}
            maxLength={NAME_MAX}
            autoComplete="nickname"
            spellCheck={false}
            aria-invalid={note?.tone === 'error'}
            aria-describedby="go-display-name-help"
            onChange={(e) => {
              setNote(null);
              setName(e.target.value);
            }}
          />
          {note?.tone === 'error' ? (
            <p id="go-display-name-help" className="alert" role="alert">
              {note.text}
            </p>
          ) : (
            <p id="go-display-name-help">1 to 16 characters. This is the name others see at the table.</p>
          )}
        </div>
        <div className="go-field">
          <span className="go-field-label" id="go-colour-label">
            Colour
          </span>
          <div className="swatches" role="radiogroup" aria-labelledby="go-colour-label">
            {TABLE_COLORS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                className="swatch"
                aria-checked={color === value}
                aria-label={label}
                onClick={() => {
                  Sound.play('select');
                  setNote(null);
                  setColor(value);
                }}
              >
                <i style={{ background: cssColor(value) }}></i>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="go-account-actions">
        <button type="button" className="btn go-btn" disabled={busy || !dirty || !valid} onClick={save}>
          Save
        </button>
        {!me.guest && (
          <button type="button" className="btn ghost go-btn" disabled={busy} onClick={signOut}>
            Sign out
          </button>
        )}
        {note?.tone === 'ok' && (
          <p className="go-account-note" role="status">
            {note.text}
          </p>
        )}
      </div>
    </section>
  );
}

/** The page while the server has not said who is asked about. */
function Loading({ label }: { label: string }) {
  return (
    <div className="go-skeleton" role="status" aria-label={label}>
      <div className="go-skeleton-who">
        <i></i>
        <span>
          <i></i>
          <i></i>
        </span>
      </div>
      <div className="go-card">
        {[0, 1, 2, 3].map((row) => (
          <div key={row}>
            <span>
              <i></i>
              {row > 0 && <i></i>}
            </span>
            {row > 0 && <i></i>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The server did not answer. The page asks again by itself; the button asks now. */
function Failed({ onAgain }: { onAgain: () => void }) {
  return (
    <div className="go-card go-failed">
      <p className="alert" role="alert">
        The profile could not be loaded.
      </p>
      <button
        type="button"
        className="btn ghost go-btn full"
        onClick={() => {
          Sound.play('tap');
          onAgain();
        }}
      >
        Try again
      </button>
    </div>
  );
}

export interface ProfilePageProps {
  online: Online;
  who: Who;
  /** The live season, null when the server has none, undefined until it has said. */
  season: Season | null | undefined;
  go: Go;
}

/** `/profile`: the player's own page. A browser without a session has none, and is led to sign in. */
export function ProfilePage({ online, who, season, go }: ProfilePageProps) {
  const title = useTitle('GameOn · Your profile');
  const visitor = who.is === 'visitor';
  useEffect(() => {
    if (visitor) go(AT.signIn, { replace: true });
  }, [visitor, go]);

  const me = who.is === 'player' ? who.me : null;
  return (
    <>
      <Nav page="profile" who={who} />
      <main className="go-profile">
        <div className="go-in">
          {me ? (
            <>
              <Identity
                title={title}
                user={me.user}
                handle={me.username ?? 'Guest'}
                tier={me.guest ? null : (me.rating?.tier ?? null)}
              />
              {/* A phone reads them in this order. A wide window has the games in a rail at the right. */}
              <div className="go-profile-cols">
                <div className="go-profile-main">
                  <Quarter me={me} season={season} />
                  <FiveLines stats={me.stats} />
                  <BestScore stats={me.stats} />
                </div>
                <div className="go-profile-rail">
                  {/* Another player after signing in: the list and the form start from who they are. */}
                  <YourGames key={me.user.id} online={online} me={me.user.id} />
                </div>
                <div className="go-profile-more">
                  <Account
                    key={me.user.id}
                    online={online}
                    me={me}
                    // The session is over: the front page is where a visitor starts.
                    onSignedOut={() => go(AT.landing, { replace: true })}
                  />
                </div>
              </div>
            </>
          ) : who.is === 'unknown' ? (
            <>
              <h1 className="go-sr" tabIndex={-1} ref={title}>
                Your profile
              </h1>
              <Failed onAgain={() => void online.identify()} />
            </>
          ) : (
            <>
              <h1 className="go-sr" tabIndex={-1} ref={title}>
                Your profile
              </h1>
              <Loading label="Loading your profile" />
            </>
          )}
        </div>
      </main>
      <Footer page="profile" who={who} />
    </>
  );
}

type Loaded = { id: UserId; result: ApiResult<Profile> };

export interface PlayerPageProps {
  online: Online;
  who: Who;
  id: UserId;
  go: Go;
  /** Back to the page this one was reached from. */
  onBack: () => void;
}

/** `/players/{id}`: another player, read from the server and never put together from what a table showed. */
export function PlayerPage({ online, who, id, go, onBack }: PlayerPageProps) {
  const title = useTitle('GameOn · Player');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [round, setRound] = useState(0);

  useEffect(() => {
    let stale = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    void online.profile(id).then((result) => {
      if (stale) return;
      setLoaded({ id, result });
      // A player the server does not have stays that way, and so does a browser it does not know.
      // A server that did not answer is asked again.
      if (!result.ok && result.code !== 'NOT_FOUND' && result.code !== 'UNAUTHENTICATED')
        timer = setTimeout(() => setRound((n) => n + 1), RETRY_MS);
    });
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [online, id, round]);
  // An answer for somebody else is not this player's.
  const result = loaded?.id === id ? loaded.result : null;
  // The server shows another player to nobody without a session: the way in is the sign-in page.
  const shut = result != null && !result.ok && result.code === 'UNAUTHENTICATED';
  useEffect(() => {
    if (shut) go(AT.signIn, { replace: true });
  }, [shut, go]);

  return (
    <>
      <Nav page="player" who={who} />
      <main className="go-profile">
        <div className="go-in">
          <button
            type="button"
            className="go-text-link go-back"
            onClick={() => {
              Sound.play('back');
              onBack();
            }}
          >
            <Icon name="chevronLeft" />
            Back
          </button>
          {result?.ok ? (
            <>
              <Identity
                title={title}
                user={result.value.user}
                tier={result.value.rating?.tier ?? result.value.user.tier}
              />
              <div className="go-profile-cols">
                <div className="go-profile-main">
                  <FiveLines stats={result.value.stats} />
                </div>
              </div>
            </>
          ) : (
            <>
              <h1 className="go-sr" tabIndex={-1} ref={title}>
                Player
              </h1>
              {result && !shut ? (
                <Failed
                  onAgain={() => {
                    setLoaded(null);
                    setRound((n) => n + 1);
                  }}
                />
              ) : (
                <Loading label="Loading this player" />
              )}
            </>
          )}
        </div>
      </main>
      <Footer page="player" who={who} />
    </>
  );
}
