// @vitest-environment jsdom
/* The whole page against the mock server: from the home screen through the hub and the lobby to a
   bid at the table, and back. What is clicked here is what a player clicks. */
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { App } from '../App';
import { connectRaw, framesOf } from '../net/mock/raw';
import type { RawClient } from '../net/mock/raw';
import { MockServer } from '../net/mock/server';
import type { MockStore } from '../net/mock/server';
import type { Transport } from '../net/socket';
import { Sound } from '../sound/sound';
import { session, stats, tableView, ui } from '../tableview/state';
import { reloadPage } from './reload';

vi.mock('./reload', () => ({ reloadPage: vi.fn<() => void>() }));

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let host: HTMLDivElement;
let root: Root | null = null;
let server: MockServer;

const $ = (selector: string): HTMLElement | null => document.querySelector<HTMLElement>(selector);
const texts = (selector: string): string[] =>
  Array.from(document.querySelectorAll<HTMLElement>(selector), (el) => el.textContent ?? '');
/** Let the clocks and the frames run, and React with them. */
const settle = (ms = 0): Promise<void> => act(() => vi.advanceTimersByTimeAsync(ms).then(() => {}));
/** The button whose label is `label`, or starts with it when no label is exactly that. */
const button = (label: string): HTMLButtonElement => {
  const all = Array.from(document.querySelectorAll('button'));
  const el = all.find((b) => b.textContent === label) ?? all.find((b) => b.textContent?.startsWith(label));
  if (!el) throw new Error(`No button says "${label}"`);
  return el;
};
async function clickOn(el: HTMLElement, what: string): Promise<void> {
  if (el instanceof HTMLButtonElement && el.disabled) throw new Error(`${what} is disabled`);
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);
  });
}
/** A click on the first element that matches the selector. */
async function click(selector: string): Promise<void> {
  const el = $(selector);
  if (!el) throw new Error(`Nothing to click: ${selector}`);
  await clickOn(el, selector);
}
/** A click on the button with that label. */
const press = (label: string): Promise<void> => clickOn(button(label), `"${label}"`);
/** Type into a field React controls. */
async function type(selector: string, value: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`Nothing to type into: ${selector}`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(0);
  });
}
async function renderApp(transport: Transport = server.transport()): Promise<void> {
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <StrictMode>
        <App
          backend={{
            transport,
            rest: () => Promise.reject(new Error('This screen test has no REST')),
          }}
        />
      </StrictMode>,
    );
    await vi.advanceTimersByTimeAsync(0);
  });
}
/** The page goes away: closed, or about to be loaded again. What it left in localStorage stays. */
function closePage(): void {
  act(() => root?.unmount());
  root = null;
}
const CLOCKS = { bidMs: 3000, playMs: 300, abilityMs: 300, trickEndMs: 100, roundEndMs: 200 };
const makeServer = (store?: MockStore): MockServer =>
  new MockServer({ random: seeded(4), timers: CLOCKS, bot: { minMs: 40, maxMs: 80 }, store });
