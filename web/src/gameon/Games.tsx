/* Games: the shelf, the way back into a game that is still open, the player's own seat, and the
   public tables that have room. A player who comes here is on their way in, so a browser without a
   session gets a guest here, as it does when it connects. Everything about the player and the
   tables is what the server said (`Me`, `GET /lobbies`). The game saved on this device is read from
   where the renderer keeps it. Sitting down at a table is not done here: the online screens do it. */
import { useEffect, useState } from 'react';
import { Rules } from '../game';
import type { Online } from '../net/online';
import type { LobbyId, LobbySummary, Me, Season } from '../protocol/generated';
import { initialOf } from '../online/parts';
import { AT } from '../router/addresses';
import { cssColor, whole } from '../tableview/dom';
import { CardFan, IconKey, SkullKingKey } from './art';
import type { KeyTone } from './art';
import { showsSkullKing, soonOn } from './catalog';
import type { Shelf } from './catalog';
import { Footer, Link, Nav, useTitle } from './Frame';
import type { Who } from './Frame';
import { Icon } from './icons';
import type { IconName } from './icons';
import { Shelves, SoonTile } from './Landing';
import { savedGame, savedTitle } from './saved';

/** How many open tables the card lists. The rest are behind "All public tables". */
const TABLES_SHOWN = 3;

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

const MODES: { name: string; wide: string; icon: IconName; tone: KeyTone; to: string }[] = [
  { name: 'Solo', wide: 'Against bots', icon: 'bot', tone: 'blue', to: AT.solo },
  { name: 'One screen', wide: 'Pass the phone', icon: 'smartphone', tone: 'gold', to: AT.oneScreen },
  { name: 'Online', wide: 'Tables and friends', icon: 'globe', tone: 'green', to: AT.online },
  { name: 'Ranked', wide: '', icon: 'crown', tone: 'purple', to: AT.ranked },
];

function SkullKing({ season }: { season: Season | null | undefined }) {
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
        <ul className="go-modes" aria-label="Ways to play Skull King">
          {MODES.map((mode) => (
            <li key={mode.name}>
              <Link to={mode.to} className="go-mode">
                <IconKey icon={mode.icon} tone={mode.tone} />
                <span>
                  <b>{mode.name}</b>
                  <small className="wide-only">
                    {mode.wide || (season ? `Season ${season.name}` : 'Climb the ladder')}
                  </small>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="go-actions">
          <Link to={AT.home} className="btn go-btn" label="Play Skull King">
            Play
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
            {tables.open.slice(0, TABLES_SHOWN).map((lobby, i) => (
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
                  <b id={`go-table-${i}`}>{lobby.hostName}’s table</b>
                  <small>
                    {lobby.players} of {lobby.settings.maxPlayers} seats · {Rules.FORMATS[lobby.settings.format].name}
                  </small>
                </span>
                <button
                  type="button"
                  className="btn ghost go-btn small"
                  aria-describedby={`go-table-${i}`}
                  onClick={() => onJoin(lobby.id)}
                >
                  Join
                </button>
              </li>
            ))}
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
    soon = soonOn(shelf);

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
      <main className="go-games">
        <div className="go-in">
          <div className="go-page-head">
            <div>
              <h1 tabIndex={-1} ref={title}>
                Games
              </h1>
              <p className="go-sub wide-only">One game is live. More are on the way.</p>
            </div>
            <Shelves shelf={shelf} onPick={setShelf} />
          </div>
          {who.is === 'unknown' && (
            <p className="go-banner" role="status">
              <Icon name="wifiOff" />
              Not connected. Trying again…
            </p>
          )}
          <div className="go-columns">
            <div className="go-main">
              <JumpBack me={me} seated={seated} />
              {showsSkullKing(shelf) && <SkullKing season={season} />}
              <section className="go-soon-block" aria-labelledby="go-soon-title">
                <h2 id="go-soon-title">
                  Coming soon <span className="pill soft">{soon.length}</span>
                </h2>
                <ul className="go-soon-list">
                  {soon.map((game) => (
                    <SoonTile key={game.name} game={game} />
                  ))}
                </ul>
              </section>
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
          </div>
        </div>
      </main>
      <Footer page="games" who={who} />
    </>
  );
}
