//! Trick, scoring, bid, and ability tests that do not need `fixtures/engine`.

use crate::card::{Card, build_deck, resolve_trick};
use crate::ids::{CardId, Seat};
use crate::model::{AbilityChoice, Beast, Phase, Play, PlayedAs};
use crate::rules::{BotLevel, Expansions, Format, Ruleset, Scoring};
use crate::{
    DealSource, GameState, Rejection, Rng, RoundRecord, StepError, choose_bid, score_seat,
};

struct FixedRng(f64);

impl Rng for FixedRng {
    fn next_f64(&mut self) -> f64 {
        self.0
    }
}

struct Scripted {
    rounds: Vec<Vec<CardId>>,
}

impl DealSource for Scripted {
    fn deal_order(&mut self, round: usize) -> Vec<CardId> {
        self.rounds.get(round).cloned().unwrap_or_default()
    }
}

fn rules(abilities: bool, expansions: Expansions) -> Ruleset {
    Ruleset::new(Scoring::Classic, Format::Swift, expansions, abilities)
}

fn identity(expansions: Expansions) -> Vec<CardId> {
    build_deck(expansions)
        .expect("deck")
        .iter()
        .copied()
        .map(Card::id)
        .collect()
}

fn deal_hands(expansions: Expansions, hands: &[Vec<u8>]) -> Vec<CardId> {
    let deck = identity(expansions);
    let mut order = Vec::new();
    let mut used = vec![false; deck.len()];
    for hand in hands {
        for id in hand {
            order.push(CardId::from_index(*id));
            used[usize::from(*id)] = true;
        }
    }
    for (index, id) in deck.iter().enumerate() {
        if !used[index] {
            order.push(*id);
        }
    }
    order
}

fn play(seat: u8, card: u8, played_as: Option<PlayedAs>) -> Play {
    Play {
        seat: Seat::from_index(seat),
        card: CardId::from_index(card),
        played_as,
    }
}

fn deck(expansions: Expansions) -> Vec<Card> {
    build_deck(expansions).expect("deck")
}

#[test]
fn static_assertion_game_state_is_not_serialized() {
    static_assertions::assert_not_impl_any!(GameState: serde::Serialize);
}

#[test]
fn mermaid_catches_the_skull_king_and_pirates_are_not_also_counted() {
    let cards = deck(Expansions::none());
    let plays = vec![play(0, 67, None), play(1, 61, None), play(2, 68, None)];
    let result = resolve_trick(&plays, &cards).expect("trick");
    assert_eq!(result.winner, Some(Seat::from_index(2)));
    assert!(result.captures.sm);
    assert_eq!(result.captures.ps, 0);
    assert_eq!(result.captures.mp, 0);
}

#[test]
fn skull_king_counts_pirates_including_tigress_as_pirate() {
    let cards = deck(Expansions::none());
    let plays = vec![
        play(0, 61, None),
        play(1, 66, Some(PlayedAs::Pirate)),
        play(2, 67, None),
    ];
    let result = resolve_trick(&plays, &cards).expect("trick");
    assert_eq!(result.winner, Some(Seat::from_index(2)));
    assert_eq!(result.captures.ps, 2);
    assert!(!result.captures.sm);
}

#[test]
fn black_fourteen_beats_another_suit_and_the_winner_takes_both() {
    let cards = deck(Expansions::none());
    let plays = vec![play(0, 13, None), play(1, 55, None)];
    let result = resolve_trick(&plays, &cards).expect("trick");
    assert_eq!(result.winner, Some(Seat::from_index(1)));
    assert!(result.captures.black14);
    assert_eq!(result.captures.b14, 1);
}

#[test]
fn off_suit_number_does_not_beat_the_lead() {
    let cards = deck(Expansions::none());
    let plays = vec![play(0, 0, None), play(1, 14, None)];
    let result = resolve_trick(&plays, &cards).expect("trick");
    assert_eq!(result.winner, Some(Seat::from_index(0)));
}

#[test]
fn all_escapes_the_first_card_wins() {
    let cards = deck(Expansions::none());
    let plays = vec![
        play(0, 56, None),
        play(1, 66, Some(PlayedAs::Escape)),
        play(2, 57, None),
    ];
    let result = resolve_trick(&plays, &cards).expect("trick");
    assert_eq!(result.winner, Some(Seat::from_index(0)));
    assert_eq!(result.win_index, 0);
}

#[test]
fn kraken_destroys_the_trick_and_the_would_be_winner_leads() {
    let cards = deck(Expansions::all());
    let plays = vec![play(0, 72, None), play(1, 55, None)];
    let result = resolve_trick(&plays, &cards).expect("trick");
    assert_eq!(result.winner, None);
    assert_eq!(result.win_index, -1);
    assert_eq!(result.effect, Some(Beast::Kraken));
    assert_eq!(result.leader, Seat::from_index(1));
    assert_eq!(result.captures, crate::Captures::default());
}

