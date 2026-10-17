/* Games: the library. The two live games are the page, each with its own Play, and above them the
   way back into a game that is still open. On a wide window the way to the open games and the
   player's seat sit under the games, and what is coming under those. On a phone the games scroll
   above a bar whose two buttons open the open games and the player's seat.

   The open games are one dialog for both widths: Skull King's public tables and Ocho's, in one list,
   and the way to open a table of either. Nothing is listed on the page itself.

   A player who comes here is on their way in, so a browser without a session gets a guest here, as
   it does when it connects. Everything about the player and the tables is what the servers said
   (`Me`, `GET /lobbies`, `ocho.tables`). Ocho's socket is opened only when the dialog is. The game
   saved on this device is read from where the renderer keeps it. Sitting down at a Skull King table
   is not done here: the online screens do it. An Ocho table is sat down at by its lobby id, and
   Ocho's page takes it from there. */
import { useContext, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties, MouseEvent, ReactNode, RefObject } from 'react';
import type { Online } from '../net/online';
import type { OchoClient, OchoLink } from '../ocho/client';
import { ChoiceButton } from '../ocho/Ocho';
import type { OpenTable } from '../ocho/wire';
import type { LobbyId, LobbySummary, Me, Season } from '../protocol/generated';
import { initialOf } from '../online/parts';
import { describeRow } from '../online/settings';
import { AT } from '../router/addresses';
import { cssColor, whole } from '../tableview/dom';
import { CardFan, OchoFan } from './art';
import { showsOcho, showsSkullKing, soonOn } from './catalog';
import type { Shelf } from './catalog';
import { FootLinks, Footer, GoContext, Link, Nav, useTitle, useWide } from './Frame';
import type { Who } from './Frame';
import { Icon } from './icons';
import { DOORS, Shelves } from './Landing';
import { savedGame, savedTitle } from './saved';
import type { SavedGame } from './saved';

type Load = 'loading' | 'failed' | 'ready';
/** Skull King's public tables with a free seat, kept while they are read again. */
type SkTables = { state: Load; open: LobbySummary[] };
type Game = 'sk' | 'ocho';
const GAME_NAME: Record<Game, string> = { sk: 'Skull King', ocho: 'Ocho' };

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

/**
 * A dialog over the page: a native modal one. On a phone it is a sheet that rises from the bottom
 * edge; the open games are a panel in the middle of a wide window. Escape, the close button and a
 * click on the scrim close it, and the button that opened it has the keyboard again.
 */
function Sheet({
  title,
  onClose,
  children,
  className,
  first,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /** What has the keyboard when it opens. */
  first?: RefObject<HTMLElement | null>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    // Opened once. React's second mount in development finds it open already.
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
    first?.current?.focus();
  }, [first]);
  const close = (): void => dialog.current?.close();
  return (
    <dialog
      ref={dialog}
      className={className ? `go-sheet ${className}` : 'go-sheet'}
      aria-labelledby={titleId}
      onClose={onClose}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        // The dialog itself is the scrim: the panel is a child of it.
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

/** One open table of either game, as the dialog lists it. */
interface Row {
  key: string;
  game: Game;
  /** The name the search also finds the row by: its host's. */
  host: string;
  /** What the table plays: a Skull King length of game, or Ocho. */
  pill: string;
  title: string;
  /** The rounds or the kind of match, then the seats. */
  lines: [string, string];
  /** The host's colour, as the server sent it. Null when it sent none: no colour is made up. */
  color: string | null;
  join: () => void;
}

function skRow(lobby: LobbySummary, onJoin: (id: LobbyId) => void): Row {
  const row = describeRow(lobby);
  return {
    key: `sk-${lobby.id}`,
    game: 'sk',
    host: lobby.hostName,
    pill: row.format,
    // A row without its host's colour has no host: the server's name for it is the whole title.
    title: row.title,
    lines: [row.rounds, row.seats],
    color: lobby.hostColor ? cssColor(lobby.hostColor) : null,
    join: () => onJoin(lobby.id),
  };
}

function ochoRow(table: OpenTable, onJoin: (id: string) => void): Row {
  return {
    key: `ocho-${table.id}`,
    game: 'ocho',
    host: table.hostName,
    pill: 'Ocho',
    title: `${table.hostName}’s table`,
    lines: [
      `${table.teams ? 'Teams' : 'Free-for-all'} · ${table.match === 'to500' ? 'First to 500' : 'One hand'}`,
      `${table.seated} of ${table.players} seats`,
    ],
    // Ocho sends no colours.
    color: null,
    join: () => onJoin(table.id),
  };
}

/** Whether a row is one the search asks for: by its host, its game, or anything the row says. */
function matches(row: Row, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [row.host, GAME_NAME[row.game], row.pill, row.title, ...row.lines].some((text) =>
    text.toLowerCase().includes(q),
  );
}

type Filter = 'all' | Game;
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'sk', label: 'Skull King' },
  { value: 'ocho', label: 'Ocho' },
];

