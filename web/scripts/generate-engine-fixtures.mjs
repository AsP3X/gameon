#!/usr/bin/env node
/* =====================================================================
   Engine fixture generator (docs/engine-conformance.md §2).

   Runs the reference engine straight out of the legacy HTML file and
   records complete games to fixtures/engine/*.json. The Rust engine has
   to replay every one of them exactly.

     node web/scripts/generate-engine-fixtures.mjs           write the fixtures
     node web/scripts/generate-engine-fixtures.mjs --check   fail if the files on disk differ

   The run is deterministic: every random choice, including the legacy
   bots' Math.random, comes from one seeded generator per game. The same
   reference file always produces the same bytes.

   No dependencies, so it runs before web/ has a package.json.
   ===================================================================== */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInThisContext } from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'fixtures/engine');
const LEGACY_NAME = 'Skull King Tavern.html';
/** The reference is frozen. A different hash means the rules changed and the fixtures must be regenerated on purpose. */
const LEGACY_SHA256 = '24f29504f63a47ec5593a0148e4289f8e15f847f2749875ef3a57e48efbdda87';

/* ---------- 1. The reference engine ---------- */

/** mulberry32. Only drives the generator's choices; the deal each game used is recorded in the fixture. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The generator of the game being recorded. The legacy code's Math.random reads it too. */
let random = seeded(1);

/** Evaluates sections 1–4 of the legacy script (utilities, Rules, Engine, Bots). They touch no DOM. */
function loadReference() {
  const path = [join(ROOT, 'legacy', LEGACY_NAME), join(ROOT, LEGACY_NAME)].find(existsSync);
  if (!path) throw new Error(`${LEGACY_NAME} not found at the repo root or in legacy/`);
  const html = readFileSync(path, 'utf8');
  const sha = createHash('sha256').update(html).digest('hex');
  if (sha !== LEGACY_SHA256) {
    throw new Error(
      `${LEGACY_NAME} has changed (sha256 ${sha}).\n` +
        'The fixtures pin the reference. If the rules changed on purpose, update LEGACY_SHA256 and regenerate.',
    );
  }
  const from = html.indexOf('/* ---------- 1. Utilities ---------- */');
  const to = html.indexOf('/* ---------- 5. Local table (transport) ---------- */');
  if (from < 0 || to < from) throw new Error('could not find the engine sections in the legacy file');
  const math = Object.create(Math);
  math.random = () => random();
  // The legacy script is the reference itself, read from this repo and pinned by hash above.
  const source = `(function (Math) { "use strict";${html.slice(from, to)}\nreturn { Rules, Engine, Bots }; })`;
  return runInThisContext(source, { filename: LEGACY_NAME })(math);
}

const { Rules, Engine, Bots } = loadReference();

/* ---------- 2. Small helpers ---------- */

const json = (v) => JSON.parse(JSON.stringify(v));
/** The order Array.prototype.sort uses for strings by default, spelled out. */
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const int = (n) => Math.floor(random() * n);
const pick = (list) => list[int(list.length)];
const chance = (p) => random() < p;
function sample(list, count) {
  const pool = list.slice();
  const out = [];
  while (out.length < count && pool.length) out.push(pool.splice(int(pool.length), 1)[0]);
  return out;
}

/** EngineView (§3): the legacy view without the three static keys the server sends once in game.start. */
function engineView(state, seat) {
  const { seats: _seats, cfg: _cfg, deck: _deck, ...view } = Engine.view(state, seat);
  return json(view);
}
const viewsOf = (state) => state.seats.map((_, seat) => engineView(state, seat));

/** The deck order this round was dealt from: the hands in seat order, then the undealt pile. */
const dealOf = (state) => state.hands.flat().concat(state.pile);

const REJECT = {
  'Not bidding now': 'NOT_YOUR_TURN',
  'Seat cannot bid': 'NOT_YOUR_TURN',
  'Not your turn': 'NOT_YOUR_TURN',
  'No ability to use': 'NOT_YOUR_TURN',
  'Nothing to advance': 'NOT_YOUR_TURN',
  'Bid out of range': 'BID_OUT_OF_RANGE',
  'Card not in hand': 'ILLEGAL_MOVE',
  'Must follow suit': 'ILLEGAL_MOVE',
  'Choose Pirate or Escape': 'ILLEGAL_MOVE',
  'Pick a pirate to lead': 'ILLEGAL_MOVE',
  'Bet 0, 10 or 20': 'ILLEGAL_MOVE',
  'Change by 1 or keep': 'ILLEGAL_MOVE',
  'Unknown action': 'ILLEGAL_MOVE',
};
function rejectCode(error) {
  if (REJECT[error]) return REJECT[error];
  if (error.startsWith('Discard exactly')) return 'ILLEGAL_MOVE';
  throw new Error(`unmapped reference error: ${error}`);
}

/* ---------- 3. Scenarios ---------- */

