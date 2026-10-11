/* Views: every screen and sheet of the offline game as an HTML string built from the state.
   Ported from the legacy build (legacy/Skull King Tavern.html, section 10) without changing behavior:
   same markup, same class names, same copy. Every name a player typed goes through esc().
   The scorekeeper's own screens are in tracker.ts. */
import { Rules } from '../game';
import type { GameState, Score, ScoreConfig, ScoreRecord, TableView } from '../game';
import { clamp, fill } from '../game/util';
import type { AbilityUsed, Card, CardId, GameResult, RatingChange, Seat } from '../protocol/generated';
import { avatar, cardBack, cardHTML, ICON, mascot } from './art';
import type { FaceCard } from './art';
import { esc, initial, sgn, toneOf, whole } from './dom';
import {
  COLORS,
  handHidden,
  isPassAndPlay,
  localSeatsOf,
  prefs,
  savePrefs,
  scoreView,
  session,
  stats,
  tableView,
  ui,
} from './state';
import type { ScoreView } from './state';
import { Store } from './store';

/** A seat's score in a round whose bids and tricks are all in: a finished one, or one the scorekeeper has checked. */
export function scored(cfg: ScoreConfig, R: ScoreRecord, i: Seat): Score {
  const s = Rules.scoreSeat(cfg, R, i);
  if (!s) throw new Error('This round has no score yet');
  return s;
}

function statsView(): string {
  if (!stats.games) return '';
  const acc = stats.bids ? Math.round((stats.made / stats.bids) * 100) : 0;
  return `<div class="stats" aria-label="Your stats">
    <div class="stat hot"><b>${ICON.flame}${stats.streak}</b><small>Day streak</small></div>
    <div class="stat"><b>${stats.games}</b><small>Games</small></div>
    <div class="stat"><b>${stats.wins}</b><small>Wins</small></div>
    <div class="stat"><b>${acc}%</b><small>Bids made</small></div></div>`;
}
/** One screen, no scrolling: the hero flexes to fill (and shrinks on short phones); the actions keep their size. */
export function homeView(): string {
  const saved = Store.loadGame(),
    live = saved != null && saved.phase !== 'gameOver';
  const fanCards: FaceCard[] = [
    { kind: 'sk' },
    { kind: 'mermaid' },
    { kind: 'num', suit: 'black', rank: 14 },
    { kind: 'pirate' },
    { kind: 'num', suit: 'yellow', rank: 14 },
  ];
  return `<div class="home">
    <div class="home-top">
      <button class="info-pill ${ui.pillIntro ? 'intro' : ''}" data-act="rules" aria-label="How to play"><span class="ic">${ICON.info}</span><span class="txt">How to play</span></button>
      <button class="icon-btn" data-act="soundSheet" aria-label="Sound settings">${prefs.muted ? ICON.mute : ICON.sound}</button></div>
    <div class="hero">${mascot('wink')}
      <div class="logo">Skull <span>King</span></div>
      <p class="muted tagline">The pirate trick-taking game · bots or friends on one phone</p>
      <div class="fan" aria-hidden="true">${fanCards.map((c, k) => `<div style="--r:${(k - 2) * 8}deg;--y:${Math.abs(k - 2) * 4}px">${cardHTML(c)}</div>`).join('')}</div>
    </div>
    <div class="home-actions stagger">
      ${statsView()}
      ${live ? swipeContinue(saved) : ''}
      <div class="play-row"><button class="btn ${live ? 'ghost' : ''}" data-act="setup">${live ? 'New game' : 'Play'}</button><button class="btn blue" data-act="online">Play online</button></div>
      ${trackerEntry()}
    </div>
    ${ui.undo ? `<div class="undo-bar" role="status"><span>${ui.undo.kind === 'track' ? 'Scoresheet deleted' : 'Game cancelled'}</span><button data-act="undoCancel">Undo</button></div>` : ''}
    </div>`;
}
/** Continue button that swipes left to reveal a red cancel button. --p (0 closed .. 1 open) drives every part of the animation. */
/** A row that swipes left to reveal a red delete button. --p (0 closed .. 1 open) drives every part of the animation.
    id names the row so only one can be open at a time. */
function swipeRow(id: string, front: string, { label, hint }: { label: string; hint?: boolean }): string {
  const open = ui.swipeOpen === id;
  return `<div class="swipe swipe-${id} ${open ? 'open' : ''} ${hint && !open ? 'hint' : ''}" data-swipe="${id}" style="--p:${open ? 1 : 0}">
    <button class="swipe-del" data-act="swipeDelete" data-swipe="${id}" aria-label="${label}" tabindex="${open ? 0 : -1}">${ICON.x}</button>
    ${front.replace('class="', 'class="swipe-front ').replace('>', ` aria-describedby="tip-${id}">`)}
    <span id="tip-${id}" hidden>Swipe left or press the left arrow key to ${label.toLowerCase()}.</span></div>`;
}
function swipeContinue(saved: GameState): string {
  const hint = !prefs.swipeHinted && ui.swipeOpen !== 'game';
  if (hint) {
    prefs.swipeHinted = true;
    savePrefs();
  }
  return swipeRow(
    'game',
    `<button class="btn" data-act="resume">Continue · Round ${saved.round + 1} of ${saved.schedule.length}</button>`,
    { label: 'Cancel this game', hint },
  );
}
function trackerEntry(): string {
  const trk = session.trk,
    live = trk != null && !trk.finished;
  const front = `<button class="alt ${ui.just === 'trackReset' ? 'pop' : ''}" data-act="track"><span class="alt-ic">${ICON.pencil}</span>
      <span class="grow"><b>${live ? 'Continue scoring' : 'Score a real game'}</b><small>${live ? `Round ${trk.cur + 1} of ${trk.schedule.length} · ${trk.seats.length} players` : 'Playing with physical cards? Track bids, tricks and bonuses.'}</small></span>
      <span class="chev" aria-hidden="true">›</span></button>`;
  return `<div class="alt-wrap"><span class="label alt-label">At a real table</span>${live ? swipeRow('track', front, { label: 'Delete this scoresheet' }) : front}</div>`;
}