type Vars = CSSProperties & Record<`--${string}`, string | number>;

const FEWEST = 2;
const MOST = 8;
const STOPS = Array.from({ length: MOST - FEWEST + 1 }, (_, i) => FEWEST + i);

/**
 * How many sit at a new Ocho table: a range from two to eight, the number it is set to beside its
 * heading, and a button for every stop under the track. Teams holds it at four.
 */
function PlayerSlider({ value, locked, onChange }: { value: number; locked: boolean; onChange: (n: number) => void }) {
  const ids = useId();
  const share = (value - FEWEST) / (MOST - FEWEST);
  return (
    <div className="go-finder-field go-players">
      <div className="go-players-head">
        <h4 id={`${ids}-head`}>Players</h4>
        <output htmlFor={`${ids}-range`} aria-live="polite">
          {value}
        </output>
      </div>
      <div className="go-players-track" style={{ '--go-share': share } as Vars}>
        <span className="go-players-fill" aria-hidden="true" />
        <input
          id={`${ids}-range`}
          type="range"
          min={FEWEST}
          max={MOST}
          step={1}
          value={value}
          disabled={locked}
          aria-labelledby={`${ids}-head`}
          onChange={(e) => onChange(Number(e.currentTarget.value))}
        />
      </div>
      <div className="go-players-stops">
        {STOPS.map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} players`}
            aria-pressed={n === value}
            disabled={locked}
            style={{ '--go-at': (n - FEWEST) / (MOST - FEWEST) } as Vars}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <span className="go-players-caption">
        {locked && <Icon name="lock" />}
        {locked ? 'Teams is 2v2 · 4 players' : '2 to 8 players'}
      </span>
    </div>
  );
}

/** Ocho's short form: the choices of Ocho's own sit-down, for a table anybody may join. */
function NewOcho(props: {
  link: OchoLink;
  busy: boolean;
  error: string | null;
  onOpen: (players: number, teams: boolean, to500: boolean) => void;
}) {
  const [players, setPlayers] = useState(4);
  const [teams, setTeams] = useState(false);
  const [to500, setTo500] = useState(false);
  return (
    <div className="go-finder-ocho">
      <PlayerSlider value={teams ? 4 : players} locked={teams} onChange={setPlayers} />
      <div className="go-finder-pair">
        <div className="go-finder-field">
          <h4>Table</h4>
          <div className="oc-choices">
            <ChoiceButton label="Free-for-all" sub="2 to 8 players" on={!teams} onPick={() => setTeams(false)} />
            <ChoiceButton label="Teams" sub="2v2 only" on={teams} onPick={() => setTeams(true)} />
          </div>
        </div>
        <div className="go-finder-field">
          <h4>Match</h4>
          <div className="oc-choices">
            <ChoiceButton label="One hand" on={!to500} onPick={() => setTo500(false)} />
            <ChoiceButton label="First to 500" on={to500} onPick={() => setTo500(true)} />
          </div>
        </div>
      </div>
      {props.error && (
        <p className="alert" role="alert">
          {props.error}
        </p>
      )}
      <button
        type="button"
        className="btn go-btn full"
        disabled={props.link !== 'online' || props.busy}
        onClick={() => props.onOpen(teams ? 4 : players, teams, to500)}
      >
        Open an Ocho table
      </button>
    </div>
  );
}

interface FinderProps {
  sk: SkTables;
  ochoTables: OpenTable[] | null;
  ochoLoad: Load;
  link: OchoLink;
  busy: boolean;
  /** Why the last Join at an Ocho table did not seat the player. */
  refused: string | null;
  /** Why the last Ocho table could not be opened. */
  failed: string | null;
  onJoinSk: (id: LobbyId) => void;
  onJoinOcho: (id: string) => void;
  onAgainSk: () => void;
  onAgainOcho: () => void;
  onOpenOcho: (players: number, teams: boolean, to500: boolean) => void;
  search: RefObject<HTMLInputElement | null>;
}

/**
 * The open games: a search and the games' chips over one list of both games' tables that have a
 * free seat, Skull King's first, each in its server's order. The chips and the search hide rows and
 * never reorder them. Under the list, the way to open a table of either game. One game late or
 * failing leaves the other's rows where they are.
 */
function Finder(props: FinderProps) {
  const { sk, ochoTables, link } = props;
  const ids = useId();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  // A socket that is down is a list that failed, however long it takes to come back.
  const ocho: Load = link === 'offline' ? 'failed' : props.ochoLoad;
  const rows: Row[] = [
    ...sk.open.map((lobby) => skRow(lobby, props.onJoinSk)),
    ...(ochoTables ?? [])
      .filter((table) => table.seated < table.players)
      .map((table) => ochoRow(table, props.onJoinOcho)),
  ];
  const shown = rows.filter((row) => (filter === 'all' || row.game === filter) && matches(row, query));
  const loading = sk.state === 'loading' || ocho === 'loading';
  const skFailed = sk.state === 'failed',
    ochoFailed = ocho === 'failed';

  return (
    <div className="go-finder-body">
      <div className="go-finder-find">
        <div className="go-finder-tools">
          <label className="go-finder-search">
            <Icon name="search" />
            <span className="go-sr">Search tables</span>
            <input
              ref={props.search}
              type="search"
              placeholder="A name or a game"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="go-finder-chips" role="group" aria-label="Game">
            {FILTERS.map((f) => (
              <button key={f.value} type="button" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <section className="go-tables" aria-labelledby={`${ids}-title`}>
          <div className="go-tables-head">
            <h3 id={`${ids}-title`}>Tables with a free seat</h3>
            {!loading && <span className="pill green">{rows.length}</span>}
          </div>
          {props.refused && (
            <p className="alert go-tables-refused" role="alert">
              {props.refused}
            </p>
          )}
          {shown.length > 0 && (
            <ul>
              {shown.map((row) => {
                const format = `${ids}-format-${row.key}`,
                  title = `${ids}-table-${row.key}`;
                return (
                  <li key={row.key}>
                    <span
                      className={row.color ? 'avatar' : 'avatar plain'}
                      style={row.color ? { background: row.color } : undefined}
                      aria-hidden="true"
                    >
                      {initialOf(row.host)}
                    </span>
                    <span className="go-table-text">
                      <span className="go-sr">{GAME_NAME[row.game]}: </span>
                      <span className="pill format" id={format}>
                        {row.pill}
                      </span>
                      <b id={title}>{row.title}</b>
                    </span>
                    <button
                      type="button"
                      className="btn ghost go-btn small"
                      aria-describedby={`${format} ${title}`}
                      disabled={row.game === 'ocho' && props.busy}
                      onClick={row.join}
                    >
                      Join
                    </button>
                    <span className="go-table-more">
                      <small>{row.lines[0]}</small>
                      <small>{row.lines[1]}</small>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {rows.length > 0 && shown.length === 0 && (
            <div className="go-tables-note">
              <p>No table matches that.</p>
            </div>
          )}
          {loading && (
            <div className="go-tables-wait" role="status" aria-label="Looking for open games">
              <span></span>
              <span></span>
            </div>
          )}
          {skFailed && ochoFailed ? (
            <div className="go-tables-note">
              <p className="alert" role="alert">
                The tables could not be loaded.
              </p>
              <button
                type="button"
                className="btn ghost go-btn full"
                onClick={() => {
                  props.onAgainSk();
                  props.onAgainOcho();
                }}
              >
                Try again
              </button>
            </div>
          ) : skFailed || ochoFailed ? (
            <div className="go-tables-note">
              <p className="alert" role="alert">
                {skFailed ? 'Skull King’s tables could not be loaded.' : 'Ocho’s tables could not be loaded.'}
              </p>
              <button
                type="button"
                className="btn ghost go-btn full"
                onClick={skFailed ? props.onAgainSk : props.onAgainOcho}
              >
                Try again
              </button>
            </div>
          ) : !loading && rows.length === 0 ? (
            <div className="go-tables-note">
              <p>No open tables right now. Open one and others can sit down.</p>
            </div>
          ) : null}
          <p className="go-tables-foot">
            <Link to={AT.join} className="go-text-link">
              Join with a code
            </Link>
          </p>
        </section>
      </div>
      <section className="go-finder-new" aria-labelledby={`${ids}-new`}>
        <h3 id={`${ids}-new`} className="go-sr">
          Open a table
        </h3>
        <Link to={AT.newPublicTable} className="btn ghost go-btn full">
          Open a Skull King table
        </Link>
        <NewOcho link={link} busy={props.busy} error={props.failed} onOpen={props.onOpenOcho} />
      </section>
    </div>
  );
}

export interface GamesProps {
  online: Online;
  /** Ocho's connection, kept by the page. Games opens it only when the open games are looked at. */
  ocho: OchoClient;
  who: Who;
  /** The player sits in a lobby on the connection this page still has. */
  seated: boolean;
  season: Season | null | undefined;
  /** Sit down at one of Skull King's open tables. */
  onJoin: (id: LobbyId) => void;
}

/** What the page says when an Ocho table could not be sat down at. */
const joinRefusal = (code: string, message: string): string =>
  code === 'NOT_FOUND' ? 'That table is gone.' : code === 'LOBBY_FULL' ? 'That table is full.' : message;

export function Games({ online, ocho, who, seated, season, onJoin }: GamesProps) {
  const title = useTitle('GameOn · Games');
  const wide = useWide();
  const go = useContext(GoContext);
  const [shelf, setShelf] = useState<Shelf>('all');
  const [saved] = useState(savedGame);
  const [you, setYou] = useState(false);
  const [finder, setFinder] = useState(false);
  const [sk, setSk] = useState<SkTables>({ state: 'loading', open: [] });
  const [skRound, setSkRound] = useState(0);
  const [ochoLoad, setOchoLoad] = useState<Load>('loading');
  const [ochoRound, setOchoRound] = useState(0);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const ochoState = useSyncExternalStore(ocho.subscribe, ocho.getState);
  const youOpener = useRef<HTMLButtonElement>(null);
  const finderOpener = useRef<HTMLElement | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const me = who.is === 'player' ? who.me : null,
    session = me != null,
    resume = resumeOf(me, seated, saved),
    link = ochoState.link,
    // The You sheet is a phone's: a window that grows wide closes it. The open games stay open.
    youOpen = !wide && you;

  // Skull King's list needs a session, and is read each time the dialog opens: nothing pushes changes to it.
  useEffect(() => {
    if (!finder || !session) return;
    let stale = false;
    void online.publicLobbies().then((r) => {
      if (stale) return;
      setSk((was) =>
        r.ok
          ? { state: 'ready', open: r.value.filter((lobby) => lobby.players < lobby.settings.maxPlayers) }
          : { state: 'failed', open: was.open },
      );
    });
    return () => {
      stale = true;
    };
  }, [online, session, finder, skRound]);

  // Ocho's socket needs the session the frame has made sure of, and is not opened before the dialog is.
  useEffect(() => {
    if (finder && session) ocho.open();
  }, [ocho, finder, session]);

  // Ocho's list is asked for once the socket is up, and again each time it comes back.
  useEffect(() => {
    if (!finder || link !== 'online') return;
    let stale = false;
    void ocho.send({ t: 'ocho.tables' }).then((r) => {
      if (!stale) setOchoLoad(r.ok ? 'ready' : 'failed');
    });
    return () => {
      stale = true;
    };
  }, [ocho, finder, link, ochoRound]);

  const againSk = (): void => {
    setSk((was) => ({ state: 'loading', open: was.open }));
    setSkRound((n) => n + 1);
  };
  const againOcho = (): void => {
    setOchoLoad('loading');
    // A socket that is down is tried again now, not at the end of its wait.
    if (link === 'offline') {
      ocho.close();
      ocho.open();
    }
    setOchoRound((n) => n + 1);
  };
  const openFinder = (e: MouseEvent<HTMLElement>): void => {
    finderOpener.current = e.currentTarget;
    setRefused(null);
    setFailed(null);
    setSk((was) => ({ state: 'loading', open: was.open }));
    setOchoLoad('loading');
    setFinder(true);
  };
  const closeFinder = (): void => {
    setFinder(false);
    finderOpener.current?.focus();
  };
  const closeYou = (): void => {
    const was = you;
    setYou(false);
    if (was) youOpener.current?.focus();
  };

  const joinOcho = async (id: string): Promise<void> => {
    setBusy(true);
    setRefused(null);
    const r = await ocho.send({ t: 'ocho.joinOpen', lobby: id });
    setBusy(false);
    if (r.ok) {
      go(AT.ocho);
      return;
    }
    setRefused(joinRefusal(r.code, r.message));
    // The table went or filled up: the list is read again.
    if (r.code === 'NOT_FOUND' || r.code === 'LOBBY_FULL') againOcho();
  };
  const openOcho = async (players: number, teams: boolean, to500: boolean): Promise<void> => {
    setBusy(true);
    setFailed(null);
    const made = await ocho.send({ t: 'ocho.create', players, teams, match: to500 ? 'to500' : 'one', open: true });
    const ready = made.ok ? await ocho.send({ t: 'ocho.ready', ready: true }) : made;
    setBusy(false);
    if (!ready.ok) {
      setFailed(ready.message);
      return;
    }
    go(AT.ocho);
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
            {tablesHere && (
              <section className="go-lib-find" aria-labelledby="go-find-title">
                <h2 id="go-find-title">Open games</h2>
                <div className="go-lib-find-card">
                  <p>Skull King and Ocho, in one list.</p>
                  <button type="button" className="btn go-btn" onClick={openFinder}>
                    <Icon name="search" />
                    Look for open games
                  </button>
                </div>
              </section>
            )}
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
        {tablesHere && (
          <button type="button" className="go-bar-btn" onClick={openFinder}>
            <Icon name="grid" />
            Tables
          </button>
        )}
        <button type="button" className="go-bar-btn" ref={youOpener} onClick={() => setYou(true)}>
          <Icon name="users" />
          You
        </button>
      </div>

      {finder && tablesHere && (
        <Sheet title="Open games" onClose={closeFinder} className="go-finder" first={search}>
          <Finder
            sk={sk}
            ochoTables={ochoState.tables}
            ochoLoad={ochoLoad}
            link={link}
            busy={busy}
            refused={refused}
            failed={failed}
            onJoinSk={onJoin}
            onJoinOcho={(id) => void joinOcho(id)}
            onAgainSk={againSk}
            onAgainOcho={againOcho}
            onOpenOcho={(players, teams, to500) => void openOcho(players, teams, to500)}
            search={search}
          />
        </Sheet>
      )}
      {youOpen && (
        <Sheet title="You" onClose={closeYou}>
          {seat}
          <nav className="go-sheet-links" aria-label="More of GameOn">
            <FootLinks page="games" />
          </nav>
        </Sheet>
      )}
    </>
  );
}
