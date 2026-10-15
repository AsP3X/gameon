//! The edges the rules name.

use crate::{
    BotLevel, Card, CardId, Color, Game, Intent, Kind, Must, Phase, PlayerView, Rng, Symbol,
    XrayShown, choose,
};

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

fn finishes(players: u8, teams: bool, level: BotLevel, seed: u32) -> bool {
    let mut table = Game::create(players, teams, false, &mut Seq(seed)).expect("table");
    let mut rng = Seq(seed.wrapping_add(9));
    for _ in 0..20_000 {
        if table.is_over() {
            return true;
        }
        let turn = table.view(0).expect("view").turn;
        let view = table.view(turn).expect("view");
        let intent = choose(&view, level, &mut rng).expect("choice");
        table.act(turn, intent, &mut rng).expect("play");
    }
    false
}

#[test]
fn every_level_finishes_a_free_for_all_a_pair_and_a_team() {
    for level in [BotLevel::Normal, BotLevel::Hard] {
        assert!(finishes(4, false, level, 3), "{level:?} free-for-all");
        assert!(finishes(2, false, level, 11), "{level:?} pair");
        assert!(finishes(4, true, level, 21), "{level:?} teams");
    }
    assert!(finishes(4, false, BotLevel::Easy, 3), "easy free-for-all");
    assert!(finishes(4, true, BotLevel::Easy, 21), "easy teams");
    assert!(
        [1u32, 11, 42, 99]
            .into_iter()
            .any(|seed| finishes(2, false, BotLevel::Easy, seed)),
        "easy pair"
    );
}

#[test]
fn hard_does_not_boo_blue_itself_when_it_has_another_card() {
    let mut table = Game::create(4, false, false, &mut Seq(4)).expect("table");
    let mut rng = Seq(8);
    for _ in 0..400 {
        if table.is_over() {
            return;
        }
        let turn = table.view(0).expect("view").turn;
        let view = table.view(turn).expect("view");
        if view.must == Must::PlayOrDraw {
            let boo = view
                .hand
                .iter()
                .find(|card| card.kind == Kind::BooBlue && view.legal.contains(&card.id));
            let others = view.legal.len() > 1;
            if boo.is_some() && others && view.hand.len() > 1 {
                let ours = view.hand.len().saturating_sub(1);
                let least = view
                    .counts
                    .iter()
                    .enumerate()
                    .filter(|(seat, _)| *seat != usize::from(turn))
                    .map(|(_, count)| usize::from(*count))
                    .min()
                    .unwrap_or(ours);
                if ours <= least {
                    let intent = choose(&view, BotLevel::Hard, &mut rng).expect("choice");
                    if let Intent::Play { card, .. } = intent {
                        assert_ne!(boo.map(|card| card.id), Some(card));
                    }
                }
            }
        }
        let view = table.view(turn).expect("view");
        let intent = choose(&view, BotLevel::Hard, &mut rng).expect("choice");
        table.act(turn, intent, &mut rng).expect("play");
    }
}

#[test]
fn hard_finishes_every_seat_count_and_a_team_match() {
    for players in 2..=8 {
        assert!(
            finishes(players, false, BotLevel::Hard, 5 + u32::from(players)),
            "{players} seats"
        );
    }
    assert!(finishes(4, true, BotLevel::Hard, 30), "teams");
}

#[test]
fn hard_plays_toward_500_for_a_pair_and_a_team() {
    for (players, teams) in [(2, false), (4, true), (8, false)] {
        let mut table = Game::create(players, teams, true, &mut Seq(17)).expect("table");
        let mut rng = Seq(19);
        for _ in 0..1_500 {
            if table.is_over() {
                break;
            }
            let turn = table.view(0).expect("view").turn;
            let view = table.view(turn).expect("view");
            assert_ne!(view.must, Must::None, "{players} {teams}");
            let intent = choose(&view, BotLevel::Hard, &mut rng).expect("choice");
            table.act(turn, intent, &mut rng).expect("play");
        }
    }
}

