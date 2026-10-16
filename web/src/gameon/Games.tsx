/* Games: the shelf, the way back into a game that is still open, the player's own seat, and the
   public tables that have room. Skull King offers the two choices its own home does, Solo and
   Online, each opening in place on its two ways. A player who comes here is on their way in, so a browser without a
   session gets a guest here, as it does when it connects. Everything about the player and the
   tables is what the server said (`Me`, `GET /lobbies`). The game saved on this device is read from
   where the renderer keeps it. Sitting down at a table is not done here: the online screens do it. */
import { useEffect, useState } from 'react';
import type { Online } from '../net/online';
import type { Format, LobbyId, LobbySummary, Me, Season } from '../protocol/generated';
import { initialOf } from '../online/parts';
import { describeRow } from '../online/settings';
import { AT } from '../router/addresses';
import { cssColor, whole } from '../tableview/dom';
import { CardFan, OchoFan, OchoKey, SkullKingKey } from './art';
import { showsOcho, showsSkullKing, soonOn } from './catalog';
import type { Shelf } from './catalog';
import { Footer, Link, Nav, useTitle } from './Frame';
import type { Who } from './Frame';
import { Icon } from './icons';
import { Shelves, SoonTile, SuggestTile } from './Landing';
import { savedGame, savedTitle } from './saved';
import { Choice, Option } from '../skullking/parts';

/** How many open tables the card lists. The rest are behind "All public tables". */
const TABLES_SHOWN = 6;

/**
 * The open tables the card lists, in the server's order: the first of each length of game, so that
 * none of the five is missing while it has a table with room, and then the others for as long as
 * there are rows left. The length is the row's own (`settings.format`), not its place in the list.
 */
function shown(open: LobbySummary[]): LobbySummary[] {
  const first = new Map<Format, LobbySummary>();
  for (const lobby of open) if (!first.has(lobby.settings.format)) first.set(lobby.settings.format, lobby);
  let rest = TABLES_SHOWN - first.size;
  return open.filter((lobby) => first.get(lobby.settings.format) === lobby || rest-- > 0);
}

type Tables = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; open: LobbySummary[] };

/** The way back into a game that is not over: a seat the server keeps, or the game saved on this device. */
function JumpBack({ me, seated }: { me: Me | null; seated: boolean }) {
  const [saved] = useState(savedGame);
  const active = me?.active ?? null,
    running = active?.kind === 'game',
    waiting = !running && (seated || active?.kind === 'lobby');
  if (!running && !waiting && !saved) return null;
  const online = running || waiting;
  return (
    <section className="go-jump" aria-labelledby="go-jump-title">
      <SkullKingKey />
      <div className="go-jump-text">
        <small id="go-jump-title">Jump back in</small>
        <b>Skull King · {online || !saved ? 'your table' : savedTitle(saved)}</b>
        <span>
          {running
            ? 'Game running · your seat is kept'
            : waiting
              ? 'Waiting to start · your seat is kept'
              : saved && `Round ${saved.round} of ${saved.rounds} · saved on this device`}
        </span>
      </div>
      <Link to={online ? AT.online : AT.table} className="btn go-btn">
        {online ? 'Rejoin' : 'Continue'}
      </Link>
    </section>
  );
}

function SkullKing({ season }: { season: Season | null | undefined }) {
  /** The choice that is open. One at a time: opening the other closes this one. */
  const [open, setOpen] = useState<'solo' | 'online' | null>(null);
  const toggle = (card: 'solo' | 'online') => (): void => setOpen((was) => (was === card ? null : card));
  return (
    <section className="go-game" aria-labelledby="go-sk-title">
      <div className="go-game-art">
        <CardFan />
      </div>
      <div className="go-game-info">
        <div className="go-game-title">
          <SkullKingKey />
          <span className="go-game-name">
            <b id="go-sk-title">Skull King</b>
            <small className="wide-only">2–8 players · About 30 min · Cards</small>
            <small className="narrow-only">2–8 players · 30 min</small>
          </span>
          <span className="pill green caps">Live</span>
        </div>
        <p className="wide-only">
          The pirate trick-taking game. Bid how many tricks you will win, then hit that number exactly.
        </p>
        {/* The two choices of Skull King's home, with the addresses each way has there. */}
        <ul className="go-choices" aria-label="Ways to play Skull King">
          <Choice
            id="go-solo-ways"
            name="Solo"
            icon="bot"
            tone="blue"
            line="Against bots, or one screen for the crew."
            open={open === 'solo'}
            onToggle={toggle('solo')}
          >
            <Option name="Against bots" icon="bot" tone="blue" line="Any time. Saved to your account." to={AT.solo} />
            <Option
              name="One screen"
              icon="smartphone"
              tone="gold"
              line="Pass one device around. 2 to 8 pirates."
              to={AT.oneScreen}
            />
          </Choice>
          <Choice
            id="go-online-ways"
            name="Online"
            icon="globe"
            tone="green"
            line="Tables with friends or strangers, and ranked."
            open={open === 'online'}
            onToggle={toggle('online')}
          >
            <Option
              name="Tables"
              icon="globe"
              tone="green"
              line="Quick play, public tables, a table of your own, or a code."
              to={AT.online}
            />
            <Option
              name="Ranked"
              icon="crown"
              tone="purple"
              line={season ? `Season ${season.name}` : 'Climb the ladder'}
              to={AT.ranked}
            />
          </Choice>
        </ul>
        <div className="go-actions">
          <Link to={AT.home} className="btn go-btn" label="Play Skull King">
            Play
          </Link>
          <Link to={AT.howToPlay} className="btn ghost go-btn wide-only">
            How to play
          </Link>
          <Link to={AT.howToPlay} className="go-text-link narrow-only">
            How to play
          </Link>
        </div>
      </div>
    </section>
  );
}

