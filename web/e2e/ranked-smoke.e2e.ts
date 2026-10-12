/* Four accounts, one ranked table, against whichever server the stage picked.

   Each context registers, queues for ranked, and plays the standard game through the page. At the
   end every page shows final scores from `game.over`, and one of them opens the stored record. */
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { Player } from './player';
import { openStage } from './stage';
import type { Stage } from './stage';

let stage: Stage;
let players: Player[] = [];

beforeAll(async () => {
  stage = await openStage();
  console.info(`Ranked smoke against the ${stage.target === 'mock' ? 'mock host' : 'server'}`);
});
afterAll(async () => {
  await Promise.all(players.map((p) => p.context.close().catch(() => {})));
  await stage?.close();
});

const button = (p: Player, name: string | RegExp) => p.page.getByRole('button', { name });

async function until(done: () => boolean | Promise<boolean>, what: string, ms = 30_000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await done()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Never happened within ${ms / 1000} s: ${what}`);
}

describe('four accounts at a ranked table', () => {
  it('plays a ranked game and one of them reads its record', async () => {
    const stamp = Date.now().toString(36);
    players = await Promise.all(
      ['Ann', 'Bea', 'Cal', 'Dee'].map((name) => Player.join(stage.browser, name, stage.url)),
    );
    for (const [i, p] of players.entries()) {
      // A browser nobody knows: the home's Ranked card leads to the sign-up page.
      await p.page.locator('.sk-way[href="/sign-up"]').click();
      await p.page.locator('#signup-username').fill(`rk_${stamp}_${i}`);
      await p.page.locator('#signup-password').fill('secret');
      await p.page.locator('#signup-repeat').fill('secret');
      await button(p, 'Create account').click();
      // Signed up, the page is at Games, whose ranked link leads to Skull King's ranked page.
      await p.page.locator('a[href="/skull-king/ranked"]').first().click();
      await expect.poll(() => p.page.locator('#online .on-bar .pill').textContent()).toBe('Connected');
      await button(p, 'Find a ranked game').click();
    }
    for (const p of players) await p.page.locator('#app .game').waitFor({ timeout: 30_000 });
    expect(new Set(players.map((p) => p.seat)).size).toBe(4);
    for (const p of players) {
      expect(p.start.mode).toBe('ranked');
      expect(p.start.seats.filter((s) => s.bot)).toHaveLength(0);
    }

    const end = Date.now() + 540_000;
    while (Date.now() < end) {
      const over = await Promise.all(players.map((p) => p.page.locator('#app .end').count()));
      if (over.every((n) => n > 0)) break;
      await Promise.all(players.map((p) => p.move()));
    }
    for (const [i, p] of players.entries()) {
      await expect.poll(() => p.page.locator('#app .end .end-top .label').textContent()).toBe('Final scores');
      await until(() => p.framesOf('game.over').length === 1, `seat ${i} receives game.over`);
      const over = p.framesOf('game.over');
      expect(over).toHaveLength(1);
      expect(over[0].result.places).toHaveLength(4);
      expect(over[0].result.forfeited).toEqual([]);
      expect(over[0].result.rating?.after.games).toBe(1);
    }
    const places = players[0].framesOf('game.over')[0].result.places;
    for (const p of players.slice(1)) expect(p.framesOf('game.over')[0].result.places).toEqual(places);

    await button(players[0], 'The record').click();
    await until(
      () =>
        players[0].page
          .locator('#record li')
          .count()
          .then((n) => n > 0),
      'the record lists a step',
    );
    await until(
      () =>
        players[0].page
          .locator('#record')
          .getByText('deal')
          .count()
          .then((n) => n > 0),
      'the record names a deal',
    );
  });
});
