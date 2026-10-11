// @vitest-environment jsdom
/* Parity with the legacy build: the synthesiser. Every named sound, the 30 ms merge, the volume, the
   mute switch and the sea ambience must make the same Web Audio calls with the same numbers
   (see harness.ts for how the two are compared, and for the stand-in that records the calls). */
import { describe, it } from 'vite-plus/test';
import { expectParity } from './harness';
import type { Scenario } from './harness';

const everySound: Scenario = async (run) => {
  run.press('.home', { x: 10 }); // the first touch unlocks audio
  for (const [k, name] of run.sounds().entries()) {
    run.sound(name);
    run.sound(name); // at once again: merged into the first
    await run.wait(40);
    run.sound(name, k % 6);
    await run.wait(20);
    run.sound(name, 9); // 20 ms later: still merged
    await run.wait(40);
  }

  run.click('[data-act="soundSheet"]');
  run.click('[data-act="sndToggle"][data-k="ambience"]'); // the sea comes in
  await run.wait(300);
  run.slide('#vol', '35');
  run.slide('#vol', '0');
  run.slide('#vol', '100');
  run.click('[data-act="sndToggle"][data-k="sfx"]'); // muted: the sea goes too, its sources stop after 1.6 s
  run.sound('fanfare');
  await run.wait(2000);
  run.click('[data-act="sndToggle"][data-k="sfx"]');
  await run.wait(300);
  run.click('[data-act="sndToggle"][data-k="ambience"]');
  await run.wait(2000);
  run.click('[data-act="sndToggle"][data-k="haptics"]');
  run.click('[data-act="sndToggle"][data-k="haptics"]');
  run.click('.sheet [data-act="closeSheet"]');
  await run.wait(300);
};

describe('the port sounds like the legacy build', () => {
  it('makes the same Web Audio calls for every sound, the volume and the ambience', { timeout: 120_000 }, async () => {
    await expectParity(everySound, {
      reducedMotion: false,
      seed: 3,
      covers: ['createConvolver', 'createDynamicsCompressor', 'sawtooth', 'setTargetAtTime', 'vibrate 30', 'Vibration'],
    });
  });
});
