/* The socket client: one connection to /api/v1/ws as docs/protocol.md §5.1 and §5.2 describe it.

   It says hello, takes `ok` then `welcome`, keeps the server's clock, answers every request with
   exactly one result, and reconnects with backoff when the connection drops. It knows nothing about
   lobbies or games: those read the events it hands out, in the order the server wrote the frames.

   A reply belongs to the socket its message went out on. When that socket closes, every request
   still waiting is answered `OFFLINE` and forgotten. Nothing is sent again on the next socket: the
   `welcome` there is the whole truth, and whoever keeps online state replaces it with that. */
import type { ErrMessage, ErrorCode, OkReply, Superseded, Welcome } from '../protocol/generated';
import { parseServerMessage, PROTOCOL } from './messages';
import type { ClientRequest, ServerPush } from './messages';

/** The part of a WebSocket the client uses. A transport hands one over when it is open. */
export interface Wire {
  send(data: string): void;
  close(): void;
  /** One text frame from the server. */
  onmessage: ((data: unknown) => void) | null;
  /** The connection is gone, with the close code (4001 is "superseded"). */
  onclose: ((code: number) => void) | null;
}
/** Opens a connection for this device's session. Rejects when it cannot be opened. */
export type Transport = () => Promise<Wire>;

/**
 * idle: not started. connecting: the first attempt. online: welcomed. offline: lost, and trying
 * again on its own. superseded: another socket of this user took over, so this one stays down until
 * the player asks. unsupported: the server does not speak this client's protocol: reload.
 */
export type LinkStatus = 'idle' | 'connecting' | 'online' | 'offline' | 'superseded' | 'unsupported';

/** What the client tells its listeners, synchronously and in the order the frames arrived. */
export type LinkEvent =
  | { type: 'status'; status: LinkStatus }
  /** A complete snapshot: whatever was known about lobby, queue and game before it is void. */
  | { type: 'welcome'; welcome: Welcome }
  /** The one answer to `request`. The heartbeat's own replies are not reported. */
  | { type: 'reply'; request: ClientRequest; reply: OkReply | ErrMessage }
  | { type: 'push'; message: Exclude<ServerPush, Welcome | Superseded> };
export type LinkListener = (event: LinkEvent) => void;

/** `OFFLINE` is this client's own: the request never got an answer because there is no socket for it. */
export type RequestResult = { ok: true; reply: OkReply } | { ok: false; code: ErrorCode | 'OFFLINE'; message: string };

export interface SocketClientOptions {
  transport: Transport;
  /** The client build named in `hello`. */
  build: string;
  now?: () => number;
  random?: () => number;
}

export const PING_MS = 15_000;
/** The server drops a socket that has been silent this long (§5.2); so does the client. */
export const SILENCE_MS = 45_000;
/** How long `ok` and `welcome` may take after `hello` before the attempt counts as failed. */
export const HELLO_TIMEOUT_MS = 10_000;
export const BACKOFF_BASE_MS = 500;
export const BACKOFF_MAX_MS = 15_000;
const CLOSE_SUPERSEDED = 4001;

const OFFLINE: RequestResult = { ok: false, code: 'OFFLINE', message: 'Not connected to the server.' };

type Timer = ReturnType<typeof setTimeout>;
interface Pending {
  request: ClientRequest;
  sentAt: number;
  resolve: (result: RequestResult) => void;
}

export class SocketClient {
  private readonly transport: Transport;
  private readonly build: string;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly listeners = new Set<LinkListener>();
  private readonly pending = new Map<number, Pending>();
  private state: LinkStatus = 'idle';
  private wire: Wire | null = null;
  /** Counts connection attempts: a transport or a frame that belongs to an older one is ignored. */
  private attempt = 0;
  /** The id counter never restarts, so an id is never reused on a later socket. */
  private nextId = 1;
  /** The hello of this socket, until its `welcome` has arrived. `ok` says its reply has. */
  private hello: { id: number; sentAt: number; ok: boolean } | null = null;
  private greeted = false;
  private failures = 0;
  private offset = 0;
  private heardAt = 0;
  private retryTimer: Timer | null = null;
  private helloTimer: Timer | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor({ transport, build, now = Date.now, random = Math.random }: SocketClientOptions) {
    this.transport = transport;
    this.build = build;
    this.now = now;
    this.random = random;
  }

  get status(): LinkStatus {
    return this.state;
  }

  /** The server's clock right now, as far as the last `welcome` or `ping` could tell. */
  serverNow(): number {
    return this.now() + this.offset;
  }