const EXPANSIONS = {
  base: {},
  loot: { loot: true },
  kraken: { kraken: true },
  whale: { whale: true },
  abilities: { abilities: true },
  beasts: { kraken: true, whale: true },
  'kraken-abilities': { kraken: true, abilities: true },
  'loot-abilities': { loot: true, abilities: true },
  all: { loot: true, kraken: true, whale: true, abilities: true },
};

/** [players, scoring, format, expansions, seeds to try]. Long formats sit at low player counts to keep the files small. */
const SCENARIOS = [
  [2, 'classic', 'classic', 'all'],
  [2, 'rascal', 'even', 'base'],
  [2, 'classic', 'whirl', 'abilities'],
  [2, 'rascal', 'brawl', 'all'],
  [2, 'classic', 'swift', 'loot'],
  [2, 'rascal', 'classic', 'beasts'],
  [3, 'classic', 'classic', 'base'],
  [3, 'rascal', 'whirl', 'all'],
  [3, 'classic', 'even', 'kraken-abilities'],
  [3, 'rascal', 'swift', 'whale'],
  [3, 'classic', 'brawl', 'kraken'],
  [3, 'classic', 'swift', 'all'],
  [4, 'classic', 'brawl', 'base'], // the standard ruleset of quick play and ranked
  [4, 'rascal', 'brawl', 'all'],
  [4, 'classic', 'classic', 'all'],
  [4, 'classic', 'swift', 'abilities'],
  [4, 'rascal', 'swift', 'loot'],
  [4, 'classic', 'swift', 'kraken'],
  [4, 'classic', 'swift', 'whale'],
  [4, 'rascal', 'swift', 'beasts'],
  [4, 'classic', 'swift', 'loot-abilities'],
  [4, 'classic', 'swift', 'all'],
  [4, 'rascal', 'swift', 'all'],
  [5, 'classic', 'swift', 'all'],
  [5, 'rascal', 'swift', 'base'],
  [5, 'classic', 'brawl', 'all'],
  [5, 'rascal', 'swift', 'abilities'],
  [5, 'classic', 'swift', 'beasts'],
  [6, 'classic', 'swift', 'all'],
  [6, 'rascal', 'swift', 'all'],
  [6, 'classic', 'swift', 'base'],
  [6, 'rascal', 'swift', 'loot-abilities'],
  [7, 'classic', 'swift', 'all'],
  [7, 'rascal', 'swift', 'all'],
  [7, 'classic', 'brawl', 'abilities', 60], // 70 cards, 7 x 10: the last round has an empty pile
  [7, 'rascal', 'brawl', 'kraken-abilities', 60], // 71 cards: the last round has a one-card pile
  [8, 'classic', 'swift', 'all'],
  [8, 'rascal', 'swift', 'all'],
  [8, 'classic', 'brawl', 'base'], // 70 cards for 8: the schedule is capped at 8 cards
  [8, 'rascal', 'swift', 'abilities'],
  [8, 'classic', 'classic', 'all'], // 74 cards for 8: the classic schedule is capped at 9 cards
].map(([players, scoring, format, expansions, tries]) => ({
  players,
  scoring,
  format,
  expansions,
  tries: tries ?? 16,
}));

/** Small, eventful games used to fill coverage rows the main list left open. */
const BOOSTERS = [
  { players: 2, scoring: 'classic', format: 'swift', expansions: 'all' },
  { players: 3, scoring: 'rascal', format: 'swift', expansions: 'all' },
  { players: 4, scoring: 'classic', format: 'swift', expansions: 'all' },
  { players: 2, scoring: 'rascal', format: 'brawl', expansions: 'all' },
  { players: 3, scoring: 'classic', format: 'brawl', expansions: 'all' },
];
const BOOSTER_SEEDS = 400;
const MAX_BOOSTERS = 12;

/* ---------- 4. Coverage ---------- */

