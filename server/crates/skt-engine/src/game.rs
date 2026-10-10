//! The table state, the reducer, and the per-seat view.
//!
//! `GameState` is not `Serialize`. A seat learns the table through [`GameState::view`].

use crate::card::{self, Card, is_tigress, lookup};
use crate::error::{CreateError, Rejection, StepError};
use crate::ids::{CardId, Seat, SeatOrNone};
use crate::model::{
    Ability, AbilityChoice, AbilityUsed, EngineView, GameEvent, LastTrick, PendingView, Phase,
    Play, PlayedAs, RoundRecord, Score, Trick,
};
use crate::rules::{Format, Ruleset};
use crate::score;

/// One round's card order. Index 0 is dealt first.
///
/// The server's source is an OS-seeded generator. A test source returns a recorded order.
/// The engine checks that the order is a permutation of the deck.
pub trait DealSource {
    /// Cards for `round`, in deal order. Seat 0 receives the front of the slice.
    fn deal_order(&mut self, round: usize) -> Vec<CardId>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Pending {
    pub(crate) kind: Ability,
    pub(crate) seat: Seat,
    pub(crate) drawn: Option<Vec<CardId>>,
}

/// One game. Fields are visible inside this crate so the leak tests can permute hidden cards.
/// Nothing outside the crate can read a hand, the pile, or an unrevealed bid.
///
/// `Debug` is for tests. Do not log a `GameState`: it contains hidden cards and bids.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GameState {
    pub(crate) rules: Ruleset,
    pub(crate) deck: Vec<Card>,
    pub(crate) schedule: Vec<u8>,
    pub(crate) players: u8,
    pub(crate) round: u8,
    pub(crate) dealer: Seat,
    pub(crate) phase: Phase,
    pub(crate) hands: Vec<Vec<CardId>>,
    pub(crate) pile: Vec<CardId>,
    pub(crate) played: Vec<CardId>,
    pub(crate) bids: Vec<Option<u8>>,
    pub(crate) won: Vec<u8>,
    pub(crate) trick: Trick,
    /// Who must play. `None` outside `playing`. Distinct from [`Trick::leader`].
    pub(crate) turn: Option<Seat>,
    pub(crate) last_trick: Option<LastTrick>,
    pub(crate) pending: Option<Pending>,
    pub(crate) giant_seat: Option<Seat>,
    pub(crate) giant_used: bool,
    pub(crate) log: Vec<RoundRecord>,
}

impl GameState {
    /// Deal round 0. `dealer` leads nothing yet: the seat after the dealer leads the first trick.
    ///
    /// # Errors
    ///
    /// [`CreateError::PlayerCount`] when `players` is not 2 to 8.
    /// [`CreateError::Dealer`] when `dealer` is not one of those seats.
    /// [`CreateError::Deal`] when the first order is not a permutation of the deck.
    pub fn create(
        rules: Ruleset,
        players: u8,
        dealer: Seat,
        deals: &mut impl DealSource,
    ) -> Result<Self, CreateError> {
        if !(2..=8).contains(&players) {
            return Err(CreateError::PlayerCount);
        }
        if dealer.index() >= usize::from(players) {
            return Err(CreateError::Dealer);
        }
        let deck = card::build_deck(rules.expansions)?;
        let schedule = schedule_for(rules.format, deck.len(), players)?;
        let mut state = Self {
            rules,
            deck,
            schedule,
            players,
            round: 0,
            dealer,
            phase: Phase::Bidding,
            hands: Vec::new(),
            pile: Vec::new(),
            played: Vec::new(),
            bids: Vec::new(),
            won: Vec::new(),
            trick: Trick {
                leader: dealer,
                plays: Vec::new(),
            },
            turn: None,
            last_trick: None,
            pending: None,
            giant_seat: None,
            giant_used: false,
            log: Vec::new(),
        };
        state
            .start_round(deals, true)
            .map_err(|_| CreateError::Deal)?;
        Ok(state)
    }

    /// Place `bid` for `seat`. Bids may arrive in any order.
    ///
    /// # Errors
    ///
    /// [`Rejection::NotYourTurn`] when it is not the bidding phase, the seat is not at the table,
    /// or that seat has already bid.
    /// [`Rejection::BidOutOfRange`] when `bid` is outside `0..=cards`.
    /// [`StepError::Broken`] when the state has lost a seat it used to have.
    pub fn bid(&mut self, seat: Seat, bid: i64) -> Result<Vec<GameEvent>, StepError> {
        self.transact(|state| state.bid_in(seat, bid))
    }

