/* The rules of an online table as the player last set them, and how they read in a sentence.
   The last settings are a per-device convenience (localStorage): the server has the real ones. */
import { Rules } from '../game';
import type { GameSettings, LobbySummary, Pace } from '../protocol/generated';
import { EXTRAS, formatName, scoringName } from '../skullking/rulesets';
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

/**
 * What a table of friends or a public table is always opened with. The page has no control for
 * the seats, the pace or the bots' skill (docs/handover/075, 071 question 1). The skill is sent
 * for a table without bots too: the settings have no place to leave it out.
 */
export const FIXED = { maxPlayers: 4, pace: 'standard', botLevel: 'normal' } as const;
/** The rules a new table opens set to: the last ones chosen on this device, at the fixed size and pace. */
export const loadTable = (): GameSettings => ({ ...loadSettings(), ...FIXED });

/** The two lines of the rules card at a waiting table: how long the game is, then how it is scored and what is in the deck. */
export function describeRules(s: GameSettings): { title: string; detail: string } {
  const rounds = Rules.FORMATS[s.format].seq.length;
  return {
    title: `${formatName(s.format)} · ${rounds} rounds`,
    detail: [`${scoringName(s.scoring)} scoring`, ...EXTRAS.filter(([key]) => s[key]).map(([, name]) => name)].join(
      ' · ',
    ),
  };
}

/**
 * A row of the public list. A table somebody hosts is theirs by name. One nobody hosts is titled
 * by the name the server sent, and nothing is added to it. The seat count is humans and bots.
 */
export function describeRow(lobby: LobbySummary): { title: string; seats: string; bots: boolean } {
  return {
    title: lobby.hostColor ? `${lobby.hostName}’s table` : lobby.hostName,
    seats: `${lobby.players} of ${lobby.settings.maxPlayers} seats · ${formatName(lobby.settings.format)}`,
    // Left out, the table seats bots.
    bots: lobby.allowBots !== false,
  };
}

const LEVEL = { easy: 'Easy', normal: 'Normal', hard: 'Hard' } as const;

/**
 * The two lines of the rules card in the lobby. A ranked table starts without bots, so its card
 * does not name their skill (`bots: false`).
 */
export function describeSettings(s: GameSettings, { bots = true } = {}): { title: string; detail: string } {
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
      bots ? `${LEVEL[s.botLevel]} bots` : '',
      `${pace} pace`,
      extras.length ? extras.join(', ') : 'No extra cards',
    ]
      .filter(Boolean)
      .join(' · '),
  };
}
