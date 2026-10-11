/* Actions: what the table says (updates, queued so animations never overlap) and what the player does.
   Ported from the legacy build (legacy/Skull King Tavern.html, sections 14 and 15, and the two swipe
   actions) without changing behavior. */
import { Engine, Rules } from '../game';
import type { Action, GameState, ReduceResult, TableView } from '../game';
import type { AbilityChoice, EngineEvent, PlayedAs } from '../protocol/generated';
import { Sound } from '../sound/sound';
import type { SoundName } from '../sound/sound';
import { LocalTable } from '../table/localTable';
import type { GetView, Table } from '../table/table';
import { $, reduced } from './dom';
import type { ActionFn } from './dom';
import { banner, collectTrick, finale, finishFinale, playFinale } from './motion';
import { go, render } from './render';
import {
  BOT_NAMES,
  clearTimer,
  COLORS,
  humansOf,
  isFormat,
  isLevel,
  isPassAndPlay,
  isScoring,
  isTableView,
  patchUi,
  prefs,
  savePrefs,
  session,
  syncSeat,
  tableView,
  timers,
  ui,
} from './state';
import { recordGame } from './stats';
import { Store } from './store';
import { Tracker, trkCreate, trkNow } from './tracker';
import { TRK_ACTIONS } from './trackerActions';
import { abilityToast, scored } from './views';

type EventOf<T extends EngineEvent['type']> = Extract<EngineEvent, { type: T }>;

/** One trick, several layers: who took it, what was captured, and any beast that interfered. */
function trickSounds(v: TableView, e: EventOf<'trickResolved'>): void {
  if (e.effect === 'kraken') return Sound.play('kraken');
  if (e.effect === 'whale' && e.winner == null) return Sound.play('whale');
  if (e.effect === 'whale') Sound.play('whale');
  Sound.play(e.winner === v.me ? 'trickWin' : 'trickLose');
  if (e.winner === v.me) Sound.buzz(20);
  const c = v.lastTrick && v.lastTrick.result.captures;
  if (!c) return;
  if (c.sm) setTimeout(() => Sound.play('gong'), 180);
  else if (c.ps) setTimeout(() => Sound.play('clash'), 180);
  else if (c.mp) setTimeout(() => Sound.play('harp'), 180);
  if (c.b14 || c.black14) setTimeout(() => Sound.play('coins'), 380);
}

/* ---------- Table updates (queued so animations never overlap) ---------- */
interface Feed {
  queue: { events: EngineEvent[]; getView: GetView }[];
  pumping: boolean;
}
/** The updates still to be shown. Every mount gets a feed of its own, so a presentation that is still
    waiting on an animation when the table unmounts finds itself stale and stops. */
