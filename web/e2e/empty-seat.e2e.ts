/* Three browsers, one table, and one of them does not come back in time (docs/protocol.md §5.5).

   Three guests sit at a private table. One closes the page before the first bid.
   The clock plays that seat's turn twice, and the second time closes the seat: the two who stayed
   see the same name, marked OUT, and play on while the table plays for it. The one who went opens
   the page again and is told, once, that the seat is lost. When the game ends they hear the result.

   It runs against whichever server the stage picked (stage.ts). `SKT_E2E_SHOTS=<folder>` writes a
   picture of the table with the closed seat and of the notice. */
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { Player } from './player';
import { openStage } from './stage';
import type { Stage } from './stage';

let stage: Stage;
let players: Player[] = [];
const shots = process.env.SKT_E2E_SHOTS;

beforeAll(async () => {
  stage = await openStage();
  console.info(`The empty seat against the ${stage.target === 'mock' ? 'mock host' : 'server'}, page at ${stage.url}`);
});
afterAll(async () => {
  await Promise.all(players.map((p) => p.context.close().catch(() => {})));
  await stage?.close();
});

async function until(done: () => boolean | Promise<boolean>, what: string, ms = 30_000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await done()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Never happened within ${ms / 1000} s: ${what}`);
}
const button = (p: Player, name: string | RegExp, how: { exact?: boolean } = {}) =>
  p.page.getByRole('button', { name, ...how });
const picture = async (p: Player, name: string): Promise<void> => {
  if (shots) await p.page.screenshot({ path: `${shots}/${name}.png` });
};

describe('a seat nobody comes back to', () => {
  let stayers: Player[], gone: Player, goneName: string;
  /** The step that closed the seat, as one of those who stayed was sent it. */
  const kick = (p: Player) =>
    p.framesOf('game.update').find((u) => u.events.some((e) => e.type === 'seatStatus' && e.status === 'out'));
  /** The seats around the table on a page: the name and the tag on each. */
  const seats = (p: Player): Promise<{ name: string; tag: string; gone: boolean; ring: boolean }[]> =>
    p.page.evaluate(() =>
      Array.from(document.querySelectorAll('#app .seat'), (el) => ({
        name: el.querySelector('.sname')?.textContent ?? '',
        tag: el.querySelector('.presence')?.textContent ?? '',
        gone: el.classList.contains('gone'),
        ring: el.querySelector('.ring') != null,
      })),
    );

  it('is closed after two missed turns, keeps its name, and is played by the table', async () => {
    players = await Promise.all(['Host', 'Stays', 'Goes'].map((name) => Player.join(stage.browser, name, stage.url)));
    const [host, second, third] = players;
    stayers = [host, second];
    gone = third;
    for (const p of players) {
      await p.way('Online', '/skull-king/online');
      await expect.poll(() => p.page.locator('#online .pill').textContent()).toBe('Connected');
    }
    goneName = (await gone.page.locator('#online .go-chip-text b').textContent()) ?? '';

    await host.page.locator('#online a[href="/skull-king/online/new"]').click();
    await button(host, /^Swift/).click();
    // The standard clocks, which is all a table has: a bid is 45 seconds and a card 30.
    await button(host, 'Open table').click();
    const code = (await host.page.locator('#online .code').textContent()) ?? '';
    for (const p of [second, third]) {
      await button(p, 'Join with a code').click();
      await p.page.locator('#table-code').fill(code);
      await button(p, 'Join table').click();
      await expect.poll(() => p.page.locator('#online .code').textContent()).toBe(code);
    }
    for (const p of players) await button(p, "I'm ready").click();
    await expect.poll(() => button(host, 'Start', { exact: true }).isEnabled()).toBe(true);
    await button(host, 'Start', { exact: true }).click();
    for (const p of players) await p.page.locator('#app .game').waitFor();
    expect(host.start.settings.pace).toBe('standard');
    const seat = gone.seat;

    // The page is gone: no bid, no card. The other two play as people do.
    await gone.page.goto('about:blank');
    let played = false;
    await until(
      async () => {
        await Promise.all(stayers.map((p) => p.move()));
        const status = await host.page.locator('#app .status').textContent();
        if (kick(host) && status === `The table plays for ${goneName}…`) played = true;
        return played;
      },
      'the seat is closed and the table plays its turn',
      180_000,
    );

    for (const p of stayers) {
      const step = kick(p);
      if (!step) throw new Error(`${p.name} was not told that the seat is closed`);
      // The move the table made, then that the time ran out, then that the seat is closed.
      expect(step.events.slice(-2)).toEqual([
        { type: 'timedOut', seat },
        { type: 'seatStatus', seat, status: 'out' },
      ]);
      expect(step.table.status[seat]).toBe('out');
      const all = p.framesOf('game.update');
      // The seat was offline until then, and no bot was ever seated in it.
      expect(all.some((u) => u.table.status[seat] === 'bot')).toBe(false);
      // Two misses were the player's: the first left the seat theirs.
      const misses = all.filter((u) => u.events.some((e) => e.type === 'timedOut' && e.seat === seat));
      expect(misses).toHaveLength(2);
      expect(misses[0].table.status[seat]).toBe('offline');
      // After the kick the seat is on no clock.
      expect(all.filter((u) => u.rev > step.rev).every((u) => !u.table.deadline?.seats.includes(seat))).toBe(true);
      // On the page: the same name, marked out, dimmed, without a ring. Nobody else is tagged.
      const at = (await seats(p)).filter((s) => s.tag);
      expect(at).toEqual([{ name: goneName, tag: 'Out', gone: true, ring: false }]);
    }
    await picture(host, 'empty-seat-table');
    expect(stayers.flatMap((p) => p.errors)).toEqual([]);
  });

  it('tells the one who went, once, that the seat is lost', async () => {
    const welcomes = gone.framesOf('welcome').length;
    await gone.page.goto(stage.url);
    // No tap: the page was seated, so it connects by itself and shows what the server says.
    await expect.poll(() => gone.page.locator('#online .notice.gold b').textContent()).toBe('You lost your seat');
    expect(await gone.page.locator('#online .notice.gold p').textContent()).toBe(
      'You were away for two turns in a row. The game goes on without you.',
    );
    expect(await gone.page.locator('#online h1').textContent()).toBe('Online');
    expect(await gone.page.locator('#app .game').count()).toBe(0);
    const welcome = gone.framesOf('welcome').at(-1);
    expect(gone.framesOf('welcome')).toHaveLength(welcomes + 1);
    expect(welcome).toMatchObject({ game: null, lobby: null });
    // The frame after that welcome, and nobody else was sent one.
    expect(gone.received[gone.received.findLastIndex((f) => f.t === 'welcome') + 1]).toEqual({
      t: 'seat.lost',
      gameId: stayers[0].start.gameId,
      mode: 'custom',
      reason: 'inactivity',
    });
    expect(stayers.flatMap((p) => p.framesOf('seat.lost'))).toEqual([]);
    await picture(gone, 'empty-seat-notice');

    // Read, and not said again: the next page has no notice and was sent no second frame.
    await button(gone, 'OK').click();
    expect(new URL(gone.page.url()).pathname).toBe('/skull-king/online');
    await gone.page.reload();
    // The address is still the hub's, so the next page is the hub again and connects by itself.
    await expect.poll(() => gone.page.locator('#online .pill').textContent()).toBe('Connected');
    expect(gone.framesOf('seat.lost')).toHaveLength(1);
    expect(await gone.page.locator('#online .notice.gold').count()).toBe(0);
    expect(gone.errors).toEqual([]);
  });

  it('lets the other two finish, and the one who went hears the result', async () => {
    const over = new Set<Player>();
    await until(
      async () => {
        await Promise.all(
          stayers.map(async (p) => {
            if (!over.has(p) && (await p.move())) over.add(p);
          }),
        );
        return over.size === stayers.length;
      },
      'the game ends for the two who stayed',
      480_000,
    );
    const result = () => stayers[0].framesOf('game.over')[0];
    await until(() => stayers.every((p) => p.framesOf('game.over').length === 1), 'the result', 10_000);
    // Not a ranked game: a closed seat is no forfeit, and it is placed by what was scored in it.
    expect(result().result.forfeited).toEqual([]);
    expect(result().result.totals).toHaveLength(3);
    // The table played the closed seat to the end, and never on a clock.
    expect(
      stayers[0]
        .framesOf('game.update')
        .flatMap((u) => u.events)
        .filter((e) => e.type === 'timedOut' && e.seat === gone.seat),
    ).toHaveLength(2);

    await until(() => gone.framesOf('game.over').length === 1, 'the result reaches the one who went', 10_000);
    expect(gone.framesOf('game.over')[0]).toMatchObject({
      seat: gone.seat,
      result: { totals: result().result.totals },
    });
    await expect.poll(() => gone.page.locator('#online .notice.gold b').textContent()).toBe('Your last game is over');
    expect(await gone.page.locator('#online .notice.gold p').textContent()).toMatch(
      /^You lost your seat before the end\. Final place: (1st|2nd|3rd) of 3\.$/,
    );
    expect(players.flatMap((p) => p.errors)).toEqual([]);
  });
});
