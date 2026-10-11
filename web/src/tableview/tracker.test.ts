/* The scorekeeper's model: a new sheet, a new round, and the validation of a round that was typed in. */
import { describe, expect, it } from 'vite-plus/test';
import type { TrackerConfig, TrackerRecord, TrackerState } from './state';
import { trkCreate, trkNewRecord, trkRound, trkValidate, trkView } from './tracker';

const cfg = (over: Partial<TrackerConfig> = {}): TrackerConfig => ({
  scoring: 'classic',
  cannonball: false,
  loot: true,
  kraken: true,
  whale: false,
  abilities: false,
  format: 'swift',
  ...over,
});

/** Anne, Pirate 2 and Calico, five cards each, with a round that is complete and true. */
function sheet(over: Partial<TrackerConfig> = {}): { t: TrackerState; R: TrackerRecord } {
  const t = trkCreate(['Anne', '  ', 'Calico'], cfg(over));
  const R = trkRound(t);
  R.bids = [2, 1, 2];
  R.tricks = [2, 1, 2];
  return { t, R };
}

describe('trkCreate', () => {
  it('names the unnamed, seats everybody as a human and opens round 1', () => {
    const t = trkCreate(['Anne', '  ', 'Calico'], cfg());
    expect(t.seats).toEqual([
      { name: 'Anne', color: '#1cb0f6', bot: false },
      { name: 'Pirate 2', color: '#ff9600', bot: false },
      { name: 'Calico', color: '#ce82ff', bot: false },
    ]);
    expect(t).toMatchObject({
      version: 1,
      schedule: [5, 5, 5, 5, 5],
      cur: 0,
      phase: 'bid',
      edit: null,
      finished: false,
    });
    expect(t.log).toEqual([trkNewRecord(3, 5)]);
  });

  it('caps the hand size by what the deck can deal', () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    // 70 cards for 8 pirates: 8 each. Loot and both beasts make it 74: 9 each.
    expect(trkCreate(names, cfg({ format: 'classic', loot: false, kraken: false })).schedule).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 8, 8,
    ]);
    expect(trkCreate(names, cfg({ format: 'classic', whale: true })).schedule).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 9]);
  });

  it('keeps the stored shape of a round: the engine record plus who called a cannonball', () => {
    expect(JSON.stringify(trkNewRecord(2, 3))).toBe(
      '{"cards":3,"bids":[null,null],"tricks":[null,null],"b14":[0,0],"mp":[0,0],"ps":[0,0],"wager":[0,0],' +
        '"black14":-1,"sm":-1,"loot":[],"destroyed":0,"giant":null,"done":false,"cannon":[false,false]}',
    );
  });
});

describe('trkRound and trkView', () => {
  it('shows the round being corrected, else the current one', () => {
    const { t } = sheet();
    t.log.push(trkNewRecord(3, 5));
    t.cur = 1;
    expect(trkRound(t)).toBe(t.log[1]);
    t.edit = 0;
    expect(trkRound(t)).toBe(t.log[0]);
  });
  it('gives the scoreboard a view through nobody in particular', () => {
    const { t } = sheet();
    expect(trkView(t)).toEqual({ seats: t.seats, log: t.log, cfg: t.cfg, rounds: 5, me: -1 });
  });
});

describe('trkValidate', () => {
  it('accepts a round that adds up', () => {
    const { t, R } = sheet();
    expect(trkValidate(R, t)).toEqual([]);
  });

  it('asks for every bid and every trick count', () => {
    const { t, R } = sheet();
    R.bids[1] = null;
    R.tricks[2] = null;
    expect(trkValidate(R, t)).toEqual(['Every pirate needs a bid.', 'Enter tricks won for every pirate.']);
  });

  it('counts the tricks against the cards, less the tricks a beast destroyed', () => {
    const { t, R } = sheet();
    R.tricks = [2, 1, 1];
    expect(trkValidate(R, t)).toEqual(['Tricks add up to 4, but 5 tricks were won this round.']);
    R.destroyed = 1;
    expect(trkValidate(R, t)).toEqual([]);
    R.destroyed = 2; // one Kraken in this deck, no Whale
    R.tricks = [2, 1, 0];
    expect(trkValidate(R, t)).toEqual(['More tricks destroyed than beasts in the deck.']);
  });

  it('says "trick was" for a single trick', () => {
    const t = trkCreate(['a', 'b'], cfg({ format: 'classic' }));
    const R = trkRound(t);
    R.bids = [0, 0];
    R.tricks = [1, 1];
    expect(trkValidate(R, t)).toEqual(['Tricks add up to 2, but 1 trick was won this round.']);
  });

  it('knows how many bonus cards the deck holds', () => {
    const { t, R } = sheet();
    R.b14 = [2, 1, 1];
    R.mp = [2, 1, 0];
    R.ps = [7, 0, 0];
    expect(trkValidate(R, t)).toEqual([
      'There are only three standard 14s.',
      'There are only two Mermaids.',
      'There are only six Pirates, counting the Tigress.',
    ]);
  });

  it('knows what the Skull King can and cannot have done', () => {
    const { t, R } = sheet();
    R.ps = [1, 0, 2];
    expect(trkValidate(R, t)).toEqual([
      'Only one pirate holds the Skull King, so only one can capture Pirates with him.',
    ]);
    R.ps = [1, 0, 0];
    R.sm = 2;
    expect(trkValidate(R, t)).toEqual([
      'If a Mermaid caught the Skull King, he never won a trick, so no Pirate bonuses.',
    ]);
  });

  it('gives no bonus card to a pirate who took no tricks, and says so once', () => {
    const { t, R } = sheet();
    R.bids = [3, 0, 2];
    R.tricks = [3, 0, 2];
    R.b14[1] = 1;
    R.black14 = 1;
    expect(trkValidate(R, t)).toEqual(["Pirate 2 took no tricks, so can't have captured bonus cards."]);
  });

  it('checks every Loot alliance', () => {
    const { t, R } = sheet();
    R.bids = [3, 0, 2];
    R.tricks = [3, 0, 2];
    R.loot = [
      { from: -1, to: 0 },
      { from: 2, to: 2 },
      { from: 0, to: 1 },
    ];
    expect(trkValidate(R, t)).toEqual([
      'Loot 1: pick who played it and who took it.',
      'Loot 2: an alliance needs two different pirates.',
      "Loot 3: Pirate 2 took no tricks, so couldn't capture it.",
    ]);
  });

  it('returns names as they were typed: the screen escapes them when it shows the message', () => {
    const t = trkCreate(['<b>Anne</b>', 'Bo'], cfg());
    const R = trkRound(t);
    R.bids = [0, 5];
    R.tricks = [0, 5];
    R.mp[0] = 1;
    expect(trkValidate(R, t)).toEqual(["<b>Anne</b> took no tricks, so can't have captured bonus cards."]);
  });
});
