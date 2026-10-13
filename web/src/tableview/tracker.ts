/* Score tracker — for a game played with real cards: its saved state, its validation and its screens.
   Same Rules.scoreSeat and round-record shape as the bot game, its own saved state, and the shared
   end-of-game finale. What its buttons do is in trackerActions.ts.
   Ported from the legacy build (legacy/Skull King Tavern.html, "Score tracker") without changing behavior. */
import { Rules } from '../game';
import type { Score } from '../game';
import { fill } from '../game/util';
import type { RoundRecord, Seat } from '../protocol/generated';
import { avatar, cardHTML, ICON, mascot } from './art';
import type { FaceCard } from './art';
import { esc, initial, sgn, toneOf } from './dom';
import { COLORS, prefs, session, ui } from './state';
import type { ScoreView, TrackerConfig, TrackerRecord, TrackerState, TrackPrefs } from './state';
import { Store } from './store';
import { scored } from './views';

export const Tracker = {
  KEY: 'skullking-tavern.tracker.v1',
  load(): TrackerState | null {
    const t = Store.get<TrackerState>(Tracker.KEY);
    return t && t.version === 1 ? t : null;
  },
  save(): void {
    Store.set(Tracker.KEY, session.trk);
  },
};

/** The open scoresheet. The scorekeeper's screens and actions only exist while there is one. */
export function trkNow(): TrackerState {
  const t = session.trk;
  if (!t) throw new Error('No scoresheet is open');
  return t;
}

export function trkNewRecord(n: number, cards: number): TrackerRecord {
  return Object.assign(Rules.newRecord(n, cards), { cannon: fill(n, false) });
}
export function trkCreate(names: string[], cfg: TrackerConfig): TrackerState {
  const seats = names.map((nm, i) => ({
    name: (nm || '').trim() || `Pirate ${i + 1}`,
    color: COLORS[i % COLORS.length],
    bot: false,
  }));
  const max = Math.floor(Rules.buildDeck(cfg).length / seats.length);
  const schedule = Rules.FORMATS[cfg.format].seq.map((c) => Math.min(c, max));
  return {
    version: 1,
    seats,
    cfg,
    schedule,
    log: [trkNewRecord(seats.length, schedule[0])],
    cur: 0,
    phase: 'bid',
    edit: null,
    finished: false,
  };
}
/** The round on screen: the one being corrected, else the current one. */
export const trkRound = (t: TrackerState = trkNow()): TrackerRecord => t.log[t.edit != null ? t.edit : t.cur];
export const trkView = (t: TrackerState = trkNow()): ScoreView => ({
  seats: t.seats,
  log: t.log,
  cfg: t.cfg,
  rounds: t.schedule.length,
  me: -1,
});
function trkTotals(t: TrackerState): number[] {
  return Rules.totals(t.log, t.cfg, t.seats.length);
}
function trkStreak(t: TrackerState, i: Seat): number {
  let s = 0;
  for (let r = t.log.length - 1; r >= 0; r--) {
    const R = t.log[r];
    if (!R.done) continue;
    if (scored(t.cfg, R, i)?.hit) s++;
    else break;
  }
  return s;
}
const flame = (n: number): string =>
  n >= 2 ? `<span class="flame" title="${n} bids in a row">${ICON.flame}${n}</span>` : '';
const mini = (c: FaceCard): string => `<span class="mini">${cardHTML(c, { abilities: true })}</span>`;

