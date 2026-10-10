//! Hidden-information properties. The driver looks at per-seat views, then the check permutes
//! the cards and bids that seat cannot know and requires the view bytes to stay the same.

use std::collections::HashSet;

use crate::card::Card;
use crate::ids::{CardId, Seat};
use crate::model::{Ability, AbilityChoice, EngineView, GameEvent, Phase, PlayedAs};
use crate::rng::{self, Rng};
use crate::rules::{Expansions, Format, Ruleset, Scoring};
use crate::{DealSource, GameState, StepError};

struct XorShift(u64);

impl Rng for XorShift {
    fn next_f64(&mut self) -> f64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = if x == 0 { 0xA5A5_A5A5_A5A5_A5A5 } else { x };
        let bits = u32::try_from(self.0 >> 32).unwrap_or(0);
        f64::from(bits) / f64::from(u32::MAX)
    }
}

impl XorShift {
    fn index(&mut self, len: usize) -> usize {
        if len == 0 {
            return 0;
        }
        let width = u32::try_from(len).unwrap_or(u32::MAX);
        rng::floor_usize(self.next_f64() * f64::from(width)).min(len - 1)
    }
}

struct Shuffling {
    deck: Vec<CardId>,
    rng: XorShift,
}

impl DealSource for Shuffling {
    fn deal_order(&mut self, _round: usize) -> Vec<CardId> {
        let mut order = self.deck.clone();
        for index in (1..order.len()).rev() {
            let swap = self.rng.index(index + 1);
            order.swap(index, swap);
        }
        order
    }
}

fn play_game(seed: u64, players: u8, scoring: Scoring) -> Result<(), StepError> {
    let rules = Ruleset::new(scoring, Format::Swift, Expansions::all(), true);
    let deck = crate::build_deck(rules.expansions).map_err(|_| StepError::Broken)?;
    let mut deals = Shuffling {
        deck: deck.iter().copied().map(Card::id).collect(),
        rng: XorShift(seed | 1),
    };
    let mut game = GameState::create(rules, players, Seat::from_index(0), &mut deals)
        .map_err(|_| StepError::Broken)?;
    let mut guard = 0u32;
    loop {
        if game.phase() == Phase::GameOver {
            let _ = game.totals()?;
            let _ = game.scores()?;
            return Ok(());
        }
        guard += 1;
        if guard > 4_000 {
            return Err(StepError::Broken);
        }
        let views = game.views()?;
        check_views(&game, &views)?;
        step(&mut game, &views, &mut deals)?;
    }
}

fn step(
    game: &mut GameState,
    views: &[EngineView],
    deals: &mut Shuffling,
) -> Result<(), StepError> {
    let phase = views.first().ok_or(StepError::Broken)?.phase;
    match phase {
        Phase::Bidding => {
            let seat = views[0]
                .bids
                .iter()
                .position(Option::is_none)
                .ok_or(StepError::Broken)?;
            let view = views.get(seat).ok_or(StepError::Broken)?;
            let bid = i64::from(
                u32::try_from(deals.rng.index(view.hand.len().saturating_add(1)))
                    .map_err(|_| StepError::Broken)?,
            );
            let events = game.bid(
                Seat::from_index(u8::try_from(seat).map_err(|_| StepError::Broken)?),
                bid,
            )?;
            check_events(&events, &game.played);
        }
        Phase::Playing => {
            let seat = views[0].turn.ok_or(StepError::Broken)?;
            let view = views.get(seat.index()).ok_or(StepError::Broken)?;
            let legal = &view.legal;
            let card = *legal
                .get(deals.rng.index(legal.len()))
                .ok_or(StepError::Broken)?;
            let played_as = if game
                .deck()
                .get(card.index())
                .copied()
                .is_some_and(Card::is_tigress)
            {
                Some(if deals.rng.next_f64() < 0.5 {
                    PlayedAs::Pirate
                } else {
                    PlayedAs::Escape
                })
            } else {
                None
            };
            let events = game.play(seat, card, played_as)?;
            check_events(&events, &game.played);
        }
        Phase::Ability => {
            let pending = views[0].pending.as_ref().ok_or(StepError::Broken)?;
            let view = views.get(pending.seat.index()).ok_or(StepError::Broken)?;
            let choice = choice_for(view, &mut deals.rng)?;
            let events = game.ability(pending.seat, &choice)?;
            check_events(&events, &game.played);
        }
        Phase::TrickEnd | Phase::RoundEnd => {
            let events = game.advance(deals)?;
            check_events(&events, &game.played);
        }
        Phase::GameOver => {}
    }
    Ok(())
}

fn choice_for(view: &EngineView, rng: &mut XorShift) -> Result<AbilityChoice, StepError> {
    let pending = view.pending.as_ref().ok_or(StepError::Broken)?;
    Ok(match pending.kind {
        Ability::Helm => {
            let seat = i32::from(
                u8::try_from(rng.index(view.hand_counts.len())).map_err(|_| StepError::Broken)?,
            );
            AbilityChoice::Number(seat)
        }
        Ability::Smuggler => {
            let count = pending
                .drawn
                .as_ref()
                .map(Vec::len)
                .ok_or(StepError::Broken)?;
            let mut hand = view.hand.clone();
            let mut chosen = Vec::new();
            for _ in 0..count {
                let index = rng.index(hand.len());
                chosen.push(hand.remove(index));
            }
            AbilityChoice::Cards(chosen)
        }
        Ability::Gambler => AbilityChoice::Number([0, 10, 20][rng.index(3)]),
        Ability::Giant => {
            let bid = view
                .bids
                .get(view.me.index())
                .ok_or(StepError::Broken)?
                .ok_or(StepError::Broken)?;
            let mut choice = [-1, 0, 1][rng.index(3)];
            let next = i32::from(bid) + choice;
            let cards = i32::from(view.cards);
            if !(0..=cards).contains(&next) {
                choice = 0;
            }
            AbilityChoice::Number(choice)
        }
        Ability::Seer => AbilityChoice::Pass(()),
    })
}