/** Every row here must be filled by at least one fixture, or the run fails. */
const REQUIRED = [
  ...[2, 3, 4, 5, 6, 7, 8].map((n) => `players:${n}`),
  ...Object.keys(Rules.FORMATS).map((f) => `format:${f}`),
  'scoring:classic',
  'scoring:rascal',
  ...['base', 'loot', 'kraken', 'whale', 'abilities', 'all'].map((e) => `expansions:${e}`),
  'schedule:capped',
  'schedule:capped:brawl:8', // 8 players, 70 cards: 6,7,8,8,8
  'schedule:capped:classic:9', // 8 players, 74 cards: 1,2,3,4,5,6,7,8,9,9
  // tricks
  'trick:kraken',
  'trick:whale-number-wins',
  'trick:whale-destroyed',
  'trick:both-beasts-kraken-last',
  'trick:both-beasts-whale-last',
  'trick:all-escapes',
  'trick:black-trumps',
  'trick:two-pirates-first-wins',
  'lead:character-no-suit',
  'lead:escape-then-suit',
  'tigress:as-pirate',
  'tigress:as-escape',
  'tigress:pirate-wins-no-ability',
  // captures
  'capture:mermaid-catches-skull-king',
  'capture:skull-king-takes-pirate',
  'capture:skull-king-takes-tigress-pirate',
  'capture:pirate-takes-mermaid',
  'capture:colour-14',
  'capture:black-14',
  'loot:alliance',
  'loot:bonus-paid',
  'loot:bonus-missed',
  // abilities, every choice
  'helm:self',
  'helm:other',
  'smuggler:draw-2',
  'smuggler:draw-1',
  'gambler:0',
  'gambler:10',
  'gambler:20',
  'gambler:on-last-trick',
  'seer:used',
  'giant:-1',
  'giant:0',
  'giant:1',
  'ability:helm:skipped-last-trick',
  'ability:smuggler:skipped-last-trick',
  'ability:seer:skipped-last-trick',
  'ability:smuggler:skipped-empty-pile',
  'ability:seer:skipped-empty-pile',
  // scoring
  'score:classic-zero-hit',
  'score:classic-zero-miss',
  'score:classic-hit',
  'score:classic-miss',
  'score:rascal-hit',
  'score:rascal-glance',
  'score:rascal-miss',
  'score:bonus-paid',
  'score:bonus-forfeited',
  'score:rascal-half-bonus',
  'score:wager-won',
  'score:wager-lost',
  // accepted oddities of the reference
  'quirk:as-on-plain-card',
  'quirk:seer-any-choice',
  // rejections
  'reject:NOT_YOUR_TURN:bid-twice',
  'reject:NOT_YOUR_TURN:bid-bad-seat',
  'reject:NOT_YOUR_TURN:bid-out-of-range-after-bidding',
  'reject:NOT_YOUR_TURN:bid-while-playing',
  'reject:NOT_YOUR_TURN:play-while-bidding',
  'reject:NOT_YOUR_TURN:play-out-of-turn',
  'reject:NOT_YOUR_TURN:play-out-of-turn-foreign-card',
  'reject:NOT_YOUR_TURN:ability-none-pending',
  'reject:NOT_YOUR_TURN:ability-wrong-seat',
  'reject:NOT_YOUR_TURN:play-during-ability',
  'reject:NOT_YOUR_TURN:advance-nothing',
  'reject:NOT_YOUR_TURN:act-at-trick-end',
  'reject:NOT_YOUR_TURN:act-at-round-end',
  'reject:NOT_YOUR_TURN:after-game-over',
  'reject:BID_OUT_OF_RANGE:negative',
  'reject:BID_OUT_OF_RANGE:too-high',
  'reject:ILLEGAL_MOVE:card-not-in-hand',
  'reject:ILLEGAL_MOVE:card-unknown',
  'reject:ILLEGAL_MOVE:must-follow-suit',
  'reject:ILLEGAL_MOVE:tigress-without-as',
  'reject:ILLEGAL_MOVE:tigress-bad-as',
  'reject:ILLEGAL_MOVE:helm-bad-seat',
  'reject:ILLEGAL_MOVE:helm-wrong-type',
  'reject:ILLEGAL_MOVE:smuggler-wrong-count',
  'reject:ILLEGAL_MOVE:smuggler-duplicate',
  'reject:ILLEGAL_MOVE:smuggler-not-in-hand',
  'reject:ILLEGAL_MOVE:smuggler-wrong-type',
  'reject:ILLEGAL_MOVE:gambler-bad-bet',
  'reject:ILLEGAL_MOVE:gambler-wrong-type',
  'reject:ILLEGAL_MOVE:giant-bad-change',
  'reject:ILLEGAL_MOVE:giant-out-of-bounds',
  'reject:ILLEGAL_MOVE:giant-wrong-type',
];

/* ---------- 5. Recording one game ---------- */

const PERSONAS = ['bot-easy', 'bot-normal', 'bot-hard', 'random', 'chaos'];

/**
 * Plays one complete game on the reference engine and returns the fixture plus the coverage rows it fills.
 * Seats act through a mix of the legacy bots and random or deliberately odd choices, and now and then
 * someone tries something the engine must refuse.
 */
