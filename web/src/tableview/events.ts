/* Events: every listener of the table renderer, and the swipe-to-reveal gesture.
   Ported from the legacy build (legacy/Skull King Tavern.html, the listeners after section 15 and
   "Swipe to reveal") without changing behavior. The legacy page registered them once and for good;
   here listen() registers them and hands back the function that removes them all. */
import { Sound } from '../sound/sound';
import { ACTIONS, CLOSING, GAME_INPUT, UI_SOUNDS } from './actions';
import { $, $$, initial, reduced } from './dom';
import type { ActionData } from './dom';
import { render } from './render';
import { clearTimer, prefs, savePrefs, session, timers, ui } from './state';
import { Tracker, trkRound } from './tracker';
import { bidText } from './views';

/** A sheet is sliding away: clicks wait until its action has run. */
let busy = false;

/* ---------- Swipe to reveal (pointer driven, works for touch and mouse) ---------- */
interface SwipeDrag {
  root: HTMLElement;
  row: string | null;
  id: number;
  x0: number;
  y0: number;
  t0: number;
  p0: number;
  p: number;
  moved: boolean;
}
let swipeDrag: SwipeDrag | null = null,
  swipeSuppressClick = false;

/** Open one swipe row by id, or close all with null. */
function setSwipe(id: string | null): void {
  ui.swipeOpen = id;
  $$('.swipe').forEach((root) => {
    const open = root.dataset.swipe === id;
    root.classList.remove('dragging', 'hint');
    root.style.setProperty('--p', open ? '1' : '0');
    root.classList.toggle('open', open);
    const del = $('.swipe-del', root);
    if (del) del.tabIndex = open ? 0 : -1;
  });
  if (id) {
    Sound.play('swipeOpen');
    Sound.buzz(8);
  }
}

function onClick(e: MouseEvent): void {
  if (swipeSuppressClick) {
    swipeSuppressClick = false;
    return;
  }
  const target = e.target instanceof Element ? e.target : null;
  if (ui.swipeOpen && !target?.closest('.swipe-del')) {
    setSwipe(null);
    return;
  }
  const el = target?.closest<HTMLElement>('[data-act]');
  if (!el || (el instanceof HTMLButtonElement && el.disabled) || busy) return;
  const fn = ACTIONS[el.dataset.act ?? ''];
  if (!fn) return;
  if (ui.waiting && GAME_INPUT.has(el.dataset.act ?? '')) return;
  const d: ActionData = Object.assign({}, el.dataset);
  const sound = UI_SOUNDS[d.act ?? ''];
  if (sound) Sound.play(sound);
  const sheets = $$('.sheet,.sheet-scrim');
  if (CLOSING.has(d.act ?? '') && sheets.length && !reduced()) {
    busy = true;
    sheets.forEach((s) => s.classList.add('leaving'));
    timers.closing = setTimeout(() => {
      busy = false;
      fn(d, el);
    }, 190);
    return;
  }
  fn(d, el);
}

/** Names on the two setup screens: saved as they are typed, and the avatar follows along. */
function onNameInput(e: Event): void {
  const t = e.target;
  if (!(t instanceof HTMLInputElement)) return;
  const ti = t.dataset.tcrew;
  if (ti != null) {
    prefs.track.players[+ti].name = t.value;
    savePrefs();
    const av = t.parentNode?.querySelector('.avatar');
    if (av) av.innerHTML = initial(t.value || String(+ti + 1));
    return;
  }
  const i = t.dataset.crew;
  if (i == null) return;
  prefs.crew[+i].name = t.value;
  savePrefs();
  const av = t.parentNode?.querySelector('.avatar');
  if (av) av.innerHTML = initial(t.value || (prefs.crew[+i].bot ? 'B' : 'Y'));
}

/** Scorekeeper: who played a Loot card and who took it. */
function onLootChange(e: Event): void {
  const t = e.target;
  if (!(t instanceof HTMLSelectElement)) return;
  const k = t.dataset.tloot;
  if (k == null || !session.trk) return;
  const f = t.dataset.f;
  if (f === 'from' || f === 'to') trkRound().loot[+k][f] = +t.value;
  Tracker.save();
  render();
}

function onSwipeKey(e: KeyboardEvent): void {
  const t = e.target;
  if (t instanceof Element && t.classList.contains('swipe-front')) {
    if (e.key === 'ArrowLeft') {
      const root = t.closest<HTMLElement>('.swipe');
      if (!root) return;
      setSwipe(root.dataset.swipe ?? null);
      $('.swipe-del', root)?.focus();
      return;
    }
  }
  if (ui.swipeOpen && (e.key === 'Escape' || e.key === 'ArrowRight')) {
    const f = $(`.swipe-${ui.swipeOpen} .swipe-front`);
    setSwipe(null);
    if (f) f.focus();
    return;
  }
}

function onSheetKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && ui.sheet && !['results', 'peek'].includes(ui.sheet)) {
    ui.sheet = null;
    render();
  }
}

function onResize(): void {
  clearTimer('resize');
  timers.resize = setTimeout(() => {
    if (ui.screen === 'game') render();
  }, 150);
}

function onSwipeStart(e: PointerEvent): void {
  const front = e.target instanceof Element ? e.target.closest('.swipe-front') : null;
  if (!front || e.button > 0) return;
  const root = front.closest<HTMLElement>('.swipe');
  if (!root) return;
  const id = root.dataset.swipe ?? null;
  if (ui.swipeOpen && ui.swipeOpen !== id) setSwipe(null); // only one row open at a time
  const p0 = ui.swipeOpen === id ? 1 : 0;
  swipeDrag = {
    root,
    row: id,
    id: e.pointerId,
    x0: e.clientX,
    y0: e.clientY,
    t0: performance.now(),
    p0,
    p: p0,
    moved: false,
  };
}

function onSwipeMove(e: PointerEvent): void {
  const d = swipeDrag;
  if (!d || e.pointerId !== d.id) return;
  const dx = e.clientX - d.x0,
    dy = e.clientY - d.y0;
  if (!d.moved) {
    if (Math.abs(dx) < 8) return;
    if (Math.abs(dy) > Math.abs(dx)) {
      swipeDrag = null;
      return;
    } // a vertical gesture belongs to scrolling
    d.moved = true;
    d.root.classList.remove('hint');
    d.root.classList.add('dragging');
  }
  const w = parseFloat(getComputedStyle(d.root).getPropertyValue('--del')) + 12;
  let p = d.p0 - dx / w;
  if (p > 1) p = 1 + (p - 1) * 0.25;
  else if (p < 0) p *= 0.25; // rubber band past either end
  d.p = p;
  d.root.style.setProperty('--p', p.toFixed(3));
}

function endSwipe(e: PointerEvent, cancelled: boolean): void {
  const d = swipeDrag;
  if (!d || e.pointerId !== d.id) return;
  swipeDrag = null;
  if (!d.moved) return;
  swipeSuppressClick = !cancelled;
  setTimeout(() => {
    swipeSuppressClick = false;
  }, 350);
  const v = ((d.p - d.p0) / Math.max(1, performance.now() - d.t0)) * 1000; // flick speed in widths per second
  const open = v > 2.2 ? true : v < -2.2 ? false : d.p > 0.5;
  setSwipe(open ? d.row : null);
}

/* ---------- The bid slider (not in the legacy build, which had a row of chips) ---------- */
/* Pointer driven like the swipe rows, and for the same reason it keeps its state here and looks
   the elements up again on every move: the table is redrawn under the finger when a bot bids. */

/** The pointer that is dragging the thumb. */
let bidDrag: number | null = null;

/** The slider on screen and the highest bid it offers. */
function bidSlider(): { root: HTMLElement; max: number } | null {
  const root = $('#bid');
  return root && !ui.waiting ? { root, max: Number(root.getAttribute('aria-valuemax')) } : null;
}

/**
 * Pick a bid without sending it. A drag paints the sheet in place, so the thumb keeps gliding; a
 * key draws the table again, as a tap on a chip did. Both leave the same markup behind.
 */
function pickBid(bid: number, redraw: boolean): void {
  ui.bidPick = bid;
  ui.just = 'pick' + bid;
  Sound.play('bidTick', bid);
  if (redraw) {
    render();
    return;
  }
  const s = bidSlider();
  if (!s) return;
  const sheet = s.root.closest('.bidsheet'),
    out = $('.bid-out', s.root),
    send = sheet && $<HTMLButtonElement>('[data-act="bid"]', sheet);
  sheet?.classList.remove('rise');
  s.root.classList.add('set');
  s.root.setAttribute('aria-valuenow', String(bid));
  s.root.setAttribute('aria-valuetext', bidText(bid));
  if (out) out.textContent = String(bid);
  $$('.bid-stops span', s.root).forEach((stop, k) => stop.classList.toggle('on', k === bid));
  if (send) {
    send.disabled = false;
    send.textContent = 'Bid ' + bid;
    send.classList.add('wake');
  }
}

