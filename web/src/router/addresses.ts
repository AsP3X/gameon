/* The addresses of the page: one for each screen, so a reload, a link and the browser's Back and
   Forward land where the player was (plan item W0).

   Four kinds of page share them: the frame around the game (GameOn: the landing, Games, signing
   up and in, the profile, another player, the ladder and the four pages its footer leads to),
   Skull King's own pages (its home and
   the solo setup), the online screens, and the screens the legacy renderer draws.

   Never a page: `/api`, `/ocho`, `/assets`, `/sw.js`, `/index.html`, `/manifest.json`. The server and the
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
  /** The four pages the frame's footer leads to. What they say is the page's own: the server is not asked for it. */
  howToPlay: '/how-to-play',
  privacy: '/privacy',
  imprint: '/imprint',
  suggest: '/suggest',
  /** Ocho: sit down, the table waiting, or the table, as Ocho's server says (src/ocho). Not under
      `/ocho/`: that is Ocho's server, behind the same origin. */
  ocho: '/games/ocho',
  /** Ocho's sit-down with Teams chosen: the shelf's "Teams" way. */
  ochoTeams: '/games/ocho/teams',
  ochoRules: '/games/ocho/how-to-play',
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
  /** Skull King's ranked page: the one way into the ranked queue. */
  ranked: '/skull-king/ranked',
} as const;

/** A user id as the server makes them. Nothing else is put into an address or read out of one. */
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLAYERS = '/players/';

/** The address of another player's page, or null for an id that is not one of the server's. */
export const playerAt = (id: UserId): string | null => (USER_ID.test(id) ? PLAYERS + id.toLowerCase() : null);

/** A table's code as the server makes them (docs/protocol.md §5.3). Nothing else is put into an address or read out of one. */
const TABLE_CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const JOIN = '/skull-king/online/join/';

/** The address of the join screen with a table's code in it: what an invite links to. null for anything that is not a code. */
export function joinAt(code: string): string | null {
  const upper = code.toUpperCase();
  return TABLE_CODE.test(upper) ? JOIN + upper : null;
}

/** What an address shows. */
export type Route =
  /* The frame around the game. */
  | { page: 'landing' }
  | { page: 'games' }
  | { page: 'signIn' }
  | { page: 'signUp' }
  /** The player's own profile (plan item W5). */
  | { page: 'profile' }
  /** Another player, as the server knows them. */
  | { page: 'player'; id: UserId }
  /** The season's ladder. */
  | { page: 'ladder' }
  /** A short guide to a hand, what the site keeps, who publishes it, and a game to wish for. */
  | { page: 'howToPlay' }
  | { page: 'privacy' }
  | { page: 'imprint' }
  | { page: 'suggest' }
  /* Ocho: a game of its own, on its own server. */
  | { page: 'ocho' }
  | { page: 'ochoTeams' }
  | { page: 'ochoRules' }
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
  | { page: 'ranked' }
  | { page: 'newTable'; visibility: 'private' | 'public' }
  /** Joining by code. An invite's address carries the code, and the screen starts with it. */
  | { page: 'join'; code?: string }
  | { page: 'publicTables' };

/** The pages the legacy renderer draws. */
export type LegacyPage = 'home' | 'setup' | 'table' | 'score';
export type LegacyRoute = Extract<Route, { page: LegacyPage }>;
/** The pages of the frame around the game. They need no connection. */
export type FramePage =
  | 'landing'
  | 'games'
  | 'signIn'
  | 'signUp'
  | 'profile'
  | 'player'
  | 'ladder'
  | 'howToPlay'
  | 'privacy'
  | 'imprint'
  | 'suggest'
  | 'ocho'
  | 'ochoTeams'
  | 'ochoRules';
export type FrameRoute = Extract<Route, { page: FramePage }>;
/** The solo setup. It needs a connection only when a game is asked for. */
export type SoloRoute = Extract<Route, { page: 'solo' }>;
/** Every other page is one of the online screens. */
export type OnlineRoute = Exclude<Route, LegacyRoute | FrameRoute | SoloRoute>;
export const isLegacy = (route: Route): route is LegacyRoute =>
  route.page === 'home' || route.page === 'setup' || route.page === 'table' || route.page === 'score';
const FRAME: ReadonlySet<string> = new Set<FramePage>([
  'landing',
  'games',
  'signIn',
  'signUp',
  'profile',
  'player',
  'ladder',
  'howToPlay',
  'privacy',
  'imprint',
  'suggest',
  'ocho',
  'ochoTeams',
  'ochoRules',
]);
export const isFrame = (route: Route): route is FrameRoute => FRAME.has(route.page);
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
  [AT.ranked]: { page: 'ranked' },
  [AT.newTable]: { page: 'newTable', visibility: 'private' },
  [AT.newPublicTable]: { page: 'newTable', visibility: 'public' },
  [AT.join]: { page: 'join' },
  [AT.publicTables]: { page: 'publicTables' },
  [AT.ladder]: { page: 'ladder' },
  [AT.profile]: { page: 'profile' },
  [AT.signIn]: { page: 'signIn' },
  [AT.signUp]: { page: 'signUp' },
  [AT.howToPlay]: { page: 'howToPlay' },
  [AT.privacy]: { page: 'privacy' },
  [AT.imprint]: { page: 'imprint' },
  [AT.suggest]: { page: 'suggest' },
  [AT.ocho]: { page: 'ocho' },
  [AT.ochoTeams]: { page: 'ochoTeams' },
  [AT.ochoRules]: { page: 'ochoRules' },
};

/**
 * The address a path stands for: itself when it has a page, and Skull King's home for a path that
 * is nobody's. A slash at the end is dropped. What follows the join screen's address and is not a
 * table's code leads to the join screen without one.
 */
export function settle(path: string): string {
  const bare = path.length > 1 ? path.replace(/\/+$/, '') : path;
  if (Object.hasOwn(PAGES, bare)) return bare;
  if (bare.startsWith(PLAYERS)) return playerAt(bare.slice(PLAYERS.length)) ?? AT.home;
  if (bare.startsWith(JOIN)) return joinAt(bare.slice(JOIN.length)) ?? AT.join;
  return AT.home;
}

/** The page of a settled address. */
export function routeOf(path: string): Route {
  const at = settle(path);
  if (Object.hasOwn(PAGES, at)) return PAGES[at];
  if (at.startsWith(PLAYERS)) return { page: 'player', id: at.slice(PLAYERS.length) };
  return at.startsWith(JOIN) ? { page: 'join', code: at.slice(JOIN.length) } : { page: 'home' };
}
