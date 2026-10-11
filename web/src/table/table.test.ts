/* dispatchWithin: how long anyone waits for a table's answer, whatever table it is. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { Action } from '../game';
import { DISPATCH_TIMEOUT_MS, dispatchWithin } from './table';
import type { DispatchResult, Table } from './table';

const BID: Action = { type: 'bid', seat: 0, bid: 1 };

/** A table that answers an action however the test says. Nothing else about it is used here. */
function tableThat(dispatch: Table['dispatch']): Table {
  return {
    localSeats: [0],
    view: () => {
      throw new Error('Nobody looks at this table');
    },
    dispatch,
    subscribe: () => () => {},
    schedule: () => {},
    stop: () => {},
  };
}
/** A promise and the function that resolves it, for an answer that comes when the test says. */
function later(): { answer: Promise<DispatchResult>; say: (r: DispatchResult) => void } {
  let say: (r: DispatchResult) => void = () => {};
  const answer = new Promise<DispatchResult>((resolve) => {
    say = resolve;
  });
  return { answer, say };
}
/** Follow a promise without waiting for it. */
function watch(p: Promise<DispatchResult>): { result: DispatchResult | null } {
  const seen: { result: DispatchResult | null } = { result: null };
  void p.then((r) => {
    seen.result = r;
  });
  return seen;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('dispatchWithin', () => {
  it('hands the action to the table and its answer back', async () => {
    const dispatch = vi.fn<Table['dispatch']>(() => Promise.resolve({ ok: true }));
    expect(await dispatchWithin(tableThat(dispatch), BID)).toEqual({ ok: true });
    expect(dispatch).toHaveBeenCalledExactlyOnceWith(BID);

    const refused: DispatchResult = { ok: false, code: 'NOT_YOUR_TURN', message: 'Wait for your turn.' };
    expect(
      await dispatchWithin(
        tableThat(() => Promise.resolve(refused)),
        BID,
      ),
    ).toEqual(refused);
  });

  it('never starts the clock for a table that answers on the turn it was asked', async () => {
    const setTimer = vi.spyOn(globalThis, 'setTimeout');
    await dispatchWithin(
      tableThat(() => Promise.resolve({ ok: true })),
      BID,
    );
    expect(setTimer).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('gives up on a table that says nothing, at the limit and not before', async () => {
    const seen = watch(
      dispatchWithin(
        tableThat(() => new Promise(() => {})),
        BID,
      ),
    );
    await vi.advanceTimersByTimeAsync(DISPATCH_TIMEOUT_MS - 1);
    expect(seen.result).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(seen.result).toEqual({ ok: false, code: 'TIMEOUT', message: 'The table did not answer in time.' });
  });

  it('takes an answer that comes in time and stops the clock', async () => {
    const { answer, say } = later();
    const seen = watch(
      dispatchWithin(
        tableThat(() => answer),
        BID,
        500,
      ),
    );
    await vi.advanceTimersByTimeAsync(499);
    expect(seen.result).toBeNull();
    say({ ok: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(seen.result).toEqual({ ok: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores what the table says after the limit', async () => {
    const { answer, say } = later();
    const waiting = dispatchWithin(
      tableThat(() => answer),
      BID,
      500,
    );
    await vi.advanceTimersByTimeAsync(500);
    say({ ok: true });
    expect(await waiting).toMatchObject({ ok: false, code: 'TIMEOUT' });
  });

  it('reports a table that throws or rejects as a refusal instead of passing the error on', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const thrown = tableThat(() => {
      throw new Error('socket closed');
    });
    const rejected = tableThat(() => Promise.reject(new Error('socket closed')));
    for (const table of [thrown, rejected])
      expect(await dispatchWithin(table, BID)).toEqual({
        ok: false,
        code: 'REJECTED',
        message: 'The table could not take that action.',
      });
    expect(error).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
