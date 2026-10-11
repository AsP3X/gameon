/* The rules of an online table as the player last set them, and how they read in a sentence.
   The last settings are a per-device convenience (localStorage): the server has the real ones. */
import { Rules } from '../game';
import type { GameSettings, Pace } from '../protocol/generated';
import { isFormat, isLevel, isScoring } from '../tableview/state';
import { Store } from '../tableview/store';

const KEY = 'skullking-tavern.lobby.v1';
export const MIN_SEATS = 2;
export const MAX_SEATS = 8;

export const PACES: readonly { value: Pace; name: string; desc: string }[] = [
  { value: 'relaxed', name: 'Relaxed', desc: 'Double time' },
  { value: 'standard', name: 'Standard', desc: 'Normal clock' },
  { value: 'fast', name: 'Fast', desc: 'Half time' },
];
const isPace = (v: unknown): v is Pace => PACES.some((p) => p.value === v);

export const defaultSettings = (): GameSettings => ({
  maxPlayers: 4,
  scoring: 'classic',
  format: 'classic',
  loot: false,
  kraken: false,
  whale: false,
  abilities: false,
  botLevel: 'normal',
  pace: 'standard',
});

/** The last settings used on this device, with anything unreadable replaced by the default. */
export function loadSettings(): GameSettings {
  const d = defaultSettings(),
    s = Store.get<Partial<Record<keyof GameSettings, unknown>>>(KEY) ?? {};
  const seats = typeof s.maxPlayers === 'number' && Number.isInteger(s.maxPlayers) ? s.maxPlayers : d.maxPlayers;
  return {
    maxPlayers: Math.max(MIN_SEATS, Math.min(MAX_SEATS, seats)),
    scoring: typeof s.scoring === 'string' && isScoring(s.scoring) ? s.scoring : d.scoring,
    format: typeof s.format === 'string' && isFormat(s.format) ? s.format : d.format,
    loot: s.loot === true,
    kraken: s.kraken === true,
    whale: s.whale === true,
    abilities: s.abilities === true,
    botLevel: typeof s.botLevel === 'string' && isLevel(s.botLevel) ? s.botLevel : d.botLevel,
    pace: isPace(s.pace) ? s.pace : d.pace,
  };
}
export const saveSettings = (settings: GameSettings): void => Store.set(KEY, settings);

const LEVEL = { easy: 'Easy', normal: 'Normal', hard: 'Hard' } as const;

/** The two lines of the rules card in the lobby. */
export function describeSettings(s: GameSettings): { title: string; detail: string } {
  const extras = [
    s.abilities ? 'Pirate abilities' : '',
    s.loot ? 'Loot' : '',
    s.kraken ? 'Kraken' : '',
    s.whale ? 'White Whale' : '',
  ].filter(Boolean);
  const pace = PACES.find((p) => p.value === s.pace)?.name ?? 'Standard';
  return {
    title: `${s.scoring === 'rascal' ? "Rascal's" : "Skull King's"} scoring · ${Rules.FORMATS[s.format].name}`,
    detail: [
      `Up to ${s.maxPlayers} pirates`,
      `${LEVEL[s.botLevel]} bots`,
      `${pace} pace`,
      extras.length ? extras.join(', ') : 'No extra cards',
    ].join(' · '),
  };
}

/** The two lines under a host's name in the public list: how full the table is, and what is played. */
export function describeTable(s: GameSettings, players: number): { seats: string; rules: string } {
  const { title, detail } = describeSettings(s);
  return {
    seats: `${players} of ${s.maxPlayers} pirates · ${title}`,
    rules: detail.split(' · ').slice(1).join(' · '),
  };
}
