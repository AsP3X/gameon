/* The real backend: this origin's server, through the dev proxy in development.
   The session is the HttpOnly cookie `skt_session` (docs/protocol.md §2). The page never reads it:
   a guest session is asked for once, and the socket upgrade and every REST call carry the cookie by
   themselves. */
import type { Backend, Rest } from './api';
import type { Transport, Wire } from './socket';

/** Whether this page has asked for its session. Asked again after a connection that could not be opened. */
let hasSession = false;

export const browserRest: Rest = async (method, path, body) => {
  const init: RequestInit = { method, credentials: 'same-origin' };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`/api/v1${path}`, init);
  // Logging out ends the session, and logging in starts one: the next socket knows which it is.
  if (path === '/auth/logout' && res.ok) hasSession = false;
  if (path === '/auth/login' && res.ok) hasSession = true;
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON: an error page from something in front of the server. The status says enough.
  }
  return { status: res.status, body: parsed };
};

export const browserTransport: Transport = async () => {
  if (!hasSession) {
    const res = await browserRest('POST', '/auth/guest');
    if (res.status < 200 || res.status >= 300) throw new Error(`No session: the server answered ${res.status}`);
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

export const browserBackend: Backend = { transport: browserTransport, rest: browserRest };
