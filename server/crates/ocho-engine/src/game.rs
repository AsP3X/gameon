//! The table, the reducer, and the per-seat view.
//!
//! `Game` is not `Serialize`. A seat learns the table through [`Game::view`].

use serde::{Deserialize, Serialize};

use crate::card::{Card, CardId, Color, Kind, Symbol, build_deck, holds_red, lookup, matches};
use crate::error::{CreateError, Rejection, StepError};
use crate::rng::{self, Rng};

/// What the seat who must act is allowed to send.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Must {
    /// The opening card is a wild. Name its colour. Nothing else about it fires.
    ChooseColor,
    /// Play a legal card, or draw one.
    PlayOrDraw,
    /// The drawn card may be played, or the turn ends.
    PlayDrawnOrKeep,
    /// An open draw total. Play Draw 2, Wild Draw 4, or Shield, or take the cards.
    AnswerStack,
    /// The hand is over and the match is not. Start the next hand.
    NextHand,
    /// Nothing to send.
    None,
}

/// Where the hand is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Phase {
    /// Waiting for a colour.
    ChooseColor,
    /// A seat must play or draw.
    Turn,
    /// A seat drew and may play that card.
    Drawn,
    /// Scores are showing. The next hand has not been dealt.
    Between,
    /// The match is over.
    Over,
}

/// One card X-Ray showed, and whose hand it came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct XrayShown {
    /// The seat the card was in.
    pub seat: u8,
    /// The card.
    pub card: Card,
}

/// What one seat is allowed to see.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerView {
    /// This seat.
    pub you: u8,
    /// Phase.
    pub phase: Phase,
    /// What this seat may send. [`Must::None`] for everyone else.
    pub must: Must,
    /// This seat's hand.
    pub hand: Vec<Card>,
    /// The partner's hand, in a 2v2 match. Absent otherwise.
    pub partner_hand: Option<Vec<Card>>,
    /// Cards in each seat's hand. Index is the seat.
    pub counts: Vec<u8>,
    /// The discard.
    pub top: Card,
    /// Cards left in the draw pile.
    pub draw_count: u16,
    /// Colour that must be matched.
    pub color: Color,
    /// Symbol that must be matched.
    pub symbol: Symbol,
    /// `1` clockwise, `-1` counter-clockwise.
    pub direction: i8,
    /// Seat that must act.
    pub turn: u8,
    /// Cards this seat may play, when it is their turn.
    pub legal: Vec<CardId>,
    /// Open draw total, when one is aimed at `turn`.
    pub stack: Option<u8>,
    /// Cards X-Ray showed this seat. Empty for every other seat.
    pub xray: Vec<XrayShown>,
    /// Match totals, one per seat.
    pub scores: Vec<i32>,
    /// 1-based hand number.
    pub hand_no: u32,
    /// `Some(500)` when the match is first to 500.
    pub target: Option<i32>,
    /// Who went out, once the hand has ended.
    pub hand_winner: Option<u8>,
    /// Who reached the target, once the match has ended.
    pub match_winner: Option<u8>,
    /// Points scored this hand, once it has ended. Index is the seat.
    pub hand_points: Option<Vec<i32>>,
}

/// An intent from the seat the server authenticated.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Intent {
    /// Play `card`. `color` is required when the card does not have one.
    Play {
        /// The card.
        card: CardId,
        /// The colour a wild names.
        color: Option<Color>,
    },
    /// Draw one card, or take the open stack.
    Draw,
    /// Decline to play the card just drawn.
    Keep,
    /// Name the colour of an opening wild.
    Choose {
        /// The colour.
        color: Color,
    },
    /// Deal the next hand.
    Next,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Stack {
    total: u8,
    /// Who the next Shield sends the total back to.
    return_to: u8,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Shown {
    to: u8,
    cards: Vec<(u8, CardId)>,
}

/// One match. Fields stay private so a hand cannot be serialized by accident.
///
/// `Debug` is for tests. Do not log a `Game`: it contains hidden cards.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Game {
    deck: Vec<Card>,
    players: u8,
    teams: bool,
    target: Option<i32>,
    hands: Vec<Vec<CardId>>,
    draw: Vec<CardId>,
    discard: Vec<CardId>,
    color: Color,
    symbol: Symbol,
    direction: i8,
    turn: u8,
    phase: Phase,
    stack: Option<Stack>,
    drawn: Option<CardId>,
    xray: Option<Shown>,
    scores: Vec<i32>,
    hand_points: Option<Vec<i32>>,
    hand_index: u32,
    hand_winner: Option<u8>,
    match_winner: Option<u8>,
    dealer: u8,
}

