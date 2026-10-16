/* Ocho's pages: sit down, the table waiting for its players, the table, the match score between
   hands, the match won, and how to play. They are drawn in design/ocho.pen (frames 01–22).

   Ocho runs on its own server (docs/ocho-protocol.md). These pages send intents and draw the lobby
   and the per-seat view it pushes: which cards may be played, whose turn it is, who went out and
   what everybody scored are the server's to say. The legal cards light up only because the view
   lists them; the server checks every play again. Another seat's hand is never here: a seat shows
   its count, and a card only when the server sent it (X-Ray, or a partner's hand in 2v2).

   Player names are text React escapes. Nothing a player typed is put into a class, a style or an
   address. */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import { Link, useTitle } from '../gameon/Frame';
import type { Who } from '../gameon/Frame';
import { Icon } from '../gameon/icons';
import { initialOf } from '../online/parts';
import { AT } from '../router/addresses';
import {
  CardBack,
  CardFace,
  cardName,
  COLOR_NAME,
  cornerOf,
  isWild,
  matchLine,
  matchWords,
  MiniCard,
  WheelSign,
} from './cards';
import type { OchoClient, OchoResult } from './client';
import { pileLayers, TableMotion } from './motion';
import type { Box } from './motion';
import { OchoSounds, winnersOf } from './sounds';
import { COLORS } from './wire';
import type { BotLevel, Card, Color, Intent, Lobby, View } from './wire';

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
    const r = await send({
      t: 'ocho.create',
      players: teams ? 4 : players,
      teams,
      match: to500 ? 'to500' : 'one',
    });
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

/** The bot skills, as Skull King words them. */
const LEVELS: [BotLevel, string, string][] = [
  ['easy', 'Easy', 'Makes mistakes'],
  ['normal', 'Normal', 'Solid play'],
  ['hard', 'Hard', 'Reads the table'],
];
const LEVEL_NAME: Record<BotLevel, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };

const settingsLine = (lobby: Lobby): string =>
  `${lobby.teams ? 'Teams' : 'Free-for-all'} · ${lobby.players} players · ${lobby.firstTo500 ? 'First to 500' : 'One hand'}`;

/** The small line under a member: Host, Bot, or Player, and the team when there are teams. */
function memberLine(lobby: Lobby, seat: number, user: string, bot: boolean): string {
  if (user === lobby.host) return 'Host';
  const team = lobby.teams ? (seat % 2 === 0 ? 'Team 1' : 'Team 2') : null;
  if (bot) return team ? `Bot · ${team}` : 'Bot';
  return team ?? 'Player';
}

