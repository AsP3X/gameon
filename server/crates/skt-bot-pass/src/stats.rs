//! Tallies for one pass: per suite, per seat, and per bot level.

use std::time::{Duration, Instant};

use skt_engine::BotLevel;

/// Seats at every table in the pass.
pub(crate) const SEATS: usize = 4;

/// Same count as [`SEATS`], as the `u8` the engine asks for.
pub(crate) const PLAYERS: u8 = 4;

/// Easy, Normal, Hard.
pub(crate) const LEVELS: usize = 3;

/// Index 0 is unused. Indexes 1 through 10 are the classic round lengths.
pub(crate) const BUCKETS: usize = 11;

/// Finished games a suite needs before a balance note is worth raising.
pub(crate) const SAMPLE: u32 = 200;

/// Bids a same-level suite needs before a hit rate is judged.
const HIT_SAMPLE: u64 = 1_000;

/// Sole-win share of decisive games, in tenths of a percent. About 25% is even.
const SEAT_LOW: u32 = 200;
const SEAT_HIGH: u32 = 300;

/// Hit rate, in tenths of a percent, outside which Normal or Hard looks broken.
const HIT_LOW: u32 = 100;
const HIT_HIGH: u32 = 850;

/// Four-way ties, in tenths of a percent, past which the scores look stuck.
const TIE_HIGH: u32 = 50;

/// Easy's hit rate has to clear Normal's by this many tenths of a percent.
const EASY_HIT_GAP: u32 = 50;

/// Steps past this on one game are worth a look. A normal classic game stays under it.
const STEP_WATCH: u32 = 2_000;

const FAULT_KEEP: usize = 20;

/// Which block of the pass a game belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SuiteKind {
    Easy,
    Normal,
    Hard,
    Mixed,
}

impl SuiteKind {
    pub(crate) const fn all() -> [Self; 4] {
        [Self::Easy, Self::Normal, Self::Hard, Self::Mixed]
    }

    pub(crate) const fn name(self) -> &'static str {
        match self {
            Self::Easy => "Easy",
            Self::Normal => "Normal",
            Self::Hard => "Hard",
            Self::Mixed => "Mixed",
        }
    }

    pub(crate) const fn tag(self) -> u64 {
        match self {
            Self::Easy => 1,
            Self::Normal => 2,
            Self::Hard => 3,
            Self::Mixed => 4,
        }
    }

    pub(crate) fn parse(text: &str) -> Option<Self> {
        match text.to_ascii_lowercase().as_str() {
            "easy" => Some(Self::Easy),
            "normal" => Some(Self::Normal),
            "hard" => Some(Self::Hard),
            "mixed" => Some(Self::Mixed),
            _ => None,
        }
    }

    /// The four bots for game `index`. Mixed rotates seats and cycles the fourth bot.
    pub(crate) fn levels(self, index: u32) -> [BotLevel; SEATS] {
        match self {
            Self::Easy => [BotLevel::Easy; SEATS],
            Self::Normal => [BotLevel::Normal; SEATS],
            Self::Hard => [BotLevel::Hard; SEATS],
            Self::Mixed => mixed_levels(index),
        }
    }
}

pub(crate) const fn level_name(level: BotLevel) -> &'static str {
    match level {
        BotLevel::Easy => "Easy",
        BotLevel::Normal => "Normal",
        BotLevel::Hard => "Hard",
    }
}

pub(crate) const fn level_index(level: BotLevel) -> usize {
    match level {
        BotLevel::Easy => 0,
        BotLevel::Normal => 1,
        BotLevel::Hard => 2,
    }
}

pub(crate) const fn suite_index(kind: SuiteKind) -> usize {
    match kind {
        SuiteKind::Easy => 0,
        SuiteKind::Normal => 1,
        SuiteKind::Hard => 2,
        SuiteKind::Mixed => 3,
    }
}

