// @vitest-environment jsdom
/* The record sheet by itself, with the answers of `GET /games/{id}/log` written by hand: what it
   shows while it waits, for a game with no steps, for a refusal, and for a request that got no answer. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { ApiResult } from '../net/api';
import type { ActionLog } from '../protocol/generated';
import { GameRecord } from './GameRecord';

const GAME = '018f6b4a-6a2e-7c3a-8b1d-9e0f1a2b3c4f';
const log = (entries: ActionLog['entries']): ApiResult<ActionLog> => ({ ok: true, value: { gameId: GAME, entries } });

let host: HTMLDivElement;
let root: Root;
let record: ReturnType<typeof vi.fn<(gameId: string) => Promise<ApiResult<ActionLog>>>>;
let onClose: ReturnType<typeof vi.fn<() => void>>;

const $ = (selector: string): HTMLElement | null => document.querySelector<HTMLElement>(selector);
const texts = (selector: string): string[] =>
  Array.from(document.querySelectorAll<HTMLElement>(selector), (el) => el.textContent ?? '');
async function open(): Promise<void> {
  await act(async () => {
    root.render(<GameRecord online={{ record }} gameId={GAME} onClose={onClose} />);
    await Promise.resolve();
  });
}
async function press(label: string): Promise<void> {
  const button = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === label);
  if (!button) throw new Error(`No button says "${label}"`);
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.body.appendChild(document.createElement('div'));
  root = createRoot(host);
  record = vi.fn<(gameId: string) => Promise<ApiResult<ActionLog>>>();
  onClose = vi.fn<() => void>();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe('the record of a finished game', () => {
  it('says it is loading, then lists the steps in the order the server gave them', async () => {
    let answer: (result: ApiResult<ActionLog>) => void = () => {};
    record.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    await open();
    expect(record).toHaveBeenCalledExactlyOnceWith(GAME);
    expect($('#record [role="status"]')?.textContent).toBe('Loading the record.');
    await act(async () => {
      answer(
        log([
          { seq: 0, kind: 'deal', seat: null, body: '{"round":0,"cards":[1]}' },
          { seq: 1, kind: 'bid', seat: 2, body: '{"bid":1}' },
        ]),
      );
      await Promise.resolve();
    });
    expect(texts('#record li b')).toEqual(['0 · deal', '1 · bid · seat 2']);
    expect(texts('#record li p')).toEqual(['{"round":0,"cards":[1]}', '{"bid":1}']);
  });

  it('says so when the game has no record', async () => {
    record.mockResolvedValue(log([]));
    await open();
    expect($('#record p.muted')?.textContent).toBe('This game has no record.');
    expect($('#record ol')).toBeNull();
  });

  it("shows the server's message for a game it does not have, with nothing to try again", async () => {
    record.mockResolvedValue({ ok: false, code: 'NOT_FOUND', message: 'No such game.' });
    await open();
    expect($('#record [role="alert"]')?.textContent).toBe('No such game.');
    expect(texts('#record button')).toEqual(['Back to the scores']);
  });

  it('offers to try again when the request got no answer, and reads the record when it does', async () => {
    record.mockResolvedValueOnce({ ok: false, code: 'OFFLINE', message: 'Not connected to the server.' });
    record.mockResolvedValueOnce(log([{ seq: 0, kind: 'deal', seat: null, body: '{}' }]));
    await open();
    expect($('#record [role="alert"]')?.textContent).toBe('Not connected to the server.');
    expect(texts('#record button')).toEqual(['Back to the scores', 'Try again']);
    await press('Try again');
    expect(record).toHaveBeenCalledTimes(2);
    expect($('#record [role="alert"]')).toBeNull();
    expect(texts('#record li b')).toEqual(['0 · deal']);
  });

  it('closes on its button and on Escape', async () => {
    record.mockResolvedValue(log([]));
    await open();
    await press('Back to the scores');
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => {
      $('#record')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
