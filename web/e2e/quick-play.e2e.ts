/* Quick play's wait, in real browsers: two guests in the casual queue, the second one late.

   What it is there to show is what only a server's clock and two pages together can: the time the
   server names (`fillsAt`, docs/protocol.md §5.4) is the same for both, the page that arrives late
   opens on what is left of it, the page that was waiting does not start its ring again, and when
   the time has come both pages show the bots sitting down and then the table.
   Against the Rust server it runs with SKT_E2E_TARGET; with nothing given it runs against the mock
   host, which fills the queue by the same rule (src/net/mock/server.ts). */
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { QUEUE_FILL_MS } from '../src/net/timing';
import type { QueueStatus } from '../src/protocol/generated';
import { Player } from './player';
import { openStage } from './stage';
import type { Stage } from './stage';

let stage: Stage;
let first: Player;
let late: Player;
/** How long the late one stays away. */
const LATE_MS = 4000;
/**
 * §5.4 says `fillsAt` is the same for everyone waiting. The Rust server writes it afresh into each
 * message, off a clock it moves five times a second, and two players were told times 48 ms apart
 * (handover 114). The page draws times this close as one wait.
 */
const SAME_MS = 250;

const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
/** What the server answered this player's `queue.join` with. */
function joined(player: Player): QueueStatus {
  const asked = player.sent.find((m) => m.t === 'queue.join');
  const reply = player.received.find((f) => f.t === 'ok' && f.re === asked?.id);
  if (reply?.t !== 'ok' || !reply.queue) throw new Error(`${player.name} was not told of the queue`);
  return reply.queue;
}
/** The rings on a page: for each, how long it was given to close, in milliseconds. */
const rings = (player: Player): Promise<number[]> =>
  player.page
    .locator('#online .queue-ring')
    .evaluateAll((els) => els.map((el) => parseInt((el as SVGElement).style.getPropertyValue('--left'), 10)));
const coin = async (player: Player): Promise<number> =>
  Number(await player.page.locator('#online .queue-coin .now').textContent());

async function quickPlay(name: string): Promise<Player> {
  const player = await Player.join(stage.browser, name, stage.url);
  await player.way('Online', '/skull-king/online');
  await player.page.getByRole('button', { name: /Quick play/ }).click();
  await player.page.getByRole('heading', { name: 'Quick play' }).waitFor();
  return player;
}

beforeAll(async () => {
  stage = await openStage();
  console.log(`quick-play smoke: playing against the ${stage.target === 'server' ? 'Rust server' : 'mock host'}`);
}, 120_000);
afterAll(async () => {
  await first?.context.close();
  await late?.context.close();
  await stage?.close();
});

describe('the wait of quick play', () => {
  it('draws the time the server named: a ring on every open seat and the seconds on the coin', async () => {
    first = await quickPlay('First');
    const queue = joined(first);
    expect(queue).toMatchObject({ mode: 'casual', found: 1, needed: 4 });
    // The whole wait, from the moment the line stopped being empty, which is this player's joining.
    const whole = (queue.fillsAt ?? 0) - queue.since;
    expect(whole).toBeGreaterThanOrEqual(QUEUE_FILL_MS);
    expect(whole).toBeLessThanOrEqual(QUEUE_FILL_MS + SAME_MS);

    const left = await rings(first);
    expect(left).toHaveLength(3);
    // Each ring reads the clock as it is drawn: the three are one picture, a millisecond apart at most.
    expect(Math.max(...left) - Math.min(...left)).toBeLessThanOrEqual(5);
    expect(left[0]).toBeGreaterThan(QUEUE_FILL_MS - 2000);
    expect(left[0]).toBeLessThanOrEqual(QUEUE_FILL_MS);
    expect(await coin(first)).toBeGreaterThanOrEqual(QUEUE_FILL_MS / 1000 - 2);
    expect(await first.page.locator('#online .searching [role="status"]').textContent()).toBe('1 of 4 found');
  }, 60_000);

  it('opens the late page on what is left, and leaves the ring of the page that was waiting alone', async () => {
    const before = await rings(first);
    await pause(LATE_MS);
    late = await quickPlay('Late');
    const mine = joined(late),
      theirs = joined(first);
    // One time for everyone in the line: the late one does not get the whole wait again.
    expect(Math.abs((mine.fillsAt ?? 0) - (theirs.fillsAt ?? -1e9))).toBeLessThanOrEqual(SAME_MS);
    expect(mine).toMatchObject({ found: 2, needed: 4 });
    expect((mine.fillsAt ?? 0) - mine.since).toBeLessThanOrEqual(QUEUE_FILL_MS - LATE_MS);

    const left = await rings(late);
    expect(left).toHaveLength(2);
    expect(left[0]).toBeLessThanOrEqual(QUEUE_FILL_MS - LATE_MS);
    expect(left[0]).toBeGreaterThan(0);
    expect(await coin(late)).toBeLessThanOrEqual((QUEUE_FILL_MS - LATE_MS) / 1000);

    // The page that was waiting hears of the second pirate with the same time, and its rings run on.
    await first.page.locator('#online .searching [role="status"]', { hasText: '2 of 4 found' }).waitFor();
    const told = first.framesOf('queue.status').at(-1)?.queue;
    expect(told).toMatchObject({ found: 2 });
    expect(Math.abs((told?.fillsAt ?? 0) - (theirs.fillsAt ?? -1e9))).toBeLessThanOrEqual(SAME_MS);
    expect(await rings(first)).toEqual(before.slice(1));
    expect(await first.page.locator('#online .queue-seat.found').count()).toBe(2);
  }, 60_000);

  it('shows the bots sitting down when the server starts the game, and then the table', async () => {
    // The picture stands for a moment only: both pages are watched at once, and read while it is up.
    const seen = await Promise.all(
      [first, late].map(async (player) => {
        const line = await player.page.waitForFunction(
          () =>
            document.querySelector('#online .searching h3')?.textContent === 'All aboard!'
              ? document.querySelector('#online .searching [role="status"]')?.textContent
              : null,
          null,
          { timeout: 20_000 },
        );
        return line.jsonValue();
      }),
    );
    expect(seen).toEqual(['2 pirates, 2 bots', '2 pirates, 2 bots']);
    for (const player of [first, late]) {
      await player.page.locator('#app .game').waitFor({ timeout: 10_000 });
      expect(player.start).toMatchObject({ mode: 'casual', lobbyId: null });
      expect(player.start.seats.map((seat) => seat.bot)).toEqual([false, false, true, true]);
    }
    // The game began when the time the server named had come, not before.
    expect(first.start.me).toBe(0);
    expect(late.start.me).toBe(1);
    // Nothing was said of the queue once the game had started (§5.4).
    for (const player of [first, late]) {
      const at = player.received.findIndex((f) => f.t === 'game.start');
      expect(player.received.slice(at).some((f) => f.t === 'queue.status')).toBe(false);
      expect(player.errors).toEqual([]);
    }
  }, 60_000);
});
