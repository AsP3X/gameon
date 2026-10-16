/* Games: one felt floor. The table in the middle of it is the way back into a game that is still
   open, or the two live games to start. Beside it are the public tables that have room, and along
   its bottom edge the player and the two ways to play. On a phone it is one screen: the table, and
   a bar whose three buttons open the tables, the player's seat and Play as sheets.

   A player who comes here is on their way in, so a browser without a session gets a guest here, as
   it does when it connects. Everything about the player and the tables is what the server said
   (`Me`, `GET /lobbies`). The game saved on this device is read from where the renderer keeps it.
   Sitting down at a table is not done here: the online screens do it. */
import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import type { Online } from '../net/online';
import type { Format, LobbyId, LobbySummary, Me, Season } from '../protocol/generated';
import { initialOf } from '../online/parts';
import { describeRow } from '../online/settings';
import { AT } from '../router/addresses';
import { cssColor, whole } from '../tableview/dom';
import { CardFan, OchoFan, OchoKey, SkullKingKey, TableCards } from './art';
import { showsOcho, showsSkullKing, soonOn } from './catalog';
import type { Shelf } from './catalog';
import { accountOf, FootLinks, Footer, Link, Nav, useTitle, useWide } from './Frame';
import type { Who } from './Frame';
import { Icon } from './icons';
import { DOORS, Shelves } from './Landing';
import { savedGame, savedTitle } from './saved';
import type { SavedGame } from './saved';

/** How many open tables the floor shows. The rest are behind "All public tables". */
const TABLES_SHOWN = 6;

/**
 * The open tables the floor shows, in the server's order: the first of each length of game, so that
 * none of the five is missing while it has a table with room, and then the others for as long as
 * there are places left. The length is the row's own (`settings.format`), not its place in the list.
 */
function shown(open: LobbySummary[]): LobbySummary[] {
  const first = new Map<Format, LobbySummary>();
  for (const lobby of open) if (!first.has(lobby.settings.format)) first.set(lobby.settings.format, lobby);
  let rest = TABLES_SHOWN - first.size;
  return open.filter((lobby) => first.get(lobby.settings.format) === lobby || rest-- > 0);
}

type Tables = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; open: LobbySummary[] };

/** A game that is not over: what it is, how far it got, and where it goes on. */
interface Resume {
  mode: string;
  line: string;
  to: string;
}

/** The way back into a game that is not over: a seat the server keeps, or the game saved on this device. */
function resumeOf(me: Me | null, seated: boolean, saved: SavedGame | null): Resume | null {
  const active = me?.active ?? null,
    running = active?.kind === 'game',
    waiting = !running && (seated || active?.kind === 'lobby');
  if (running || waiting)
    return {
      mode: 'your table',
      line: running ? 'Game running · your seat is kept' : 'Waiting to start · your seat is kept',
      to: AT.online,
    };
  if (saved)
    return {
      mode: savedTitle(saved),
      line: `Round ${saved.round} of ${saved.rounds} · saved on this device`,
      to: AT.table,
    };
  return null;
}

/**
 * The table in the middle of the floor. With a game to go back to, it is that game, with a few of
 * its cards on the cloth. Without one, it offers the live games the shelf shows. Four seats are
 * marked round it. The near one is the player's, and says so when they have an account.
 */
