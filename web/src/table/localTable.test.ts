/* The offline table: which seats it calls local, and how it answers an action. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { Engine } from '../game';
import type { GameState } from '../game';
import { humanSeats, LocalTable } from './localTable';

const seat = (name: string, bot: boolean) => ({ name, color: '#1cb0f6', bot });
/** Two cards each in the first round, so a bid of 0 to 2 is in range. */
const game = (bots: boolean[]): GameState =>
  Engine.create({ seats: bots.map((bot, i) => seat(`P${i}`, bot)), format: 'even', seed: 11 });
/** What every seat sees, as text: equal before and after means nobody's view moved. */
const views = (table: LocalTable): string => JSON.stringify(table.state.seats.map((_, i) => table.view(i)));

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('local seats', () => {
  it('are the humans of an offline table, in seat order', () => {
    expect(humanSeats(game([false, true, true]).seats)).toEqual([0]);
    expect(humanSeats(game([true, false, true, false]).seats)).toEqual([1, 3]);
    expect(humanSeats(game([true, true]).seats)).toEqual([]);
  });

  it('are what the table was told, not what it reads off the seats', () => {
    const state = game([true, false, true, false]);
    expect(new LocalTable(state, [3, 1]).localSeats).toEqual([1, 3]);
    expect(new LocalTable(game([true, true]), []).localSeats).toEqual([]);
  });

  it('must cover every human and no bot: nobody else is there to play a seat', () => {
    const state = game([false, false, true]);
    expect(() => new LocalTable(state, [0])).toThrow('every human seat');
    expect(() => new LocalTable(state, [0, 1, 2])).toThrow('every human seat');
    expect(() => new LocalTable(state, [0, 1, 5])).toThrow('every human seat');
  });
});

describe('dispatch', () => {
  it('answers with a promise that is resolved on the turn it was asked, after the listeners have heard', async () => {
    const table = new LocalTable(game([false, true, true]), [0]);
    const order: string[] = [];
    table.subscribe((events) => order.push(events.map((e) => e.type).join()));
    const answer = table.dispatch({ type: 'bid', seat: 0, bid: 2 });
    order.push('returned');
    void answer.then((r) => order.push(`answered ${r.ok}`));
    await Promise.resolve();
    expect(order).toEqual(['bidPlaced', 'returned', 'answered true']);
    expect(await answer).toEqual({ ok: true });
    expect(table.view(0).bids[0]).toBe(2);
    table.stop();
  });

  it('refuses with a failed result and changes nothing: no view, no save, no update', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const persist = vi.fn();
    const table = new LocalTable(game([false, true, true]), [0], persist);
    const heard = vi.fn();
    table.subscribe(heard);
    const before = views(table);

    expect(await table.dispatch({ type: 'bid', seat: 0, bid: 9 })).toEqual({
      ok: false,
      code: 'REJECTED',
      message: 'Bid out of range',
    });
    expect(await table.dispatch({ type: 'play', seat: 0, card: table.view(0).hand[0] })).toMatchObject({ ok: false });
    expect(await table.dispatch({ type: 'advance' })).toMatchObject({ ok: false, code: 'REJECTED' });

    expect(views(table)).toBe(before);
    expect(heard).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0); // a refused action starts no bot
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it('saves an accepted action before anyone hears of it, and lets the bots answer on their timers', async () => {
    const order: string[] = [];
    const table = new LocalTable(game([false, true, true]), [0], () => order.push('saved'));
    table.subscribe(() => order.push('update'));
    expect(await table.dispatch({ type: 'bid', seat: 0, bid: 1 })).toEqual({ ok: true });
    expect(order).toEqual(['saved', 'update']);
    expect(table.state.bids).toEqual([1, null, null]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(table.state.phase).not.toBe('bidding'); // both bots bid, and the bids were revealed
    table.stop();
  });
});
