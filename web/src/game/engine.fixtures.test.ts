/* Replays every recorded game in fixtures/engine on this engine (docs/engine-conformance.md §2).
   The Rust engine on the server replays the same files, so the two cannot drift apart unnoticed. */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';
import type { EngineEvent, EngineView, Format, Scoring } from '../protocol/generated';
import { Engine, Rules } from './index';
import type { Action, GameState, Score } from './types';

interface EngineFixture {
  fixture: 1;
  name: string;
  settings: { scoring: Scoring; format: Format; loot: boolean; kraken: boolean; whale: boolean; abilities: boolean };
  players: number;
  dealer: number;
  deals: number[][];
  initial: { views: EngineView[] };
  steps: Step[];
  final: { totals: number[]; scores: Score[][] };
}
type Step =
  | { action: Action; ok: true; events: EngineEvent[]; views: EngineView[] }
  | { action: Action; ok: false; reject: string };

const DIR = fileURLToPath(new URL('../../../fixtures/engine/', import.meta.url));
const FILES = readdirSync(DIR)
  .filter((name) => name.endsWith('.json'))
  .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/** docs/engine-conformance.md §5. */
function rejectCode(error: string): string {
  if (
    ['Not bidding now', 'Seat cannot bid', 'Not your turn', 'No ability to use', 'Nothing to advance'].includes(error)
  )
    return 'NOT_YOUR_TURN';
  if (error === 'Bid out of range') return 'BID_OUT_OF_RANGE';
  return 'ILLEGAL_MOVE';
}

const json = <T>(value: T): unknown => JSON.parse(JSON.stringify(value));

/** EngineView: the offline view without the three static keys a server sends once in game.start. */
function viewsOf(state: GameState): unknown {
  return state.seats.map((_, seat) => {
    const { seats: _seats, cfg: _cfg, deck: _deck, ...view } = Engine.view(state, seat);
    return json(view);
  });
}

/** Deals a round from the fixture instead of the seeded shuffle, the way the server's DealSource is fed in tests. */
function deal(state: GameState, order: number[]): void {
  const n = state.seats.length;
  const cards = state.schedule[state.round];
  state.hands = state.seats.map((_, i) => order.slice(i * cards, (i + 1) * cards));
  state.pile = order.slice(n * cards);
}

function start(fixture: EngineFixture): GameState {
  const seats = Array.from({ length: fixture.players }, (_, i) => ({ name: `P${i}`, color: '#000000', bot: false }));
  const state = Engine.create({ seats, ...fixture.settings, seed: 1 });
  state.dealer = fixture.dealer;
  state.trick = { leader: (fixture.dealer + 1) % fixture.players, plays: [] };
  deal(state, fixture.deals[0]);
  return state;
}

describe('fixtures/engine', () => {
  it('holds the recorded games', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(41);
  });

  it.each(FILES)('%s replays exactly', (file) => {
    const fixture = JSON.parse(readFileSync(DIR + file, 'utf8')) as EngineFixture;
    let state = start(fixture);
    expect(viewsOf(state), 'initial views').toEqual(fixture.initial.views);

    fixture.steps.forEach((step, index) => {
      const result = Engine.reduce(state, step.action);
      if (!step.ok) {
        expect(result.error, `step ${index} should be rejected`).toBeDefined();
        expect(rejectCode(result.error ?? ''), `step ${index} reject code`).toBe(step.reject);
        expect(result.state, `step ${index} changed the state on a rejection`).toBe(state);
        return;
      }
      expect(result.error, `step ${index} should be accepted`).toBeUndefined();
      state = result.state;
      if (result.events.some((e) => e.type === 'roundStarted')) deal(state, fixture.deals[state.round]);
      expect(json(result.events), `step ${index} events`).toEqual(step.events);
      expect(viewsOf(state), `step ${index} views`).toEqual(step.views);
    });

    expect(state.phase).toBe('gameOver');
    expect(Rules.totals(state.log, state.cfg, fixture.players)).toEqual(fixture.final.totals);
    const scores = state.log.map((R) => state.seats.map((_, i) => Rules.scoreSeat(state.cfg, R, i)));
    expect(scores).toEqual(fixture.final.scores);
  });
});