function record(scenario, seed) {
  random = seeded(seed);
  const flags = EXPANSIONS[scenario.expansions];
  const settings = {
    scoring: scenario.scoring,
    format: scenario.format,
    loot: !!flags.loot,
    kraken: !!flags.kraken,
    whale: !!flags.whale,
    abilities: !!flags.abilities,
  };
  const n = scenario.players;
  const seats = Array.from({ length: n }, (_, i) => ({ name: `P${i}`, color: '#000000', bot: false }));
  let state = Engine.create({ seats, ...settings, level: 'normal', seed: int(2 ** 32) });
  const deck = state.deck;
  const personas = seats.map(() => pick(PERSONAS));
  const cover = new Set();
  const steps = [];
  const dealer = state.dealer;
  const deals = [dealOf(state)];
  const initial = { views: viewsOf(state) };

  cover.add(`players:${n}`).add(`format:${settings.format}`).add(`scoring:${settings.scoring}`);
  cover.add(`expansions:${scenario.expansions}`);
  if (state.schedule.some((cards, r) => cards < Rules.FORMATS[settings.format].seq[r])) {
    cover.add('schedule:capped').add(`schedule:capped:${settings.format}:${Math.max(...state.schedule)}`);
  }

  const kind = (id) => deck[id].kind;
  const roleOf = (play) => Rules.role(deck[play.card], play.as);
  const withLevel = (level) => Object.assign({}, state, { cfg: Object.assign({}, state.cfg, { level }) });

  /** Applies an action that must be accepted. */
  function accept(action, tag) {
    const before = state;
    const result = Engine.reduce(state, action);
    if (result.error) throw new Error(`${JSON.stringify(action)} was rejected: ${result.error}`);
    state = result.state;
    const events = json(result.events);
    steps.push({ action, ok: true, events, views: viewsOf(state) });
    if (events.some((e) => e.type === 'roundStarted')) deals.push(dealOf(state));
    if (tag) cover.add(tag);
    observe(before, action, events);
  }

  /** Applies an action that must be refused, and checks the refusal changed nothing. */
  function refuse(action, tag) {
    const result = Engine.reduce(state, action);
    if (!result.error) throw new Error(`${JSON.stringify(action)} should have been rejected (${tag})`);
    if (result.state !== state) throw new Error('a rejection replaced the state');
    const reject = rejectCode(result.error);
    steps.push({ action, ok: false, reject });
    cover.add(`reject:${reject}:${tag}`);
  }

  /** Coverage rows filled by an accepted step. */
  function observe(before, action, events) {
    for (const e of events) {
      if (e.type === 'trickResolved') observeTrick(e);
      if (e.type === 'abilityUsed') {
        if (e.kind === 'helm') cover.add(e.choice === e.seat ? 'helm:self' : 'helm:other');
        if (e.kind === 'smuggler') cover.add(`smuggler:draw-${e.count}`);
        if (e.kind === 'gambler') cover.add(`gambler:${e.choice}`);
        if (e.kind === 'seer') cover.add('seer:used');
        if (e.kind === 'giant') cover.add(`giant:${e.choice}`);
      }
      if (e.type === 'abilityStarted' && e.kind === 'gambler' && before.hands[0].length === 0) {
        cover.add('gambler:on-last-trick');
      }
      if (e.type === 'roundEnded') observeScores(e.round);
    }
    // A pirate won the trick but its ability did not open: say why.
    if (action.type === 'advance' && before.phase === 'trickEnd') {
      const ability = before.lastTrick.ability;
      const opened = events.some((e) => e.type === 'abilityStarted' && e.kind === ability);
      if (ability && !opened && ['helm', 'smuggler', 'seer'].includes(ability)) {
        const last = before.hands[0].length === 0;
        cover.add(`ability:${ability}:skipped-${last ? 'last-trick' : 'empty-pile'}`);
      }
    }
  }

  function observeTrick(event) {
    const { plays, result } = state.lastTrick;
    const roles = plays.map(roleOf);
    const beasts = plays.filter((p) => ['kraken', 'whale'].includes(kind(p.card)));
    if (result.effect === 'kraken') cover.add('trick:kraken');
    if (result.effect === 'whale')
      cover.add(result.winner == null ? 'trick:whale-destroyed' : 'trick:whale-number-wins');
    if (beasts.length === 2) cover.add(`trick:both-beasts-${result.effect}-last`);
    if (roles.every((r) => r === 'escape')) cover.add('trick:all-escapes');
    plays.forEach((p) => {
      if (kind(p.card) === 'tigress') cover.add(`tigress:as-${p.as}`);
    });
    const first = plays.findIndex((p) => roleOf(p) !== 'escape');
    if (first >= 0 && kind(plays[first].card) !== 'num') cover.add('lead:character-no-suit');
    if (first > 0 && kind(plays[first].card) === 'num') cover.add('lead:escape-then-suit');
    const c = result.captures;
    if (c.sm) cover.add('capture:mermaid-catches-skull-king');
    if (c.ps) cover.add('capture:skull-king-takes-pirate');
    if (c.ps && plays.some((p) => kind(p.card) === 'tigress' && p.as === 'pirate')) {
      cover.add('capture:skull-king-takes-tigress-pirate');
    }
    if (c.mp) cover.add('capture:pirate-takes-mermaid');
    if (c.b14) cover.add('capture:colour-14');
    if (c.black14) cover.add('capture:black-14');
    if (result.loot.length) cover.add('loot:alliance');
    if (result.winner != null && !result.effect) {
      const won = plays[result.winIndex];
      const wonCard = deck[won.card];
      if (roles[result.winIndex] === 'pirate' && roles.filter((r) => r === 'pirate').length > 1) {
        cover.add('trick:two-pirates-first-wins');
      }
      if (wonCard.kind === 'tigress' && state.cfg.abilities && event.ability == null) {
        cover.add('tigress:pirate-wins-no-ability');
      }
      const lead = Rules.leadSuit(plays, deck);
      if (wonCard.kind === 'num' && wonCard.suit === 'black' && lead && lead !== 'black')
        cover.add('trick:black-trumps');
    }
  }

  function observeScores(round) {
    const R = state.log[round];
    const hit = (i) => R.bids[i] === R.tricks[i];
    R.loot.forEach((l) => cover.add(hit(l.from) && hit(l.to) ? 'loot:bonus-paid' : 'loot:bonus-missed'));
    for (let i = 0; i < n; i++) {
      const s = Rules.scoreSeat(state.cfg, R, i);
      const captured = R.b14[i] || R.mp[i] || R.ps[i] || R.black14 === i || R.sm === i;
      if (settings.scoring === 'classic') {
        if (R.bids[i] === 0) cover.add(s.hit ? 'score:classic-zero-hit' : 'score:classic-zero-miss');
        else cover.add(s.hit ? 'score:classic-hit' : 'score:classic-miss');
      } else {
        cover.add(`score:rascal-${s.kind}`);
        if (s.kind === 'glance' && s.bonus > 0) cover.add('score:rascal-half-bonus');
      }
      if (s.bonus > 0) cover.add('score:bonus-paid');
      if (captured && s.bonus === 0) cover.add('score:bonus-forfeited');
      if (s.wager > 0) cover.add('score:wager-won');
      if (s.wager < 0) cover.add('score:wager-lost');
    }
  }

  /* --- what a seat does when it plays by the rules --- */

  function chooseBid(seat) {
    const cards = state.schedule[state.round];
    const persona = personas[seat];
    if (persona.startsWith('bot-')) return Bots.bid(withLevel(persona.slice(4)), seat);
    const roll = random();
    if (roll < 0.25) return 0;
    if (roll < 0.32) return cards;
    return int(Math.min(cards, Math.ceil(cards / n) + 2) + 1);
  }

  /** Every legal play of the seat to move, the Tigress in both of her roles. */
  function playOptions(seat) {
    const out = [];
    for (const card of Rules.legal(state.hands[seat], state.trick.plays, deck)) {
      if (kind(card) === 'tigress') out.push({ card, as: 'pirate' }, { card, as: 'escape' });
      else out.push({ card });
    }
    return out;
  }

  /** Plays that make something rare happen: both beasts in one trick, a capture, a trick of escapes. */
  function eventfulPlay(seat, options) {
    const plays = state.trick.plays;
    const roles = plays.map(roleOf);
    const kinds = plays.map((p) => kind(p.card));
    const holding = (k) => options.find((o) => kind(o.card) === k);
    const beast = kinds.includes('kraken') ? holding('whale') : kinds.includes('whale') ? holding('kraken') : null;
    if (beast && chance(0.85)) return beast;
    if (roles.includes('sk') && !roles.includes('mermaid') && holding('mermaid') && chance(0.7))
      return holding('mermaid');
    if (roles.includes('pirate') && !roles.includes('sk') && holding('sk') && chance(0.6)) return holding('sk');
    if (roles.includes('pirate') && !roles.includes('sk') && chance(0.3)) {
      const second = holding('pirate') || options.find((o) => o.as === 'pirate');
      if (second) return second;
    }
    if (roles.includes('mermaid') && !roles.includes('pirate') && !roles.includes('sk') && chance(0.4)) {
      const pirate = holding('pirate') || options.find((o) => o.as === 'pirate');
      if (pirate) return pirate;
    }
    if (roles.length && roles.every((r) => r === 'escape') && chance(0.5)) {
      const escape = holding('escape') || holding('loot') || options.find((o) => o.as === 'escape');
      if (escape) return escape;
    }
    if (!plays.length && chance(0.25)) {
      const lead = holding('kraken') || holding('whale') || holding('escape');
      if (lead) return lead;
    }
    if (holding('loot') && chance(0.15)) return holding('loot');
    return null;
  }

  function choosePlay(seat) {
    const options = playOptions(seat);
    const eventful = eventfulPlay(seat, options);
    if (eventful) return eventful;
    const persona = personas[seat];
    if (persona.startsWith('bot-')) return Bots.play(withLevel(persona.slice(4)), seat);
    return pick(options);
  }

  function chooseAbility() {
    const p = state.pending;
    const seat = p.seat;
    if (personas[seat].startsWith('bot-') && chance(0.4)) return Bots.ability(state, seat);
    switch (p.kind) {
      case 'helm':
        return chance(0.3) ? seat : int(n);
      case 'smuggler':
        return sample(state.hands[seat], p.drawn.length);
      case 'gambler':
        return pick([0, 10, 20]);
      case 'giant': {
        const bid = state.bids[seat];
        const cards = state.schedule[state.round];
        return pick([-1, 0, 1].filter((d) => bid + d >= 0 && bid + d <= cards));
      }
      default:
        return null;
    }
  }

  /* --- what the engine must refuse --- */

  /** Tries a few things that are not allowed in the current phase. Each one is recorded as a rejected step. */
  function misbehave() {
    const cards = state.schedule[state.round];
    const anyCard = (seat) => state.hands[seat][0];
    const attempts = [];
    const add = (tag, action) => attempts.push([tag, action]);

    if (state.phase !== 'trickEnd' && state.phase !== 'roundEnd') add('advance-nothing', { type: 'advance' });

    if (state.phase === 'bidding') {
      const done = state.bids.findIndex((b) => b != null);
      const open = state.bids.findIndex((b) => b == null);
      if (done >= 0) add('bid-twice', { type: 'bid', seat: done, bid: 0 });
      if (done >= 0) add('bid-out-of-range-after-bidding', { type: 'bid', seat: done, bid: cards + 3 });
      add('bid-bad-seat', { type: 'bid', seat: n, bid: 0 });
      if (open >= 0) add('negative', { type: 'bid', seat: open, bid: -1 });
      if (open >= 0) add('too-high', { type: 'bid', seat: open, bid: cards + 1 });
      add('play-while-bidding', { type: 'play', seat: state.trick.leader, card: anyCard(state.trick.leader) });
      add('ability-none-pending', { type: 'ability', seat: int(n), choice: 0 });
    }

    if (state.phase === 'playing') {
      const seat = state.turn;
      const other = (seat + 1 + int(n - 1)) % n;
      const hand = state.hands[seat];
      const legal = Rules.legal(hand, state.trick.plays, deck);
      add('bid-while-playing', { type: 'bid', seat, bid: 0 });
      add('ability-none-pending', { type: 'ability', seat, choice: null });
      if (state.hands[other].length) {
        add('play-out-of-turn', { type: 'play', seat: other, card: anyCard(other) });
        add('play-out-of-turn-foreign-card', { type: 'play', seat: other, card: anyCard(seat) });
        add('card-not-in-hand', { type: 'play', seat, card: anyCard(other) });
      }
      add('card-unknown', { type: 'play', seat, card: 99 });
      const offSuit = hand.find((id) => !legal.includes(id));
      if (offSuit != null) add('must-follow-suit', { type: 'play', seat, card: offSuit });
      const tigress = hand.find((id) => kind(id) === 'tigress');
      if (tigress != null) {
        add('tigress-without-as', { type: 'play', seat, card: tigress });
        add('tigress-bad-as', { type: 'play', seat, card: tigress, as: 'kraken' });
      }
    }

    if (state.phase === 'trickEnd' || state.phase === 'roundEnd') {
      const tag = state.phase === 'trickEnd' ? 'act-at-trick-end' : 'act-at-round-end';
      const seat = int(n);
      add(
        tag,
        pick([
          { type: 'bid', seat, bid: 0 },
          { type: 'play', seat, card: state.hands[seat][0] ?? 0 },
          { type: 'ability', seat, choice: 0 },
        ]),
      );
    }

    if (state.phase === 'ability') {
      const p = state.pending;
      const seat = p.seat;
      const other = (seat + 1 + int(n - 1)) % n;
      const hand = state.hands[seat];
      add('ability-wrong-seat', { type: 'ability', seat: other, choice: chooseAbility() });
      if (hand.length) add('play-during-ability', { type: 'play', seat, card: hand[0] });
      if (p.kind === 'helm') {
        add('helm-bad-seat', { type: 'ability', seat, choice: pick([n, -1, 200]) });
        add('helm-wrong-type', { type: 'ability', seat, choice: pick([null, [0]]) });
      }
      if (p.kind === 'smuggler') {
        const count = p.drawn.length;
        add('smuggler-wrong-count', { type: 'ability', seat, choice: sample(hand, pick([count - 1, count + 1])) });
        if (count === 2) add('smuggler-duplicate', { type: 'ability', seat, choice: [hand[0], hand[0]] });
        const foreign = deck.map((c) => c.id).filter((id) => !hand.includes(id));
        add('smuggler-not-in-hand', { type: 'ability', seat, choice: sample(foreign, count) });
        add('smuggler-wrong-type', { type: 'ability', seat, choice: pick([null, hand[0]]) });
      }
      if (p.kind === 'gambler') {
        add('gambler-bad-bet', { type: 'ability', seat, choice: pick([5, 30, -10, 1]) });
        add('gambler-wrong-type', { type: 'ability', seat, choice: pick([null, [10]]) });
      }
      if (p.kind === 'giant') {
        const bid = state.bids[seat];
        add('giant-bad-change', { type: 'ability', seat, choice: pick([2, -2, 10]) });
        add('giant-wrong-type', { type: 'ability', seat, choice: pick([null, [1]]) });
        if (bid === 0) add('giant-out-of-bounds', { type: 'ability', seat, choice: -1 });
        if (bid === cards) add('giant-out-of-bounds', { type: 'ability', seat, choice: 1 });
      }
    }

    const tries = state.phase === 'ability' ? attempts.length : Math.min(attempts.length, 1 + int(2));
    for (const [tag, action] of sample(attempts, tries)) refuse(action, tag);
  }

  /* --- the game loop --- */

  let guard = 0;
  while (state.phase !== 'gameOver') {
    if (++guard > 5000) throw new Error('the game does not end');
    // Abilities are rare, so every one of them is probed; elsewhere about one step in six.
    if (state.phase === 'ability' ? chance(0.8) : chance(0.16)) misbehave();

    if (state.phase === 'bidding') {
      const open = state.bids.map((b, i) => (b == null ? i : -1)).filter((i) => i >= 0);
      const seat = pick(open);
      accept({ type: 'bid', seat, bid: chooseBid(seat) });
    } else if (state.phase === 'playing') {
      const seat = state.turn;
      const choice = choosePlay(seat);
      const action = { type: 'play', seat, card: choice.card };
      if (choice.as) action.as = choice.as;
      // The reference ignores `as` on any card but the Tigress.
      if (!choice.as && chance(0.03)) accept({ ...action, as: pick(['pirate', 'escape']) }, 'quirk:as-on-plain-card');
      else accept(action);
    } else if (state.phase === 'ability') {
      const p = state.pending;
      // The reference accepts any choice for the Seer and stores nothing.
      if (p.kind === 'seer' && chance(0.3))
        accept({ type: 'ability', seat: p.seat, choice: pick([7, [1, 2]]) }, 'quirk:seer-any-choice');
      else accept({ type: 'ability', seat: p.seat, choice: chooseAbility() });
    } else {
      accept({ type: 'advance' });
    }
  }
  for (const action of [{ type: 'advance' }, { type: 'bid', seat: 0, bid: 0 }, { type: 'play', seat: 0, card: 0 }]) {
    refuse(action, 'after-game-over');
  }

  const fixture = {
    fixture: 1,
    name: `${n}p-${settings.scoring}-${settings.format}-${scenario.expansions}-${String(seed).padStart(4, '0')}`,
    settings,
    players: n,
    dealer,
    deals,
    initial,
    steps,
    final: {
      totals: Rules.totals(state.log, state.cfg, n),
      scores: state.log.map((R) => seats.map((_, i) => json(Rules.scoreSeat(state.cfg, R, i)))),
    },
  };
  return { fixture, cover };
}

