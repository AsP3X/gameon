//! One bot-versus-bot game. The engine deals, the bots decide, and the checker
//! records anything that does not add up.

use skt_engine::{
    AbilityChoice, BotLevel, BotSight, Card, CardId, DealSource, GameState, Phase, Rng, Ruleset,
    Scoring, Seat,
};

use crate::stats::{BUCKETS, Fault, GameSummary, PLAYERS, SEATS, SeatSummary, SuiteKind};

/// Steps past this are a stuck table. A classic game of ten rounds is a few hundred.
const STEP_LIMIT: u32 = 8_000;

struct XorShift(u64);

impl Rng for XorShift {
    fn next_f64(&mut self) -> f64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = if x == 0 { 0xA5A5_A5A5_A5A5_A5A5 } else { x };
        let bits = u32::try_from(self.0 >> 32).unwrap_or(0);
        f64::from(bits) / 4_294_967_296.0
    }
}

impl XorShift {
    /// A value in `0..bound`. Zero when `bound` is zero.
    fn below(&mut self, bound: usize) -> usize {
        let Ok(width) = u32::try_from(bound) else {
            return 0;
        };
        if width == 0 {
            return 0;
        }
        let picked = floor_usize(self.next_f64() * f64::from(width));
        if picked >= bound { bound - 1 } else { picked }
    }
}

fn floor_usize(value: f64) -> usize {
    if !value.is_finite() || value <= 0.0 {
        return 0;
    }
    let mut rest = value;
    let mut whole = 0usize;
    while rest >= 1.0 {
        rest -= 1.0;
        whole = whole.saturating_add(1);
        if whole == usize::MAX {
            break;
        }
    }
    whole
}

struct Shuffle {
    deck: Vec<CardId>,
    rng: XorShift,
}

impl DealSource for Shuffle {
    fn deal_order(&mut self, _round: usize) -> Vec<CardId> {
        let mut order = self.deck.clone();
        let len = order.len();
        for index in (1..len).rev() {
            let swap = self.rng.below(index.saturating_add(1));
            order.swap(index, swap);
        }
        order
    }
}

/// The table the pass plays. Loot, both beasts, and pirate abilities are on, so a
/// bug in those paths has a chance to appear.
fn table_rules() -> Ruleset {
    Ruleset::new(
        Scoring::Classic,
        skt_engine::Format::Classic,
        skt_engine::Expansions::all(),
        true,
    )
}

pub(crate) const fn phase_name(phase: Phase) -> &'static str {
    match phase {
        Phase::Bidding => "bidding",
        Phase::Playing => "playing",
        Phase::TrickEnd => "trickEnd",
        Phase::Ability => "ability",
        Phase::RoundEnd => "roundEnd",
        Phase::GameOver => "gameOver",
    }
}

pub(crate) const fn dealer_seat(index: u32) -> u8 {
    match index % 4 {
        1 => 1,
        2 => 2,
        3 => 3,
        _ => 0,
    }
}

// Human: Play one full game with the four bots and refuse it when a move, a score, or the trick count is wrong.
// Agent: READS seed, suite, game index; CALLS GameState and the bot choosers; RETURNS GameSummary or Fault; never logs a hand.
pub(crate) fn play_one(kind: SuiteKind, index: u32, seed: u64) -> Result<GameSummary, Fault> {
    let levels = kind.levels(index);
    let rules = table_rules();
    let deck = skt_engine::build_deck(rules.expansions)
        .map_err(|error| fault_of(kind, index, seed, 0, "deal", format!("deck: {error}")))?;
    let mut deals = Shuffle {
        deck: deck.iter().copied().map(Card::id).collect(),
        rng: XorShift(seed),
    };
    let mut game = GameState::create(
        rules,
        PLAYERS,
        Seat::from_index(dealer_seat(index)),
        &mut deals,
    )
    .map_err(|error| fault_of(kind, index, seed, 0, "deal", format!("create: {error}")))?;
    let mut steps = 0u32;
    loop {
        let phase = game.phase();
        if phase == Phase::GameOver {
            return finish(kind, index, seed, steps, levels, &game);
        }
        steps = steps.saturating_add(1);
        if steps > STEP_LIMIT {
            return Err(fault_of(
                kind,
                index,
                seed,
                steps,
                phase_name(phase),
                format!("stopped after {STEP_LIMIT} steps"),
            ));
        }
        if let Err(detail) = step(&mut game, &mut deals, levels) {
            return Err(fault_of(
                kind,
                index,
                seed,
                steps,
                phase_name(phase),
                detail,
            ));
        }
    }
}

