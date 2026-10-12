/* The table renderer: the legacy single-file UI, lifted into modules and mounted as one unit.
   It owns the element it is given and rebuilds it from HTML strings; React never renders inside it.

     dom, art          helpers and artwork, all strings
     store, state      what is saved on this device, and what is on screen
     views, tracker    state -> HTML (the offline game, the scorekeeper)
     motion, render    HTML -> page, with the animation in between
     actions, events   what the table says and what the player does

   The legacy page ran once per page load. mountTavern() is that page load; the function it returns
   is what the legacy page never needed: it takes everything off the page again. */
import { Sound } from '../sound/sound';
import { resetFeed } from './actions';
import { SPRITE } from './art';
import { $$ } from './dom';
import { listen } from './events';
import { finale } from './motion';
import { render, resetMenuMusic, tuneMenu } from './render';
import { clearTimer, loadState, prefs, savePrefs, session, stage, ui } from './state';
import { Tracker } from './tracker';

export { closeOnlineTable, openOnlineTable, showOnlineResult, showPlace } from './actions';
export type { OnlineHooks, Place } from './state';
import type { Place } from './state';

/** What the page around the renderer does for it. */
export interface TavernHooks {
  /** "Play online" on the home screen: the online screens are React's, not the renderer's. */
  online?: () => void;
  /** The renderer went to another place because the player tapped something: the address follows. */
  moved?: (place: Place) => void;
}

/**
 * Tell the renderer that the page shows something else in its place (the online screens), or that
 * it is back. What it drew stays as it was. The theme stops while a game is on screen.
 */
export function coverTavern(covered: boolean): void {
  stage.covered = covered;
  tuneMenu();
}

/** How long the one-time "swipe to cancel" hint takes to play: its delay plus its animation (swipeHint in tavern.css). */
const SWIPE_HINT_MS = 2700;

/** The cleanup of the mounted table, if there is one: two renderers would fight over the same state. */
let mounted: (() => void) | null = null;

/**
 * Draw the table into `app`, with `fx` as the confetti canvas, and start listening.
 * Returns the cleanup: it removes every listener, stops the table's timers and what else was pending,
 * and takes the sprite and the screen off the page. Safe to call twice, and safe under React
 * StrictMode (mount, cleanup, mount). `hooks` is what the renderer asks the page around it to do.
 */
export function mountTavern(app: HTMLElement, fx: HTMLCanvasElement, hooks: TavernHooks = {}): () => void {
  mounted?.();
  loadState();
  resetMenuMusic();
  session.trk = Tracker.load();
  resetFeed();
  stage.app = app;
  stage.fx = fx;
  stage.online = hooks.online ?? null;
  stage.moved = hooks.moved ?? null;

  /* ---------- boot ---------- */
  document.body.insertAdjacentHTML('afterbegin', SPRITE);
  const sprite = document.body.firstElementChild;
  const unlisten = listen();
  const unhinted = !prefs.swipeHinted;
  ui.pillIntro = true;
  if (ui.screen === 'home' && Sound.asksToStart()) ui.sheet = 'welcome';
  render();
  ui.pillIntro = false;
  // The first render may have spent the one-time swipe hint (views.ts, swipeContinue).
  const hintedAt = unhinted && prefs.swipeHinted ? performance.now() : null;

  const cleanup = (): void => {
    if (mounted !== cleanup) return;
    mounted = null;
    // Taken off the page before that hint could play (StrictMode mounts twice): the next mount shows it.
    if (hintedAt != null && performance.now() - hintedAt < SWIPE_HINT_MS) {
      delete prefs.swipeHinted;
      savePrefs();
    }
    unlisten();
    if (session.table) session.table.stop();
    finale.token++;
    clearTimer('undo');
    resetFeed();
    Sound.hush();
    $$('.banner').forEach((el) => el.remove());
    sprite?.remove();
    app.removeAttribute('data-enter');
    app.classList.remove('full');
    app.innerHTML = '';
    fx.hidden = true;
    stage.app = null;
    stage.fx = null;
    stage.online = null;
    stage.moved = null;
  };
  mounted = cleanup;
  return cleanup;
}
