/* The frames of protocol v1 (docs/protocol.md §5), named from the generated wire types.
   skt-protocol generates one type per message but no union of what a server may send, so that
   union is put together here. Nothing is redeclared: every member is a generated type. */
import type {
  ClientMessage,
  ErrMessage,
  GameEmotePush,
  GameOver,
  GameStart,
  GameUpdate,
  LobbyClosed,
  LobbyStatePush,
  OkReply,
  QueueStatusPush,
  Superseded,
  Welcome,
} from '../protocol/generated';

/** The integer in `hello`. A server that does not speak it answers `PROTOCOL_UNSUPPORTED`. */
export const PROTOCOL = 1;

/** The answer to one client message: every `id` gets exactly one. */
export type ServerReply = OkReply | ErrMessage;
/** What a server sends without being asked. */
export type ServerPush =
  | Welcome
  | Superseded
  | LobbyStatePush
  | LobbyClosed
  | QueueStatusPush
  | GameStart
  | GameUpdate
  | GameEmotePush
  | GameOver;
export type ServerMessage = ServerReply | ServerPush;

/** A client message before it is given its `id`. */
export type ClientRequest = ClientMessage extends infer M ? (M extends { id: number } ? Omit<M, 'id'> : never) : never;

const SERVER_TYPES: Record<ServerMessage['t'], true> = {
  ok: true,
  err: true,
  welcome: true,
  superseded: true,
  'lobby.state': true,
  'lobby.closed': true,
  'queue.status': true,
  'game.start': true,
  'game.update': true,
  'game.emote': true,
  'game.over': true,
};

/**
 * One text frame from the server as a message, or null for anything this client does not know:
 * both sides ignore unknown message types (§1). The server is the authority on what is inside, so
 * the fields are not checked beyond what tells the messages apart.
 */
export function parseServerMessage(data: unknown): ServerMessage | null {
  if (typeof data !== 'string') return null;
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || !('t' in raw)) return null;
  const t = raw.t;
  if (typeof t !== 'string' || !Object.hasOwn(SERVER_TYPES, t)) return null;
  if ((t === 'ok' || t === 'err') && !('re' in raw && typeof raw.re === 'number')) return null;
  return raw as ServerMessage;
}
