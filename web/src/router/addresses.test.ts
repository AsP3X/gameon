/* The address table: which page each address shows, and where an address leads that has none. */
import { describe, expect, it } from 'vite-plus/test';
import { AT, isFrame, isLegacy, isOnline, joinAt, playerAt, routeOf, settle } from './addresses';

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
    expect(routeOf('/how-to-play')).toEqual({ page: 'howToPlay' });
    expect(routeOf('/privacy')).toEqual({ page: 'privacy' });
    expect(routeOf('/imprint')).toEqual({ page: 'imprint' });
    expect(routeOf('/suggest')).toEqual({ page: 'suggest' });
    expect(routeOf('/games/ocho')).toEqual({ page: 'ocho' });
    expect(routeOf('/games/ocho/teams')).toEqual({ page: 'ochoTeams' });
    expect(routeOf('/games/ocho/how-to-play')).toEqual({ page: 'ochoRules' });
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
    for (const path of [
      '/api',
      '/api/v1/me',
      '/ocho',
      '/ocho/v1/ws',
      '/assets/main.js',
      '/sw.js',
      '/index.html',
      '/manifest.json',
    ])
      expect(routeOf(path)).toEqual({ page: 'home' });
    expect(
      Object.values(AT).some((at) => /^\/(api|ocho|assets|sw\.js|index\.html|manifest\.json)(\/|$)/.test(at)),
    ).toBe(false);
  });

  it("puts only a server's user id into an address, and reads nothing else out of one", () => {
    expect(playerAt(ID)).toBe(`/players/${ID}`);
    expect(playerAt(ID.toUpperCase())).toBe(`/players/${ID}`);
    expect(playerAt('../../api/v1/me')).toBeNull();
    expect(playerAt('<b>Remy</b>')).toBeNull();
    expect(settle('/players/someone')).toBe('/skull-king');
    expect(settle(`/players/${ID}/more`)).toBe('/skull-king');
  });

  it("reads a table's code out of an invite's address, in upper case, and nothing else", () => {
    expect(joinAt('ABCDEF')).toBe('/skull-king/online/join/ABCDEF');
    expect(joinAt('k7mq2x')).toBe('/skull-king/online/join/K7MQ2X');
    expect(routeOf('/skull-king/online/join/K7MQ2X')).toEqual({ page: 'join', code: 'K7MQ2X' });
    expect(settle('/skull-king/online/join/k7mq2x')).toBe('/skull-king/online/join/K7MQ2X');
    expect(routeOf('/skull-king/online/join/k7mq2x/')).toEqual({ page: 'join', code: 'K7MQ2X' });
    expect(isOnline(routeOf('/skull-king/online/join/K7MQ2X'))).toBe(true);
    // Six characters of the code's alphabet: it has no I, L, O, 0 or 1.
    for (const not of [
      '',
      'ABCDE',
      'ABCDEFG',
      'ABCDEI',
      'ABCDEL',
      'ABCDEO',
      'ABCDE0',
      'ABCDE1',
      'ABC-EF',
      '<b>x</b>',
    ]) {
      expect(joinAt(not)).toBeNull();
      expect(settle(`/skull-king/online/join/${not}`)).toBe('/skull-king/online/join');
      expect(routeOf(`/skull-king/online/join/${not}`)).toEqual({ page: 'join' });
    }
    expect(settle('/skull-king/online/join/ABCDEF/more')).toBe('/skull-king/online/join');
    expect(settle('/skull-king/online/join/../../api')).toBe('/skull-king/online/join');
    // A letter that only becomes one of the alphabet's in upper case is not a code.
    expect(joinAt('abcdeß')).toBeNull();
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
    // The profile, another player and the ladder are the frame's: they need no connection.
    for (const path of ['/', '/games', '/sign-in', '/sign-up', '/ladder', '/profile', `/players/${ID}`])
      expect(kind(path)).toBe('frame');
    // So are the four pages the footer leads to.
    for (const path of ['/how-to-play', '/privacy', '/imprint', '/suggest']) expect(kind(path)).toBe('frame');
    // Ocho's pages are the frame's too: Skull King's connection is not theirs.
    for (const path of ['/games/ocho', '/games/ocho/teams', '/games/ocho/how-to-play'])
      expect(kind(path)).toBe('frame');
    for (const path of ['/skull-king/online', '/skull-king/online/join', '/skull-king/ranked'])
      expect(kind(path)).toBe('online');
  });
});
