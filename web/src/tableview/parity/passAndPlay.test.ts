// @vitest-environment jsdom
/* Parity with the legacy build: two people sharing one device (see harness.ts for how the two are compared). */
import { describe, it } from 'vite-plus/test';
import { expectParity } from './harness';
import type { Scenario } from './harness';

/** Two people and a bot on one device, Rascal scoring, every advanced card. */
const passAndPlay: Scenario = async (run) => {
  run.click('[data-act="setup"]');
  run.click('[data-act="crewRm"][data-i="3"]');
  run.click('[data-act="crewKind"][data-i="1"][data-v="human"]');
  run.type('#crew-1', "O'Malley");
  run.click('[data-act="level"][data-v="easy"]');
  run.click('[data-act="scoring"][data-v="rascal"]');
  run.click('[data-act="format"][data-v="swift"]');
  for (const k of ['abilities', 'loot', 'kraken', 'whale']) run.click(`[data-act="tog"][data-k="${k}"]`);
  run.click('[data-act="start"]');
  await run.playToEnd();
  await run.wait(1000);
  run.click('.end'); // tap to skip the finale
  await run.wait(500);
  run.click('.end-actions [data-act="home"]');
};

describe('the port shows what the legacy build shows', () => {
  it(
    'pass-and-play, reduced motion: the Smuggler, the Seer, the Giant and the Tigress',
    { timeout: 120_000 },
    async () => {
      await expectParity(passAndPlay, {
        reducedMotion: true,
        seed: 4,
        covers: [
          'Pass to ',
          'Smuggler: you drew',
          'Not in play this round',
          'Giant: you bid',
          'Play as Pirate',
          'Kraken swallowed',
          'Loot alliance',
          'humans hit their bid',
        ],
      });
    },
  );
  it('pass-and-play, full motion: the Giant, the Gambler and the White Whale', { timeout: 120_000 }, async () => {
    await expectParity(passAndPlay, {
      reducedMotion: false,
      seed: 1,
      covers: ['Pass to ', 'Giant: you bid', 'No bet', 'Kraken swallowed', 'White Whale sank', '-ho!</span>'],
    });
  });
});
