/* The rules a table can be set to, by the names design/skt.pen gives them: the five lengths of a
   game, the two scorings and the four extras. The solo setup and the online tables offer the same
   cards. The rounds of a length are the rules' own (`Rules.FORMATS`). */
import type { Format, Scoring } from '../protocol/generated';

export const SCORINGS: [Scoring, string, string][] = [
  ['classic', 'Classic', 'Classic, high risk'],
  ['rascal', 'Rascal', '10 per card dealt'],
];
/** The five lengths a game can have, by the short names the setups use. */
export const FORMATS: [Format, string][] = [
  ['classic', 'Classic'],
  ['brawl', 'Brawl'],
  ['swift', 'Swift'],
  ['even', 'Even'],
  ['whirl', 'Whirl'],
];
export type Extra = 'loot' | 'kraken' | 'whale' | 'abilities';
export const EXTRAS: [Extra, string, string][] = [
  ['loot', 'Loot', 'Win a Loot to form an alliance: +20 each if both make their bids.'],
  ['kraken', 'Kraken', 'Swallows the trick. Nobody wins it.'],
  ['whale', 'Whale', 'Special cards stop counting; the highest number wins.'],
  ['abilities', 'Abilities', 'Win a trick with a Pirate to use its power: Helmsman, Smuggler, Gambler, Seer or Giant.'],
];

export const isScoring = (x: unknown): x is Scoring => SCORINGS.some(([scoring]) => scoring === x);
export const isFormat = (x: unknown): x is Format => FORMATS.some(([format]) => format === x);
export const formatName = (format: Format): string => FORMATS.find(([f]) => f === format)?.[1] ?? format;
export const scoringName = (scoring: Scoring): string => SCORINGS.find(([s]) => s === scoring)?.[1] ?? scoring;
