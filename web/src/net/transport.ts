/* The real transport: this origin's server, through the dev proxy in development.
   The session is the HttpOnly cookie `skt_session` (docs/protocol.md §2). The page never reads it:
   a guest session is asked for once, and the socket upgrade carries the cookie by itself. */
import type { Transport, Wire } from './socket';

/** Whether this page has asked for its session. Asked again after a connection that could not be opened. */
let hasSession = false;

export const browserTransport: Transport = async () => {
  if (!hasSession) {
    const res = await fetch('/api/v1/auth/guest', { method: 'POST', credentials: 'same-origin' });
    if (!res.ok) throw new Error(`No session: the server answered ${res.status}`);
    hasSession = true;
  }
  const url = new URL('/api/v1/ws', location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(url);
  return new Promise<Wire>((resolve, reject) => {
    const wire: Wire = {
      send: (data) => socket.send(data),
      close: () => socket.close(),
      onmessage: null,
      onclose: null,
    };
    socket.onopen = () => resolve(wire);
    socket.onmessage = (event) => wire.onmessage?.(event.data);
    socket.onclose = (event) => {
      // Before it opened, this is a failed upgrade (401 without a session, 403 for a bad origin).
      hasSession = false;
      reject(new Error(`The socket closed with code ${event.code}`));
      wire.onclose?.(event.code);
    };
  });
};
