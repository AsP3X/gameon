/* The addresses of the page: one for each screen, so a reload, a link and the browser's Back and
   Forward land where the player was (plan item W0).

   Four kinds of page share them: the frame around the game (GameOn: the landing, Games, signing
   up and in), Skull King's own pages (its home and the solo setup), the online screens, and the
   screens the legacy renderer draws. Skull King's ranked
   page is not built yet (W4). Its address is taken here so nothing else claims it, and until the
   page exists it leads to the nearest one that does (`settle`).

   Never a page: `/api`, `/assets`, `/sw.js`, `/index.html`, `/manifest.json`. The server and the
   build answer those. */
import type { UserId } from '../protocol/generated';

export const AT = {
  /** GameOn's landing. */
  landing: '/',
  /** GameOn's list of games. */
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
  /* The frame around the game. */
  | { page: 'landing' }
  | { page: 'games' }
  | { page: 'signIn' }
  | { page: 'signUp' }
  /* The legacy renderer's screens. Skull King's home is the page's own, with the renderer under it. */
  | { page: 'home' }
  /** The new-game screen, for a game on one screen. */
  | { page: 'setup' }
  /** The setup of a solo game: a page of its own (src/skullking). It asks the server for the game. */
  | { page: 'solo' }
  | { page: 'table' }
  | { page: 'score' }
  /* The online screens. */
  | { page: 'online' }
  | { page: 'newTable'; visibility: 'private' | 'public' }
  | { page: 'join' }
  | { page: 'publicTables' }
  | { page: 'ladder' }
  | { page: 'profile' }
  | { page: 'player'; id: UserId };

/** The pages the legacy renderer draws. */
export type LegacyPage = 'home' | 'setup' | 'table' | 'score';
export type LegacyRoute = Extract<Route, { page: LegacyPage }>;
/** The pages of the frame around the game. They need no connection. */
export type FramePage = 'landing' | 'games' | 'signIn' | 'signUp';
export type FrameRoute = Extract<Route, { page: FramePage }>;
/** The solo setup. It needs a connection only when a game is asked for. */
export type SoloRoute = Extract<Route, { page: 'solo' }>;
/** Every other page is one of the online screens. */
export type OnlineRoute = Exclude<Route, LegacyRoute | FrameRoute | SoloRoute>;
export const isLegacy = (route: Route): route is LegacyRoute =>
  route.page === 'home' || route.page === 'setup' || route.page === 'table' || route.page === 'score';
export const isFrame = (route: Route): route is FrameRoute =>
  route.page === 'landing' || route.page === 'games' || route.page === 'signIn' || route.page === 'signUp';
export const isOnline = (route: Route): route is OnlineRoute =>
  !isLegacy(route) && !isFrame(route) && route.page !== 'solo';
/** The online screens' first page. */
export const HUB: OnlineRoute = { page: 'online' };

const PAGES: Record<string, Route> = {
  [AT.landing]: { page: 'landing' },
  [AT.games]: { page: 'games' },
  [AT.home]: { page: 'home' },
  [AT.solo]: { page: 'solo' },
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
