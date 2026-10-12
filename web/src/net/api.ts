/* REST under /api/v1 (docs/protocol.md §3 and §4): the session, the profile, and the lists the socket
   does not carry. The session is the HttpOnly cookie `skt_session`; the page never reads it, and
   nothing here keeps a name, a password or a token after the call that carried it.

   A `Rest` is one request and its answer as the server gave it: the status and the JSON body. The
   real one is fetch against this origin; the mock server hands out its own. `Api` puts the calls of
   §4 on top of either, and turns every answer into a result the screens can branch on by code. */
import type {
  ActionLog,
  Credentials,
  ErrorCode,
  LadderPage,
  LobbyList,
  Me,
  Profile,
  ProfilePatch,
  ServerConfig,
  UserId,
} from '../protocol/generated';
import type { Transport } from './socket';

export type RestMethod = 'GET' | 'POST' | 'PATCH';
export interface RestResponse {
  status: number;
  /** The parsed JSON body, or null when there was none. */
  body: unknown;
}
/** One request to `/api/v1` + `path`. Rejects when the server could not be reached. */
export type Rest = (method: RestMethod, path: string, body?: unknown) => Promise<RestResponse>;

/** How the page reaches a server: the socket and the REST calls of one browser session. */
export interface Backend {
  transport: Transport;
  rest: Rest;
}

/** `OFFLINE` is this client's own: the request got no answer. */
export type ApiResult<T> = { ok: true; value: T } | { ok: false; code: ErrorCode | 'OFFLINE'; message: string };

const OFFLINE = { ok: false, code: 'OFFLINE', message: 'Not connected to the server.' } as const;
/** How many ladder rows one page asks for. */
export const LADDER_PAGE = 25;
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;

export class Api {
  private readonly rest: Rest;

  constructor(rest: Rest) {
    this.rest = rest;
  }

  config(): Promise<ApiResult<ServerConfig>> {
    return this.call('GET', '/config');
  }
  me(): Promise<ApiResult<Me>> {
    return this.call('GET', '/me');
  }
  /** The player of this browser's session. A browser without one gets a new guest and its session. */
  guest(): Promise<ApiResult<Me>> {
    return this.call('POST', '/auth/guest');
  }
  /** Upgrades the guest of this session in place: the same user, now with a login. */
  register(credentials: Credentials): Promise<ApiResult<Me>> {
    return this.call('POST', '/auth/register', credentials);
  }
  /** Replaces the session with that account's. */
  login(credentials: Credentials): Promise<ApiResult<Me>> {
    return this.call('POST', '/auth/login', credentials);
  }
  logout(): Promise<ApiResult<null>> {
    return this.call('POST', '/auth/logout');
  }
  patchMe(patch: ProfilePatch): Promise<ApiResult<Me>> {
    return this.call('PATCH', '/me', patch);
  }
  user(id: UserId): Promise<ApiResult<Profile>> {
    // The id came from the server, but it becomes part of a path: nothing but a UUID is sent.
    if (!UUID.test(id)) return Promise.resolve({ ok: false, code: 'NOT_FOUND', message: 'No such player.' });
    return this.call('GET', `/users/${id}`);
  }
  lobbies(): Promise<ApiResult<LobbyList>> {
    return this.call('GET', '/lobbies');
  }
  /**
   * One page of the current season's ladder. `after` is the `next` of the page before it: the
   * server's own cursor, sent back as it came.
   */
  /**
   * The deals and accepted actions of a finished game this session sat. An unknown game, or one
   * this session did not sit, is `NOT_FOUND`.
   */
  gameLog(id: string): Promise<ApiResult<ActionLog>> {
    if (!UUID.test(id)) return Promise.resolve({ ok: false, code: 'NOT_FOUND', message: 'No such game.' });
    return this.call('GET', `/games/${id}/log`);
  }
  ladder(after?: string): Promise<ApiResult<LadderPage>> {
    const query = new URLSearchParams({ limit: String(LADDER_PAGE) });
    if (after != null) query.set('after', after);
    return this.call('GET', `/ladder?${query.toString()}`);
  }

  /** The server is the authority on what is inside a 2xx body, so its fields are not checked here. */
  private async call<T>(method: RestMethod, path: string, body?: unknown): Promise<ApiResult<T>> {
    let res: RestResponse;
    try {
      res = await this.rest(method, path, body);
    } catch {
      return OFFLINE;
    }
    if (res.status >= 200 && res.status < 300) return { ok: true, value: res.body as T };
    const error = isRecord(res.body) && isRecord(res.body.error) ? res.body.error : null;
    return {
      ok: false,
      code: typeof error?.code === 'string' ? (error.code as ErrorCode) : 'INTERNAL',
      message: typeof error?.message === 'string' ? error.message : `The server answered ${res.status}.`,
    };
  }
}