/** Everything that can't be true about a finished round, in plain words. */
export function trkValidate(R: RoundRecord, t: TrackerState = trkNow()): string[] {
  const n = t.seats.length,
    o = t.cfg,
    e: string[] = [],
    name = (i: Seat): string => t.seats[i].name,
    sum = (a: (number | null)[]): number => a.reduce<number>((x, y) => x + (y || 0), 0);
  if (R.bids.some((b) => b == null)) e.push('Every pirate needs a bid.');
  if (R.tricks.some((t) => t == null)) e.push('Enter tricks won for every pirate.');
  const target = R.cards - (R.destroyed || 0);
  if (!R.tricks.some((t) => t == null) && sum(R.tricks) !== target)
    e.push(
      `Tricks add up to ${sum(R.tricks)}, but ${target} ${target === 1 ? 'trick was' : 'tricks were'} won this round.`,
    );
  if (sum(R.b14) > 3) e.push('There are only three standard 14s.');
  if (sum(R.mp) > 2) e.push('There are only two Mermaids.');
  if (sum(R.ps) > 6) e.push('There are only six Pirates, counting the Tigress.');
  if (R.sm >= 0 && sum(R.ps) > 0)
    e.push('If a Mermaid caught the Skull King, he never won a trick, so no Pirate bonuses.');
  if (R.ps.filter((x) => x > 0).length > 1)
    e.push('Only one pirate holds the Skull King, so only one can capture Pirates with him.');
  for (let i = 0; i < n; i++)
    if ((R.b14[i] || R.black14 === i || R.mp[i] || R.ps[i] || R.sm === i) && R.tricks[i] === 0)
      e.push(`${name(i)} took no tricks, so can't have captured bonus cards.`);
  R.loot.forEach((a, k) => {
    if (a.from < 0 || a.to < 0) e.push(`Loot ${k + 1}: pick who played it and who took it.`);
    else if (a.from === a.to) e.push(`Loot ${k + 1}: an alliance needs two different pirates.`);
    else if (R.tricks[a.to] === 0) e.push(`Loot ${k + 1}: ${name(a.to)} took no tricks, so couldn't capture it.`);
  });
  if ((R.destroyed || 0) > (o.kraken ? 1 : 0) + (o.whale ? 1 : 0))
    e.push('More tricks destroyed than beasts in the deck.');
  return [...new Set(e)];
}

