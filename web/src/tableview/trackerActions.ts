/* Score tracker: what its buttons do. The state and the screens are in tracker.ts.
   Ported from the legacy build (legacy/Skull King Tavern.html, "tracker actions") without changing behavior. */
import { clamp } from '../game/util';
import { Sound } from '../sound/sound';
import type { SoundName } from '../sound/sound';
import type { ActionFn } from './dom';
import { confetti, playFinale } from './motion';
import { go, render } from './render';
import { isFormat, isScoring, patchUi, prefs, savePrefs, session, ui } from './state';
import type { TrackerRecord } from './state';
import { Tracker, trkCreate, trkNewRecord, trkNow, trkRound, trkValidate, trkView } from './tracker';
import type { TrackToggle } from './tracker';
import { scored } from './views';

const isToggle = (k: string | undefined): k is TrackToggle =>
  k === 'cannonball' || k === 'loot' || k === 'kraken' || k === 'whale' || k === 'abilities';
const isCount = (k: string | undefined): k is 'bids' | 'b14' | 'mp' | 'ps' =>
  k === 'bids' || k === 'b14' || k === 'mp' || k === 'ps';
const isHolder = (k: string | undefined): k is 'black14' | 'sm' => k === 'black14' || k === 'sm';

/** Change the round on screen, save, and redraw. `just` names what changed so it can animate; the rest is a sound. */
function trkSet(fn: (R: TrackerRecord) => void, just: string | null, sound?: SoundName, arg?: number): void {
  fn(trkRound());
  if (just) ui.just = just;
  Tracker.save();
  if (sound) Sound.play(sound, arg);
  render();
}
function trkFinish(): void {
  trkNow().finished = true;
  Tracker.save();
  session.view = trkView();
  ui.endFrom = 'track';
  ui.finaleDone = false;
  go('end');
  void playFinale();
}