#[test]
fn whale_tie_keeps_the_first_number_and_skips_character_captures() {
    let cards = deck(Expansions::all());
    let tie = vec![play(0, 73, None), play(1, 5, None), play(2, 19, None)];
    let result = resolve_trick(&tie, &cards).expect("trick");
    assert_eq!(result.winner, Some(Seat::from_index(1)));
    assert_eq!(result.effect, Some(Beast::Whale));
    let characters = vec![
        play(0, 73, None),
        play(1, 13, None),
        play(2, 61, None),
        play(3, 68, None),
    ];
    let result = resolve_trick(&characters, &cards).expect("trick");
    assert_eq!(result.winner, Some(Seat::from_index(1)));
    assert_eq!(result.captures.b14, 1);
    assert_eq!(result.captures.mp, 0);
    assert_eq!(result.captures.ps, 0);
    assert!(!result.captures.sm);
}

#[test]
fn later_beast_wins_when_both_are_played() {
    let cards = deck(Expansions::all());
    let whale_then_kraken = vec![play(0, 73, None), play(1, 72, None), play(2, 13, None)];
    let result = resolve_trick(&whale_then_kraken, &cards).expect("trick");
    assert_eq!(result.effect, Some(Beast::Kraken));
    assert_eq!(result.winner, None);
    let kraken_then_whale = vec![play(0, 72, None), play(1, 73, None), play(2, 13, None)];
    let result = resolve_trick(&kraken_then_whale, &cards).expect("trick");
    assert_eq!(result.effect, Some(Beast::Whale));
    assert_eq!(result.winner, Some(Seat::from_index(2)));
}

#[test]
fn whale_without_a_number_is_destroyed() {
    let cards = deck(Expansions::all());
    let plays = vec![play(0, 56, None), play(1, 73, None)];
    let result = resolve_trick(&plays, &cards).expect("trick");
    assert_eq!(result.winner, None);
    assert_eq!(result.leader, Seat::from_index(1));
}

#[test]
fn loot_moves_to_the_winner_unless_they_played_it() {
    let cards = deck(Expansions::all());
    let plays = vec![play(0, 70, None), play(1, 5, None)];
    let result = resolve_trick(&plays, &cards).expect("trick");
    assert_eq!(result.winner, Some(Seat::from_index(1)));
    assert_eq!(result.loot.len(), 1);
    assert_eq!(result.loot[0].from, Seat::from_index(0));
    assert_eq!(result.loot[0].to, Seat::from_index(1));
}

#[test]
fn bids_stay_hidden_until_every_seat_has_bid() {
    let order = identity(Expansions::none());
    let mut deals = Scripted {
        rounds: vec![order],
    };
    let mut game = GameState::create(
        rules(false, Expansions::none()),
        2,
        Seat::from_index(0),
        &mut deals,
    )
    .expect("create");
    game.bid(Seat::from_index(1), 1).expect("bid");
    let seat0 = game.view(Seat::from_index(0)).expect("view");
    assert_eq!(seat0.bids, vec![None, Some(-1)]);
    assert!(seat0.log[0].bids.iter().all(Option::is_none));
    let events = game.bid(Seat::from_index(0), 0).expect("bid");
    assert!(
        events
            .iter()
            .any(|event| matches!(event, crate::GameEvent::BidsRevealed { .. }))
    );
    let seat0 = game.view(Seat::from_index(0)).expect("view");
    assert_eq!(seat0.bids, vec![Some(0), Some(1)]);
    assert_eq!(seat0.phase, Phase::Playing);
}

#[test]
fn rejected_bid_does_not_change_the_view() {
    let order = identity(Expansions::none());
    let mut deals = Scripted {
        rounds: vec![order],
    };
    let mut game = GameState::create(
        rules(false, Expansions::none()),
        2,
        Seat::from_index(0),
        &mut deals,
    )
    .expect("create");
    let before = game.views().expect("views");
    let error = game.bid(Seat::from_index(0), 11).expect_err("range");
    assert_eq!(error, StepError::Rejected(Rejection::BidOutOfRange));
    assert_eq!(game.views().expect("views"), before);
    let error = game
        .play(Seat::from_index(0), CardId::from_index(0), None)
        .expect_err("phase");
    assert_eq!(error, StepError::Rejected(Rejection::NotYourTurn));
    assert_eq!(game.views().expect("views"), before);
}

