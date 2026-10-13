/* What the online screens say when the server refuses something. The client branches on the code;
   a code without copy of its own shows the server's message, which is safe to show (docs/protocol.md §3).
   `WEAK_PASSWORD` is one of those on purpose: only the server knows its rule, so it is the one to say it. */
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
  USERNAME_TAKEN: 'That username is taken. Try another.',
  USERNAME_INVALID: "That username can't be used. Use 3 to 16 letters, digits or underscores.",
  INVALID_CREDENTIALS: 'Wrong username or password.',
  ALREADY_REGISTERED: 'This pirate already has an account.',
  ACCOUNT_REQUIRED: 'Ranked needs a free account.',
  BOTS_DISABLED: 'This table does not seat bots.',
  RULES_LOCKED: 'A public table keeps its rules.',
  // The server's message for this carries no time. `Me.cooldownUntil` does, and the page draws none.
  // A forfeit is a ranked game that was left, one the player lost their seat in by missing two turns
  // while offline, or one they were away from for most of its rounds.
  QUEUE_COOLDOWN: 'You forfeited a ranked game. Ranked is closed for you for a while.',
};

export const failureText = (failure: Failure): string => COPY[failure.code] ?? failure.message;

const ORDINALS = ['1st', '2nd', '3rd'];
/** 1 → "1st", 4 → "4th". Places at a table go up to 8. */
export const ordinal = (n: number): string => ORDINALS[n - 1] ?? `${n}th`;

/** §4: 3–16 characters of A–Z a–z 0–9 _. Checked here for feedback; the server decides. */
export const USERNAME_SHAPE = /^[A-Za-z0-9_]{3,16}$/;
export const USERNAME_MAX = 16;
/** A display name is 1–16 characters after trimming. */
export const NAME_MAX = 16;
