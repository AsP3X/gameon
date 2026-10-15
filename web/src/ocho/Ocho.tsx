/* Ocho's pages: sit down, the table waiting for its players, the table, the match score between
   hands and at the end, and how to play. They are drawn in design/ocho.pen (frames 01–20).

   Ocho runs on its own server (docs/ocho-protocol.md). These pages send intents and draw the lobby
   and the per-seat view it pushes: which cards may be played, whose turn it is, who went out and
   what everybody scored are the server's to say. The legal cards light up only because the view
   lists them; the server checks every play again. Another seat's hand is never here: a seat shows
   its count, and a card only when the server sent it (X-Ray, or a partner's hand in 2v2).

   Player names are text React escapes. Nothing a player typed is put into a class, a style or an
   address. */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { Link, useTitle } from '../gameon/Frame';
import type { Who } from '../gameon/Frame';
import { Icon } from '../gameon/icons';
import { initialOf } from '../online/parts';
import { AT } from '../router/addresses';
import { CardBack, CardFace, cardName, COLOR_NAME, isWild, matchLine, matchWords, MiniCard } from './cards';
import type { OchoClient, OchoResult } from './client';
import { COLORS } from './wire';
import type { Card, Color, Intent, Lobby, View } from './wire';

/** A seat's avatar colour, by seat: the server sends no colours for Ocho. Tokens only. */
const SEAT_TONES = ['purple', 'orange', 'blue', 'green', 'red', 'gold', 'cpurple', 'cgreen'];
const toneOf = (seat: number): string => SEAT_TONES[seat % SEAT_TONES.length];

/** What a refusal says on the page. The server's own sentence when it sent one. */
const refusal = (r: OchoResult): string | null => (r.ok ? null : r.message);

/** Sends one intent at a time, and keeps the last refusal to show. */
function useSender(ocho: OchoClient) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (intent: Intent): Promise<OchoResult> => {
    setBusy(true);
    setError(null);
    const r = await ocho.send(intent);
    setBusy(false);
    setError(refusal(r));
    return r;
  };
  return { busy, error, setError, send };
}

function BackHeader({ label = 'Games', to = AT.games }: { label?: string; to?: string }) {
  return (
    <header className="oc-back-bar">
      <Link to={to} className="go-text-link oc-back">
        <Icon name="chevronLeft" />
        {label}
      </Link>
    </header>
  );
}

function Offline({ who, link }: { who: Who; link: string }) {
  if (who.is === 'unknown' || link === 'offline')
    return (
      <p className="go-banner oc-banner" role="status">
        <Icon name="wifiOff" />
        Not connected. Trying again…
      </p>
    );
  if (who.is === 'asking' || link === 'connecting')
    return (
      <p className="go-banner oc-banner" role="status">
        Connecting…
      </p>
    );
  return null;
}

/* ---------- sit down ---------- */

function Stepper({ value, locked, onChange }: { value: number; locked: boolean; onChange: (n: number) => void }) {
  return (
    <div className="oc-stepper">
      <button
        type="button"
        className="oc-step"
        aria-label="One player fewer"
        disabled={locked || value <= 2}
        onClick={() => onChange(value - 1)}
      >
        <Icon name="minus" />
      </button>
      <output className="oc-step-value" aria-live="polite" aria-label="Players">
        {value}
      </output>
      <button
        type="button"
        className="oc-step"
        aria-label="One player more"
        disabled={locked || value >= 8}
        onClick={() => onChange(value + 1)}
      >
        <Icon name="plus" />
      </button>
      <span className="oc-step-caption">
        {locked && <Icon name="lock" />}
        {locked ? 'Teams is 2v2 · 4 players' : '2 to 8 players'}
      </span>
    </div>
  );
}

function ChoiceButton(props: { label: string; sub?: string; on: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      className={props.on ? 'oc-choice oc-on' : 'oc-choice'}
      aria-pressed={props.on}
      onClick={props.onPick}
    >
      <b>{props.label}</b>
      {props.sub && <small>{props.sub}</small>}
    </button>
  );
}

