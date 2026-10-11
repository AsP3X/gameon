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
import { Sound } from '../sound/sound';
import { session, stats, tableView, ui } from '../tableview/state';

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
async function renderApp(): Promise<void> {
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <StrictMode>
        <App transport={server.transport()} />
      </StrictMode>,
    );
    await vi.advanceTimersByTimeAsync(0);
  });
}
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
  server = new MockServer({
    random: seeded(4),
    timers: { bidMs: 3000, playMs: 300, abilityMs: 300, trickEndMs: 100, roundEndMs: 200 },
    bot: { minMs: 40, maxMs: 80 },
  });
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

    $('#bid')?.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true, cancelable: true }));
    await click('[data-act="bid"]');
    expect(tableView().bids[0]).toBe(2);
    expect(ui.waiting).toBe(false);
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

  it('says when the server cannot be reached, keeps trying, and recovers', async () => {
    server.drop(true);
    await renderApp();
    await click('[data-act="online"]');
    await settle();
    expect(texts('#online .pill')).toEqual(['Offline']);
    expect($('#online .notice b')?.textContent).toBe("Can't reach the tavern");
    expect(button('Create a table').disabled).toBe(true);
    server.restore();
    await press('Try now');
    await settle();
    expect(texts('#online .pill')).toEqual(['Connected']);
    expect($('#online .notice')).toBeNull();
  });

  it('pauses when the same player connects from somewhere else, until asked to play here', async () => {
    const as = server.transport();
    root = createRoot(host);
    await act(async () => {
      root?.render(<App transport={as} />);
      await vi.advanceTimersByTimeAsync(0);
    });
    await click('[data-act="online"]');
    await settle();
    const elsewhere = await connectRaw(as);
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
