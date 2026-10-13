//! Trick, scoring, bid, and ability tests that do not need `fixtures/engine`.

use crate::card::{Card, build_deck, resolve_trick};
use crate::ids::{CardId, Seat};
use crate::model::{AbilityChoice, Beast, Phase, Play, PlayedAs};
use crate::rules::{BotLevel, Expansions, Format, Ruleset, Scoring};
use crate::{
    BotSight, DealSource, GameState, Rejection, Rng, RoundRecord, StepError, choose_ability,
    choose_bid, choose_play, score_seat,
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
    let shown = game.seer_memory(Seat::from_index(1)).expect("memory");
    let peek = seer
        .pending
        .as_ref()
        .and_then(|pending| pending.peek.clone())
        .expect("peek");
    assert_eq!(shown, peek.as_slice());
    assert!(
        game.seer_memory(Seat::from_index(0))
            .expect("other")
            .is_empty()
    );
    game.ability(Seat::from_index(1), &AbilityChoice::Number(99))
        .expect("any choice");
    assert!(
        game.view(Seat::from_index(1))
            .expect("view")
            .pending
            .is_none()
    );
    assert_eq!(
        game.seer_memory(Seat::from_index(1)).expect("kept"),
        peek.as_slice()
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
fn easy_bid_stays_inside_the_hand_and_overbids_a_mermaid() {
    let hands = vec![vec![68, 12, 0, 1, 2], vec![3, 4, 5, 6, 7]];
    let game = dealt(&hands, 1, false, Expansions::none());
    let view = game.view(Seat::from_index(0)).expect("view");
    let sight = sight_of(&game, Seat::from_index(0));
    let normal = choose_bid(
        &view,
        game.deck(),
        game.rules(),
        BotLevel::Normal,
        sight,
        &mut FixedRng(0.0),
    )
    .expect("normal");
    let slipped = choose_bid(
        &view,
        game.deck(),
        game.rules(),
        BotLevel::Easy,
        sight,
        &mut FixedRng(0.0),
    )
    .expect("easy");
    let steady = choose_bid(
        &view,
        game.deck(),
        game.rules(),
        BotLevel::Easy,
        sight,
        &mut FixedRng(0.99),
    )
    .expect("steady");
    assert!(slipped > normal);
    assert_eq!(steady, normal);
    assert!(slipped <= 5);
}

#[test]
fn normal_bids_zero_on_a_hand_of_escapes() {
    let hands = vec![vec![56, 57, 58, 59, 60], vec![0, 1, 2, 3, 4]];
    let game = dealt(&hands, 1, false, Expansions::none());
    let view = game.view(Seat::from_index(0)).expect("view");
    let bid = choose_bid(
        &view,
        game.deck(),
        game.rules(),
        BotLevel::Normal,
        sight_of(&game, Seat::from_index(0)),
        &mut FixedRng(0.5),
    )
    .expect("bid");
    assert_eq!(bid, 0);
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

/// Even, two seats. The first round deals two cards, so the front of a known order is the hands
/// and the first undealt card is 4.
#[test]
fn deal_gives_each_seat_a_slice_and_the_suffix_is_the_pile() {
    let expansions = Expansions::none();
    let order = deal_hands(expansions, &[vec![0, 1], vec![2, 3]]);
    let mut deals = Scripted {
        rounds: vec![order.clone()],
    };
    let game = GameState::create(
        Ruleset::new(Scoring::Classic, Format::Even, expansions, false),
        2,
        Seat::from_index(0),
        &mut deals,
    )
    .expect("create");
    let cards = |ids: [u8; 2]| ids.map(CardId::from_index).to_vec();
    assert_eq!(game.hands, vec![cards([0, 1]), cards([2, 3])]);
    assert_eq!(game.pile.as_slice(), &order[4..]);
    assert_eq!(game.pile.first().copied(), Some(CardId::from_index(4)));
    let view = game.view(Seat::from_index(0)).expect("view");
    assert_eq!(view.hand, cards([0, 1]));
    assert!(!view.hand.contains(&CardId::from_index(2)));
    assert!(!view.played.contains(&CardId::from_index(2)));
    assert!(!view.legal.contains(&CardId::from_index(2)));
    assert!(view.pending.is_none());
}

fn dealt(hands: &[Vec<u8>], dealer: u8, abilities: bool, expansions: Expansions) -> GameState {
    let players = u8::try_from(hands.len()).expect("players");
    let order = deal_hands(expansions, &hands);
    let mut deals = Scripted {
        rounds: vec![order.clone(), order],
    };
    GameState::create(
        rules(abilities, expansions),
        players,
        Seat::from_index(dealer),
        &mut deals,
    )
    .expect("create")
}

fn sight_of(game: &GameState, seat: Seat) -> BotSight<'_> {
    BotSight {
        plays: game.shown_plays(),
        peeked: game.seer_memory(seat).expect("peek"),
    }
}

fn bid_seats(game: &mut GameState, bids: &[u8]) {
    for (index, bid) in bids.iter().enumerate() {
        let seat = Seat::from_index(u8::try_from(index).expect("seat"));
        game.bid(seat, i64::from(*bid)).expect("bid");
    }
}

fn play_id(game: &mut GameState, seat: u8, card: u8) {
    game.play(Seat::from_index(seat), CardId::from_index(card), None)
        .expect("play");
}

fn chosen_card(game: &GameState, seat: u8, level: BotLevel, roll: f64) -> u8 {
    let seat = Seat::from_index(seat);
    let view = game.view(seat).expect("view");
    let (card, _) = choose_play(
        &view,
        game.deck(),
        game.rules(),
        level,
        sight_of(game, seat),
        &mut FixedRng(roll),
    )
    .expect("choose");
    card.get()
}

#[test]
fn normal_does_not_lead_the_skull_king_and_easy_sometimes_does() {
    let hands = vec![vec![67, 55, 0, 1, 2], vec![3, 4, 5, 6, 7]];
    let mut game = dealt(&hands, 1, false, Expansions::none());
    bid_seats(&mut game, &[1, 0]);
    assert_ne!(chosen_card(&game, 0, BotLevel::Normal, 0.99), 67);
    assert_eq!(chosen_card(&game, 0, BotLevel::Easy, 0.0), 67);
}

#[test]
fn normal_krakens_instead_of_taking_a_trick_it_does_not_need() {
    let expansions = Expansions {
        loot: false,
        kraken: true,
        whale: false,
    };
    let hands = vec![vec![67, 61, 70, 55, 68], vec![23, 0, 1, 2, 3]];
    let mut game = dealt(&hands, 0, false, expansions);
    bid_seats(&mut game, &[0, 1]);
    play_id(&mut game, 1, 23);
    assert_eq!(chosen_card(&game, 0, BotLevel::Normal, 0.99), 70);
    assert_eq!(chosen_card(&game, 0, BotLevel::Easy, 0.0), 67);
}

#[test]
fn hard_does_not_take_a_trick_to_sink_the_next_seat() {
    let hands = vec![
        vec![67, 28, 29, 30, 56],
        vec![18, 0, 1, 2, 3],
        vec![17, 4, 5, 6, 7],
    ];
    let mut game = dealt(&hands, 0, false, Expansions::none());
    bid_seats(&mut game, &[0, 5, 0]);
    play_id(&mut game, 1, 18);
    play_id(&mut game, 2, 17);
    assert_ne!(chosen_card(&game, 0, BotLevel::Hard, 0.99), 67);
    assert_ne!(chosen_card(&game, 0, BotLevel::Normal, 0.99), 67);
}

#[test]
fn hard_krakens_the_trick_the_next_seat_must_win() {
    let expansions = Expansions {
        loot: false,
        kraken: true,
        whale: false,
    };
    let hands = vec![
        vec![70, 14, 15, 16, 56],
        vec![67, 0, 1, 2, 3],
        vec![4, 5, 6, 7, 8],
    ];
    let mut game = dealt(&hands, 0, false, expansions);
    bid_seats(&mut game, &[0, 5, 0]);
    play_id(&mut game, 1, 67);
    play_id(&mut game, 2, 4);
    assert_eq!(chosen_card(&game, 0, BotLevel::Hard, 0.99), 70);
    assert_ne!(chosen_card(&game, 0, BotLevel::Normal, 0.99), 70);
}

#[test]
fn hard_gives_the_next_seat_a_trick_that_busts_a_zero() {
    let hands = vec![
        vec![73, 14, 15, 16, 56],
        vec![13, 0, 1, 2, 3],
        vec![43, 27, 28, 29, 30],
    ];
    let mut game = dealt(&hands, 0, false, Expansions::all());
    bid_seats(&mut game, &[0, 0, 1]);
    play_id(&mut game, 1, 13);
    play_id(&mut game, 2, 43);
    assert_eq!(chosen_card(&game, 0, BotLevel::Hard, 0.99), 73);
    assert_ne!(chosen_card(&game, 0, BotLevel::Normal, 0.99), 73);
}

#[test]
fn hard_lets_the_next_seat_keep_a_trick_that_busts_a_zero() {
    let expansions = Expansions {
        loot: false,
        kraken: true,
        whale: false,
    };
    let hands = vec![
        vec![70, 14, 15, 16, 56],
        vec![13, 0, 1, 2, 3],
        vec![4, 5, 6, 7, 8],
    ];
    let mut game = dealt(&hands, 0, false, expansions);
    bid_seats(&mut game, &[0, 0, 0]);
    play_id(&mut game, 1, 13);
    play_id(&mut game, 2, 4);
    assert_eq!(chosen_card(&game, 0, BotLevel::Hard, 0.99), 16);
    assert_ne!(chosen_card(&game, 0, BotLevel::Normal, 0.99), 70);
}

#[test]
fn normal_smuggler_keeps_the_cards_it_needs_and_easy_sometimes_throws_them() {
    let needing = smuggler_table(3);
    assert_eq!(
        smuggler_choice(&needing, BotLevel::Normal, 0.99),
        vec![56, 3]
    );
    let made = smuggler_table(1);
    assert_eq!(smuggler_choice(&made, BotLevel::Normal, 0.0), vec![67, 4]);
    assert_eq!(smuggler_choice(&needing, BotLevel::Easy, 0.0), vec![67, 4]);
}

/// Swift, abilities on, the three-card hands the device test uses. The pile starts at green 4.
fn smuggler_table(bid: u8) -> GameState {
    let mut game = dealt(
        &[vec![0, 1, 2], vec![62, 67, 56]],
        0,
        true,
        Expansions::none(),
    );
    let held = [0_u8, 1, 2, 62, 67, 56];
    game.hands = vec![
        vec![
            CardId::from_index(0),
            CardId::from_index(1),
            CardId::from_index(2),
        ],
        vec![
            CardId::from_index(62),
            CardId::from_index(67),
            CardId::from_index(56),
        ],
    ];
    game.pile = (0..game.deck.len())
        .filter_map(|index| {
            let id = u8::try_from(index).expect("id");
            (!held.contains(&id)).then_some(CardId::from_index(id))
        })
        .collect();
    bid_seats(&mut game, &[0, bid]);
    play_id(&mut game, 1, 62);
    play_id(&mut game, 0, 0);
    let mut deals = Scripted { rounds: Vec::new() };
    game.advance(&mut deals).expect("smuggler");
    game
}

fn smuggler_choice(game: &GameState, level: BotLevel, roll: f64) -> Vec<u8> {
    let seat = Seat::from_index(1);
    let view = game.view(seat).expect("view");
    let drawn = view
        .pending
        .as_ref()
        .and_then(|pending| pending.drawn.as_ref())
        .expect("drawn");
    assert_eq!(
        drawn.iter().map(|id| id.get()).collect::<Vec<_>>(),
        vec![3, 4]
    );
    let choice = choose_ability(
        &view,
        game.deck(),
        game.rules(),
        level,
        sight_of(game, seat),
        &mut FixedRng(roll),
    )
    .expect("ability");
    match choice {
        AbilityChoice::Cards(cards) => cards.into_iter().map(CardId::get).collect(),
        other => panic!("smuggler returned {other:?}"),
    }
}

#[test]
fn normal_giant_steps_the_bid_onto_the_trick_it_took() {
    let hands = vec![vec![0, 1], vec![65, 56]];
    let order = deal_hands(Expansions::none(), &hands);
    let mut deals = Scripted {
        rounds: vec![order.clone(), order],
    };
    let mut game = GameState::create(
        Ruleset::new(Scoring::Classic, Format::Even, Expansions::none(), true),
        2,
        Seat::from_index(0),
        &mut deals,
    )
    .expect("create");
    bid_seats(&mut game, &[1, 0]);
    play_id(&mut game, 1, 65);
    play_id(&mut game, 0, 0);
    game.advance(&mut deals).expect("trick");
    play_id(&mut game, 1, 56);
    play_id(&mut game, 0, 1);
    game.advance(&mut deals).expect("round");
    let seat = Seat::from_index(1);
    let view = game.view(seat).expect("view");
    let choice = choose_ability(
        &view,
        game.deck(),
        game.rules(),
        BotLevel::Normal,
        sight_of(&game, seat),
        &mut FixedRng(0.99),
    )
    .expect("giant");
    assert_eq!(choice, AbilityChoice::Number(1));
}

struct Seq(u64);

impl Rng for Seq {
    fn next_f64(&mut self) -> f64 {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1);
        let bits = u32::try_from(self.0 >> 33).unwrap_or(0);
        f64::from(bits) / f64::from(u32::MAX)
    }
}

#[test]
fn each_level_finishes_a_game() {
    for level in [BotLevel::Easy, BotLevel::Normal, BotLevel::Hard] {
        let order = identity(Expansions::all());
        let mut deals = Scripted {
            rounds: vec![order; 5],
        };
        let mut game = GameState::create(
            Ruleset::new(Scoring::Classic, Format::Swift, Expansions::all(), true),
            2,
            Seat::from_index(0),
            &mut deals,
        )
        .expect("create");
        let mut rng = Seq(0x51E5_0000 | level_bit(level));
        let mut guard = 0u32;
        loop {
            guard += 1;
            assert!(guard < 2_000, "level {level:?} did not finish");
            match game.phase() {
                Phase::GameOver => break,
                Phase::TrickEnd | Phase::RoundEnd => {
                    game.advance(&mut deals).expect("advance");
                }
                Phase::Bidding => {
                    for index in 0..game.player_count() {
                        if game.phase() != Phase::Bidding {
                            break;
                        }
                        let seat = Seat::from_index(index);
                        let view = game.view(seat).expect("view");
                        let already = view.bids.get(seat.index()).and_then(|bid| *bid);
                        if already.is_some() {
                            continue;
                        }
                        let bid = choose_bid(
                            &view,
                            game.deck(),
                            game.rules(),
                            level,
                            sight_of(&game, seat),
                            &mut rng,
                        )
                        .expect("bid");
                        game.bid(seat, i64::from(bid)).expect("place");
                    }
                }
                Phase::Playing => {
                    let seat = game
                        .view(Seat::from_index(0))
                        .expect("view")
                        .turn
                        .expect("turn");
                    let view = game.view(seat).expect("mine");
                    let (card, played_as) = choose_play(
                        &view,
                        game.deck(),
                        game.rules(),
                        level,
                        sight_of(&game, seat),
                        &mut rng,
                    )
                    .expect("play");
                    game.play(seat, card, played_as).expect("accepted");
                }
                Phase::Ability => {
                    let seat = game
                        .view(Seat::from_index(0))
                        .expect("view")
                        .pending
                        .expect("pending")
                        .seat;
                    let view = game.view(seat).expect("mine");
                    let choice = choose_ability(
                        &view,
                        game.deck(),
                        game.rules(),
                        level,
                        sight_of(&game, seat),
                        &mut rng,
                    )
                    .expect("ability");
                    game.ability(seat, &choice).expect("accepted");
                }
            }
        }
    }
}

fn level_bit(level: BotLevel) -> u64 {
    match level {
        BotLevel::Easy => 1,
        BotLevel::Normal => 2,
        BotLevel::Hard => 3,
    }
}
