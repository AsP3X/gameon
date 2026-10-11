/* The reference engine: rules, reducer and bots of the offline game.
   Used as `Rules.legal(...)`, `Engine.reduce(...)`, `Bots.play(...)`, the names the legacy build used. */
export * as Bots from './bots';
export * as Engine from './engine';
export * as Rules from './rules';
export type * from './types';
