/* The Ocho connection: hello, one answer per intent, what the server pushed, and a dropped socket. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { BACKOFF_BASE_MS, OchoClient } from './client';
import type { OchoResult } from './client';
import { aLobby, aView, fakeOcho } from './fake';

const tick = (ms = 0): Promise<void> => vi.advanceTimersByTimeAsync(ms).then(() => {});

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the Ocho connection', () => {
  it('says hello first, and sends an intent with an id and nothing else of its own', async () => {
    const fake = fakeOcho();
    const ocho = new OchoClient(fake.transport);
    expect(ocho.getState().link).toBe('idle');
    ocho.open();
    await tick();
    expect(ocho.getState().link).toBe('online');
    expect(fake.sent).toEqual([{ t: 'hello', id: 1 }]);
    const answer = ocho.send({ t: 'ocho.play', card: 11 });
    expect(fake.sent[1]).toEqual({ t: 'ocho.play', card: 11, id: 2 });
    fake.ok();
    expect(await answer).toEqual({ ok: true });
    const refused = ocho.send({ t: 'ocho.draw' });
    fake.err('NOT_YOUR_TURN', 'That move is not legal.');
    expect(await refused).toEqual({ ok: false, code: 'NOT_YOUR_TURN', message: 'That move is not legal.' });
  });

  it('keeps the lobby and the view the server pushed, and a new lobby has no table', async () => {
    const fake = fakeOcho();
    const ocho = new OchoClient(fake.transport);
    ocho.open();
    await tick();
    fake.push({ t: 'ocho.lobby', lobby: aLobby({ started: true }) });
    fake.push({ t: 'ocho.view', view: aView() });
    expect(ocho.getState().lobby?.code).toBe('K7QX2P');
    expect(ocho.getState().view?.handNo).toBe(1);
    fake.push({ t: 'ocho.lobby', lobby: aLobby({ id: 'l2' }) });
    expect(ocho.getState().view).toBeNull();
    ocho.forget();
    expect(ocho.getState().lobby).toBeNull();
  });

  it('keeps the public tables the server listed before its answer, and forgetting a table keeps them', async () => {
    const fake = fakeOcho();
    const ocho = new OchoClient(fake.transport);
    expect(ocho.getState().tables).toBeNull();
    ocho.open();
    await tick();
    const anne = { id: 'l7', hostName: 'Anne', players: 4, seated: 1, teams: false, match: 'one' };
    const asked = ocho.send({ t: 'ocho.tables' });
    expect(fake.sent[1]).toEqual({ t: 'ocho.tables', id: 2 });
    fake.push({ t: 'ocho.tables', tables: [anne] });
    fake.push({ t: 'ok', re: 2 });
    expect(await asked).toEqual({ ok: true });
    expect(ocho.getState().tables).toEqual([anne]);
    ocho.forget();
    expect(ocho.getState().tables).toEqual([anne]);
    // An empty list is an answer too.
    fake.push({ t: 'ocho.tables', tables: [] });
    expect(ocho.getState().tables).toEqual([]);
    // Sitting down at a listed table sends its lobby id, and nothing else of the page's own.
    void ocho.send({ t: 'ocho.joinOpen', lobby: 'l7' });
    expect(fake.sent[2]).toEqual({ t: 'ocho.joinOpen', lobby: 'l7', id: 3 });
    void ocho.send({ t: 'ocho.create', players: 4, teams: false, match: 'one', open: true });
    expect(fake.sent[3]).toEqual({ t: 'ocho.create', players: 4, teams: false, match: 'one', open: true, id: 4 });
  });

  it('answers what was waiting when the socket drops, and connects again with backoff', async () => {
    const fake = fakeOcho();
    const ocho = new OchoClient(fake.transport);
    ocho.open();
    await tick();
    let result: OchoResult | null = null;
    void ocho.send({ t: 'ocho.draw' }).then((r) => (result = r));
    fake.drop();
    await tick();
    expect(result).toEqual({ ok: false, code: 'OFFLINE', message: 'Not connected. Trying again…' });
    expect(ocho.getState().link).toBe('offline');
    expect(await ocho.send({ t: 'ocho.draw' })).toMatchObject({ ok: false, code: 'OFFLINE' });
    expect(fake.opened).toBe(1);
    await tick(BACKOFF_BASE_MS);
    expect(fake.opened).toBe(2);
    expect(ocho.getState().link).toBe('online');
    expect(fake.sent[fake.sent.length - 1]).toMatchObject({ t: 'hello' });
    ocho.close();
    expect(ocho.getState().link).toBe('idle');
  });
});
