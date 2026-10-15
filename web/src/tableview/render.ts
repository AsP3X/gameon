/* Render: turns the state into the page. One call rebuilds #app from strings, then replays the
   motion that connects the old picture to the new one.
   Ported from the legacy build (legacy/Skull King Tavern.html, section 13) without changing behavior. */
import { Sound } from '../sound/sound';
import { AWARDS_TIGHT } from './awards';
import { endDeal, paintDeal, startDeal } from './deal';
import { $, $$, sgn } from './dom';
import { animateBar, countUp, flip, snapshot } from './motion';
import { clearTimer, patchUi, placeNow, scoreView, stage, tableView, ui } from './state';
import type { Screen, Sheet } from './state';
import { trackScreen, trkResultsSheet, trkSetupView, trkView } from './tracker';
import {
  awardTiles,
  boardSheet,
  curtainView,
  endView,
  gameView,
  homeView,
  lastSheet,
  leaveSheet,
  peekSheet,
  resultsSheet,
  roundResults,
  rulesSheet,
  setupView,
  soundSheet,
  welcomeSheet,
} from './views';

const VIEWS: Record<Screen, () => string> = {
  home: homeView,
  setup: setupView,
  game: gameView,
  end: endView,
  trackSetup: trkSetupView,
  track: trackScreen,
};
const SHEETS: Record<Sheet, () => string> = {
  sound: soundSheet,
  results: resultsSheet,
  board: () => boardSheet(),
  rules: rulesSheet,
  last: lastSheet,
  peek: peekSheet,
  leave: leaveSheet,
  trkResults: trkResultsSheet,
  trkBoard: () => boardSheet(trkView(), true),
  welcome: welcomeSheet,
};

/** Set once the welcome has been closed. */
let menuArmed = false;

/** A fresh page open has not closed the welcome yet. */
export function resetMenuMusic(): void {
  menuArmed = false;
}

/**
 * The theme plays after the welcome, through the menus, and stops when a game
 * is on screen. The end screen stays quiet. The home screen brings it back.
 * A background tab pauses it.
 */
function menuOn(): boolean {
  if (!stage.app || !menuArmed || document.hidden) return false;
  return ui.screen !== 'game' && ui.screen !== 'end';
}

/** The welcome's close is the tap that starts the theme. Call it inside that click. */
export function armMenuMusic(): void {
  menuArmed = true;
  Sound.unlock();
  Sound.music(menuOn());
}

/** Start or stop the theme for whatever is on screen now. */
export function tuneMenu(): void {
  Sound.music(menuOn());
}

/** The dialogs a redraw may put over the page: a sheet, or the pass-and-play curtain. */
const DIALOG = '.sheet, .curtain';
/** Which dialog the last redraw left open, and what had the keyboard when it opened. */
const over: { name: string | null; opener: (() => HTMLElement | null) | null } = { name: null, opener: null };

/** Every data attribute of a control, in one string: what it does and to what. */
const dataOf = (el: HTMLElement): string =>
  JSON.stringify(Object.entries(el.dataset).toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/**
 * A redraw replaces every element, so the one that has the keyboard is gone after it. This names
 * that control in a way the next picture can answer: by its id, or by its tag, its data attributes
 * and which of its kind it is. The answer is how to find it again, or null when nothing in the
 * page had the keyboard or the control cannot be told from the others.
 */
function focused(app: HTMLElement): (() => HTMLElement | null) | null {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement) || el === app || el === document.body) return null;
  // A control of the page around the renderer (the home it draws itself): a redraw leaves it as it is.
  if (!app.contains(el)) return () => (el.isConnected ? el : null);
  if (el.id) {
    const id = el.id;
    return () => document.getElementById(id);
  }
  const tag = el.tagName,
    data = dataOf(el);
  if (data === '[]') return null;
  const alike = (): HTMLElement[] =>
    Array.from(app.querySelectorAll<HTMLElement>(tag)).filter((other) => dataOf(other) === data);
  const index = alike().indexOf(el);
  return () => alike()[index] ?? null;
}

/**
 * After a redraw: the keyboard goes back to the control it was on. A dialog that has just opened
 * takes it instead, and what is behind any dialog takes no input while it is open; the scrim stays
 * live, because tapping it is how a sheet is closed. When the dialog closes, the keyboard returns
 * to what opened it.
 */