impl Game {
    /// Deal the first hand.
    ///
    /// `first_to_500` selects the match. Otherwise the match is one hand.
    /// Teams are 2v2 and require exactly four seats.
    ///
    /// # Errors
    ///
    /// [`CreateError::PlayerCount`] when the seat count or the team flag is illegal.
    pub fn create(
        players: u8,
        teams: bool,
        first_to_500: bool,
        rng: &mut impl Rng,
    ) -> Result<Self, CreateError> {
        if !(2..=8).contains(&players) || (teams && players != 4) {
            return Err(CreateError::PlayerCount);
        }
        let deck = build_deck();
        let mut game = Self {
            deck,
            players,
            teams,
            target: first_to_500.then_some(500),
            hands: vec![Vec::new(); usize::from(players)],
            draw: Vec::new(),
            discard: Vec::new(),
            color: Color::Red,
            symbol: Symbol::Color,
            direction: 1,
            turn: 0,
            phase: Phase::Turn,
            stack: None,
            drawn: None,
            xray: None,
            scores: vec![0; usize::from(players)],
            hand_points: None,
            hand_index: 1,
            hand_winner: None,
            match_winner: None,
            dealer: 0,
        };
        game.deal(rng).map_err(|_| CreateError::Deal)?;
        Ok(game)
    }

    /// Apply `intent` for `seat`.
    ///
    /// # Errors
    ///
    /// [`Rejection`] when the intent is illegal. The game is unchanged.
    /// [`StepError::Broken`] when an invariant fails.
    pub fn act(&mut self, seat: u8, intent: Intent, rng: &mut impl Rng) -> Result<(), StepError> {
        if usize::from(seat) >= usize::from(self.players) {
            return Err(Rejection::NotYourTurn.into());
        }
        let mut next = self.clone();
        next.apply(seat, intent, rng)?;
        *self = next;
        Ok(())
    }

    /// The view for `seat`.
    ///
    /// # Errors
    ///
    /// [`StepError::Broken`] when `seat` is not at the table or a card id is unknown.
    pub fn view(&self, seat: u8) -> Result<PlayerView, StepError> {
        let index = self.seat_index(seat)?;
        let must = if seat == self.turn {
            self.must()
        } else {
            Must::None
        };
        let hand = self.cards_of(&self.hands[index])?;
        let partner_hand = self
            .partner_of(seat)?
            .map(|ids| self.cards_of(ids))
            .transpose()?;
        let counts = self
            .hands
            .iter()
            .map(|hand| u8::try_from(hand.len()).unwrap_or(u8::MAX))
            .collect();
        let top = lookup(&self.deck, *self.discard.last().ok_or(StepError::Broken)?)?;
        let xray = self.xray_for(seat)?;
        let legal = if must == Must::None {
            Vec::new()
        } else {
            self.legal_ids()?
        };
        Ok(PlayerView {
            you: seat,
            phase: self.phase,
            must,
            hand,
            partner_hand,
            counts,
            top,
            draw_count: u16::try_from(self.draw.len()).unwrap_or(u16::MAX),
            color: self.color,
            symbol: self.symbol,
            direction: self.direction,
            turn: self.turn,
            legal,
            stack: self.stack.as_ref().map(|stack| stack.total),
            xray,
            scores: self.scores.clone(),
            hand_no: self.hand_index,
            target: self.target,
            hand_winner: self.hand_winner,
            match_winner: self.match_winner,
            hand_points: self.hand_points.clone(),
        })
    }

    fn apply(&mut self, seat: u8, intent: Intent, rng: &mut impl Rng) -> Result<(), StepError> {
        if self.phase == Phase::Over {
            return Err(Rejection::NotYourTurn.into());
        }
        if self.phase == Phase::Between {
            return self.next_hand(seat, intent, rng);
        }
        if seat != self.turn {
            return Err(Rejection::NotYourTurn.into());
        }
        self.xray = None;
        match intent {
            Intent::Choose { color } => self.choose_opening(color),
            Intent::Draw => self.draw_or_take(rng),
            Intent::Keep => self.keep_drawn(),
            Intent::Play { card, color } => self.play(card, color, rng),
            Intent::Next => Err(Rejection::NotYourTurn.into()),
        }
    }

