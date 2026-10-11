/* App state of the table renderer: preferences, stats, what is on screen, and the open table.
   Ported from the legacy build (legacy/Skull King Tavern.html, section 9) without changing behavior.

   The legacy build was one closure with reassigned variables (`table`, `view`, `trk`, timers).
   A module cannot reassign what it imports, so that state lives in the exported objects below and
   every module mutates the same ones. `loadState()` fills them from storage when the table mounts. */
import { Rules } from '../game';
import type { GameState, ScoreConfig, ScoreRecord, SeatConfig, TableView } from '../game';
import type { BotLevel, CardId, Format, RoundRecord, Scoring, Seat } from '../protocol/generated';
import { Sound } from '../sound/sound';
import type { DispatchResult, GetView, Table } from '../table/table';
import { Store } from './store';

export const COLORS = ['#1cb0f6', '#ff9600', '#ce82ff', '#ff4b4b', '#58cc02', '#e5a400', '#2b70c9', '#ff5fbf'];
export const BOT_NAMES = ['Anne', 'Calico', 'Morgan', 'Ching', 'Kidd', 'Grace', 'Bart', 'Rackham'];

/** A seat on the "New game" screen. */
export interface CrewMember {
  name: string;
  bot: boolean;
}

/** The last settings of the scorekeeper's setup screen. */
export interface TrackPrefs {
  players: { name: string }[];
  scoring: Scoring;
  cannonball: boolean;
  loot: boolean;
  kraken: boolean;
  whale: boolean;
  abilities: boolean;
  format: Format;
}

/** Saved under Store.PREFS. The key order is the stored order: keep it. */
export interface Prefs {
  crew: CrewMember[];
  scoring: Scoring;
  format: Format;
  level: BotLevel;
  loot: boolean;
  kraken: boolean;
  whale: boolean;
  abilities: boolean;
  muted: boolean;
  volume: number | null;
  ambience: boolean;
  haptics: boolean;
  track: TrackPrefs;
  /** Set once the "swipe to cancel" hint has played. */
  swipeHinted?: boolean;
}

/** Saved under Store.STATS. Solo games only. */
export interface Stats {
  games: number;
  wins: number;
  made: number;
  bids: number;
  best: number | null;
  streak: number;
  lastDay: string | null;
}

const defaultPrefs = (): Prefs => ({
  crew: [
    { name: '', bot: false },
    { name: 'Anne', bot: true },
    { name: 'Calico', bot: true },
    { name: 'Morgan', bot: true },
  ],
  scoring: 'classic',
  format: 'classic',
  level: 'normal',
  loot: false,
  kraken: false,
  whale: false,
  abilities: false,
  muted: false,
  volume: 0.8,
  ambience: false,
  haptics: true,
  track: {
    players: [{ name: '' }, { name: '' }, { name: '' }, { name: '' }],
    scoring: 'classic',
    cannonball: false,
    loot: false,
    kraken: false,
    whale: false,
    abilities: false,
    format: 'classic',
  },
});
const defaultStats = (): Stats => ({ games: 0, wins: 0, made: 0, bids: 0, best: null, streak: 0, lastDay: null });

/* What a clicked button carries is a string from a data attribute: these tell a valid setting from anything else. */
export const isScoring = (v: string | undefined): v is Scoring => v === 'classic' || v === 'rascal';
export const isFormat = (v: string | undefined): v is Format => v != null && Object.hasOwn(Rules.FORMATS, v);
export const isLevel = (v: string | undefined): v is BotLevel => v === 'easy' || v === 'normal' || v === 'hard';

export const prefs: Prefs = defaultPrefs();
export const savePrefs = (): void => Store.set(Store.PREFS, prefs);
export const stats: Stats = defaultStats();
Sound.use(prefs);

/* --- the scorekeeper's saved game (see tracker.ts) --- */
export interface TrackerConfig extends ScoreConfig {
  cannonball: boolean;
  loot: boolean;
  kraken: boolean;
  whale: boolean;
  abilities: boolean;
  format: Format;
}
/** A round as the scorekeeper stores it: who called a cannonball is always there. */
export interface TrackerRecord extends RoundRecord {
  cannon: boolean[];
}
export interface TrackerState {
  version: 1;
  seats: SeatConfig[];
  cfg: TrackerConfig;
  schedule: number[];
  log: TrackerRecord[];
  cur: number;
  phase: 'bid' | 'tricks';
  /** The finished round being corrected, or null. */
  edit: number | null;
  finished: boolean;
}

/** What the scoreboard and the end screen read. An offline game's view has it, and a scoresheet makes one. */
export interface ScoreView {
  seats: SeatConfig[];
  log: ScoreRecord[];
  cfg: ScoreConfig;
  rounds: number;
  me: Seat;
}

export type Screen = 'home' | 'setup' | 'game' | 'end' | 'trackSetup' | 'track';
export type Sheet = 'sound' | 'results' | 'board' | 'rules' | 'last' | 'peek' | 'leave' | 'trkResults' | 'trkBoard';

/** What a swipe row deleted, kept for five seconds so it can be undone. */
export type Undo = { kind: 'track'; data: TrackerState | null } | { kind: 'game'; data: GameState | null };