function keepFocus(app: HTMLElement, before: (() => HTMLElement | null) | null): void {
  const dialog = $(DIALOG, app),
    name = dialog ? (ui.curtain && ui.screen === 'game' ? 'curtain' : ui.sheet) : null;
  for (const child of Array.from(app.children))
    if (child instanceof HTMLElement) child.inert = dialog != null && !child.matches(`${DIALOG}, .sheet-scrim`);
  const opened = name != null && name !== over.name,
    closed = name == null && over.name != null;
  if (opened && over.name == null) over.opener = before;
  over.name = name;
  if (opened || closed) stage.dialog?.(name != null);
  if (dialog && (opened || !dialog.contains(before?.() ?? null))) {
    dialog.tabIndex = -1;
    dialog.focus({ preventScroll: true });
    return;
  }
  const back = closed ? over.opener : before;
  if (closed) over.opener = null;
  back?.()?.focus({ preventScroll: true });
}

/**
 * The end screen is one screen without scrolling. Six awards and everything else on it are more
 * than a small phone holds: then it keeps four. Tiles the finale has turned over stay turned over.
 */
export function fitAwards(): void {
  const end = $('.end'),
    box = $('.awards');
  if (!end || !box || end.scrollHeight <= end.clientHeight) return;
  const turned = $('.award.in', box) != null;
  box.innerHTML = awardTiles(scoreView(), AWARDS_TIGHT);
  if (turned) $$('.award', box).forEach((tile) => tile.classList.add('in'));
}

export function render(): void {
  const app = stage.app;
  if (!app) return; // unmounted: a late timer or a finished animation has nothing to draw on
  tuneMenu();
  // The results sheet belongs to a round's end. Over any other phase it would cover, and take out of
  // reach, a table that is waiting for a bid or a card: so it is closed before anything is drawn.
  if (ui.screen === 'game' && ui.sheet === 'results' && !roundResults(tableView())) ui.sheet = null;
  // A round dealt just now is shown being dealt, unless the felt is covered: then, and whenever the
  // felt gets covered or left while a deal is shown, everything is simply where it ends up.
  if (ui.screen !== 'game' || ui.curtain || ui.sheet) endDeal();
  else if (ui.deal) startDeal(tableView());
  const snap = ui.screen === 'game' && !ui.curtain ? snapshot() : null;
  // A page that draws the home itself leaves the renderer nothing to draw there but a sheet.
  const blank = ui.screen === 'home' && stage.pageHome;
  let html = blank ? '' : VIEWS[ui.screen]();
  if (ui.screen === 'game' && ui.curtain) html += curtainView();
  else if (ui.sheet) html += SHEETS[ui.sheet]();
  app.toggleAttribute('data-enter', ui.enter);
  app.classList.toggle('full', ui.screen === 'end' || (ui.screen === 'home' && !blank));
  // A redraw must not take a control from under the keyboard: a bot's bid redraws the table while
  // the player is still stepping through theirs, or is on a card.
  const before = focused(app);
  app.innerHTML = html;
  keepFocus(app, before);
  if (ui.screen === 'end') fitAwards();
  paintDeal();
  flip(snap);
  animateBar();
  if (ui.anim || ui.enter) {
    ui.anim = false;
    countUp();
  } else {
    // A redraw that is not the first showing (somebody else readied, say) shows the figures where
    // the count would have ended, not the 0 it starts from.
    $$('[data-count]', app).forEach((el) => {
      el.textContent = (el.hasAttribute('data-plain') ? String : sgn)(Number(el.dataset.count));
    });
  }
  patchUi({ enter: false, deal: false, reveal: false, bump: null, justSel: false, just: null });
}

/** Set while the page's address is what moves the renderer: then the page is not told what it already knows. */
let led = false;

/** Go to a screen because the address says so, without telling the page that the renderer moved. */
export function follow(move: () => void): void {
  led = true;
  try {
    move();
  } finally {
    led = false;
  }
}

export function go(screen: Screen): void {
  if (screen !== 'home') {
    ui.swipeOpen = null;
    ui.undo = null;
    clearTimer('undo');
  }
  ui.screen = screen;
  ui.enter = true;
  ui.sheet = null;
  ui.pillIntro = screen === 'home';
  window.scrollTo(0, 0);
  render();
  ui.pillIntro = false;
  if (!led) stage.moved?.(placeNow());
}