    fn next_hand(&mut self, seat: u8, intent: Intent, rng: &mut impl Rng) -> Result<(), StepError> {
        if seat != self.turn || !matches!(intent, Intent::Next) {
            return Err(Rejection::NotYourTurn.into());
        }
        self.dealer = self.step(self.dealer, 1)?;
        self.hand_index = self.hand_index.saturating_add(1);
        self.hand_winner = None;
        self.hand_points = None;
        self.direction = 1;
        self.deal(rng)?;
        Ok(())
    }

    fn choose_opening(&mut self, color: Color) -> Result<(), StepError> {
        if self.phase != Phase::ChooseColor {
            return Err(Rejection::IllegalMove.into());
        }
        self.color = color;
        self.symbol = Symbol::Color;
        self.phase = Phase::Turn;
        Ok(())
    }

    fn draw_or_take(&mut self, rng: &mut impl Rng) -> Result<(), StepError> {
        if self.phase != Phase::Turn {
            return Err(Rejection::IllegalMove.into());
        }
        if let Some(stack) = self.stack.clone() {
            self.give(self.turn, stack.total, rng)?;
            self.stack = None;
            self.advance(1)?;
            self.finish_if_out()?;
            return Ok(());
        }
        if !self.legal_ids()?.is_empty() {
            return Err(Rejection::IllegalMove.into());
        }
        let drawn = self.take_one(rng)?;
        let card = lookup(&self.deck, drawn)?;
        if matches(card, self.color, self.symbol) {
            self.drawn = Some(drawn);
            self.phase = Phase::Drawn;
        } else {
            self.advance(1)?;
        }
        Ok(())
    }

    fn keep_drawn(&mut self) -> Result<(), StepError> {
        if self.phase != Phase::Drawn {
            return Err(Rejection::IllegalMove.into());
        }
        self.drawn = None;
        self.phase = Phase::Turn;
        self.advance(1)?;
        Ok(())
    }

    fn play(
        &mut self,
        id: CardId,
        named: Option<Color>,
        rng: &mut impl Rng,
    ) -> Result<(), StepError> {
        let from_drawn = self.phase == Phase::Drawn;
        if self.phase != Phase::Turn && !from_drawn {
            return Err(Rejection::IllegalMove.into());
        }
        if from_drawn && self.drawn != Some(id) {
            return Err(Rejection::IllegalMove.into());
        }
        if !self.legal_ids()?.contains(&id) {
            return Err(Rejection::IllegalMove.into());
        }
        let card = lookup(&self.deck, id)?;
        let color = if card.names_color() {
            named.ok_or(Rejection::IllegalMove)?
        } else if named.is_some() {
            return Err(Rejection::IllegalMove.into());
        } else {
            card.color.ok_or(StepError::Broken)?
        };
        self.take_from_hand(id)?;
        self.discard.push(id);
        self.drawn = None;
        self.phase = Phase::Turn;
        self.color = color;
        self.symbol = card.symbol();
        self.resolve(card, rng)?;
        Ok(())
    }

    fn resolve(&mut self, card: Card, rng: &mut impl Rng) -> Result<(), StepError> {
        if card.kind == Kind::XRay {
            self.reveal(rng);
        }
        if card.kind == Kind::DeadRed {
            self.dead_red(rng)?;
        }
        if card.kind == Kind::BooBlue {
            self.boo_blue(rng)?;
        }
        if self.stack.is_some() && card.kind == Kind::Shield {
            self.reflect();
            self.finish_if_out()?;
            return Ok(());
        }
        if card.is_draw_card() {
            let total = self.stack.as_ref().map_or(0, |stack| stack.total);
            self.stack = Some(Stack {
                total: total.saturating_add(card.draw_count()),
                return_to: self.turn,
            });
            self.advance(1)?;
            self.finish_if_out()?;
            return Ok(());
        }
        if self.stack.is_some() {
            return Err(StepError::Broken);
        }
        let steps = self.steps_after(card);
        self.advance(steps)?;
        self.finish_if_out()?;
        Ok(())
    }

    fn steps_after(&mut self, card: Card) -> u8 {
        match card.kind {
            Kind::Skip => 2,
            Kind::Reverse if self.players == 2 => 2,
            Kind::Reverse => {
                self.direction = -self.direction;
                1
            }
            _ => 1,
        }
    }

    fn reflect(&mut self) {
        let Some(stack) = self.stack.as_mut() else {
            return;
        };
        std::mem::swap(&mut stack.return_to, &mut self.turn);
    }