export function setupView(): string {
  const crew = prefs.crew,
    n = crew.length,
    humans = crew.filter((c) => !c.bot).length;
  const max = Math.floor(Rules.buildDeck(prefs).length / n);
  const capped = Rules.FORMATS[prefs.format].seq.some((c) => c > max);
  const tg = (k: 'abilities' | 'loot' | 'kraken' | 'whale', t: string, d: string): string =>
    `<button class="toggle" data-act="tog" data-k="${k}" aria-pressed="${!!prefs[k]}"><span class="grow">${t}<small>${d}</small></span><span class="switch"></span></button>`;
  const rows = crew
    .map(
      (c, i) => `<div class="crew-row ${ui.just === 'add' && i === n - 1 ? 'pop' : ''}">
    <span class="avatar sm" style="background:${COLORS[i]}">${initial(c.name || (c.bot ? 'B' : 'Y'))}</span>
    <input class="name" id="crew-${i}" data-crew="${i}" maxlength="14" value="${esc(c.name)}" placeholder="${c.bot ? 'Bot' : 'Player ' + (i + 1)}" autocomplete="off" aria-label="Name of pirate ${i + 1}">
    <span class="mini-seg" role="group" aria-label="Who plays seat ${i + 1}">
      <button data-act="crewKind" data-i="${i}" data-v="human" aria-pressed="${!c.bot}">Human</button>
      <button data-act="crewKind" data-i="${i}" data-v="bot" aria-pressed="${c.bot}">Bot</button></span>
    ${n > 3 ? `<button class="icon-btn" data-act="crewRm" data-i="${i}" aria-label="Remove pirate ${i + 1}">${ICON.x}</button>` : ''}
  </div>`,
    )
    .join('');
  return `<div class="wrap">
    <div class="row" style="padding-block:10px"><button class="icon-btn" data-act="home" aria-label="Back">${ICON.back}</button><h2 class="grow">New game</h2></div>
    <div class="stack stagger" style="gap:22px">
      <section class="stack"><span class="label">Crew · ${n} pirates</span>${rows}
        ${n < 8 ? `<button class="btn ghost" data-act="crewAdd">Add pirate</button>` : ''}
        <p class="muted" style="font-size:14px">${humans > 1 ? `Pass-and-play: ${humans} people share this device. Each hand stays hidden until it's that person's move.` : humans === 1 ? 'Turn order follows this list.' : 'Make at least one seat Human.'}</p>
      </section>
      <section class="stack"><span class="label">Bot skill</span>
        <div class="seg">${[
          ['easy', 'Easy', 'Makes mistakes'],
          ['normal', 'Normal', 'Solid play'],
          ['hard', 'Hard', 'Counts cards'],
        ]
          .map(
            ([k, t, d]) =>
              `<button class="${ui.just === 'level' + k ? 'just' : ''}" data-act="level" data-v="${k}" aria-pressed="${prefs.level === k}">${t}<small>${d}</small></button>`,
          )
          .join('')}</div>
      </section>
      <section class="stack"><span class="label">Scoring</span>
        <div class="seg">
          <button data-act="scoring" data-v="classic" aria-pressed="${prefs.scoring === 'classic'}">Skull King's<small>Classic, high risk</small></button>
          <button data-act="scoring" data-v="rascal" aria-pressed="${prefs.scoring === 'rascal'}">Rascal's<small>10 per card dealt</small></button>
        </div></section>
      <section class="stack"><span class="label">Rounds</span>
        ${Object.entries(Rules.FORMATS)
          .map(
            ([k, f]) =>
              `<div class="seg"><button data-act="format" data-v="${k}" aria-pressed="${prefs.format === k}" style="text-align:left;padding:10px 12px">${f.name}<small>${f.desc}</small><span class="fmt">${f.seq.map((c) => `<i>${c}</i>`).join('')}</span></button></div>`,
          )
          .join('')}
        ${capped ? `<p class="muted" style="font-size:14px">With ${n} pirates each hand tops out at ${max} cards.</p>` : ''}
      </section>
      <section class="stack"><span class="label">Advanced rules</span>
        ${tg('abilities', 'Pirate abilities', 'Win a trick with a Pirate to use its power: Helmsman, Smuggler, Gambler, Seer or Giant.')}
        ${tg('loot', 'Loot cards', 'Win a Loot to form an alliance: +20 each if both make their bids.')}
        ${tg('kraken', 'Kraken', 'Swallows the trick. Nobody wins it.')}
        ${tg('whale', 'White Whale', 'Special cards stop counting; the highest number wins.')}
      </section>
    </div></div>
  <div class="footbar"><div><button class="btn" data-act="start" ${humans ? '' : 'disabled'}>Set sail</button></div></div>`;
}

/* --- game table --- */
function pips(b: number | null, w: number): string {
  if (b == null || b < 0) return '';
  const m = Math.max(b, w);
  let dots = '';
  if (b === 0 && w === 0) dots = '<i class="zero"></i>';
  else if (m <= 6) for (let k = 0; k < m; k++) dots += `<i class="${k < w ? (k < b ? 'ok' : 'over') : ''}"></i>`;
  return `<span class="bidline ${ui.reveal ? 'pop' : ''}"><span class="pips">${dots}</span><b class="num">${w}/${b}</b></span>`;
}
/** How long the ring's last stretch is: from here on it is red. */
const HURRY_MS = 5000;
/**
 * Online: the clock of a seat the table is waiting on, as a ring around its avatar that empties
 * until the deadline. The page only shows it. When it is empty the server plays for the seat.
 * The ring runs as a CSS animation from what is left right now, so nothing has to redraw it.
 */
