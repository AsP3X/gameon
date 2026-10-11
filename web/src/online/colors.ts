/* The eight table colours a player may pick (docs/protocol.md §4), and what each is called. */
import type { TableColor } from '../protocol/generated';

const NAMES: Record<TableColor, string> = {
  '#1cb0f6': 'Blue',
  '#ff9600': 'Orange',
  '#ce82ff': 'Purple',
  '#ff4b4b': 'Red',
  '#58cc02': 'Green',
  '#e5a400': 'Gold',
  '#2b70c9': 'Navy',
  '#ff5fbf': 'Pink',
};

export const TABLE_COLORS = Object.entries(NAMES) as [TableColor, string][];
