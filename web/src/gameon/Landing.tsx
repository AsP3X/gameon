/* The landing: what GameOn is, the two games that are live, the ways to sit down, the ranked season,
   and the games that are announced. A wide window reads the ways before the season, a phone the
   season first. It is the page a visitor with no session sees, and it gives them none: it asks the
   server who they are and nothing more. The season is the server's (`GET /config`), and so are the
   three at the top of the ladder (`GET /ladder`, which anybody may read). */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import type { Online } from '../net/online';
import type { LadderEntry, Season } from '../protocol/generated';
import { initialOf } from '../online/parts';
import { AT } from '../router/addresses';
import { cssColor, reduced, whole } from '../tableview/dom';
import { CardFan, IconKey, Mascot, OchoFan, OchoKey } from './art';
import { KIND_NAME, SHELVES, SOON, TIERS } from './catalog';
import type { Shelf, SoonGame } from './catalog';
import { accountOf, Footer, Link, Nav, useTitle, useWide } from './Frame';
import type { Who } from './Frame';
import { Icon } from './icons';

/** The podium has three steps: with fewer players on the ladder there is none. */
const PODIUM = 3;

/** A live game at the top of the landing: its name, its hand, one line of what it is, and Play. */
export interface Door {
  id: string;
  name: string;
  to: string;
  line: string;
  /** The game's mark beside its name: decoration, the name says it. */
  mark: ReactNode;
  logo: ReactNode;
  fan: ReactNode;
}

export const DOORS: Door[] = [
  {
    id: 'go-door-sk',
    name: 'Skull King',
    to: AT.home,
    line: 'The pirate trick-taking game',
    mark: <Mascot />,
    logo: (
      <>
        Skull <span>King</span>
      </>
    ),
    fan: <CardFan />,
  },
  {
    id: 'go-door-ocho',
    name: 'Ocho',
    to: AT.ocho,
    line: 'Match the colour or the number',
    mark: <OchoKey />,
    logo: 'Ocho',
    fan: <OchoFan />,
  },
];

/**
 * The top of the landing: the two live games side by side, as two equal felts, each with its own
 * Play. On a phone they stack, Skull King first. What it costs to sit down is the line under them.
 */