function FeltTable({ resume, you, shelf }: { resume: Resume | null; you: boolean; shelf: Shelf }) {
  const live = DOORS.filter((door) => (door.to === AT.ocho ? showsOcho(shelf) : showsSkullKing(shelf)));
  return (
    <section className={resume ? 'go-felt-table go-jump' : 'go-felt-table'} aria-labelledby="go-felt-title">
      {resume && <TableCards />}
      <span className="go-seat-mark top" aria-hidden="true"></span>
      <span className="go-seat-mark left" aria-hidden="true"></span>
      <span className="go-seat-mark right" aria-hidden="true"></span>
      <span className="go-seat-mark you" aria-hidden="true">
        <span></span>
        {you && <small>You</small>}
      </span>
      {resume ? (
        <div className="go-jump-text">
          <h2 id="go-felt-title">
            <span className="go-sr">Jump back in: </span>Skull King
          </h2>
          <b>{resume.mode}</b>
          <span>{resume.line}</span>
          <Link to={resume.to} className="btn go-btn">
            Continue
          </Link>
        </div>
      ) : (
        <div className="go-start">
          <h2 id="go-felt-title" className="go-sr">
            Start a game
          </h2>
          {live.length === 0 ? (
            <p className="go-start-none">No live game on this shelf yet. These are on the way.</p>
          ) : (
            <ul>
              {live.map((door) => {
                const ocho = door.to === AT.ocho,
                  name = ocho ? 'go-ocho-title' : 'go-sk-title';
                return (
                  <li key={door.id} className="go-start-game" aria-labelledby={name}>
                    <span className="go-start-art">{ocho ? <OchoFan /> : <CardFan trio />}</span>
                    <span className="go-start-name">
                      {ocho ? <OchoKey /> : <SkullKingKey />}
                      <b id={name}>{door.name}</b>
                    </span>
                    <p>{door.line}</p>
                    <Link to={door.to} className="btn go-btn" label={`Play ${door.name}`}>
                      Play
                    </Link>
                    <Link
                      to={ocho ? AT.ochoRules : AT.howToPlay}
                      className="go-text-link"
                      label={ocho ? 'How to play Ocho' : undefined}
                    >
                      How to play
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/** The seat marks of a table: one for each place, filled for the ones taken. */
function Seats({ lobby }: { lobby: LobbySummary }) {
  return (
    <span className="go-tile-seats" aria-hidden="true">
      {Array.from({ length: lobby.settings.maxPlayers }, (_, seat) => (
        <span key={seat} className={seat < lobby.players ? 'on' : undefined}></span>
      ))}
    </span>
  );
}

/**
 * The public tables with room. On the floor they are small tables of their own. In the phone's sheet
 * they are a list, each row with its host.
 */
function OpenTables({
  tables,
  onJoin,
  onAgain,
  tiles,
}: {
  tables: Tables;
  onJoin: (id: LobbyId) => void;
  onAgain: () => void;
  tiles: boolean;
}) {
  const ids = useId();
  return (
    <section className={tiles ? 'go-tables go-tiles' : 'go-tables'} aria-labelledby={`${ids}-title`}>
      <div className={tiles ? 'go-tables-head' : 'go-tables-head go-sr'}>
        <h2 id={`${ids}-title`}>Open tables · Skull King</h2>
        {tables.state === 'ready' && <span className="pill green">{tables.open.length}</span>}
      </div>
      {tables.state === 'loading' ? (
        <div className="go-tables-wait" role="status" aria-label="Looking for open tables">
          <span></span>
          <span></span>
        </div>
      ) : tables.state === 'failed' ? (
        <div className="go-tables-note">
          <p className="alert" role="alert">
            The tables could not be loaded.
          </p>
          <button type="button" className="btn ghost go-btn full" onClick={onAgain}>
            Try again
          </button>
        </div>
      ) : tables.open.length === 0 ? (
        <div className="go-tables-note">
          <p>No open tables right now. Open one and others can sit down.</p>
          <Link to={AT.newPublicTable} className="btn ghost go-btn full">
            Create a table
          </Link>
        </div>
      ) : (
        <>
          <ul>
            {shown(tables.open).map((lobby, i) => {
              const row = describeRow(lobby),
                format = `${ids}-format-${i}`,
                title = `${ids}-table-${i}`;
              return (
                <li key={lobby.id}>
                  {tiles ? (
                    <Seats lobby={lobby} />
                  ) : (
                    // The host's colour when the server sent one. No other is put in its place.
                    <span
                      className={lobby.hostColor ? 'avatar' : 'avatar plain'}
                      style={lobby.hostColor ? { background: cssColor(lobby.hostColor) } : undefined}
                      aria-hidden="true"
                    >
                      {initialOf(lobby.hostName)}
                    </span>
                  )}
                  <span className="go-table-text">
                    <span className="pill format" id={format}>
                      {row.format}
                    </span>
                    {/* A row without its host's colour has no host: the server's name for it is the whole title. */}
                    <b id={title}>{row.title}</b>
                  </span>
                  <button
                    type="button"
                    className="btn ghost go-btn small"
                    aria-describedby={`${format} ${title}`}
                    onClick={() => onJoin(lobby.id)}
                  >
                    Join
                  </button>
                  <span className="go-table-more">
                    <small>{row.rounds}</small>
                    <small>{row.seats}</small>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="go-tables-foot">
            <Link to={AT.publicTables} className="go-text-link">
              All public tables
              <Icon name="chevronRight" />
            </Link>
            <Link to={AT.join} className="go-text-link">
              Join with a code
            </Link>
          </p>
        </>
      )}
    </section>
  );
}

/** The player's own seat: who they are here, and where they stand in ranked. */
function YourSeat({ me, season }: { me: Me; season: Season | null | undefined }) {
  const rating = me.rating;
  return (
    <section className="go-seat" aria-label="Your seat">
      <div className="go-seat-who">
        <span className="avatar" style={{ background: cssColor(me.user.color) }} aria-hidden="true">
          {initialOf(me.user.name)}
        </span>
        <span>
          <b>{me.user.name}</b>
          <small>{me.guest ? 'Playing as a guest' : me.username}</small>
        </span>
      </div>
      {me.guest ? (
        <>
          <p>Ranked needs an account. Your name, colour and stats stay with you.</p>
          <Link to={AT.signUp} className="btn blue go-btn full">
            Create an account
          </Link>
        </>
      ) : (
        <>
          {rating ? (
            <>
              <p className="go-seat-label">
                <span>Skull King · Ranked</span>
                {season && <span className="pill gold">{season.name}</span>}
              </p>
              <dl className="go-seat-stats">
                <div>
                  <dt>Rating</dt>
                  <dd>{whole(rating.value)}</dd>
                </div>
                <div>
                  <dt>Tier</dt>
                  <dd className="word">{rating.tier}</dd>
                </div>
                <div>
                  <dt>Games</dt>
                  <dd>{rating.games}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p>No rating yet. Five placement games set your tier.</p>
          )}
          <Link to={AT.ranked} className="btn blue go-btn full">
            Find a ranked game
          </Link>
        </>
      )}
    </section>
  );
}

/** The announced games the shelf shows, on one line, and the way to say which one is missing. */
function Coming({ shelf }: { shelf: Shelf }) {
  return (
    <p className="go-coming">
      <span>
        <b id="go-soon-title">Coming soon</b>
        {' · '}
        <span className="go-coming-names">
          {soonOn(shelf)
            .map((game) => game.name)
            .join(', ')}
        </span>
      </span>
      <Link to={AT.suggest} className="go-text-link">
        Suggest a game
      </Link>
    </p>
  );
}

type SheetName = 'tables' | 'you' | 'play';

/**
 * A sheet on a phone: a native modal dialog over the floor. Escape, the close button and a tap on
 * the scrim close it, and the button that opened it has the keyboard again.
 */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    // Opened once. React's second mount in development finds it open already.
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);
  const close = (): void => dialog.current?.close();
  return (
    <dialog
      ref={dialog}
      className="go-sheet"
      aria-labelledby={titleId}
      onClose={onClose}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        // The dialog itself is the scrim: the sheet is a child of it.
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="go-sheet-panel">
        <div className="go-sheet-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="go-sheet-close" aria-label="Close" onClick={close}>
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

/** The player along the bottom edge of the floor: name, tier and rating. A guest has the way to sign in. */
function BarPlayer({ account }: { account: Me | null }) {
  if (!account)
    return (
      <Link to={AT.signIn} className="btn ghost go-btn go-bar-sign">
        Sign in
      </Link>
    );
  const rating = account.rating;
  return (
    <div className="go-bar-player">
      <span className="avatar" style={{ background: cssColor(account.user.color) }} aria-hidden="true">
        {initialOf(account.user.name)}
      </span>
      <span className="go-bar-name">
        <b>{account.user.name}</b>
        <small>{rating?.tier ?? account.username}</small>
      </span>
      {rating && (
        <span className="go-bar-rating">
          <b>{whole(rating.value)}</b>
          <small>rating</small>
        </span>
      )}
    </div>
  );
}

export interface GamesProps {
  online: Online;
  who: Who;
  /** The player sits in a lobby on the connection this page still has. */
  seated: boolean;
  season: Season | null | undefined;
  /** Sit down at one of the open tables. */
  onJoin: (id: LobbyId) => void;
}

export function Games({ online, who, seated, season, onJoin }: GamesProps) {
  const title = useTitle('GameOn · Games');
  const wide = useWide();
  const [shelf, setShelf] = useState<Shelf>('all');
  const [tables, setTables] = useState<Tables>({ state: 'loading' });
  const [round, setRound] = useState(0);
  const [saved] = useState(savedGame);
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const openers: Record<SheetName, RefObject<HTMLButtonElement | null>> = {
    tables: useRef<HTMLButtonElement>(null),
    you: useRef<HTMLButtonElement>(null),
    play: useRef<HTMLButtonElement>(null),
  };
  const me = who.is === 'player' ? who.me : null,
    account = accountOf(who),
    session = me != null,
    resume = resumeOf(me, seated, saved),
    live = DOORS.filter((door) => (door.to === AT.ocho ? showsOcho(shelf) : showsSkullKing(shelf))),
    // The sheets are a phone's: a window that grows wide closes the one that is open.
    open = wide ? null : sheet;

  // The list needs a session, and is read once: nothing pushes changes to it.
  useEffect(() => {
    if (!session) return;
    let stale = false;
    void online.publicLobbies().then((r) => {
      if (stale) return;
      setTables(
        r.ok
          ? { state: 'ready', open: r.value.filter((lobby) => lobby.players < lobby.settings.maxPlayers) }
          : { state: 'failed' },
      );
    });
    return () => {
      stale = true;
    };
  }, [online, session, round]);

  const again = (): void => {
    setTables({ state: 'loading' });
    setRound((n) => n + 1);
  };
  const closeSheet = (): void => {
    const was = sheet;
    setSheet(null);
    if (was) openers[was].current?.focus();
  };
  const tablesHere = who.is !== 'unknown';

  return (
    <>
      <Nav page="games" who={who} />
      <main className="go-games go-wide">
        <h1 className="go-sr" tabIndex={-1} ref={title}>
          Games
        </h1>
        <div className="go-floor">
          {who.is === 'unknown' && (
            <p className="go-banner" role="status">
              <Icon name="wifiOff" />
              Not connected. Trying again…
            </p>
          )}
          <div className="go-floor-play">
            <FeltTable resume={resume} you={account != null} shelf={shelf} />
          </div>
          <div className="go-floor-side wide-only">
            <Shelves shelf={shelf} onPick={setShelf} />
            {tablesHere && <OpenTables tables={tables} onJoin={onJoin} onAgain={again} tiles />}
          </div>
          <div className="go-floor-bar">
            <div className="wide-only go-bar-wide">
              <BarPlayer account={account} />
              <span className="go-bar-play">
                {live.map((door) => (
                  <Link key={door.id} to={door.to} className="btn go-btn">
                    Play {door.name}
                  </Link>
                ))}
              </span>
            </div>
            <div className="narrow-only go-bar-narrow">
              <button type="button" className="go-bar-btn" ref={openers.tables} onClick={() => setSheet('tables')}>
                <Icon name="grid" />
                Tables
              </button>
              <button type="button" className="go-bar-btn" ref={openers.you} onClick={() => setSheet('you')}>
                <Icon name="users" />
                You
              </button>
              <button
                type="button"
                className="btn go-btn go-bar-btn"
                ref={openers.play}
                onClick={() => setSheet('play')}
              >
                Play
              </button>
            </div>
          </div>
        </div>
        <div className="go-in wide-only">
          <Coming shelf={shelf} />
        </div>
      </main>
      <Footer page="games" who={who} />

      {open === 'tables' && (
        <Sheet title="Open tables" onClose={closeSheet}>
          <Shelves shelf={shelf} onPick={setShelf} />
          {tablesHere ? (
            <OpenTables tables={tables} onJoin={onJoin} onAgain={again} tiles={false} />
          ) : (
            <p className="go-banner">
              <Icon name="wifiOff" />
              Not connected. Trying again…
            </p>
          )}
        </Sheet>
      )}
      {open === 'you' && (
        <Sheet title="You" onClose={closeSheet}>
          {me ? (
            <YourSeat me={me} season={season} />
          ) : (
            <Link to={AT.signIn} className="btn ghost go-btn full">
              Sign in
            </Link>
          )}
          <Coming shelf={shelf} />
          <nav className="go-sheet-links" aria-label="More of GameOn">
            <FootLinks page="games" />
          </nav>
        </Sheet>
      )}
      {open === 'play' && (
        <Sheet title="Play" onClose={closeSheet}>
          {live.length === 0 && <p className="go-sub">No live game on this shelf yet.</p>}
          <ul className="go-sheet-play">
            {live.map((door) => (
              <li key={door.id}>
                <Link to={door.to} className="btn go-btn full">
                  Play {door.name}
                </Link>
                <p>{door.line}</p>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </>
  );
}