  subscribe(fn: LinkListener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Connect, and stay connected until stop(). Does nothing while a connection is up or on its way. */
  start(): void {
    if (this.state !== 'idle') return;
    this.failures = 0;
    this.setStatus('connecting');
    this.connect();
  }

  /** Try now: after `superseded`, or instead of waiting for the next automatic attempt. */
  retry(): void {
    if (this.state === 'online' || this.state === 'connecting' || this.state === 'unsupported') return;
    this.failures = 0;
    this.drop();
    this.setStatus('connecting');
    this.connect();
  }

  /** Hang up for good. Requests still waiting are answered `OFFLINE`. */
  stop(): void {
    this.drop();
    this.setStatus('idle');
  }

  /**
   * Send one message and wait for its one reply. The promise never rejects. With no welcomed socket
   * the answer is `OFFLINE` at once: an intent is never kept for later.
   */
  request(request: ClientRequest): Promise<RequestResult> {
    const wire = this.wire;
    if (this.state !== 'online' || !wire) return Promise.resolve(OFFLINE);
    return new Promise((resolve) => {
      const id = this.nextId++;
      this.pending.set(id, { request, sentAt: this.now(), resolve });
      wire.send(JSON.stringify({ ...request, id }));
    });
  }

  private connect(): void {
    const attempt = ++this.attempt;
    this.transport().then(
      (wire) => {
        if (attempt !== this.attempt) return wire.close();
        this.wire = wire;
        this.heardAt = this.now();
        wire.onmessage = (data) => {
          if (attempt === this.attempt) this.receive(data);
        };
        wire.onclose = (code) => {
          if (attempt !== this.attempt) return;
          if (code === CLOSE_SUPERSEDED) this.end('superseded');
          else this.lost();
        };
        this.hello = { id: this.nextId++, sentAt: this.now(), ok: false };
        this.helloTimer = setTimeout(() => this.lost(), HELLO_TIMEOUT_MS);
        wire.send(JSON.stringify({ t: 'hello', id: this.hello.id, protocol: PROTOCOL, build: this.build }));
      },
      () => {
        if (attempt === this.attempt) this.lost();
      },
    );
  }

  private receive(data: unknown): void {
    const message = parseServerMessage(data);
    this.heardAt = this.now();
    if (!message) return;
    switch (message.t) {
      case 'ok':
      case 'err':
        if (this.hello && message.re === this.hello.id) return this.helloAnswered(this.hello, message);
        return this.answered(message);
      case 'welcome':
        if (!this.hello?.ok) return; // before the `ok`, or a second one: not this protocol
        return this.welcomed(this.hello.sentAt, message);
      case 'superseded':
        return this.end('superseded');
      default:
        if (this.greeted) this.emit({ type: 'push', message });
    }
  }

  private helloAnswered(hello: { ok: boolean }, reply: OkReply | ErrMessage): void {
    if (reply.t === 'ok') hello.ok = true;
    else if (reply.code === 'PROTOCOL_UNSUPPORTED') this.end('unsupported');
    else this.lost();
  }

  private welcomed(sentAt: number, welcome: Welcome): void {
    this.hello = null;
    this.greeted = true;
    this.failures = 0;
    if (this.helloTimer != null) clearTimeout(this.helloTimer);
    this.helloTimer = null;
    this.offset = welcome.serverTime - (sentAt + this.now()) / 2;
    this.state = 'online';
    this.emit({ type: 'welcome', welcome });
    this.emit({ type: 'status', status: 'online' });
    this.pingTimer = setInterval(() => this.ping(), PING_MS);
  }

  private answered(reply: OkReply | ErrMessage): void {
    const waiting = this.pending.get(reply.re);
    if (!waiting) return; // an id nobody is waiting on: answered already, or never sent from here
    this.pending.delete(reply.re);
    if (waiting.request.t === 'ping') {
      if (reply.t === 'ok' && reply.serverTime != null)
        this.offset = reply.serverTime - (waiting.sentAt + this.now()) / 2;
    } else this.emit({ type: 'reply', request: waiting.request, reply });
    waiting.resolve(reply.t === 'ok' ? { ok: true, reply } : { ok: false, code: reply.code, message: reply.message });
  }

  private ping(): void {
    if (this.now() - this.heardAt >= SILENCE_MS) return this.lost();
    void this.request({ t: 'ping' });
  }

  /** The connection failed or dropped: forget it, and try again after a pause that grows with every failure. */
  private lost(): void {
    this.drop();
    const pause = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** this.failures) * (0.75 + this.random() * 0.5);
    this.failures++;
    this.setStatus('offline');
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, pause);
  }

  /** The connection is over and must not come back on its own. */
  private end(status: 'superseded' | 'unsupported'): void {
    this.drop();
    this.setStatus(status);
  }

  /** Let go of the socket, the timers and every request still waiting on that socket. */
  private drop(): void {
    this.attempt++;
    if (this.retryTimer != null) clearTimeout(this.retryTimer);
    if (this.helloTimer != null) clearTimeout(this.helloTimer);
    if (this.pingTimer != null) clearInterval(this.pingTimer);
    this.retryTimer = this.helloTimer = this.pingTimer = null;
    this.hello = null;
    this.greeted = false;
    const wire = this.wire;
    this.wire = null;
    if (wire) {
      wire.onmessage = null;
      wire.onclose = null;
      wire.close();
    }
    const waiting = [...this.pending.values()];
    this.pending.clear();
    waiting.forEach((p) => p.resolve(OFFLINE));
  }

  private setStatus(status: LinkStatus): void {
    if (this.state === status) return;
    this.state = status;
    this.emit({ type: 'status', status });
  }

  private emit(event: LinkEvent): void {
    // A copy: a listener that starts listening while an event is handed out does not get that event.
    Array.from(this.listeners).forEach((fn) => fn(event));
  }
}