function Hero({ title }: { title: RefObject<HTMLHeadingElement | null> }) {
  return (
    <section className="go-hero" aria-labelledby="go-hero-title">
      <div className="go-in">
        <h1 id="go-hero-title" tabIndex={-1} ref={title}>
          Game night, <span className="go-accent">switched on.</span>
        </h1>
        <ul className="go-doors" aria-label="Live games">
          {DOORS.map((door) => (
            <li key={door.id} className="go-door" aria-labelledby={door.id}>
              <div className="go-door-name">
                <span aria-hidden="true">{door.mark}</span>
                <h2 id={door.id} className="logo">
                  {door.logo}
                </h2>
              </div>
              <div className="go-door-art">{door.fan}</div>
              <p>{door.line}</p>
              <Link to={door.to} className="btn go-btn">
                Play {door.name}
              </Link>
            </li>
          ))}
        </ul>
        <ul className="go-facts">
          {['Free to play', 'No download', 'No account needed'].map((fact) => (
            <li key={fact}>
              <Icon name="check" />
              {fact}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Shelves({ shelf, onPick }: { shelf: Shelf; onPick: (shelf: Shelf) => void }) {
  return (
    <div className="go-shelves" role="group" aria-label="Kind of game">
      {SHELVES.map(([value, name]) => (
        <button key={value} type="button" aria-pressed={shelf === value} onClick={() => onPick(value)}>
          {name}
        </button>
      ))}
    </div>
  );
}

/** A game that is announced: a card on a wide page, one line on a narrow one. */
export function SoonTile({ game, line = false }: { game: SoonGame; line?: boolean }) {
  return (
    <li className="go-soon">
      <span className="go-soon-top">
        <IconKey icon={game.icon} tone={game.tone} />
        <span className="pill soft wide-only caps">Soon</span>
      </span>
      <b>{game.name}</b>
      {line && <p className="wide-only">{game.line}</p>}
      <small className="wide-only">
        {game.players} · {KIND_NAME[game.kind]}
      </small>
      <span className="go-sr narrow-only">, coming soon</span>
    </li>
  );
}

/** The last tile of a list of announced games: the way to say which one is missing. */
export function SuggestTile({ line = false }: { line?: boolean }) {
  return (
    <li className="go-soon go-suggest">
      {line && (
        <div className="go-suggest-ask wide-only">
          <b>What should we add next?</b>
          <p>Tell us the game your table always ends up playing.</p>
          <Link to={AT.suggest} className="btn ghost go-btn">
            Suggest a game
          </Link>
        </div>
      )}
      <Link to={AT.suggest} className={line ? 'go-suggest-link narrow-only' : 'go-suggest-link'}>
        <span className="go-plus">
          <Icon name="plus" />
        </span>
        <span className="go-suggest-text">
          <b className="wide-only">Suggest a game</b>
          <b className="narrow-only">Suggest one</b>
          <small className="wide-only">What should we add?</small>
        </span>
      </Link>
    </li>
  );
}

function Podium({ top }: { top: LadderEntry[] }) {
  return (
    <ol className="go-podium" aria-label="The top of the ladder">
      {top.map((entry) => (
        <li key={entry.user.id} className={`place-${entry.rank}`}>
          {entry.rank === 1 && (
            <span className="go-crown">
              <Icon name="crown" />
            </span>
          )}
          <span className="avatar" style={{ background: cssColor(entry.user.color) }} aria-hidden="true">
            {initialOf(entry.user.name)}
          </span>
          <b>{entry.user.name}</b>
          <span className={`pill wide-only ${entry.rank === 1 ? 'gold' : 'soft'}`}>{entry.rating.tier}</span>
          <small className="narrow-only">Rating {whole(entry.rating.value)}</small>
          <span className="go-step">
            <b>
              <span className="go-sr">Place </span>
              {entry.rank}
            </b>
            <small className="wide-only">Rating {whole(entry.rating.value)}</small>
          </span>
        </li>
      ))}
    </ol>
  );
}

export interface LandingProps {
  online: Online;
  who: Who;
  /** The live season, null when the server has none, undefined until it has said. */
  season: Season | null | undefined;
}

/**
 * The ranked season. A wide window puts what it is and the way in on the left, and the top of the
 * ladder and the seven tiers on the right. A phone reads it as one column.
 */
function Ranked({ season, top, account }: { season: Season | undefined; top: LadderEntry[] | null; account: boolean }) {
  const wide = useWide();
  const find = (
    <Link to={account ? AT.ranked : AT.signUp} className="btn blue go-btn">
      Find a ranked game
    </Link>
  );
  return (
    <section className="go-ranked" aria-labelledby="go-ranked-title">
      <div className="go-in">
        {wide ? (
          <div className="go-ranked-panel go-ranked-split">
            <div className="go-ranked-copy">
              <h2 id="go-ranked-title">The ranked season is on</h2>
              <p className="go-ranked-text">
                Play five placement games to get your tier, then climb from Deckhand to Skull King. You queue alone, no
                table seats a bot, and walking out counts as a loss.
              </p>
              <div className="go-ranked-actions">
                {find}
                <Link to={AT.ladder} className="btn ghost go-btn">
                  See the ladder
                </Link>
              </div>
              {!account && <p className="go-ranked-foot">Ranked needs a free account.</p>}
            </div>
            <div className="go-standings">
              {season && (
                <p className="go-season">
                  <span className="pill gold caps">Season {season.name}</span>
                </p>
              )}
              {top && <Podium top={top} />}
              <ol className="go-tiers" aria-label="Seven tiers">
                {TIERS.map((tier, i) => (
                  <li key={tier} className={i === TIERS.length - 1 ? 'go-tier top' : 'go-tier'}>
                    {i === TIERS.length - 1 && <Icon name="crown" />}
                    {tier}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ) : (
          <div className="go-ranked-panel">
            <div className="go-ranked-top">
              <div className="go-ranked-copy">
                <p className="go-season">
                  {season && <span className="pill gold caps">Season {season.name}</span>}
                  <span className="go-eyebrow">Ranked</span>
                </p>
                <h2 id="go-ranked-title">The ranked season is on</h2>
                <p className="go-ranked-text">Climb from Deckhand to Skull King.</p>
              </div>
              {top && <Podium top={top} />}
              <div className="go-ranked-actions">{find}</div>
              <p className="go-ranked-foot">
                {!account && <span>Needs a free account</span>}
                <Link to={AT.ladder} className="go-text-link">
                  See the ladder
                  <Icon name="chevronRight" />
                </Link>
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Ways({ heading }: { heading: RefObject<HTMLHeadingElement | null> }) {
  return (
    <section className="go-ways" aria-labelledby="go-ways-title">
      <div className="go-in">
        <h2 id="go-ways-title" tabIndex={-1} ref={heading}>
          <span className="wide-only">Three ways to sit down</span>
          <span className="narrow-only">Three ways to play</span>
        </h2>
        <ul className="go-ways-list">
          <li>
            <IconKey icon="bot" tone="blue" />
            <span>
              <b>Solo</b>
              <p className="wide-only">
                Play against bots whenever you have ten minutes. Your game is saved on your device, so you can close the
                tab and pick it up later.
              </p>
              <p className="narrow-only">Against bots, any time. Works offline.</p>
              <span className="pill blue wide-only caps">Works offline</span>
            </span>
          </li>
          <li>
            <IconKey icon="smartphone" tone="gold" />
            <span>
              <b>One screen</b>
              <p className="wide-only">
                Pass one phone around or gather round a tablet. A curtain hides each hand between turns, so nobody
                peeks.
              </p>
              <p className="narrow-only">Pass one phone around the table.</p>
              <span className="pill gold wide-only caps">2–8 players</span>
            </span>
          </li>
          <li>
            <IconKey icon="globe" tone="green" />
            <span>
              <b>Online</b>
              <p className="wide-only">
                Open a private table and share the code, join a public table, or queue alone for a ranked game.
              </p>
              <p className="narrow-only">With friends, at a public table, or ranked.</p>
              <span className="pill green wide-only caps">Friends · Public · Ranked</span>
            </span>
          </li>
        </ul>
      </div>
    </section>
  );
}

export function Landing({ online, who, season }: LandingProps) {
  const title = useTitle('GameOn · Game night, switched on');
  const ways = useRef<HTMLHeadingElement>(null);
  const wide = useWide();
  const [top, setTop] = useState<LadderEntry[] | null>(null);
  const account = accountOf(who) != null;

  // The ladder of the season is public: a visitor is shown it, and no session is made for it.
  useEffect(() => {
    let stale = false;
    void online.ladder().then((r) => {
      if (!stale && r.ok && r.value.entries.length >= PODIUM) setTop(r.value.entries.slice(0, PODIUM));
    });
    return () => {
      stale = true;
    };
  }, [online]);

  const toWays = (): void => {
    ways.current?.scrollIntoView?.({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
    ways.current?.focus({ preventScroll: true });
  };

  const ranked = season !== null && <Ranked season={season} top={top} account={account} />;
  return (
    <>
      <Nav page="landing" who={who} onWays={toWays} />
      <main className="go-wide">
        <Hero title={title} />
        {!wide && ranked}
        <Ways heading={ways} />
        {wide && ranked}

        <section className="go-shelf" aria-labelledby="go-shelf-title">
          <div className="go-in">
            <div className="go-shelf-head">
              <div>
                <h2 id="go-shelf-title">
                  <span className="wide-only">Coming soon</span>
                  <span className="narrow-only">More games on the way</span>
                </h2>
                <p className="go-sub narrow-only">Skull King is the first. These are in the works.</p>
              </div>
            </div>
            <ul className="go-soon-list" aria-label="Coming soon">
              {SOON.map((game) => (
                <SoonTile key={game.name} game={game} line />
              ))}
              <SuggestTile line />
            </ul>
          </div>
        </section>

        <section className="go-cta wide-only" aria-labelledby="go-cta-title">
          <div className="go-in">
            <div className="go-cta-panel">
              <Mascot />
              <div className="go-cta-text">
                <h2 id="go-cta-title">Pull up a chair.</h2>
                <p>Your first hand is one tap away. No download, no account.</p>
              </div>
              <Link to={AT.home} className="btn go-btn">
                Play Skull King
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer page="landing" who={who} />
    </>
  );
}
