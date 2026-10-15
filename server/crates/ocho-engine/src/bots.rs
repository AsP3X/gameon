//! Three bot levels for every Ocho table the engine can deal.
//!
//! A bot sees one seat's [`PlayerView`] and an [`Rng`]. It does not take [`Game`].
//! Easy, Normal, and Hard all know the rules: matching, the draw-and-maybe-play step,
//! stacks and Shield, 2-player Reverse as Skip, teams, Dead Red, Boo Blue, and X-Ray.
//! Easy sometimes plays the card a beginner would. Hard uses the partner's hand,
//! the X-Ray cards, and who is about to play.

use serde::{Deserialize, Serialize};

use crate::card::{Card, CardId, Color, Kind, Symbol};
use crate::error::StepError;
use crate::game::{Intent, Must, PlayerView};
use crate::rng::Rng;

/// How sharply a bot plays. A per-seat view does not include it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BotLevel {
    /// Knows the rules. Sometimes spends a wild, takes a stack, or names a thin colour.
    Easy,
    /// Empties its hand, keeps wilds and Shield, and does not hit itself or its partner.
    Normal,
    /// The same plan as Normal, using the partner hand, X-Ray, and the next seat's count.
    Hard,
}

impl BotLevel {
    /// The word shown next to a bot's seat.
    #[must_use]
    pub const fn label(self) -> &'static str {
        match self {
            Self::Easy => "Easy",
            Self::Normal => "Normal",
            Self::Hard => "Hard",
        }
    }
}

/// The intent this seat would send.
///
/// # Errors
///
/// [`StepError::Broken`] when the view says this seat must act and then offers nothing legal.
pub fn choose(view: &PlayerView, level: BotLevel, rng: &mut impl Rng) -> Result<Intent, StepError> {
    // Human: Empty the hand. Do not draw from your own Dead Red or Boo Blue, and do not punish a partner. Hard also stops a short hand and uses X-Ray.
    // Agent: READS PlayerView and BotLevel; does not take Game; RETURNS one Intent the seat is allowed to send.
    match view.must {
        Must::None => Err(StepError::Broken),
        Must::NextHand => Ok(Intent::Next),
        Must::ChooseColor => Ok(Intent::Choose {
            color: named_color(view, level, rng),
        }),
        Must::PlayDrawnOrKeep => Ok(keep_or_play(view, level, rng)),
        Must::AnswerStack => answer_stack(view, level, rng),
        Must::PlayOrDraw => play_or_draw(view, level, rng),
    }
}

fn play_or_draw(
    view: &PlayerView,
    level: BotLevel,
    rng: &mut impl Rng,
) -> Result<Intent, StepError> {
    let cards = legal_cards(view)?;
    let Some(first) = cards.first().copied() else {
        return Ok(Intent::Draw);
    };
    if cards.len() == 1 {
        return Ok(play_card(view, first, level, rng));
    }
    if level == BotLevel::Easy && rng.next_u32().is_multiple_of(3) {
        let index = crate::rng::index_below(rng, cards.len());
        return Ok(play_card(
            view,
            cards.get(index).copied().unwrap_or(first),
            level,
            rng,
        ));
    }
    let best = cards
        .iter()
        .copied()
        .max_by_key(|card| score_play(view, *card, level))
        .unwrap_or(first);
    Ok(play_card(view, best, level, rng))
}

