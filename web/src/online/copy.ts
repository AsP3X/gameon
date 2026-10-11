/* What the online screens say when the server refuses something. The client branches on the code;
   a code without copy of its own shows the server's message, which is safe to show (docs/protocol.md §3). */
import type { Outcome } from '../net/online';

type Failure = Extract<Outcome, { ok: false }>;

const COPY: Partial<Record<Failure['code'], string>> = {
  OFFLINE: 'Not connected. Try again in a moment.',
  LOBBY_NOT_FOUND: 'No table has that code. Check it with the host.',
  LOBBY_FULL: 'That table is full.',
  LOBBY_STARTED: 'That game has already started.',
  ALREADY_SEATED: 'You are already at a table.',
  NOT_HOST: 'Only the host can do that.',
  NOT_READY: 'Everyone has to be ready, and a game needs at least two pirates.',
  RATE_LIMITED: 'Too fast. Wait a moment and try again.',
};

export const failureText = (failure: Failure): string => COPY[failure.code] ?? failure.message;

const ORDINALS = ['1st', '2nd', '3rd'];
/** 1 → "1st", 4 → "4th". Places at a table go up to 8. */
export const ordinal = (n: number): string => ORDINALS[n - 1] ?? `${n}th`;
