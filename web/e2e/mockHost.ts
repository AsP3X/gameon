/* The mock server behind a real port: HTTP for the session, a WebSocket for everything else, as
   docs/protocol.md §2 and §5 put them. The page reaches it exactly as it will reach the Rust
   server: `POST /api/v1/auth/guest` sets the HttpOnly cookie `skt_session`, and the upgrade at
   `/api/v1/ws` carries it. So several browsers can sit at one table, which the mock inside a page
   (`?mock`) cannot give them.

   It exists for the end-to-end script while the real server does not. It checks no origin and
   keeps nothing: it is the mock, with a door. */
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer } from 'ws';
import { MockServer } from '../src/net/mock/server';
import type { MockOptions } from '../src/net/mock/server';

const COOKIE = 'skt_session';
/** The close codes a server may put on the wire. The mock's own "the network dropped" (1006) is not one. */
const sendable = (code: number): number =>
  code === 1000 || (code >= 1002 && code <= 1003) || code >= 3000 ? code : 1011;

export interface MockHost {
  /** Where it listens, as the dev proxy's target: `http://127.0.0.1:<port>`. */
  url: string;
  close(): Promise<void>;
}

function sessionOf(req: IncomingMessage): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [name, value] = part.trim().split('=');
    if (name === COOKIE && value) return value;
  }
  return null;
}
function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

export async function startMockHost(options: MockOptions = {}): Promise<MockHost> {
  const mock = new MockServer(options);
  const http = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://mock').pathname;
    if (path === '/api/v1/health' && req.method === 'GET') return json(res, 200, { ok: true });
    if (path === '/api/v1/auth/guest' && req.method === 'POST') {
      // With a valid session it returns that user; without one it makes a guest and sets the cookie.
      const session = sessionOf(req) ?? randomUUID();
      res.setHeader('Set-Cookie', `${COOKIE}=${session}; HttpOnly; SameSite=Strict; Path=/`);
      return json(res, 200, mock.me(session));
    }
    json(res, 404, { error: { code: 'NOT_FOUND', message: 'No such path.' } });
  });
  const sockets = new WebSocketServer({ noServer: true });
  http.on('upgrade', (req, socket, head) => {
    const session = sessionOf(req);
    if (new URL(req.url ?? '/', 'http://mock').pathname !== '/api/v1/ws' || !session) {
      // No cookie fails the upgrade (§5.2).
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      return;
    }
    sockets.handleUpgrade(req, socket, head, (ws) => {
      void mock
        .transport(session)()
        .then(
          (wire) => {
            wire.onmessage = (data) => {
              if (typeof data === 'string') ws.send(data);
            };
            wire.onclose = (code) => ws.close(sendable(code));
            ws.on('message', (data: Buffer) => wire.send(data.toString('utf8')));
            ws.on('close', () => wire.close());
          },
          () => ws.close(1011),
        );
    });
  });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const { port } = http.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve) => {
        mock.shutDown();
        sockets.clients.forEach((ws) => ws.terminate());
        http.close(() => resolve());
        http.closeAllConnections();
      }),
  };
}