/** Put the thumb at `at`, which is between two bids while it is dragged. */
function placeThumb(root: HTMLElement, at: number, max: number): void {
  root.setAttribute('style', `--v:${at};--max:${max}`);
}

function dragBid(x: number): void {
  const s = bidSlider(),
    track = s && $('.bid-track', s.root);
  if (!s || !track) return;
  const thumb = $('.bid-thumb', track)?.offsetWidth ?? 0,
    box = track.getBoundingClientRect();
  const at = Math.min(s.max, Math.max(0, ((x - box.left - thumb / 2) / Math.max(1, box.width - thumb)) * s.max));
  if (Math.round(at) !== ui.bidPick) pickBid(Math.round(at), false);
  s.root.classList.add('dragging');
  placeThumb(s.root, Math.round(at * 100) / 100, s.max);
}

function onBidStart(e: PointerEvent): void {
  if (!(e.target instanceof Element) || !e.target.closest('.bidslider') || e.button > 0 || !bidSlider()) return;
  bidDrag = e.pointerId;
  dragBid(e.clientX);
}

function onBidMove(e: PointerEvent): void {
  if (bidDrag === e.pointerId) dragBid(e.clientX);
}

/** The finger lifts: the thumb settles on the bid it was nearest to. */
function endBid(e: PointerEvent): void {
  if (bidDrag !== e.pointerId) return;
  bidDrag = null;
  const s = bidSlider();
  if (!s) return;
  s.root.classList.remove('dragging');
  placeThumb(s.root, ui.bidPick ?? 0, s.max);
}

/** Arrows step, Home and End jump to the ends, a digit sets that bid. */
function onBidKey(e: KeyboardEvent): void {
  if (!(e.target instanceof Element) || e.target.id !== 'bid' || e.altKey || e.ctrlKey || e.metaKey) return;
  const s = bidSlider();
  if (!s) return;
  const now = ui.bidPick ?? 0;
  let bid: number;
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') bid = now + 1;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') bid = now - 1;
  else if (e.key === 'Home') bid = 0;
  else if (e.key === 'End') bid = s.max;
  else if (/^\d$/.test(e.key)) bid = Number(e.key);
  else return;
  e.preventDefault();
  if (bid > s.max && e.key !== 'ArrowRight' && e.key !== 'ArrowUp') return; // a digit the round has no cards for
  bid = Math.min(s.max, Math.max(0, bid));
  if (bid !== ui.bidPick) pickBid(bid, true);
}

function onVolumeInput(e: Event): void {
  const t = e.target;
  if (!(t instanceof HTMLInputElement) || t.id !== 'vol') return;
  prefs.volume = +t.value / 100;
  savePrefs();
  Sound.setLevel();
  const out = $('#vol-out');
  if (out) out.textContent = t.value + '%';
}

function onVolumeChange(e: Event): void {
  if (e.target instanceof Element && e.target.id === 'vol') Sound.play('tick', 3);
}

/**
 * Register every listener, in the legacy order. The returned function removes them all and drops
 * what they had pending (the resize debounce, a sheet that was sliding away, a drag).
 */
export function listen(): () => void {
  busy = false;
  swipeDrag = null;
  swipeSuppressClick = false;
  bidDrag = null;
  const off = new AbortController(),
    signal = off.signal;
  document.addEventListener('click', onClick, { signal });
  document.addEventListener('input', onNameInput, { signal });
  document.addEventListener('change', onLootChange, { signal });
  document.addEventListener('keydown', onSwipeKey, { signal });
  document.addEventListener('keydown', onSheetKey, { signal });
  window.addEventListener('resize', onResize, { signal });
  document.addEventListener('pointerdown', onSwipeStart, { signal });
  window.addEventListener('pointermove', onSwipeMove, { signal });
  window.addEventListener('pointerup', (e) => endSwipe(e, false), { signal });
  window.addEventListener('pointercancel', (e) => endSwipe(e, true), { signal });
  window.addEventListener('pointerdown', () => Sound.unlock(), { once: true, capture: true, signal });
  document.addEventListener('input', onVolumeInput, { signal });
  document.addEventListener('change', onVolumeChange, { signal });
  document.addEventListener('pointerdown', onBidStart, { signal });
  window.addEventListener('pointermove', onBidMove, { signal });
  window.addEventListener('pointerup', endBid, { signal });
  window.addEventListener('pointercancel', endBid, { signal });
  document.addEventListener('keydown', onBidKey, { signal });
  return () => {
    off.abort();
    clearTimer('resize');
    clearTimer('closing');
    busy = false;
    swipeDrag = null;
    swipeSuppressClick = false;
    bidDrag = null;
  };
}