fn step(
    game: &mut GameState,
    deals: &mut Shuffle,
    levels: [BotLevel; SEATS],
) -> Result<(), String> {
    match game.phase() {
        Phase::GameOver => Ok(()),
        Phase::TrickEnd | Phase::RoundEnd => game
            .advance(deals)
            .map(|_| ())
            .map_err(|error| format!("advance: {error}")),
        Phase::Bidding => place_bid(game, levels, &mut deals.rng),
        Phase::Playing => place_card(game, levels, &mut deals.rng),
        Phase::Ability => place_ability(game, levels, &mut deals.rng),
    }
}

fn place_bid(
    game: &mut GameState,
    levels: [BotLevel; SEATS],
    rng: &mut XorShift,
) -> Result<(), String> {
    let seat = next_bidder(game)?;
    let level = level_of(levels, seat)?;
    let bid = {
        let view = game
            .view(seat)
            .map_err(|error| format!("seat {} view: {error}", seat.get()))?;
        let sight = sight_of(game, seat)?;
        skt_engine::choose_bid(&view, game.deck(), game.rules(), level, sight, rng)
            .map_err(|error| format!("seat {} bid: {error}", seat.get()))?
    };
    game.bid(seat, i64::from(bid))
        .map(|_| ())
        .map_err(|error| format!("seat {} bid rejected: {error}", seat.get()))
}

fn place_card(
    game: &mut GameState,
    levels: [BotLevel; SEATS],
    rng: &mut XorShift,
) -> Result<(), String> {
    let seat = turn_seat(game)?;
    let level = level_of(levels, seat)?;
    let (card, played_as) = {
        let view = game
            .view(seat)
            .map_err(|error| format!("seat {} view: {error}", seat.get()))?;
        let sight = sight_of(game, seat)?;
        skt_engine::choose_play(&view, game.deck(), game.rules(), level, sight, rng)
            .map_err(|error| format!("seat {} play: {error}", seat.get()))?
    };
    game.play(seat, card, played_as)
        .map(|_| ())
        .map_err(|error| format!("seat {} play rejected: {error}", seat.get()))
}

fn place_ability(
    game: &mut GameState,
    levels: [BotLevel; SEATS],
    rng: &mut XorShift,
) -> Result<(), String> {
    let seat = pending_seat(game)?;
    let level = level_of(levels, seat)?;
    let choice = {
        let view = game
            .view(seat)
            .map_err(|error| format!("seat {} view: {error}", seat.get()))?;
        let sight = sight_of(game, seat)?;
        skt_engine::choose_ability(&view, game.deck(), game.rules(), level, sight, rng)
            .map_err(|error| format!("seat {} ability: {error}", seat.get()))?
    };
    accept_ability(game, seat, &choice)
}

fn accept_ability(game: &mut GameState, seat: Seat, choice: &AbilityChoice) -> Result<(), String> {
    game.ability(seat, choice)
        .map(|_| ())
        .map_err(|error| format!("seat {} ability rejected: {error}", seat.get()))
}

fn next_bidder(game: &GameState) -> Result<Seat, String> {
    let players = game.player_count();
    for index in 0..players {
        let seat = Seat::from_index(index);
        let view = game
            .view(seat)
            .map_err(|error| format!("seat {} view: {error}", seat.get()))?;
        let own = view
            .bids
            .get(seat.index())
            .ok_or_else(|| format!("seat {} has no bid slot", seat.get()))?;
        if own.is_none() {
            return Ok(seat);
        }
    }
    Err("bidding while every seat has already bid".to_string())
}

fn turn_seat(game: &GameState) -> Result<Seat, String> {
    game.view(Seat::from_index(0))
        .map_err(|error| format!("view: {error}"))?
        .turn
        .ok_or_else(|| "playing with nobody to play".to_string())
}

fn pending_seat(game: &GameState) -> Result<Seat, String> {
    game.view(Seat::from_index(0))
        .map_err(|error| format!("view: {error}"))?
        .pending
        .map(|pending| pending.seat)
        .ok_or_else(|| "ability with nothing pending".to_string())
}

fn sight_of(game: &GameState, seat: Seat) -> Result<BotSight<'_>, String> {
    let peeked = game
        .seer_memory(seat)
        .map_err(|error| format!("seat {} sight: {error}", seat.get()))?;
    Ok(BotSight {
        plays: game.shown_plays(),
        peeked,
    })
}