function deadlineRing(v: TableView, seat: Seat): string {
  const d = v.online?.deadline;
  if (!d || !session.online || !d.seats.includes(seat)) return '';
  const left = Math.max(0, Math.round(d.at - session.online.now())),
    gone = 100 * (1 - Math.min(1, left / d.total));
  return `<svg class="ring" viewBox="0 0 50 50" aria-hidden="true" style="--gone:${gone.toFixed(1)};--left:${left}ms;--calm:${Math.max(0, left - HURRY_MS)}ms;--ticks:${Math.max(1, Math.ceil(left / 1000))}"><circle class="ring-track" cx="25" cy="25" r="23"/><circle class="ring-left${left <= HURRY_MS ? ' hurry' : ''}" cx="25" cy="25" r="23" pathLength="100"/></svg>`;
}
/** Online: where the player of another seat is, when they are not simply there. */
function presenceTag(v: TableView, seat: Seat): string {
  const status = v.online?.status[seat];
  if (status === 'offline') return '<span class="presence off">Offline</span>';
  if (status === 'away') return '<span class="presence away">Away</span>';
  // `bot` on a seat that started as a person: a bot took it over.
  if (status === 'bot' && !v.seats[seat].bot) return '<span class="presence bot">Bot</span>';
  return '';
}
function seatBid(v: TableView, i: Seat): string {
  if (v.phase === 'roundEnd' && v.online?.ready[i]) return '<span class="ready">Ready</span>';
  if (v.phase !== 'bidding') return pips(v.bids[i], v.won[i]);
  const b = v.bids[i];
  if (b == null) return '<span class="thinking" aria-label="Thinking"><i></i><i></i><i></i></span>';
  return `<span class="ready ${ui.just === 'bid' + i ? 'pop' : ''}">${i === v.me && !handHidden(v) ? 'Bid ' + b : 'Ready'}</span>`;
}
const who = (v: TableView, i: Seat): string => (i === v.me ? 'You' : esc(v.seats[i].name));
function statusText(v: TableView): string {
  switch (v.phase) {
    case 'bidding':
      return v.bids[v.me] == null && !handHidden(v)
        ? 'How many tricks will you win?'
        : `Waiting on ${v.bids.filter((b) => b == null).length} more`;
    case 'playing': {
      if (v.turn == null || v.turn === v.me) return 'Your turn';
      const status = v.online?.status[v.turn];
      return `${who(v, v.turn)} is ${status === 'offline' ? 'offline' : status === 'away' ? 'away' : 'thinking'}…`;
    }
    case 'trickEnd': {
      const r = v.lastTrick?.result;
      if (!r) return '';
      if (r.winner == null)
        return r.effect === 'kraken' ? 'The Kraken swallowed the trick' : 'The White Whale sank the trick';
      return `${who(v, r.winner)} ${r.winner === v.me ? 'take' : 'takes'} the trick`;
    }
    case 'ability': {
      const p = v.pending;
      if (!p) return '';
      const a = Rules.ABILITY[p.kind];
      return `${who(v, p.seat)} ${p.seat === v.me ? 'use' : 'uses'} the ${a.name}`;
    }
    case 'roundEnd':
      return 'Round over';
    default:
      return '';
  }
}
function bonusText(v: TableView): string {
  if (ui.toast) return `<span class="pill gold wrap pop">${esc(ui.toast)}</span>`;
  const lt = v.phase === 'trickEnd' ? v.lastTrick : null;
  if (!lt || lt.result.winner == null) return '';
  const r = lt.result,
    c = r.captures,
    b: string[] = [];
  if (c.sm) b.push('Mermaid caught the King +40');
  if (c.ps) b.push(`King took ${c.ps} pirate${c.ps > 1 ? 's' : ''} +${30 * c.ps}`);
  if (c.mp) b.push(`Pirate took ${c.mp} mermaid${c.mp > 1 ? 's' : ''} +${20 * c.mp}`);
  const f = 10 * c.b14 + (c.black14 ? 20 : 0);
  if (f) b.push(`14s +${f}`);
  if (r.loot.length) b.push('Loot alliance');
  if (lt.ability) b.push(`${Rules.ABILITY[lt.ability].name} power!`);
  return b.length ? `<span class="pill gold wrap pop" style="animation-delay:.2s">${b.join(' · ')}</span>` : '';
}
export function abilityToast(v: TableView, e: AbilityUsed): string | null {
  const name = e.seat === v.me ? 'You' : v.seats[e.seat].name;
  switch (e.kind) {
    case 'helm':
      return `${name} picked ${e.choice === v.me ? 'you' : v.seats[e.choice].name} to lead`;
    case 'smuggler':
      return `${name} swapped ${e.count} cards with the deck`;
    case 'gambler':
      return e.choice ? `${name} bet ${e.choice} on making the bid` : `${name} passed on the bet`;
    case 'seer':
      return `${name} peeked at the deck`;
    case 'giant':
      return e.choice ? `${name} changed the bid from ${e.from} to ${e.to}` : `${name} kept the bid at ${e.from}`;
  }
  return null;
}
function handMetrics(n: number): { cw: number; ov: number } {
  const W = Math.min(document.documentElement.clientWidth || 390, 560) - 28;
  const cw = clamp(Math.floor(W / 5.2), 52, 80);
  const ov = n > 1 ? Math.min(6, Math.floor((W - n * cw) / (n - 1))) : 0;
  return { cw, ov };
}
const KIND_ORDER: Record<Card['kind'], number> = {
  escape: 0,
  loot: 1,
  num: 2,
  mermaid: 3,
  pirate: 4,
  tigress: 5,
  sk: 6,
  kraken: 7,
  whale: 8,
};
function sortHand(hand: CardId[], deck: Card[]): CardId[] {
  return hand.slice().sort((a, b) => {
    const x = deck[a],
      y = deck[b];
    return (
      KIND_ORDER[x.kind] - KIND_ORDER[y.kind] ||
      (x.kind === 'num' && y.kind === 'num'
        ? Rules.SUITS.indexOf(x.suit) - Rules.SUITS.indexOf(y.suit) || x.rank - y.rank
        : a - b)
    );
  });
}
function abilityPanel(v: TableView): string {
  const p = v.pending;
  if (!p) return '';
  const a = Rules.ABILITY[p.kind];
  const head = `<p class="ask">${a.name}: ${a.desc}</p>`;
  switch (p.kind) {
    case 'helm':
      return (
        head +
        `<div class="seatpick">${v.seats.map((s, i) => `<button data-act="ability" data-v="${i}">${avatar(s, 'sm')}<span>${i === v.me ? 'You' : esc(s.name)}</span></button>`).join('')}</div>`
      );
    case 'smuggler': {
      const k = (p.drawn ?? []).length,
        picked = ui.discard.length;
      return `<p class="ask">Smuggler: you drew ${k} (gold edge). Tap ${k} cards to throw back.</p>
        <button class="btn ${picked === k ? 'wake' : ''}" data-act="ability" ${picked === k ? '' : 'disabled'}>${picked === k ? 'Discard these' : `Pick ${k - picked} more`}</button>`;
    }
    case 'gambler':
      return (
        head +
        `<div class="btns">${[0, 10, 20].map((w) => `<button class="btn ${w ? 'gold' : 'ghost'}" data-act="ability" data-v="${w}">${w ? 'Bet ' + w : 'No bet'}</button>`).join('')}</div>`
      );
    case 'seer':
      return head + `<button class="btn blue" data-act="peek">Look at the deck</button>`;
    case 'giant': {
      const b = v.bids[v.me] ?? 0,
        w = v.won[v.me];
      return `<p class="ask">Giant: you bid ${b} and won ${w}. Change your bid?</p><div class="btns">${[-1, 0, 1]
        .filter((d) => b + d >= 0 && b + d <= v.cards)
        .map(
          (d) =>
            `<button class="btn ${b + d === w ? '' : 'ghost'}" data-act="ability" data-v="${d}">${d ? `Bid ${b + d}` : `Keep ${b}`}</button>`,
        )
        .join('')}</div>`;
    }
  }
  return '';
}
/** How a bid reads to a screen reader. */
export const bidText = (bid: number): string => (bid === 1 ? '1 trick' : `${bid} tricks`);
/**
 * The bid, on a sheet that rises from the bottom edge under the hand: a slider from 0 to the cards
 * dealt, then the button that sends it. Nothing is picked until the slider is touched, so a bid of 0
 * is a choice like any other. The slider is drawn here and driven in events.ts. It is not a native
 * range input: the table is redrawn while a finger is on it (a bot bids), and a native drag would
 * end with its element. A deliberate difference from the legacy page, which had a row of chips.
 */
