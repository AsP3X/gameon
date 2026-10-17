/* Games: the library. The two live games are the page, each with its own Play, and above them the
   way back into a game that is still open. On a wide window the public tables that have room and
   the player's seat sit under the games, and what is coming under those. On a phone the games
   scroll above a bar whose two buttons open the tables and the player's seat as sheets.

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
import { CardFan, OchoFan } from './art';
import { showsOcho, showsSkullKing, soonOn } from './catalog';
import type { Shelf } from './catalog';
import { FootLinks, Footer, Link, Nav, useTitle, useWide } from './Frame';
import type { Who } from './Frame';
import { Icon } from './icons';
import { DOORS, Shelves } from './Landing';
import { savedGame, savedTitle } from './saved';
import type { SavedGame } from './saved';

/** How many open tables the page shows. The rest are behind "All public tables". */
const TABLES_SHOWN = 6;

/**
 * The open tables the page shows, in the server's order: the first of each length of game, so that
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

/** The live games the shelf shows, one row each: its art, its name and line, how to play it, and Play. */
function LiveGames({ shelf }: { shelf: Shelf }) {
  const live = DOORS.filter((door) => (door.to === AT.ocho ? showsOcho(shelf) : showsSkullKing(shelf)));
  if (live.length === 0) return <p className="go-start-none">No live game on this shelf yet. These are on the way.</p>;
  return (
    <ul className="go-lib-games">
      {live.map((door) => {
        const ocho = door.to === AT.ocho,
          name = ocho ? 'go-ocho-title' : 'go-sk-title';
        return (
          <li key={door.id} className="go-lib-game" aria-labelledby={name}>
            <span className={ocho ? 'go-lib-art ocho' : 'go-lib-art sk'}>{ocho ? <OchoFan /> : <CardFan trio />}</span>
            <div className="go-lib-text">
              {ocho ? (
                <h2 id={name}>{door.name}</h2>
              ) : (
                <h2 id={name} className="logo">
                  {door.logo}
                </h2>
              )}
              <p>{door.line}</p>
              <Link
                to={ocho ? AT.ochoRules : AT.howToPlay}
                className="go-text-link wide-only"
                label={ocho ? 'How to play Ocho' : undefined}
              >
                How to play
              </Link>
            </div>
            <Link to={door.to} className="btn go-btn go-lib-play">
              Play {door.name}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** The way back into a game that is not over: what it is, how far it got, and Continue. */
function Jump({ resume }: { resume: Resume }) {
  return (
    <section className="go-jump" aria-labelledby="go-jump-title">
      <div className="go-jump-text">
        <h2 id="go-jump-title">
          <span className="go-sr">Jump back in: </span>Skull King
        </h2>
        <b>{resume.mode}</b>
        <span>{resume.line}</span>
      </div>
      <Link to={resume.to} className="btn go-btn">
        Continue
      </Link>
    </section>
  );
}

/**
 * The public tables with room, as a list. On the page each row is what the table plays and its name;
 * in the phone's sheet, which is narrower, each row has its host too.
 */
function OpenTables({
  tables,
  onJoin,
  onAgain,
  hosts,
}: {
  tables: Tables;
  onJoin: (id: LobbyId) => void;
  onAgain: () => void;
  hosts: boolean;
}) {
  const ids = useId();
  return (
    <section className={hosts ? 'go-tables' : 'go-tables go-lib-tables'} aria-labelledby={`${ids}-title`}>
      <div className={hosts ? 'go-tables-head go-sr' : 'go-tables-head'}>
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
                  {hosts && (
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
        <span className="go-coming-sep"> · </span>
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

type SheetName = 'tables' | 'you';

/**
 * A sheet on a phone: a native modal dialog over the page. Escape, the close button and a tap on
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
  };
  const me = who.is === 'player' ? who.me : null,
    session = me != null,
    resume = resumeOf(me, seated, saved),
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
  const seat = me ? (
    <YourSeat me={me} season={season} />
  ) : (
    <Link to={AT.signIn} className="btn ghost go-btn full">
      Sign in
    </Link>
  );

  return (
    <>
      <Nav page="games" who={who} />
      <main className="go-games go-wide">
        <div className="go-in go-lib">
          {who.is === 'unknown' && (
            <p className="go-banner" role="status">
              <Icon name="wifiOff" />
              Not connected. Trying again…
            </p>
          )}
          <div className="go-lib-head">
            <h1 tabIndex={-1} ref={title}>
              Games
            </h1>
            <Shelves shelf={shelf} onPick={setShelf} />
          </div>
          {resume && <Jump resume={resume} />}
          <LiveGames shelf={shelf} />
          <div className="go-lib-cols wide-only">
            {tablesHere && <OpenTables tables={tables} onJoin={onJoin} onAgain={again} hosts={false} />}
            <section className="go-lib-seat" aria-labelledby="go-seat-title">
              <h2 id="go-seat-title">Your seat</h2>
              {seat}
            </section>
          </div>
          <Coming shelf={shelf} />
        </div>
      </main>
      <Footer page="games" who={who} />
      <div className="go-lib-bar narrow-only">
        <button type="button" className="go-bar-btn" ref={openers.tables} onClick={() => setSheet('tables')}>
          <Icon name="grid" />
          Tables
        </button>
        <button type="button" className="go-bar-btn" ref={openers.you} onClick={() => setSheet('you')}>
          <Icon name="users" />
          You
        </button>
      </div>

      {open === 'tables' && (
        <Sheet title="Open tables" onClose={closeSheet}>
          {tablesHere ? (
            <OpenTables tables={tables} onJoin={onJoin} onAgain={again} hosts />
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
          {seat}
          <nav className="go-sheet-links" aria-label="More of GameOn">
            <FootLinks page="games" />
          </nav>
        </Sheet>
      )}
    </>
  );
}