#[test]
fn tigress_without_a_declaration_is_illegal_and_a_stray_declaration_is_ignored() {
    let hands = vec![vec![66, 0, 1, 2, 3], vec![4, 5, 6, 7, 8]];
    let order = deal_hands(Expansions::none(), &hands);
    let mut deals = Scripted {
        rounds: vec![order.clone(), order],
    };
    let mut game = GameState::create(
        rules(false, Expansions::none()),
        2,
        Seat::from_index(0),
        &mut deals,
    )
    .expect("create");
    game.bid(Seat::from_index(0), 1).expect("bid");
    game.bid(Seat::from_index(1), 1).expect("bid");
    let error = game
        .play(Seat::from_index(1), CardId::from_index(66), None)
        .expect_err("tigress");
    assert_eq!(error, StepError::Rejected(Rejection::IllegalMove));
    let events = game
        .play(
            Seat::from_index(1),
            CardId::from_index(4),
            Some(PlayedAs::Pirate),
        )
        .expect("play");
    match &events[0] {
        crate::GameEvent::CardPlayed {
            played_as, card, ..
        } => {
            assert_eq!(*card, CardId::from_index(4));
            assert!(played_as.is_none());
        }
        other => panic!("unexpected {other:?}"),
    }
}

#[test]
fn must_follow_suit() {
    let hands = vec![vec![0, 14, 1, 2, 3], vec![15, 42, 5, 6, 7]];
    let order = deal_hands(Expansions::none(), &hands);
    let mut deals = Scripted {
        rounds: vec![order.clone(), order],
    };
    let mut game = GameState::create(
        rules(false, Expansions::none()),
        2,
        Seat::from_index(0),
        &mut deals,
    )
    .expect("create");
    game.bid(Seat::from_index(0), 0).expect("bid");
    game.bid(Seat::from_index(1), 0).expect("bid");
    // Dealer is seat 0, so seat 1 leads yellow. Seat 0 holds a yellow and must follow it.
    game.play(Seat::from_index(1), CardId::from_index(15), None)
        .expect("lead yellow");
    let error = game
        .play(Seat::from_index(0), CardId::from_index(0), None)
        .expect_err("follow");
    assert_eq!(error, StepError::Rejected(Rejection::IllegalMove));
    game.play(Seat::from_index(0), CardId::from_index(14), None)
        .expect("yellow");
}

#[test]
fn smuggler_discards_are_not_shown_and_seer_peek_is_private() {
    // Seat 1 leads and wins with the Smuggler (id 62), seat 0 plays an escape.
    // Pile is non-empty. Abilities on. Not the last trick: 5 cards, one played.
    let hands = vec![vec![56, 0, 1, 2, 3], vec![62, 4, 5, 6, 7]];
    let order = deal_hands(Expansions::none(), &hands);
    let mut deals = Scripted {
        rounds: vec![order.clone(), order],
    };
    let mut game = GameState::create(
        rules(true, Expansions::none()),
        2,
        Seat::from_index(0),
        &mut deals,
    )
    .expect("create");
    game.bid(Seat::from_index(0), 0).expect("bid");
    game.bid(Seat::from_index(1), 1).expect("bid");
    game.play(Seat::from_index(1), CardId::from_index(62), None)
        .expect("smuggler");
    game.play(Seat::from_index(0), CardId::from_index(56), None)
        .expect("escape");
    let events = game.advance(&mut deals).expect("advance");
    assert!(events.iter().any(|event| matches!(
        event,
        crate::GameEvent::AbilityStarted {
            kind: crate::Ability::Smuggler,
            ..
        }
    )));
    let smuggler = game.view(Seat::from_index(1)).expect("view");
    let other = game.view(Seat::from_index(0)).expect("view");
    let drawn = smuggler
        .pending
        .as_ref()
        .and_then(|pending| pending.drawn.clone())
        .expect("drawn");
    assert!(
        other
            .pending
            .as_ref()
            .and_then(|pending| pending.drawn.as_ref())
            .is_none()
    );
    assert!(
        other
            .pending
            .as_ref()
            .and_then(|pending| pending.peek.as_ref())
            .is_none()
    );
    let before_played = smuggler.played.clone();
    let count = drawn.len();
    let choice: Vec<_> = smuggler.hand.iter().copied().take(count).collect();
    game.ability(Seat::from_index(1), &AbilityChoice::Cards(choice))
        .expect("discard");
    let after = game.view(Seat::from_index(1)).expect("view");
    assert_eq!(after.played, before_played);
    assert!(after.pending.is_none());
}