export const TRK_ACTIONS: Record<string, ActionFn> = {
  track() {
    if (session.trk && !session.trk.finished) {
      ui.lastPct = null;
      ui.open = {};
      go('track');
    } else go('trackSetup');
  },
  trkCrewAdd() {
    if (prefs.track.players.length < 8) {
      prefs.track.players.push({ name: '' });
      ui.just = 'tadd';
      savePrefs();
      render();
    }
  },
  trkCrewRm(d) {
    prefs.track.players.splice(Number(d.i), 1);
    savePrefs();
    render();
  },
  trkScoring(d) {
    if (isScoring(d.v)) prefs.track.scoring = d.v;
    savePrefs();
    render();
  },
  trkFormat(d) {
    if (isFormat(d.v)) prefs.track.format = d.v;
    savePrefs();
    render();
  },
  trkTog(d) {
    if (!isToggle(d.k)) return;
    prefs.track[d.k] = !prefs.track[d.k];
    Sound.play(prefs.track[d.k] ? 'toggleOn' : 'toggleOff');
    savePrefs();
    render();
  },
  trkStart() {
    const s = prefs.track;
    session.trk = trkCreate(
      s.players.map((p) => p.name),
      {
        scoring: s.scoring,
        cannonball: s.scoring === 'rascal' && !!s.cannonball,
        loot: !!s.loot,
        kraken: !!s.kraken,
        whale: !!s.whale,
        abilities: !!s.abilities,
        format: s.format,
      },
    );
    Tracker.save();
    Sound.play('start');
    patchUi({ lastPct: 0, open: {} });
    go('track');
  },
  trkBid(d) {
    trkSet(
      (R) => {
        R.bids[Number(d.i)] = Number(d.v);
      },
      `tb:${d.i}:${d.v}`,
      'bidTick',
      Number(d.v),
    );
  },
  trkCannon(d) {
    trkSet(
      (R) => {
        R.cannon[Number(d.i)] = d.v === '1';
      },
      null,
      d.v === '1' ? 'clash' : 'select',
    );
  },
  trkLock() {
    if (!trkRound().bids.every((b) => b != null)) return;
    trkNow().phase = 'tricks';
    Tracker.save();
    Sound.play('yoho');
    ui.enter = true;
    window.scrollTo(0, 0);
    render();
  },
  trkBackBids() {
    trkNow().phase = 'bid';
    Tracker.save();
    ui.enter = true;
    window.scrollTo(0, 0);
    render();
  },
  trkTrick(d) {
    trkSet(
      (R) => {
        R.tricks[Number(d.i)] = Number(d.v);
      },
      `tt:${d.i}:${d.v}`,
      'bidTick',
      Number(d.v),
    );
  },
  trkStep(d) {
    trkSet(
      (R) => {
        const mn = Number(d.min),
          mx = Number(d.max),
          dd = Number(d.d);
        if (d.k === 'destroyed') {
          R.destroyed = clamp((R.destroyed || 0) + dd, mn, mx);
          return;
        }
        if (!isCount(d.k)) return;
        const i = Number(d.i),
          cur = R[d.k][i];
        R[d.k][i] = clamp(cur == null ? mn : cur + dd, mn, mx);
      },
      `ts:${d.k}:${d.i}:${d.d}`,
      Number(d.d) > 0 ? 'stepUp' : 'stepDown',
    );
  },
  trkRadio(d) {
    const k = d.k;
    if (!isHolder(k)) return;
    const on = trkRound()[k] !== Number(d.i);
    trkSet(
      (R) => {
        const i = Number(d.i);
        R[k] = R[k] === i ? -1 : i;
      },
      `tr:${k}:${d.i}`,
      on ? (k === 'sm' ? 'gong' : 'coins') : 'toggleOff',
    );
  },
  trkWager(d) {
    trkSet(
      (R) => {
        R.wager[Number(d.i)] = Number(d.v);
      },
      `tw:${d.i}:${d.v}`,
      Number(d.v) ? 'coins' : 'select',
    );
  },
  trkOpen(d) {
    const i = d.i ?? '';
    ui.open[i] = !ui.open[i];
    ui.just = `to:${d.i}`;
    render();
  },
  trkLootAdd() {
    trkSet(
      (R) => {
        if (R.loot.length < 2) R.loot.push({ from: -1, to: -1 });
      },
      null,
      'coins',
    );
  },
  trkLootRm(d) {
    trkSet(
      (R) => {
        R.loot.splice(Number(d.k), 1);
      },
      null,
      'trash',
    );
  },
  trkCheck() {
    const t = trkNow(),
      R = trkRound(t);
    if (trkValidate(R, t).length) return;
    const n = t.seats.length,
      hits = t.seats.filter((_, i) => scored(t.cfg, R, i).hit).length;
    ui.sheet = 'trkResults';
    ui.anim = true;
    render();
    if (hits === n) {
      Sound.play('fanfare');
      setTimeout(confetti, 250);
    } else Sound.play(hits * 2 >= n ? 'roundGood' : 'roundBad');
  },
  trkNext() {
    const t = trkNow();
    trkRound(t).done = true;
    ui.sheet = null;
    ui.open = {};
    if (t.cur < t.schedule.length - 1) {
      t.cur++;
      t.log.push(trkNewRecord(t.seats.length, t.schedule[t.cur]));
      t.phase = 'bid';
      Tracker.save();
      ui.enter = true;
      window.scrollTo(0, 0);
      render();
    } else trkFinish();
  },
  trkBoard() {
    ui.sheet = 'trkBoard';
    render();
  },
  trkEdit(d) {
    trkNow().edit = Number(d.r);
    Tracker.save();
    patchUi({ sheet: null, open: {}, enter: true });
    window.scrollTo(0, 0);
    render();
  },
  trkSave() {
    if (trkValidate(trkRound()).length) return;
    trkNow().edit = null;
    Tracker.save();
    Sound.play('confirm');
    ui.sheet = 'trkBoard';
    ui.enter = true;
    render();
  },
};
