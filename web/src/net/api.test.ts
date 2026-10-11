/* The REST calls against answers written by hand: what a screen is told for each kind of answer. */
import { describe, expect, it } from 'vite-plus/test';
import { Api } from './api';
import type { Rest, RestResponse } from './api';

/** An Api whose server always gives `answer`, and what it was asked. */
function apiThat(answer: RestResponse | Error): { api: Api; asked: Parameters<Rest>[] } {
  const asked: Parameters<Rest>[] = [];
  const rest: Rest = (...request) => {
    asked.push(request);
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  };
  return { api: new Api(rest), asked };
}

describe('Api', () => {
  it('sends each call to its method and path, with the body it was given', async () => {
    const { api, asked } = apiThat({ status: 200, body: {} });
    const credentials = { username: 'anne', password: 'secret' };
    await api.config();
    await api.me();
    await api.register(credentials);
    await api.login(credentials);
    await api.logout();
    await api.patchMe({ color: '#ff9600' });
    await api.user('00000000-0000-4000-8000-000000000001');
    await api.lobbies();
    expect(asked).toEqual([
      ['GET', '/config', undefined],
      ['GET', '/me', undefined],
      ['POST', '/auth/register', credentials],
      ['POST', '/auth/login', credentials],
      ['POST', '/auth/logout', undefined],
      ['PATCH', '/me', { color: '#ff9600' }],
      ['GET', '/users/00000000-0000-4000-8000-000000000001', undefined],
      ['GET', '/lobbies', undefined],
    ]);
  });

  it('gives the body of a 2xx answer, and null for 204', async () => {
    expect(await apiThat({ status: 200, body: { lobbies: [] } }).api.lobbies()).toEqual({
      ok: true,
      value: { lobbies: [] },
    });
    expect(await apiThat({ status: 204, body: null }).api.logout()).toEqual({ ok: true, value: null });
  });

  it('gives the code and the message of an error answer', async () => {
    const taken = { status: 409, body: { error: { code: 'USERNAME_TAKEN', message: 'That username is taken.' } } };
    expect(await apiThat(taken).api.register({ username: 'anne', password: 'x' })).toEqual({
      ok: false,
      code: 'USERNAME_TAKEN',
      message: 'That username is taken.',
    });
  });

  it('calls an error without the envelope INTERNAL, and no answer at all OFFLINE', async () => {
    expect(await apiThat({ status: 502, body: null }).api.me()).toEqual({
      ok: false,
      code: 'INTERNAL',
      message: 'The server answered 502.',
    });
    expect(await apiThat(new Error('Failed to fetch')).api.me()).toMatchObject({ ok: false, code: 'OFFLINE' });
  });

  it('never puts anything but a user id into a path', async () => {
    const { api, asked } = apiThat({ status: 200, body: {} });
    for (const id of ['../me', 'x/../../auth/logout', '', 'not-a-uuid', '00000000-0000-4000-8000-00000000000g'])
      expect(await api.user(id)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(asked).toEqual([]);
  });
});