function Waiting({ ocho, lobby, meId }: { ocho: OchoClient; lobby: Lobby; meId: string | null }) {
  const title = useTitle('GameOn · Ocho · Your table');
  const { busy, error, send } = useSender(ocho);
  const host = lobby.host === meId;
  const mine = lobby.members.find((m) => m.user === meId);
  const missing = lobby.players - lobby.members.length;
  const allReady = missing === 0 && lobby.members.every((m) => m.ready);
  const empty = Array.from({ length: Math.max(0, missing) }, (_, i) => i);
  // Until the host picks one, the first bot plays Normal: the server says so (docs/ocho-protocol.md).
  const level = lobby.bots ?? 'normal';
  const hasBots = lobby.members.some((m) => m.bot);
  return (
    <div className="oc-page">
      <BackHeader />
      <main className="oc-sit oc-wait">
        <section className="oc-panel" aria-labelledby="oc-wait-title">
          <div className="oc-wait-head">
            <h1 id="oc-wait-title" tabIndex={-1} ref={title}>
              Ocho
            </h1>
            <p className="oc-muted">{settingsLine(lobby)}</p>
          </div>
          <div className="oc-field">
            <h2 className="oc-label" id="oc-players">
              Players · {lobby.members.length} of {lobby.players}
            </h2>
            <ul className="oc-rows" aria-labelledby="oc-players">
              {lobby.members.map((m, seat) => (
                <li key={m.bot ? `bot-${seat}` : m.user} className="oc-row">
                  <span className={`avatar oc-tone-${toneOf(seat)}`} aria-hidden="true">
                    {initialOf(m.name)}
                  </span>
                  <span className="oc-row-text">
                    <b>{m.user === meId ? 'You' : m.name}</b>
                    <small>{memberLine(lobby, seat, m.user, m.bot)}</small>
                  </span>
                  {!m.bot ? (
                    <span className={m.ready ? 'pill green' : 'pill soft'}>{m.ready ? 'Ready' : 'Not ready'}</span>
                  ) : (
                    host && (
                      <button
                        type="button"
                        className="icon-btn oc-remove"
                        aria-label={`Remove ${m.name}`}
                        disabled={busy}
                        onClick={() => void send({ t: 'ocho.removeBot', index: seat })}
                      >
                        <Icon name="x" />
                      </button>
                    )
                  )}
                </li>
              ))}
              {empty.map((i) => (
                <li key={`open-${i}`} className="oc-row oc-empty">
                  <span className="avatar empty" aria-hidden="true"></span>
                  <span className="oc-row-text">
                    <b>Open seat</b>
                  </span>
                </li>
              ))}
            </ul>
            {host && missing > 0 && (
              <button
                type="button"
                className="btn ghost"
                disabled={busy}
                onClick={() => void send({ t: 'ocho.addBot' })}
              >
                Add a bot
              </button>
            )}
            {host && missing > 0 && <p className="oc-muted">Add a bot, or give them the code.</p>}
          </div>
        </section>
        <section className="oc-panel oc-wait-side" aria-label="The table">
          <div className="oc-code">
            <h2 className="oc-label">Table code</h2>
            <b className="oc-code-value">{lobby.code}</b>
            <p className="oc-muted">Give this code to the others. They join from Ocho&rsquo;s sit-down page.</p>
          </div>
          {host ? (
            <div className="oc-field">
              <h2 className="oc-label" id="oc-skill">
                Bot skill
              </h2>
              <div className="oc-choices oc-levels" role="group" aria-labelledby="oc-skill">
                {LEVELS.map(([value, label, sub]) => (
                  <ChoiceButton
                    key={value}
                    label={label}
                    sub={sub}
                    on={level === value}
                    onPick={() => {
                      // The same skill again would only mark everyone not ready.
                      if (value !== level) void send({ t: 'ocho.bots', bots: value });
                    }}
                  />
                ))}
              </div>
            </div>
          ) : (
            hasBots && (
              <div className="oc-field">
                <h2 className="oc-label">Bot skill</h2>
                <p className="oc-skill-text">
                  <b>{LEVEL_NAME[level]}</b> · {LEVELS.find(([v]) => v === level)?.[2]}
                </p>
              </div>
            )
          )}
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
    <li className={turn ? 'oc-seat oc-turn' : 'oc-seat'} data-slot={slot} data-seat={seat}>
      <span className={`avatar oc-tone-${toneOf(seat)}`} aria-hidden="true">
        {initialOf(name)}
      </span>
      <b className="oc-seat-name">{name}</b>
      <span className="oc-count">
        <CardBack size="sm" />
        <span data-n={count}>
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

/** The draw pile: a stack of backs as thick as the pile is tall. */
function DrawPile({ count }: { count: number }) {
  const layers = pileLayers(count);
  const lift = (i: number): string => `${-i}px ${-2 * i}px`;
  return (
    <span className="oc-stack-pile" data-oc="draw">
      {Array.from({ length: Math.max(0, layers - 1) }, (_, i) => (
        <span key={i} className="oc-layer" style={{ translate: lift(i) }} aria-hidden="true"></span>
      ))}
      {layers > 0 ? (
        <span className="oc-pile-top" style={{ translate: lift(layers - 1) }}>
          <CardBack size="lg" />
        </span>
      ) : (
        <span className="oc-pile-empty" aria-hidden="true"></span>
      )}
    </span>
  );
}

/** The pile is the control when taking from it is the move: a tap draws one, or takes the stack. */
type PileTap = { label: string; busy: boolean; onTap: () => void } | null;

function Centre({ view, top, tap }: { view: View; top: Card; tap: PileTap }) {
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
        <figure className={tap ? 'oc-pile oc-pile-tap' : 'oc-pile'}>
          {tap ? (
            <button
              type="button"
              className="oc-pile-btn"
              aria-label={tap.label}
              disabled={tap.busy}
              onClick={tap.onTap}
            >
              <DrawPile count={view.drawCount} />
            </button>
          ) : (
            <DrawPile count={view.drawCount} />
          )}
          <figcaption>{tap ? tap.label : `Draw · ${view.drawCount}`}</figcaption>
        </figure>
        <figure className="oc-pile">
          <span data-oc="discard">
            <CardFace card={top} size="lg" />
          </span>
          <figcaption>
            Discard<span className="oc-sr">: {cardName(top)}</span>
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

/** The wild itself, grown large: the face of `CardFace`, and the four quarters of its wheel are the
    buttons, in the order they are read out: red, blue, green, yellow. The black middle is not a
    colour. A click on the dimmed table, or Escape, puts the card back. */
function Namer({
  card,
  busy,
  onPick,
  onBack,
  cardRef,
  dimRef,
}: {
  card: Card;
  busy: boolean;
  onPick: (c: Color) => void;
  onBack: () => void;
  cardRef: RefObject<HTMLDivElement | null>;
  dimRef: RefObject<HTMLSpanElement | null>;
}) {
  const first = useRef<HTMLButtonElement>(null);
  const back = useRef(onBack);
  back.current = onBack;
  // The card takes the keyboard while it is large; Escape puts it back.
  useEffect(() => {
    first.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') back.current();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);
  return (
    <div className="oc-namer">
      <span ref={dimRef} className="oc-namer-dim" aria-hidden="true" onClick={onBack}></span>
      <div ref={cardRef} className="oc-card black oc-namer-card">
        <small className="oc-corner" aria-hidden="true">
          {cornerOf(card.kind)}
        </small>
        <span className="oc-mid">
          <span className="oc-wheel oc-namer-wheel">
            <span className="oc-namer-slices" role="group" aria-label="Name a color">
              {COLORS.map((c) => (
                <button
                  key={c}
                  ref={c === 'red' ? first : undefined}
                  type="button"
                  className={`oc-slice ${c}`}
                  aria-label={COLOR_NAME[c]}
                  disabled={busy}
                  onClick={() => onPick(c)}
                ></button>
              ))}
            </span>
            <span className="oc-namer-hub" aria-hidden="true">
              <WheelSign kind={card.kind} />
            </span>
          </span>
        </span>
      </div>
    </div>
  );
}

/** Where a card of the hand leans in the fan: a shallow arc, steeper the fewer cards there are. */
function fanOf(i: number, n: number): CSSProperties {
  const k = i - (n - 1) / 2;
  const step = Math.min(3, 30 / Math.max(n, 1));
  return { rotate: `${k * step}deg`, translate: `0 ${Math.round(k * k * step * 0.35)}px` };
}

function Table({
  ocho,
  view,
  nameOf,
  sounds,
}: {
  ocho: OchoClient;
  view: View;
  nameOf: (seat: number) => string;
  sounds: OchoSounds;
}) {
  const title = useTitle('GameOn · Ocho · Table');
  const [menu, setMenu] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [wild, setWild] = useState<number | null>(null);
  /** A wild sent with its colour: it has left the hand, and stays out until the view comes back. */
  const [sent, setSent] = useState<number | null>(null);
  /** The card just chosen. It is the discard until the server's view says the same. */
  const [pending, setPending] = useState<Card | null>(null);
  /** The opening card was put back small; the action line can make it large again. */
  const [shut, setShut] = useState(false);
  const { busy, error, send } = useSender(ocho);
  const legal = new Set(view.legal);
  const mine = view.must !== 'none';
  const drawn = view.must === 'playDrawnOrKeep' ? (view.hand.find((c) => legal.has(c.id)) ?? null) : null;
  // The card just drawn starts lifted: one tap plays it.
  const lifted = picked ?? drawn?.id ?? null;
  const selected = mine ? (view.hand.find((c) => c.id === lifted && legal.has(c.id)) ?? null) : null;
  const words = matchWords(view.color, view.symbol);
  const seats = others(view);
  const slots = SLOTS[seats.length] ?? [];
  const partner = partnerOf(view);

  const page = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const namerCard = useRef<HTMLDivElement>(null);
  const namerDim = useRef<HTMLSpanElement>(null);
  const motion = useRef<TableMotion | null>(null);
  /** The card just played and where it sat in the hand: it flies from there once it is the discard. */
  const launched = useRef<{ id: number; box: Box | null } | null>(null);
  const settle = useRef<{ selector: string; box: Box } | null>(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  // A new view is a new moment: what was picked for the last one is not picked for this one.
  useEffect(() => {
    setPicked(null);
    setWild(null);
    setSent(null);
    setShut(false);
    setPending(null);
  }, [view]);

  useLayoutEffect(() => {
    if (!page.current || !layer.current) return;
    const m = new TableMotion(page.current, layer.current);
    motion.current = m;
    return () => {
      m.stop();
      motion.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    const held = pendingRef.current;
    if (held && view.top.id === held.id) motion.current?.acceptPlayed(view.top);
    motion.current?.view(view);
  }, [view]);
  useLayoutEffect(() => {
    const l = launched.current;
    if (!pending || l?.id !== pending.id) return;
    launched.current = null;
    motion.current?.playFrom(l.box);
  }, [pending]);

  const naming = wild != null ? (view.hand.find((c) => c.id === wild) ?? null) : null;
  const opening = view.must === 'chooseColor' && !shut && !busy;
  const namerCardOf = naming ?? (opening ? view.top : null);
  const namerKey = naming ? `hand-${naming.id}` : opening ? `top-${view.top.id}-${view.handNo}` : null;
  useLayoutEffect(() => {
    if (!namerKey || !motion.current) return;
    const from =
      wild != null
        ? motion.current.handBox(wild)
        : motion.current.box(page.current?.querySelector('[data-oc="discard"]') ?? null);
    motion.current.grow(namerCard.current, namerDim.current, from);
    // Only a new card grows: the key says which.
  }, [namerKey]);
  useLayoutEffect(() => {
    const s = settle.current;
    settle.current = null;
    if (s && motion.current) motion.current.settle(page.current?.querySelector<HTMLElement>(s.selector) ?? null, s.box);
  });
  useLayoutEffect(() => {
    motion.current?.remember();
  });

  const namerBox = (): Box | null => motion.current?.box(namerCard.current) ?? null;
  const putBack = (): void => {
    const box = namerBox();
    if (wild != null) {
      if (box) settle.current = { selector: `[data-card="${wild}"] .oc-card`, box };
      const id = wild;
      setWild(null);
      // The card goes back into the hand, and so does the keyboard.
      requestAnimationFrame(() => page.current?.querySelector<HTMLElement>(`[data-card="${id}"] button`)?.focus());
    } else {
      if (box) settle.current = { selector: '[data-oc="discard"] .oc-card', box };
      setShut(true);
    }
  };
  const name = (color: Color): void => {
    const box = namerBox();
    if (wild != null) {
      const card = wild;
      launched.current = { id: card, box: motion.current?.handBox(card) ?? null };
      const chosen = view.hand.find((c) => c.id === card);
      if (chosen) {
        setPending(chosen);
        sounds.played(chosen, view.you);
      }
      setSent(card);
      setWild(null);
      void send({ t: 'ocho.play', card, color }).then((r) => {
        if (!r.ok) {
          launched.current = null;
          motion.current?.stop();
          setSent(null);
          setPending(null);
          sounds.refused();
        }
      });
    } else {
      if (box) settle.current = { selector: '[data-oc="discard"] .oc-card', box };
      setShut(true);
      void send({ t: 'ocho.color', color }).then((r) => {
        if (!r.ok) setShut(false);
      });
    }
  };

  const play = (card: Card): void => {
    if (isWild(card)) setWild(card.id);
    else {
      launched.current = { id: card.id, box: motion.current?.handBox(card.id) ?? null };
      setPending(card);
      sounds.played(card, view.you);
      void send({ t: 'ocho.play', card: card.id }).then((r) => {
        if (!r.ok) {
          launched.current = null;
          motion.current?.stop();
          setPending(null);
          sounds.refused();
        }
      });
    }
  };
  /** A tap on a card in the hand: the first lifts it, a tap on the lifted one plays it. */
  const tapCard = (card: Card): void => {
    if (card.id === selected?.id) play(card);
    else setPicked(card.id);
  };
  const draw = (): void => {
    sounds.tap();
    void send({ t: 'ocho.draw' });
  };
  const take = view.stack ?? 0;

  let status: string;
  let actions: ReactNode = null;
  let pile: PileTap = null;
  switch (view.must) {
    case 'playOrDraw':
      status = selected
        ? `Match ${words} · tap ${cardName(selected)} again to play`
        : legal.size > 0
          ? `Match ${words} · tap a card`
          : `Nothing in your hand matches ${words} · tap the pile to draw`;
      if (legal.size === 0) pile = { label: 'Draw one', busy, onTap: draw };
      break;
    case 'playDrawnOrKeep':
      status = drawn ? `You drew ${cardName(drawn)} · tap it to play, or keep it` : 'You drew a card';
      actions = (
        <button type="button" className="btn ghost" disabled={busy} onClick={() => void send({ t: 'ocho.keep' })}>
          Keep
        </button>
      );
      break;
    case 'answerStack':
      status = selected
        ? `Tap ${cardName(selected)} again to play · or tap the pile to take ${take}`
        : legal.size > 0
          ? `Play Draw 2, Wild Draw 4 or Shield · or tap the pile to take ${take}`
          : `Nothing in your hand answers · tap the pile to take ${take}`;
      pile = { label: `Take ${take}`, busy, onTap: draw };
      break;
    case 'chooseColor':
      status = `Opening card: ${cardName(view.top)} · name the color`;
      if (shut)
        actions = (
          <button type="button" className="btn" disabled={busy} onClick={() => setShut(false)}>
            Name the color
          </button>
        );
      break;
    default:
      status =
        view.phase === 'chooseColor' ? `${nameOf(view.turn)} names the opening color` : `${nameOf(view.turn)} to play`;
  }
  if (naming) status = `You played ${cardName(naming)} · name the next color`;
  if (naming) actions = null;

  return (
    <div ref={page} className="oc-page oc-table-page">
      <TopBar hand={view.handNo} menu={menu} onMenu={() => setMenu((m) => !m)} />
      <main className="oc-table">
        <h1 className="oc-sr" tabIndex={-1} ref={title}>
          Ocho · Hand {view.handNo}
        </h1>
        <div className="oc-felt">
          <ul className="oc-seats" aria-label="The table">
            {seats.map((seat, i) => (
              <Seat key={seat} view={view} seat={seat} name={nameOf(seat)} slot={slots[i] ?? 't2'} />
            ))}
          </ul>
          <Centre view={view} top={pending ?? view.top} tap={naming ? null : pile} />
          {namerCardOf && (
            <Namer
              key={namerKey}
              card={namerCardOf}
              busy={busy}
              onPick={name}
              onBack={putBack}
              cardRef={namerCard}
              dimRef={namerDim}
            />
          )}
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
        <div className="oc-play">
          <ul className="oc-hand" aria-label="Your hand">
            {view.hand.map((card, i) => {
              const can = mine && legal.has(card.id);
              const on = selected?.id === card.id;
              const away = card.id === wild || card.id === sent || card.id === pending?.id;
              return (
                <li
                  key={card.id}
                  data-card={card.id}
                  style={fanOf(i, view.hand.length)}
                  className={away ? 'oc-away' : undefined}
                >
                  <button
                    type="button"
                    className={`oc-hand-card${can ? ' oc-can' : ''}${on ? ' oc-on' : ''}${mine && !legal.has(card.id) ? ' oc-dim' : ''}`}
                    aria-label={cardName(card)}
                    aria-pressed={can ? on : undefined}
                    disabled={!can || busy}
                    onClick={() => tapCard(card)}
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
            {actions && (
              <div key={view.must} className="oc-buttons">
                {actions}
              </div>
            )}
          </div>
        </div>
      </main>
      <div ref={layer} className="oc-fx" aria-hidden="true"></div>
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

/** The seats by the server's totals, highest first. */
const ranked = (view: View): { seat: number; score: number }[] =>
  view.scores.map((score, seat) => ({ seat, score })).sort((a, b) => b.score - a.score || a.seat - b.seat);

/** Who went out and what that hand was worth, and the match's target: the line under the heading. */
function HandLine({ view, nameOf }: { view: View; nameOf: (seat: number) => string }) {
  const out = view.handWinner;
  return (
    <div className="oc-score-meta">
      {out != null && (
        <p className="oc-muted">
          {nameOf(out)} went out · {view.handPoints?.[out] ?? 0} this hand
        </p>
      )}
      {view.target != null && <span className="pill gold">First to {view.target}</span>}
    </div>
  );
}

/** Between hands: the totals so far, and the next deal. */
function Score({
  ocho,
  view,
  nameOf,
  sounds,
}: {
  ocho: OchoClient;
  view: View;
  nameOf: (seat: number) => string;
  sounds: OchoSounds;
}) {
  const title = useTitle('GameOn · Ocho · Match score');
  const { busy, error, send } = useSender(ocho);
  const out = view.handWinner;
  const gained = out != null ? (view.handPoints?.[out] ?? 0) : 0;
  const [menu, setMenu] = useState(false);
  return (
    <div className="oc-page">
      <TopBar hand={view.handNo} menu={menu} onMenu={() => setMenu((m) => !m)} />
      <main className="oc-score">
        <div className="oc-score-head">
          <h1 tabIndex={-1} ref={title}>
            Match score
          </h1>
          <HandLine view={view} nameOf={nameOf} />
        </div>
        <ol className="oc-rows oc-score-rows" aria-label="Match score">
          {ranked(view).map(({ seat, score }, i) => (
            <li key={seat} className={i === 0 ? 'oc-row oc-lead' : 'oc-row'}>
              <span className={`avatar oc-tone-${toneOf(seat)}`} aria-hidden="true">
                {initialOf(nameOf(seat))}
              </span>
              <span className="oc-row-text">
                <b>{nameOf(seat)}</b>
                <small>{seat === out ? `Went out · +${gained} this hand` : `${ordinal(i + 1)} place`}</small>
              </span>
              {i === 0 && <span className="pill gold">Leader</span>}
              <b className="oc-total">{score}</b>
            </li>
          ))}
        </ol>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        <div className="oc-score-actions">
          {view.must === 'nextHand' ? (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => {
                sounds.tap();
                void send({ t: 'ocho.next' });
              }}
            >
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

/** The match is over: who won it is the page, with every total under it. */
function Won({
  view,
  nameOf,
  teams,
  onHome,
}: {
  view: View;
  nameOf: (seat: number) => string;
  /** 2v2: the match is won by both partners. */
  teams: boolean;
  onHome: () => void;
}) {
  const winners = winnersOf(view, teams);
  const heading =
    winners.length === 0
      ? 'The match is over'
      : `${winners.map(nameOf).join(' and ')} ${winners.length === 1 && winners[0] !== view.you ? 'wins' : 'win'} the match`;
  const title = useTitle('GameOn · Ocho · Match won');
  const [menu, setMenu] = useState(false);
  return (
    <div className="oc-page oc-won-page">
      <TopBar hand={view.handNo} menu={menu} onMenu={() => setMenu((m) => !m)} />
      <main className="oc-won">
        <div className="oc-won-head">
          <h1 tabIndex={-1} ref={title}>
            {heading}
          </h1>
          <HandLine view={view} nameOf={nameOf} />
        </div>
        <ol className="oc-rows oc-won-rows" aria-label="Match score">
          {ranked(view).map(({ seat, score }, i) => {
            const won = winners.includes(seat);
            return (
              <li key={seat} className={won ? 'oc-row oc-lead oc-won-row' : 'oc-row'}>
                <span className={`avatar oc-tone-${toneOf(seat)}`} aria-hidden="true">
                  {initialOf(nameOf(seat))}
                </span>
                <span className="oc-row-text">
                  <b>{nameOf(seat)}</b>
                  <small>{ordinal(i + 1)} place</small>
                </span>
                {won && <span className="pill gold">Winner</span>}
                <b className="oc-total">{score}</b>
              </li>
            );
          })}
        </ol>
        <button type="button" className="btn blue oc-won-home" onClick={onHome}>
          Back to games
        </button>
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
  const [sounds] = useState(() => new OchoSounds());

  // The socket needs the session the frame has made sure of.
  useEffect(() => {
    if (player) ocho.open();
  }, [ocho, player]);

  const { lobby, view } = state;
  const twos = lobby?.teams ?? view?.partnerHand != null;
  // Every view the server pushes sounds once, whichever page draws it.
  useEffect(() => {
    if (view) sounds.view(view, twos);
    else sounds.reset();
  }, [sounds, view, twos]);

  const nameOf = (seat: number): string =>
    view && seat === view.you ? 'You' : (lobby?.members[seat]?.name ?? `Seat ${seat + 1}`);

  if (view) {
    if (view.phase === 'over')
      return (
        <Won
          view={view}
          nameOf={nameOf}
          teams={twos}
          onHome={() => {
            sounds.tap();
            // The match is over: the seat is given up, and the page forgets the table.
            void ocho.send({ t: 'ocho.leave' });
            ocho.forget();
            go(AT.games);
          }}
        />
      );
    if (view.phase === 'between') return <Score ocho={ocho} view={view} nameOf={nameOf} sounds={sounds} />;
    return <Table ocho={ocho} view={view} nameOf={nameOf} sounds={sounds} />;
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
