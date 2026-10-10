//! Three bot levels. A bot sees one seat's [`EngineView`], the canonical deck, and an [`Rng`].
//! It does not take [`GameState`].

use crate::card::{self, Card, lookup};
use crate::error::StepError;
use crate::ids::{CardId, Seat};
use crate::model::{Ability, AbilityChoice, EngineView, Play, PlayedAs};
use crate::rng::{self, Rng};
use crate::rules::BotLevel;

/// The bid this seat would make.
///
/// `view` must be that seat's view: the hand it bids from is `view.hand`.
///
/// # Errors
///
/// [`StepError::Broken`] when the view names a card that is not in `deck`.
pub fn choose_bid(
    view: &EngineView,
    deck: &[Card],
    level: BotLevel,
    rng: &mut impl Rng,
) -> Result<u8, StepError> {
    // Human: Bots decide from the same view a player sees, plus the canonical deck and the difficulty.
    // Agent: READS EngineView, deck, BotLevel, Rng; does not take GameState; RETURNS a bid in 0..=hand length.
    let rivals = view.hand_counts.len().saturating_sub(1);
    let mut expect = 0.0;
    for id in &view.hand {
        expect += power(view, deck, level, rivals, *id, Some(PlayedAs::Pirate))?;
    }
    let unit = rng.next_f64();
    let noisy = match level {
        BotLevel::Easy => expect * 0.85 + (unit - 0.5) * 2.2,
        BotLevel::Hard => expect + (unit - 0.5) * 0.3,
        BotLevel::Normal => expect + (unit - 0.5) * 0.6,
    };
    let hand_len = i32::try_from(view.hand.len()).map_err(|_| StepError::Broken)?;
    let clamped = rng::js_round(noisy).clamp(0, hand_len);
    u8::try_from(clamped).map_err(|_| StepError::Broken)
}

/// The card this seat would play, and the Tigress declaration when the card is the Tigress.
///
/// # Errors
///
/// [`StepError::Broken`] when the seat has no legal card or the view names an unknown card.
pub fn choose_play(
    view: &EngineView,
    deck: &[Card],
    level: BotLevel,
    rng: &mut impl Rng,
) -> Result<(CardId, Option<PlayedAs>), StepError> {
    let options = options_of(view, deck)?;
    let Some(first) = options.first() else {
        return Err(StepError::Broken);
    };
    if level == BotLevel::Easy && rng.next_f64() < 0.35 {
        let roll = rng.next_f64();
        let width = u32::try_from(options.len()).map_err(|_| StepError::Broken)?;
        let index = rng::floor_usize(roll * f64::from(width));
        let chosen = options
            .get(index)
            .or(Some(first))
            .ok_or(StepError::Broken)?;
        return Ok(*chosen);
    }
    let players = view.hand_counts.len();
    let already = view.trick.plays.len();
    if already >= players {
        return Err(StepError::Broken);
    }
    let rivals = players - 1 - already;
    let mut scored = Vec::with_capacity(options.len());
    for option in &options {
        let win = if view.trick.plays.is_empty() {
            true
        } else {
            wins_trick(view, deck, *option)?
        };
        let p = if win && rivals == 0 {
            1.0
        } else {
            power(view, deck, level, rivals, option.0, option.1)?
        };
        scored.push(Scored {
            play: *option,
            win,
            p,
        });
    }
    let need = need_of(view)?;
    let left = i32::try_from(view.hand.len()).map_err(|_| StepError::Broken)?;
    let chosen = if need > 0 {
        choose_when_short(&scored, view, deck, rivals, need, left)?
    } else {
        let loses = scored.iter().filter(|item| !item.win).collect::<Vec<_>>();
        if loses.is_empty() {
            lowest(&scored)?.play
        } else {
            highest_ref(&loses)?.play
        }
    };
    Ok(chosen)
}

/// The answer this seat would give for the ability open on `view`.
///
/// # Errors
///
/// [`StepError::Broken`] when `view` has no ability for this seat, or the hand cannot supply a discard.
pub fn choose_ability(
    view: &EngineView,
    deck: &[Card],
    _level: BotLevel,
) -> Result<AbilityChoice, StepError> {
    let pending = view.pending.as_ref().ok_or(StepError::Broken)?;
    if pending.seat != view.me {
        return Err(StepError::Broken);
    }
    let players = u8::try_from(view.hand_counts.len()).map_err(|_| StepError::Broken)?;
    let need = need_of(view)?;
    Ok(match pending.kind {
        Ability::Helm => AbilityChoice::Number(i32::from(view.me.next(players)?.get())),
        Ability::Smuggler => AbilityChoice::Cards(smuggler_discards(view, deck, need)?),
        Ability::Gambler => AbilityChoice::Number(gambler_stake(view, deck, need)?),
        Ability::Giant => AbilityChoice::Number(giant_change(view)?),
        Ability::Seer => AbilityChoice::Pass(()),
    })
}

