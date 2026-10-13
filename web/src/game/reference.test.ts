/* Compares this engine with the legacy build itself, move by move.
   The fixtures cover the rules and the reducer; this covers what they cannot: the seeded shuffle,
   the bots (which draw from Math.random) and the scorekeeper's cannonball scoring. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInThisContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import type { AbilityChoice, BotLevel, Format, Scoring } from '../protocol/generated';
import { Bots, Engine, Rules } from './index';
import type { Action, GameState, PlayChoice, ReduceResult, Score, ScoreConfig, ScoreRecord } from './types';

interface Legacy {
  Rules: {
    scoreSeat(cfg: ScoreConfig, R: ScoreRecord, i: number): Score | null;
    totals(log: ScoreRecord[], cfg: ScoreConfig, n: number): number[];
  };
  Engine: {
    create(options: Engine.CreateOptions): GameState;
    reduce(state: GameState, action: Action): ReduceResult;
  };
  Bots: {
    bid(state: GameState, seat: number): number;
    play(state: GameState, seat: number): PlayChoice;
    ability(state: GameState, seat: number): AbilityChoice;
  };
}

/** mulberry32, so both sides can be handed the same stream of "random" numbers. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The legacy side draws from this; each test points it at a stream of its own. */
let legacyRandom: () => number = Math.random;

/** Sections 1–4 of the legacy script (utilities, Rules, Engine, Bots). They touch no DOM. */
function loadLegacy(): Legacy {
  const path = fileURLToPath(new URL('../../../legacy/Skull King Tavern.html', import.meta.url));
  const html = readFileSync(path, 'utf8');
  const from = html.indexOf('/* ---------- 1. Utilities ---------- */');
  const to = html.indexOf('/* ---------- 5. Local table (transport) ---------- */');
  const math: Math = Object.create(Math) as Math;
  math.random = () => legacyRandom();
  // The legacy script is the reference itself, read from this repo.
  const source = `(function (Math) { "use strict";${html.slice(from, to)}\nreturn { Rules, Engine, Bots }; })`;
  const factory = runInThisContext(source, { filename: 'Skull King Tavern.html' }) as (math: Math) => Legacy;
  return factory(math);
}

const legacy = loadLegacy();
const FORMATS: Format[] = ['classic', 'brawl', 'swift', 'even', 'whirl'];
const LEVELS: BotLevel[] = ['easy', 'normal', 'hard'];
const SCORINGS: Scoring[] = ['classic', 'rascal'];
const seatsFor = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `Bot ${i}`, color: '#1cb0f6', bot: true }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reference: the legacy build', () => {
  it('deals the same game from the same seed', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const options: Engine.CreateOptions = {
        seats: seatsFor(2 + (seed % 7)),
        scoring: SCORINGS[seed % 2],
        format: FORMATS[seed % 5],
        loot: seed % 2 === 0,
        kraken: seed % 3 === 0,
        whale: seed % 5 === 0,
        abilities: seed % 2 === 1,
        level: LEVELS[seed % 3],
        seed: seed * 7919,
      };
      expect(Engine.create(options)).toEqual(legacy.Engine.create(options));
    }
  });

  // 36 games, and both engines' whole state compared after each of some 3000 moves: two seconds of
  // work on a free core, and several times that on a busy machine. The runner's five seconds are
  // not for this.
  it('plays whole bot games identically, decision by decision', { timeout: 60_000 }, () => {
    let decisions = 0;
    for (let game = 0; game < 36; game++) {
      const mine = seeded(1000 + game);
      legacyRandom = seeded(1000 + game);
      vi.spyOn(Math, 'random').mockImplementation(mine);
      let state = Engine.create({
        seats: seatsFor(2 + (game % 7)),
        scoring: SCORINGS[game % 2],
        format: game % 4 === 0 ? 'brawl' : 'swift',
        loot: true,
        kraken: true,
        whale: true,
        abilities: true,
        level: LEVELS[game % 3],
        seed: 31 * (game + 1),
      });
      for (let guard = 0; state.phase !== 'gameOver'; guard++) {
        expect(guard).toBeLessThan(5000);
        let action: Action;
        if (state.phase === 'bidding') {
          const seat = state.bids.findIndex((b) => b == null);
          const bid = Bots.bid(state, seat);
          expect(bid).toBe(legacy.Bots.bid(state, seat));
          action = { type: 'bid', seat, bid };
          decisions++;
        } else if (state.phase === 'playing' && state.turn != null) {
          const choice = Bots.play(state, state.turn);
          expect(choice).toEqual(legacy.Bots.play(state, state.turn));
          action = { type: 'play', seat: state.turn, ...choice };
          decisions++;
        } else if (state.phase === 'ability' && state.pending) {
          const seat = state.pending.seat;
          const choice = Bots.ability(state, seat);
          expect(choice).toEqual(legacy.Bots.ability(state, seat));
          action = { type: 'ability', seat, choice };
          decisions++;
        } else {
          action = { type: 'advance' };
        }
        const next = Engine.reduce(state, action);
        const reference = legacy.Engine.reduce(state, action);
        expect(next.error).toBeUndefined();
        expect(next.events).toEqual(reference.events);
        expect(next.state).toEqual(reference.state);
        state = next.state;
      }
    }
    expect(decisions).toBeGreaterThan(3000);
  });

  it('scores a round identically, cannonball included', () => {
    const random = seeded(77);
    const int = (n: number): number => Math.floor(random() * n);
    for (let round = 0; round < 400; round++) {
      const n = 2 + int(7);
      const cards = 1 + int(10);
      const list = (make: () => number): number[] => Array.from({ length: n }, make);
      const record: ScoreRecord = {
        ...Rules.newRecord(n, cards),
        bids: list(() => int(cards + 1)),
        tricks: list(() => int(cards + 1)),
        b14: list(() => int(3)),
        mp: list(() => int(2)),
        ps: list(() => int(3)),
        wager: list(() => [0, 10, 20][int(3)]),
        black14: int(n + 1) - 1,
        sm: int(n + 1) - 1,
        loot: int(3) === 0 ? [{ from: int(n), to: int(n) }] : [],
        cannon: list(() => int(2)).map((x) => x === 1),
        done: true,
      };
      for (const scoring of SCORINGS) {
        for (const cannonball of [false, true]) {
          const cfg: ScoreConfig = { scoring, cannonball };
          for (let i = 0; i < n; i++) {
            expect(Rules.scoreSeat(cfg, record, i)).toEqual(legacy.Rules.scoreSeat(cfg, record, i));
          }
          expect(Rules.totals([record], cfg, n)).toEqual(legacy.Rules.totals([record], cfg, n));
        }
      }
    }
  });
});