    fn reveal(&mut self, rng: &mut impl Rng) {
        let mut cards = Vec::new();
        for seat in 0..self.players {
            if seat == self.turn || self.is_partner(self.turn, seat) {
                continue;
            }
            let hand = &self.hands[usize::from(seat)];
            if hand.is_empty() {
                continue;
            }
            let pick = rng::index_below(rng, hand.len());
            if let Some(id) = hand.get(pick).copied() {
                cards.push((seat, id));
            }
        }
        self.xray = Some(Shown {
            to: self.turn,
            cards,
        });
    }

    fn dead_red(&mut self, rng: &mut impl Rng) -> Result<(), StepError> {
        let mut owe = Vec::new();
        for seat in 0..self.players {
            if !holds_red(&self.deck, &self.hands[usize::from(seat)])? {
                owe.push(seat);
            }
        }
        for seat in owe {
            self.give(seat, 2, rng)?;
        }
        Ok(())
    }

    fn boo_blue(&mut self, rng: &mut impl Rng) -> Result<(), StepError> {
        let fewest = self.hands.iter().map(Vec::len).min().unwrap_or(0);
        let owe: Vec<u8> = self
            .hands
            .iter()
            .enumerate()
            .filter(|(_, hand)| hand.len() == fewest)
            .map(|(seat, _)| u8::try_from(seat).unwrap_or(0))
            .collect();
        for seat in owe {
            self.give(seat, 2, rng)?;
        }
        Ok(())
    }

    fn finish_if_out(&mut self) -> Result<(), StepError> {
        if self.hand_winner.is_some() || self.stack.is_some() {
            return Ok(());
        }
        let Some(winner) = self.empty_seat() else {
            return Ok(());
        };
        let mut points = vec![0i32; usize::from(self.players)];
        for (seat, hand) in self.hands.iter().enumerate() {
            if seat == usize::from(winner) {
                continue;
            }
            let mut sum = 0i32;
            for id in hand {
                sum = sum.saturating_add(lookup(&self.deck, *id)?.points());
            }
            points[usize::from(winner)] = points[usize::from(winner)].saturating_add(sum);
        }
        for (seat, gained) in points.iter().enumerate() {
            self.scores[seat] = self.scores[seat].saturating_add(*gained);
        }
        self.hand_points = Some(points);
        self.hand_winner = Some(winner);
        self.turn = winner;
        self.drawn = None;
        self.xray = None;
        let reached = self
            .target
            .is_some_and(|target| self.winning_score(winner) >= target);
        if self.target.is_none() || reached {
            self.match_winner = Some(self.match_seat(winner));
            self.phase = Phase::Over;
        } else {
            self.phase = Phase::Between;
        }
        Ok(())
    }

    fn winning_score(&self, winner: u8) -> i32 {
        if !self.teams {
            return self.scores[usize::from(winner)];
        }
        let partner = (winner + 2) % 4;
        self.scores[usize::from(winner)].saturating_add(self.scores[usize::from(partner)])
    }

    fn match_seat(&self, winner: u8) -> u8 {
        if !self.teams {
            return winner;
        }
        let partner = (winner + 2) % 4;
        if self.scores[usize::from(partner)] > self.scores[usize::from(winner)] {
            partner
        } else {
            winner
        }
    }

    fn empty_seat(&self) -> Option<u8> {
        self.hands
            .iter()
            .enumerate()
            .find(|(_, hand)| hand.is_empty())
            .and_then(|(seat, _)| u8::try_from(seat).ok())
    }

    fn deal(&mut self, rng: &mut impl Rng) -> Result<(), StepError> {
        let mut pile: Vec<CardId> = self.deck.iter().map(|card| card.id).collect();
        for index in (1..pile.len()).rev() {
            let swap = rng::index_below(rng, index + 1);
            pile.swap(index, swap);
        }
        self.draw = pile;
        self.discard.clear();
        self.stack = None;
        self.drawn = None;
        self.xray = None;
        for hand in &mut self.hands {
            hand.clear();
        }
        for _ in 0..8 {
            for seat in 0..self.players {
                let id = self.take_one(rng)?;
                self.hands[usize::from(seat)].push(id);
            }
        }
        let opening = self.take_one(rng)?;
        self.discard.push(opening);
        let card = lookup(&self.deck, opening)?;
        self.turn = self.step(self.dealer, 1)?;
        if card.names_color() {
            self.color = Color::Red;
            self.symbol = Symbol::Color;
            self.phase = Phase::ChooseColor;
        } else {
            self.color = card.color.ok_or(StepError::Broken)?;
            self.symbol = card.symbol();
            self.phase = Phase::Turn;
        }
        Ok(())
    }