struct Scored {
    play: (CardId, Option<PlayedAs>),
    win: bool,
    p: f64,
}

fn choose_when_short(
    scored: &[Scored],
    view: &EngineView,
    deck: &[Card],
    rivals: usize,
    need: i32,
    left: i32,
) -> Result<(CardId, Option<PlayedAs>), StepError> {
    if view.trick.plays.is_empty() {
        let top = highest(scored)?;
        return Ok(if need >= left || top.p > 0.55 {
            top.play
        } else {
            lowest(scored)?.play
        });
    }
    let wins = scored.iter().filter(|item| item.win).collect::<Vec<_>>();
    if wins.is_empty() {
        return Ok(dump_weakest(scored, deck)?.play);
    }
    if rivals == 0 {
        return Ok(lowest_ref(&wins)?.play);
    }
    let safe = wins
        .iter()
        .copied()
        .filter(|item| item.p >= 0.6)
        .collect::<Vec<_>>();
    if !safe.is_empty() {
        return Ok(lowest_ref(&safe)?.play);
    }
    if need >= left {
        Ok(highest_ref(&wins)?.play)
    } else {
        Ok(lowest_ref(&wins)?.play)
    }
}

fn dump_weakest<'a>(scored: &'a [Scored], deck: &[Card]) -> Result<&'a Scored, StepError> {
    let mut best = scored.first().ok_or(StepError::Broken)?;
    let mut best_keep = keep_value(deck, best)?;
    for item in scored.iter().skip(1) {
        let keep = keep_value(deck, item)?;
        if keep < best_keep {
            best = item;
            best_keep = keep;
        }
    }
    Ok(best)
}

fn keep_value(deck: &[Card], item: &Scored) -> Result<f64, StepError> {
    let card = lookup(deck, item.play.0)?;
    let escape = matches!(card, Card::Escape { .. } | Card::Loot { .. });
    Ok(if escape { 0.5 } else { item.p })
}

fn options_of(
    view: &EngineView,
    deck: &[Card],
) -> Result<Vec<(CardId, Option<PlayedAs>)>, StepError> {
    let legal = card::legal_cards(&view.hand, &view.trick.plays, deck)?;
    let mut options = Vec::new();
    for id in legal {
        if lookup(deck, id)?.is_tigress() {
            options.push((id, Some(PlayedAs::Pirate)));
            options.push((id, Some(PlayedAs::Escape)));
        } else {
            options.push((id, None));
        }
    }
    Ok(options)
}

fn wins_trick(
    view: &EngineView,
    deck: &[Card],
    play: (CardId, Option<PlayedAs>),
) -> Result<bool, StepError> {
    let mut plays = view.trick.plays.clone();
    plays.push(Play {
        seat: view.me,
        card: play.0,
        played_as: play.1,
    });
    let result = card::resolve_trick(&plays, deck)?;
    Ok(result.winner == Some(view.me))
}

fn power(
    view: &EngineView,
    deck: &[Card],
    level: BotLevel,
    rivals: usize,
    id: CardId,
    played_as: Option<PlayedAs>,
) -> Result<f64, StepError> {
    let card = lookup(deck, id)?;
    if level == BotLevel::Hard {
        return live_power(view, deck, card, id, played_as, rivals);
    }
    let scaled = u32::try_from(rivals.max(1)).map_err(|_| StepError::Broken)?;
    Ok(static_power(card, played_as).powf(f64::from(scaled) / 3.0))
}

fn live_power(
    view: &EngineView,
    deck: &[Card],
    card: Card,
    id: CardId,
    played_as: Option<PlayedAs>,
    rivals: usize,
) -> Result<f64, StepError> {
    if played_as == Some(PlayedAs::Escape)
        || matches!(card, Card::Escape { .. } | Card::Loot { .. })
    {
        return Ok(static_power(card, played_as));
    }
    let unseen = unseen_cards(view, deck);
    if unseen.is_empty() {
        return Ok(static_power(card, played_as));
    }
    let mut beats = 0u32;
    for other in &unseen {
        let plays = [
            Play {
                seat: Seat::from_index(0),
                card: id,
                played_as,
            },
            Play {
                seat: Seat::from_index(1),
                card: other.id(),
                played_as: Some(PlayedAs::Pirate),
            },
        ];
        if card::resolve_trick(&plays, deck)?.winner == Some(Seat::from_index(0)) {
            beats += 1;
        }
    }
    let width = u32::try_from(unseen.len()).map_err(|_| StepError::Broken)?;
    let exponent = f64::from(u32::try_from(rivals.max(1)).map_err(|_| StepError::Broken)?);
    Ok((f64::from(beats) / f64::from(width)).powf(exponent))
}