/* --- tracker views --- */
/** The switches of the scorekeeper's setup screen. */
export type TrackToggle = { [K in keyof TrackPrefs]: TrackPrefs[K] extends boolean ? K : never }[keyof TrackPrefs];
export function trkSetupView(): string {
  const s = prefs.track,
    n = s.players.length;
  const max = Math.floor(Rules.buildDeck(s).length / n),
    capped = Rules.FORMATS[s.format].seq.some((c) => c > max);
  const tg = (k: TrackToggle, t: string, d: string): string =>
    `<button class="toggle" data-act="trkTog" data-k="${k}" aria-pressed="${!!s[k]}"><span class="grow">${t}<small>${d}</small></span><span class="switch"></span></button>`;
  const rows = s.players
    .map(
      (p, i) => `<div class="crew-row ${ui.just === 'tadd' && i === n - 1 ? 'pop' : ''}">
    <span class="avatar sm" style="background:${COLORS[i]}">${initial(p.name || String(i + 1))}</span>
    <input class="name" id="tcrew-${i}" data-tcrew="${i}" maxlength="16" value="${esc(p.name)}" placeholder="Pirate ${i + 1}" autocomplete="off" aria-label="Name of pirate ${i + 1}">
    ${n > 2 ? `<button class="icon-btn" data-act="trkCrewRm" data-i="${i}" aria-label="Remove pirate ${i + 1}">${ICON.x}</button>` : ''}</div>`,
    )
    .join('');
  return `<div class="wrap">
    <div class="row" style="padding-block:10px"><button class="icon-btn" data-act="home" aria-label="Back">${ICON.back}</button><div class="grow"><h2>Score a real game</h2><p class="muted" style="font-size:14px">Deal real cards. Enter bids and tricks here.</p></div></div>
    <div class="stack stagger" style="gap:22px">
      <section class="stack"><span class="label">Players · ${n} · in seating order</span>${rows}
        ${n < 8 ? `<button class="btn ghost" data-act="trkCrewAdd">Add player</button>` : ''}</section>
      <section class="stack"><span class="label">Scoring</span>
        <div class="seg">
          <button data-act="trkScoring" data-v="classic" aria-pressed="${s.scoring === 'classic'}">Skull King's<small>Classic, high risk</small></button>
          <button data-act="trkScoring" data-v="rascal" aria-pressed="${s.scoring === 'rascal'}">Rascal's<small>10 per card dealt</small></button></div>
        ${s.scoring === 'rascal' ? tg('cannonball', 'Cannonball or Grapeshot', 'Each pirate picks a load after bidding. Cannonball pays 15 per card, all or nothing.') : ''}
      </section>
      <section class="stack"><span class="label">Rounds</span>
        ${Object.entries(Rules.FORMATS)
          .map(
            ([k, f]) =>
              `<div class="seg"><button data-act="trkFormat" data-v="${k}" aria-pressed="${s.format === k}" style="text-align:left;padding:10px 12px">${f.name}<small>${f.desc}</small><span class="fmt">${f.seq.map((c) => `<i>${c}</i>`).join('')}</span></button></div>`,
          )
          .join('')}
        ${capped ? `<p class="muted" style="font-size:14px">With ${n} players the deck holds ${max} cards each, so later rounds repeat that hand size.</p>` : ''}
      </section>
      <section class="stack"><span class="label">Cards in your deck</span>
        ${tg('loot', 'Loot cards', 'Alliance bonus of +20 each when both pirates make their bids.')}
        ${tg('kraken', 'Kraken', 'Destroys a trick. Nobody wins it.')}
        ${tg('whale', 'White Whale', 'Can destroy a trick if only special cards were played.')}
        ${tg('abilities', 'Pirate abilities', "Track the Gambler's bets and let the Giant change a bid by 1.")}
      </section>
    </div></div>
  <div class="footbar"><div><button class="btn" data-act="trkStart">Start scoring</button></div></div>`;
}
function trkHeader(t: TrackerState): string {
  const R = trkRound(t),
    idx = t.edit != null ? t.edit : t.cur,
    done = t.log.filter((r) => r.done).length;
  const pct = Math.max(4, ((done + (t.phase === 'tricks' && t.edit == null ? 0.5 : 0)) / t.schedule.length) * 100);
  const from = ui.lastPct == null ? pct : ui.lastPct;
  ui.lastPct = pct;
  return `<div class="tk-top">
    <div class="g-top"><button class="icon-btn" data-act="home" aria-label="Save and leave">${ICON.x}</button>
      <div class="bar grow" role="progressbar" aria-valuemin="0" aria-valuemax="${t.schedule.length}" aria-valuenow="${done}"><i style="width:${from}%" data-to="${pct}"></i></div>
      <button class="icon-btn" data-act="trkBoard" aria-label="Scoreboard">${ICON.table}</button></div>
    <div class="g-info"><span class="pill blue">Round ${idx + 1} of ${t.schedule.length}</span><span class="pill soft">${R.cards} ${R.cards === 1 ? 'card' : 'cards'} dealt</span>
      ${t.cfg.scoring === 'rascal' ? `<span class="pill gold">${10 * R.cards} pts at stake</span>` : ''}${t.edit != null ? '<span class="pill red">Editing</span>' : ''}</div></div>`;
}
function trkStepper(k: string, i: number, v: number | null, min: number, max: number): string {
  const just = ui.just,
    j = just != null && just.startsWith(`ts:${k}:${i}:`),
    dir = j ? +just.split(':')[3] : 0;
  return (
    `<span class="stepper"><button class="sbtn" data-act="trkStep" data-k="${k}" data-i="${i}" data-d="-1" data-min="${min}" data-max="${max}" ${v == null || v <= min ? 'disabled' : ''} aria-label="Decrease">−</button>` +
    `<output class="num ${j ? (dir > 0 ? 'bump-up' : 'bump-down') : ''}">${v == null ? '–' : v}</output>` +
    `<button class="sbtn" data-act="trkStep" data-k="${k}" data-i="${i}" data-d="1" data-min="${min}" data-max="${max}" ${v != null && v >= max ? 'disabled' : ''} aria-label="Increase">+</button></span>`
  );
}
const trkRadio = (k: string, i: number, on: boolean): string =>
  `<button class="radio ${ui.just === `tr:${k}:${i}` ? 'pop' : ''}" data-act="trkRadio" data-k="${k}" data-i="${i}" aria-pressed="${on}" aria-label="Toggle">${on ? ICON.check : ''}</button>`;