export function bidSheet(cards: number): string {
  const bid = ui.bidPick,
    set = bid != null,
    rise = ui.deal || ui.enter || ui.reveal,
    wake = ui.just != null && ui.just.startsWith('pick');
  const stops = Array.from(
    { length: cards + 1 },
    (_, k) => `<span class="${k === bid ? 'on' : ''}" style="--i:${k}">${k}</span>`,
  ).join('');
  return `<div class="bidsheet${rise ? ' rise' : ''}" role="group" aria-labelledby="bid-title">
      <h2 id="bid-title">Your bid</h2>
      <div class="bidslider${set ? ' set' : ''}" id="bid" role="slider" tabindex="0" aria-labelledby="bid-title" aria-valuemin="0" aria-valuemax="${cards}" aria-valuenow="${bid ?? 0}" aria-valuetext="${set ? bidText(bid) : 'No bid yet'}" style="--v:${bid ?? 0};--max:${cards}">
        <span class="bid-out num" aria-hidden="true">${set ? bid : 'Slide to set your bid'}</span>
        <span class="bid-track"><i class="bid-fill"></i><i class="bid-thumb"></i></span>
        <span class="bid-stops" aria-hidden="true">${stops}</span>
      </div>
      <button class="btn${wake ? ' wake' : ''}" data-act="bid"${set ? '' : ' disabled'}>${set ? 'Bid ' + bid : 'Choose your bid'}</button>
    </div>`;
}
/** Buttons only where a card can't do the job: bidding, abilities, the Tigress choice, round results.
    Cards are played straight from the hand: tap to lift, tap the same card again to play it. */
