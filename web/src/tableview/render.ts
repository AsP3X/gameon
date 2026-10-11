/* Render: turns the state into the page. One call rebuilds #app from strings, then replays the
   motion that connects the old picture to the new one.
   Ported from the legacy build (legacy/Skull King Tavern.html, section 13) without changing behavior. */
import { animateBar, countUp, flip, snapshot } from './motion';
import { clearTimer, patchUi, stage, ui } from './state';
import type { Screen, Sheet } from './state';
import { trackScreen, trkResultsSheet, trkSetupView, trkView } from './tracker';
import {
  boardSheet,
  curtainView,
  endView,
  gameView,
  homeView,
  lastSheet,
  peekSheet,
  resultsSheet,
  rulesSheet,
  setupView,
  soundSheet,
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
  trkResults: trkResultsSheet,
  trkBoard: () => boardSheet(trkView(), true),
};

export function render(): void {
  const app = stage.app;
  if (!app) return; // unmounted: a late timer or a finished animation has nothing to draw on
  const snap = ui.screen === 'game' && !ui.curtain ? snapshot() : null;
  let html = VIEWS[ui.screen]();
  if (ui.screen === 'game' && ui.curtain) html += curtainView();
  else if (ui.sheet) html += SHEETS[ui.sheet]();
  app.toggleAttribute('data-enter', ui.enter);
  app.classList.toggle('full', ui.screen === 'end' || ui.screen === 'home');
  app.innerHTML = html;
  flip(snap);
  animateBar();
  if (ui.anim || ui.enter) {
    ui.anim = false;
    countUp();
  }
  patchUi({ enter: false, deal: false, reveal: false, bump: null, justSel: false, just: null });
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
}