/// Cards this seat has not held and has not seen played. Other hands and the pile stay unseen.
fn unseen_cards(view: &EngineView, deck: &[Card]) -> Vec<Card> {
    deck.iter()
        .copied()
        .filter(|card| !view.hand.contains(&card.id()) && !view.played.contains(&card.id()))
        .collect()
}

fn static_power(card: Card, played_as: Option<PlayedAs>) -> f64 {
    match card {
        Card::SkullKing { .. } => 0.95,
        Card::Pirate { .. } => 0.82,
        Card::Mermaid { .. } => 0.6,
        Card::Tigress { .. } => {
            if played_as == Some(PlayedAs::Escape) {
                0.0
            } else {
                0.74
            }
        }
        Card::Whale { .. } => 0.25,
        Card::Kraken { .. } => 0.1,
        Card::Escape { .. } => 0.0,
        Card::Loot { .. } => 0.02,
        Card::Number { suit, rank, .. } => {
            if suit == crate::model::Suit::Black {
                0.3 + f64::from(rank) * 0.035
            } else {
                ((f64::from(rank) - 7.0) / 12.0).max(0.02)
            }
        }
    }
}

fn smuggler_discards(
    view: &EngineView,
    deck: &[Card],
    need: i32,
) -> Result<Vec<CardId>, StepError> {
    let drawn = view
        .pending
        .as_ref()
        .and_then(|pending| pending.drawn.as_ref())
        .ok_or(StepError::Broken)?;
    let mut ranked = Vec::with_capacity(view.hand.len());
    for id in &view.hand {
        let power = static_power(lookup(deck, *id)?, Some(PlayedAs::Pirate));
        ranked.push((*id, power));
    }
    ranked.sort_by(|left, right| left.1.total_cmp(&right.1));
    let count = drawn.len();
    if ranked.len() < count {
        return Err(StepError::Broken);
    }
    let slice = if need > 0 {
        ranked.get(..count).ok_or(StepError::Broken)?
    } else {
        let start = ranked.len() - count;
        ranked.get(start..).ok_or(StepError::Broken)?
    };
    Ok(slice.iter().map(|(id, _)| *id).collect())
}

fn gambler_stake(view: &EngineView, deck: &[Card], need: i32) -> Result<i32, StepError> {
    if need < 0 {
        return Ok(0);
    }
    if view.hand.is_empty() {
        return Ok(if need == 0 { 20 } else { 0 });
    }
    let mut sum = 0.0;
    for id in &view.hand {
        sum += static_power(lookup(deck, *id)?, Some(PlayedAs::Pirate));
    }
    let gap = (sum - f64::from(need)).abs();
    Ok(if gap < 0.4 {
        20
    } else if gap < 0.9 {
        10
    } else {
        0
    })
}

fn giant_change(view: &EngineView) -> Result<i32, StepError> {
    let bid = own_bid(view)?;
    let won = own_won(view)?;
    Ok((won - bid).clamp(-1, 1))
}

fn need_of(view: &EngineView) -> Result<i32, StepError> {
    Ok(own_bid(view)? - own_won(view)?)
}

fn own_bid(view: &EngineView) -> Result<i32, StepError> {
    match view.bids.get(view.me.index()).ok_or(StepError::Broken)? {
        Some(value) if *value >= 0 => Ok(i32::from(*value)),
        _ => Err(StepError::Broken),
    }
}

fn own_won(view: &EngineView) -> Result<i32, StepError> {
    view.won
        .get(view.me.index())
        .map(|won| i32::from(*won))
        .ok_or(StepError::Broken)
}

fn lowest(scored: &[Scored]) -> Result<&Scored, StepError> {
    strict_pick(scored, |item, best| item.p < best.p)
}

fn highest(scored: &[Scored]) -> Result<&Scored, StepError> {
    strict_pick(scored, |item, best| item.p > best.p)
}

fn lowest_ref<'a>(scored: &[&'a Scored]) -> Result<&'a Scored, StepError> {
    strict_pick_ref(scored, |item, best| item.p < best.p)
}

fn highest_ref<'a>(scored: &[&'a Scored]) -> Result<&'a Scored, StepError> {
    strict_pick_ref(scored, |item, best| item.p > best.p)
}

fn strict_pick(
    scored: &[Scored],
    better: impl Fn(&Scored, &Scored) -> bool,
) -> Result<&Scored, StepError> {
    let mut best = scored.first().ok_or(StepError::Broken)?;
    for item in scored.iter().skip(1) {
        if better(item, best) {
            best = item;
        }
    }
    Ok(best)
}

fn strict_pick_ref<'a>(
    scored: &[&'a Scored],
    better: impl Fn(&Scored, &Scored) -> bool,
) -> Result<&'a Scored, StepError> {
    let mut best = *scored.first().ok_or(StepError::Broken)?;
    for item in scored.iter().skip(1) {
        if better(item, best) {
            best = item;
        }
    }
    Ok(best)
}