function actionsView(v: TableView): string {
  const me = v.me,
    hint = (t: string): string => `<p class="hint">${t}</p>`;
  if (v.phase === 'playing' || v.phase === 'trickEnd') {
    if (handHidden(v)) return hint('Hand hidden · pass-and-play');
    const c = ui.sel != null ? v.deck[ui.sel] : null,
      myTurn = v.phase === 'playing' && v.turn === me && !ui.waiting;
    if (myTurn && c && c.kind === 'tigress')
      return `<div class="btns"><button class="btn red ${ui.justSel ? 'wake' : ''}" data-act="play" data-as="pirate">Play as Pirate</button><button class="btn ghost" data-act="play" data-as="escape">Play as Escape</button></div>`;
    if (myTurn)
      return hint(
        c ? `Tap <b>${esc(Rules.cardName(c, v.cfg))}</b> again to play it` : 'Your turn · tap a card to pick it',
      );
    return hint(c ? 'Lined up · tap it again on your turn' : '');
  }
  if (ui.waiting) return `<button class="btn" disabled>Locked in</button>`;
  if (handHidden(v) && v.phase !== 'roundEnd') return hint('Hand hidden · pass-and-play');
  if (v.phase === 'bidding') {
    if (v.bids[me] != null) return `<button class="btn" disabled>You bid ${v.bids[me]} · waiting for the crew</button>`;
    return bidSheet(v.cards);
  }
  if (v.phase === 'ability' && v.pending?.seat === me) return abilityPanel(v);
  if (v.phase === 'roundEnd' && v.online?.ready[me]) {
    // Online: this seat has said it is ready. The round starts when the connected players all have, or on its own.
    const { ready, status } = v.online,
      waiting = ready.filter((r, i) => !r && (status[i] === 'online' || status[i] === 'away')).length,
      next = v.round === v.rounds - 1 ? 'final scores are coming' : 'next round is coming';
    return `<button class="btn" disabled>Ready · ${waiting ? `waiting for ${waiting} more` : next}</button>`;
  }
  if (v.phase === 'roundEnd') return `<button class="btn" data-act="results">See round results</button>`;
  if (v.phase === 'ability' && v.pending) return hint(`${esc(v.seats[v.pending.seat].name)} is deciding…`);
  return '';
}
export function gameView(): string {
  const v = tableView(),
    n = v.seats.length,
    me = v.me,
    tot = Rules.totals(v.log, v.cfg, n),
    R = v.log[v.round];
  const abil = { abilities: v.cfg.abilities };
  const doneTricks = v.won.reduce((a, b) => a + b, 0) + R.destroyed;
  const pct = Math.max(3, ((v.round + (v.phase === 'roundEnd' ? 1 : doneTricks / v.cards)) / v.rounds) * 100);
  const from = ui.lastPct == null ? pct : ui.lastPct;
  ui.lastPct = pct;
  const trickEnd = v.phase === 'trickEnd',
    res = trickEnd && v.lastTrick ? v.lastTrick.result : null,
    multi = isPassAndPlay(v);
  const order = Array.from({ length: n - 1 }, (_, k) => (me + 1 + k) % n);
  const seats = order
    .map((i) => {
      const p = v.seats[i],
        turn = (v.phase === 'playing' && v.turn === i) || (v.phase === 'ability' && v.pending?.seat === i),
        won = res && res.winner === i;
      const presence = presenceTag(v, i),
        gone = presence && v.online?.status[i] !== 'away' ? ' gone' : '';
      // Offline none of the three online parts is there, and the markup is the legacy page's to the letter.
      return `<div class="seat ${turn ? 'turn' : ''} ${won ? 'won' : ''} ${ui.bump === i ? 'bump' : ''}${gone}">${avatar(p, '', `seat-${i}`)}${deadlineRing(v, i)}${presence}${i === v.dealer ? '<span class="dealer" title="Dealer">D</span>' : ''}${multi && !p.bot ? '<span class="human-tag" title="Human player">H</span>' : ''}
      <span class="sname">${esc(p.name)}</span>${seatBid(v, i)}<span class="sscore num">${tot[i]} pts</span></div>`;
    })
    .join('');
  const ls = v.phase === 'playing' ? Rules.leadSuit(v.trick.plays, v.deck) : null;
  const plays = v.trick.plays
    .map((p, k) => {
      const rot = ((p.card * 47) % 11) - 5;
      return `<div class="slot" data-key="c${p.card}" data-from="seat-${p.seat}">
      <div class="tc ${res && k === res.winIndex ? 'win' : ''} ${res && res.winner == null ? 'dead' : ''}" style="--rot:${rot}deg">${cardHTML(v.deck[p.card], { as: p.as, ...abil })}</div>
      ${avatar(v.seats[p.seat], 'xs')}</div>`;
    })
    .join('');
  const meP = v.seats[me],
    myTurn = v.phase === 'playing' && v.turn === me,
    legal = new Set(v.legal),
    hidden = handHidden(v);
  const smuggling = v.phase === 'ability' && v.pending?.kind === 'smuggler' && v.pending.seat === me,
    fresh = new Set<CardId>(smuggling ? v.pending?.drawn : []);
  const hand = sortHand(v.hand, v.deck),
    { cw, ov } = handMetrics(hand.length);
  const handHtml = hidden
    ? hand.map(() => `<div class="hslot"><div class="hc">${cardBack()}</div></div>`).join('')
    : hand
        .map((id, k) => {
          const locked = myTurn && !legal.has(id),
            disc = smuggling && ui.discard.includes(id);
          return `<button class="hslot ${ui.sel === id ? 'sel' : ''} ${v.deck[id].kind === 'tigress' ? 'tigress' : ''} ${disc ? 'discard' : ''} ${fresh.has(id) ? 'fresh' : ''} ${locked ? 'locked' : ''}" data-act="pick" data-id="${id}" data-key="c${id}"
      data-from="deck" ${ui.deal ? `data-delay="${k * 70}"` : ''} aria-label="${esc(Rules.cardName(v.deck[id], abil))}${locked ? ', must follow suit' : ui.sel === id && myTurn ? ', tap again to play' : ''}" aria-pressed="${ui.sel === id || disc}">
      <div class="hc">${cardHTML(v.deck[id], abil)}</div></button>`;
        })
        .join('');
  const canPeekLast = v.lastTrick && (v.phase === 'playing' || v.phase === 'ability');
  return `<div class="game">
    <div class="g-top"><button class="icon-btn" data-act="home" aria-label="${session.online ? 'Leave table' : 'Leave table (game is saved)'}">${ICON.x}</button>
      <div class="bar grow" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><i style="width:${from}%" data-to="${pct}"></i></div>
      <button class="icon-btn" data-act="board" aria-label="Scoreboard">${ICON.table}</button></div>
    <div class="g-info"><span class="pill blue">Round ${v.round + 1} of ${v.rounds}</span><span class="pill soft">${v.cards} ${v.cards === 1 ? 'card' : 'cards'}</span>
      ${v.phase === 'playing' || trickEnd ? `<span class="pill soft">Trick ${Math.min(v.cards, doneTricks + (trickEnd ? 0 : 1))} of ${v.cards}</span>` : ''}
      ${R.wager[me] ? `<span class="pill gold">Bet ${R.wager[me]}</span>` : ''}</div>
    <div class="seats">${seats}</div>
    <div class="felt">
      ${ls ? `<span class="pill soft lead pop"><i class="sdot s-${ls}"></i>Follow ${Rules.SUIT_NAME[ls]}</span>` : ''}
      ${canPeekLast ? `<button class="lastbtn" data-act="last">Last trick</button>` : ''}
      <div class="trick" data-anchor="deck">${plays || `<p class="empty">${v.phase === 'bidding' ? 'Cards are dealt.<br>Place your bids.' : 'Waiting for the lead…'}</p>`}</div>
      <div class="status" role="status">${statusText(v)}</div>${bonusText(v)}
    </div>
    <div class="mebar ${myTurn || (v.phase === 'ability' && v.pending?.seat === me) ? 'turn' : ''} ${res && res.winner === me ? 'won' : ''} ${ui.bump === me ? 'bump' : ''}">${avatar(meP, '', `seat-${me}`)}${deadlineRing(v, me)}
      <div class="grow"><div class="pname">${esc(meP.name)}${me === v.dealer ? ' <span class="pill gold" style="padding:0 6px">Dealer</span>' : ''}</div><span class="muted num" style="font-size:14px">${tot[me]} pts</span></div>
      ${seatBid(v, me)}</div>
    <div class="hand ${hidden ? 'hidden' : ''} ${myTurn && !ui.waiting ? 'myturn' : ''}" style="--cw:${cw}px;--ov:${ov}px">${handHtml}</div>
    <div class="actions">${actionsView(v)}</div>
  </div>`;
}
export function curtainView(): string {
  const v = tableView(),
    p = v.seats[v.me];
  return `<div class="curtain" role="dialog" aria-label="Pass the device">
    ${avatar(p, 'lg')}<h1>Pass to ${esc(p.name)}</h1>
    <p class="muted">Only ${esc(p.name)} should look at the next screen.</p>
    <button class="btn" data-act="reveal">I'm ${esc(p.name)}, show my hand</button></div>`;
}