    /// Play `card` for `seat`. `played_as` is required for the Tigress and ignored for every other card.
    ///
    /// # Errors
    ///
    /// [`Rejection::NotYourTurn`] when it is not this seat's turn to play.
    /// [`Rejection::IllegalMove`] when the card is not in hand, breaks the lead suit, or the Tigress
    /// has no declaration.
    /// [`StepError::Broken`] when a card id in the state is not in the deck.
    pub fn play(
        &mut self,
        seat: Seat,
        card: CardId,
        played_as: Option<PlayedAs>,
    ) -> Result<Vec<GameEvent>, StepError> {
        self.transact(|state| state.play_in(seat, card, played_as))
    }

    /// Answer the open ability. The Seer accepts any choice; the choice is not stored.
    ///
    /// # Errors
    ///
    /// [`Rejection::NotYourTurn`] when this seat has no ability open.
    /// [`Rejection::IllegalMove`] when the choice does not fit that ability.
    /// [`StepError::Broken`] when the pending ability has no winner behind it.
    pub fn ability(
        &mut self,
        seat: Seat,
        choice: &AbilityChoice,
    ) -> Result<Vec<GameEvent>, StepError> {
        self.transact(|state| state.ability_in(seat, choice))
    }

    /// Leave `trickEnd` or `roundEnd`. This is the server's timer, not a client action.
    ///
    /// `deals` is used only when the next round starts.
    ///
    /// # Errors
    ///
    /// [`Rejection::NotYourTurn`] when nothing is waiting to advance.
    /// [`StepError::Broken`] when the next deal is not a permutation of the deck.
    pub fn advance(&mut self, deals: &mut impl DealSource) -> Result<Vec<GameEvent>, StepError> {
        self.transact(|state| state.advance_in(deals))
    }

    /// What `seat` is allowed to see.
    ///
    /// # Errors
    ///
    /// [`StepError::Broken`] when `seat` is not at this table or a stored card id is not in the deck.
    pub fn view(&self, seat: Seat) -> Result<EngineView, StepError> {
        let index = seat.checked(self.players)?;
        let hand = self.hands.get(index).ok_or(StepError::Broken)?.clone();
        let hiding = self.phase == Phase::Bidding;
        Ok(EngineView {
            me: seat,
            phase: self.phase,
            round: self.round,
            rounds: u8::try_from(self.schedule.len()).map_err(|_| StepError::Broken)?,
            cards: self.current_cards()?,
            dealer: self.dealer,
            turn: self.turn_seat(),
            hand: hand.clone(),
            hand_counts: self.hand_counts()?,
            played: self.played.clone(),
            bids: self.view_bids(index, hiding)?,
            won: self.won.clone(),
            trick: self.trick.clone(),
            last_trick: self.last_trick.clone(),
            log: self.log.clone(),
            pending: self.view_pending(seat),
            legal: self.view_legal(seat, &hand)?,
        })
    }

    /// One view per seat, in seat order.
    ///
    /// # Errors
    ///
    /// [`StepError::Broken`] when any seat's view cannot be built.
    pub fn views(&self) -> Result<Vec<EngineView>, StepError> {
        let mut views = Vec::with_capacity(usize::from(self.players));
        for index in 0..self.players {
            views.push(self.view(Seat::from_index(index))?);
        }
        Ok(views)
    }

    /// The canonical deck. Safe to send in `game.start`. It is not a shuffle.
    #[must_use]
    pub fn deck(&self) -> &[Card] {
        &self.deck
    }

    /// Cards dealt in each round, after the deck-size cap.
    #[must_use]
    pub fn schedule(&self) -> &[u8] {
        &self.schedule
    }

    /// Seats at the table.
    #[must_use]
    pub const fn player_count(&self) -> u8 {
        self.players
    }

    /// The rules this game was created with.
    #[must_use]
    pub const fn rules(&self) -> Ruleset {
        self.rules
    }

    /// What the table is waiting for.
    #[must_use]
    pub const fn phase(&self) -> Phase {
        self.phase
    }

    /// Running totals of finished rounds.
    ///
    /// # Errors
    ///
    /// [`StepError::Broken`] when a finished round is missing a score.
    pub fn totals(&self) -> Result<Vec<i32>, StepError> {
        score::totals(&self.rules, &self.log, self.players)
    }