let feed: Feed = { queue: [], pumping: false };
export function resetFeed(): void {
  feed.queue.length = 0;
  feed = { queue: [], pumping: false };
}
function onTableUpdate(events: EngineEvent[], getView: GetView): void {
  feed.queue.push({ events, getView });
  void pump();
}
async function pump(): Promise<void> {
  const f = feed;
  if (f.pumping) return;
  f.pumping = true;
  for (let next = f.queue.shift(); next; next = f.queue.shift()) {
    try {
      await present(next.events, next.getView, () => f === feed);
    } catch (e) {
      console.error(e);
    }
  }
  f.pumping = false;
}
async function present(events: EngineEvent[], getView: GetView, current: () => boolean): Promise<void> {
  const has = (t: EngineEvent['type']): boolean => events.some((e) => e.type === t),
    find = <T extends EngineEvent['type']>(t: T): EventOf<T> | undefined =>
      events.find((e): e is EventOf<T> => e.type === t);
  const onTable = ui.screen === 'game' && !ui.curtain;
  const before = session.view;
  if (has('trickCollected') && onTable) await collectTrick(before && isTableView(before) ? before : null);
  if (has('bidsRevealed') && onTable) {
    Sound.play('yoho');
    await banner(['Yo', '-ho', '-ho!']);
  }
  const started = find('abilityStarted');
  if (started && onTable) {
    Sound.play('power');
    await banner([Rules.ABILITY[started.kind].name], Rules.ABILITY[started.kind].desc);
  }
  if (!current()) return;
  syncSeat(getView);
  ui.waiting = false;
  if (ui.screen !== 'game') return;
  const v = tableView();
  events.forEach((e) => {
    if (e.type === 'cardPlayed') {
      ui.toast = null;
      if (e.seat !== v.me) Sound.play('cardPlay', e.seat);
    }
    if (e.type === 'bidPlaced') ui.just = 'bid' + e.seat;
    if (e.type === 'trickResolved') trickSounds(v, e);
    if (e.type === 'trickCollected') Sound.play('sweep');
    if (e.type === 'abilityUsed') ui.toast = abilityToast(v, e);
  });
  const collected = find('trickCollected');
  if (collected) ui.bump = collected.winner;
  if (has('bidsRevealed')) ui.reveal = true;
  if (has('roundStarted')) {
    Sound.play('deal', v.cards);
  }
  if (has('roundStarted')) patchUi({ deal: true, sel: null, bidPick: null, sheet: null, toast: null });
  if (started && started.seat === v.me && started.kind === 'seer' && !ui.curtain) ui.sheet = 'peek';
  if (started && started.kind === 'smuggler') ui.discard = [];
  if (has('roundEnded')) {
    ui.sheet = 'results';
    ui.anim = true;
    ui.toast = null;
    const H = humansOf(v),
      R = v.log[v.round],
      good = H.some((i) => scored(v.cfg, R, i).hit);
    Sound.play(good ? 'roundGood' : 'roundBad');
    if (H.length === 1 && good) {
      let st = 0;
      for (let r = v.round; r >= 0; r--) {
        if (scored(v.cfg, v.log[r], H[0]).hit) st++;
        else break;
      }
      if (st >= 3) setTimeout(() => Sound.play('streak', st), 520);
    }
  }
  if (v.phase === 'playing' && v.turn === v.me && ui.sel != null && !v.legal.includes(ui.sel)) ui.sel = null;
  if (
    v.phase === 'playing' &&
    v.turn === v.me &&
    (has('cardPlayed') || has('trickCollected') || has('abilityUsed')) &&
    !ui.curtain
  ) {
    Sound.play('yourTurn');
    Sound.buzz(15);
  }
  if (has('gameOver')) {
    recordGame(v);
    Store.set(Store.GAME, null);
    if (session.table) session.table.stop();
    ui.endFrom = 'game';
    ui.finaleDone = false;
    go('end');
    void playFinale();
    return;
  }
  render();
}

/* ---------- Actions ---------- */
function startGame(): void {
  const seats = prefs.crew.map((c, i) => ({
    name: (c.name || '').trim() || (c.bot ? BOT_NAMES[i % BOT_NAMES.length] : i === 0 ? 'You' : 'Player ' + (i + 1)),
    color: COLORS[i],
    bot: !!c.bot,
  }));
  const state = Engine.create({
    seats,
    scoring: prefs.scoring,
    loot: prefs.loot,
    kraken: prefs.kraken,
    whale: prefs.whale,
    abilities: prefs.abilities,
    level: prefs.level,
    format: prefs.format,
    seed: (Math.random() * 2 ** 32) >>> 0,
  });
  openTable(state);
  patchUi({ deal: true, lastPct: 0 });
  go('game');
}
function openTable(state: GameState): void {
  if (session.table) session.table.stop();
  feed.queue.length = 0;
  const table: Table = new LocalTable(state, (s) => Store.saveGame(s));
  session.table = table;
  table.subscribe(onTableUpdate);
  const first = state.seats.findIndex((p) => !p.bot);
  patchUi({
    seat: first < 0 ? 0 : first,
    sel: null,
    bidPick: null,
    discard: [],
    toast: null,
    sheet: null,
    waiting: false,
  });
  syncSeat((seat) => table.view(seat));
  ui.curtain = isPassAndPlay(tableView());
  table.schedule();
}
/** Send a human action. Input stays locked until the table's answer has been presented. */
function act(action: Action): ReduceResult {
  const table = session.table;
  if (!table) throw new Error('No table is open');
  ui.waiting = true;
  const r = table.dispatch(action);
  if (r.error) ui.waiting = false;
  render();
  return r;
}
function myPlay(as?: PlayedAs): void {
  if (ui.sel == null) return;
  const view = tableView(),
    card = view.deck[ui.sel];
  if (card.kind === 'tigress' && !as) return;
  Sound.play('cardPlay', view.me);
  Sound.buzz(12);
  const played = ui.sel;
  ui.sel = null;
  const r = act({ type: 'play', seat: view.me, card: played, as });
  if (r.error) ui.sel = played;
}
function useAbility(choice: AbilityChoice): void {
  act({ type: 'ability', seat: tableView().me, choice });
}

