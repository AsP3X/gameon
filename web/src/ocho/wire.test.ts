/* Ocho's frames as `ocho-server` writes them: what the page reads, and what it drops. */
import { describe, expect, it } from 'vite-plus/test';
import { aLobby, aView, card } from './fake';
import { cardName, matchLine, matchWords } from './cards';
import { parseFrame } from './wire';

const frame = (value: unknown): string => JSON.stringify(value);

describe("Ocho's wire", () => {
  it('reads a view in the shape serde writes it, partner hand null and all', () => {
    const view = aView({ stack: 6, xray: [{ seat: 3, card: card(40, null, 'xRay') }] });
    expect(parseFrame(frame({ t: 'ocho.view', view }))).toEqual({ t: 'ocho.view', view });
    expect(parseFrame(frame({ t: 'ocho.lobby', lobby: aLobby() }))).toEqual({ t: 'ocho.lobby', lobby: aLobby() });
    expect(parseFrame(frame({ t: 'ok', re: 4 }))).toEqual({ t: 'ok', re: 4 });
    expect(parseFrame(frame({ t: 'err', re: 4, code: 'NOT_YOUR_TURN', message: 'That move is not legal.' }))).toEqual({
      t: 'err',
      re: 4,
      code: 'NOT_YOUR_TURN',
      message: 'That move is not legal.',
    });
  });

  it('drops a frame it cannot read instead of drawing half of it', () => {
    expect(parseFrame('not json')).toBeNull();
    expect(parseFrame(frame({ t: 'welcome' }))).toBeNull();
    expect(parseFrame(frame({ t: 'ocho.view', view: { ...aView(), must: 'cheat' } }))).toBeNull();
    expect(
      parseFrame(frame({ t: 'ocho.view', view: { ...aView(), hand: [{ id: 1, color: 'pink', kind: 'skip' }] } })),
    ).toBeNull();
    expect(
      parseFrame(frame({ t: 'ocho.view', view: { ...aView(), top: { id: 1, color: 'red', kind: { number: 12 } } } })),
    ).toBeNull();
    expect(parseFrame(frame({ t: 'ocho.lobby', lobby: { ...aLobby(), members: [{ user: 'u0' }] } }))).toBeNull();
  });

  it("names cards and the match the way the table's frames do", () => {
    expect(cardName(card(1, 'yellow', { number: 7 }))).toBe('Yellow 7');
    expect(cardName(card(2, 'blue', 'draw2'))).toBe('Blue Draw 2');
    expect(cardName(card(3, null, 'wildDraw4'))).toBe('Wild Draw 4');
    expect(cardName(card(4, 'red', 'deadRed'))).toBe('Dead Red');
    expect(matchLine('yellow', { number: 4 }, card(5, 'yellow', { number: 4 }))).toBe('Yellow · 4');
    expect(matchLine('green', 'color', card(6, null, 'wildDraw4'))).toBe('Green · Wild Draw 4');
    expect(matchWords('yellow', { number: 4 })).toBe('yellow or 4');
    expect(matchWords('blue', 'reverse')).toBe('blue or Reverse');
  });
});