// Human: The fourth seat cycles through the three levels, and the whole lineup rotates, so Hard is not always sabotaging the same neighbour.
// Agent: READS game index; RETURNS four BotLevels; every lineup contains Easy, Normal, and Hard.
pub(crate) fn mixed_levels(index: u32) -> [BotLevel; SEATS] {
    let fourth = match index % 3 {
        1 => BotLevel::Normal,
        2 => BotLevel::Hard,
        _ => BotLevel::Easy,
    };
    let base = [BotLevel::Easy, BotLevel::Normal, BotLevel::Hard, fourth];
    let shift = mod4(index);
    let mut seated = base;
    for seat in 0..SEATS {
        let from = (seat + shift) % SEATS;
        if let Some(level) = base.get(from).copied()
            && let Some(slot) = seated.get_mut(seat)
        {
            *slot = level;
        }
    }
    seated
}

const fn mod4(index: u32) -> usize {
    match index % 4 {
        1 => 1,
        2 => 2,
        3 => 3,
        _ => 0,
    }
}

/// Seed for one game. The same base, suite, and index always rebuild the same game.
pub(crate) fn game_seed(base: u64, kind: SuiteKind, index: u32) -> u64 {
    let mut z =
        base ^ kind.tag().wrapping_shl(48) ^ u64::from(index).wrapping_mul(0x9E37_79B9_7F4A_7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    let mixed = z ^ (z >> 31);
    if mixed == 0 {
        0xA5A5_A5A5_A5A5_A5A5
    } else {
        mixed
    }
}

/// One seat's bids and score for one finished game.
#[derive(Debug, Clone, Copy)]
pub(crate) struct SeatSummary {
    pub level: BotLevel,
    pub total: i32,
    pub bids: u16,
    pub hits: u16,
    pub abs_diff: u16,
    pub zero_bids: u16,
    pub zero_hits: u16,
    pub bucket_bids: [u8; BUCKETS],
    pub bucket_hits: [u8; BUCKETS],
}

impl SeatSummary {
    pub(crate) const fn empty(level: BotLevel) -> Self {
        Self {
            level,
            total: 0,
            bids: 0,
            hits: 0,
            abs_diff: 0,
            zero_bids: 0,
            zero_hits: 0,
            bucket_bids: [0; BUCKETS],
            bucket_hits: [0; BUCKETS],
        }
    }
}

/// A game that reached `gameOver` and passed the checkers.
#[derive(Debug, Clone)]
pub(crate) struct GameSummary {
    pub kind: SuiteKind,
    pub index: u32,
    pub seed: u64,
    pub steps: u32,
    pub seats: [SeatSummary; SEATS],
}

/// A game that stopped on a bot rejection, an engine fault, or a broken tally.
#[derive(Debug, Clone)]
pub(crate) struct Fault {
    pub kind: SuiteKind,
    pub index: u32,
    pub seed: u64,
    pub steps: u32,
    pub phase: &'static str,
    pub detail: String,
}

#[derive(Debug, Clone, Copy)]
struct Bucket {
    bids: u64,
    hits: u64,
}

impl Bucket {
    const fn new() -> Self {
        Self { bids: 0, hits: 0 }
    }
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct SeatTally {
    pub games: u32,
    pub sole_wins: u32,
    pub shared_wins: u32,
    pub score_sum: i64,
    pub min_score: i32,
    pub max_score: i32,
    pub bids: u64,
    pub hits: u64,
    pub abs_diff: u64,
    pub zero_bids: u64,
    pub zero_hits: u64,
}

impl SeatTally {
    const fn new() -> Self {
        Self {
            games: 0,
            sole_wins: 0,
            shared_wins: 0,
            score_sum: 0,
            min_score: i32::MAX,
            max_score: i32::MIN,
            bids: 0,
            hits: 0,
            abs_diff: 0,
            zero_bids: 0,
            zero_hits: 0,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct LevelTally {
    pub games: u32,
    pub decisive_wins: u32,
    pub score_sum: i64,
    pub bids: u64,
    pub hits: u64,
    pub abs_diff: u64,
    pub zero_bids: u64,
    pub zero_hits: u64,
    buckets: [Bucket; BUCKETS],
}

impl LevelTally {
    const fn new() -> Self {
        Self {
            games: 0,
            decisive_wins: 0,
            score_sum: 0,
            bids: 0,
            hits: 0,
            abs_diff: 0,
            zero_bids: 0,
            zero_hits: 0,
            buckets: [Bucket::new(); BUCKETS],
        }
    }

    pub(crate) fn bucket(&self, cards: usize) -> Option<(u64, u64)> {
        self.buckets
            .get(cards)
            .map(|bucket| (bucket.bids, bucket.hits))
    }
}

#[derive(Debug, Clone)]
pub(crate) struct SuiteStats {
    pub kind: SuiteKind,
    pub planned: u32,
    pub finished: u32,
    pub faults: u32,
    pub decisive: u32,
    pub shared: u32,
    pub all_tied: u32,
    pub spread_sum: i64,
    pub max_steps: u32,
    pub max_steps_index: u32,
    pub max_steps_seed: u64,
    pub seats: [SeatTally; SEATS],
    pub levels: [LevelTally; LEVELS],
}

impl SuiteStats {
    fn new(kind: SuiteKind, planned: u32) -> Self {
        Self {
            kind,
            planned,
            finished: 0,
            faults: 0,
            decisive: 0,
            shared: 0,
            all_tied: 0,
            spread_sum: 0,
            max_steps: 0,
            max_steps_index: 0,
            max_steps_seed: 0,
            seats: [SeatTally::new(); SEATS],
            levels: [LevelTally::new(); LEVELS],
        }
    }

    pub(crate) const fn attempted(&self) -> u32 {
        self.finished.saturating_add(self.faults)
    }

    fn record(&mut self, game: &GameSummary) {
        self.finished = self.finished.saturating_add(1);
        if game.steps >= self.max_steps {
            self.max_steps = game.steps;
            self.max_steps_index = game.index;
            self.max_steps_seed = game.seed;
        }
        let (low, high, leaders) = spread_of(game);
        if let Some(span) = high.checked_sub(low) {
            self.spread_sum = self.spread_sum.saturating_add(i64::from(span));
        }
        self.note_leaders(leaders);
        for (index, seat) in game.seats.iter().enumerate() {
            let won = seat.total == high;
            let sole = won && leaders == 1;
            let shared = won && leaders > 1;
            if let Some(tally) = self.seats.get_mut(index) {
                add_seat(tally, seat, sole, shared);
            }
            if let Some(level) = self.levels.get_mut(level_index(seat.level)) {
                add_level(level, seat, sole);
            }
        }
    }

    fn note_leaders(&mut self, leaders: u32) {
        if leaders == 1 {
            self.decisive = self.decisive.saturating_add(1);
        }
        if leaders > 1 {
            self.shared = self.shared.saturating_add(1);
        }
        if leaders == u32::from(PLAYERS) {
            self.all_tied = self.all_tied.saturating_add(1);
        }
    }
}

fn spread_of(game: &GameSummary) -> (i32, i32, u32) {
    let mut low = i32::MAX;
    let mut high = i32::MIN;
    for seat in &game.seats {
        low = low.min(seat.total);
        high = high.max(seat.total);
    }
    let mut leaders = 0u32;
    for seat in &game.seats {
        if seat.total == high {
            leaders = leaders.saturating_add(1);
        }
    }
    (low, high, leaders)
}

fn add_seat(tally: &mut SeatTally, seat: &SeatSummary, sole: bool, shared: bool) {
    tally.games = tally.games.saturating_add(1);
    if sole {
        tally.sole_wins = tally.sole_wins.saturating_add(1);
    }
    if shared {
        tally.shared_wins = tally.shared_wins.saturating_add(1);
    }
    tally.score_sum = tally.score_sum.saturating_add(i64::from(seat.total));
    tally.min_score = tally.min_score.min(seat.total);
    tally.max_score = tally.max_score.max(seat.total);
    tally.bids = tally.bids.saturating_add(u64::from(seat.bids));
    tally.hits = tally.hits.saturating_add(u64::from(seat.hits));
    tally.abs_diff = tally.abs_diff.saturating_add(u64::from(seat.abs_diff));
    tally.zero_bids = tally.zero_bids.saturating_add(u64::from(seat.zero_bids));
    tally.zero_hits = tally.zero_hits.saturating_add(u64::from(seat.zero_hits));
}

fn add_level(level: &mut LevelTally, seat: &SeatSummary, sole: bool) {
    level.games = level.games.saturating_add(1);
    if sole {
        level.decisive_wins = level.decisive_wins.saturating_add(1);
    }
    level.score_sum = level.score_sum.saturating_add(i64::from(seat.total));
    level.bids = level.bids.saturating_add(u64::from(seat.bids));
    level.hits = level.hits.saturating_add(u64::from(seat.hits));
    level.abs_diff = level.abs_diff.saturating_add(u64::from(seat.abs_diff));
    level.zero_bids = level.zero_bids.saturating_add(u64::from(seat.zero_bids));
    level.zero_hits = level.zero_hits.saturating_add(u64::from(seat.zero_hits));
    for (index, bids) in seat.bucket_bids.iter().enumerate() {
        let Some(bucket) = level.buckets.get_mut(index) else {
            continue;
        };
        bucket.bids = bucket.bids.saturating_add(u64::from(*bids));
        if let Some(hits) = seat.bucket_hits.get(index).copied() {
            bucket.hits = bucket.hits.saturating_add(u64::from(hits));
        }
    }
}

/// The whole pass, including games still in flight.
pub(crate) struct Pass {
    pub base_seed: u64,
    pub workers: usize,
    pub planned_each: u32,
    pub started: Instant,
    pub elapsed: Duration,
    pub stopped: bool,
    pub fault_count: u32,
    pub faults: Vec<Fault>,
    pub suites: [SuiteStats; 4],
}

impl Pass {
    pub(crate) fn new(planned_each: u32, base_seed: u64, workers: usize) -> Self {
        let suites = SuiteKind::all().map(|kind| SuiteStats::new(kind, planned_each));
        Self {
            base_seed,
            workers,
            planned_each,
            started: Instant::now(),
            elapsed: Duration::ZERO,
            stopped: false,
            fault_count: 0,
            faults: Vec::new(),
            suites,
        }
    }

    pub(crate) fn planned(&self) -> u32 {
        self.planned_each.saturating_mul(4)
    }

    pub(crate) fn attempted(&self) -> u32 {
        self.suites
            .iter()
            .fold(0u32, |sum, suite| sum.saturating_add(suite.attempted()))
    }

    pub(crate) fn record_game(&mut self, game: &GameSummary) {
        if let Some(suite) = self.suites.get_mut(suite_index(game.kind)) {
            suite.record(game);
        }
    }

    pub(crate) fn record_fault(&mut self, fault: Fault) {
        if let Some(suite) = self.suites.get_mut(suite_index(fault.kind)) {
            suite.faults = suite.faults.saturating_add(1);
        }
        self.fault_count = self.fault_count.saturating_add(1);
        if self.faults.len() < FAULT_KEEP {
            self.faults.push(fault);
        }
    }

    pub(crate) fn mark_done(&mut self) {
        self.elapsed = self.started.elapsed();
        self.stopped = self.attempted() < self.planned();
    }
}

pub(crate) fn percent_tenths(part: u64, whole: u64) -> Option<u32> {
    if whole == 0 {
        return None;
    }
    let rounded = part.saturating_mul(1_000).saturating_add(whole / 2) / whole;
    u32::try_from(rounded).ok()
}

pub(crate) fn percent_text(part: u64, whole: u64) -> String {
    match percent_tenths(part, whole) {
        Some(tenths) => format!("{}.{}%", tenths / 10, tenths % 10),
        None => "n/a".to_string(),
    }
}

pub(crate) fn mean_text(sum: i64, count: u32) -> String {
    if count == 0 {
        return "n/a".to_string();
    }
    let negative = sum < 0;
    let magnitude = sum.unsigned_abs();
    let width = u64::from(count);
    let whole = magnitude / width;
    let frac = (magnitude % width).saturating_mul(10) / width;
    if negative {
        format!("-{whole}.{frac}")
    } else {
        format!("{whole}.{frac}")
    }
}

pub(crate) fn miss_text(abs_diff: u64, bids: u64) -> String {
    if bids == 0 {
        return "n/a".to_string();
    }
    let tenths = abs_diff.saturating_mul(10) / bids;
    format!("{}.{}", tenths / 10, tenths % 10)
}

/// Notes a full sample can support. A short run stays quiet on balance.
pub(crate) fn pass_watches(pass: &Pass) -> Vec<String> {
    let mut notes = Vec::new();
    for suite in &pass.suites {
        suite_watches(suite, &mut notes);
    }
    easy_against_normal(pass, &mut notes);
    notes
}

fn suite_watches(suite: &SuiteStats, notes: &mut Vec<String>) {
    if suite.finished < SAMPLE {
        return;
    }
    stuck_scores(suite, notes);
    long_game(suite, notes);
    if suite.kind == SuiteKind::Mixed {
        level_order(suite, notes);
    } else {
        seat_bias(suite, notes);
        hit_band(suite, notes);
        tie_rate(suite, notes);
    }
}

fn stuck_scores(suite: &SuiteStats, notes: &mut Vec<String>) {
    for (index, seat) in suite.seats.iter().enumerate() {
        if seat.games >= SAMPLE && seat.min_score == seat.max_score {
            notes.push(format!(
                "{}: seat {index} scored {} in every finished game.",
                suite.kind.name(),
                seat.min_score
            ));
        }
    }
}

fn long_game(suite: &SuiteStats, notes: &mut Vec<String>) {
    if suite.max_steps > STEP_WATCH {
        notes.push(format!(
            "{}: game {} took {} steps (seed {:x}). A classic game is usually a few hundred.",
            suite.kind.name(),
            suite.max_steps_index,
            suite.max_steps,
            suite.max_steps_seed
        ));
    }
}

fn seat_bias(suite: &SuiteStats, notes: &mut Vec<String>) {
    if suite.decisive < SAMPLE {
        return;
    }
    let whole = u64::from(suite.decisive);
    for (index, seat) in suite.seats.iter().enumerate() {
        let Some(share) = percent_tenths(u64::from(seat.sole_wins), whole) else {
            continue;
        };
        if (SEAT_LOW..=SEAT_HIGH).contains(&share) {
            continue;
        }
        notes.push(format!(
            "{}: seat {index} won {} of decisive games. Four equal bots should each win about 25%, and the dealer rotates, so this is a seat bias.",
            suite.kind.name(),
            percent_text(u64::from(seat.sole_wins), whole)
        ));
    }
}

fn hit_band(suite: &SuiteStats, notes: &mut Vec<String>) {
    if matches!(suite.kind, SuiteKind::Easy) {
        return;
    }
    let (bids, hits) = seat_bids(suite);
    if bids < HIT_SAMPLE {
        return;
    }
    let Some(rate) = percent_tenths(hits, bids) else {
        return;
    };
    if (HIT_LOW..=HIT_HIGH).contains(&rate) {
        return;
    }
    notes.push(format!(
        "{}: bid hit rate is {}. A same-level table that far from a playable hit rate means the bids are not tracking the tricks.",
        suite.kind.name(),
        percent_text(hits, bids)
    ));
}

fn tie_rate(suite: &SuiteStats, notes: &mut Vec<String>) {
    let Some(rate) = percent_tenths(u64::from(suite.all_tied), u64::from(suite.finished)) else {
        return;
    };
    if rate <= TIE_HIGH {
        return;
    }
    notes.push(format!(
        "{}: {} of games were a four-way tie. The scores are not separating.",
        suite.kind.name(),
        percent_text(u64::from(suite.all_tied), u64::from(suite.finished))
    ));
}

fn level_order(suite: &SuiteStats, notes: &mut Vec<String>) {
    let Some(easy) = suite.levels.get(level_index(BotLevel::Easy)) else {
        return;
    };
    let Some(hard) = suite.levels.get(level_index(BotLevel::Hard)) else {
        return;
    };
    if easy.games < SAMPLE || hard.games < SAMPLE {
        return;
    }
    if mean_at_least(easy.score_sum, easy.games, hard.score_sum, hard.games) {
        notes.push(format!(
            "Mixed: Easy's mean score ({}) is at least Hard's ({}). Easy slips on purpose, so Hard should be ahead on this table.",
            mean_text(easy.score_sum, easy.games),
            mean_text(hard.score_sum, hard.games)
        ));
    }
    if rate_at_least(
        u64::from(easy.decisive_wins),
        u64::from(easy.games),
        u64::from(hard.decisive_wins),
        u64::from(hard.games),
    ) {
        notes.push(
            "Mixed: an Easy seat is winning decisive games at least as often as a Hard seat. The levels are not separating.".to_string(),
        );
    }
}

fn easy_against_normal(pass: &Pass, notes: &mut Vec<String>) {
    let Some(easy) = pass.suites.get(suite_index(SuiteKind::Easy)) else {
        return;
    };
    let Some(normal) = pass.suites.get(suite_index(SuiteKind::Normal)) else {
        return;
    };
    if easy.finished < SAMPLE || normal.finished < SAMPLE {
        return;
    }
    let (easy_bids, easy_hits) = seat_bids(easy);
    let (normal_bids, normal_hits) = seat_bids(normal);
    if easy_bids < HIT_SAMPLE || normal_bids < HIT_SAMPLE {
        return;
    }
    let Some(easy_rate) = percent_tenths(easy_hits, easy_bids) else {
        return;
    };
    let Some(normal_rate) = percent_tenths(normal_hits, normal_bids) else {
        return;
    };
    if easy_rate <= normal_rate.saturating_add(EASY_HIT_GAP) {
        return;
    }
    notes.push(format!(
        "Easy hits {} and Normal hits {} on their own tables. Easy is supposed to slip, so it should not be the more accurate bidder.",
        percent_text(easy_hits, easy_bids),
        percent_text(normal_hits, normal_bids)
    ));
}

fn seat_bids(suite: &SuiteStats) -> (u64, u64) {
    suite.seats.iter().fold((0u64, 0u64), |(bids, hits), seat| {
        (
            bids.saturating_add(seat.bids),
            hits.saturating_add(seat.hits),
        )
    })
}

/// True when `left / left_n` is greater than or equal to `right / right_n`.
fn mean_at_least(left: i64, left_n: u32, right: i64, right_n: u32) -> bool {
    let Some(scaled_left) = left.checked_mul(i64::from(right_n)) else {
        return false;
    };
    let Some(scaled_right) = right.checked_mul(i64::from(left_n)) else {
        return false;
    };
    scaled_left >= scaled_right
}

fn rate_at_least(left: u64, left_n: u64, right: u64, right_n: u64) -> bool {
    left.saturating_mul(right_n) >= right.saturating_mul(left_n)
}

#[cfg(test)]
mod tests {
    use super::{
        GameSummary, Pass, SAMPLE, SeatSummary, SuiteKind, game_seed, mixed_levels, pass_watches,
    };
    use skt_engine::BotLevel;

    #[test]
    fn mixed_lineups_rotate_and_keep_every_level() {
        assert_eq!(
            mixed_levels(0),
            [
                BotLevel::Easy,
                BotLevel::Normal,
                BotLevel::Hard,
                BotLevel::Easy
            ]
        );
        assert_eq!(
            mixed_levels(1),
            [
                BotLevel::Normal,
                BotLevel::Hard,
                BotLevel::Normal,
                BotLevel::Easy
            ]
        );
        let mut seen = [[false; 3]; 4];
        for index in 0..12 {
            let levels = mixed_levels(index);
            assert!(
                levels.contains(&BotLevel::Easy)
                    && levels.contains(&BotLevel::Normal)
                    && levels.contains(&BotLevel::Hard),
                "game {index} dropped a level"
            );
            for (seat, level) in levels.iter().enumerate() {
                seen[seat][super::level_index(*level)] = true;
            }
        }
        assert!(seen.iter().all(|row| row.iter().all(|flag| *flag)));
    }

    #[test]
    fn seeds_change_with_the_suite_and_the_index_and_stay_nonzero() {
        let base = 0x5EED_5A11;
        let easy = game_seed(base, SuiteKind::Easy, 0);
        assert_ne!(easy, 0);
        assert_ne!(easy, game_seed(base, SuiteKind::Easy, 1));
        assert_ne!(easy, game_seed(base, SuiteKind::Hard, 0));
        assert_eq!(easy, game_seed(base, SuiteKind::Easy, 0));
    }

    #[test]
    fn a_seat_that_wins_every_game_is_flagged() {
        let mut pass = Pass::new(SAMPLE, 1, 1);
        for index in 0..SAMPLE {
            pass.record_game(&biased_game(index));
        }
        let notes = pass_watches(&pass);
        assert!(
            notes.iter().any(|note| note.contains("seat 0")),
            "notes: {notes:?}"
        );
    }

    #[test]
    fn an_even_table_and_a_short_run_stay_quiet() {
        let mut even = Pass::new(SAMPLE, 1, 1);
        for index in 0..SAMPLE {
            even.record_game(&rotated_game(index));
        }
        assert!(
            pass_watches(&even).is_empty(),
            "notes: {:?}",
            pass_watches(&even)
        );

        let mut short = Pass::new(2, 1, 1);
        short.record_game(&biased_game(0));
        assert!(pass_watches(&short).is_empty());
    }

    #[test]
    fn easy_scoring_above_hard_on_the_mixed_table_is_flagged() {
        let mut pass = Pass::new(SAMPLE, 1, 1);
        for index in 0..SAMPLE {
            pass.record_game(&mixed_game(index, true));
        }
        let notes = pass_watches(&pass);
        assert!(
            notes.iter().any(|note| note.contains("Easy")),
            "notes: {notes:?}"
        );
    }

    fn seat(level: BotLevel, total: i32, hits: u16) -> SeatSummary {
        let mut summary = SeatSummary::empty(level);
        summary.total = total;
        summary.bids = 10;
        summary.hits = hits;
        summary.abs_diff = 8;
        summary.bucket_bids = [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
        summary
    }

    fn biased_game(index: u32) -> GameSummary {
        let wobble = i32::try_from(index % 5).unwrap_or(0);
        GameSummary {
            kind: SuiteKind::Normal,
            index,
            seed: 1,
            steps: 400,
            seats: [
                seat(BotLevel::Normal, 80 + wobble, 4),
                seat(BotLevel::Normal, 20 + wobble, 4),
                seat(
                    BotLevel::Normal,
                    10 + i32::try_from(index % 3).unwrap_or(0),
                    4,
                ),
                seat(BotLevel::Normal, 5 + wobble, 4),
            ],
        }
    }

    fn rotated_game(index: u32) -> GameSummary {
        let winner = mod_seat(index);
        let mut totals = [0i32; 4];
        for (seat_index, total) in totals.iter_mut().enumerate() {
            let seat = u32::try_from(seat_index).unwrap_or(0);
            let wobble = i32::try_from((index + seat) % 7).unwrap_or(0);
            *total = wobble;
        }
        if let Some(total) = totals.get_mut(winner) {
            *total += 40;
        }
        GameSummary {
            kind: SuiteKind::Normal,
            index,
            seed: 1,
            steps: 400,
            seats: [
                seat(BotLevel::Normal, totals[0], 4),
                seat(BotLevel::Normal, totals[1], 4),
                seat(BotLevel::Normal, totals[2], 4),
                seat(BotLevel::Normal, totals[3], 4),
            ],
        }
    }

    fn mixed_game(index: u32, easy_ahead: bool) -> GameSummary {
        let easy = if easy_ahead { 80 } else { 20 };
        let hard = if easy_ahead { 20 } else { 80 };
        let wobble = i32::try_from(index % 4).unwrap_or(0);
        GameSummary {
            kind: SuiteKind::Mixed,
            index,
            seed: 1,
            steps: 400,
            seats: [
                seat(BotLevel::Easy, easy + wobble, 3),
                seat(BotLevel::Normal, 40 + wobble, 4),
                seat(BotLevel::Hard, hard + wobble, 4),
                seat(BotLevel::Normal, 30 + wobble, 4),
            ],
        }
    }

    fn mod_seat(index: u32) -> usize {
        match index % 4 {
            1 => 1,
            2 => 2,
            3 => 3,
            _ => 0,
        }
    }
}
