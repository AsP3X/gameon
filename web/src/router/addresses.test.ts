/* The address table: which page each address shows, and where an address leads that has none. */
import { describe, expect, it } from 'vite-plus/test';
import { AT, isFrame, isLegacy, isOnline, playerAt, routeOf, settle } from './addresses';

const ID = '018f6b4a-6a2e-7c3a-8b1d-9e0f1a2b3c4d';

describe('the addresses', () => {
  it('has one page for every address of the plan that is built', () => {
    expect(routeOf('/')).toEqual({ page: 'landing' });
    expect(routeOf('/games')).toEqual({ page: 'games' });
    expect(routeOf('/skull-king')).toEqual({ page: 'home' });
    expect(routeOf('/skull-king/solo')).toEqual({ page: 'solo' });
    expect(routeOf('/skull-king/one-screen')).toEqual({ page: 'setup' });
    expect(routeOf('/skull-king/score')).toEqual({ page: 'score' });
    expect(routeOf('/skull-king/table')).toEqual({ page: 'table' });
    expect(routeOf('/skull-king/online')).toEqual({ page: 'online' });
    // Ranked has a page of its own: the address no longer leads to the index.
    expect(routeOf('/skull-king/ranked')).toEqual({ page: 'ranked' });
    expect(routeOf('/skull-king/online/new')).toEqual({ page: 'newTable', visibility: 'private' });
    expect(routeOf('/skull-king/online/join')).toEqual({ page: 'join' });
    expect(routeOf('/skull-king/online/public')).toEqual({ page: 'publicTables' });
    expect(routeOf('/skull-king/online/public/new')).toEqual({ page: 'newTable', visibility: 'public' });
    expect(routeOf('/ladder')).toEqual({ page: 'ladder' });
    expect(routeOf('/profile')).toEqual({ page: 'profile' });
    expect(routeOf('/sign-in')).toEqual({ page: 'signIn' });
    expect(routeOf('/sign-up')).toEqual({ page: 'signUp' });
    expect(routeOf(`/players/${ID}`)).toEqual({ page: 'player', id: ID });
  });

  it('keeps an address that has a page, and both addresses of the new-game screen', () => {
    for (const at of Object.values(AT)) expect(settle(at)).toBe(at);
    expect(settle(`/players/${ID}`)).toBe(`/players/${ID}`);
  });

  it("takes a path that is nobody's to the home screen, and drops a slash at the end", () => {
    expect(settle('/nowhere')).toBe('/skull-king');
    expect(settle('/skull-king/online/public/')).toBe('/skull-king/online/public');
    expect(settle('/skull-king/')).toBe('/skull-king');
    expect(settle('/games/')).toBe('/games');
    expect(routeOf('/skull-king/table/7')).toEqual({ page: 'home' });
  });

  it("claims nothing that is the server's or the build's", () => {
    for (const path of ['/api', '/api/v1/me', '/assets/main.js', '/sw.js', '/index.html', '/manifest.json'])
      expect(routeOf(path)).toEqual({ page: 'home' });
    expect(Object.values(AT).some((at) => /^\/(api|assets|sw\.js|index\.html|manifest\.json)(\/|$)/.test(at))).toBe(
      false,
    );
  });

  it("puts only a server's user id into an address, and reads nothing else out of one", () => {
    expect(playerAt(ID)).toBe(`/players/${ID}`);
    expect(playerAt(ID.toUpperCase())).toBe(`/players/${ID}`);
    expect(playerAt('../../api/v1/me')).toBeNull();
    expect(playerAt('<b>Remy</b>')).toBeNull();
    expect(settle('/players/someone')).toBe('/skull-king');
    expect(settle(`/players/${ID}/more`)).toBe('/skull-king');
  });

  it("tells the renderer's pages, the frame's and the online screens apart", () => {
    const kind = (path: string): string => {
      const route = routeOf(path);
      return [isLegacy(route) && 'legacy', isFrame(route) && 'frame', isOnline(route) && 'online']
        .filter(Boolean)
        .join('+');
    };
    for (const path of ['/skull-king', '/skull-king/one-screen', '/skull-king/table', '/skull-king/score'])
      expect(kind(path)).toBe('legacy');
    // The solo setup is none of the three: a page of its own, which connects only to start a game.
    expect(kind('/skull-king/solo')).toBe('');
    for (const path of ['/', '/games', '/sign-in', '/sign-up']) expect(kind(path)).toBe('frame');
    for (const path of ['/skull-king/online', '/skull-king/online/join', '/ladder', '/profile', `/players/${ID}`])
      expect(kind(path)).toBe('online');
  });
});