    fn take_one(&mut self, rng: &mut impl Rng) -> Result<CardId, StepError> {
        self.refill(rng)?;
        self.draw.pop().ok_or(StepError::Broken)
    }

    fn give(&mut self, seat: u8, count: u8, rng: &mut impl Rng) -> Result<(), StepError> {
        let index = self.seat_index(seat)?;
        for _ in 0..count {
            let id = self.take_one(rng)?;
            self.hands[index].push(id);
        }
        Ok(())
    }

    fn refill(&mut self, rng: &mut impl Rng) -> Result<(), StepError> {
        if !self.draw.is_empty() || self.discard.len() <= 1 {
            return Ok(());
        }
        let top = self.discard.pop().ok_or(StepError::Broken)?;
        let mut rest = std::mem::take(&mut self.discard);
        for index in (1..rest.len()).rev() {
            let swap = rng::index_below(rng, index + 1);
            rest.swap(index, swap);
        }
        self.draw = rest;
        self.discard.push(top);
        Ok(())
    }

    fn take_from_hand(&mut self, id: CardId) -> Result<(), StepError> {
        let index = self.seat_index(self.turn)?;
        let hand = &mut self.hands[index];
        let Some(pos) = hand.iter().position(|card| *card == id) else {
            return Err(Rejection::IllegalMove.into());
        };
        hand.remove(pos);
        Ok(())
    }

    fn advance(&mut self, steps: u8) -> Result<(), StepError> {
        self.turn = self.step(self.turn, steps)?;
        Ok(())
    }

    fn step(&self, from: u8, steps: u8) -> Result<u8, StepError> {
        let mut seat = i16::from(from);
        let players = i16::from(self.players);
        let dir = i16::from(self.direction);
        for _ in 0..steps {
            seat = (seat + dir).rem_euclid(players);
        }
        u8::try_from(seat).map_err(|_| StepError::Broken)
    }

    fn legal_ids(&self) -> Result<Vec<CardId>, StepError> {
        let hand = if self.phase == Phase::Drawn {
            self.drawn.into_iter().collect::<Vec<_>>()
        } else {
            self.hands[self.seat_index(self.turn)?].clone()
        };
        let mut legal = Vec::new();
        for id in hand {
            let card = lookup(&self.deck, id)?;
            let ok = if self.stack.is_some() {
                card.is_draw_card() || card.kind == Kind::Shield
            } else {
                matches(card, self.color, self.symbol)
            };
            if ok {
                legal.push(id);
            }
        }
        Ok(legal)
    }

    fn must(&self) -> Must {
        match self.phase {
            Phase::ChooseColor => Must::ChooseColor,
            Phase::Drawn => Must::PlayDrawnOrKeep,
            Phase::Between => Must::NextHand,
            Phase::Over => Must::None,
            Phase::Turn if self.stack.is_some() => Must::AnswerStack,
            Phase::Turn => Must::PlayOrDraw,
        }
    }

    fn cards_of(&self, ids: &[CardId]) -> Result<Vec<Card>, StepError> {
        ids.iter().map(|id| lookup(&self.deck, *id)).collect()
    }

    fn partner_of(&self, seat: u8) -> Result<Option<&Vec<CardId>>, StepError> {
        if !self.teams {
            return Ok(None);
        }
        let partner = (seat + 2) % 4;
        Ok(Some(&self.hands[self.seat_index(partner)?]))
    }

    fn is_partner(&self, seat: u8, other: u8) -> bool {
        self.teams && (seat + 2) % 4 == other
    }

    fn seat_index(&self, seat: u8) -> Result<usize, StepError> {
        let index = usize::from(seat);
        if index < usize::from(self.players) {
            Ok(index)
        } else {
            Err(StepError::Broken)
        }
    }

    fn xray_for(&self, seat: u8) -> Result<Vec<XrayShown>, StepError> {
        let Some(shown) = &self.xray else {
            return Ok(Vec::new());
        };
        if shown.to != seat {
            return Ok(Vec::new());
        }
        shown
            .cards
            .iter()
            .map(|(owner, id)| {
                Ok(XrayShown {
                    seat: *owner,
                    card: lookup(&self.deck, *id)?,
                })
            })
            .collect()
    }
}
