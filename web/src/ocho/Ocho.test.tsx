// @vitest-environment jsdom
/* Ocho's pages against a stand-in for its server: what the page sends for each button, and what it
   draws from the lobby and the per-seat view it is pushed. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { GoContext } from '../gameon/Frame';
import type { Who } from '../gameon/Frame';
import { MockServer } from '../net/mock/server';
import type { Me } from '../protocol/generated';
import { OchoClient } from './client';
import { aLobby, aView, card, fakeOcho } from './fake';
import type { FakeOcho } from './fake';
import { OchoPage, OchoRules } from './Ocho';
import type { View } from './wire';

let host: HTMLDivElement;
let root: Root | null = null;
let fake: FakeOcho;
let ocho: OchoClient;
let who: Who;
let went: string[];

const $ = (selector: string): HTMLElement | null => document.querySelector<HTMLElement>(selector);
const $$ = (selector: string): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>(selector));
const texts = (selector: string): string[] => $$(selector).map((el) => el.textContent ?? '');
const settle = (): Promise<void> => act(() => vi.advanceTimersByTimeAsync(0).then(() => {}));
const button = (label: string): HTMLButtonElement => {
  const el = Array.from(document.querySelectorAll('button')).find(
    (b) =>
      b.textContent === label || b.getAttribute('aria-label') === label || b.querySelector('b')?.textContent === label,
  );
  if (!el) throw new Error(`No button says "${label}"`);
  return el;
};
async function press(label: string): Promise<void> {
  const el = button(label);
  if (el.disabled) throw new Error(`"${label}" is disabled`);
  await act(async () => {
    el.click();
    await vi.advanceTimersByTimeAsync(0);
  });
}
/** The frames the page sent after hello, without their ids. */
const sent = (): Record<string, unknown>[] =>
  fake.sent.filter((f) => f.t !== 'hello').map(({ id: _id, ...rest }) => rest);