#[test]
fn a_drawn_card_enters_the_hand() {
    let mut table = Game::create(4, false, false, &mut Seq(2)).expect("table");
    let mut rng = Seq(9);
    for _ in 0..400 {
        let turn = table.view(0).expect("view").turn;
        let view = table.view(turn).expect("view");
        match view.must {
            Must::PlayOrDraw if view.legal.is_empty() => {
                let before = view.hand.len();
                table.act(turn, Intent::Draw, &mut rng).expect("draw");
                let after = table.view(turn).expect("view");
                if after.must == Must::PlayDrawnOrKeep && after.turn == turn {
                    assert_eq!(after.hand.len(), before + 1);
                    let id = after.legal[0];
                    let card = after
                        .hand
                        .iter()
                        .find(|card| card.id == id)
                        .expect("drawn card");
                    table
                        .act(
                            turn,
                            Intent::Play {
                                card: id,
                                color: card.names_color().then_some(Color::Blue),
                            },
                            &mut rng,
                        )
                        .expect("play drawn");
                    assert!(
                        table
                            .view(turn)
                            .expect("view")
                            .hand
                            .iter()
                            .all(|card| card.id != id)
                    );
                } else {
                    assert_eq!(usize::from(after.counts[usize::from(turn)]), before + 1);
                }
                return;
            }
            Must::ChooseColor => {
                table
                    .act(turn, Intent::Choose { color: Color::Red }, &mut rng)
                    .expect("colour");
            }
            Must::PlayDrawnOrKeep => {
                table.act(turn, Intent::Keep, &mut rng).expect("keep");
            }
            Must::NextHand => {
                table.act(turn, Intent::Next, &mut rng).expect("next");
            }
            Must::PlayOrDraw | Must::AnswerStack if view.legal.is_empty() => {
                table.act(turn, Intent::Draw, &mut rng).expect("take");
            }
            Must::PlayOrDraw | Must::AnswerStack => {
                let id = view.legal[0];
                let card = view.hand.iter().find(|card| card.id == id).expect("card");
                table
                    .act(
                        turn,
                        Intent::Play {
                            card: id,
                            color: card.names_color().then_some(Color::Red),
                        },
                        &mut rng,
                    )
                    .expect("play");
            }
            Must::None => break,
        }
    }
    panic!("nobody drew");
}

struct Mix(u32);

impl Rng for Mix {
    fn next_u32(&mut self) -> u32 {
        self.0 = self.0.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        self.0
    }
}

#[test]
fn xray_stays_until_that_seat_acts_again() {
    for seed in 1..80 {
        let mut table = Game::create(4, false, false, &mut Mix(seed)).expect("table");
        let seat = table.view(0).expect("view").turn;
        let opening = table.view(seat).expect("view");
        if opening.must != Must::PlayOrDraw {
            continue;
        }
        let Some(card) = opening
            .hand
            .into_iter()
            .find(|card| card.kind == Kind::XRay)
        else {
            continue;
        };
        table
            .act(
                seat,
                Intent::Play {
                    card: card.id,
                    color: Some(Color::Yellow),
                },
                &mut Mix(seed.wrapping_add(50)),
            )
            .expect("xray");
        let seen = table.view(seat).expect("view").xray.clone();
        assert_ne!(seen, Vec::new());
        let mut others = 0;
        for _ in 0..24 {
            let turn = table.view(0).expect("view").turn;
            if turn == seat || table.is_over() {
                break;
            }
            assert_eq!(table.view(seat).expect("view").xray, seen);
            let view = table.view(turn).expect("view");
            table
                .act(turn, intent_of(&view), &mut Mix(seed.wrapping_add(80)))
                .expect("other");
            others += 1;
            if table.is_over() {
                break;
            }
            assert_eq!(table.view(seat).expect("view").xray, seen);
        }
        if others == 0 {
            continue;
        }
        if table.view(0).expect("view").turn == seat && !table.is_over() {
            let view = table.view(seat).expect("view");
            let intent = intent_of(&view);
            let played_xray = matches!(intent, Intent::Play { card, .. } if view.hand.iter().any(|held| held.id == card && held.kind == Kind::XRay));
            table
                .act(seat, intent, &mut Mix(seed.wrapping_add(90)))
                .expect("again");
            if !played_xray {
                assert_eq!(table.view(seat).expect("view").xray, Vec::new());
            }
        }
        return;
    }
    panic!("no opening turn had an X-Ray");
}

