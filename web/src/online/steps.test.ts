/* What steps.ts is for: a test the runner gave up on must not go on into the test after it. The
   runner's timeout cannot be asked for here, so this plays its part: a test that never ends, and
   the afterEach that comes while it is in a step. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { endSteps, step } from './steps';

/** The real clock's: the fake one stands still unless a step moves it. */
const realTimeout = setTimeout;
const aMoment = (): Promise<void> => new Promise((resolve) => void realTimeout(resolve, 5));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(async () => {
  await endSteps();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the steps of a page test', () => {
  it('does the thing and lets the fake clock run that long', async () => {
    const seen: string[] = [];
    setTimeout(() => seen.push('timer'), 300);
    await step(() => seen.push('done'), 299);
    expect(seen).toEqual(['done']);
    await step(() => {}, 1);
    expect(seen).toEqual(['done', 'timer']);
  });

  it('stops a test that is still running at the step it is in, and leaves the next test alone', async () => {
    let steps = 0;
    let ticks = 0;
    setInterval(() => ticks++, 100);
    const hung = (async (): Promise<never> => {
      for (;;) {
        await step(() => {}, 100);
        steps++;
      }
    })();
    const ending = hung.catch((error: unknown) => (error instanceof Error ? error.message : ''));
    while (steps < 3) await aMoment();

    // The runner gives up: afterEach, and then the next test with a clock of its own.
    await endSteps();
    expect(await ending).toBe('This test is over: the runner gave up on it');
    const reached = steps;
    vi.useRealTimers();
    vi.useFakeTimers();
    ticks = 0;
    setInterval(() => ticks++, 100);

    await step(() => {}, 250);
    await aMoment();
    // The old test made no step more, and the new clock ran exactly as far as its own test moved it.
    expect(steps).toBe(reached);
    expect(ticks).toBe(2);
    // A step of a test that is over does nothing at all.
    let done = false;
    const over = endSteps();
    await expect(step(() => void (done = true), 100)).rejects.toThrow('This test is over');
    await over;
    expect(done).toBe(false);
    expect(ticks).toBe(2);
  });
});