    /// One row per finished round, one score per seat.
    ///
    /// # Errors
    ///
    /// [`StepError::Broken`] when a finished round is missing a bid or a trick count.
    pub fn scores(&self) -> Result<Vec<Vec<Score>>, StepError> {
        let mut rows = Vec::new();
        for record in &self.log {
            if !record.done {
                continue;
            }
            let mut row = Vec::with_capacity(usize::from(self.players));
            for index in 0..self.players {
                let scored = score::score_seat(&self.rules, record, Seat::from_index(index))?
                    .ok_or(StepError::Broken)?;
                row.push(scored);
            }
            rows.push(row);
        }
        Ok(rows)
    }

    fn transact<T>(
        &mut self,
        body: impl FnOnce(&mut Self) -> Result<T, StepError>,
    ) -> Result<T, StepError> {
        let mut next = self.clone();
        let value = body(&mut next)?;
        *self = next;
        Ok(value)
    }

    fn bid_in(&mut self, seat: Seat, bid: i64) -> Result<Vec<GameEvent>, StepError> {
        if self.phase != Phase::Bidding {
            return Err(Rejection::NotYourTurn.into());
        }
        let index = self.player_index(seat)?;
        if self.bids.get(index).ok_or(StepError::Broken)?.is_some() {
            return Err(Rejection::NotYourTurn.into());
        }
        let cards = i64::from(self.current_cards()?);
        if !(0..=cards).contains(&bid) {
            return Err(Rejection::BidOutOfRange.into());
        }
        let bid_u8 = u8::try_from(bid).map_err(|_| StepError::from(Rejection::BidOutOfRange))?;
        *self.bids.get_mut(index).ok_or(StepError::Broken)? = Some(bid_u8);
        let mut events = vec![GameEvent::BidPlaced { seat }];
        if self.bids.iter().all(Option::is_some) {
            // Human: Reveals all bids in one update once the last seat has bid, so nobody can react to a bid.
            // Agent: READS bids; WRITES log.bids, phase=Playing, turn; RETURNS BidPlaced and BidsRevealed; a single hidden bid is never serialised.
            let revealed = self.revealed_bids()?;
            let leader = self.trick.leader;
            self.record_mut()?.bids = revealed.iter().copied().map(Some).collect();
            self.phase = Phase::Playing;
            self.turn_set(Some(leader));
            events.push(GameEvent::BidsRevealed { bids: revealed });
        }
        Ok(events)
    }

    fn play_in(
        &mut self,
        seat: Seat,
        card: CardId,
        played_as: Option<PlayedAs>,
    ) -> Result<Vec<GameEvent>, StepError> {
        if self.phase != Phase::Playing || self.turn_seat() != Some(seat) {
            return Err(Rejection::NotYourTurn.into());
        }
        let index = self.player_index(seat)?;
        let hand = self.hands.get(index).ok_or(StepError::Broken)?;
        if !hand.contains(&card) {
            return Err(Rejection::IllegalMove.into());
        }
        if !card::is_legal(hand, &self.trick.plays, &self.deck, card)? {
            return Err(Rejection::IllegalMove.into());
        }
        let tigress_as = if is_tigress(&self.deck, card)? {
            Some(played_as.ok_or(Rejection::IllegalMove)?)
        } else {
            None
        };
        self.take_from_hand(index, card)?;
        let play = Play {
            seat,
            card,
            played_as: tigress_as,
        };
        self.trick.plays.push(play);
        self.played.push(card);
        let mut events = vec![GameEvent::CardPlayed {
            seat,
            card,
            played_as: tigress_as,
        }];
        if self.trick.plays.len() < usize::from(self.players) {
            self.turn_set(Some(seat.next(self.players)?));
            return Ok(events);
        }
        events.extend(self.finish_trick()?);
        Ok(events)
    }

    fn finish_trick(&mut self) -> Result<Vec<GameEvent>, StepError> {
        let result = card::resolve_trick(&self.trick.plays, &self.deck)?;
        let ability = self.ability_for(&result)?;
        self.apply_result(&result)?;
        let winner = result.winner;
        let effect = result.effect;
        let plays = self.trick.plays.clone();
        self.last_trick = Some(LastTrick {
            plays,
            result,
            ability,
        });
        self.phase = Phase::TrickEnd;
        self.turn_set(None);
        Ok(vec![GameEvent::TrickResolved {
            winner,
            effect,
            ability,
        }])
    }

