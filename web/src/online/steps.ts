/* The steps of a page test: what the test does to the page, and the page's answer on the fake clock.

   A test the runner gave up on is not stopped by it. Its function is still in a step, and would go
   on from there into the next test: on that test's clock, clicking in that test's page, inside an
   act() that the teardown cut across. One timeout then fails every test after it in the file. So
   every wait of a test goes through `step`, and `endSteps` is the first thing afterEach does: the
   step that is running ends, the test that made it stops there, and only then is the page taken down. */
import { act } from 'react';
import { vi } from 'vite-plus/test';

interface Run {
  over: boolean;
  last: Promise<void>;
}
const fresh = (): Run => ({ over: false, last: Promise.resolve() });
let run = fresh();

/** Do one thing to the page and let `ms` of the fake clock pass. It throws in a test that is over. */
export function step(doing: () => void, ms = 0): Promise<void> {
  const mine = run;
  const done = (async () => {
    if (!mine.over)
      await act(async () => {
        doing();
        await vi.advanceTimersByTimeAsync(ms);
      });
    if (mine.over) throw new Error('This test is over: the runner gave up on it');
  })();
  mine.last = done;
  return done;
}

/** The end of a test, passed or not: nothing of it runs after this. Call it before the fake clock goes. */
export async function endSteps(): Promise<void> {
  const mine = run;
  mine.over = true;
  await mine.last.catch(() => {});
  run = fresh();
}