fn level_of(levels: [BotLevel; SEATS], seat: Seat) -> Result<BotLevel, String> {
    levels
        .get(seat.index())
        .copied()
        .ok_or_else(|| format!("seat {} is not at the table", seat.get()))
}

fn finish(
    kind: SuiteKind,
    index: u32,
    seed: u64,
    steps: u32,
    levels: [BotLevel; SEATS],
    game: &GameState,
) -> Result<GameSummary, Fault> {
    // Human: A finished game must have one scored round per deal, and the tricks plus the destroyed tricks must equal the cards dealt.
    // Agent: READS scores, totals, view.log; RETURNS GameSummary; Fault when a total, a hit flag, or a trick count does not add up.
    match checked(levels, game) {
        Ok(seats) => Ok(GameSummary {
            kind,
            index,
            seed,
            steps,
            seats,
        }),
        Err(detail) => Err(fault_of(kind, index, seed, steps, "gameOver", detail)),
    }
}

fn checked(levels: [BotLevel; SEATS], game: &GameState) -> Result<[SeatSummary; SEATS], String> {
    let scores = game.scores().map_err(|error| format!("scores: {error}"))?;
    let totals = game.totals().map_err(|error| format!("totals: {error}"))?;
    let view = game
        .view(Seat::from_index(0))
        .map_err(|error| format!("view: {error}"))?;
    if scores.len() != game.schedule().len() {
        return Err(format!(
            "scored {} rounds but the schedule has {}",
            scores.len(),
            game.schedule().len()
        ));
    }
    if view.log.len() != scores.len() {
        return Err(format!(
            "the log has {} rounds but {} were scored",
            view.log.len(),
            scores.len()
        ));
    }
    if totals.len() != SEATS {
        return Err(format!("totals have {} seats", totals.len()));
    }
    let mut seats = blank_seats(levels)?;
    let mut summed = [0i32; SEATS];
    for (round_index, (record, row)) in view.log.iter().zip(scores.iter()).enumerate() {
        add_round(round_index, record, row, &mut seats, &mut summed)?;
    }
    for (index, total) in totals.iter().enumerate() {
        let got = summed.get(index).ok_or("total has no seat")?;
        if *total != *got {
            return Err(format!(
                "seat {index} total {total} does not match the rounds"
            ));
        }
        let seat = seats.get_mut(index).ok_or("summary has no seat")?;
        seat.total = *total;
    }
    Ok(seats)
}

fn blank_seats(levels: [BotLevel; SEATS]) -> Result<[SeatSummary; SEATS], String> {
    let mut seats = [SeatSummary::empty(BotLevel::Easy); SEATS];
    for (index, level) in levels.iter().enumerate() {
        let seat = seats.get_mut(index).ok_or("summary has no seat")?;
        seat.level = *level;
    }
    Ok(seats)
}

fn add_round(
    round_index: usize,
    record: &skt_engine::RoundRecord,
    row: &[skt_engine::Score],
    seats: &mut [SeatSummary; SEATS],
    summed: &mut [i32; SEATS],
) -> Result<(), String> {
    if !record.done {
        return Err(format!("round {round_index} is not scored"));
    }
    if row.len() != SEATS || record.bids.len() != SEATS || record.tricks.len() != SEATS {
        return Err(format!("round {round_index} is not a 4-seat round"));
    }
    let mut tricks_taken = 0u32;
    for slot in &record.tricks {
        let Some(count) = slot else {
            return Err(format!("round {round_index} is missing a trick count"));
        };
        tricks_taken = tricks_taken.saturating_add(u32::from(*count));
    }
    let accounted = tricks_taken.saturating_add(u32::from(record.destroyed));
    if accounted != u32::from(record.cards) {
        return Err(format!(
            "round {round_index} dealt {} cards but tricks plus destroyed is {accounted}",
            record.cards
        ));
    }
    for index in 0..SEATS {
        add_seat(round_index, record, row, seats, summed, index)?;
    }
    Ok(())
}