function trkBidView(t: TrackerState): string {
  const R = trkRound(t),
    tot = trkTotals(t),
    lead = Math.max(...tot),
    anyDone = t.log.some((r) => r.done);
  const cards = t.seats
    .map((p, i) => {
      const chips = Array.from(
        { length: R.cards + 1 },
        (_, b) =>
          `<button class="chip ${b === 0 ? 'zero' : ''} ${ui.just === `tb:${i}:${b}` ? 'just' : ''}" data-act="trkBid" data-i="${i}" data-v="${b}" aria-pressed="${R.bids[i] === b}" aria-label="${esc(p.name)} bids ${b}">${b}</button>`,
      ).join('');
      const load = t.cfg.cannonball
        ? `<div class="seg">
      <button data-act="trkCannon" data-i="${i}" data-v="0" aria-pressed="${!R.cannon[i]}">Grapeshot<small>${10 * R.cards} / ${5 * R.cards} / 0</small></button>
      <button data-act="trkCannon" data-i="${i}" data-v="1" aria-pressed="${!!R.cannon[i]}">Cannonball<small>${15 * R.cards} or 0</small></button></div>`
        : '';
      return `<div class="pcard"><div class="row">${avatar(p)}<div class="grow"><div class="pname">${esc(p.name)}</div>
        <div class="row" style="gap:8px"><span class="muted num" style="font-size:14px">${tot[i]} pts</span>${anyDone && tot[i] === lead ? '<span class="pill gold" style="padding:1px 8px">Leader</span>' : ''}${flame(trkStreak(t, i))}</div></div>
        ${R.bids[i] != null ? `<span class="pill ${R.bids[i] === 0 ? 'soft' : 'blue'} ${ui.just && ui.just.startsWith(`tb:${i}:`) ? 'pop' : ''}">Bid ${R.bids[i]}</span>` : ''}</div>
      <div class="chips" role="group" aria-label="Bid for ${esc(p.name)}">${chips}</div>${load}</div>`;
    })
    .join('');
  const all = R.bids.every((b) => b != null),
    sum = R.bids.reduce<number>((a, b) => a + (b || 0), 0);
  const mood = !all
    ? ''
    : sum > R.cards
      ? `<span class="pill red">Overbid by ${sum - R.cards}</span>`
      : sum < R.cards
        ? `<span class="pill blue">Underbid by ${R.cards - sum}</span>`
        : '<span class="pill green">Bids match the tricks</span>';
  return `<div class="wrap">${trkHeader(t)}
    <div class="stack stagger" style="margin-top:6px">
      <div class="row" style="align-items:flex-end"><div class="grow"><h1>Place your bids</h1><p class="muted">Yo-ho-ho! Fists down on three.</p></div>${mascot('wink', 'sm')}</div>
      ${cards}</div></div>
  <div class="footbar"><div class="stack" style="gap:10px">
    <div class="tk-msg"><span class="muted">Total bids <b class="num" style="color:var(--fg)">${sum}</b> for ${R.cards} ${R.cards === 1 ? 'trick' : 'tricks'}</span>${mood}</div>
    <button class="btn ${all && ui.just && ui.just.startsWith('tb:') ? 'wake' : ''}" data-act="trkLock" ${all ? '' : 'disabled'}>Lock in bids</button></div></div>`;
}
function trkTricksView(t: TrackerState): string {
  const R = trkRound(t),
    o = t.cfg,
    edit = t.edit,
    editing = edit != null;
  const beasts = (o.kraken ? 1 : 0) + (o.whale ? 1 : 0);
  const beastCard = beasts
    ? `<div class="card-box brow">${mini({ kind: o.kraken ? 'kraken' : 'whale' })}<div class="grow">Tricks destroyed<small>${[o.kraken && 'Kraken', o.whale && 'White Whale with only specials'].filter(Boolean).join(' or ')}</small></div>${trkStepper('destroyed', -1, R.destroyed || 0, 0, Math.min(beasts, R.cards))}</div>`
    : '';
  const opts = (sel: number): string =>
    '<option value="-1">Choose…</option>' +
    t.seats.map((p, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  const lootCard = o.loot
    ? `<div class="card-box stack" style="gap:10px"><div class="brow">${mini({ kind: 'loot' })}<div class="grow">Loot alliances<small>+20 each to both pirates if both make their bids</small></div>
      ${R.loot.length < 2 ? '<button class="sbtn" data-act="trkLootAdd" aria-label="Add loot alliance">+</button>' : ''}</div>
    ${R.loot
      .map(
        (
          a,
          k,
        ) => `<div class="row pop" style="gap:8px;flex-wrap:wrap"><div class="grow stack" style="gap:4px;min-width:120px"><span class="label">Played by</span><select id="tloot-from-${k}" data-tloot="${k}" data-f="from">${opts(a.from)}</select></div>
      <div class="grow stack" style="gap:4px;min-width:120px"><span class="label">Taken by</span><select id="tloot-to-${k}" data-tloot="${k}" data-f="to">${opts(a.to)}</select></div>
      <button class="icon-btn" data-act="trkLootRm" data-k="${k}" aria-label="Remove loot alliance" style="align-self:flex-end">${ICON.x}</button></div>`,
      )
      .join('')}</div>`
    : '';
  const cards = t.seats
    .map((p, i) => {
      const sc = Rules.scoreSeat(o, R, i),
        raw = 10 * R.b14[i] + (R.black14 === i ? 20 : 0) + 20 * R.mp[i] + 30 * R.ps[i] + (R.sm === i ? 40 : 0),
        open = !!(ui.open && ui.open[i]);
      const touched =
        ui.just &&
        (ui.just.startsWith(`tt:${i}:`) ||
          ui.just.startsWith(`ts:bids:${i}:`) ||
          ui.just.startsWith(`ts:b14:${i}:`) ||
          ui.just.startsWith(`ts:mp:${i}:`) ||
          ui.just.startsWith(`ts:ps:${i}:`) ||
          ui.just === `tr:black14:${i}` ||
          ui.just === `tr:sm:${i}` ||
          ui.just.startsWith(`tw:${i}:`));
      const chips = Array.from(
        { length: R.cards + 1 },
        (_, b) =>
          `<button class="chip ${ui.just === `tt:${i}:${b}` ? 'just' : ''}" data-act="trkTrick" data-i="${i}" data-v="${b}" aria-pressed="${R.tricks[i] === b}" aria-label="${esc(p.name)} won ${b}">${b}</button>`,
      ).join('');
      let preview = '<span class="muted" style="font-size:14px">How many tricks?</span>';
      if (sc) {
        const lab = sc.kind === 'hit' ? 'Made it' : sc.kind === 'glance' ? 'Glancing blow' : `Off by ${sc.diff}`;
        preview = `<span class="pill ${sc.kind === 'hit' ? 'green' : sc.kind === 'glance' ? 'gold' : 'red'} ${touched ? 'pop' : ''}">${lab} · <span class="num">${sgn(sc.total)}</span></span>`;
      }
      const bonus = open
        ? `<div class="bonus ${ui.just === `to:${i}` ? 'opening' : ''}">
      <p class="muted" style="font-size:13px">${o.scoring === 'rascal' ? 'Full on a direct hit, half on a glancing blow' : 'Bonuses only count if the bid is made'}</p>
      <div class="brow">${mini({ kind: 'num', suit: 'yellow', rank: 14 })}<div class="grow">Standard 14s<small>Yellow, purple, green · +10 each</small></div>${trkStepper('b14', i, R.b14[i], 0, 3)}</div>
      <div class="brow">${mini({ kind: 'num', suit: 'black', rank: 14 })}<div class="grow">Jolly Roger 14<small>Black trump 14 · +20</small></div>${trkRadio('black14', i, R.black14 === i)}</div>
      <div class="brow">${mini({ kind: 'mermaid' })}<div class="grow">Mermaids taken by a Pirate<small>+20 each</small></div>${trkStepper('mp', i, R.mp[i], 0, 2)}</div>
      <div class="brow">${mini({ kind: 'sk' })}<div class="grow">Pirates taken by Skull King<small>Tigress as Pirate counts · +30 each</small></div>${trkStepper('ps', i, R.ps[i], 0, 6)}</div>
      <div class="brow">${mini({ kind: 'mermaid' })}<div class="grow">Skull King taken by a Mermaid<small>+40</small></div>${trkRadio('sm', i, R.sm === i)}</div>
      ${
        o.abilities
          ? `<div class="brow">${mini({ kind: 'pirate', ability: 'gambler' })}<div class="grow">Gambler's bet<small>Won if the bid is made, lost if not</small></div></div>
        <div class="seg">${[0, 10, 20].map((w) => `<button class="${ui.just === `tw:${i}:${w}` ? 'just' : ''}" data-act="trkWager" data-i="${i}" data-v="${w}" aria-pressed="${(R.wager[i] || 0) === w}">${w ? 'Bet ' + w : 'No bet'}</button>`).join('')}</div>`
          : ''
      }
    </div>`
        : '';
      return `<div class="pcard ${sc ? sc.kind : ''}">
      <div class="row">${avatar(p)}<div class="grow"><div class="pname">${esc(p.name)}</div>${preview}</div>${o.cannonball && R.cannon[i] ? '<span class="pill red">Cannonball</span>' : ''}</div>
      <div class="row" style="gap:6px"><span class="label">Bid</span><span class="grow"></span>${trkStepper('bids', i, R.bids[i], 0, R.cards)}</div>
      <div class="chips" role="group" aria-label="Tricks won by ${esc(p.name)}">${chips}</div>
      <button class="disclose ${ui.just === `to:${i}` ? 'just' : ''}" data-act="trkOpen" data-i="${i}" aria-expanded="${open}"><span>Bonus cards ${raw ? `<b>+${raw}</b>` : ''}</span>${ICON.chev}</button>
      ${bonus}</div>`;
    })
    .join('');
  const errs = trkValidate(R, t),
    sum = R.tricks.reduce<number>((a, b) => a + (b || 0), 0),
    target = R.cards - (R.destroyed || 0);
  const em = !R.tricks.some((x) => x == null) && errs.length ? errs[0] : '';
  return `<div class="wrap">${trkHeader(t)}
    <div class="stack stagger" style="margin-top:6px">
      <div class="row" style="align-items:flex-end"><div class="grow"><h1>${editing ? `Fix round ${edit + 1}` : 'Count the tricks'}</h1><p class="muted">${editing ? 'Totals update everywhere when you save.' : 'Tap how many each pirate won.'}</p></div>${mascot('wink', 'sm')}</div>
      ${beastCard}${lootCard}${cards}
      ${editing ? '' : '<button class="btn ghost" data-act="trkBackBids">Back to bids</button>'}
    </div></div>
  <div class="footbar"><div class="stack" style="gap:10px">
    <div class="tk-msg"><span class="muted">Tricks <b class="num ${sum === target ? 'okc' : ''}" style="${sum === target ? '' : 'color:var(--fg)'}">${sum} / ${target}</b></span>${em ? `<span class="err" role="status" style="text-align:right;font-size:13px">${esc(em)}</span>` : ''}</div>
    <button class="btn ${editing ? 'blue' : ''} ${!errs.length && ui.just && ui.just.startsWith('tt:') ? 'wake' : ''}" data-act="${editing ? 'trkSave' : 'trkCheck'}" ${errs.length ? 'disabled' : ''}>${editing ? 'Save changes' : 'Check'}</button></div></div>`;
}
export function trackScreen(): string {
  const t = trkNow();
  return t.phase === 'bid' && t.edit == null ? trkBidView(t) : trkTricksView(t);
}

export function trkResultsSheet(): string {
  const t = trkNow(),
    R = trkRound(t),
    n = t.seats.length,
    before = fill(n, 0);
  t.log.forEach((X, r) => {
    if (X.done && r < t.cur) for (let i = 0; i < n; i++) before[i] += scored(t.cfg, X, i)?.total ?? 0;
  });
  // The sheet opens on a round that has been checked: every seat has a score. Without one there is no sheet.
  const sc: Score[] = [];
  for (let i = 0; i < n; i++) {
    const s = scored(t.cfg, R, i);
    if (!s) return '';
    sc.push(s);
  }
  const hits = sc.filter((s) => s.hit).length;
  const after = before.map((b, i) => b + sc[i].total),
    top = (): number => after.indexOf(Math.max(...after));
  const tone = hits === n ? 'good' : hits * 2 >= n ? 'mid' : 'bad';
  const title =
    hits === n ? 'Perfect round!' : hits === 0 ? 'Rough seas!' : hits * 2 >= n ? 'Well sailed!' : 'Choppy waters';
  const leadBefore = before.indexOf(Math.max(...before)),
    leadNow = top();
  const leadMsg =
    t.cur > 0 && leadBefore !== leadNow
      ? `${esc(t.seats[leadNow].name)} takes the lead!`
      : `${esc(t.seats[leadNow].name)} leads with ${after[leadNow]}`;
  const rows = t.seats
    .map((p, i) => {
      const s = sc[i],
        st = s.hit ? trkStreak(t, i) + 1 : 0;
      const lab = s.kind === 'hit' ? 'Bid made' : s.kind === 'glance' ? 'Glancing blow' : `Off by ${s.diff}`;
      const extra = [s.bonus ? `bonus +${s.bonus}` : '', s.wager ? `bet ${sgn(s.wager)}` : '']
        .filter(Boolean)
        .join(' · ');
      return `<div class="res pop" style="animation-delay:${i * 70}ms">${avatar(p, 'sm')}<div class="grow"><div class="row" style="gap:6px"><b class="pname" style="font-size:15px">${esc(p.name)}</b>${flame(st)}</div>
      <small class="muted" style="display:block;font-size:12px">${lab} · bid ${R.bids[i]}, won ${R.tricks[i]}${extra ? ' · ' + extra : ''}</small></div>
      <span class="pts ${toneOf(s.total)}" data-count="${s.total}">0</span></div>`;
    })
    .join('');
  const last = t.cur === t.schedule.length - 1;
  return `<div class="sheet-scrim" data-act="closeSheet"></div><div class="sheet ${tone}" role="dialog" aria-label="Round results"><div class="in">
    <div class="row">${mascot(tone === 'bad' ? 'sad' : 'happy', 'sm ' + (tone === 'bad' ? 'droop' : 'jump'))}<div class="grow"><h2 class="title">${title}</h2><p style="font-size:15px">${hits} of ${n} made their bid · ${leadMsg}</p></div></div>
    <div class="stack" style="gap:8px">${rows}</div>
    <button class="btn ${tone === 'bad' ? 'red' : tone === 'mid' ? 'gold' : ''} wake late" data-act="trkNext">${last ? 'See final scores' : 'Next round'}</button>
    <button class="btn ghost" data-act="closeSheet">Fix something</button>
  </div></div>`;
}