    fn ability_for(
        &self,
        result: &crate::model::TrickResult,
    ) -> Result<Option<Ability>, StepError> {
        if !self.rules.abilities {
            return Ok(None);
        }
        let Some(_winner) = result.winner else {
            return Ok(None);
        };
        if result.win_index < 0 {
            return Ok(None);
        }
        let index = usize::try_from(result.win_index).map_err(|_| StepError::Broken)?;
        let card = self.trick.plays.get(index).ok_or(StepError::Broken)?.card;
        Ok(lookup(&self.deck, card)?.pirate_ability())
    }

    fn apply_result(&mut self, result: &crate::model::TrickResult) -> Result<(), StepError> {
        let Some(winner) = result.winner else {
            let record = self.record_mut()?;
            record.destroyed = record.destroyed.checked_add(1).ok_or(StepError::Broken)?;
            return Ok(());
        };
        let index = winner.checked(self.players)?;
        {
            let won = self.won.get_mut(index).ok_or(StepError::Broken)?;
            *won = won.checked_add(1).ok_or(StepError::Broken)?;
        }
        let captures = result.captures;
        let loot = result.loot.clone();
        let record = self.record_mut()?;
        add_count(
            record.b14.get_mut(index).ok_or(StepError::Broken)?,
            captures.b14,
        )?;
        add_count(
            record.mp.get_mut(index).ok_or(StepError::Broken)?,
            captures.mp,
        )?;
        add_count(
            record.ps.get_mut(index).ok_or(StepError::Broken)?,
            captures.ps,
        )?;
        if captures.black14 {
            record.black14 = SeatOrNone::from_seat(winner)?;
        }
        if captures.sm {
            record.sm = SeatOrNone::from_seat(winner)?;
        }
        record.loot.extend(loot);
        Ok(())
    }

    fn ability_in(
        &mut self,
        seat: Seat,
        choice: &AbilityChoice,
    ) -> Result<Vec<GameEvent>, StepError> {
        let pending = self.pending.clone();
        let Some(pending) = pending else {
            return Err(Rejection::NotYourTurn.into());
        };
        if self.phase != Phase::Ability || pending.seat != seat {
            return Err(Rejection::NotYourTurn.into());
        }
        let used = self.apply_choice(&pending, choice)?;
        self.pending = None;
        let mut events = vec![GameEvent::AbilityUsed(used)];
        events.extend(self.after_trick()?);
        Ok(events)
    }

    fn apply_choice(
        &mut self,
        pending: &Pending,
        choice: &AbilityChoice,
    ) -> Result<AbilityUsed, StepError> {
        match pending.kind {
            Ability::Helm => self.choose_helm(pending.seat, choice),
            Ability::Smuggler => self.choose_smuggler(pending, choice),
            Ability::Gambler => self.choose_gambler(pending.seat, choice),
            Ability::Giant => self.choose_giant(pending.seat, choice),
            Ability::Seer => Ok(AbilityUsed::Seer { seat: pending.seat }),
        }
    }

    fn choose_helm(
        &mut self,
        seat: Seat,
        choice: &AbilityChoice,
    ) -> Result<AbilityUsed, StepError> {
        let &AbilityChoice::Number(value) = choice else {
            return Err(Rejection::IllegalMove.into());
        };
        let Ok(index) = u8::try_from(value) else {
            return Err(Rejection::IllegalMove.into());
        };
        let leader = Seat::from_index(index);
        if leader.index() >= usize::from(self.players) {
            return Err(Rejection::IllegalMove.into());
        }
        self.trick.leader = leader;
        Ok(AbilityUsed::Helm {
            seat,
            choice: leader,
        })
    }

    fn choose_smuggler(
        &mut self,
        pending: &Pending,
        choice: &AbilityChoice,
    ) -> Result<AbilityUsed, StepError> {
        let AbilityChoice::Cards(ids) = choice else {
            return Err(Rejection::IllegalMove.into());
        };
        let Some(drawn) = pending.drawn.as_deref() else {
            return Err(StepError::Broken);
        };
        let index = pending.seat.checked(self.players)?;
        let hand = self.hands.get(index).ok_or(StepError::Broken)?;
        if ids.len() != drawn.len() || !distinct(ids) || !ids.iter().all(|id| hand.contains(id)) {
            return Err(Rejection::IllegalMove.into());
        }
        // Human: The discarded cards leave the hand and are never shown, not even as played cards.
        // Agent: READS pending.drawn length and the choice; WRITES the hand; RETURNS AbilityUsed::Smuggler { count }; discarded ids are not written to played, events, or any view.
        for id in ids {
            self.take_from_hand(index, *id)?;
        }
        let count = u8::try_from(ids.len()).map_err(|_| StepError::Broken)?;
        Ok(AbilityUsed::Smuggler {
            seat: pending.seat,
            count,
        })
    }

