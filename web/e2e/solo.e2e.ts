/* Solo on the server, in a real browser (plan item W3): one guest starts a game against bots from
   the setup page, reloads in the middle of a trick, and leaves.

   What it is there to show is the one thing only a server and a browser together can: while the
   page is away nothing is played for the player, and the page that comes back has the same hand.
   Against the Rust server it runs with SKT_E2E_TARGET; with nothing given it runs against the mock
   host, which plays solo by the same rules (src/net/mock/server.ts). */
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import type { GameUpdate } from '../src/protocol/generated';
import { Player } from './player';
import { openStage } from './stage';
import type { Stage } from './stage';

let stage: Stage;
let solo: Player;

async function until(done: () => boolean | Promise<boolean>, what: string, ms = 60_000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await done()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Never happened within ${ms / 1000} s: ${what}`);
}
/** What the seat can see of where the game stands: enough to tell whether anything was played. */
const standing = (update: GameUpdate): string =>
  JSON.stringify([update.view.phase, update.view.round, update.view.bids, update.view.trick, update.view.hand]);
const timedOut = (): number =>
  solo.framesOf('game.update').filter((u) => u.events.some((e) => e.type === 'timedOut')).length;

beforeAll(async () => {
  stage = await openStage();
  console.log(`solo smoke: playing against the ${stage.target === 'server' ? 'Rust server' : 'mock host'}`);
}, 120_000);
afterAll(async () => {
  await solo?.context.close();
  await stage?.close();
});

describe('a solo game on the server', () => {
  it('starts from the setup page with what was chosen there, and says it is saved', async () => {
    solo = await Player.join(stage.browser, 'Solo', stage.url);
    await solo.page.locator('.sk-way[href="/skull-king/solo"]').click();
    await solo.page.getByRole('heading', { name: 'Solo game' }).waitFor();
    // Two bots and five rounds of five cards: a trick has three plays, and a round has five tricks.
    await solo.page.getByRole('button', { name: '2 bots' }).click();
    await solo.page.locator('.sk-formats button', { hasText: 'Swift' }).click();
    expect(solo.sent).toEqual([]);
    await solo.page.getByRole('button', { name: 'Start' }).click();
    await solo.page.locator('#app .game').waitFor({ timeout: 30_000 });

    const asked = solo.sent.filter((m) => m.t === 'solo.start');
    expect(asked).toHaveLength(1);
    expect(asked[0].settings).toMatchObject({ maxPlayers: 3, format: 'swift', pace: 'standard' });
    expect(solo.start).toMatchObject({ table: 'solo', mode: 'custom', lobbyId: null, me: 0 });
    expect(solo.start.seats.map((seat) => seat.bot)).toEqual([false, true, true]);
    expect(new URL(solo.page.url()).pathname).toBe('/skull-king/table');
    expect(await solo.page.locator('#app .g-info .pill.green').textContent()).toBe('Saved');
    // No clock on the player: no deadline came with the deal, and nothing counts down on screen.
    expect(solo.update.table.deadline).toBeNull();
    expect(await solo.page.locator('#app .ring').count()).toBe(0);
    expect(solo.errors).toEqual([]);
  }, 120_000);

  it('reloads in the middle of a trick to the same hand, with no card played while the page was away', async () => {
    // Play until it is this seat's turn with a card already on the table.
    await until(
      async () => {
        const v = solo.view;
        if (v.phase === 'playing' && v.turn === solo.seat && v.trick.plays.length > 0) return true;
        await solo.move();
        return false;
      },
      'the player to be on turn in the middle of a trick',
      120_000,
    );
    const before = solo.update;
    // The frame is ahead of the picture by a moment: wait until the table shows the cards it names.
    await until(
      async () => (await solo.onScreen()).trick.length === before.view.trick.plays.length,
      'the trick to be on screen',
    );
    const shown = await solo.onScreen(),
      sent = solo.sent.length,
      misses = timedOut();
    expect(shown.trick.length).toBeGreaterThan(0);

    await solo.page.reload();
    // No tap on anything: the page was seated, so it connects by itself and goes where welcome says.
    await solo.page.locator('#app .game').waitFor({ timeout: 30_000 });
    await until(() => solo.framesOf('welcome').length === 2, 'the second welcome');
    const welcome = solo.framesOf('welcome')[1];
    expect(welcome.game?.start).toMatchObject({ table: 'solo', gameId: before.gameId, me: 0 });
    // The hand, the bids and the cards on the table are what they were: nothing was played.
    expect(welcome.game && standing(welcome.game.update)).toBe(standing(before));
    expect(solo.sent.slice(sent).map((m) => m.t)).toEqual(['hello']);
    await solo.page.locator('#app .hand.myturn').waitFor({ timeout: 30_000 });
    expect(await solo.onScreen()).toEqual(shown);
    expect(new URL(solo.page.url()).pathname).toBe('/skull-king/table');
    expect(await solo.page.locator('.table-overlay').count()).toBe(0);
    expect(await solo.page.locator('#app .g-info .pill.green').textContent()).toBe('Saved');

    // And nothing is played for the player afterwards either: the table waits for them.
    await solo.page.waitForTimeout(5000);
    expect(standing(solo.update)).toBe(standing(before));
    expect(timedOut()).toBe(misses);
    expect(solo.update.table.status).toEqual(['online', 'bot', 'bot']);
    expect(solo.errors).toEqual([]);
  }, 240_000);

  it('goes on with the game after the reload', async () => {
    const tricks = solo.at.trick;
    await until(
      async () => {
        await solo.move();
        return solo.at.trick > tricks || solo.view.phase === 'roundEnd' || solo.at.round > 0;
      },
      'the trick to be finished',
      120_000,
    );
    expect(solo.errors).toEqual([]);
  }, 180_000);

  it('asks before leaving, comes down on the ok alone, and leaves no game behind', async () => {
    const received = solo.received.length;
    await solo.page.locator('#app .g-top [data-act="home"]').click();
    const sheet = solo.page.locator('#app .sheet');
    expect(await sheet.locator('h2').textContent()).toBe('Leave this game?');
    expect(await sheet.locator('p').textContent()).toBe('It will not be saved to your stats.');
    const heard = solo.received.length;
    await sheet.getByRole('button', { name: 'Leave', exact: true }).click();
    await solo.page.getByRole('heading', { name: 'You left this game.' }).waitFor({ timeout: 30_000 });
    expect(await solo.page.locator('.sk-left p').textContent()).toBe('It was not counted.');
    expect(solo.sent.at(-1)).toMatchObject({ t: 'game.leave' });
    // Whatever was still on its way before the tap aside, the leave was answered with `ok` and nothing after it.
    await solo.page.waitForTimeout(1500);
    const after = solo.received.slice(heard).map((f) => f.t),
      answer = after.lastIndexOf('ok');
    expect(answer).toBeGreaterThanOrEqual(0);
    expect(after.slice(answer + 1)).toEqual([]);
    expect(solo.received.slice(received).some((f) => f.t === 'game.over')).toBe(false);

    const me = await solo.page.evaluate(() =>
      fetch('/api/v1/me').then((r) => r.json() as Promise<{ active: unknown; stats: { games: number } }>),
    );
    expect(me.active).toBeNull();
    expect(me.stats.games).toBe(0);
    await solo.page.locator('.sk-left-actions .btn.ghost').click();
    await solo.page.locator('.sk-home .logo').waitFor();
    expect(await solo.page.locator('.sk-jump').count()).toBe(0);
    expect(solo.errors).toEqual([]);
  }, 120_000);
});
