/* Four browsers, one table: plan item C8.

   Four browser contexts are four guests. One creates a private lobby, three join by its code, a
   bot takes the fifth seat, and they play a whole game through the page, with clicks and keys. On
   the way one of them reloads in the middle of a trick and has to be back on the same hand, and one
   of them tries to cheat from "the console" and has to be refused without anything changing.

   Run it with `npm run e2e`. Which server it plays against is decided in stage.ts: the Rust server
   on 127.0.0.1:8080 when one is listening there, the mock host otherwise. To name one:

     SKT_E2E_TARGET=http://127.0.0.1:8080 npm run e2e    # must answer GET /api/v1/health
     SKT_E2E_TARGET=mock npm run e2e                     # the mock host, whatever else is running
     SKT_E2E_HEADED=1 npm run e2e                        # watch it

   Nothing below knows which one it is: the steps are the player's, and what they check is
   docs/protocol.md. Where the mock is known to differ from the server, it is in the mock, not here. */
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { Player } from './player';
import { openStage } from './stage';
import type { Stage } from './stage';

let stage: Stage;
let players: Player[] = [];

beforeAll(async () => {
  stage = await openStage();
  console.info(`Four players against the ${stage.target === 'mock' ? 'mock host' : 'server'}, page at ${stage.url}`);
});
afterAll(async () => {
  await Promise.all(players.map((p) => p.context.close().catch(() => {})));
  await stage?.close();
});