    fn choose_gambler(
        &mut self,
        seat: Seat,
        choice: &AbilityChoice,
    ) -> Result<AbilityUsed, StepError> {
        let &AbilityChoice::Number(value) = choice else {
            return Err(Rejection::IllegalMove.into());
        };
        if !matches!(value, 0 | 10 | 20) {
            return Err(Rejection::IllegalMove.into());
        }
        let index = seat.checked(self.players)?;
        let stake = u8::try_from(value).map_err(|_| StepError::Broken)?;
        *self
            .record_mut()?
            .wager
            .get_mut(index)
            .ok_or(StepError::Broken)? = stake;
        Ok(AbilityUsed::Gambler {
            seat,
            choice: stake,
        })
    }

    fn choose_giant(
        &mut self,
        seat: Seat,
        choice: &AbilityChoice,
    ) -> Result<AbilityUsed, StepError> {
        let &AbilityChoice::Number(value) = choice else {
            return Err(Rejection::IllegalMove.into());
        };
        if !matches!(value, -1..=1) {
            return Err(Rejection::IllegalMove.into());
        }
        let index = seat.checked(self.players)?;
        let current = self
            .bids
            .get(index)
            .ok_or(StepError::Broken)?
            .ok_or(StepError::Broken)?;
        let cards = i32::from(self.current_cards()?);
        let next = i32::from(current) + value;
        if !(0..=cards).contains(&next) {
            return Err(Rejection::IllegalMove.into());
        }
        let to = u8::try_from(next).map_err(|_| StepError::Broken)?;
        *self.bids.get_mut(index).ok_or(StepError::Broken)? = Some(to);
        let record = self.record_mut()?;
        record.giant = Some(crate::model::GiantChange {
            seat,
            from: current,
            to,
        });
        *record.bids.get_mut(index).ok_or(StepError::Broken)? = Some(to);
        let narrow = i8::try_from(value).map_err(|_| StepError::Broken)?;
        Ok(AbilityUsed::Giant {
            seat,
            choice: narrow,
            from: current,
            to,
        })
    }

    fn advance_in(&mut self, deals: &mut impl DealSource) -> Result<Vec<GameEvent>, StepError> {
        if self.phase == Phase::TrickEnd {
            return self.advance_trick();
        }
        if self.phase == Phase::RoundEnd {
            return self.advance_round(deals);
        }
        Err(Rejection::NotYourTurn.into())
    }

    fn advance_trick(&mut self) -> Result<Vec<GameEvent>, StepError> {
        let last = self.last_trick.clone().ok_or(StepError::Broken)?;
        let winner = last.result.winner;
        let ability = last.ability;
        let leader = last.result.leader;
        // Human: Seat 0's hand length is the cards left for everyone. Each trick plays one card, and the Smuggler discards as many cards as they drew, so the hands stay equal.
        // Agent: READS hands[0].len; a non-zero length means another trick remains. Does not read the other hands to decide this.
        let round_over = self.hands.first().ok_or(StepError::Broken)?.is_empty();
        self.trick = Trick {
            leader,
            plays: Vec::new(),
        };
        let mut events = vec![GameEvent::TrickCollected { winner }];
        if ability == Some(Ability::Giant) {
            self.giant_seat = Some(winner.ok_or(StepError::Broken)?);
        }
        if ability == Some(Ability::Helm) && !round_over {
            self.start_ability(
                &mut events,
                Ability::Helm,
                winner.ok_or(StepError::Broken)?,
                None,
            );
        } else if ability == Some(Ability::Smuggler) && !round_over && !self.pile.is_empty() {
            let seat = winner.ok_or(StepError::Broken)?;
            let drawn = self.draw_smuggler(seat)?;
            self.start_ability(&mut events, Ability::Smuggler, seat, Some(drawn));
        } else if ability == Some(Ability::Gambler) {
            self.start_ability(
                &mut events,
                Ability::Gambler,
                winner.ok_or(StepError::Broken)?,
                None,
            );
        } else if ability == Some(Ability::Seer) && !round_over && !self.pile.is_empty() {
            self.start_ability(
                &mut events,
                Ability::Seer,
                winner.ok_or(StepError::Broken)?,
                None,
            );
        } else {
            events.extend(self.after_trick()?);
        }
        Ok(events)
    }