#[test]
fn seer_peek_is_only_on_the_seers_view() {
    let hands = vec![vec![56, 0, 1, 2, 3], vec![64, 4, 5, 6, 7]];
    let order = deal_hands(Expansions::none(), &hands);
    let mut deals = Scripted {
        rounds: vec![order.clone(), order],
    };
    let mut game = GameState::create(
        rules(true, Expansions::none()),
        2,
        Seat::from_index(0),
        &mut deals,
    )
    .expect("create");
    game.bid(Seat::from_index(0), 0).expect("bid");
    game.bid(Seat::from_index(1), 1).expect("bid");
    game.play(Seat::from_index(1), CardId::from_index(64), None)
        .expect("seer");
    game.play(Seat::from_index(0), CardId::from_index(56), None)
        .expect("escape");
    game.advance(&mut deals).expect("advance");
    let seer = game.view(Seat::from_index(1)).expect("view");
    let other = game.view(Seat::from_index(0)).expect("view");
    assert!(
        seer.pending
            .as_ref()
            .and_then(|pending| pending.peek.as_ref())
            .is_some()
    );
    assert!(
        other
            .pending
            .as_ref()
            .and_then(|pending| pending.peek.as_ref())
            .is_none()
    );
    let bytes = serde_json::to_vec(&other).expect("json");
    assert!(!bytes.windows(4).any(|window| window == b"peek"));
    game.ability(Seat::from_index(1), &AbilityChoice::Number(99))
        .expect("any choice");
    assert!(
        game.view(Seat::from_index(1))
            .expect("view")
            .pending
            .is_none()
    );
}

#[test]
fn classic_zero_bid_rascal_glance_and_lost_wager() {
    let mut record = RoundRecord::fresh(1, 5);
    record.bids = vec![Some(0)];
    record.tricks = vec![Some(0)];
    record.done = true;
    let rules = Ruleset::new(Scoring::Classic, Format::Swift, Expansions::none(), false);
    let score = score_seat(&rules, &record, Seat::from_index(0))
        .expect("score")
        .expect("present");
    assert_eq!(score.base, 50);
    assert_eq!(score.total, 50);
    record.tricks = vec![Some(1)];
    let score = score_seat(&rules, &record, Seat::from_index(0))
        .expect("score")
        .expect("present");
    assert_eq!(score.base, -50);
    assert_eq!(score.bonus, 0);

    record.bids = vec![Some(2)];
    record.tricks = vec![Some(1)];
    record.wager = vec![20];
    record.b14 = vec![1];
    let rascal = Ruleset::new(Scoring::Rascal, Format::Swift, Expansions::none(), true);
    let score = score_seat(&rascal, &record, Seat::from_index(0))
        .expect("score")
        .expect("present");
    assert_eq!(score.kind, crate::ScoreKind::Glance);
    assert_eq!(score.base, 25);
    assert_eq!(score.bonus, 5);
    assert_eq!(score.wager, -20);
    assert!(!score.hit);
}

#[test]
fn loot_bonus_requires_both_seats_to_hit() {
    let mut record = RoundRecord::fresh(2, 5);
    record.bids = vec![Some(1), Some(1)];
    record.tricks = vec![Some(1), Some(0)];
    record.loot = vec![crate::LootMove {
        from: Seat::from_index(0),
        to: Seat::from_index(1),
    }];
    record.done = true;
    let rules = Ruleset::new(Scoring::Classic, Format::Swift, Expansions::all(), false);
    let maker = score_seat(&rules, &record, Seat::from_index(0))
        .expect("score")
        .expect("present");
    assert_eq!(maker.bonus, 0);
    record.tricks = vec![Some(1), Some(1)];
    let maker = score_seat(&rules, &record, Seat::from_index(0))
        .expect("score")
        .expect("present");
    let taker = score_seat(&rules, &record, Seat::from_index(1))
        .expect("score")
        .expect("present");
    assert_eq!(maker.bonus, 20);
    assert_eq!(taker.bonus, 20);
}

#[test]
fn easy_bid_uses_one_random_draw_and_rounds_like_javascript() {
    let order = identity(Expansions::none());
    let mut deals = Scripted {
        rounds: vec![order],
    };
    let game = GameState::create(
        rules(false, Expansions::none()),
        2,
        Seat::from_index(0),
        &mut deals,
    )
    .expect("create");
    let view = game.view(Seat::from_index(0)).expect("view");
    let low = choose_bid(&view, game.deck(), BotLevel::Easy, &mut FixedRng(0.0)).expect("bid");
    let high = choose_bid(&view, game.deck(), BotLevel::Easy, &mut FixedRng(0.999)).expect("bid");
    assert!(low <= high);
    assert!(high <= u8::try_from(view.hand.len()).expect("len"));
}

#[test]
fn unknown_seat_is_not_your_turn() {
    let order = identity(Expansions::none());
    let mut deals = Scripted {
        rounds: vec![order],
    };
    let mut game = GameState::create(
        rules(false, Expansions::none()),
        2,
        Seat::from_index(0),
        &mut deals,
    )
    .expect("create");
    let error = game.bid(Seat::from_index(3), 0).expect_err("seat");
    assert_eq!(error, StepError::Rejected(Rejection::NotYourTurn));
}
