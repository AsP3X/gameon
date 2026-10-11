/* One player of the end-to-end script: a browser context of their own (so a session of their own),
   the page in it, and every frame that page and the server exchanged.

   The frames are read through Playwright's WebSocket route, which sits between the page and the
   server and passes everything on unchanged. It is also how the script sends what a cheater would:
   a frame the page itself never writes, on the page's own connection. */
import type { Browser, BrowserContext, Page, WebSocketRoute } from 'playwright-core';
import type { ServerMessage } from '../src/net/messages';
import type { EngineView, GameStart, GameUpdate, Seat } from '../src/protocol/generated';

/** An id no page counts up to: the script's own frames are told apart by it. */
let forgedId = 900_000;

export class Player {
  /** Every frame the server sent this page, oldest first. */
  readonly received: ServerMessage[] = [];
  /** Every frame the page sent. */
  readonly sent: { t: string; id: number; [key: string]: unknown }[] = [];
  /** What went wrong in the page: uncaught errors and console errors. */
  readonly errors: string[] = [];
  /** Set while the script itself is acting on the page: the play loop keeps its hands off. */
  busy = false;
  /** Where each socket of this player begins in `sent` and `received`: a reload opens another. */
  private readonly sockets: { sent: number; received: number }[] = [];
  private server: WebSocketRoute | null = null;

  private constructor(
    readonly name: string,
    readonly context: BrowserContext,
    readonly page: Page,
  ) {}

  static async join(browser: Browser, name: string, url: string): Promise<Player> {
    // Reduced motion: the table skips its animations, so the script does not wait on them.
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const player = new Player(name, context, page);
    page.on('pageerror', (e) => player.errors.push(`${name}: ${e.message}`));
    page.on('console', (m) => {
      // A failed request is the browser's own line, and a refused intent is logged by the table as a warning.
      if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) player.errors.push(`${name}: ${m.text()}`);
    });
    await page.routeWebSocket(/\/api\/v1\/ws$/, (ws) => {
      const server = ws.connectToServer();
      player.server = server;
      player.sockets.push({ sent: player.sent.length, received: player.received.length });
      ws.onMessage((m) => {
        if (typeof m === 'string') player.sent.push(JSON.parse(m) as Player['sent'][number]);
        server.send(m);
      });
      server.onMessage((m) => {
        if (typeof m === 'string') player.received.push(JSON.parse(m) as ServerMessage);
        ws.send(m);
      });
    });
    await page.goto(url);
    return player;
  }

  /**
   * What went over each socket of this player, oldest socket first. Ids start again with every page,
   * so a reply is looked for on the socket its message went out on, which is also the only place
   * one is owed (§5.2).
   */
  get conversations(): { sent: Player['sent']; received: ServerMessage[] }[] {
    return this.sockets.map((from, i) => {
      const to = this.sockets[i + 1];
      return { sent: this.sent.slice(from.sent, to?.sent), received: this.received.slice(from.received, to?.received) };
    });
  }

  /** The frames of one type the server sent, in order. */
  framesOf<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }>[] {
    return this.received.filter((f): f is Extract<ServerMessage, { t: T }> => f.t === t);
  }
  get start(): GameStart {
    // After a reload the start comes inside `welcome`.
    const welcomed = this.framesOf('welcome').findLast((w) => w.game)?.game?.start;
    const start = this.framesOf('game.start').at(-1) ?? welcomed;
    if (!start) throw new Error(`${this.name} has not been seated`);
    return start;
  }
  get seat(): Seat {
    return this.start.me;
  }
  /** The newest update: a step, or the snapshot of the newest `welcome`. */
  get update(): GameUpdate {
    for (let i = this.received.length - 1; i >= 0; i--) {
      const f = this.received[i];
      if (f.t === 'game.update') return f;
      if (f.t === 'welcome' && f.game) return f.game.update;
    }
    throw new Error(`${this.name} has no view of a game yet`);
  }
  get view(): EngineView {
    return this.update.view;
  }
  /** The round and the tricks finished in it, as this seat sees them: what `at` has to say (§5.5). */
  get at(): { round: number; trick: number } {
    const v = this.view;
    return { round: v.round, trick: v.won.reduce((a, b) => a + b, 0) + v.log[v.round].destroyed };
  }

  /**
   * Send a frame on the page's own connection, as from the browser console, and wait for the one
   * reply to it. The page sees that reply too and ignores it: it never sent that id.
   */
  async forge(message: Record<string, unknown>): Promise<ServerMessage> {
    const server = this.server;
    if (!server) throw new Error(`${this.name} has no connection`);
    const id = ++forgedId;
    server.send(JSON.stringify({ ...message, id }));
    for (let i = 0; i < 100; i++) {
      const reply = this.received.find((f) => (f.t === 'ok' || f.t === 'err') && f.re === id);
      if (reply) return reply;
      await this.page.waitForTimeout(50);
    }
    throw new Error(`${this.name} got no reply to a forged ${String(message.t)}`);
  }

  /** The cards in the hand on screen, by id, and the cards of the trick on the table. */
  onScreen(): Promise<{ hand: number[]; trick: string[] }> {
    return this.page.evaluate(() => ({
      hand: Array.from(document.querySelectorAll<HTMLElement>('#app .hand .hslot'), (el) => Number(el.dataset.id)).sort(
        (a, b) => a - b,
      ),
      trick: Array.from(document.querySelectorAll<HTMLElement>('#app .trick .slot'), (el) => el.dataset.key ?? ''),
    }));
  }

  /**
   * Do the one thing the table is waiting for from this seat, if anything, the way a person would:
   * with clicks and keys on what is on screen. Returns whether the game is over for this page.
   */
  async move(): Promise<boolean> {
    const page = this.page;
    const see = await page.evaluate(() => {
      const q = (s: string): Element | null => document.querySelector(s);
      return {
        over: q('#app .end') != null,
        cut: q('.table-overlay') != null,
        bidding: q('#app .bidsheet #bid') != null,
        bidSet: q('#app .bidsheet [data-act="bid"]:not([disabled])') != null,
        results: q('#app .sheet [data-act="next"]') != null,
        toResults: q('#app .actions [data-act="results"]') != null,
        tigress: q('#app .actions [data-act="play"][data-as="escape"]') != null,
        myTurn: q('#app .hand.myturn') != null,
        picked: q('#app .hand.myturn .hslot.sel:not(.locked)') != null,
      };
    });
    if (see.over) return true;
    if (see.cut) return false;
    // A click on something the table has just redrawn misses: the next look tries again.
    const click = (selector: string): Promise<void> =>
      page
        .locator(selector)
        .first()
        .click({ timeout: 1500 })
        .catch(() => {});
    if (see.bidding && !see.bidSet)
      await page
        .locator('#bid')
        .press('1', { timeout: 1500 })
        .catch(() => {});
    else if (see.bidding) await click('#app .bidsheet [data-act="bid"]');
    else if (see.results) await click('#app .sheet [data-act="next"]');
    else if (see.toResults) await click('#app .actions [data-act="results"]');
    else if (see.tigress) await click('#app .actions [data-act="play"][data-as="escape"]');
    else if (see.picked) await click('#app .hand.myturn .hslot.sel');
    else if (see.myTurn) await click('#app .hand.myturn .hslot:not(.locked)');
    return false;
  }
}
