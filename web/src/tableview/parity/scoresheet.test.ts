// @vitest-environment jsdom
/* Parity with the legacy build: the scorekeeper for a game with real cards
   (see harness.ts for how the two are compared). */
import { describe, it } from 'vite-plus/test';
import { expectParity } from './harness';
import type { Scenario } from './harness';

/** The scorekeeper: a three-player game with real cards, with every kind of entry and a correction. */
const scoresheet: Scenario = async (run) => {
  run.click('[data-act="track"]');
  run.click('[data-act="trkCrewAdd"]');
  run.click('[data-act="trkCrewRm"][data-i="4"]');
  run.click('[data-act="trkCrewRm"][data-i="3"]');
  run.type('#tcrew-0', 'Anne <b>');
  run.type('#tcrew-2', 'Bonny & Read');
  run.click('[data-act="trkScoring"][data-v="rascal"]');
  for (const k of ['cannonball', 'loot', 'kraken', 'whale', 'abilities'])
    run.click(`[data-act="trkTog"][data-k="${k}"]`);
  run.click('[data-act="trkFormat"][data-v="swift"]');
  run.click('[data-act="trkStart"]');

  const bid = (i: number, v: number): void => run.click(`[data-act="trkBid"][data-i="${i}"][data-v="${v}"]`);
  const won = (i: number, v: number): void => run.click(`[data-act="trkTrick"][data-i="${i}"][data-v="${v}"]`);
  const step = (k: string, i: number, d: number): void =>
    run.click(`[data-act="trkStep"][data-k="${k}"][data-i="${i}"][data-d="${d}"]`);

  // Round 1: everything the tricks screen can record, and the mistakes it catches on the way.
  bid(0, 2);
  bid(1, 0);
  bid(2, 4);
  run.click('[data-act="trkCannon"][data-i="2"][data-v="1"]');
  run.click('[data-act="trkCannon"][data-i="0"][data-v="1"]');
  run.click('[data-act="trkCannon"][data-i="0"][data-v="0"]');
  run.click('[data-act="trkLock"]');
  run.click('[data-act="trkBackBids"]');
  bid(2, 3);
  run.click('[data-act="trkLock"]');
  won(0, 2);
  won(1, 0);
  won(2, 3); // 5 of 5
  step('destroyed', -1, 1); // one trick lost to the Kraken: the tricks no longer add up
  won(2, 2);
  step('bids', 2, -1);
  run.click('[data-act="trkOpen"][data-i="0"]');
  step('b14', 0, 1);
  step('b14', 0, 1);
  step('b14', 0, -1);
  run.click('[data-act="trkRadio"][data-k="black14"][data-i="0"]');
  step('mp', 0, 1);
  step('ps', 0, 1);
  run.click('[data-act="trkRadio"][data-k="sm"][data-i="0"]'); // a Mermaid took the King: now the Pirate bonus cannot be
  step('ps', 0, -1);
  run.click('[data-act="trkWager"][data-i="0"][data-v="20"]');
  run.click('[data-act="trkOpen"][data-i="1"]');
  step('b14', 1, 1); // a bonus for somebody who took no tricks
  step('b14', 1, -1);
  run.click('[data-act="trkOpen"][data-i="1"]');
  run.click('[data-act="trkLootAdd"]');
  run.choose('#tloot-from-0', '2');
  run.choose('#tloot-to-0', '2'); // an alliance with yourself
  run.choose('#tloot-to-0', '0');
  run.click('[data-act="trkLootAdd"]');
  run.click('[data-act="trkLootRm"][data-k="1"]');
  run.click('[data-act="trkCheck"]');
  await run.wait(400); // a perfect round: confetti is due
  run.click('.sheet [data-act="closeSheet"]'); // "Fix something"
  await run.wait(300);
  run.click('[data-act="trkCheck"]');
  run.click('[data-act="trkNext"]');
  await run.wait(300);

  // Rounds 2 to 5, with a look at the board and a correction of round 1 in between.
  for (let r = 1; r < 5; r++) {
    bid(0, r % 3);
    bid(1, (r + 1) % 4);
    bid(2, 5 - r);
    run.click('[data-act="trkLock"]');
    won(0, r);
    won(1, 5 - r);
    won(2, 0);
    if (r === 2) {
      run.click('[data-act="trkBoard"]');
      run.click('tr.editable[data-r="0"]');
      won(0, 1);
      won(1, 1);
      run.click('[data-act="trkSave"]');
      run.key('.sheet', 'Escape');
    }
    run.click('[data-act="trkCheck"]');
    await run.wait(200);
    run.click('[data-act="trkNext"]');
    await run.wait(300);
    if (r === 3) {
      run.click('.wrap [data-act="home"]');
      run.click('[data-act="track"]');
    }
  }
  await run.wait(9000); // the finale
  run.click('[data-act="board"]');
  run.click('.sheet [data-act="closeSheet"]');
  await run.wait(300);
  run.click('[data-act="again"]');
  bid(0, 1);
  run.click('.wrap [data-act="home"]');

  // The unfinished sheet on the home screen: delete it, take that back, delete it for good.
  run.key('.swipe-front', 'ArrowLeft');
  run.click('.swipe-del');
  await run.wait(400);
  run.click('[data-act="undoCancel"]');
  run.key('.swipe-front', 'ArrowLeft');
  run.click('.swipe-del');
  await run.wait(6000);
  run.click('[data-act="track"]');
};

describe('the port shows what the legacy build shows', () => {
  for (const reducedMotion of [true, false]) {
    it(`the scorekeeper, ${reducedMotion ? 'reduced' : 'full'} motion`, { timeout: 120_000 }, async () => {
      await expectParity(scoresheet, {
        reducedMotion,
        seed: 5,
        covers: [
          'Cannonball',
          'Tricks add up to',
          'If a Mermaid caught the Skull King',
          'took no tricks, so can',
          'an alliance needs two different pirates',
          'Perfect round!',
          ' leads with ',
          'Editing',
          'Captain of the Seven Seas',
          'Continue scoring',
          'Scoresheet deleted',
        ],
      });
    });
  }
});
