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

  it('reads the bots of a table, and an older lobby without them as a friends table', () => {
    const lobby = aLobby({ bots: 'easy' }, 2, 2);
    lobby.members[1] = { ...lobby.members[1], bot: true };
    expect(parseFrame(frame({ t: 'ocho.lobby', lobby: { ...lobby, extra: 1 } }))).toEqual({ t: 'ocho.lobby', lobby });
    const old = { ...aLobby({}, 2, 2), members: [{ user: 'u0', name: 'Remy', ready: true }] };
    const read = parseFrame(frame({ t: 'ocho.lobby', lobby: old }));
    expect(read?.t === 'ocho.lobby' && read.lobby.bots).toBeUndefined();
    expect(read?.t === 'ocho.lobby' && read.lobby.members[0].bot).toBe(false);
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
    expect(parseFrame(frame({ t: 'ocho.lobby', lobby: { ...aLobby(), bots: 'expert' } }))).toBeNull();
    expect(
      parseFrame(
        frame({
          t: 'ocho.lobby',
          lobby: { ...aLobby(), members: [{ user: 'u0', name: 'R', ready: true, bot: 'yes' }] },
        }),
      ),
    ).toBeNull();
  });

  it('reads the public tables, an empty list too, and drops a row that lacks what a row carries', () => {
    const anne = { id: 'l7', hostName: 'Anne', players: 4, seated: 1, teams: false, match: 'one' };
    const full = { id: 'l8', hostName: '<b>Teo</b>', players: 4, seated: 4, teams: true, match: 'to500' };
    expect(parseFrame(frame({ t: 'ocho.tables', tables: [anne, { ...full, extra: 1 }] }))).toEqual({
      t: 'ocho.tables',
      tables: [anne, full],
    });
    expect(parseFrame(frame({ t: 'ocho.tables', tables: [] }))).toEqual({ t: 'ocho.tables', tables: [] });
    for (const key of ['id', 'hostName', 'players', 'seated', 'teams', 'match']) {
      const row: Record<string, unknown> = { ...anne };
      delete row[key];
      expect(parseFrame(frame({ t: 'ocho.tables', tables: [row] }))).toBeNull();
    }
    expect(parseFrame(frame({ t: 'ocho.tables', tables: [{ ...anne, match: 'to100' }] }))).toBeNull();
    expect(parseFrame(frame({ t: 'ocho.tables', tables: [{ ...anne, seated: '1' }] }))).toBeNull();
    expect(parseFrame(frame({ t: 'ocho.tables' }))).toBeNull();
    // A lobby does not say whether it is public: one without `open` reads as it always did.
    expect(parseFrame(frame({ t: 'ocho.lobby', lobby: aLobby() }))).toEqual({ t: 'ocho.lobby', lobby: aLobby() });
    expect(parseFrame(frame({ t: 'ocho.lobbies', tables: [] }))).toBeNull();
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