/* ---------- 6. Replay check ----------
   A fixture must be enough to reproduce the game: dealer + deals + actions, nothing from the seed.
   This replays each one on the reference with the deal forced from the fixture, the way the Rust
   harness does with its DealSource. */

function replay(fixture) {
  const n = fixture.players;
  const seats = Array.from({ length: n }, (_, i) => ({ name: `P${i}`, color: '#000000', bot: false }));
  let state = Engine.create({ seats, ...fixture.settings, level: 'normal', seed: 12345 });
  const deal = (round) => {
    const order = fixture.deals[round];
    const cards = state.schedule[round];
    state.hands = seats.map((_, i) => order.slice(i * cards, (i + 1) * cards));
    state.pile = order.slice(n * cards);
  };
  state.dealer = fixture.dealer;
  state.trick = { leader: (fixture.dealer + 1) % n, plays: [] };
  deal(0);
  const same = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
  if (!same(viewsOf(state), fixture.initial.views)) throw new Error(`${fixture.name}: initial views differ on replay`);
  fixture.steps.forEach((step, index) => {
    const result = Engine.reduce(state, step.action);
    if (!!result.error === step.ok)
      throw new Error(`${fixture.name} step ${index}: accepted/rejected differs on replay`);
    if (result.error) {
      if (rejectCode(result.error) !== step.reject)
        throw new Error(`${fixture.name} step ${index}: reject code differs`);
      return;
    }
    state = result.state;
    if (result.events.some((e) => e.type === 'roundStarted')) deal(state.round);
    if (!same(json(result.events), step.events))
      throw new Error(`${fixture.name} step ${index}: events differ on replay`);
    if (!same(viewsOf(state), step.views)) throw new Error(`${fixture.name} step ${index}: views differ on replay`);
  });
  if (!same(Rules.totals(state.log, state.cfg, n), fixture.final.totals))
    throw new Error(`${fixture.name}: totals differ on replay`);
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.keys(v)
        .sort(byCodeUnit)
        .map((k) => [k, sortKeys(v[k])]),
    );
  return v;
}

