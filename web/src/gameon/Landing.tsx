/* The landing: what GameOn is, the games that are live, the ranked season, and the games that are
   announced. It is the page a visitor with no session sees, and it gives them none: it asks the
   server who they are and nothing more. The season is the server's (`GET /config`), and so are the
   three at the top of the ladder (`GET /ladder`, which anybody may read). */
import { useEffect, useRef, useState } from 'react';
import type { FocusEvent, ReactNode, RefObject } from 'react';
import type { Online } from '../net/online';
import type { LadderEntry, Season } from '../protocol/generated';
import { initialOf } from '../online/parts';
import { AT } from '../router/addresses';
import { cssColor, reduced, whole } from '../tableview/dom';
import { CardFan, IconKey, Mascot, OchoFan, OchoKey, SkullKingKey } from './art';
import { KIND_NAME, SHELVES, showsSkullKing, soonOn, TIERS } from './catalog';
import type { Shelf, SoonGame } from './catalog';
import { accountOf, Footer, Link, Nav, useTitle } from './Frame';
import type { Who } from './Frame';
import { Icon } from './icons';

/** The podium has three steps: with fewer players on the ladder there is none. */
const PODIUM = 3;
/** How long a slide of the hero stays before the next one comes, while nobody is using it. */
export const SLIDE_MS = 6000;

/** A game the hero shows: what its slide says, and where Play goes. */
interface Slide {
  name: string;
  to: string;
  /** The wide page's lead, under the heading. */
  lead: string;
  /** The phone's lead. */
  short: string;
  /** The line on the featured card. */
  line: string;
  /** The line on the game's card on a phone. */
  phone: string;
  /** The facts on the featured card, and the one under the name on a phone. */
  pills: string[];
  sub: string;
  badge: ReactNode;
  head: ReactNode;
  fan: ReactNode;
}

const SLIDES: Slide[] = [
  {
    name: 'Skull King',
    to: AT.home,
    lead: 'Card and board games in your browser. Play alone against bots, pass one phone around the table, or sit down online with friends.',
    short: 'Card and board games in your browser. Play alone or with friends.',
    line: 'The pirate trick-taking game',
    phone: 'The pirate trick-taking game. Bid your tricks, then hit that number exactly.',
    pills: ['2–8 players', 'Solo', 'One screen', 'Online'],
    sub: '2–8 players · 30 min',
    badge: <SkullKingKey />,
    head: (
      <span className="go-sk-name">
        <Mascot />
        <span className="logo">
          Skull <span>King</span>
        </span>
      </span>
    ),
    fan: <CardFan />,
  },
  {
    name: 'Ocho',
    to: AT.ocho,
    lead: 'Card and board games in your browser. Open a table and share the code, or play two against two.',
    short: 'Card and board games in your browser. Play with friends.',
    line: 'Match a colour or a number, then be the first to play your last card.',
    phone: 'Match a colour or a number, then be the first to play your last card.',
    pills: ['2–8 players', 'A table', 'Teams'],
    sub: '2–8 players · Cards',
    badge: <OchoKey />,
    head: (
      <span className="go-sk-name">
        <OchoKey />
        <span className="logo">Ocho</span>
      </span>
    ),
    fan: <OchoFan />,
  },
];