fn add_seat(
    round_index: usize,
    record: &skt_engine::RoundRecord,
    row: &[skt_engine::Score],
    seats: &mut [SeatSummary; SEATS],
    summed: &mut [i32; SEATS],
    index: usize,
) -> Result<(), String> {
    let score = row.get(index).ok_or("score row is short")?;
    let added = score
        .base
        .checked_add(score.bonus)
        .and_then(|sum| sum.checked_add(score.wager))
        .ok_or_else(|| format!("round {round_index} seat {index} score overflow"))?;
    if score.total != added {
        return Err(format!(
            "round {round_index} seat {index} total does not add up"
        ));
    }
    if score.kind == skt_engine::ScoreKind::Glance {
        return Err(format!(
            "round {round_index} seat {index} recorded a glance under classic scoring"
        ));
    }
    let bid = bid_of(record, round_index, index)?;
    let tricks = tricks_of(record, round_index, index)?;
    if score.hit != (bid == tricks) {
        return Err(format!(
            "round {round_index} seat {index} hit flag does not match the bid"
        ));
    }
    let slot = summed.get_mut(index).ok_or("sum has no seat")?;
    *slot = slot
        .checked_add(score.total)
        .ok_or_else(|| format!("round {round_index} seat {index} score overflow"))?;
    let summary = seats.get_mut(index).ok_or("summary has no seat")?;
    note_bid(summary, record.cards, bid, tricks, score.hit)
}

fn bid_of(
    record: &skt_engine::RoundRecord,
    round_index: usize,
    index: usize,
) -> Result<u8, String> {
    record
        .bids
        .get(index)
        .copied()
        .ok_or_else(|| "bid row is short".to_string())?
        .ok_or_else(|| format!("round {round_index} seat {index} has no bid"))
}

fn tricks_of(
    record: &skt_engine::RoundRecord,
    round_index: usize,
    index: usize,
) -> Result<u8, String> {
    record
        .tricks
        .get(index)
        .copied()
        .ok_or_else(|| "trick row is short".to_string())?
        .ok_or_else(|| format!("round {round_index} seat {index} has no tricks"))
}

fn note_bid(
    summary: &mut SeatSummary,
    cards: u8,
    bid: u8,
    tricks: u8,
    hit: bool,
) -> Result<(), String> {
    summary.bids = bump(summary.bids, "too many bids")?;
    summary.abs_diff = summary
        .abs_diff
        .checked_add(u16::from(bid.abs_diff(tricks)))
        .ok_or_else(|| "bid error overflow".to_string())?;
    if hit {
        summary.hits = bump(summary.hits, "too many hits")?;
    }
    if bid == 0 {
        summary.zero_bids = bump(summary.zero_bids, "too many zero bids")?;
        if hit {
            summary.zero_hits = bump(summary.zero_hits, "too many zero hits")?;
        }
    }
    add_bucket(summary, cards, hit)
}

fn bump(value: u16, label: &str) -> Result<u16, String> {
    value.checked_add(1).ok_or_else(|| label.to_string())
}

fn add_bucket(summary: &mut SeatSummary, cards: u8, hit: bool) -> Result<(), String> {
    let index = usize::from(cards);
    if index >= BUCKETS {
        return Ok(());
    }
    let bids = summary
        .bucket_bids
        .get_mut(index)
        .ok_or("bid bucket missing")?;
    *bids = bids.saturating_add(1);
    if hit {
        let hits = summary
            .bucket_hits
            .get_mut(index)
            .ok_or("hit bucket missing")?;
        *hits = hits.saturating_add(1);
    }
    Ok(())
}

fn fault_of(
    kind: SuiteKind,
    index: u32,
    seed: u64,
    steps: u32,
    phase: &'static str,
    detail: String,
) -> Fault {
    Fault {
        kind,
        index,
        seed,
        steps,
        phase,
        detail,
    }
}

#[cfg(test)]
mod tests {
    use super::{dealer_seat, play_one};
    use crate::stats::{SuiteKind, game_seed};

    #[test]
    fn one_easy_game_and_one_mixed_game_finish() {
        for kind in [SuiteKind::Easy, SuiteKind::Mixed] {
            let seed = game_seed(0x5EED_5A11, kind, 0);
            let game = play_one(kind, 0, seed).expect("game");
            assert_eq!(game.seats[0].bids, 10, "{kind:?} should play ten rounds");
            assert!(game.steps > 100, "{kind:?} finished in too few steps");
        }
    }

    #[test]
    fn the_same_seed_replays_the_same_totals() {
        let seed = game_seed(0x5EED_5A11, SuiteKind::Normal, 2);
        let first = play_one(SuiteKind::Normal, 2, seed).expect("first");
        let second = play_one(SuiteKind::Normal, 2, seed).expect("second");
        let first_totals = first.seats.map(|seat| seat.total);
        let second_totals = second.seats.map(|seat| seat.total);
        assert_eq!(first_totals, second_totals);
    }

    #[test]
    fn the_dealer_rotates_with_the_game_index() {
        assert_eq!(dealer_seat(0), 0);
        assert_eq!(dealer_seat(1), 1);
        assert_eq!(dealer_seat(5), 1);
    }
}
