/* What GameOn has on its shelf: one game that is live and the ones that are announced. This is the
   page's own copy. Nothing here comes from the server, and nothing here is asked of it. */
import type { KeyTone } from './art';
import type { IconName } from './icons';

export type Kind = 'cards' | 'board' | 'dice';
/** The filter above a list of games. */
export type Shelf = 'all' | Kind;
export const SHELVES: [Shelf, string][] = [
  ['all', 'All'],
  ['cards', 'Cards'],
  ['board', 'Board'],
  ['dice', 'Dice'],
];
export const KIND_NAME: Record<Kind, string> = { cards: 'Cards', board: 'Board', dice: 'Dice' };

/** A game that is announced and cannot be played yet. */
export interface SoonGame {
  name: string;
  kind: Kind;
  players: string;
  line: string;
  icon: IconName;
  tone: KeyTone;
}
export const SOON: SoonGame[] = [
  {
    name: 'Hearts',
    kind: 'cards',
    players: '4 players',
    line: 'Dodge the points, or take every one of them and shoot the moon.',
    icon: 'heart',
    tone: 'red',
  },
  {
    name: 'Chess',
    kind: 'board',
    players: '2 players',
    line: 'From the opening to the endgame, against a bot or a friend.',
    icon: 'crown',
    tone: 'kraken',
  },
  {
    name: 'Ludo',
    kind: 'board',
    players: '2–4 players',
    line: 'Roll, race your four pieces home, and send the others back to the start.',
    icon: 'dice5',
    tone: 'gold',
  },
  {
    name: 'Four in a Row',
    kind: 'board',
    players: '2 players',
    line: 'Drop your discs and line up four before the other side does.',
    icon: 'grid',
    tone: 'blue',
  },
  {
    name: 'Five Dice',
    kind: 'dice',
    players: '1–6 players',
    line: 'Roll up to three times, fill your scorecard, and hope for five of a kind.',
    icon: 'dices',
    tone: 'purple',
  },
];
/** Skull King is a card game: it is on the shelf under "All" and "Cards". */
export const showsSkullKing = (shelf: Shelf): boolean => shelf === 'all' || shelf === 'cards';
export const soonOn = (shelf: Shelf): SoonGame[] => SOON.filter((game) => shelf === 'all' || game.kind === shelf);

/**
 * The seven ranked tiers, lowest first, as the landing names them (docs/protocol.md §4). The page
 * only lists the names. Which tier a player is in is the server's to say, and is shown as it came.
 */
export const TIERS = ['Deckhand', 'Bosun', 'Quartermaster', 'First Mate', 'Captain', 'Pirate Lord', 'Skull King'];