function SitDown({ ocho, who, teams: teamsAtFirst }: { ocho: OchoClient; who: Who; teams: boolean }) {
  const title = useTitle('GameOn · Ocho');
  const state = useSyncExternalStore(ocho.subscribe, ocho.getState);
  const [players, setPlayers] = useState(4);
  const [teams, setTeams] = useState(teamsAtFirst);
  const [to500, setTo500] = useState(teamsAtFirst);
  const [code, setCode] = useState('');
  const [seated, setSeated] = useState(false);
  const { busy, error, setError, send } = useSender(ocho);
  const ready = state.link === 'online' && who.is === 'player';

  const sat = (r: OchoResult): void => setSeated(!r.ok && r.code === 'ALREADY_SEATED');
  const start = async (): Promise<void> => {
    const r = await send({ t: 'ocho.create', players: teams ? 4 : players, teams, match: to500 ? 'to500' : 'one' });
    sat(r);
    if (r.ok) await send({ t: 'ocho.ready', ready: true });
  };
  const join = async (): Promise<void> => {
    const r = await send({ t: 'ocho.join', code: code.trim().toUpperCase() });
    sat(r);
    if (r.ok) await send({ t: 'ocho.ready', ready: true });
  };
  const leave = async (): Promise<void> => {
    const r = await send({ t: 'ocho.leave' });
    if (r.ok) {
      setSeated(false);
      setError(null);
      ocho.forget();
    }
  };

  return (
    <div className="oc-page">
      <BackHeader />
      <main className="oc-sit">
        <Offline who={who} link={state.link} />
        <section className="oc-panel" aria-labelledby="oc-sit-title">
          <h1 id="oc-sit-title" tabIndex={-1} ref={title}>
            Ocho
          </h1>
          <div className="oc-field">
            <h2 className="oc-label">Players</h2>
            <Stepper value={teams ? 4 : players} locked={teams} onChange={setPlayers} />
          </div>
          <div className="oc-field">
            <h2 className="oc-label">Table</h2>
            <div className="oc-choices">
              <ChoiceButton label="Free-for-all" sub="2 to 8 players" on={!teams} onPick={() => setTeams(false)} />
              <ChoiceButton label="Teams" sub="2v2 only" on={teams} onPick={() => setTeams(true)} />
            </div>
            {teams && (
              <p className="oc-note">
                <Icon name="info" />
                Partners sit opposite and see each other&rsquo;s cards.
              </p>
            )}
          </div>
          <div className="oc-field">
            <h2 className="oc-label">Match</h2>
            <div className="oc-choices">
              <ChoiceButton label="One hand" on={!to500} onPick={() => setTo500(false)} />
              <ChoiceButton label="First to 500" on={to500} onPick={() => setTo500(true)} />
            </div>
          </div>
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          {seated && (
            <button type="button" className="btn ghost" disabled={busy} onClick={() => void leave()}>
              Leave that table
            </button>
          )}
          <button type="button" className="btn" disabled={!ready || busy} onClick={() => void start()}>
            Start
          </button>
        </section>
        <form
          className="oc-panel oc-join"
          aria-labelledby="oc-join-title"
          onSubmit={(e) => {
            e.preventDefault();
            void join();
          }}
        >
          <h2 id="oc-join-title">Join with a code</h2>
          <div className="oc-join-row">
            <input
              className="oc-code-input"
              aria-label="Table code"
              value={code}
              maxLength={6}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="CODE"
              onChange={(e) => setCode(e.target.value)}
            />
            <button type="submit" className="btn ghost" disabled={!ready || busy || code.trim().length !== 6}>
              Join
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

/* ---------- waiting for the players ---------- */

const settingsLine = (lobby: Lobby): string =>
  `${lobby.teams ? 'Teams' : 'Free-for-all'} · ${lobby.players} players · ${lobby.firstTo500 ? 'First to 500' : 'One hand'}`;

function Waiting({ ocho, lobby, meId }: { ocho: OchoClient; lobby: Lobby; meId: string | null }) {
  const title = useTitle('GameOn · Ocho · Your table');
  const { busy, error, send } = useSender(ocho);
  const host = lobby.host === meId;
  const mine = lobby.members.find((m) => m.user === meId);
  const missing = lobby.players - lobby.members.length;
  const allReady = missing === 0 && lobby.members.every((m) => m.ready);
  const empty = Array.from({ length: Math.max(0, missing) }, (_, i) => i);
  return (
    <div className="oc-page">
      <BackHeader />
      <main className="oc-sit">
        <section className="oc-panel" aria-labelledby="oc-wait-title">
          <h1 id="oc-wait-title" tabIndex={-1} ref={title}>
            Ocho
          </h1>
          <p className="oc-muted">{settingsLine(lobby)}</p>
          <div className="oc-code">
            <h2 className="oc-label">Table code</h2>
            <b className="oc-code-value">{lobby.code}</b>
            <p className="oc-muted">Give this code to the others. They join from Ocho&rsquo;s sit-down page.</p>
          </div>
          <ul className="oc-rows" aria-label="Players">
            {lobby.members.map((m, seat) => (
              <li key={m.user} className="oc-row">
                <span className={`avatar oc-tone-${toneOf(seat)}`} aria-hidden="true">
                  {initialOf(m.name)}
                </span>
                <span className="oc-row-text">
                  <b>{m.user === meId ? 'You' : m.name}</b>
                  <small>
                    {m.user === lobby.host ? 'Host' : lobby.teams ? (seat % 2 === 0 ? 'Team 1' : 'Team 2') : 'Player'}
                  </small>
                </span>
                <span className={m.ready ? 'pill green' : 'pill soft'}>{m.ready ? 'Ready' : 'Not ready'}</span>
              </li>
            ))}
            {empty.map((i) => (
              <li key={`empty-${i}`} className="oc-row oc-empty">
                <span className="avatar empty" aria-hidden="true"></span>
                <span className="oc-row-text">
                  <b>Waiting for a player</b>
                </span>
              </li>
            ))}
          </ul>
          <p className="oc-muted" role="status">
            {missing > 0
              ? `Waiting for ${missing} more ${missing === 1 ? 'player' : 'players'}`
              : allReady
                ? host
                  ? 'Everyone is ready'
                  : 'Everyone is ready · the host deals'
                : 'Waiting for everyone to be ready'}
          </p>
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          {mine && (
            <button
              type="button"
              className="btn ghost"
              disabled={busy}
              onClick={() => void send({ t: 'ocho.ready', ready: !mine.ready })}
            >
              {mine.ready ? 'Not ready' : 'Ready'}
            </button>
          )}
          {host && (
            <button
              type="button"
              className="btn"
              disabled={busy || !allReady}
              onClick={() => void send({ t: 'ocho.start' })}
            >
              Start
            </button>
          )}
          <button
            type="button"
            className="go-text-link oc-leave"
            disabled={busy}
            onClick={() =>
              void send({ t: 'ocho.leave' }).then((r) => {
                if (r.ok) ocho.forget();
              })
            }
          >
            Leave the table
          </button>
        </section>
      </main>
    </div>
  );
}

/* ---------- the table ---------- */

/** Where the other seats sit, in the order play goes from you: left, then across the top, then right. */
const SLOTS: Record<number, string[]> = {
  1: ['t2'],
  2: ['t1', 't3'],
  3: ['l1', 't2', 'r1'],
  4: ['l1', 't1', 't3', 'r1'],
  5: ['l1', 't1', 't2', 't3', 'r1'],
  6: ['l2', 'l1', 't1', 't3', 'r1', 'r2'],
  7: ['l2', 'l1', 't1', 't2', 't3', 'r1', 'r2'],
};

/** The other seats, from the one after you round the table. */
function others(view: View): number[] {
  const n = view.counts.length;
  return Array.from({ length: n - 1 }, (_, i) => (view.you + 1 + i) % n);
}

/** The partner in 2v2: the seat across the table. */
const partnerOf = (view: View): number | null => (view.partnerHand != null ? (view.you + 2) % 4 : null);

function TopBar({ hand, onMenu, menu }: { hand: number; onMenu: () => void; menu: boolean }) {
  return (
    <header className="oc-top">
      <span className="oc-brand">OCHO</span>
      <span className="oc-hand-no">Hand {hand}</span>
      <button
        type="button"
        className="icon-btn oc-menu-btn"
        aria-label="Menu"
        aria-expanded={menu}
        aria-controls="oc-menu"
        onClick={onMenu}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      {menu && (
        <nav id="oc-menu" className="oc-menu" aria-label="Ocho">
          <Link to={AT.ochoRules} className="oc-menu-item">
            How to play
          </Link>
          <Link to={AT.games} className="oc-menu-item">
            Games
          </Link>
        </nav>
      )}
    </header>
  );
}

function Seat({ view, seat, name, slot }: { view: View; seat: number; name: string; slot: string }) {
  const shown = view.xray.find((x) => x.seat === seat);
  const partner = partnerOf(view) === seat;
  const turn = view.turn === seat && view.phase !== 'between' && view.phase !== 'over';
  const count = view.counts[seat] ?? 0;
  return (
    <li className={turn ? 'oc-seat oc-turn' : 'oc-seat'} data-slot={slot}>
      <span className={`avatar oc-tone-${toneOf(seat)}`} aria-hidden="true">
        {initialOf(name)}
      </span>
      <b className="oc-seat-name">{name}</b>
      <span className="oc-count">
        <CardBack size="sm" />
        <span>
          {count}
          <span className="oc-sr"> {count === 1 ? 'card' : 'cards'}</span>
        </span>
      </span>
      {turn && <span className="oc-sr">Their turn</span>}
      {partner && <span className="pill blue oc-tag">Partner</span>}
      {shown && (
        <span className="oc-xray-card">
          <span className="oc-sr">X-Ray shows {cardName(shown.card)}</span>
          <MiniCard card={shown.card} />
        </span>
      )}
      {partner && view.partnerHand && (
        <span className="oc-partner-hand" aria-label={`${name}'s hand: ${view.partnerHand.map(cardName).join(', ')}`}>
          {view.partnerHand.map((c) => (
            <MiniCard key={c.id} card={c} />
          ))}
        </span>
      )}
    </li>
  );
}

function XrayRows({ view, nameOf }: { view: View; nameOf: (seat: number) => string }) {
  return (
    <ul className="oc-xray-rows" aria-label="X-Ray · one card from each hand. Only you see them.">
      {others(view).map((seat) => {
        const shown = view.xray.find((x) => x.seat === seat);
        const count = view.counts[seat] ?? 0;
        return (
          <li key={seat} className="oc-row">
            <span className={`avatar oc-tone-${toneOf(seat)}`} aria-hidden="true">
              {initialOf(nameOf(seat))}
            </span>
            <span className="oc-row-text">
              <b>{nameOf(seat)}</b>
              <small>
                {count} {count === 1 ? 'card' : 'cards'}
              </small>
            </span>
            {shown && (
              <span className="oc-xray-card">
                <span className="oc-sr">X-Ray shows {cardName(shown.card)}</span>
                <CardFace card={shown.card} size="sm" />
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Centre({ view }: { view: View }) {
  return (
    <div className="oc-centre">
      <div className="oc-centre-pills">
        <span className="oc-match">
          <i className={`oc-dot ${view.color}`} aria-hidden="true"></i>
          {matchLine(view.color, view.symbol, view.top)}
        </span>
        <span className="oc-direction">
          <svg viewBox="0 0 24 24" aria-hidden="true" className={view.direction < 0 ? 'ccw' : undefined}>
            <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />
          </svg>
          {view.direction < 0 ? 'Counter-clockwise' : 'Clockwise'}
        </span>
      </div>
      <div className="oc-piles">
        <figure className="oc-pile">
          <CardBack size="lg" />
          <figcaption>Draw · {view.drawCount}</figcaption>
        </figure>
        <figure className="oc-pile">
          <CardFace card={view.top} size="lg" />
          <figcaption>
            Discard<span className="oc-sr">: {cardName(view.top)}</span>
          </figcaption>
        </figure>
      </div>
      {view.stack != null && (
        <span className="oc-stack" role="status">
          <b>+{view.stack}</b> to draw
        </span>
      )}
    </div>
  );
}

function ColorSheet({ onPick, onBack }: { onPick: (c: Color) => void; onBack?: () => void }) {
  const sheet = useRef<HTMLElement>(null);
  // The sheet takes the keyboard: the card that asked for it is behind it.
  useEffect(() => {
    sheet.current?.querySelector('button')?.focus();
  }, []);
  return (
    <div className="oc-scrim">
      <section ref={sheet} className="oc-sheet" role="dialog" aria-modal="true" aria-labelledby="oc-color-title">
        <h2 id="oc-color-title">Name a color</h2>
        <div className="oc-colors">
          {COLORS.map((c) => (
            <button key={c} type="button" className={`oc-color ${c}`} onClick={() => onPick(c)}>
              {COLOR_NAME[c]}
            </button>
          ))}
        </div>
        {onBack && (
          <button type="button" className="go-text-link oc-sheet-back" onClick={onBack}>
            Back
          </button>
        )}
      </section>
    </div>
  );
}

function Table({ ocho, view, nameOf }: { ocho: OchoClient; view: View; nameOf: (seat: number) => string }) {
  const title = useTitle('GameOn · Ocho · Table');
  const [menu, setMenu] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [wild, setWild] = useState<number | null>(null);
  const { busy, error, send } = useSender(ocho);
  const legal = new Set(view.legal);
  const mine = view.must !== 'none';
  const selected = view.hand.find((c) => c.id === picked && legal.has(c.id)) ?? null;
  const words = matchWords(view.color, view.symbol);
  const seats = others(view);
  const slots = SLOTS[seats.length] ?? [];
  const partner = partnerOf(view);

  // A new view is a new moment: what was picked for the last one is not picked for this one.
  useEffect(() => {
    setPicked(null);
    setWild(null);
  }, [view]);

  const play = (card: Card): void => {
    if (isWild(card)) setWild(card.id);
    else void send({ t: 'ocho.play', card: card.id });
  };
  const drawn = view.must === 'playDrawnOrKeep' ? (view.hand.find((c) => legal.has(c.id)) ?? null) : null;

  let status: string;
  let actions: ReactNode = null;
  switch (view.must) {
    case 'playOrDraw':
      status = selected
        ? `Match ${words} · ${cardName(selected)} plays`
        : legal.size > 0
          ? `Match ${words} · pick a card`
          : `Nothing in your hand matches ${words}`;
      actions =
        legal.size > 0 ? (
          <>
            <button
              type="button"
              className="btn"
              disabled={busy || !selected}
              onClick={() => selected && play(selected)}
            >
              {selected ? `Play ${cardName(selected)}` : 'Play'}
            </button>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => void send({ t: 'ocho.draw' })}>
              Draw
            </button>
          </>
        ) : (
          <button type="button" className="btn" disabled={busy} onClick={() => void send({ t: 'ocho.draw' })}>
            Draw one
          </button>
        );
      break;
    case 'playDrawnOrKeep':
      status = drawn ? `You drew ${cardName(drawn)} · it plays` : 'You drew a card';
      actions = (
        <>
          {drawn && (
            <button type="button" className="btn" disabled={busy} onClick={() => play(drawn)}>
              Play it
            </button>
          )}
          <button type="button" className="btn ghost" disabled={busy} onClick={() => void send({ t: 'ocho.keep' })}>
            End turn
          </button>
        </>
      );
      break;
    case 'answerStack':
      status = `Play Draw 2, Wild Draw 4 or Shield · or take ${view.stack ?? 0}`;
      actions = (
        <>
          {legal.size > 0 && (
            <button
              type="button"
              className="btn"
              disabled={busy || !selected}
              onClick={() => selected && play(selected)}
            >
              {selected ? `Play ${cardName(selected)}` : 'Play'}
            </button>
          )}
          <button type="button" className="btn gold" disabled={busy} onClick={() => void send({ t: 'ocho.draw' })}>
            Take {view.stack ?? 0}
          </button>
        </>
      );
      break;
    case 'chooseColor':
      status = `Opening card: ${cardName(view.top)} · name the color`;
      break;
    default:
      status =
        view.phase === 'chooseColor' ? `${nameOf(view.turn)} names the opening color` : `${nameOf(view.turn)} to play`;
  }
  if (wild != null)
    status = `You played ${cardName(view.hand.find((c) => c.id === wild) ?? view.top)} · name the next color`;

  return (
    <div className="oc-page oc-table-page">
      <TopBar hand={view.handNo} menu={menu} onMenu={() => setMenu((m) => !m)} />
      <main className="oc-table">
        <h1 className="oc-sr" tabIndex={-1} ref={title}>
          Ocho · Hand {view.handNo}
        </h1>
        <div className={view.xray.length > 0 ? 'oc-felt oc-has-xray' : 'oc-felt'}>
          <ul className="oc-seats" aria-label="The table">
            {seats.map((seat, i) => (
              <Seat key={seat} view={view} seat={seat} name={nameOf(seat)} slot={slots[i] ?? 't2'} />
            ))}
          </ul>
          <Centre view={view} />
          {view.xray.length > 0 && <XrayRows view={view} nameOf={nameOf} />}
        </div>
        {view.xray.length > 0 && <p className="oc-xray-note">X-Ray · one card from each hand. Only you see them.</p>}
        <div className="oc-you">
          <span className={`avatar sm oc-tone-${toneOf(view.you)}`} aria-hidden="true">
            Y
          </span>
          <b>You</b>
          <span className="oc-muted">
            {view.hand.length} {view.hand.length === 1 ? 'card' : 'cards'}
          </span>
          {mine && <span className="pill gold">Your turn</span>}
          {partner != null && <span className="pill blue">Team with {nameOf(partner)}</span>}
        </div>
        <ul className="oc-hand" aria-label="Your hand">
          {view.hand.map((card) => {
            const can = mine && legal.has(card.id) && view.must !== 'playDrawnOrKeep';
            const on = picked === card.id && can;
            return (
              <li key={card.id}>
                <button
                  type="button"
                  className={`oc-hand-card${on ? ' oc-on' : ''}${mine && !legal.has(card.id) ? ' oc-dim' : ''}`}
                  aria-label={cardName(card)}
                  aria-pressed={can ? on : undefined}
                  disabled={!can || busy}
                  onClick={() => setPicked(on ? null : card.id)}
                >
                  <CardFace card={card} />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="oc-actions">
          <p className="oc-status" role="status">
            {status}
          </p>
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          {actions && <div className="oc-buttons">{actions}</div>}
        </div>
      </main>
      {view.must === 'chooseColor' && !busy && <ColorSheet onPick={(color) => void send({ t: 'ocho.color', color })} />}
      {wild != null && !busy && (
        <ColorSheet
          onPick={(color) => {
            const card = wild;
            setWild(null);
            void send({ t: 'ocho.play', card, color });
          }}
          onBack={() => setWild(null)}
        />
      )}
    </div>
  );
}

/* ---------- the match score ---------- */

const ordinal = (n: number): string => {
  const tens = n % 100,
    ones = n % 10;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ones === 1 ? 'st' : ones === 2 ? 'nd' : ones === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
};

function Score({
  ocho,
  view,
  nameOf,
  teams,
  onHome,
}: {
  ocho: OchoClient;
  view: View;
  nameOf: (seat: number) => string;
  /** 2v2: the match is won by both partners. */
  teams: boolean;
  onHome: () => void;
}) {
  const over = view.phase === 'over';
  const winner = view.matchWinner;
  const winners = winner == null ? [] : teams ? [winner, (winner + 2) % 4] : [winner];
  const heading = over
    ? winners.length === 0
      ? 'The match is over'
      : `${winners.map(nameOf).join(' and ')} ${winners.length === 1 && winners[0] !== view.you ? 'wins' : 'win'} the match`
    : 'Match score';
  const title = useTitle(`GameOn · Ocho · ${over ? 'Match won' : 'Match score'}`);
  const { busy, error, send } = useSender(ocho);
  const out = view.handWinner;
  const gained = out != null ? (view.handPoints?.[out] ?? 0) : 0;
  const order = view.scores
    .map((score, seat) => ({ seat, score }))
    .sort((a, b) => b.score - a.score || a.seat - b.seat);
  const [menu, setMenu] = useState(false);
  return (
    <div className="oc-page">
      <TopBar hand={view.handNo} menu={menu} onMenu={() => setMenu((m) => !m)} />
      <main className="oc-score">
        <div className="oc-score-head">
          <h1 tabIndex={-1} ref={title}>
            {heading}
          </h1>
          <div className="oc-score-meta">
            {out != null && (
              <p className="oc-muted">
                {nameOf(out)} went out · {gained} this hand
              </p>
            )}
            {view.target != null && <span className="pill gold">First to {view.target}</span>}
          </div>
        </div>
        <ol className="oc-rows oc-score-rows" aria-label="Match score">
          {order.map(({ seat, score }, i) => {
            const lead = over ? winners.includes(seat) : i === 0;
            return (
              <li key={seat} className={lead ? 'oc-row oc-lead' : 'oc-row'}>
                <span className={`avatar oc-tone-${toneOf(seat)}`} aria-hidden="true">
                  {initialOf(nameOf(seat))}
                </span>
                <span className="oc-row-text">
                  <b>{nameOf(seat)}</b>
                  <small>{seat === out ? `Went out · +${gained} this hand` : `${ordinal(i + 1)} place`}</small>
                </span>
                {lead && <span className="pill gold">{over ? 'Winner' : 'Leader'}</span>}
                <b className="oc-total">{score}</b>
              </li>
            );
          })}
        </ol>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        <div className="oc-score-actions">
          {over ? (
            <button type="button" className="btn blue" onClick={onHome}>
              Back to games
            </button>
          ) : view.must === 'nextHand' ? (
            <button type="button" className="btn" disabled={busy} onClick={() => void send({ t: 'ocho.next' })}>
              Next hand
            </button>
          ) : (
            <p className="oc-status" role="status">
              {out != null ? `Waiting for ${nameOf(out)} to deal the next hand` : 'Waiting for the next hand'}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

/* ---------- the page ---------- */

export interface OchoPageProps {
  ocho: OchoClient;
  who: Who;
  /** Sit down with Teams chosen: the shelf's "Teams" way. */
  teams: boolean;
  go: (path: string, how?: { replace?: boolean }) => void;
}

/** Ocho's one address for playing: sit down, the table waiting, or the table, as the server says. */
export function OchoPage({ ocho, who, teams, go }: OchoPageProps) {
  const state = useSyncExternalStore(ocho.subscribe, ocho.getState);
  const player = who.is === 'player';
  const meId = who.is === 'player' ? who.me.user.id : null;

  // The socket needs the session the frame has made sure of.
  useEffect(() => {
    if (player) ocho.open();
  }, [ocho, player]);

  const { lobby, view } = state;
  const nameOf = (seat: number): string =>
    view && seat === view.you ? 'You' : (lobby?.members[seat]?.name ?? `Seat ${seat + 1}`);

  if (view) {
    if (view.phase === 'between' || view.phase === 'over')
      return (
        <Score
          ocho={ocho}
          view={view}
          nameOf={nameOf}
          teams={lobby?.teams ?? view.partnerHand != null}
          onHome={() => {
            // The match is over: the seat is given up, and the page forgets the table.
            void ocho.send({ t: 'ocho.leave' });
            ocho.forget();
            go(AT.games);
          }}
        />
      );
    return <Table ocho={ocho} view={view} nameOf={nameOf} />;
  }
  if (lobby) return <Waiting ocho={ocho} lobby={lobby} meId={meId} />;
  return <SitDown ocho={ocho} who={who} teams={teams} />;
}

/* ---------- how to play ---------- */

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="oc-panel oc-rule">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

const SPECIALS: { label: string; tone: string; name: string; line: string }[] = [
  { label: 'SKIP', tone: 'red', name: 'Skip', line: 'The next player loses a turn.' },
  { label: 'REV', tone: 'green', name: 'Reverse', line: 'Direction flips; with two players it skips.' },
  {
    label: '+2',
    tone: 'blue',
    name: 'Draw 2 and Wild Draw 4',
    line: 'The next player draws that many unless they add another draw card; the total adds up.',
  },
  { label: 'SHLD', tone: 'black', name: 'Shield', line: 'Sends the whole total back.' },
  { label: 'XRAY', tone: 'black', name: 'X-Ray', line: 'You alone see one card from each opponent.' },
  { label: 'DEAD', tone: 'red', name: 'Dead Red', line: 'Anyone with no red draws 2.' },
  { label: 'BOO', tone: 'blue', name: 'Boo Blue', line: 'Everyone tied for fewest cards draws 2.' },
];

export function OchoRules() {
  const title = useTitle('GameOn · Ocho · How to play');
  return (
    <div className="oc-page">
      <BackHeader />
      <main className="oc-rules">
        <div className="oc-rules-head">
          <h1 tabIndex={-1} ref={title}>
            How to play
          </h1>
          <p>Match a colour or a number, then be the first to play your last card.</p>
        </div>
        <div className="oc-rules-cols">
          <div className="oc-rules-col">
            <Block title="A hand">
              <p>
                Each player is dealt 8 cards. Match the discard by colour, number, or the same action. The first player
                with no cards wins the hand. You do not call out a last card.
              </p>
            </Block>
            <Block title="A turn">
              <p>
                Play one legal card, or draw one. A card you drew may be played at once if it matches. Ocho Wild, Wild
                Draw 4, Shield, and X-Ray may be played on anything.
              </p>
            </Block>
            <Block title="The score">
              <p>
                A number is its face value. Skip, Reverse, and Draw 2 are 20. A wild or a special is 50. A match is one
                hand, or first to 500.
              </p>
            </Block>
          </div>
          <div className="oc-rules-col">
            <Block title="The specials">
              <ul className="oc-specials">
                {SPECIALS.map((s) => (
                  <li key={s.name}>
                    <span className={`oc-mini ${s.tone}`} aria-hidden="true">
                      {s.label}
                    </span>
                    <span>
                      <b>{s.name}</b>
                      <small>{s.line}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </Block>
          </div>
        </div>
        <section className="oc-ways" aria-labelledby="oc-ways-title">
          <h2 id="oc-ways-title" className="oc-label">
            Two ways to play
          </h2>
          <ul>
            <li>
              <Link to={AT.ocho} className="oc-way">
                <span className="go-key green" aria-hidden="true">
                  <Icon name="globe" />
                </span>
                <span className="oc-row-text">
                  <b>A table</b>
                  <small>2 to 8 players</small>
                </span>
                <Icon name="chevronRight" />
              </Link>
            </li>
            <li>
              <Link to={AT.ochoTeams} className="oc-way">
                <span className="go-key blue" aria-hidden="true">
                  <Icon name="users" />
                </span>
                <span className="oc-row-text">
                  <b>Teams</b>
                  <small>2v2</small>
                </span>
                <Icon name="chevronRight" />
              </Link>
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