export const ACTIONS: Record<string, ActionFn | undefined> = {
  home() {
    finale.token++;
    if (session.table) session.table.stop();
    go('home');
  },
  setup() {
    go('setup');
  },
  resume() {
    const s = Store.loadGame();
    if (!s) return go('home');
    openTable(s);
    ui.lastPct = null;
    go('game');
  },
  rules() {
    ui.sheet = 'rules';
    render();
  },
  board() {
    if (ui.screen === 'end') finishFinale();
    ui.sheet = 'board';
    render();
  },
  skipFinale() {
    if (!ui.finaleDone) finishFinale();
  },
  last() {
    ui.sheet = 'last';
    render();
  },
  peek() {
    ui.sheet = 'peek';
    render();
  },
  seerDone() {
    ui.sheet = null;
    useAbility(null);
  },
  results() {
    ui.sheet = 'results';
    ui.anim = true;
    render();
  },
  closeSheet() {
    ui.sheet = null;
    render();
  },
  reveal() {
    const view = tableView();
    ui.curtain = false;
    ui.enter = true;
    if (view.phase === 'ability' && view.pending?.kind === 'seer' && view.pending.seat === view.me) ui.sheet = 'peek';
    render();
  },
  soundSheet() {
    ui.sheet = 'sound';
    render();
  },
  sndToggle(d) {
    const k = d.k;
    if (k !== 'sfx' && k !== 'ambience' && k !== 'haptics') return;
    if (k === 'sfx') prefs.muted = !prefs.muted;
    else prefs[k] = !prefs[k];
    savePrefs();
    Sound.setLevel();
    const on = k === 'sfx' ? !prefs.muted : prefs[k];
    Sound.play(on ? 'toggleOn' : 'toggleOff');
    if (k === 'haptics' && on) Sound.buzz(30);
    render();
  },
  crewKind(d) {
    prefs.crew[Number(d.i)].bot = d.v === 'bot';
    savePrefs();
    render();
  },
  crewAdd() {
    const used = new Set(prefs.crew.map((c) => c.name));
    prefs.crew.push({ name: BOT_NAMES.find((b) => !used.has(b)) || '', bot: true });
    ui.just = 'add';
    savePrefs();
    render();
  },
  crewRm(d) {
    prefs.crew.splice(Number(d.i), 1);
    savePrefs();
    render();
  },
  level(d) {
    if (isLevel(d.v)) prefs.level = d.v;
    ui.just = 'level' + d.v;
    savePrefs();
    render();
  },
  scoring(d) {
    if (isScoring(d.v)) prefs.scoring = d.v;
    savePrefs();
    render();
  },
  format(d) {
    if (isFormat(d.v)) prefs.format = d.v;
    savePrefs();
    render();
  },
  tog(d) {
    const k = d.k;
    if (k !== 'abilities' && k !== 'loot' && k !== 'kraken' && k !== 'whale') return;
    prefs[k] = !prefs[k];
    Sound.play(prefs[k] ? 'toggleOn' : 'toggleOff');
    savePrefs();
    render();
  },
  start() {
    Sound.play('start');
    startGame();
  },
  again() {
    finale.token++;
    if (ui.endFrom === 'track') {
      const trk = trkNow();
      session.trk = trkCreate(
        trk.seats.map((p) => p.name),
        trk.cfg,
      );
      Tracker.save();
      patchUi({ lastPct: 0, open: {} });
      return go('track');
    }
    startGame();
  },
  bid() {
    if (ui.bidPick == null) return;
    const b = ui.bidPick;
    ui.bidPick = null;
    act({ type: 'bid', seat: tableView().me, bid: b });
  },
  pick(d, el) {
    const id = Number(d.id),
      v = tableView();
    if (v.phase === 'ability' && v.pending?.kind === 'smuggler' && v.pending.seat === v.me) {
      const k = (v.pending.drawn ?? []).length,
        i = ui.discard.indexOf(id);
      if (i >= 0) ui.discard.splice(i, 1);
      else if (ui.discard.length < k) ui.discard.push(id);
      Sound.play('select2');
      return render();
    }
    const myTurn = v.phase === 'playing' && v.turn === v.me;
    if (v.phase !== 'bidding' && v.phase !== 'playing') return;
    if (myTurn && !v.legal.includes(id)) {
      Sound.play('nope');
      Sound.buzz(40);
      el.classList.remove('nope');
      void el.offsetWidth;
      el.classList.add('nope');
      return;
    }
    if (myTurn && ui.sel === id) {
      if (v.deck[id].kind !== 'tigress') return myPlay(); // second tap on the lifted card plays it
      ui.justSel = true;
      return render(); // Tigress: nudge the Pirate / Escape choice
    }
    ui.sel = ui.sel === id && !myTurn ? null : id;
    ui.justSel = ui.sel != null;
    Sound.play('select2');
    render();
  },
  play(d) {
    myPlay(d.as === 'pirate' || d.as === 'escape' ? d.as : undefined);
  },
  ability(d) {
    const view = tableView();
    if (view.pending && view.pending.kind === 'smuggler') {
      const ch = ui.discard.slice();
      ui.discard = [];
      return useAbility(ch);
    }
    useAbility(d.v == null ? null : Number(d.v));
  },
  next() {
    ui.sheet = null;
    act({ type: 'advance' });
  },
  ...TRK_ACTIONS,
  /** Delete what a swipe row stands for: the saved bot game or the scoresheet. Undo stays available for 5 seconds. */
  swipeDelete(d, el) {
    const kind = d.swipe,
      root = el.closest<HTMLElement>('.swipe');
    if (kind === 'track') {
      ui.undo = { kind, data: session.trk };
      session.trk = null;
      Tracker.save();
    } else {
      ui.undo = { kind: 'game', data: Store.loadGame() };
      Store.set(Store.GAME, null);
      if (session.table) {
        session.table.stop();
        session.table = null;
      }
    }
    ui.swipeOpen = null;
    Sound.play('trash');
    Sound.buzz(25);
    const done = (): void => {
      if (kind === 'track') ui.just = 'trackReset';
      render();
    };
    if (root && !reduced()) {
      const h = root.offsetHeight;
      const end =
        kind === 'track'
          ? { opacity: 0, transform: 'translateX(-24px) scale(.96)' }
          : { height: '0px', opacity: 0, transform: 'translateX(-24px) scale(.96)' };
      void root
        .animate(
          [
            { height: h + 'px', opacity: 1, transform: 'none' },
            { height: h + 'px', ...end },
          ],
          { duration: 280, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' },
        )
        .finished.then(done, done);
    } else done();
    clearTimer('undo');
    timers.undo = setTimeout(() => {
      ui.undo = null;
      const bar = $('.undo-bar');
      if (bar && !reduced())
        void bar.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }).finished.then(() => {
          if (ui.screen === 'home') render();
        });
      else if (ui.screen === 'home') render();
    }, 5000);
  },
  undoCancel() {
    const u = ui.undo;
    if (u && u.kind === 'track') {
      session.trk = u.data;
      Tracker.save();
    } else if (u && u.data) Store.saveGame(u.data);
    ui.undo = null;
    clearTimer('undo');
    render();
  },
};