async function push(frame: unknown): Promise<void> {
  await act(async () => {
    fake.push(frame);
    await vi.advanceTimersByTimeAsync(0);
  });
}
async function answer(): Promise<void> {
  await act(async () => {
    fake.ok();
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function render(node: React.ReactNode): Promise<void> {
  root = createRoot(host);
  await act(async () => {
    root?.render(<GoContext value={(path) => went.push(path)}>{node}</GoContext>);
    await vi.advanceTimersByTimeAsync(0);
  });
  await settle();
}
const page = (teams = false) => <OchoPage ocho={ocho} who={who} teams={teams} go={(path) => went.push(path)} />;
/** At the table: seated as Remy (seat 0) in a full, dealt lobby, with this view. */
async function atTable(view: View, players = 8): Promise<void> {
  await render(page());
  await push({ t: 'ocho.lobby', lobby: aLobby({ started: true }, players, players) });
  await push({ t: 'ocho.view', view });
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('scrollTo', () => {});
  document.body.innerHTML = '<div id="root"></div>';
  host = document.querySelector<HTMLDivElement>('#root') ?? document.createElement('div');
  const guest = (await new MockServer().browser().rest('POST', '/auth/guest')).body as Me;
  who = { is: 'player', me: { ...guest, user: { ...guest.user, id: 'u0', name: 'Remy' } } };
  fake = fakeOcho();
  ocho = new OchoClient(fake.transport);
  went = [];
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('sitting down at Ocho', () => {
  it('connects once there is a session, and opens a table with the settings, then readies the host', async () => {
    await render(page());
    expect(fake.opened).toBe(1);
    expect($('h1')?.textContent).toBe('Ocho');
    expect($('.oc-step-value')?.textContent).toBe('4');
    await press('One player more');
    await press('First to 500');
    await press('Start');
    expect(sent()).toEqual([{ t: 'ocho.create', players: 5, teams: false, match: 'to500' }]);
    await answer();
    expect(sent()[1]).toEqual({ t: 'ocho.ready', ready: true });
  });

  it('offers no bots first, and sends the level picked with the create', async () => {
    await render(page());
    const bots = $$('.oc-field').find((f) => f.querySelector('h2')?.textContent === 'Bots');
    expect(Array.from(bots?.querySelectorAll('.oc-choice') ?? []).map((b) => b.textContent)).toEqual([
      'No botsFriends join with the code',
      'EasyMakes mistakes',
      'NormalSolid play',
      'HardReads the table',
    ]);
    expect(button('No bots').getAttribute('aria-pressed')).toBe('true');
    await press('Hard');
    expect(button('Hard').getAttribute('aria-pressed')).toBe('true');
    expect(button('No bots').getAttribute('aria-pressed')).toBe('false');
    await press('Start');
    expect(sent()).toEqual([{ t: 'ocho.create', players: 4, teams: false, match: 'one', bots: 'hard' }]);
    await answer();
    expect(sent()[1]).toEqual({ t: 'ocho.ready', ready: true });
  });

  it('keeps teams at four with bots, and leaves the field out again for no bots', async () => {
    await render(page(true));
    await press('Easy');
    await press('No bots');
    await press('Start');
    expect(sent()).toEqual([{ t: 'ocho.create', players: 4, teams: true, match: 'to500' }]);
  });

  it('locks the count at four for teams, with the note about partners', async () => {
    await render(page(true));
    expect(button('Teams').getAttribute('aria-pressed')).toBe('true');
    expect(button('One player more').disabled).toBe(true);
    expect(button('One player fewer').disabled).toBe(true);
    expect($('.oc-step-caption')?.textContent).toBe('Teams is 2v2 · 4 players');
    expect($('.oc-note')?.textContent).toBe('Partners sit opposite and see each other’s cards.');
    await press('Start');
    expect(sent()).toEqual([{ t: 'ocho.create', players: 4, teams: true, match: 'to500' }]);
  });

  it("joins with a code, and says the server's refusal", async () => {
    await render(page());
    const input = document.querySelector<HTMLInputElement>('.oc-code-input');
    await act(async () => {
      if (input) Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'k7qx2p');
      input?.dispatchEvent(new Event('input', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(0);
    });
    await press('Join');
    expect(sent()).toEqual([{ t: 'ocho.join', code: 'K7QX2P' }]);
    await act(async () => {
      fake.err('LOBBY_FULL', 'That table is full.');
      await vi.advanceTimersByTimeAsync(0);
    });
    expect($('.alert')?.textContent).toBe('That table is full.');
  });
});

describe('the table waiting', () => {
  it('shows the code and who sat down, and lets the host deal only when every seat is filled and ready', async () => {
    await render(page());
    await push({ t: 'ocho.lobby', lobby: aLobby({ players: 4 }, 2, 4) });
    expect($('.oc-code-value')?.textContent).toBe('K7QX2P');
    expect(texts('.oc-rows .oc-row-text b')).toEqual(['You', 'Ana', 'Waiting for a player', 'Waiting for a player']);
    expect(button('Start').disabled).toBe(true);
    expect($('.oc-panel > p[role="status"]')?.textContent).toBe('Waiting for 2 more players');
    await push({ t: 'ocho.lobby', lobby: aLobby({ players: 4 }, 4, 4) });
    await press('Start');
    expect(sent()).toEqual([{ t: 'ocho.start' }]);
  });

  it('names the bot seats and their level, and gives no code to pass on', async () => {
    await render(page());
    const lobby = aLobby({ players: 4, bots: 'hard' }, 4, 4);
    lobby.members = lobby.members.map((m, i) => ({ ...m, ready: i > 0, bot: i > 0 }));
    await push({ t: 'ocho.lobby', lobby });
    expect($('.oc-panel > p.oc-muted')?.textContent).toBe('Free-for-all · 4 players · One hand · Hard bots');
    expect($('.oc-code .oc-muted')?.textContent).toBe('The other seats are Hard bots.');
    expect(texts('.oc-rows .oc-row-text small')).toEqual(['Host', 'Hard bot', 'Hard bot', 'Hard bot']);
    await press('Ready');
    expect(sent()).toEqual([{ t: 'ocho.ready', ready: true }]);
  });

  it('puts the team after the level for a teams table with bots', async () => {
    await render(page());
    const lobby = aLobby({ players: 4, teams: true, firstTo500: true, bots: 'normal' }, 4, 4);
    lobby.members = lobby.members.map((m, i) => ({ ...m, bot: i > 0 }));
    await push({ t: 'ocho.lobby', lobby });
    expect($('.oc-panel > p.oc-muted')?.textContent).toBe('Teams · 4 players · First to 500 · Normal bots');
    expect(texts('.oc-rows .oc-row-text small')).toEqual([
      'Host',
      'Normal bot · Team 2',
      'Normal bot · Team 1',
      'Normal bot · Team 2',
    ]);
  });

  it('has no Start for a player who is not the host, only their own Ready', async () => {
    await render(page());
    await push({ t: 'ocho.lobby', lobby: aLobby({ players: 2, host: 'u1' }, 2, 2) });
    expect(Array.from(document.querySelectorAll('button')).some((b) => b.textContent === 'Start')).toBe(false);
    await press('Not ready');
    expect(sent()).toEqual([{ t: 'ocho.ready', ready: false }]);
  });
});

describe('the table', () => {
  it('draws the other seats by count only, the piles, the colour and the direction', async () => {
    await atTable(aView());
    expect(texts('.oc-seat-name')).toEqual(['Ana', 'Ben', 'Cleo', 'Dev', 'Eli', 'Fay', 'Gus']);
    expect($$('.oc-seat').map((s) => s.dataset.slot)).toEqual(['l2', 'l1', 't1', 't2', 't3', 'r1', 'r2']);
    expect(texts('.oc-count > span:last-child')[0]).toBe('8 cards');
    // Another seat's hand is never there: no face is drawn on any seat.
    expect($$('.oc-seat .oc-card:not(.back)')).toEqual([]);
    expect($('.oc-match')?.textContent).toBe('Yellow · 4');
    expect($('.oc-direction')?.textContent).toBe('Clockwise');
    expect($('.oc-pile figcaption')?.textContent).toBe('Draw · 41');
    expect($('.oc-stack')).toBeNull();
  });

  it('lights up only the cards the view lists, and plays the one picked', async () => {
    await atTable(aView());
    const hand = $$('.oc-hand-card');
    expect(hand.map((b) => b.getAttribute('aria-label'))).toEqual(['Red 3', 'Yellow 7', 'Blue Skip', 'Ocho Wild']);
    expect(hand.map((b) => (b as HTMLButtonElement).disabled)).toEqual([true, false, true, false]);
    expect(button('Play').disabled).toBe(true);
    await press('Yellow 7');
    expect($('.oc-status')?.textContent).toBe('Match yellow or 4 · Yellow 7 plays');
    await press('Play Yellow 7');
    expect(sent()).toEqual([{ t: 'ocho.play', card: 11 }]);
  });

  it('grows a wild into the colour card and sends the quadrant pressed with the card', async () => {
    await atTable(aView());
    await press('Ocho Wild');
    await press('Play Ocho Wild');
    expect($('[role="dialog"]')).toBeNull();
    const wheel = $('.oc-namer [role="group"]');
    expect(wheel?.getAttribute('aria-label')).toBe('Name a color');
    expect(texts('.oc-namer .oc-quadrant')).toEqual(['Red', 'Blue', 'Green', 'Yellow']);
    expect(document.activeElement?.textContent).toBe('Red');
    expect($('.oc-status')?.textContent).toBe('You played Ocho Wild · name the next color');
    expect($('[data-card="13"]')?.classList.contains('oc-away')).toBe(true);
    expect(sent()).toEqual([]);
    await press('Green');
    expect(sent()).toEqual([{ t: 'ocho.play', card: 13, color: 'green' }]);
    expect($('.oc-namer')).toBeNull();
  });

  it('puts a wild back in the hand with Back or Escape, and sends nothing', async () => {
    await atTable(aView());
    await press('Ocho Wild');
    await press('Play Ocho Wild');
    await press('Back');
    expect($('.oc-namer')).toBeNull();
    expect($('[data-card="13"]')?.classList.contains('oc-away')).toBe(false);
    // Still picked: the card came back, and Play names its colour again.
    await press('Play Ocho Wild');
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect($('.oc-namer')).toBeNull();
    expect(sent()).toEqual([]);
  });

  it('draws one when nothing matches, and plays or keeps the card just drawn', async () => {
    await atTable(aView({ legal: [] }));
    expect($('.oc-status')?.textContent).toBe('Nothing in your hand matches yellow or 4');
    await press('Draw one');
    expect(sent()).toEqual([{ t: 'ocho.draw' }]);
    await answer();
    await push({
      t: 'ocho.view',
      view: aView({
        phase: 'drawn',
        must: 'playDrawnOrKeep',
        legal: [14],
        hand: [...aView().hand, card(14, 'yellow', { number: 2 })],
      }),
    });
    expect($('.oc-status')?.textContent).toBe('You drew Yellow 2 · it plays');
    await press('End turn');
    expect(sent()[1]).toEqual({ t: 'ocho.keep' });
  });

  it('shows an open stack, and takes it', async () => {
    await atTable(aView({ must: 'answerStack', stack: 6, legal: [] }));
    expect($('.oc-stack')?.textContent).toBe('+6 to draw');
    expect($('.oc-status')?.textContent).toBe('Play Draw 2, Wild Draw 4 or Shield · or take 6');
    await press('Take 6');
    expect(sent()).toEqual([{ t: 'ocho.draw' }]);
  });

  it('names the opening colour on the opening card, which can be put down and taken up again', async () => {
    await atTable(aView({ phase: 'chooseColor', must: 'chooseColor', top: card(30, null, 'wild'), symbol: 'color' }));
    expect($('.oc-namer [role="group"]')?.getAttribute('aria-label')).toBe('Name a color');
    expect($('.oc-status')?.textContent).toBe('Opening card: Ocho Wild · name the color');
    await press('Back');
    expect($('.oc-namer')).toBeNull();
    await press('Name the color');
    await press('Blue');
    expect(sent()).toEqual([{ t: 'ocho.color', color: 'blue' }]);
  });

  it("waits on another seat's turn with nothing to press", async () => {
    await atTable(aView({ must: 'none', turn: 3, legal: [] }));
    expect($('.oc-status')?.textContent).toBe('Cleo to play');
    expect($$('.oc-hand-card').every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    expect($('.oc-seat.oc-turn .oc-seat-name')?.textContent).toBe('Cleo');
  });

  it("puts X-Ray's cards on their seats, and nowhere else", async () => {
    await atTable(aView({ must: 'none', turn: 1, xray: [{ seat: 2, card: card(50, 'red', 'skip') }] }));
    const ben = $$('.oc-seat').find((s) => s.querySelector('.oc-seat-name')?.textContent === 'Ben');
    expect(ben?.querySelector('.oc-mini')?.textContent).toBe('SKIP');
    expect($$('.oc-mini')).toHaveLength(1);
    expect($('.oc-xray-note')?.textContent).toBe('X-Ray · one card from each hand. Only you see them.');
  });

  it('stacks the draw pile as thick as the pile is tall', async () => {
    await atTable(aView({ drawCount: 95 }));
    expect($$('.oc-stack-pile .oc-layer')).toHaveLength(9);
    await push({ t: 'ocho.view', view: aView({ drawCount: 41 }) });
    expect($$('.oc-stack-pile .oc-layer')).toHaveLength(4);
    await push({ t: 'ocho.view', view: aView({ drawCount: 0 }) });
    expect($('.oc-stack-pile .oc-card')).toBeNull();
    expect($('.oc-pile-empty')).not.toBeNull();
  });

  it('raises the card just drawn that plays, and lifts only the legal cards', async () => {
    await atTable(aView());
    expect($$('.oc-hand-card.oc-can').map((b) => b.getAttribute('aria-label'))).toEqual(['Yellow 7', 'Ocho Wild']);
    await push({
      t: 'ocho.view',
      view: aView({
        phase: 'drawn',
        must: 'playDrawnOrKeep',
        legal: [14],
        hand: [...aView().hand, card(14, 'yellow', { number: 2 })],
      }),
    });
    expect($$('.oc-hand-card.oc-raised').map((b) => b.getAttribute('aria-label'))).toEqual(['Yellow 2']);
  });

  it("shows a partner's hand only when the server sent it", async () => {
    await atTable(aView({ counts: [4, 5, 3, 6], scores: [0, 0, 0, 0] }), 4);
    expect($('.oc-partner-hand')).toBeNull();
    await push({
      t: 'ocho.view',
      view: aView({
        counts: [4, 5, 3, 6],
        scores: [0, 0, 0, 0],
        partnerHand: [card(60, 'green', { number: 2 }), card(61, null, 'shield')],
      }),
    });
    expect($$('.oc-seat').map((s) => s.dataset.slot)).toEqual(['l1', 't2', 'r1']);
    const partner = $('.oc-partner-hand');
    expect(partner?.closest('.oc-seat')?.querySelector('.oc-seat-name')?.textContent).toBe('Ben');
    expect(texts('.oc-partner-hand .oc-mini')).toEqual(['2', 'SHLD']);
    expect(texts('.oc-you .pill')).toContain('Team with Ben');
  });
});

describe('the match score', () => {
  const between = aView({
    phase: 'between',
    must: 'nextHand',
    hand: [],
    legal: [],
    counts: [0, 2, 3],
    scores: [77, 0, 120],
    handPoints: [77, 0, 0],
    handWinner: 0,
    handNo: 2,
    target: 500,
  });

  it('ranks the totals, says who went out, and deals the next hand', async () => {
    await atTable(between, 3);
    expect($('h1')?.textContent).toBe('Match score');
    expect($('.oc-score-meta p')?.textContent).toBe('You went out · 77 this hand');
    expect($('.oc-score-meta .pill')?.textContent).toBe('First to 500');
    expect(texts('.oc-score-rows .oc-row-text b')).toEqual(['Ben', 'You', 'Ana']);
    expect(texts('.oc-score-rows .oc-row-text small')).toEqual(['1st place', 'Went out · +77 this hand', '3rd place']);
    expect(texts('.oc-score-rows .oc-total')).toEqual(['120', '77', '0']);
    expect($('.oc-row.oc-lead .pill')?.textContent).toBe('Leader');
    await press('Next hand');
    expect(sent()).toEqual([{ t: 'ocho.next' }]);
  });

  it('waits for the one who went out to deal', async () => {
    await atTable({ ...between, must: 'none', handWinner: 1, handPoints: [0, 77, 0] }, 3);
    expect($('.oc-score-actions')?.textContent).toBe('Waiting for Ana to deal the next hand');
  });

  it('names the winner of the match, and goes back to the games giving up the seat', async () => {
    await atTable({ ...between, phase: 'over', must: 'none', matchWinner: 2, scores: [77, 0, 512] }, 3);
    expect($('h1')?.textContent).toBe('Ben wins the match');
    expect($('.oc-row.oc-lead .pill')?.textContent).toBe('Winner');
    await press('Back to games');
    expect(sent()).toEqual([{ t: 'ocho.leave' }]);
    expect(went).toEqual(['/games']);
    expect(ocho.getState().view).toBeNull();
  });
});

describe('how to play Ocho', () => {
  it('is the page in the drawing, with its two ways', async () => {
    await render(<OchoRules />);
    expect($('h1')?.textContent).toBe('How to play');
    expect(texts('.oc-rule h2')).toEqual(['A hand', 'A turn', 'The score', 'The specials']);
    expect(texts('.oc-specials b')).toEqual([
      'Skip',
      'Reverse',
      'Draw 2 and Wild Draw 4',
      'Shield',
      'X-Ray',
      'Dead Red',
      'Boo Blue',
    ]);
    expect($$('.oc-way').map((a) => a.getAttribute('href'))).toEqual(['/games/ocho', '/games/ocho/teams']);
  });
});
