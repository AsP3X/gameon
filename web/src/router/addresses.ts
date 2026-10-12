/* The addresses of the page: one for each screen, so a reload, a link and the browser's Back and
   Forward land where the player was (plan item W0).

   The frame around the game (GameOn: the landing, Games) and Skull King's ranked page are not built
   yet (W1, W4). Their addresses are taken here so nothing else claims them, and until their pages
   exist they lead to the nearest one that does (`settle`).

   Never a page: `/api`, `/assets`, `/sw.js`, `/index.html`, `/manifest.json`. The server and the
   build answer those. */
import type { UserId } from '../protocol/generated';

export const AT = {
  /** GameOn's landing. Not built: leads to Skull King's home. */
  landing: '/',
  /** GameOn's list of games. Not built: leads to Skull King's home. */
  games: '/games',
  signIn: '/sign-in',
  signUp: '/sign-up',
  profile: '/profile',
  ladder: '/ladder',
  home: '/skull-king',
  solo: '/skull-king/solo',
  oneScreen: '/skull-king/one-screen',
  score: '/skull-king/score',
  /** The one table a game is played at: offline, or a seat on the server. */
  table: '/skull-king/table',
  online: '/skull-king/online',
  newTable: '/skull-king/online/new',
  join: '/skull-king/online/join',
  publicTables: '/skull-king/online/public',
  newPublicTable: '/skull-king/online/public/new',
  /** Skull King's ranked page. Not built: ranked is a section of the online hub. */
  ranked: '/skull-king/ranked',
} as const;

/** A user id as the server makes them. Nothing else is put into an address or read out of one. */
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLAYERS = '/players/';

/** The address of another player's page, or null for an id that is not one of the server's. */
export const playerAt = (id: UserId): string | null => (USER_ID.test(id) ? PLAYERS + id.toLowerCase() : null);

/** What an address shows. */
export type Route =
  /* The legacy renderer's screens. */
  | { page: 'home' }
  /** The new-game screen. Solo and one screen share it until solo has a page of its own (W3). */
  | { page: 'setup' }
  | { page: 'table' }
  | { page: 'score' }
  /* The online screens. */
  | { page: 'online' }
  | { page: 'newTable'; visibility: 'private' | 'public' }
  | { page: 'join' }
  | { page: 'publicTables' }
  | { page: 'ladder' }
  | { page: 'profile' }
  | { page: 'signIn' }
  | { page: 'signUp' }
  | { page: 'player'; id: UserId };

/** The pages the legacy renderer draws. Every other page is one of the online screens. */
export type LegacyPage = 'home' | 'setup' | 'table' | 'score';
export type LegacyRoute = Extract<Route, { page: LegacyPage }>;
export type OnlineRoute = Exclude<Route, LegacyRoute>;
export const isLegacy = (route: Route): route is LegacyRoute =>
  route.page === 'home' || route.page === 'setup' || route.page === 'table' || route.page === 'score';
/** The online screens' first page. */
export const HUB: OnlineRoute = { page: 'online' };

const PAGES: Record<string, Route> = {
  [AT.home]: { page: 'home' },
  [AT.solo]: { page: 'setup' },
  [AT.oneScreen]: { page: 'setup' },
  [AT.table]: { page: 'table' },
  [AT.score]: { page: 'score' },
  [AT.online]: { page: 'online' },
  [AT.newTable]: { page: 'newTable', visibility: 'private' },
  [AT.newPublicTable]: { page: 'newTable', visibility: 'public' },
  [AT.join]: { page: 'join' },
  [AT.publicTables]: { page: 'publicTables' },
  [AT.ladder]: { page: 'ladder' },
  [AT.profile]: { page: 'profile' },
  [AT.signIn]: { page: 'signIn' },
  [AT.signUp]: { page: 'signUp' },
};
/** Addresses whose page is not built yet, and where they lead until it is. */
const LEADS: Record<string, string> = {
  [AT.landing]: AT.home,
  [AT.games]: AT.home,
  [AT.ranked]: AT.online,
};

/**
 * The address a path stands for: itself when it has a page, the page it leads to when its own is
 * not built yet, and Skull King's home for a path that is nobody's. A slash at the end is dropped.
 */
export function settle(path: string): string {
  const bare = path.length > 1 ? path.replace(/\/+$/, '') : path;
  if (Object.hasOwn(PAGES, bare)) return bare;
  if (Object.hasOwn(LEADS, bare)) return LEADS[bare];
  if (bare.startsWith(PLAYERS)) return playerAt(bare.slice(PLAYERS.length)) ?? AT.home;
  return AT.home;
}

/** The page of a settled address. */
export function routeOf(path: string): Route {
  const at = settle(path);
  if (Object.hasOwn(PAGES, at)) return PAGES[at];
  return at.startsWith(PLAYERS) ? { page: 'player', id: at.slice(PLAYERS.length) } : { page: 'home' };
}