fn answer_stack(
    view: &PlayerView,
    level: BotLevel,
    rng: &mut impl Rng,
) -> Result<Intent, StepError> {
    let cards = legal_cards(view)?;
    if level == BotLevel::Easy && rng.next_u32().is_multiple_of(4) {
        return Ok(Intent::Draw);
    }
    let partner = next_is_partner(view);
    if !partner && let Some(card) = find_kind(&cards, Kind::Draw2) {
        return Ok(play_card(view, card, level, rng));
    }
    if !partner && let Some(card) = find_kind(&cards, Kind::WildDraw4) {
        return Ok(play_card(view, card, level, rng));
    }
    if let Some(card) = find_kind(&cards, Kind::Shield) {
        let total = i32::from(view.stack.unwrap_or(0));
        let reflect = match level {
            BotLevel::Easy => total >= 6 || view.hand.len() == 1,
            BotLevel::Normal => total >= 4 || view.hand.len() <= 2,
            BotLevel::Hard => total >= 4 || view.hand.len() <= 2 || previous_is_short(view),
        };
        if reflect || partner {
            return Ok(play_card(view, card, level, rng));
        }
    }
    Ok(Intent::Draw)
}

fn keep_or_play(view: &PlayerView, level: BotLevel, rng: &mut impl Rng) -> Intent {
    let Some(card) = view
        .hand
        .iter()
        .copied()
        .find(|card| view.legal.contains(&card.id))
    else {
        return Intent::Keep;
    };
    if level == BotLevel::Easy {
        return play_card(view, card, level, rng);
    }
    if view.hand.len() > 1 && saves_for_later(card) {
        return Intent::Keep;
    }
    if hurts_us(view, card) || hurts_partner(view, card) {
        return Intent::Keep;
    }
    play_card(view, card, level, rng)
}

fn named_color(view: &PlayerView, level: BotLevel, rng: &mut impl Rng) -> Color {
    if level == BotLevel::Easy && rng.next_u32().is_multiple_of(3) {
        return Color::ALL[crate::rng::index_below(rng, Color::ALL.len())];
    }
    best_color(view, level)
}

fn score_play(view: &PlayerView, card: Card, level: BotLevel) -> i32 {
    let mut score = effect_score(view, card, level);
    score += hold_score(view, card);
    if level != BotLevel::Easy {
        score += dump_score(card);
    }
    if level == BotLevel::Hard {
        score += hard_score(view, card);
    }
    score
}

fn effect_score(view: &PlayerView, card: Card, level: BotLevel) -> i32 {
    let left = view.hand.len().saturating_sub(1);
    if left == 0 && !hurts_us(view, card) {
        return 1_000;
    }
    if hurts_us(view, card) {
        return -800;
    }
    if hurts_partner(view, card) {
        return -500;
    }
    let mut score = 0;
    if card.names_color() && has_natural(view) && left > 1 {
        score -= 90;
    }
    if card.kind == Kind::Shield && view.stack.is_none() && left > 1 {
        score -= 40;
    }
    if card.kind == Kind::DeadRed {
        score += dead_red_bonus(view, level);
    }
    if card.kind == Kind::BooBlue {
        score += if shortest_other(view) <= 2 { 70 } else { 16 };
    }
    score
}

fn hard_score(view: &PlayerView, card: Card) -> i32 {
    let mut score = 0;
    if skips_next(card, view.counts.len()) && next_count(view) <= 2 {
        score += 160;
    }
    if matches!(card.kind, Kind::Draw2 | Kind::WildDraw4)
        && next_count(view) <= 2
        && !next_is_partner(view)
    {
        score += 90;
    }
    if view.partner_hand.is_some() && skips_next(card, view.counts.len()) {
        score += 40;
        if partner_count(view) == Some(1) && partner_follows(view, card) {
            score += 80;
        }
    }
    if view.partner_hand.is_some()
        && matches!(card.kind, Kind::Draw2 | Kind::WildDraw4)
        && !next_is_partner(view)
    {
        score += 18;
    }
    if card.kind == Kind::XRay && holds_kind(view, Kind::DeadRed) && view.xray.is_empty() {
        score += 24;
    }
    score
}

fn dead_red_bonus(view: &PlayerView, level: BotLevel) -> i32 {
    let mut bonus = 36;
    if level == BotLevel::Hard && !view.xray.is_empty() {
        let mut bare = 0i32;
        let mut holding = 0i32;
        for shown in &view.xray {
            if is_red(shown.card) {
                holding += 1;
            } else {
                bare += 1;
            }
        }
        bonus += bare * 40;
        bonus -= holding * 25;
    }
    bonus
}