/** One game in the hero: the copy, its featured card on a wide page, and its game card on a phone. */
function HeroSlide({
  slide,
  at,
  shown,
  title,
}: {
  slide: Slide;
  at: number;
  shown: boolean;
  title: RefObject<HTMLHeadingElement | null> | undefined;
}) {
  return (
    <div
      className="go-slide"
      role="group"
      aria-roledescription="slide"
      aria-label={`${slide.name}, ${at + 1} of ${SLIDES.length}`}
      hidden={!shown}
    >
      <div className="go-hero-copy">
        <span className="pill green wide-only">{slide.name} is live</span>
        <h1 tabIndex={-1} ref={title}>
          Game night, <span className="go-accent">switched on.</span>
        </h1>
        <p className="go-lead wide-only">{slide.lead}</p>
        <p className="go-lead narrow-only">{slide.short}</p>
        <div className="go-actions wide-only">
          <Link to={slide.to} className="btn go-btn">
            Play {slide.name}
          </Link>
          <Link to={AT.games} className="btn ghost go-btn">
            Browse the games
          </Link>
        </div>
        <ul className="go-facts wide-only">
          {['Free to play', 'No download', 'No account needed'].map((fact) => (
            <li key={fact}>
              <Icon name="check" />
              {fact}
            </li>
          ))}
        </ul>
      </div>
      <div className="go-featured wide-only">
        <div className="go-featured-head">
          {slide.head}
          <span className="pill gold caps">Featured game</span>
        </div>
        <div className="go-featured-art">{slide.fan}</div>
        <div className="go-featured-foot">
          <b>{slide.line}</b>
          <span className="go-pills">
            {slide.pills.map((fact) => (
              <span className="pill soft" key={fact}>
                {fact}
              </span>
            ))}
          </span>
        </div>
      </div>
      <div className="go-game narrow-only">
        <div className="go-game-art">{slide.fan}</div>
        <div className="go-game-info">
          <div className="go-game-title">
            {slide.badge}
            <span className="go-game-name">
              <b>{slide.name}</b>
              <small>{slide.sub}</small>
            </span>
            <span className="pill green caps">Live</span>
          </div>
          <p>{slide.phone}</p>
          <Link to={slide.to} className="btn go-btn full" label={`Play ${slide.name} now`}>
            Play now
          </Link>
          <small className="go-game-facts">Free · No download · No account needed</small>
        </div>
      </div>
    </div>
  );
}

/**
 * The top of the landing: the live games, one slide each. It moves on by itself while nobody is
 * using it: never under the pointer, never with focus inside, never when the visitor asked for less
 * motion. The buttons and the dots always work. Only the slide that shows is in the tab order.
 */