/** From the home screen to the lobby of a new private table with three seats and five short rounds. */
async function createTable(): Promise<void> {
  await click('[data-act="online"]');
  await press('Create a table');
  await click('[aria-label="Fewer seats"]');
  await press('Swift-n-Salty');
  await press('Create table');
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockImplementation(seeded(21));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }));
  vi.stubGlobal('scrollTo', () => {});
  localStorage.clear();
  document.body.innerHTML = '<div id="root"></div>';
  host = document.querySelector<HTMLDivElement>('#root') ?? document.createElement('div');
  server = makeServer();
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('playing online', () => {
  it('connects when the hub opens, and not before', async () => {
    await renderApp();
    expect($('#online')).toBeNull();
    expect($('#app')?.hidden).toBe(false);
    act(() => {
      $('[data-act="online"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // The hub is up at once, and says it is still connecting.
    expect($('#app')?.hidden).toBe(true);
    expect($('#online h2')?.textContent).toBe('Play online');
    expect(texts('#online .pill')).toEqual(['Connecting…']);
    expect($('#online .notice b')?.textContent).toBe('Finding the tavern…');
    expect(button('Create a table').disabled).toBe(true);
    expect(button('Join with a code').disabled).toBe(true);

    await settle();
    expect(texts('#online .pill')).toEqual(['Connected']);
    expect($('#online .notice')).toBeNull();
    expect($('#online .identity b')?.textContent).toMatch(/^Guest \d{4}$/);
    expect(button('Create a table').disabled).toBe(false);

    // Back is back: the home screen, and the connection is given up.
    await click('[aria-label="Back"]');
    expect($('#online')).toBeNull();
    expect($('#app')?.hidden).toBe(false);
    expect($('#app .home')).not.toBeNull();
  });

  it('stops the menu music while the hub is where the home screen was, and brings it back with it', async () => {
    const music = vi.spyOn(Sound, 'music');
    const wanted = (): boolean | undefined => music.mock.calls.at(-1)?.[0];
    await renderApp();
    expect(wanted()).toBe(true);
    await click('[data-act="online"]');
    expect(wanted()).toBe(false);
    await click('[aria-label="Back"]');
    expect(wanted()).toBe(true);
  });

  it('creates a private table, adds a bot, readies, starts and bids once at the table', async () => {
    await renderApp();
    await createTable();

    // The lobby of the new table: a code to share, the host alone, two open seats.
    expect($('#online h2')?.textContent).toBe('Table');
    expect($('#online .code')?.textContent).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(texts('#online .member b').map((n) => n.replace(/\d/g, '#'))).toEqual(['Guest ####']);
    expect(texts('#online .member small')).toEqual(['Host · you']);
    expect(texts('#online .member.open')).toHaveLength(2);
    expect($('#online [aria-label="Rules"] small')?.textContent).toBe(
      'Up to 3 pirates · Normal bots · Standard pace · No extra cards',
    );
    expect($('#online [aria-label="Rules"] b')?.textContent).toBe("Skull King's scoring · Swift-n-Salty");
    expect($('#online .foot-hint')?.textContent).toBe('A game needs two pirates. Add a bot or share the code.');
    expect(button('Start game').disabled).toBe(true);

    await press('Add a bot');
    expect(texts('#online .member small')).toEqual(['Host · you', 'Bot · Normal']);
    expect($('#online [aria-label="Crew"] .label')?.textContent).toBe('Crew · 2 of 3');
    expect($('#online .foot-hint')?.textContent).toBe('Say you are ready, then start the game.');
    expect(button('Start game').disabled).toBe(true);

    await press("I'm ready");
    expect(texts('#online .member .pill')).toEqual(['Ready']);
    expect($('#online .foot-hint')?.textContent).toBe('Everyone is ready. Start when you like.');
    expect(button('Not ready')).toBeDefined();

    await press('Start game');
    // The game is played at the renderer's table: the online screens step aside.
    expect($('#online')).toBeNull();
    expect($('#app')?.hidden).toBe(false);
    expect(ui.screen).toBe('game');
    expect(session.table?.localSeats).toEqual([0]);
    expect(document.querySelectorAll('#app .hand .hslot')).toHaveLength(5);
    expect(texts('#app .seat .sname')).toEqual(['Anne']);
    expect($('#app .bidsheet')).not.toBeNull();
    // The bid is on the server's clock: a ring around this seat, none around the bot, who has none.
    expect($('#app .mebar .ring')?.getAttribute('style')).toContain('--left:3000ms');
    expect($('#app .seat .ring')).toBeNull();

    $('#bid')?.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true, cancelable: true }));
    await click('[data-act="bid"]');
    expect(tableView().bids[0]).toBe(2);
    expect(ui.waiting).toBe(false);
    expect($('#app .ring')).toBeNull(); // nobody is waited for on a clock now
    // The bot bids on the server's clock, and the bids are turned over for everyone at once.
    await settle(1500);
    expect(tableView().phase).not.toBe('bidding');
    expect(tableView().bids.every((b) => b != null && b >= 0)).toBe(true);
    // None of this is the offline game's: nothing was saved on the device for it.
    expect(localStorage.getItem('skullking-tavern.game.v2')).toBeNull();
  });

  it('changes the rules as host, which clears every ready, and removes a bot again', async () => {
    await renderApp();
    await createTable();
    await press('Add a bot');
    await press("I'm ready");
    await press('Change');
    expect($('#online h2')?.textContent).toBe('Table rules');
    expect($('#online .foot-hint')?.textContent).toBe("Saving new rules clears everyone's ready.");
    // Two are at the table: it cannot have fewer seats than that.
    await click('[aria-label="Fewer seats"]');
    expect($('[aria-label="Fewer seats"]')).toHaveProperty('disabled', true);
    await press('Hard');
    await press('Save rules');
    expect($('#online h2')?.textContent).toBe('Table');
    expect($('#online [aria-label="Rules"] small')?.textContent).toBe(
      'Up to 2 pirates · Hard bots · Standard pace · No extra cards',
    );
    expect(texts('#online .member small')).toEqual(['Host · you', 'Bot · Hard']);
    expect(texts('#online .member .pill')).toEqual(['Not ready']);
    expect($('#online .member.open')).toBeNull();
    expect(Array.from(document.querySelectorAll('button')).some((b) => b.textContent === 'Add a bot')).toBe(false);

    await click('[aria-label="Remove Anne"]');
    expect(texts('#online .member small')).toEqual(['Host · you']);
    // The rules the table was made with are remembered on this device for the next one.
    expect(JSON.parse(localStorage.getItem('skullking-tavern.lobby.v1') ?? '{}')).toMatchObject({
      maxPlayers: 2,
      format: 'swift',
      botLevel: 'hard',
    });
  });

  describe('with a friend', () => {
    let friend: RawClient;
    /** The friend's table, made from another connection: this page joins it by its code. */
    async function friendsTable(): Promise<string> {
      friend = await connectRaw(server.transport());
      await settle();
      friend.send({
        t: 'lobby.create',
        visibility: 'private',
        settings: {
          maxPlayers: 3,
          scoring: 'classic',
          format: 'swift',
          loot: false,
          kraken: false,
          whale: false,
          abilities: false,
          botLevel: 'normal',
          pace: 'standard',
        },
      });
      await settle();
      const code = framesOf(friend, 'ok').at(-1)?.lobby?.code;
      if (!code) throw new Error('The friend has no table');
      return code;
    }

    it('joins by code, says so when the code is wrong, and waits for the host as a guest', async () => {
      const code = await friendsTable();
      await renderApp();
      await click('[data-act="online"]');
      await press('Join with a code');
      expect(button('Join table').disabled).toBe(true);
      await type('#table-code', 'zz-zz zz!');
      expect($('#table-code')).toHaveProperty('value', 'ZZZZZZ');
      await press('Join table');
      expect($('#online [role="alert"]')?.textContent).toBe('No table has that code. Check it with the host.');
      expect($('#table-code')?.getAttribute('aria-invalid')).toBe('true');

      await type('#table-code', code.toLowerCase());
      expect($('#online [role="alert"]')).toBeNull();
      await press('Join table');
      expect($('#online h2')?.textContent).toBe('Table');
      expect($('#online .code')?.textContent).toBe(code);
      expect(texts('#online .member small')).toEqual(['Host', 'You']);
      // A guest readies and waits: the bots, the rules and the start are the host's.
      expect(texts('#online button').filter((t) => ['Add a bot', 'Change', 'Start game'].includes(t))).toEqual([]);
      expect($('#online .foot-hint')?.textContent).toBe('Say you are ready when you are set.');
      await press("I'm ready");
      expect($('#online .foot-hint')?.textContent).toMatch(/^Waiting for Guest \d{4} to be ready\.$/);

      friend.send({ t: 'lobby.ready', ready: true });
      await settle();
      expect($('#online .foot-hint')?.textContent).toBe('Everyone is ready. The host starts the game.');
      friend.send({ t: 'lobby.start' });
      await settle();
      expect(ui.screen).toBe('game');
      expect(session.table?.localSeats).toEqual([1]);
      expect($('#online')).toBeNull();
    });

    it('is told when the host removes them, and can read it and move on', async () => {
      const code = await friendsTable();
      await renderApp();
      await click('[data-act="online"]');
      await press('Join with a code');
      await type('#table-code', code);
      await press('Join table');
      const me = framesOf(friend, 'lobby.state').at(-1)?.lobby.members[1];
      friend.send({ t: 'lobby.kick', userId: me?.kind === 'human' ? me.user.id : '' });
      await settle();
      expect($('#online h2')?.textContent).toBe('Play online');
      expect($('#online .notice.gold b')?.textContent).toBe('The host removed you from the table');
      await press('OK');
      expect($('#online .notice')).toBeNull();
    });

    it('leaves a running game after being asked, lands on the hub, and hears how the game ended', async () => {
      const code = await friendsTable();
      await renderApp();
      await click('[data-act="online"]');
      await press('Join with a code');
      await type('#table-code', code);
      await press('Join table');
      await press("I'm ready");
      friend.send({ t: 'lobby.addBot' });
      friend.send({ t: 'lobby.ready', ready: true });
      await settle();
      friend.send({ t: 'lobby.start' });
      await settle();
      expect(ui.screen).toBe('game');

      await click('#app .g-top [data-act="home"]');
      expect($('#app .sheet h2')?.textContent).toBe('Leave the table?');
      await click('[data-act="leaveTable"]');
      await settle();
      // The table is down and so is the seat in the lobby: this is the hub.
      expect($('#app')?.hidden).toBe(true);
      expect($('#online h2')?.textContent).toBe('Play online');
      expect(session.table).toBeNull();
      expect($('#online .notice')).toBeNull();
      expect(framesOf(friend, 'lobby.state').at(-1)?.lobby.members).toHaveLength(2);

      // The others play to the end. The result reaches the one who left as a notice, not as a table.
      for (let i = 0; i < 400 && !framesOf(friend, 'game.over').length; i++) await settle(250);
      expect(framesOf(friend, 'game.over')).toHaveLength(1);
      expect($('#online .notice.gold b')?.textContent).toBe('Your last game is over');
      expect($('#online .notice.gold p')?.textContent).toMatch(
        /^You left before the end\. Final place: \d(st|nd|rd) of 3\.$/,
      );
      expect($('#online h2')?.textContent).toBe('Play online');
      expect(session.table).toBeNull();
    });
  });

  it('takes the keyboard to the title of each screen it opens', async () => {
    await renderApp();
    await click('[data-act="online"]');
    await settle();
    expect(document.activeElement).toBe($('#online h2'));
    expect(document.activeElement?.textContent).toBe('Play online');
    await press('Join with a code');
    expect(document.activeElement?.textContent).toBe('Join a table');
    await click('#online [aria-label="Back"]');
    expect(document.activeElement?.textContent).toBe('Play online');
  });

  it('tells the player to reload when the server no longer speaks the protocol of this page', async () => {
    // The page says hello in a protocol the server has left behind: it answers PROTOCOL_UNSUPPORTED.
    const old: Transport = async () => {
      const inner = await server.transport()();
      return {
        send: (data) => {
          const frame = JSON.parse(data) as { t: string; protocol?: number };
          inner.send(frame.t === 'hello' ? JSON.stringify({ ...frame, protocol: 0 }) : data);
        },
        close: () => inner.close(),
        get onmessage() {
          return inner.onmessage;
        },
        set onmessage(handler) {
          inner.onmessage = handler;
        },
        get onclose() {
          return inner.onclose;
        },
        set onclose(handler) {
          inner.onclose = handler;
        },
      };
    };
    await renderApp(old);
    await click('[data-act="online"]');
    await settle();
    expect(texts('#online .pill')).toEqual(['Update needed']);
    expect($('#online .notice[role="alert"] b')?.textContent).toBe('The tavern has moved on');
    expect($('#online .notice[role="alert"] p')?.textContent).toBe(
      'This page is older than the server. Reload to update.',
    );
    expect(button('Create a table').disabled).toBe(true);
    expect(reloadPage).not.toHaveBeenCalled();
    await press('Reload to update');
    expect(reloadPage).toHaveBeenCalledTimes(1);
    // It does not try again by itself: only a new page can speak to this server.
    await settle(60_000);
    expect(texts('#online .pill')).toEqual(['Update needed']);
  });

  it('shows the way to the offline modes when the server cannot be reached', async () => {
    server.drop(true);
    await renderApp();
    await click('[data-act="online"]');
    await settle();
    expect($('#online .notice p:last-of-type')?.textContent).toBe(
      'Bots, one phone for the crew and the scoresheet need no connection.',
    );
    await press('Play offline');
    expect($('#online')).toBeNull();
    expect($('#app .home')).not.toBeNull();
    expect(ui.screen).toBe('home');
  });

  it('says when the server cannot be reached, keeps trying, and recovers', async () => {
    server.drop(true);
    await renderApp();
    await click('[data-act="online"]');
    await settle();
    expect(texts('#online .pill')).toEqual(['Offline']);
    expect($('#online .notice b')?.textContent).toBe("Can't reach the tavern");
    expect(texts('#online .notice .btn')).toEqual(['Try now', 'Play offline']);
    expect(button('Create a table').disabled).toBe(true);
    server.restore();
    await press('Try now');
    await settle();
    expect(texts('#online .pill')).toEqual(['Connected']);
    expect($('#online .notice')).toBeNull();
  });

  it('pauses when the same player connects from somewhere else, until asked to play here', async () => {
    const as = server.browser();
    root = createRoot(host);
    await act(async () => {
      root?.render(<App backend={as} />);
      await vi.advanceTimersByTimeAsync(0);
    });
    await click('[data-act="online"]');
    await settle();
    const elsewhere = await connectRaw(as.transport);
    await settle();
    expect(texts('#online .pill')).toEqual(['Paused']);
    expect($('#online .notice b')?.textContent).toBe('Playing in another tab');
    await settle(60_000);
    expect(texts('#online .pill')).toEqual(['Paused']); // it does not fight for the seat on its own
    await press('Play here');
    await settle();
    expect(texts('#online .pill')).toEqual(['Connected']);
    expect(elsewhere.closed).toBe(4001);
  });

  describe('at a table with a friend', () => {
    let friend: RawClient;
    /** This page hosts a table of three: itself, a friend on another connection, and a bot. The game is on. */
    async function seated(transport?: Transport): Promise<void> {
      await renderApp(transport);
      await click('[data-act="online"]');
      await press('Create a table');
      await click('[aria-label="Fewer seats"]');
      await press('Swift-n-Salty');
      await press('Create table');
      friend = await connectRaw(server.transport('the-friend'));
      await settle();
      friend.send({ t: 'lobby.join', code: $('#online .code')?.textContent ?? '' });
      friend.send({ t: 'lobby.ready', ready: true });
      await press('Add a bot');
      await press("I'm ready");
      await press('Start game');
      expect(ui.screen).toBe('game');
    }
    const seatOf = (name: RegExp): HTMLElement => {
      const seat = Array.from(document.querySelectorAll<HTMLElement>('#app .seat')).find((el) =>
        name.test(el.querySelector('.sname')?.textContent ?? ''),
      );
      if (!seat) throw new Error(`No seat for ${name}`);
      return seat;
    };

    it('shows the bid deadline as a ring on both people, and takes it off each as they bid', async () => {
      await seated();
      expect($('#app .mebar .ring')).not.toBeNull();
      expect(seatOf(/^Guest/).querySelector('.ring')).not.toBeNull();
      expect(seatOf(/^Anne/).querySelector('.ring')).toBeNull();
      // A second in, a third of the clock is gone.
      await settle(1000);
      friend.send({ t: 'game.bid', at: { round: 0, trick: 0 }, bid: 0 });
      await settle();
      expect(seatOf(/^Guest/).querySelector('.ring')).toBeNull();
      const style = $('#app .mebar .ring')?.getAttribute('style') ?? '';
      expect(style).toContain('--left:2000ms');
      expect(style).toContain('--gone:33.3');

      // The deadline passes: the server bids for this seat, and says so.
      await settle(1990);
      expect(tableView().bids[0]).toBeNull();
      for (let i = 0; i < 100 && tableView().bids[0] == null; i++) await settle(10);
      expect(tableView().bids[0]).not.toBeNull();
      expect(tableView().phase).not.toBe('bidding');
      expect($('#app .felt .pill.gold')?.textContent).toBe('Time ran out · the table played for you');
    });

    it('tags the friend as offline when their connection drops, and takes the tag off when they are back', async () => {
      await seated();
      expect($('#app .presence')).toBeNull();
      friend.close();
      await settle();
      const seat = seatOf(/^Guest/);
      expect(seat.querySelector('.presence.off')?.textContent).toBe('Offline');
      expect(seat.classList.contains('gone')).toBe(true);
      expect(session.table?.view(0).online?.status).toEqual(['online', 'offline', 'bot']);

      friend = await connectRaw(server.transport('the-friend'));
      await settle();
      expect($('#app .presence')).toBeNull();
      expect(seatOf(/^Guest/).classList.contains('gone')).toBe(false);
    });

    it('covers the table while the server cannot be heard, and comes back to the same hand', async () => {
      await seated();
      const hand = tableView().hand;
      $('#bid')?.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true }));
      await click('[data-act="bid"]');
      expect(tableView().bids[0]).toBe(1);
      expect($('.table-overlay')).toBeNull();
      expect($('#app')?.hasAttribute('inert')).toBe(false);

      server.drop(true);
      await settle();
      expect($('.table-overlay h2')?.textContent).toBe('Connection lost');
      expect($('.table-overlay')?.getAttribute('role')).toBe('alertdialog');
      // The table underneath takes no input: the keyboard is on the one thing that can be done.
      expect(document.activeElement).toBe($('.table-overlay button'));
      expect($('#app')?.hasAttribute('inert')).toBe(true);
      expect(ui.screen).toBe('game'); // the table stays where it was, underneath

      server.restore();
      await press('Try now');
      await settle();
      expect($('.table-overlay')).toBeNull();
      expect($('#app')?.hasAttribute('inert')).toBe(false);
      expect(tableView().hand).toEqual(hand);
      expect(tableView().bids[0]).toBe(1);
    });

    it('says so on the table when the same player connects from somewhere else', async () => {
      const as = server.transport('this-page');
      await seated(as);
      await connectRaw(as);
      await settle();
      expect($('.table-overlay h2')?.textContent).toBe('Playing in another tab');
      expect(button('Play here')).toBeDefined();
    });
  });

  describe('after a reload', () => {
    /** A mock that outlives its page, as the one behind `?mock` does in sessionStorage. */
    let kept: string | null;
    const store: MockStore = {
      load: () => kept,
      save: (data) => {
        kept = data;
      },
    };
    beforeEach(() => {
      kept = null;
      server = makeServer(store);
    });
    /** The page is loaded again: everything in it is new, the mock included. Only what was stored is left. */
    async function reload(): Promise<void> {
      await settle();
      closePage();
      server.shutDown();
      server = makeServer(store);
      await renderApp(server.transport('this-page'));
      await settle();
    }
    /** A game of this page and one bot, with this seat's bid already in. */
    async function midHand(): Promise<void> {
      await renderApp(server.transport('this-page'));
      await createTable();
      await press('Add a bot');
      await press("I'm ready");
      await press('Start game');
      $('#bid')?.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true, cancelable: true }));
      await click('[data-act="bid"]');
      await settle(1500);
      expect(tableView().phase).toBe('playing');
    }

    it('goes straight back to the table and the same hand, without being asked', async () => {
      await midHand();
      const before = tableView(),
        sent = { hand: before.hand, bids: before.bids, trick: before.trick, round: before.round };
      await reload();
      // No tap on "Play online": the last page was seated, so this one connected by itself.
      expect($('#online')).toBeNull();
      expect($('#app')?.hidden).toBe(false);
      expect(ui.screen).toBe('game');
      expect(session.table?.localSeats).toEqual([0]);
      const after = tableView();
      expect({ hand: after.hand, bids: after.bids, trick: after.trick, round: after.round }).toEqual(sent);
      expect(document.querySelectorAll('#app .hand .hslot')).toHaveLength(after.hand.length);
      // The seat is online again, and the table goes on from here.
      expect(after.online?.status).toEqual(['online', 'bot']);
      expect($('.table-overlay')).toBeNull();
      await settle(2000);
      const later = tableView();
      expect({ round: later.round, hand: later.hand }).not.toEqual({ round: sent.round, hand: sent.hand });
    });

    it('goes back to the lobby when that is where the player sat', async () => {
      await renderApp(server.transport('this-page'));
      await createTable();
      await press('Add a bot');
      const code = $('#online .code')?.textContent;
      await reload();
      expect($('#online h2')?.textContent).toBe('Table');
      expect($('#online .code')?.textContent).toBe(code);
      expect(texts('#online .member small')).toEqual(['Host · you', 'Bot · Normal']);
    });

    it('stays on the home screen when the player was only looking at the hub', async () => {
      await renderApp(server.transport('this-page'));
      await click('[data-act="online"]');
      await settle();
      await reload();
      expect($('#online')).toBeNull();
      expect($('#app .home')).not.toBeNull();
    });

    it('shows the result of a game that ended while the page was away, and opens no table for it', async () => {
      await midHand();
      await settle();
      closePage();
      // Nobody is at the table. The deadlines play this seat's cards, and the game runs to its end.
      await settle(120_000);
      await renderApp(server.transport('this-page'));
      await settle();
      // welcome has no game, and the stored game.over follows it: this is the lobby again, with the news.
      expect(session.table).toBeNull();
      expect(ui.screen).toBe('home');
      expect($('#app')?.hidden).toBe(true);
      expect($('#online h2')?.textContent).toBe('Table');
      expect($('#online .notice.gold b')?.textContent).toBe('Your last game is over');
      expect($('#online .notice.gold p')?.textContent).toMatch(
        /^It ended while you were away\. Final place: (1st|2nd) of 2\.$/,
      );
      await press('OK');
      expect($('#online .notice')).toBeNull();
    });

    it('shows the result of a game the player left, on the hub, the next time they come online', async () => {
      await midHand();
      await click('#app .g-top [data-act="home"]');
      await click('[data-act="leaveTable"]');
      await settle();
      expect($('#online h2')?.textContent).toBe('Play online');
      closePage();
      await settle(120_000);

      // Not seated any more: the next page waits to be asked.
      await renderApp(server.transport('this-page'));
      expect($('#online')).toBeNull();
      await click('[data-act="online"]');
      await settle();
      expect($('#online h2')?.textContent).toBe('Play online');
      expect(session.table).toBeNull();
      expect($('#online .notice.gold p')?.textContent).toMatch(
        /^You left before the end\. Final place: (1st|2nd) of 2\.$/,
      );
    });
  });

  it('leaves the offline game as it was: a solo round after a visit to the hub is saved and counted on the device', async () => {
    await renderApp();
    await click('[data-act="online"]');
    await settle();
    await click('[aria-label="Back"]');
    await click('[data-act="setup"]');
    await click('[data-act="start"]');
    expect(ui.screen).toBe('game');
    expect(session.online).toBeNull();
    expect(session.table?.localSeats).toEqual([0]);
    expect($('#app .g-top [data-act="home"]')?.getAttribute('aria-label')).toBe('Leave table (game is saved)');
    // The bots bid, and every step of an offline game is saved on the device.
    await settle(3000);
    expect(localStorage.getItem('skullking-tavern.game.v2')).toContain('"phase":"bidding"');
    // Leaving an offline table asks nothing: the game is on the device.
    await click('#app .g-top [data-act="home"]');
    expect(ui.screen).toBe('home');
    expect($('#app .sheet')).toBeNull();
    expect($('[data-act="resume"]')?.textContent).toBe('Continue · Round 1 of 10');
    expect(stats.games).toBe(0);
  });
});