fn dump_score(card: Card) -> i32 {
    match card.kind {
        Kind::Number(rank) => i32::from(rank) / 2,
        Kind::Skip | Kind::Reverse | Kind::Draw2 => 4,
        Kind::Wild
        | Kind::WildDraw4
        | Kind::Shield
        | Kind::XRay
        | Kind::DeadRed
        | Kind::BooBlue => 0,
    }
}

fn hold_score(view: &PlayerView, card: Card) -> i32 {
    let Some(color) = paint(card) else {
        return 0;
    };
    let others = view
        .hand
        .iter()
        .filter(|held| held.id != card.id && paint(**held) == Some(color))
        .count();
    i32::try_from(others).unwrap_or(0) * 3
}

fn hurts_us(view: &PlayerView, card: Card) -> bool {
    if card.kind == Kind::DeadRed && !still_red(view, card.id) {
        return true;
    }
    card.kind == Kind::BooBlue && boo_hits(view, view.you)
}

fn hurts_partner(view: &PlayerView, card: Card) -> bool {
    let Some(partner) = partner_seat(view) else {
        return false;
    };
    if view.hand.len() <= 1 && !hurts_us(view, card) {
        return false;
    }
    if card.kind == Kind::DeadRed {
        return partner_lacks_red(view);
    }
    card.kind == Kind::BooBlue && boo_hits(view, partner)
}

fn boo_hits(view: &PlayerView, seat: u8) -> bool {
    count_after(view, seat) == fewest_after(view)
}

fn fewest_after(view: &PlayerView) -> usize {
    let mut best = count_after(view, view.you);
    for seat in 0..view.counts.len() {
        let Some(seat) = u8::try_from(seat).ok() else {
            continue;
        };
        if seat == view.you {
            continue;
        }
        best = best.min(count_after(view, seat));
    }
    best
}

fn count_after(view: &PlayerView, seat: u8) -> usize {
    if seat == view.you {
        return view.hand.len().saturating_sub(1);
    }
    view.counts
        .get(usize::from(seat))
        .map_or(usize::MAX, |count| usize::from(*count))
}

fn shortest_other(view: &PlayerView) -> usize {
    view.counts
        .iter()
        .enumerate()
        .filter(|(seat, _)| *seat != usize::from(view.you))
        .map(|(_, count)| usize::from(*count))
        .min()
        .unwrap_or(usize::MAX)
}

fn still_red(view: &PlayerView, played: CardId) -> bool {
    view.hand
        .iter()
        .any(|card| card.id != played && is_red(*card))
}

fn partner_lacks_red(view: &PlayerView) -> bool {
    view.partner_hand
        .as_ref()
        .is_some_and(|hand| !hand.is_empty() && hand.iter().all(|card| !is_red(*card)))
}

fn is_red(card: Card) -> bool {
    card.color == Some(Color::Red) || card.kind == Kind::DeadRed
}

fn has_natural(view: &PlayerView) -> bool {
    view.hand
        .iter()
        .any(|card| view.legal.contains(&card.id) && !card.names_color())
}

fn holds_kind(view: &PlayerView, kind: Kind) -> bool {
    view.hand.iter().any(|card| card.kind == kind)
}

fn saves_for_later(card: Card) -> bool {
    matches!(
        card.kind,
        Kind::Wild | Kind::WildDraw4 | Kind::Shield | Kind::XRay
    )
}

fn skips_next(card: Card, players: usize) -> bool {
    card.kind == Kind::Skip || (card.kind == Kind::Reverse && players == 2)
}

fn next_count(view: &PlayerView) -> usize {
    view.counts
        .get(usize::from(next_seat(view)))
        .map_or(usize::MAX, |count| usize::from(*count))
}