/* ---------- 7. Choosing the set ---------- */

function build() {
  const required = new Set(REQUIRED);
  const covered = new Set();
  const chosen = [];
  const gain = (cover) => [...cover].filter((tag) => required.has(tag) && !covered.has(tag)).length;
  const take = (game) => {
    chosen.push(game);
    game.cover.forEach((tag) => covered.add(tag));
  };

  // One game per scenario: of the seeds tried, the one that fills the most open rows (the lowest seed on a tie).
  SCENARIOS.forEach((scenario, index) => {
    let best = null;
    for (let t = 0; t < scenario.tries; t++) {
      const game = record(scenario, 1000 * (index + 1) + t);
      const score = gain(game.cover);
      if (!best || score > best.score) best = { ...game, score };
    }
    take(best);
  });

  // Rows still open: add small eventful games until they are filled.
  let seed = 1;
  let boosters = 0;
  while (REQUIRED.some((tag) => !covered.has(tag)) && seed <= BOOSTER_SEEDS && boosters < MAX_BOOSTERS) {
    const scenario = BOOSTERS[seed % BOOSTERS.length];
    const game = record(scenario, 900000 + seed);
    if (gain(game.cover) > 0) {
      take(game);
      boosters++;
    }
    seed++;
  }

  const missing = REQUIRED.filter((tag) => !covered.has(tag));
  if (missing.length) throw new Error(`coverage rows left open:\n  ${missing.join('\n  ')}`);

  chosen.sort((a, b) => (a.fixture.name < b.fixture.name ? -1 : 1));
  chosen.forEach((game) => replay(game.fixture));
  return chosen;
}