/* --- sheets --- */
export function resultsSheet(): string {
  const v = tableView(),
    n = v.seats.length,
    R = v.log[v.round],
    tot = Rules.totals(v.log, v.cfg, n);
  const sc = v.seats.map((_, i) => scored(v.cfg, R, i)),
    H = localSeatsOf(v);
  let tone: 'good' | 'mid' | 'bad', title: string;
  if (H.length === 1) {
    const mine = sc[H[0]];
    tone = mine.kind === 'hit' ? 'good' : mine.kind === 'glance' ? 'mid' : 'bad';
    title =
      mine.kind === 'hit'
        ? R.bids[H[0]] === 0
          ? 'Zero hero!'
          : 'Bid made!'
        : mine.kind === 'glance'
          ? 'Glancing blow'
          : `Off by ${mine.diff}`;
  } else {
    const hits = H.filter((i) => sc[i].hit).length;
    tone = hits === H.length ? 'good' : hits ? 'mid' : 'bad';
    title = `${hits} of ${H.length} humans hit their bid`;
  }
  const rows = v.seats
    .map((p, i) => {
      const s = sc[i];
      const lab = s.kind === 'hit' ? 'Made it' : s.kind === 'glance' ? 'Off by 1' : `Off by ${s.diff}`;
      const extra = [
        s.bonus ? `bonus +${s.bonus}` : '',
        s.wager ? `bet ${sgn(s.wager)}` : '',
        R.giant && R.giant.seat === i ? `Giant ${R.giant.from}→${R.giant.to}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      return `<div class="res pop" style="animation-delay:${i * 70}ms">${avatar(p, 'sm')}<div class="grow"><b class="pname" style="font-size:15px">${esc(p.name)}</b>
      <small class="muted" style="display:block;font-size:12px">${lab} · bid ${R.bids[i]}, won ${R.tricks[i]}${extra ? ' · ' + extra : ''} · ${tot[i]} total</small></div>
      <span class="pts ${toneOf(s.total)}" data-count="${s.total}">0</span></div>`;
    })
    .join('');
  const last = v.round === v.rounds - 1;
  // Online the round does not wait for this button alone.
  const note = v.online
    ? `<p class="muted sheet-note">${last ? 'The final scores come' : 'The next round starts'} when everyone is ready, or on ${last ? 'their' : 'its'} own.</p>`
    : '';
  return `<div class="sheet-scrim" data-act="closeSheet"></div><div class="sheet ${tone}" role="dialog" aria-label="Round results"><div class="in">
    <div class="row">${mascot(tone === 'bad' ? 'sad' : 'happy', 'sm ' + (tone === 'bad' ? 'droop' : 'jump'))}<div class="grow"><h2 class="title">${title}</h2><p>Round ${v.round + 1} of ${v.rounds}</p></div></div>
    <div class="stack" style="gap:8px">${rows}</div>
    <button class="btn ${tone === 'bad' ? 'red' : tone === 'mid' ? 'gold' : ''} wake late" data-act="next">${last ? 'See final scores' : 'Next round'}</button>${note}
  </div></div>`;
}
export function boardSheet(v: ScoreView = scoreView(), editable = false): string {
  const n = v.seats.length,
    tot = Rules.totals(v.log, v.cfg, n),
    run = fill(n, 0);
  const rank = tot.map((t, i) => ({ t, i })).sort((a, b) => b.t - a.t);
  const body = v.log
    .map((R, r) =>
      !R.done
        ? ''
        : `<tr ${editable ? `class="editable" data-act="trkEdit" data-r="${r}" title="Fix round ${r + 1}"` : ''}><td>${r + 1}<small class="muted" style="display:block;font-size:11px">${R.cards}c</small></td>${v.seats
            .map((_, i) => {
              const s = scored(v.cfg, R, i);
              run[i] += s.total;
              return `<td class="cell"><b class="${toneOf(s.total)}">${sgn(s.total)}</b><small>${R.bids[i]}/${R.tricks[i]}${s.bonus ? ' ★' + s.bonus : ''}${s.wager ? ' $' + s.wager : ''} · ${run[i]}</small></td>`;
            })
            .join('')}</tr>`,
    )
    .join('');
  return `<div class="sheet-scrim" data-act="closeSheet"></div><div class="sheet" role="dialog" aria-label="Scoreboard"><div class="in">
    <div class="row"><h2 class="grow">Scoreboard</h2><button class="icon-btn" data-act="closeSheet" aria-label="Close">${ICON.x}</button></div>
    <div class="lb">${rank.map((x, k) => `<div class="li"><span class="rank ${k < 3 ? 'r' + (k + 1) : ''}">${k + 1}</span>${avatar(v.seats[x.i], 'sm')}<span class="grow pname">${esc(v.seats[x.i].name)}</span><span class="total">${x.t}</span></div>`).join('')}</div>
    ${
      body
        ? `<div class="tablewrap"><table><thead><tr><th>Rd</th>${v.seats.map((p) => `<th>${esc(p.name)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>
      <p class="muted" style="font-size:13px">${editable ? 'Tap a round to fix it. ' : ''}Each cell: round points, bid/won, ★ bonus, $ bet, running total.</p>`
        : '<p class="muted">Scores appear after the first round.</p>'
    }
  </div></div>`;
}
export function lastSheet(): string {
  const v = tableView(),
    lt = v.lastTrick;
  if (!lt) return '';
  const r = lt.result,
    abil = { abilities: v.cfg.abilities };
  return `<div class="sheet-scrim" data-act="closeSheet"></div><div class="sheet" role="dialog" aria-label="Last trick"><div class="in">
    <div class="row"><h2 class="grow">Last trick</h2><button class="icon-btn" data-act="closeSheet" aria-label="Close">${ICON.x}</button></div>
    <div class="cardrow">${lt.plays.map((p, k) => `<div class="slot"><div class="tc ${k === r.winIndex ? 'win' : ''}">${cardHTML(v.deck[p.card], { as: p.as, ...abil })}</div>${avatar(v.seats[p.seat], 'xs')}</div>`).join('')}</div>
    <p style="text-align:center">${r.winner == null ? 'Nobody won it.' : `${who(v, r.winner)} won it.`}</p>
  </div></div>`;
}
/**
 * Online only: leaving a running game gives the seat to a bot, so it is asked first. In a ranked
 * game it is also a forfeit, and the sheet says what that costs before anything is sent.
 */
export function leaveSheet(): string {
  const ranked = session.online?.ranked === true;
  return `<div class="sheet-scrim" data-act="closeSheet"></div><div class="sheet" role="dialog" aria-label="${ranked ? 'Leave the ranked game' : 'Leave the table'}"><div class="in">
    <h2>${ranked ? 'Leave this ranked game?' : 'Leave the table?'}</h2>
    <p>${ranked ? "Leaving scores last place and starts a cooldown before your next ranked game. A bot takes your seat, and you can't come back to it." : "A bot takes your seat for the rest of the game. You can't come back to it."}</p>
    <button class="btn red" data-act="leaveTable">${ranked ? 'Leave and forfeit' : 'Leave table'}</button>
    <button class="btn ghost" data-act="closeSheet">Keep playing</button>
  </div></div>`;
}
/**
 * What a ranked game did to this seat's rating, as one line: before, after and the change. Every
 * number is the server's and is shown rounded to a whole one; nothing here works a rating out.
 */
export function ratingLine(change: RatingChange): string {
  const delta = Math.round(change.delta);
  return `<span class="muted">Rating</span> <b class="num">${esc(whole(change.before.value))} → ${esc(whole(change.after.value))}</b> <b class="num ${delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'zero'}">${esc(delta > 0 ? '+' + whole(delta) : whole(delta))}</b>${change.after.provisional ? ' <span class="pill soft">Placement</span>' : ''}`;
}
export function peekSheet(): string {
  const v = tableView(),
    cards = sortHand((v.pending && v.pending.peek) || [], v.deck);
  return `<div class="sheet-scrim" data-act="seerDone"></div><div class="sheet" role="dialog" aria-label="Undealt cards"><div class="in">
    <div class="row"><h2 class="grow">Not in play this round</h2></div>
    <p class="muted">Nobody holds these ${cards.length} cards. Only you can see this.</p>
    <div class="cardrow">${cards.map((id) => cardHTML(v.deck[id], { abilities: v.cfg.abilities })).join('')}</div>
    <button class="btn" data-act="seerDone">Done</button>
  </div></div>`;
}
export function rulesSheet(): string {
  const c = (card: FaceCard): string => cardHTML(card);
  return `<div class="sheet-scrim" data-act="closeSheet"></div><div class="sheet" role="dialog" aria-label="How to play"><div class="in rules">
    <div class="row"><h2 class="grow">How to play</h2><button class="icon-btn" data-act="closeSheet" aria-label="Close">${ICON.x}</button></div>
    <p>Each round you get one more card. Look at your hand and bid exactly how many tricks you'll win. Hitting your bid is everything.</p>
    <h3>Who wins a trick</h3>
    <div class="ladder">${c({ kind: 'escape' })}<b>&lt;</b>${c({ kind: 'num', suit: 'green', rank: 9 })}<b>&lt;</b>${c({ kind: 'num', suit: 'black', rank: 2 })}<b>&lt;</b>${c({ kind: 'mermaid' })}<b>&lt;</b>${c({ kind: 'pirate' })}<b>&lt;</b>${c({ kind: 'sk' })}<b>&lt;</b>${c({ kind: 'mermaid' })}</div>
    <ul><li>Follow the suit that was led if you can. Special cards can always be played.</li>
    <li>Black Jolly Roger cards trump the other suits.</li><li>Mermaids beat numbers, Pirates beat Mermaids, the Skull King beats Pirates, and a Mermaid catches the Skull King.</li>
    <li>When two equal specials meet, the first one played wins. Tigress plays as a Pirate or an Escape.</li></ul>
    <h3>Scoring</h3>
    <ul><li>Hit a bid of 1+: <b>+20 per trick</b>. Miss: <b>−10 per trick</b> you were off.</li><li>Bid 0 and take none: <b>+10 × cards</b>. Take any: <b>−10 × cards</b>.</li>
    <li>Bonuses if you hit your bid: 14s +10 (black +20), Mermaid taken by a Pirate +20, Pirate taken by the King +30, King taken by a Mermaid +40.</li>
    <li>Rascal's scoring: everyone plays for 10 × cards. Off by 1 earns half, off by 2 earns nothing.</li></ul>
    <h3>Pirate abilities</h3>
    <ul>${Object.values(Rules.ABILITY)
      .map((a) => `<li><b>${a.name}</b>: ${a.desc}</li>`)
      .join('')}<li>A power only works when that Pirate wins the trick. The Tigress has no power.</li></ul>
    <h3>Advanced cards</h3>
    <ul><li>Kraken: nobody wins the trick. White Whale: specials stop counting, highest number wins.</li><li>Loot: acts as an Escape. Whoever takes it allies with its owner; +20 each if both hit their bids.</li></ul>
  </div></div>`;
}
export function soundSheet(): string {
  const vol = Math.round((prefs.volume == null ? 0.8 : prefs.volume) * 100),
    canBuzz = typeof navigator.vibrate === 'function';
  const tg = (k: string, on: boolean, t: string, d: string): string =>
    `<button class="toggle" data-act="sndToggle" data-k="${k}" aria-pressed="${on}"><span class="grow">${t}<small>${d}</small></span><span class="switch"></span></button>`;
  return `<div class="sheet-scrim" data-act="closeSheet"></div><div class="sheet" role="dialog" aria-label="Sound settings"><div class="in">
    <div class="row"><h2 class="grow">Sound</h2><button class="icon-btn" data-act="closeSheet" aria-label="Close">${ICON.x}</button></div>
    ${tg('sfx', !prefs.muted, 'Sound effects', 'Cards, captures, the finale and button taps.')}
    <label class="vol ${prefs.muted ? 'off' : ''}" for="vol"><span class="row"><span class="label grow">Volume</span><b id="vol-out" class="num">${vol}%</b></span>
      <input type="range" id="vol" min="0" max="100" step="5" value="${vol}" ${prefs.muted ? 'disabled' : ''}></label>
    ${tg('ambience', !!prefs.ambience, 'Sea ambience', 'Gentle waves in the background.')}
    ${canBuzz ? tg('haptics', prefs.haptics !== false, 'Vibration', 'A short buzz when you play a card or win a trick.') : ''}
  </div></div>`;
}
/* --- end of game --- */
interface Award {
  c: string;
  i: string;
  t: string;
  d: string;
}
interface SeatRecord {
  hits: number;
  bonus: number;
  best: number;
  long: number;
  cur: number;
}
function awards(v: ScoreView): Award[] {
  const n = v.seats.length,
    stat: SeatRecord[] = v.seats.map(() => ({ hits: 0, bonus: 0, best: -Infinity, long: 0, cur: 0 }));
  v.log
    .filter((R) => R.done)
    .forEach((R) => {
      for (let i = 0; i < n; i++) {
        const s = scored(v.cfg, R, i),
          x = stat[i];
        if (s.hit) {
          x.hits++;
          x.cur++;
          x.long = Math.max(x.long, x.cur);
        } else x.cur = 0;
        x.bonus += s.bonus;
        x.best = Math.max(x.best, s.total);
      }
    });
  const top = (f: (x: SeatRecord) => number, min = 0): { v: number; who: string } | null => {
    const m = Math.max(...stat.map(f));
    return m > min
      ? {
          v: m,
          who: stat
            .map((x, i) => (f(x) === m ? esc(v.seats[i].name) : null))
            .filter(Boolean)
            .join(' & '),
        }
      : null;
  };
  const A: Award[] = [];
  let a: ReturnType<typeof top>;
  if ((a = top((x) => x.hits)))
    A.push({ c: 'var(--green)', i: ICON.target, t: 'Sharpshooter', d: `${a.who} · ${a.v} bids made` });
  if ((a = top((x) => x.long, 1)))
    A.push({ c: 'var(--orange)', i: ICON.wave, t: 'Hot streak', d: `${a.who} · ${a.v} in a row` });
  if ((a = top((x) => x.bonus)))
    A.push({ c: 'var(--gold-d)', i: ICON.chest, t: 'Bounty hunter', d: `${a.who} · ${a.v} bonus points` });
  if ((a = top((x) => x.best)))
    A.push({ c: 'var(--blue)', i: ICON.crown, t: 'Biggest haul', d: `${a.who} · ${sgn(a.v)} in one round` });
  return A;
}
/** One seat on the end screen: its points, where it finished, and whether it gave the game up. */
export interface Standing {
  i: Seat;
  t: number;
  rank: number;
  forfeit: boolean;
}
/**
 * Where each seat finished, best first. Offline, and online until the server's result is in, that
 * is the order of the points. Online the places are the server's: a seat that forfeited a ranked
 * game is last whatever was scored in it, and the client does not decide that from the points.
 */
export function standings(totals: number[], result: GameResult | null): Standing[] {
  const places = result && result.places.length === totals.length ? result.places : null,
    forfeited = result?.forfeited ?? [];
  return totals
    .map((t, i) => ({
      t,
      i,
      rank: places ? places[i] : 1 + totals.filter((x) => x > t).length,
      forfeit: forfeited.includes(i),
    }))
    .sort((a, b) => a.rank - b.rank || b.t - a.t);
}
/** Whether the server's result puts the seats anywhere else than their points do: the end screen has to be drawn again then. */
export function movesStandings(result: GameResult): boolean {
  const v = scoreView(),
    tot = Rules.totals(v.log, v.cfg, v.seats.length),
    drawn = standings(tot, null),
    told = standings(tot, result);
  return drawn.some((x, k) => x.i !== told[k].i || x.rank !== told[k].rank || x.forfeit !== told[k].forfeit);
}
/** One screen, no scrolling. Rendered in its pre-reveal state; playFinale() uncovers it step by step. */
export function endView(): string {
  const v = scoreView(),
    n = v.seats.length,
    tot = Rules.totals(v.log, v.cfg, n),
    H = localSeatsOf(v),
    solo = H.length === 1,
    // Online, the server's result says who finished where, once it is in. Only a ranked game has a
    // rating line, which stays empty until then.
    result = session.online?.result() ?? null,
    ranked = session.online?.ranked === true,
    change = result?.rating ?? null;
  const order = standings(tot, result),
    // First place, or the best place there is should the server have given nobody the first.
    best = Math.min(...order.map((x) => x.rank));
  const winners = order.filter((x) => x.rank === best),
    rest = order.filter((x) => x.rank > best);
  const done = ui.finaleDone,
    shown = (t: number): number => (done ? t : 0);
  const rows = rest
    .map((x, k) => {
      const p = v.seats[x.i];
      return `<li class="${solo && x.i === H[0] ? 'you' : ''}" data-step="${rest.length - 1 - k}"><span class="rank ${x.rank <= 3 ? 'r' + x.rank : ''}">${x.rank}</span>${avatar(p, 'sm')}
      <span class="grow pname">${esc(p.name)}</span>${x.forfeit ? '<span class="pill soft">Forfeit</span>' : ''}<b class="num" data-final="${x.t}">${shown(x.t)}</b></li>`;
    })
    .join('');
  const aw = awards(v)
    .map(
      (a) =>
        `<div class="award"><span class="badge" style="background:${a.c}">${a.i}</span><div class="grow" style="min-width:0"><b>${a.t}</b><small>${a.d}</small></div></div>`,
    )
    .join('');
  return `<div class="end ${done ? 'done' : ''}" data-act="skipFinale">
    <div class="end-top"><button class="icon-btn" data-act="home" aria-label="Home">${ICON.x}</button><span class="label">Final scores</span><button class="icon-btn" data-act="board" aria-label="Scoreboard">${ICON.table}</button></div>
    <div class="end-mid">
    <section class="hero-win" aria-live="polite">
      <div class="mystery" aria-hidden="${done}"><span class="avatar lg q">?</span><p class="tease">Who rules the seas?</p><p class="tease2">And the Captain of the Seven Seas is…</p></div>
      <div class="reveal"><div class="rays" aria-hidden="true"></div><div class="crown" aria-hidden="true">${ICON.crown}</div>
        <div class="win-av">${winners.map((x) => avatar(v.seats[x.i], 'lg')).join('')}</div>
        <span class="label">Captain of the Seven Seas</span><h1>${winners.map((x) => esc(v.seats[x.i].name)).join(' & ')}</h1>
        <p class="muted"><b class="num" data-final="${winners[0].t}">${shown(winners[0].t)}</b> points · ${v.rounds} rounds</p></div>
    </section>
    ${rows ? `<ol class="standings ${rest.length > 4 ? 'two' : ''}">${rows}</ol>` : ''}
    ${aw ? `<div class="awards">${aw}</div>` : ''}
    </div>${ranked ? `<p class="end-rating" aria-live="polite"${change ? '' : ' hidden'}>${change ? ratingLine(change) : ''}</p>` : ''}
    <div class="end-actions"><button class="btn" data-act="again">Play again</button>${session.online ? '' : '<button class="btn ghost" data-act="home">Home</button>'}</div>
    <p class="skip-hint" aria-hidden="true">Tap to skip</p>
  </div>`;
}
