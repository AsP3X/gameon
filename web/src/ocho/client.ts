/* The Ocho connection: one socket to /ocho/v1/ws (docs/ocho-protocol.md). It says hello, answers
   every intent with exactly one result, keeps the last lobby and the last per-seat view the server
   pushed, and reconnects with backoff when the socket drops.

   The page only ever shows what is kept here, and what is kept here is only what the server sent.
   Nothing is decided on this side: an intent goes out, and the next `ocho.view` is the answer. */
import type { Transport, Wire } from '../net/socket';
import { parseFrame } from './wire';
import type { Intent, Lobby, View } from './wire';

/** idle: not asked to connect. connecting: the first attempt. online: open. offline: lost, trying again. */
export type OchoLink = 'idle' | 'connecting' | 'online' | 'offline';

export interface OchoState {
  link: OchoLink;
  lobby: Lobby | null;
  view: View | null;
}

/** `OFFLINE` is this client's own: there was no socket to send on, or it closed before the answer. */
export type OchoResult = { ok: true } | { ok: false; code: string; message: string };

const OFFLINE: OchoResult = { ok: false, code: 'OFFLINE', message: 'Not connected. Trying again…' };
export const BACKOFF_BASE_MS = 500;
export const BACKOFF_MAX_MS = 15_000;

type Listener = () => void;

export class OchoClient {
  private readonly transport: Transport;
  private readonly listeners = new Set<Listener>();
  private readonly pending = new Map<number, (result: OchoResult) => void>();
  private state: OchoState = { link: 'idle', lobby: null, view: null };
  private wire: Wire | null = null;
  private attempt = 0;
  private failures = 0;
  private nextId = 1;
  private retry: ReturnType<typeof setTimeout> | null = null;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getState = (): OchoState => this.state;

  private set(change: Partial<OchoState>): void {
    this.state = { ...this.state, ...change };
    for (const fn of this.listeners) fn();
  }

  /** Connect, and stay connected until `close`. Does nothing while a socket is up or on its way. */
  open(): void {
    if (this.state.link !== 'idle') return;
    this.set({ link: 'connecting' });
    this.connect();
  }

  /** Drop the socket and stop trying. What the server last said is kept. */
  close(): void {
    this.attempt++;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    const wire = this.wire;
    this.wire = null;
    this.settleAll();
    wire?.close();
    if (this.state.link !== 'idle') this.set({ link: 'idle' });
  }

  /** Forget the lobby and the table on this page: the player has left them. */
  forget(): void {
    this.set({ lobby: null, view: null });
  }

  /** Send one intent. The promise settles with the server's `ok` or `err`, or `OFFLINE`. */
  send(intent: Intent): Promise<OchoResult> {
    const wire = this.wire;
    if (!wire || this.state.link !== 'online') return Promise.resolve(OFFLINE);
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      wire.send(JSON.stringify({ ...intent, id }));
    });
  }

  private connect(): void {
    const attempt = ++this.attempt;
    this.transport().then(
      (wire) => {
        if (attempt !== this.attempt) {
          wire.close();
          return;
        }
        this.wire = wire;
        this.failures = 0;
        wire.onmessage = (data) => {
          if (attempt === this.attempt) this.receive(data);
        };
        wire.onclose = () => {
          if (attempt === this.attempt) this.lost();
        };
        wire.send(JSON.stringify({ t: 'hello', id: this.nextId++ }));
        this.set({ link: 'online' });
      },
      () => {
        if (attempt === this.attempt) this.lost();
      },
    );
  }

  private lost(): void {
    this.wire = null;
    this.settleAll();
    this.set({ link: 'offline' });
    const wait = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** this.failures++);
    this.retry = setTimeout(() => {
      this.retry = null;
      this.connect();
    }, wait);
  }

  private settleAll(): void {
    const waiting = [...this.pending.values()];
    this.pending.clear();
    for (const resolve of waiting) resolve(OFFLINE);
  }

  private receive(data: unknown): void {
    const frame = parseFrame(data);
    if (!frame) return;
    switch (frame.t) {
      case 'ok':
      case 'err': {
        const resolve = this.pending.get(frame.re);
        if (!resolve) return;
        this.pending.delete(frame.re);
        resolve(frame.t === 'ok' ? { ok: true } : { ok: false, code: frame.code, message: frame.message });
        return;
      }
      case 'ocho.lobby':
        // A lobby that has not dealt has no table: a view from an earlier one is not this one's.
        this.set(frame.lobby.started ? { lobby: frame.lobby } : { lobby: frame.lobby, view: null });
        return;
      case 'ocho.view':
        this.set({ view: frame.view });
        return;
    }
  }
}