fn previous_is_short(view: &PlayerView) -> bool {
    let prev = step_seat(view.you, view.counts.len(), -view.direction, 1);
    view.counts
        .get(usize::from(prev))
        .is_some_and(|count| *count <= 2)
}

fn next_is_partner(view: &PlayerView) -> bool {
    partner_seat(view).is_some_and(|partner| next_seat(view) == partner)
}

fn partner_seat(view: &PlayerView) -> Option<u8> {
    if view.partner_hand.is_some() && view.counts.len() == 4 {
        Some((view.you + 2) % 4)
    } else {
        None
    }
}

fn partner_count(view: &PlayerView) -> Option<usize> {
    let seat = partner_seat(view)?;
    view.counts
        .get(usize::from(seat))
        .map(|count| usize::from(*count))
}

fn partner_follows(view: &PlayerView, card: Card) -> bool {
    let Some(hand) = view.partner_hand.as_ref() else {
        return false;
    };
    let color =
        paint(card).or_else(|| card.names_color().then(|| best_color(view, BotLevel::Hard)));
    let symbol = card.symbol();
    hand.iter().any(|held| {
        held.names_color()
            || color.is_some_and(|color| paint(*held) == Some(color))
            || (held.symbol() == symbol && !matches!(symbol, Symbol::Color))
    })
}

fn next_seat(view: &PlayerView) -> u8 {
    step_seat(view.you, view.counts.len(), view.direction, 1)
}

fn best_color(view: &PlayerView, level: BotLevel) -> Color {
    Color::ALL
        .into_iter()
        .max_by_key(|color| color_score(view, *color, level))
        .unwrap_or(Color::Red)
}

fn color_score(view: &PlayerView, color: Color, level: BotLevel) -> i32 {
    let held = color_held(view, color);
    let mut score = i32::try_from(held).unwrap_or(0) * 10;
    if level == BotLevel::Hard && next_shows(view, color) {
        score -= 3;
    }
    score
}

fn next_shows(view: &PlayerView, color: Color) -> bool {
    let next = next_seat(view);
    view.xray
        .iter()
        .any(|shown| shown.seat == next && paint(shown.card) == Some(color))
}

fn color_held(view: &PlayerView, color: Color) -> usize {
    let mine = view
        .hand
        .iter()
        .filter(|card| paint(**card) == Some(color))
        .count();
    let partner = view
        .partner_hand
        .iter()
        .flatten()
        .filter(|card| paint(**card) == Some(color))
        .count();
    mine + partner
}

fn paint(card: Card) -> Option<Color> {
    match card.kind {
        Kind::DeadRed => Some(Color::Red),
        Kind::BooBlue => Some(Color::Blue),
        _ => card.color,
    }
}

fn play_card(view: &PlayerView, card: Card, level: BotLevel, rng: &mut impl Rng) -> Intent {
    Intent::Play {
        card: card.id,
        color: card.names_color().then(|| named_color(view, level, rng)),
    }
}

fn legal_cards(view: &PlayerView) -> Result<Vec<Card>, StepError> {
    let mut cards = Vec::new();
    for id in &view.legal {
        let Some(card) = view.hand.iter().copied().find(|card| card.id == *id) else {
            return Err(StepError::Broken);
        };
        cards.push(card);
    }
    Ok(cards)
}

fn find_kind(cards: &[Card], kind: Kind) -> Option<Card> {
    cards.iter().copied().find(|card| card.kind == kind)
}

fn step_seat(from: u8, players: usize, direction: i8, steps: u8) -> u8 {
    let Ok(players) = i16::try_from(players) else {
        return from;
    };
    if players <= 0 {
        return from;
    }
    let mut seat = i16::from(from);
    let dir = i16::from(direction);
    for _ in 0..steps {
        seat = (seat + dir).rem_euclid(players);
    }
    u8::try_from(seat).unwrap_or(from)
}