function Hero({ title }: { title: RefObject<HTMLHeadingElement | null> }) {
  const [at, setAt] = useState(0);
  const [over, setOver] = useState(false);
  const [inside, setInside] = useState(false);
  const still = over || inside;

  useEffect(() => {
    if (still) return;
    const timer = setInterval(() => {
      if (!reduced()) setAt((i) => (i + 1) % SLIDES.length);
    }, SLIDE_MS);
    return () => clearInterval(timer);
  }, [still]);

  const step = (by: number): void => setAt((i) => (i + by + SLIDES.length) % SLIDES.length);
  // The page puts focus on its title, which is in the slide. That is where reading starts, not a
  // visitor using the hero: only a control they can tab to holds it still.
  const enter = (e: FocusEvent<HTMLElement>): void => {
    if (e.target.tabIndex >= 0) setInside(true);
  };
  const leave = (e: FocusEvent<HTMLElement>): void => {
    if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) setInside(false);
  };

  return (
    <section
      className="go-hero"
      aria-roledescription="carousel"
      aria-label="Live games"
      onPointerEnter={() => setOver(true)}
      onPointerLeave={() => setOver(false)}
      onFocus={enter}
      onBlur={leave}
    >
      <div className="go-in">
        <div className="go-slides" aria-live={still || reduced() ? 'polite' : 'off'}>
          {SLIDES.map((slide, i) => (
            <HeroSlide key={slide.name} slide={slide} at={i} shown={i === at} title={i === at ? title : undefined} />
          ))}
        </div>
        <div className="go-carousel">
          <button type="button" className="go-turn" aria-label="Previous game" onClick={() => step(-1)}>
            <Icon name="chevronLeft" />
          </button>
          <span className="go-dots">
            {SLIDES.map((slide, i) => (
              <button
                key={slide.name}
                type="button"
                className="go-dot"
                aria-label={`Show ${slide.name}`}
                aria-current={i === at ? 'true' : undefined}
                onClick={() => setAt(i)}
              >
                <i />
              </button>
            ))}
          </span>
          <button type="button" className="go-turn" aria-label="Next game" onClick={() => step(1)}>
            <Icon name="chevronRight" />
          </button>
        </div>
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

export function Landing({ online, who, season }: LandingProps) {
  const title = useTitle('GameOn · Game night, switched on');
  const ways = useRef<HTMLHeadingElement>(null);
  const [shelf, setShelf] = useState<Shelf>('all');
  const [top, setTop] = useState<LadderEntry[] | null>(null);
  const account = accountOf(who),
    soon = soonOn(shelf);

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

  return (
    <>
      <Nav page="landing" who={who} onWays={toWays} />
      <main className="go-wide">
        <Hero title={title} />

        {season !== null && (
          <section className="go-ranked" aria-labelledby="go-ranked-title">
            <div className="go-in">
              <div className="go-ranked-panel">
                <div className="go-ranked-top">
                  <div className="go-ranked-copy">
                    <p className="go-season">
                      {season && <span className="pill gold caps">Season {season.name}</span>}
                      <span className="go-eyebrow">Ranked</span>
                    </p>
                    <h2 id="go-ranked-title">The ranked season is on</h2>
                    <p className="go-ranked-text wide-only">
                      Play five placement games to get your tier, then climb from Deckhand to Skull King. You queue
                      alone, no table seats a bot, and walking out counts as a loss.
                    </p>
                    <p className="go-ranked-text narrow-only">Climb from Deckhand to Skull King.</p>
                  </div>
                  {top && <Podium top={top} />}
                  <div className="go-ranked-actions">
                    <Link to={account ? AT.ranked : AT.signUp} className="btn blue go-btn">
                      Find a ranked game
                    </Link>
                    <Link to={AT.ladder} className="btn ghost go-btn wide-only">
                      See the ladder
                    </Link>
                  </div>
                  <p className="go-ranked-foot">
                    {!account && (
                      <span>
                        <span className="wide-only">Ranked needs a free account.</span>
                        <span className="narrow-only">Needs a free account</span>
                      </span>
                    )}
                    <Link to={AT.ladder} className="go-text-link narrow-only">
                      See the ladder
                      <Icon name="chevronRight" />
                    </Link>
                  </p>
                </div>
                <div className="go-tiers wide-only">
                  <span className="go-eyebrow" id="go-tiers-label">
                    Seven tiers
                  </span>
                  <ol aria-labelledby="go-tiers-label">
                    {TIERS.map((tier, i) => (
                      <li key={tier}>
                        {i > 0 && <Icon name="chevronRight" />}
                        <span className={i === TIERS.length - 1 ? 'go-tier top' : 'go-tier'}>
                          {i === TIERS.length - 1 && <Icon name="crown" />}
                          {tier}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="go-ways" aria-labelledby="go-ways-title">
          <div className="go-in">
            <p className="go-eyebrow wide-only">Alone or together</p>
            <h2 id="go-ways-title" tabIndex={-1} ref={ways}>
              <span className="wide-only">Three ways to sit down</span>
              <span className="narrow-only">Three ways to play</span>
            </h2>
            <ul className="go-ways-list">
              <li>
                <IconKey icon="bot" tone="blue" />
                <span>
                  <b>Solo</b>
                  <p className="wide-only">
                    Play against bots whenever you have ten minutes. Your game is saved on your device, so you can close
                    the tab and pick it up later.
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

        <section className="go-shelf" aria-labelledby="go-shelf-title">
          <div className="go-in">
            <div className="go-shelf-head">
              <div>
                <p className="go-eyebrow green wide-only">The collection</p>
                <h2 id="go-shelf-title">
                  <span className="wide-only">Pick a game</span>
                  <span className="narrow-only">More games on the way</span>
                </h2>
                <p className="go-sub narrow-only">Skull King is the first. These are in the works.</p>
              </div>
              <span className="wide-only">
                <Shelves shelf={shelf} onPick={setShelf} />
              </span>
            </div>
            {showsSkullKing(shelf) && (
              <div className="go-pick wide-only">
                <div className="go-pick-info">
                  <div className="go-game-title">
                    <SkullKingKey />
                    <span className="go-game-name">
                      <b>Skull King</b>
                      <span className="pill green caps">Live now</span>
                    </span>
                  </div>
                  <p>
                    Bid how many tricks you will win, then hit that number exactly. Pirates, mermaids and the Skull King
                    himself get in the way.
                  </p>
                  <span className="go-pills">
                    {['2–8 players', 'Cards', 'About 30 min', 'Ranked ladder'].map((fact) => (
                      <span className="pill soft" key={fact}>
                        {fact}
                      </span>
                    ))}
                  </span>
                  <div className="go-actions">
                    <Link to={AT.home} className="btn go-btn" label="Play Skull King now">
                      Play now
                    </Link>
                    <Link to={AT.howToPlay} className="btn ghost go-btn">
                      How to play
                    </Link>
                  </div>
                </div>
                <div className="go-pick-art">
                  <CardFan trio />
                </div>
              </div>
            )}
            <ul className="go-soon-list" aria-label="Coming soon">
              {soon.map((game) => (
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