export interface Ui {
  screen: Screen;
  sheet: Sheet | null;
  /** whose eyes the table is shown through (changes in pass-and-play) */
  seat: Seat;
  /** handoff screen between human players */
  curtain: boolean;
  sel: CardId | null;
  bidPick: number | null;
  discard: CardId[];
  toast: string | null;
  /** set the moment a human acts, cleared when the table answers: blocks double taps */
  waiting: boolean;
  /* one-render flags: each asks the next render for an animation, and render() clears them */
  enter: boolean;
  deal: boolean;
  reveal: boolean;
  bump: Seat | null;
  justSel: boolean;
  anim: boolean;
  lastPct: number | null;
  just: string | null;
  /** the "How to play" pill introduces itself when the home screen opens */
  pillIntro: boolean;
  /** the swipe row that is open, by id */
  swipeOpen: string | null;
  undo: Undo | null;
  finaleDone: boolean;
  /** where the end screen came from, so "Play again" starts the same kind of game */
  endFrom: 'game' | 'track' | null;
  /** scorekeeper: which pirates have their bonus cards open, by seat */
  open: Record<string, boolean>;
}

const initialUi = (): Ui => ({
  screen: 'home',
  sheet: null,
  seat: 0,
  curtain: false,
  sel: null,
  bidPick: null,
  discard: [],
  toast: null,
  waiting: false,
  enter: true,
  deal: false,
  reveal: false,
  bump: null,
  justSel: false,
  anim: false,
  lastPct: null,
  just: null,
  pillIntro: false,
  swipeOpen: null,
  undo: null,
  finaleDone: false,
  endFrom: null,
  open: {},
});

export const ui: Ui = initialUi();
/** Object.assign(ui, …) with the fields checked. */
export const patchUi = (patch: Partial<Ui>): void => {
  Object.assign(ui, patch);
};

/**
 * What the renderer asks of whoever put an online table on screen. Offline there is nobody to ask:
 * leaving a table there is closing a screen.
 */
export interface OnlineHooks {
  /** Give the seat up for good. An accepted leave is followed by the table's last update. */
  leave(): Promise<DispatchResult>;
  /** The table is done with on this device: take it off the screen and go back to the online screens. */
  exit(): void;
}

export interface Session {
  /** LocalTable offline, RemoteTable online */
  table: Table | null;
  /** set while the open table is an online one */
  online: OnlineHooks | null;
  /** the view currently on screen; after a scored game with real cards, that scoresheet's totals */
  view: TableView | ScoreView | null;
  /** the scoresheet of a game played with real cards */
  trk: TrackerState | null;
}
export const session: Session = { table: null, online: null, view: null, trk: null };

/** Where the renderer draws, and how it hands over to the online screens: set by mountTavern, cleared when it unmounts. */
export const stage: { app: HTMLElement | null; fx: HTMLCanvasElement | null; online: (() => void) | null } = {
  app: null,
  fx: null,
  online: null,
};

type Timer = ReturnType<typeof setTimeout>;
/** Timeouts that outlive the function that set them. */
export const timers: { undo: Timer | null; resize: Timer | null; closing: Timer | null } = {
  undo: null,
  resize: null,
  closing: null,
};
export function clearTimer(name: keyof typeof timers): void {
  const t = timers[name];
  if (t != null) clearTimeout(t);
  timers[name] = null;
}

const refill = <T extends object>(target: T, ...sources: Partial<T>[]): void => {
  for (const k of Object.keys(target)) Reflect.deleteProperty(target, k);
  Object.assign(target, ...sources);
};

/**
 * Start from what is saved on this device, as the legacy page did when it loaded.
 * The exported objects keep their identity; only their contents change.
 */
export function loadState(): void {
  refill(prefs, defaultPrefs(), Store.get<Partial<Prefs>>(Store.PREFS) || {});
  refill(stats, defaultStats(), Store.get<Partial<Stats>>(Store.STATS) || {});
  refill(ui, initialUi());
  session.table = null;
  session.online = null;
  session.view = null;
  session.trk = null;
}

export const isTableView = (v: TableView | ScoreView): v is TableView => 'phase' in v;
/** The game on screen. The game screen is only shown after openTable() has set one. */
export function tableView(): TableView {
  const v = session.view;
  if (!v || !isTableView(v)) throw new Error('No table is open');
  return v;
}
/** The scores on screen: the open game, or the scoresheet that just finished. */
export function scoreView(): ScoreView {
  const v = session.view;
  if (!v) throw new Error('No scores to show');
  return v;
}

/**
 * The seats played on this device for the game on screen: one in a solo game, several in
 * pass-and-play. The table says which they are. A scoresheet has none: nobody plays a hand on it.
 */
export const localSeatsOf = (v: TableView | ScoreView): readonly Seat[] =>
  isTableView(v) && session.table ? session.table.localSeats : [];
export const isPassAndPlay = (v: TableView | ScoreView): boolean => localSeatsOf(v).length > 1;
/** The local seat that must act next, if any. Drives the pass-and-play handoff. */
export function localActor(v: TableView): Seat | null {
  const n = v.seats.length,
    L = localSeatsOf(v);
  if (v.phase === 'bidding') {
    const next = L.slice()
      .sort((a, b) => ((a - ui.seat + n) % n) - ((b - ui.seat + n) % n))
      .find((i) => v.bids[i] == null);
    return next == null ? null : next;
  }
  if (v.phase === 'playing') return v.turn == null || !L.includes(v.turn) ? null : v.turn;
  if (v.phase === 'ability') return !v.pending || !L.includes(v.pending.seat) ? null : v.pending.seat;
  return null;
}
/** Point the screen at the right seat; raise the curtain when the device changes hands. */
export function syncSeat(getView: GetView): void {
  const actor = localActor(getView(ui.seat));
  if (actor != null && actor !== ui.seat) {
    ui.seat = actor;
    if (isPassAndPlay(getView(actor))) patchUi({ curtain: true, sel: null, bidPick: null, discard: [] });
  }
  session.view = getView(ui.seat);
}
/** In pass-and-play, a hand is only shown while its owner has something to do. */
export const handHidden = (v: TableView): boolean => isPassAndPlay(v) && localActor(v) !== v.me;