/** Ocho on the shelf: its two ways open sit-down, Teams with Teams chosen. */
function Ocho() {
  return (
    <section className="go-game" aria-labelledby="go-ocho-title">
      <div className="go-game-art">
        <OchoFan />
      </div>
      <div className="go-game-info">
        <div className="go-game-title">
          <OchoKey />
          <span className="go-game-name">
            <b id="go-ocho-title">Ocho</b>
            <small>2–8 players · Cards</small>
          </span>
          <span className="pill green caps">Live</span>
        </div>
        <p className="wide-only">Match a colour or a number, then be the first to play your last card.</p>
        <ul className="go-choices oc-shelf-ways" aria-label="Ways to play Ocho">
          <Option
            name="A table"
            icon="globe"
            tone="green"
            line="2 to 8 players. Friends join with a code."
            to={AT.ocho}
          />
          <Option
            name="Teams"
            icon="users"
            tone="blue"
            line="2v2. Partners sit opposite and see each other’s cards."
            to={AT.ochoTeams}
          />
        </ul>
        <div className="go-actions">
          <Link to={AT.ocho} className="btn go-btn" label="Play Ocho">
            Play
          </Link>
          <Link to={AT.ochoRules} className="btn ghost go-btn wide-only" label="How to play Ocho">
            How to play
          </Link>
          <Link to={AT.ochoRules} className="go-text-link narrow-only" label="How to play Ocho">
            How to play
          </Link>
        </div>
      </div>
    </section>
  );
}

/** The player's own seat: who they are here, and where they stand in ranked. */
function YourSeat({ me, season }: { me: Me; season: Season | null | undefined }) {
  const rating = me.rating;
  return (
    <section className="go-seat wide-only" aria-label="Your seat">
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

function OpenTables({
  tables,
  onJoin,
  onAgain,
}: {
  tables: Tables;
  onJoin: (id: LobbyId) => void;
  onAgain: () => void;
}) {
  return (
    <section className="go-tables" aria-labelledby="go-tables-title">
      <div className="go-tables-head">
        <h2 id="go-tables-title">Open tables · Skull King</h2>
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
              const row = describeRow(lobby);
              return (
                <li key={lobby.id}>
                  {/* The host's colour when the server sent one. No other is put in its place. */}
                  <span
                    className={lobby.hostColor ? 'avatar' : 'avatar plain'}
                    style={lobby.hostColor ? { background: cssColor(lobby.hostColor) } : undefined}
                    aria-hidden="true"
                  >
                    {initialOf(lobby.hostName)}
                  </span>
                  <span className="go-table-text">
                    <span className="pill format" id={`go-table-format-${i}`}>
                      {row.format}
                    </span>
                    {/* A row without its host's colour has no host: the server's name for it is the whole title. */}
                    <b id={`go-table-${i}`}>{row.title}</b>
                  </span>
                  <button
                    type="button"
                    className="btn ghost go-btn small"
                    aria-describedby={`go-table-format-${i} go-table-${i}`}
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
  const [shelf, setShelf] = useState<Shelf>('all');
  const [tables, setTables] = useState<Tables>({ state: 'loading' });
  const [round, setRound] = useState(0);
  const me = who.is === 'player' ? who.me : null,
    session = me != null,
    soon = soonOn(shelf),
    live = showsSkullKing(shelf) || showsOcho(shelf);

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

  return (
    <>
      <Nav page="games" who={who} />
      <main className="go-games go-wide">
        <div className="go-in">
          <div className="go-page-head">
            <div>
              <h1 tabIndex={-1} ref={title}>
                Games
              </h1>
              <p className="go-sub wide-only">Two games are live. More are on the way.</p>
            </div>
            <Shelves shelf={shelf} onPick={setShelf} />
          </div>
          {who.is === 'unknown' && (
            <p className="go-banner" role="status">
              <Icon name="wifiOff" />
              Not connected. Trying again…
            </p>
          )}
          <JumpBack me={me} seated={seated} />
          {/* On a wide window the live games, the rail and the announced games share one grid. On a
              shelf with no live game, the announced games take the live games' place. */}
          <div className={live ? 'go-columns' : 'go-columns no-live'}>
            <div className="go-main">
              {showsSkullKing(shelf) && <SkullKing season={season} />}
              {showsOcho(shelf) && <Ocho />}
            </div>
            <div className="go-rail">
              {me && <YourSeat me={me} season={season} />}
              {who.is !== 'unknown' && (
                <OpenTables
                  tables={tables}
                  onJoin={onJoin}
                  onAgain={() => {
                    setTables({ state: 'loading' });
                    setRound((n) => n + 1);
                  }}
                />
              )}
            </div>
            <section className="go-soon-block" aria-labelledby="go-soon-title">
              <h2 id="go-soon-title">
                Coming soon <span className="pill soft">{soon.length}</span>
              </h2>
              <ul className="go-soon-list">
                {soon.map((game) => (
                  <SoonTile key={game.name} game={game} />
                ))}
                <SuggestTile />
              </ul>
            </section>
          </div>
        </div>
      </main>
      <Footer page="games" who={who} />
    </>
  );
}