fn check_views(game: &GameState, views: &[EngineView]) -> Result<(), StepError> {
    for (index, view) in views.iter().enumerate() {
        let before = serde_json::to_vec(view).map_err(|_| StepError::Broken)?;
        let mut hidden = game.clone();
        permute_hidden(
            &mut hidden,
            index,
            &mut XorShift(0x1234_5678_9ABC_DEF0 ^ u64::try_from(index).unwrap_or(0)),
        );
        let seat = Seat::from_index(u8::try_from(index).map_err(|_| StepError::Broken)?);
        let after = serde_json::to_vec(&hidden.view(seat)?).map_err(|_| StepError::Broken)?;
        assert_eq!(before, after, "seat {index} can tell hidden cards changed");
        assert_closed(game, view)?;
    }
    Ok(())
}

fn permute_hidden(game: &mut GameState, seat: usize, rng: &mut XorShift) {
    let seer = matches!(
        &game.pending,
        Some(pending) if pending.kind == Ability::Seer && pending.seat.index() == seat
    );
    let mut bag = Vec::new();
    for (index, hand) in game.hands.iter().enumerate() {
        if index != seat {
            bag.extend(hand.iter().copied());
        }
    }
    if !seer {
        bag.extend(game.pile.iter().copied());
    }
    for index in (1..bag.len()).rev() {
        bag.swap(index, rng.index(index + 1));
    }
    let mut cursor = 0usize;
    for (index, hand) in game.hands.iter_mut().enumerate() {
        if index == seat {
            continue;
        }
        let end = cursor + hand.len();
        hand.clone_from_slice(&bag[cursor..end]);
        cursor = end;
    }
    if !seer {
        game.pile.clone_from_slice(&bag[cursor..]);
    }
    if game.phase == Phase::Bidding {
        let mut values = Vec::new();
        for (index, bid) in game.bids.iter().enumerate() {
            if index != seat
                && let Some(value) = bid
            {
                values.push(*value);
            }
        }
        for index in (1..values.len()).rev() {
            values.swap(index, rng.index(index + 1));
        }
        let mut cursor = 0usize;
        for (index, bid) in game.bids.iter_mut().enumerate() {
            if index != seat && bid.is_some() {
                *bid = Some(values[cursor]);
                cursor += 1;
            }
        }
    }
}

fn assert_closed(game: &GameState, view: &EngineView) -> Result<(), StepError> {
    let seat = view.me.index();
    let own = game.hands.get(seat).ok_or(StepError::Broken)?;
    let mut allowed: HashSet<CardId> = own
        .iter()
        .copied()
        .chain(game.played.iter().copied())
        .collect();
    if let Some(pending) = &view.pending {
        if pending.seat == view.me {
            if let Some(drawn) = &pending.drawn {
                allowed.extend(drawn.iter().copied());
            }
            if let Some(peek) = &pending.peek {
                allowed.extend(peek.iter().copied());
            }
        } else {
            assert!(pending.drawn.is_none());
            assert!(pending.peek.is_none());
        }
    }
    for id in view
        .hand
        .iter()
        .chain(view.legal.iter())
        .chain(view.played.iter())
    {
        assert!(allowed.contains(id), "view leaked {id:?}");
    }
    for play in view
        .trick
        .plays
        .iter()
        .chain(view.last_trick.iter().flat_map(|trick| trick.plays.iter()))
    {
        assert!(
            game.played.contains(&play.card),
            "trick showed a card that was not played"
        );
    }
    if view.phase == Phase::Bidding {
        for (index, bid) in view.bids.iter().enumerate() {
            if index != seat {
                assert!(matches!(bid, None | Some(-1)));
            }
        }
    }
    Ok(())
}

fn check_events(events: &[GameEvent], played: &[CardId]) {
    for event in events {
        if let GameEvent::CardPlayed { card, .. } = event {
            assert!(played.contains(card));
        }
    }
}

#[test]
fn every_player_count_hides_the_same_information() {
    for players in 2..=8 {
        play_game(0x517A_0000 + u64::from(players), players, Scoring::Classic).expect("classic");
        play_game(0x517A_0100 + u64::from(players), players, Scoring::Rascal).expect("rascal");
    }
}

#[test]
fn proptest_hidden_information() {
    let config = proptest::test_runner::Config {
        cases: 32,
        failure_persistence: Some(Box::new(proptest::test_runner::FileFailurePersistence::Off)),
        ..proptest::test_runner::Config::default()
    };
    let mut runner = proptest::test_runner::TestRunner::new(config);
    runner
        .run(
            &(proptest::prelude::any::<u64>(), 2u8..=8u8, 0u8..=1u8),
            |(seed, players, scoring)| {
                let scoring = if scoring == 0 {
                    Scoring::Classic
                } else {
                    Scoring::Rascal
                };
                play_game(seed, players, scoring).map_err(|error| {
                    proptest::test_runner::TestCaseError::fail(format!("{error}"))
                })?;
                Ok(())
            },
        )
        .expect("proptest");
}
