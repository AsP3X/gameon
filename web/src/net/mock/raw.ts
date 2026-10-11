/* A bare client for the tests: it speaks JSON over a Wire and writes down every frame it is sent,
   in order. The socket client hides exactly that order behind promises, so the tests that are about
   what the server writes, and when, look at the frames themselves. */
import type { ClientRequest, ServerMessage } from '../messages';
import { PROTOCOL } from '../messages';
import type { Transport, Wire } from '../socket';

export interface RawClient {
  /** Every frame received, oldest first. */
  frames: ServerMessage[];
  /** The close code, once the server has closed the connection. */
  closed: number | null;
  /** Send one message and return the id it was given. Extra fields go out as they are: a forged intent is a message too. */
  send(message: ClientRequest | Record<string, unknown>): number;
  close(): void;
}

let ids = 0;

/** Open a connection and say hello. The caller lets the microtasks run before it looks at `frames`. */
export async function connectRaw(transport: Transport, protocol: number = PROTOCOL): Promise<RawClient> {
  const wire: Wire = await transport();
  const client: RawClient = {
    frames: [],
    closed: null,
    send(message) {
      const id = ++ids;
      wire.send(JSON.stringify({ ...message, id }));
      return id;
    },
    close: () => wire.close(),
  };
  wire.onmessage = (data) => {
    if (typeof data === 'string') client.frames.push(JSON.parse(data) as ServerMessage);
  };
  wire.onclose = (code) => {
    client.closed = code;
  };
  client.send({ t: 'hello', protocol, build: 'test' });
  return client;
}

/** The frames of one type, in order. */
export function framesOf<T extends ServerMessage['t']>(client: RawClient, t: T): Extract<ServerMessage, { t: T }>[] {
  return client.frames.filter((f): f is Extract<ServerMessage, { t: T }> => f.t === t);
}