fn intent_of(view: &PlayerView) -> Intent {
    match view.must {
        Must::ChooseColor => Intent::Choose {
            color: Color::Green,
        },
        Must::PlayDrawnOrKeep => Intent::Keep,
        Must::NextHand => Intent::Next,
        Must::PlayOrDraw | Must::AnswerStack if view.legal.is_empty() => Intent::Draw,
        Must::PlayOrDraw | Must::AnswerStack => {
            let id = view.legal[0];
            let card = view
                .hand
                .iter()
                .find(|card| card.id == id)
                .expect("legal card");
            Intent::Play {
                card: id,
                color: card.names_color().then_some(Color::Green),
            }
        }
        Must::None => Intent::Draw,
    }
}

struct Zero;

impl Rng for Zero {
    fn next_u32(&mut self) -> u32 {
        0
    }
}

fn sample(hand: Vec<Card>, legal: &[u16], counts: &[u8], must: Must) -> PlayerView {
    PlayerView {
        you: 0,
        phase: if must == Must::PlayDrawnOrKeep {
            Phase::Drawn
        } else {
            Phase::Turn
        },
        must,
        hand,
        partner_hand: None,
        counts: counts.to_vec(),
        top: card(400, Some(Color::Yellow), Kind::Number(4)),
        draw_count: 40,
        color: Color::Yellow,
        symbol: Symbol::Number(4),
        direction: 1,
        turn: 0,
        legal: legal.iter().copied().map(CardId::new).collect(),
        stack: None,
        xray: Vec::new(),
        scores: vec![0; counts.len()],
        hand_no: 1,
        target: Some(500),
        hand_winner: None,
        match_winner: None,
        hand_points: None,
    }
}

fn card(id: u16, color: Option<Color>, kind: Kind) -> Card {
    Card {
        id: CardId::new(id),
        color,
        kind,
    }
}

fn played(intent: Intent) -> u16 {
    match intent {
        Intent::Play { card, .. } => card.get(),
        other => panic!("expected a play, got {other:?}"),
    }
}

#[test]
fn hard_skips_a_short_opponent_and_a_pair_treats_reverse_as_skip() {
    let mut view = sample(
        vec![
            card(1, Some(Color::Yellow), Kind::Skip),
            card(2, Some(Color::Yellow), Kind::Number(4)),
        ],
        &[1, 2],
        &[2, 1, 6, 6],
        Must::PlayOrDraw,
    );
    assert_eq!(
        played(choose(&view, BotLevel::Hard, &mut Zero).expect("skip")),
        1
    );
    view.counts = vec![2, 1];
    view.scores = vec![0, 0];
    view.hand = vec![
        card(3, Some(Color::Yellow), Kind::Reverse),
        card(2, Some(Color::Yellow), Kind::Number(4)),
    ];
    view.legal = vec![CardId::new(3), CardId::new(2)];
    assert_eq!(
        played(choose(&view, BotLevel::Hard, &mut Zero).expect("reverse")),
        3
    );
}

#[test]
fn hard_will_not_hit_itself_or_its_partner() {
    let view = sample(
        vec![
            card(1, Some(Color::Red), Kind::DeadRed),
            card(2, Some(Color::Blue), Kind::Number(4)),
        ],
        &[1, 2],
        &[2, 5, 5, 5],
        Must::PlayOrDraw,
    );
    let mut yellow = view.clone();
    yellow.color = Color::Red;
    yellow.symbol = Symbol::Number(4);
    yellow.top = card(400, Some(Color::Red), Kind::Number(4));
    assert_eq!(
        played(choose(&yellow, BotLevel::Hard, &mut Zero).expect("dead")),
        2
    );

    let mut teams = sample(
        vec![
            card(3, Some(Color::Blue), Kind::BooBlue),
            card(4, Some(Color::Yellow), Kind::Number(4)),
        ],
        &[3, 4],
        &[3, 4, 1, 4],
        Must::PlayOrDraw,
    );
    teams.partner_hand = Some(vec![card(9, Some(Color::Green), Kind::Number(8))]);
    assert_eq!(
        played(choose(&teams, BotLevel::Hard, &mut Zero).expect("boo")),
        4
    );
}

