//! Round scoring. Cannonball scoring from the scorekeeper is not ported.

use crate::error::StepError;
use crate::ids::Seat;
use crate::model::{LootMove, RoundRecord, Score, ScoreKind};
use crate::rules::{Ruleset, Scoring};

/// Score one seat for one round.
///
/// Returns `Ok(None)` when the bid or the trick count is still hidden. A finished round
/// has both.
///
/// # Errors
///
/// [`StepError::Broken`] when `seat` is outside the round's arrays.
#[must_use = "a scoring failure is an invariant break"]
pub fn score_seat(
    rules: &Ruleset,
    record: &RoundRecord,
    seat: Seat,
) -> Result<Option<Score>, StepError> {
    let index = seat.index();
    let Some(bid_slot) = record.bids.get(index) else {
        return Err(StepError::Broken);
    };
    let Some(trick_slot) = record.tricks.get(index) else {
        return Err(StepError::Broken);
    };
    let (Some(bid), Some(tricks)) = (*bid_slot, *trick_slot) else {
        return Ok(None);
    };
    let delta = i32::from(bid) - i32::from(tricks);
    let diff = u8::try_from(delta.unsigned_abs()).map_err(|_| StepError::Broken)?;
    let exact = diff == 0;
    let raw = raw_bonus(record, index)? + loot_bonus(record, seat);
    let cards = i32::from(record.cards);
    let (base, bonus, kind) = match rules.scoring {
        Scoring::Rascal if exact => (10 * cards, raw, ScoreKind::Hit),
        Scoring::Rascal if diff == 1 => (5 * cards, raw.div_euclid(2), ScoreKind::Glance),
        Scoring::Rascal => (0, 0, ScoreKind::Miss),
        Scoring::Classic => {
            let base = if bid == 0 {
                if exact { 10 * cards } else { -10 * cards }
            } else if exact {
                20 * i32::from(bid)
            } else {
                -10 * i32::from(diff)
            };
            let bonus = if exact { raw } else { 0 };
            let kind = if exact {
                ScoreKind::Hit
            } else {
                ScoreKind::Miss
            };
            (base, bonus, kind)
        }
    };
    let wager_stake = i32::from(*record.wager.get(index).ok_or(StepError::Broken)?);
    // Human: A glance is not a hit, so the Gambler's stake is lost.
    // Agent: READS wager[seat] and exact; a non-zero stake scores +stake on a hit and -stake otherwise.
    let wager = if wager_stake == 0 {
        0
    } else if exact {
        wager_stake
    } else {
        -wager_stake
    };
    Ok(Some(Score {
        base,
        bonus,
        wager,
        total: base + bonus + wager,
        hit: exact,
        diff,
        kind,
    }))
}

/// Sum of finished rounds. A round that is not `done` contributes nothing.
///
/// # Errors
///
/// [`StepError::Broken`] when a finished round is missing a bid or a trick count.
pub fn totals(rules: &Ruleset, log: &[RoundRecord], players: u8) -> Result<Vec<i32>, StepError> {
    let width = usize::from(players);
    let mut sums = vec![0i32; width];
    for record in log {
        if !record.done {
            continue;
        }
        for index in 0..width {
            let seat = Seat::from_index(u8::try_from(index).map_err(|_| StepError::Broken)?);
            let score = score_seat(rules, record, seat)?.ok_or(StepError::Broken)?;
            let sum = sums.get_mut(index).ok_or(StepError::Broken)?;
            *sum = sum.checked_add(score.total).ok_or(StepError::Broken)?;
        }
    }
    Ok(sums)
}

fn raw_bonus(record: &RoundRecord, index: usize) -> Result<i32, StepError> {
    let b14 = i32::from(*record.b14.get(index).ok_or(StepError::Broken)?);
    let mp = i32::from(*record.mp.get(index).ok_or(StepError::Broken)?);
    let ps = i32::from(*record.ps.get(index).ok_or(StepError::Broken)?);
    let black = i32::from(u8::from(record.black14.is_seat(Seat::from_index(
        u8::try_from(index).map_err(|_| StepError::Broken)?,
    )))) * 20;
    let sm = i32::from(u8::from(record.sm.is_seat(Seat::from_index(
        u8::try_from(index).map_err(|_| StepError::Broken)?,
    )))) * 40;
    Ok(10 * b14 + black + 20 * mp + 30 * ps + sm)
}

/// Loot pays 20 to each end of a transfer, and only when both seats made their bids.
fn loot_bonus(record: &RoundRecord, seat: Seat) -> i32 {
    record.loot.iter().fold(0, |total, loot| {
        let touches = loot.from == seat || loot.to == seat;
        if touches && both_hit(record, *loot) {
            total + 20
        } else {
            total
        }
    })
}

fn both_hit(record: &RoundRecord, loot: LootMove) -> bool {
    made(record, loot.from) && made(record, loot.to)
}

/// `bids[seat] === tricks[seat]`, which is also true when both are still null.
fn made(record: &RoundRecord, seat: Seat) -> bool {
    let index = seat.index();
    match (record.bids.get(index), record.tricks.get(index)) {
        (Some(bid), Some(tricks)) => bid == tricks,
        _ => false,
    }
}
