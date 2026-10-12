/* The samples in fixtures/protocol are what skt-protocol writes for every message of
   docs/protocol.md. Each one the server can send must come through the client's parser as the
   message it is, and the ones only a client sends must not be taken for a server message. */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';
import { parseServerMessage } from './messages';

const dir = fileURLToPath(new URL('../../../fixtures/protocol/', import.meta.url));
const samples = readdirSync(dir)
  .filter((name) => name.endsWith('.json'))
  .map((name) => ({ name, text: readFileSync(dir + name, 'utf8') }));

/** The `t` of every sample that is a frame: DTO samples (a lobby, a card) have none. */
const typeOf = (text: string): string | null => {
  const raw: unknown = JSON.parse(text);
  return typeof raw === 'object' && raw !== null && 't' in raw && typeof raw.t === 'string' ? raw.t : null;
};
const SERVER = [
  'ok',
  'err',
  'welcome',
  'superseded',
  'lobby.state',
  'lobby.closed',
  'queue.status',
  'game.start',
  'game.update',
  'game.over',
  'seat.lost',
];

describe('parseServerMessage', () => {
  it('finds the protocol samples', () => {
    expect(samples.length).toBeGreaterThan(60);
  });

  it.each(samples)('parses $name', ({ name, text }) => {
    const t = typeOf(text),
      // `game.emote` is both an intent and a push; the sample of the push says so in its name.
      fromServer = t != null && (SERVER.includes(t) || name === 'game.emote-push.json');
    const message = parseServerMessage(text);
    if (fromServer) expect(message).toEqual(JSON.parse(text));
    else if (t !== 'game.emote') expect(message).toBeNull();
  });

  it('ignores what it does not know, and what is not a frame at all', () => {
    expect(parseServerMessage('{"t":"lobby.invite","from":"someone"}')).toBeNull();
    expect(parseServerMessage('{"t":"ok"}')).toBeNull(); // a reply without `re` answers nothing
    expect(parseServerMessage('not json')).toBeNull();
    expect(parseServerMessage('null')).toBeNull();
    expect(parseServerMessage(new ArrayBuffer(4))).toBeNull();
  });

  it('keeps fields it has never heard of', () => {
    expect(parseServerMessage('{"t":"superseded","why":"later"}')).toEqual({ t: 'superseded', why: 'later' });
  });
});
