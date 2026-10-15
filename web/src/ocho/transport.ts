/* The real Ocho socket: this origin's /ocho/v1/ws, through the dev proxy in development. The
   upgrade carries the `skt_session` cookie by itself; Ocho reads it and issues none of its own. */
import type { Transport, Wire } from '../net/socket';

export const ochoTransport: Transport = () => {
  const url = new URL('/ocho/v1/ws', location.href);
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
      // Before it opened, this is a failed upgrade: 401 without a session.
      reject(new Error(`The socket closed with code ${event.code}`));
      wire.onclose?.(event.code);
    };
  });
};