/** Plain interface sounds by action. Actions with sounds that depend on what happened call Sound.play themselves. */
export const UI_SOUNDS: Record<string, SoundName | undefined> = {
  home: 'back',
  setup: 'tap',
  resume: 'confirm',
  rules: 'sheetUp',
  board: 'sheetUp',
  last: 'sheetUp',
  results: 'sheetUp',
  peek: 'sheetUp',
  soundSheet: 'sheetUp',
  closeSheet: 'sheetDown',
  seerDone: 'sheetDown',
  reveal: 'whoosh',
  next: 'confirm',
  again: 'start',
  bid: 'confirm',
  ability: 'confirm',
  scoring: 'select',
  format: 'select',
  level: 'select',
  crewKind: 'select',
  crewAdd: 'select',
  crewRm: 'back',
  undoCancel: 'undo',
  track: 'tap',
  trkScoring: 'select',
  trkFormat: 'select',
  trkCrewAdd: 'select',
  trkCrewRm: 'back',
  trkBoard: 'sheetUp',
  trkEdit: 'tap',
  trkOpen: 'tap',
  trkBackBids: 'back',
  trkNext: 'confirm',
  trkCheck: 'tap',
};
/** Actions that close a sheet: it slides away first, then the action runs. */
export const CLOSING = new Set(['closeSheet', 'next', 'seerDone', 'trkNext']);
/** Actions that talk to the table: ignored while the last one is still unanswered. */
export const GAME_INPUT = new Set(['bid', 'pick', 'play', 'ability', 'peek', 'seerDone', 'next']);
