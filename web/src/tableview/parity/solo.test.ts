// @vitest-environment jsdom
/* Parity with the legacy build: a solo game against bots, and the home screen around it
   (see harness.ts for how the two are compared). */
import { describe, it } from 'vite-plus/test';
import { expectParity } from './harness';
import type { Scenario } from './harness';

/** Home, the two sheets, the setup screen with every switch, then a whole solo game and what follows it. */
const soloGame: Scenario = async (run) => {
  run.click('[data-act="rules"]');
  run.key('.sheet', 'Escape');
  run.click('[data-act="soundSheet"]');
  run.click('[data-act="sndToggle"][data-k="ambience"]');
  run.slide('#vol', '55');
  run.click('[data-act="sndToggle"][data-k="sfx"]');
  run.click('[data-act="sndToggle"][data-k="sfx"]');
  run.click('[data-act="sndToggle"][data-k="haptics"]');
  run.click('[data-act="sndToggle"][data-k="haptics"]');
  run.click('.sheet-scrim');
  await run.wait(400);

  run.click('[data-act="setup"]');
  run.type('#crew-0', 'Mary <Read> & "Co"');
  run.click('[data-act="crewAdd"]');
  run.click('[data-act="crewAdd"]');
  run.click('[data-act="crewRm"][data-i="1"]');
  run.click('[data-act="crewKind"][data-i="2"][data-v="human"]');
  run.click('[data-act="crewKind"][data-i="2"][data-v="bot"]');
  run.click('[data-act="level"][data-v="hard"]');
  run.click('[data-act="scoring"][data-v="rascal"]');
  run.click('[data-act="scoring"][data-v="classic"]');
  run.click('[data-act="format"][data-v="swift"]');
  for (const k of ['abilities', 'loot', 'kraken', 'whale']) run.click(`[data-act="tog"][data-k="${k}"]`);
  run.click('[data-act="start"]');
  await run.wait(300);
  run.click('[data-act="board"]');
  run.click('.sheet [data-act="closeSheet"]');
  run.resize();
  await run.wait(200); // the table is drawn again once the window has settled
  await run.playToEnd();

  await run.wait(9000); // the finale, start to finish
  run.click('[data-act="board"]');
  run.click('.sheet [data-act="closeSheet"]');
  await run.wait(300);
  run.click('[data-act="again"]');
  await run.wait(4000); // a second game: bids are in, it is saved
  run.click('.game [data-act="home"]');

  // The saved game on the home screen. First by touch: a tap is not a swipe, a slow short drag springs
  // back, a quick one opens the row, a vertical drag belongs to scrolling, a long drag opens the row
  // (with a rubber band past its end), and a flick to the right closes it again.
  await run.wait(3000); // the hint animation has played
  run.press('.swipe-front', { x: 300 });
  run.pointer('pointermove', { x: 296 });
  run.pointer('pointerup', { x: 296 });
  run.press('.swipe-front', { x: 300 });
  run.pointer('pointermove', { x: 280 });
  await run.wait(600);
  run.pointer('pointerup', { x: 280 });
  run.press('.swipe-front', { x: 300 });
  run.pointer('pointermove', { x: 280 });
  await run.wait(100);
  run.pointer('pointerup', { x: 280 }); // as short, but quick: a flick opens the row
  await run.wait(400);
  run.click('.home-top'); // a tap elsewhere closes it
  run.press('.swipe-front', { x: 300 });
  run.pointer('pointermove', { x: 290, y: 40 });
  run.pointer('pointermove', { x: 200, y: 40 });
  run.pointer('pointerup', { x: 200, y: 40 });
  run.press('.swipe-front', { x: 300 });
  run.pointer('pointermove', { x: 260 });
  run.pointer('pointermove', { x: 180 }); // past the end: rubber band
  await run.wait(600);
  run.pointer('pointerup', { x: 250 });
  run.click('.swipe-front'); // the click that ends a drag is swallowed
  await run.wait(400);
  run.press('.swipe-front', { x: 300 });
  run.pointer('pointermove', { x: 320 });
  run.pointer('pointerup', { x: 320 }); // a quick flick to the right
  await run.wait(400);
  run.press('.swipe-front', { x: 300 });
  run.pointer('pointermove', { x: 250 });
  run.pointer('pointercancel', { x: 250 });
  run.click('[data-act="rules"]'); // a tap elsewhere only closes the open row
  await run.wait(400);

  // Then with the keyboard: open the row, cancel the game, take that back.
  run.key('.swipe-front', 'ArrowLeft');
  run.key('.swipe-front', 'ArrowRight');
  run.key('.swipe-front', 'ArrowLeft');
  run.click('.swipe-del');
  await run.wait(400);
  run.click('[data-act="undoCancel"]');
  run.key('.swipe-front', 'ArrowLeft');
  run.click('.swipe-del');
  await run.wait(6000); // the undo bar leaves on its own
  run.click('[data-act="setup"]');
  run.click('[data-act="home"]');
};

describe('the port shows what the legacy build shows', () => {
  it(
    'a solo game with every advanced rule, from the first tap to the cancelled rematch',
    { timeout: 120_000 },
    async () => {
      await expectParity(soloGame, {
        reducedMotion: false,
        seed: 10,
        covers: [
          'How to play',
          'Sea ambience',
          'Vibration',
          'Giant: you bid',
          'Helmsman: Choose who leads',
          'No bet',
          'Play as Pirate',
          'Kraken swallowed',
          'Loot alliance',
          'Mermaid caught the King',
          'Pirate took',
          '-ho!</span>',
          'Captain of the Seven Seas',
          'Day streak',
          'Continue · Round',
          'Game cancelled',
          'swipe-game dragging',
          'confetti asks for the canvas',
          'createOscillator',
          'vibrate 12',
        ],
      });
    },
  );
});