/* ---------- 8. Output ---------- */

function readme(files) {
  const rows = files.map(({ game, name, text }) => {
    const f = game.fixture;
    const on = ['loot', 'kraken', 'whale', 'abilities'].filter((k) => f.settings[k]).join(', ') || 'none';
    const rejected = f.steps.filter((s) => !s.ok).length;
    return `| \`${name}\` | ${f.players} | ${f.settings.scoring} | ${f.settings.format} | ${on} | ${f.steps.length} | ${rejected} | ${(text.length / 1024).toFixed(0)} KB |`;
  });
  const tags = new Map();
  files.forEach(({ game, name }) => {
    [...game.cover].sort(byCodeUnit).forEach((tag) => {
      if (!tags.has(tag)) tags.set(tag, []);
      tags.get(tag).push(name);
    });
  });
  const coverage = [...tags.keys()].sort(byCodeUnit).map((tag) => {
    const list = tags.get(tag);
    return `| \`${tag}\` | ${list.length} | \`${list[0]}\` |`;
  });
  const steps = files.reduce((a, { game }) => a + game.fixture.steps.length, 0);
  const rejected = files.reduce((a, { game }) => a + game.fixture.steps.filter((s) => !s.ok).length, 0);
  const bytes = files.reduce((a, { text }) => a + text.length, 0);
  return `# Engine fixtures

Generated by \`web/scripts/generate-engine-fixtures.mjs\` from the reference engine in
\`${LEGACY_NAME}\` (sha256 \`${LEGACY_SHA256}\`). **Do not edit these files by hand.**
The format and the rules for changing them are in \`docs/engine-conformance.md\` §2.

- ${files.length} games, ${steps} steps, ${rejected} of them rejected actions, ${(bytes / 1024 / 1024).toFixed(1)} MB.
- Regenerate: \`node web/scripts/generate-engine-fixtures.mjs\`. The run is deterministic.
- Check that the files match the generator: \`node web/scripts/generate-engine-fixtures.mjs --check\`.

## Games

| File | Players | Scoring | Format | Expansions | Steps | Rejected | Size |
| ---- | ------- | ------- | ------ | ---------- | ----- | -------- | ---- |
${rows.join('\n')}

## Coverage

Every row is required by the generator: a run that leaves one open fails.

| Row | Games | First file |
| --- | ----- | ---------- |
${coverage.join('\n')}
`;
}