/** Wait until `done()` says so, looking again every so often. */
async function until(done: () => boolean | Promise<boolean>, what: string, ms = 30_000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await done()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Never happened within ${ms / 1000} s: ${what}`);
}
const button = (p: Player, name: string | RegExp) => p.page.getByRole('button', { name });

describe('four players at one table', () => {
  it('seats four guests and a bot at a private table by its code', async () => {
    players = await Promise.all(
      ['Host', 'Second', 'Third', 'Fourth'].map((name) => Player.join(stage.browser, name, stage.url)),
    );
    const [host, ...guests] = players;

    // Each context is a guest of its own: the hub says who.
    for (const p of players) {
      await button(p, 'Play online').click();
      await expect.poll(() => p.page.locator('#online .pill').textContent()).toBe('Connected');
    }
    const names = await Promise.all(players.map((p) => p.page.locator('#online .identity b').textContent()));
    expect(new Set(players.map((p) => p.framesOf('welcome')[0].me.user.id)).size).toBe(4);

    await button(host, 'Create a table').click();
    await host.page.getByLabel('More seats').click();
    await button(host, /^Swift-n-Salty/).click();
    await button(host, 'Create table').click();
    const code = (await host.page.locator('#online .code').textContent()) ?? '';
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);

    for (const p of guests) {
      await button(p, 'Join with a code').click();
      await p.page.locator('#table-code').fill(code.toLowerCase());
      await button(p, 'Join table').click();
      await expect.poll(() => p.page.locator('#online .code').textContent()).toBe(code);
    }
    await button(host, 'Add a bot').click();
    // Everybody sees the same five at the table, in the order they came.
    for (const p of players)
      await expect
        .poll(() => p.page.locator('#online .member:not(.open) b').allTextContents())
        .toEqual([...names, expect.any(String)]);

    // Only the host can start, and only when every person is ready.
    await expect(button(guests[0], 'Start game').count()).resolves.toBe(0);
    for (const p of players) await button(p, "I'm ready").click();
    await expect.poll(() => button(host, 'Start game').isEnabled()).toBe(true);
    await button(host, 'Start game').click();
    for (const p of players) await p.page.locator('#app .game').waitFor();

    // Five seats, each context its own, each with five cards nobody else was sent.
    expect(players.map((p) => p.seat).sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
    expect(host.start.seats.map((s) => s.bot)).toEqual([false, false, false, false, true]);
    const hands = players.map((p) => p.view.hand);
    expect(hands.every((h) => h.length === 5)).toBe(true);
    expect(new Set(hands.flat()).size).toBe(20);
    for (const p of players) expect((await p.onScreen()).hand).toEqual([...p.view.hand].sort((a, b) => a - b));
  });

  it('refuses a cheater without anything changing for anyone', async () => {
    const [host, second] = players;
    // The host bids, as a player does. The others have not.
    await until(async () => (await host.move(), host.view.bids[host.seat] != null), 'the host bids');
    const before = host.view.bids[host.seat];

    // "Bid for the next seat": the seat is the connection's, so this is the host bidding again.
    const forgedBid = await host.forge({ t: 'game.bid', at: host.at, bid: 0, seat: second.seat });
    expect(forgedBid).toMatchObject({ t: 'err', code: 'NOT_YOUR_TURN' });
    // A card while everyone is still bidding.
    const early = await host.forge({ t: 'game.play', at: host.at, card: host.view.hand[0] });
    expect(early).toMatchObject({ t: 'err', code: 'NOT_YOUR_TURN' });
    // A bid nobody could make.
    const huge = await second.forge({ t: 'game.bid', at: second.at, bid: 99 });
    expect(huge).toMatchObject({ t: 'err', code: 'BID_OUT_OF_RANGE' });

    await new Promise((r) => setTimeout(r, 500));
    // Nothing moved: the host's bid is the one it made, the second seat still has its bid to make,
    // and no step anybody was sent has a bid of the second seat in it.
    expect(host.view.bids[host.seat]).toBe(before);
    expect(second.view.bids[second.seat]).toBeNull();
    expect(await second.page.locator('#app .bidsheet').count()).toBe(1);
    for (const p of players)
      expect(
        p
          .framesOf('game.update')
          .flatMap((u) => u.events)
          .filter((e) => e.type === 'bidPlaced' && e.seat === second.seat),
      ).toEqual([]);
    // The pages took no notice of replies to frames they never sent.
    expect(players.flatMap((p) => p.errors)).toEqual([]);
  });

  it('plays the game to its end, through a reload in the middle of a trick', async () => {
    const reloader = players[2];
    /** What was on the reloader's screen before and after the reload, once it has happened. */
    const reloads: {
      before: Awaited<ReturnType<Player['onScreen']>>;
      after: Awaited<ReturnType<Player['onScreen']>>;
    }[] = [];

    /** In the middle of a trick, on this seat's turn: reload, and be back at the same table. */
    async function reloadMidTrick(): Promise<void> {
      reloader.busy = true;
      const before = await reloader.onScreen(),
        rev = reloader.update.rev,
        sent = reloader.sent.length;
      await reloader.page.reload();
      // No tap on anything: the page was seated, so it connects by itself and goes where welcome says.
      await reloader.page.locator('#app .game').waitFor();
      await until(() => reloader.framesOf('welcome').length === 2, 'the second welcome');
      const welcome = reloader.framesOf('welcome')[1];
      expect(welcome.game?.update.events).toEqual([]);
      expect(welcome.game?.update.rev).toBeGreaterThan(rev); // the reload was a drop: a step for everyone
      expect(welcome.game?.start.me).toBe(reloader.seat);
      // The new page said hello and nothing else: what the old one had sent is not sent again.
      expect(reloader.sent.slice(sent).map((m) => m.t)).toEqual(['hello']);
      await reloader.page.locator('#app .hand.myturn').waitFor();
      reloads.push({ before, after: await reloader.onScreen() });
      expect(await reloader.page.locator('.table-overlay').count()).toBe(0);
      reloader.busy = false;
    }

    const over = new Set<Player>();
    await until(
      async () => {
        await Promise.all(
          players.map(async (p) => {
            if (p.busy || over.has(p)) return;
            if (p === reloader && !reloads.length) {
              const v = p.view;
              if (v.phase === 'playing' && v.turn === p.seat && v.trick.plays.length > 0 && v.round === 1)
                return reloadMidTrick();
            }
            if (await p.move()) over.add(p);
          }),
        );
        return over.size === players.length;
      },
      'the game ends on every page',
      480_000,
    );

    // The reload came back to the same hand and the same trick.
    expect(reloads).toHaveLength(1);
    expect(reloads[0].after).toEqual(reloads[0].before);
    expect(reloads[0].before.hand.length).toBeGreaterThan(0);
    expect(reloads[0].before.trick.length).toBeGreaterThan(0);
    // The others were told the seat went and came back, each as a step of its own.
    const status = players[0]
      .framesOf('game.update')
      .flatMap((u) => u.events)
      .flatMap((e) => (e.type === 'seatStatus' && e.seat === reloader.seat ? [e.status] : []));
    expect(status.slice(0, 2)).toEqual(['offline', 'online']);

    // Everybody is on the final scores, of the same game.
    for (const p of players) {
      await expect.poll(() => p.page.locator('#app .end .end-top .label').textContent()).toBe('Final scores');
      expect(p.view).toMatchObject({ phase: 'gameOver', round: 4, rounds: 5 });
      const results = p.framesOf('game.over');
      expect(results).toHaveLength(1);
      expect(results[0].result.totals).toEqual(players[0].framesOf('game.over')[0].result.totals);
      expect(results[0].result.totals).toHaveLength(5);
      // The result names the receiver's seat (§5.5).
      expect(results[0]).toMatchObject({ seat: p.seat });
      // Every step reached this page once and in order: after the last welcome the revisions count up by one.
      const lastWelcome = p.received.findLastIndex((f) => f.t === 'welcome');
      const revs = p.received.slice(lastWelcome).flatMap((f) => (f.t === 'game.update' ? [f.rev] : []));
      expect(revs.every((rev, i) => i === 0 || rev === revs[i - 1] + 1)).toBe(true);
      // And an accepted intent was always answered ok and then, as the next frame, its update.
      let pairs = 0;
      for (const { sent, received } of p.conversations)
        for (const m of sent.filter((x) => ['game.bid', 'game.play', 'game.ready'].includes(x.t))) {
          const at = received.findIndex((f) => (f.t === 'ok' || f.t === 'err') && f.re === m.id);
          if (at < 0) continue; // the socket closed first: no answer is owed on the next one
          if (received[at].t !== 'ok') continue;
          expect(received[at + 1]?.t, `${p.name}: after the ok of ${m.t}`).toBe('game.update');
          pairs++;
        }
      // Five bids, twenty-five cards and five times "ready", less whatever a deadline did for the seat.
      expect(pairs).toBeGreaterThan(25);
    }
    expect(players.flatMap((p) => p.errors)).toEqual([]);
  });

  it('takes everyone back to the lobby for the next game', async () => {
    for (const p of players) {
      await p.page.locator('#app .end [data-act="again"]').click({ timeout: 15_000 });
      await expect.poll(() => p.page.locator('#online h2').textContent()).toBe('Table');
      await expect.poll(() => p.page.locator('#online .member .pill.green').count()).toBe(0);
    }
  });
});

describe('offline, in the same browser', () => {
  it('still plays a solo round against bots to its result, with nothing of the online table on it', async () => {
    const solo = await Player.join(stage.browser, 'Solo', stage.url);
    players.push(solo);
    await solo.page.locator('[data-act="setup"]').click();
    await solo.page.locator('[data-act="start"]').click();
    await solo.page.locator('#app .game').waitFor();
    // The first round of the classic game is one card: a bid, a card, and the round is scored.
    const results = solo.page.locator('#app .sheet[aria-label="Round results"]');
    await until(async () => (await results.count()) > 0 || (await solo.move()), 'the round result', 60_000);
    await expect.poll(() => results.locator('.res').count()).toBe(4);
    expect(await solo.page.locator('#app .ring, #app .presence, #app .sheet-note, .table-overlay').count()).toBe(0);
    // It never asked for a server: no socket, and the game is saved on the device.
    expect(solo.sent).toEqual([]);
    expect(await solo.page.evaluate(() => localStorage.getItem('skullking-tavern.game.v2'))).toContain('"roundEnd"');
    expect(solo.errors).toEqual([]);
  });
});