    fn draw_smuggler(&mut self, seat: Seat) -> Result<Vec<CardId>, StepError> {
        let count = self.pile.len().min(2);
        let drawn = self.pile.drain(..count).collect::<Vec<_>>();
        let index = seat.checked(self.players)?;
        self.hands
            .get_mut(index)
            .ok_or(StepError::Broken)?
            .extend(drawn.iter().copied());
        Ok(drawn)
    }

    fn advance_round(&mut self, deals: &mut impl DealSource) -> Result<Vec<GameEvent>, StepError> {
        let last = self
            .schedule
            .len()
            .checked_sub(1)
            .ok_or(StepError::Broken)?;
        if usize::from(self.round) < last {
            self.start_round(deals, false)?;
            return Ok(vec![GameEvent::RoundStarted { round: self.round }]);
        }
        self.phase = Phase::GameOver;
        Ok(vec![GameEvent::GameOver])
    }

    fn after_trick(&mut self) -> Result<Vec<GameEvent>, StepError> {
        let cards_left = !self.hands.first().ok_or(StepError::Broken)?.is_empty();
        if cards_left {
            self.phase = Phase::Playing;
            self.turn_set(Some(self.trick.leader));
            return Ok(Vec::new());
        }
        if let Some(seat) = self.giant_seat
            && !self.giant_used
        {
            self.giant_used = true;
            let mut events = Vec::new();
            self.start_ability(&mut events, Ability::Giant, seat, None);
            return Ok(events);
        }
        self.end_round()
    }

    fn end_round(&mut self) -> Result<Vec<GameEvent>, StepError> {
        let won = self.won.clone();
        let round = self.round;
        {
            let record = self.record_mut()?;
            record.tricks = won.into_iter().map(Some).collect();
            record.done = true;
        }
        self.phase = Phase::RoundEnd;
        self.turn = None;
        Ok(vec![GameEvent::RoundEnded { round }])
    }

    fn start_ability(
        &mut self,
        events: &mut Vec<GameEvent>,
        kind: Ability,
        seat: Seat,
        drawn: Option<Vec<CardId>>,
    ) {
        self.phase = Phase::Ability;
        self.turn_set(None);
        self.pending = Some(Pending { kind, seat, drawn });
        events.push(GameEvent::AbilityStarted { kind, seat });
    }

    fn start_round(&mut self, deals: &mut impl DealSource, first: bool) -> Result<(), StepError> {
        if !first {
            self.round = self.round.checked_add(1).ok_or(StepError::Broken)?;
            self.dealer = self.dealer.next(self.players)?;
        }
        let cards = self.current_cards()?;
        let order = deals.deal_order(usize::from(self.round));
        self.apply_deal(&order, cards)?;
        let players = usize::from(self.players);
        self.played.clear();
        self.bids = vec![None; players];
        self.won = vec![0; players];
        self.trick = Trick {
            leader: self.dealer.next(self.players)?,
            plays: Vec::new(),
        };
        self.turn_set(None);
        self.last_trick = None;
        self.pending = None;
        self.giant_seat = None;
        self.giant_used = false;
        self.phase = Phase::Bidding;
        self.log.push(RoundRecord::fresh(players, cards));
        Ok(())
    }

    fn apply_deal(&mut self, order: &[CardId], cards: u8) -> Result<(), StepError> {
        if order.len() != self.deck.len() || !permutation(order, self.deck.len()) {
            return Err(StepError::Broken);
        }
        let width = usize::from(cards);
        let players = usize::from(self.players);
        let dealt = width.checked_mul(players).ok_or(StepError::Broken)?;
        if dealt > order.len() {
            return Err(StepError::Broken);
        }
        let mut hands = Vec::with_capacity(players);
        for index in 0..players {
            let start = index * width;
            let end = start + width;
            hands.push(order.get(start..end).ok_or(StepError::Broken)?.to_vec());
        }
        self.hands = hands;
        self.pile = order.get(dealt..).ok_or(StepError::Broken)?.to_vec();
        Ok(())
    }