function main() {
  const check = process.argv.includes('--check');
  const games = build();
  const files = games.map((game) => ({
    game,
    name: `${game.fixture.name}.json`,
    text: JSON.stringify(game.fixture) + '\n',
  }));
  const names = files.map((f) => f.name);
  if (new Set(names).size !== names.length) throw new Error('two fixtures share a name');
  const outputs = new Map(files.map((f) => [f.name, f.text]));
  outputs.set('README.md', readme(files));

  if (check) {
    const onDisk = existsSync(OUT) ? readdirSync(OUT).sort(byCodeUnit) : [];
    const expected = [...outputs.keys()].sort(byCodeUnit);
    const problems = [];
    if (JSON.stringify(onDisk) !== JSON.stringify(expected)) problems.push('the set of files differs');
    for (const [name, text] of outputs) {
      const path = join(OUT, name);
      if (existsSync(path) && readFileSync(path, 'utf8') !== text) problems.push(`${name} differs`);
    }
    if (problems.length) {
      console.error(`fixtures/engine does not match the generator:\n  ${problems.join('\n  ')}`);
      process.exit(1);
    }
    console.log(`fixtures/engine matches the generator (${files.length} games).`);
    return;
  }

  mkdirSync(OUT, { recursive: true });
  // Only files this generator writes are removed: stale fixtures and the README.
  for (const name of readdirSync(OUT)) {
    if ((name.endsWith('.json') || name === 'README.md') && !outputs.has(name)) rmSync(join(OUT, name));
  }
  for (const [name, text] of outputs) writeFileSync(join(OUT, name), text);
  const bytes = files.reduce((a, f) => a + f.text.length, 0);
  console.log(`wrote ${files.length} games (${(bytes / 1024 / 1024).toFixed(1)} MB) to fixtures/engine`);
}

main();
