//! The edges the rules name.

use crate::{Color, Game, Intent, Kind, Must, Phase, Rng};

struct Seq(u32);

impl Rng for Seq {
    fn next_u32(&mut self) -> u32 {
        let value = self.0;
        self.0 = self.0.wrapping_add(1);
        value
    }
}

fn game(players: u8) -> Game {
    Game::create(players, false, false, &mut Seq(0)).expect("table")
}

fn any_card(game: &Game, seat: u8) -> crate::CardId {
    game.view(seat).expect("view").hand[0].id
}

#[test]
fn deck_has_the_locked_counts() {
    let table = game(4);
    let view = table.view(0).expect("view");
    assert_eq!(view.counts.iter().sum::<u8>(), 32);
    assert_eq!(view.draw_count, 124 - 32 - 1);
}

#[test]
fn a_matching_number_plays_and_an_off_colour_does_not() {
    let mut table = game(4);
    let seat = table.view(0).expect("view").turn;
    let view = table.view(seat).expect("view");
    let color = view.color;
    let play = view
        .hand
        .iter()
        .find(|card| card.color == Some(color) && matches!(card.kind, Kind::Number(_)))
        .map(|card| card.id);
    let Some(card) = play else {
        return;
    };
    table
        .act(seat, Intent::Play { card, color: None }, &mut Seq(1))
        .expect("play");
    let after = table.view(seat).expect("view");
    assert!(after.hand.iter().all(|held| held.id != card));
    let wrong = after.turn;
    let off = table
        .view(wrong)
        .expect("view")
        .hand
        .into_iter()
        .find(|card| {
            card.color.is_some()
                && card.color != Some(after.color)
                && !matches!(
                    card.kind,
                    Kind::Wild | Kind::WildDraw4 | Kind::Shield | Kind::XRay
                )
        });
    if let Some(card) = off {
        let err = table.act(
            wrong,
            Intent::Play {
                card: card.id,
                color: None,
            },
            &mut Seq(2),
        );
        assert!(err.is_err());
    }
}

#[test]
fn two_player_reverse_skips() {
    let mut table = game(2);
    let seat = table.view(0).expect("view").turn;
    let Some(card) = table
        .view(seat)
        .expect("view")
        .hand
        .into_iter()
        .find(|card| card.kind == Kind::Reverse)
    else {
        return;
    };
    if !table.view(seat).expect("view").legal.contains(&card.id) {
        return;
    }
    table
        .act(
            seat,
            Intent::Play {
                card: card.id,
                color: None,
            },
            &mut Seq(3),
        )
        .expect("reverse");
    assert_eq!(table.view(seat).expect("view").turn, seat);
}

#[test]
fn xray_is_private() {
    let mut table = game(4);
    let seat = table.view(0).expect("view").turn;
    let Some(card) = table
        .view(seat)
        .expect("view")
        .hand
        .into_iter()
        .find(|card| card.kind == Kind::XRay)
    else {
        return;
    };
    table
        .act(
            seat,
            Intent::Play {
                card: card.id,
                color: Some(Color::Yellow),
            },
            &mut Seq(4),
        )
        .expect("xray");
    let mine = table.view(seat).expect("view");
    let other = (seat + 1) % 4;
    let theirs = table.view(other).expect("view");
    assert_ne!(mine.xray.len(), 0);
    assert_eq!(theirs.xray.len(), 0);
    assert_ne!(theirs.hand, mine.hand);
}

#[test]
fn draw_stack_can_be_taken() {
    let mut table = game(3);
    let seat = table.view(0).expect("view").turn;
    let Some(card) = table
        .view(seat)
        .expect("view")
        .hand
        .into_iter()
        .find(|card| {
            card.kind == Kind::Draw2 && table.view(seat).expect("view").legal.contains(&card.id)
        })
    else {
        return;
    };
    table
        .act(
            seat,
            Intent::Play {
                card: card.id,
                color: None,
            },
            &mut Seq(5),
        )
        .expect("draw2");
    let next = table.view(seat).expect("view").turn;
    assert_eq!(table.view(next).expect("view").must, Must::AnswerStack);
    assert_eq!(table.view(next).expect("view").stack, Some(2));
    let before = table.view(next).expect("view").counts[usize::from(next)];
    table.act(next, Intent::Draw, &mut Seq(6)).expect("take");
    let after = table.view(next).expect("view").counts[usize::from(next)];
    assert_eq!(after, before + 2);
}

#[test]
fn opening_wild_asks_for_a_colour_and_does_not_skip() {
    let mut table = game(4);
    if table.view(0).expect("view").phase != Phase::ChooseColor {
        return;
    }
    let seat = table.view(0).expect("view").turn;
    table
        .act(
            seat,
            Intent::Choose {
                color: Color::Green,
            },
            &mut Seq(7),
        )
        .expect("colour");
    let view = table.view(seat).expect("view");
    assert_eq!(view.phase, Phase::Turn);
    assert_eq!(view.color, Color::Green);
    assert_eq!(view.turn, seat);
    assert_eq!(view.must, Must::PlayOrDraw);
}

#[test]
fn another_seat_cannot_act() {
    let mut table = game(4);
    let turn = table.view(0).expect("view").turn;
    let other = (turn + 1) % 4;
    let card = any_card(&table, other);
    let err = table.act(
        other,
        Intent::Play {
            card,
            color: Some(Color::Red),
        },
        &mut Seq(8),
    );
    assert!(err.is_err());
}