    fn view_bids(&self, seat: usize, hiding: bool) -> Result<Vec<Option<i8>>, StepError> {
        let mut bids = Vec::with_capacity(self.bids.len());
        for (index, bid) in self.bids.iter().enumerate() {
            let shown = match bid {
                Some(_) if hiding && index != seat => Some(-1),
                Some(value) => Some(i8::try_from(*value).map_err(|_| StepError::Broken)?),
                None => None,
            };
            bids.push(shown);
        }
        Ok(bids)
    }

    fn view_pending(&self, seat: Seat) -> Option<PendingView> {
        let pending = self.pending.as_ref()?;
        let mine = pending.seat == seat;
        // Human: The Seer sees the undealt pile only on their own view, and only while the ability is open. The pile is read here and is not copied into the event.
        // Agent: READS pile, pending.seat, pending.kind; WRITES view.pending.peek for that seat only; other seats omit peek; events never include the pile.
        let peek = if mine && pending.kind == Ability::Seer {
            Some(self.pile.clone())
        } else {
            None
        };
        let drawn = if mine { pending.drawn.clone() } else { None };
        Some(PendingView {
            kind: pending.kind,
            seat: pending.seat,
            drawn,
            peek,
        })
    }

    fn view_legal(&self, seat: Seat, hand: &[CardId]) -> Result<Vec<CardId>, StepError> {
        if self.phase == Phase::Playing && self.turn_seat() == Some(seat) {
            card::legal_cards(hand, &self.trick.plays, &self.deck)
        } else {
            Ok(Vec::new())
        }
    }

    fn hand_counts(&self) -> Result<Vec<u8>, StepError> {
        self.hands
            .iter()
            .map(|hand| u8::try_from(hand.len()).map_err(|_| StepError::Broken))
            .collect()
    }

    fn revealed_bids(&self) -> Result<Vec<u8>, StepError> {
        self.bids
            .iter()
            .map(|bid| bid.ok_or(StepError::Broken))
            .collect()
    }

    fn current_cards(&self) -> Result<u8, StepError> {
        self.schedule
            .get(usize::from(self.round))
            .copied()
            .ok_or(StepError::Broken)
    }

    fn record_mut(&mut self) -> Result<&mut RoundRecord, StepError> {
        self.log
            .get_mut(usize::from(self.round))
            .ok_or(StepError::Broken)
    }

    fn player_index(&self, seat: Seat) -> Result<usize, StepError> {
        let index = seat.index();
        if index < usize::from(self.players) {
            Ok(index)
        } else {
            Err(Rejection::NotYourTurn.into())
        }
    }

    fn turn_seat(&self) -> Option<Seat> {
        match self.phase {
            Phase::Playing => self.turn,
            _ => None,
        }
    }

    fn turn_set(&mut self, turn: Option<Seat>) {
        self.turn = turn;
    }

    fn take_from_hand(&mut self, index: usize, card: CardId) -> Result<(), StepError> {
        let hand = self.hands.get_mut(index).ok_or(StepError::Broken)?;
        let position = hand
            .iter()
            .position(|id| *id == card)
            .ok_or(Rejection::IllegalMove)?;
        hand.remove(position);
        Ok(())
    }
}

fn schedule_for(format: Format, deck_len: usize, players: u8) -> Result<Vec<u8>, CreateError> {
    if players == 0 {
        return Err(CreateError::PlayerCount);
    }
    let max = deck_len / usize::from(players);
    let max_u8 = u8::try_from(max).map_err(|_| CreateError::Deal)?;
    Ok(format
        .sequence()
        .iter()
        .map(|cards| (*cards).min(max_u8))
        .collect())
}

fn permutation(order: &[CardId], deck_len: usize) -> bool {
    if order.len() != deck_len {
        return false;
    }
    let mut seen = vec![false; deck_len];
    for id in order {
        let Some(slot) = seen.get_mut(id.index()) else {
            return false;
        };
        if *slot {
            return false;
        }
        *slot = true;
    }
    seen.iter().all(|present| *present)
}

fn add_count(slot: &mut u8, amount: u8) -> Result<(), StepError> {
    *slot = slot.checked_add(amount).ok_or(StepError::Broken)?;
    Ok(())
}

fn distinct(ids: &[CardId]) -> bool {
    let mut seen = Vec::with_capacity(ids.len());
    for id in ids {
        if seen.contains(id) {
            return false;
        }
        seen.push(*id);
    }
    true
}