#[test]
fn normal_keeps_a_wild_and_a_card_that_would_hit_itself() {
    let wild = sample(
        vec![
            card(1, None, Kind::Wild),
            card(2, Some(Color::Red), Kind::Number(1)),
        ],
        &[1],
        &[2, 4, 4, 4],
        Must::PlayDrawnOrKeep,
    );
    assert_eq!(
        choose(&wild, BotLevel::Normal, &mut Zero).expect("keep"),
        Intent::Keep
    );
    assert!(matches!(
        choose(&wild, BotLevel::Easy, &mut Zero).expect("easy plays"),
        Intent::Play { card, .. } if card.get() == 1
    ));

    let mut last = sample(
        vec![card(5, Some(Color::Red), Kind::DeadRed)],
        &[5],
        &[1, 3, 3, 3],
        Must::PlayDrawnOrKeep,
    );
    last.color = Color::Red;
    last.symbol = Symbol::DeadRed;
    assert_eq!(
        choose(&last, BotLevel::Normal, &mut Zero).expect("keep dead"),
        Intent::Keep
    );
}

#[test]
fn normal_passes_a_small_stack_and_shields_a_large_one() {
    let mut stack = sample(
        vec![
            card(1, Some(Color::Yellow), Kind::Draw2),
            card(2, None, Kind::Shield),
        ],
        &[1, 2],
        &[4, 4, 4, 4],
        Must::AnswerStack,
    );
    stack.stack = Some(2);
    assert_eq!(
        played(choose(&stack, BotLevel::Normal, &mut Zero).expect("draw2")),
        1
    );
    stack.legal = vec![CardId::new(2)];
    stack.hand = vec![
        card(2, None, Kind::Shield),
        card(8, Some(Color::Red), Kind::Number(1)),
        card(9, Some(Color::Red), Kind::Number(2)),
        card(10, Some(Color::Green), Kind::Number(3)),
        card(11, Some(Color::Blue), Kind::Number(5)),
    ];
    stack.stack = Some(6);
    assert_eq!(
        played(choose(&stack, BotLevel::Normal, &mut Zero).expect("shield")),
        2
    );
    stack.stack = Some(2);
    assert_eq!(
        choose(&stack, BotLevel::Normal, &mut Zero).expect("save"),
        Intent::Draw
    );
}

#[test]
fn hard_names_the_colour_the_pair_holds() {
    let mut view = sample(
        vec![card(1, Some(Color::Green), Kind::Number(1))],
        &[],
        &[1, 4, 4, 4],
        Must::ChooseColor,
    );
    view.partner_hand = Some(vec![
        card(2, Some(Color::Yellow), Kind::Number(3)),
        card(3, Some(Color::Yellow), Kind::Number(6)),
        card(4, Some(Color::Yellow), Kind::Skip),
    ]);
    assert_eq!(
        choose(&view, BotLevel::Hard, &mut Zero).expect("colour"),
        Intent::Choose {
            color: Color::Yellow
        }
    );
}

#[test]
fn hard_fires_dead_red_when_xray_shows_no_red() {
    let mut view = sample(
        vec![
            card(1, Some(Color::Red), Kind::DeadRed),
            card(2, Some(Color::Red), Kind::Number(4)),
            card(3, Some(Color::Yellow), Kind::Number(4)),
        ],
        &[1, 3],
        &[3, 4, 4, 4],
        Must::PlayOrDraw,
    );
    view.xray = vec![XrayShown {
        seat: 1,
        card: card(20, Some(Color::Green), Kind::Number(9)),
    }];
    assert_eq!(
        played(choose(&view, BotLevel::Hard, &mut Zero).expect("dead")),
        1
    );
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
