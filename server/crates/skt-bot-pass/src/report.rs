//! The text record of a pass. The dashboard and the file use the same words.

use std::time::Duration;

use skt_engine::BotLevel;

use crate::play::dealer_seat;
use crate::stats::{
    Fault, GameSummary, LevelTally, Pass, SAMPLE, SuiteKind, SuiteStats, level_index, level_name,
    mean_text, miss_text, pass_watches, percent_text,
};

/// What the pass plays. Kept next to the report so the file and the dashboard match.
pub(crate) const TABLE: &str =
    "4 seats, classic scoring, rounds of 1 to 10, loot, Kraken, White Whale, pirate abilities on.";

const SAMPLE_NOTE: &str = "Balance notes wait for 200 finished games in a block. This run is shorter, so only faults are judged.";

pub(crate) fn render(pass: &Pass) -> String {
    let mut out = String::new();
    header(pass, &mut out);
    bugs(pass, &mut out);
    for suite in &pass.suites {
        out.push('\n');
        suite_section(suite, &mut out);
    }
    out.push('\n');
    watch_section(pass, &mut out);
    if pass.fault_count > 0 {
        out.push('\n');
        fault_section(pass, &mut out);
    }
    out
}

pub(crate) fn render_replay(game: &GameSummary, base: u64) -> String {
    let mut out = String::new();
    push(
        &mut out,
        &format!("{} game {}", game.kind.name(), game.index),
    );
    push(
        &mut out,
        &format!("Seed {:x} from base {base:x}", game.seed),
    );
    push(
        &mut out,
        &format!("Dealer seat {}", dealer_seat(game.index)),
    );
    push(&mut out, &format!("Seats: {}", lineup(game)));
    push(&mut out, &format!("Steps {}", game.steps));
    push(&mut out, &format!("Totals: {}", totals(game)));
    push(&mut out, &winner_text(game));
    let (bids, hits) = game.seats.iter().fold((0u64, 0u64), |(bids, hits), seat| {
        (
            bids.saturating_add(u64::from(seat.bids)),
            hits.saturating_add(u64::from(seat.hits)),
        )
    });
    push(&mut out, &format!("Bid hit {}", percent_text(hits, bids)));
    out
}

pub(crate) fn render_fault(fault: &Fault, base: u64) -> String {
    format!(
        "{} game {} seed {:x} phase {} after {} steps: {}\nReplay: {}",
        fault.kind.name(),
        fault.index,
        fault.seed,
        fault.phase,
        fault.steps,
        fault.detail,
        replay_command(base, fault)
    )
}

pub(crate) fn duration_text(elapsed: Duration) -> String {
    let millis = elapsed.as_millis();
    if millis < 10_000 {
        let tenths = millis / 100;
        return format!("{}.{}s", tenths / 10, tenths % 10);
    }
    let secs = elapsed.as_secs();
    if secs < 60 {
        format!("{secs}s")
    } else {
        format!("{}m {:02}s", secs / 60, secs % 60)
    }
}

pub(crate) fn rate_text(done: u32, elapsed: Duration) -> String {
    let ms = elapsed.as_millis();
    if ms == 0 || done == 0 {
        return "n/a".to_string();
    }
    let per_sec = u128::from(done) * 1_000 / ms;
    if per_sec >= 10 {
        return format!("{per_sec}/s");
    }
    let tenths = u128::from(done) * 10_000 / ms;
    format!("{}.{} /s", tenths / 10, tenths % 10)
}

pub(crate) fn eta_text(done: u32, planned: u32, elapsed: Duration) -> String {
    if done == 0 || planned <= done {
        return "n/a".to_string();
    }
    let ms = elapsed.as_millis();
    if ms == 0 {
        return "n/a".to_string();
    }
    let left = u128::from(planned.saturating_sub(done)) * ms / u128::from(done);
    let millis = u64::try_from(left).unwrap_or(u64::MAX);
    duration_text(Duration::from_millis(millis))
}

fn header(pass: &Pass, out: &mut String) {
    push(out, "Skull King bot pass");
    push(out, TABLE);
    push(
        out,
        "The house table is this game without loot, the beasts, or pirate abilities. This pass leaves them on so those bot paths get played.",
    );
    push(
        out,
        &format!(
            "Base seed {:x}. Dealer rotates each game. {} workers.",
            pass.base_seed, pass.workers
        ),
    );
    let state = if pass.stopped { "Stopped" } else { "Finished" };
    push(
        out,
        &format!(
            "{state} {} of {} games in {}. Faults: {}.",
            pass.attempted(),
            pass.planned(),
            duration_text(pass.elapsed),
            pass.fault_count
        ),
    );
}

fn bugs(pass: &Pass, out: &mut String) {
    out.push('\n');
    push(out, "Bugs");
    if pass.stopped {
        push(
            out,
            &format!(
                "  Stopped early: {} of {} games were played.",
                pass.attempted(),
                pass.planned()
            ),
        );
    }
    if pass.fault_count == 0 {
        push(
            out,
            "  None in the games that finished. Each one scored every round, trick counts added up, and no bot move was rejected.",
        );
    } else {
        push(
            out,
            &format!(
                "  {} games stopped on a bot rejection, an engine fault, or a tally that did not add up.",
                pass.fault_count
            ),
        );
    }
}

fn suite_section(suite: &SuiteStats, out: &mut String) {
    if suite.kind == SuiteKind::Mixed {
        mixed_section(suite, out);
    } else {
        same_section(suite, out);
    }
}

fn same_section(suite: &SuiteStats, out: &mut String) {
    push(
        out,
        &format!(
            "{} — {} finished, {} faults, four {} bots",
            suite.kind.name(),
            suite.finished,
            suite.faults,
            suite.kind.name()
        ),
    );
    push(out, &format!("  Mean score   {}", seat_means(suite)));
    push(
        out,
        &format!(
            "  Sole wins    {}  ({} decisive, {} shared high)",
            seat_wins(suite),
            suite.decisive,
            suite.shared
        ),
    );
    push(out, &format!("  Bids         {}", bid_line(suite)));
    push(
        out,
        &format!(
            "  Spread       mean {} points between first and last",
            mean_text(suite.spread_sum, suite.finished)
        ),
    );
    push(out, &format!("  Steps        max {}", suite.max_steps));
    if let Some(level) = kind_level(suite.kind).and_then(|bot| suite.levels.get(level_index(bot))) {
        push(out, "  Hit by cards");
        push(out, &cards_line(level, 1, 5));
        push(out, &cards_line(level, 6, 10));
    }
}

fn mixed_section(suite: &SuiteStats, out: &mut String) {
    push(
        out,
        &format!(
            "Mixed — {} finished, {} faults",
            suite.finished, suite.faults
        ),
    );
    push(
        out,
        "  One Easy, one Normal, one Hard, and a fourth seat that cycles through the three.",
    );
    push(
        out,
        "  Seats rotate each game, so Hard is not always leaning on the same neighbour.",
    );
    push(
        out,
        "  Hard and Normal bid the same number. Compare levels here. An all-Hard table does not show that edge.",
    );
    for level in [BotLevel::Easy, BotLevel::Normal, BotLevel::Hard] {
        if let Some(tally) = suite.levels.get(level_index(level)) {
            push(out, &level_line(level, tally));
        }
    }
    let decisive = u64::from(suite.decisive);
    push(
        out,
        &format!(
            "  Decisive games: {}. Sole wins by level, of those games:",
            suite.decisive
        ),
    );
    for level in [BotLevel::Easy, BotLevel::Normal, BotLevel::Hard] {
        if let Some(tally) = suite.levels.get(level_index(level)) {
            push(
                out,
                &format!(
                    "    {:<6} {}",
                    level_name(level),
                    percent_text(u64::from(tally.decisive_wins), decisive)
                ),
            );
        }
    }
    for level in [BotLevel::Easy, BotLevel::Normal, BotLevel::Hard] {
        if let Some(tally) = suite.levels.get(level_index(level)) {
            push(out, &format!("  Hit by cards, {}", level_name(level)));
            push(out, &cards_line(tally, 1, 5));
            push(out, &cards_line(tally, 6, 10));
        }
    }
}

fn watch_section(pass: &Pass, out: &mut String) {
    push(out, "Watch");
    let notes = pass_watches(pass);
    if notes.is_empty() {
        let short = pass.suites.iter().any(|suite| suite.finished < SAMPLE);
        if short {
            push(out, &format!("  {SAMPLE_NOTE}"));
        } else {
            push(
                out,
                "  None. Easy is not ahead of Hard on the mixed table, and no same-level seat is taking the wins.",
            );
        }
        return;
    }
    for note in notes {
        push(out, &format!("  {note}"));
    }
}

fn fault_section(pass: &Pass, out: &mut String) {
    push(out, "Faults");
    for fault in &pass.faults {
        push(
            out,
            &format!(
                "  {} game {} seed {:x} phase {} after {} steps: {}",
                fault.kind.name(),
                fault.index,
                fault.seed,
                fault.phase,
                fault.steps,
                fault.detail
            ),
        );
        push(
            out,
            &format!("    Replay: {}", replay_command(pass.base_seed, fault)),
        );
    }
    if pass.fault_count > u32::try_from(pass.faults.len()).unwrap_or(pass.fault_count) {
        let extra = pass
            .fault_count
            .saturating_sub(u32::try_from(pass.faults.len()).unwrap_or(0));
        push(
            out,
            &format!("  {extra} more faults were counted and not listed."),
        );
    }
}

fn replay_command(base: u64, fault: &Fault) -> String {
    format!(
        "scripts/bot-pass.sh --replay {} {} --seed {base:x}",
        fault.kind.name().to_ascii_lowercase(),
        fault.index
    )
}

fn seat_means(suite: &SuiteStats) -> String {
    let mut parts = Vec::new();
    for (index, seat) in suite.seats.iter().enumerate() {
        parts.push(format!(
            "s{index} {}",
            mean_text(seat.score_sum, seat.games)
        ));
    }
    parts.join("  ")
}

fn seat_wins(suite: &SuiteStats) -> String {
    let whole = u64::from(suite.decisive);
    let mut parts = Vec::new();
    for (index, seat) in suite.seats.iter().enumerate() {
        parts.push(format!(
            "s{index} {}",
            percent_text(u64::from(seat.sole_wins), whole)
        ));
    }
    parts.join("  ")
}

fn bid_line(suite: &SuiteStats) -> String {
    let mut bids = 0u64;
    let mut hits = 0u64;
    let mut abs_diff = 0u64;
    let mut zero_bids = 0u64;
    let mut zero_hits = 0u64;
    for seat in &suite.seats {
        bids = bids.saturating_add(seat.bids);
        hits = hits.saturating_add(seat.hits);
        abs_diff = abs_diff.saturating_add(seat.abs_diff);
        zero_bids = zero_bids.saturating_add(seat.zero_bids);
        zero_hits = zero_hits.saturating_add(seat.zero_hits);
    }
    format!(
        "hit {}   mean miss {} tricks   zero-bids {zero_bids} hit {}",
        percent_text(hits, bids),
        miss_text(abs_diff, bids),
        percent_text(zero_hits, zero_bids)
    )
}

fn level_line(level: BotLevel, tally: &LevelTally) -> String {
    format!(
        "  {:<6} seats {}   mean {}   hit {}   mean miss {}",
        level_name(level),
        tally.games,
        mean_text(tally.score_sum, tally.games),
        percent_text(tally.hits, tally.bids),
        miss_text(tally.abs_diff, tally.bids)
    )
}

fn cards_line(level: &LevelTally, start: u8, end: u8) -> String {
    let mut parts = Vec::new();
    for cards in start..=end {
        let (bids, hits) = level.bucket(usize::from(cards)).unwrap_or((0, 0));
        parts.push(format!("{cards:>2} {}", percent_text(hits, bids)));
    }
    format!("   {}", parts.join("   "))
}

fn lineup(game: &GameSummary) -> String {
    game.seats
        .iter()
        .map(|seat| level_name(seat.level))
        .collect::<Vec<_>>()
        .join(", ")
}

fn totals(game: &GameSummary) -> String {
    game.seats
        .iter()
        .map(|seat| seat.total.to_string())
        .collect::<Vec<_>>()
        .join(", ")
}

fn winner_text(game: &GameSummary) -> String {
    let mut high = i32::MIN;
    for seat in &game.seats {
        high = high.max(seat.total);
    }
    let leaders: Vec<usize> = game
        .seats
        .iter()
        .enumerate()
        .filter(|(_, seat)| seat.total == high)
        .map(|(index, _)| index)
        .collect();
    if let [index] = leaders.as_slice() {
        let name = game
            .seats
            .get(*index)
            .map_or("unknown", |seat| level_name(seat.level));
        format!("Sole winner: seat {index} ({name})")
    } else {
        format!("Shared high: {} seats", leaders.len())
    }
}

const fn kind_level(kind: SuiteKind) -> Option<BotLevel> {
    match kind {
        SuiteKind::Easy => Some(BotLevel::Easy),
        SuiteKind::Normal => Some(BotLevel::Normal),
        SuiteKind::Hard => Some(BotLevel::Hard),
        SuiteKind::Mixed => None,
    }
}

fn push(out: &mut String, line: &str) {
    out.push_str(line);
    out.push('\n');
}

#[cfg(test)]
mod tests {
    use super::render;
    use crate::stats::{Fault, Pass, SuiteKind};

    #[test]
    fn a_fault_is_named_with_its_replay_command() {
        let mut pass = Pass::new(1, 0x5EED_5A11, 1);
        pass.record_fault(Fault {
            kind: SuiteKind::Mixed,
            index: 12,
            seed: 0xabc,
            steps: 40,
            phase: "playing",
            detail: "seat 1 play rejected: illegal move".to_string(),
        });
        pass.mark_done();
        let text = render(&pass);
        assert!(
            text.contains("seat 1 play rejected: illegal move"),
            "{text}"
        );
        assert!(text.contains("seed abc"), "{text}");
        assert!(text.contains("--replay mixed 12"), "{text}");
        assert!(text.contains(super::SAMPLE_NOTE), "{text}");
    }
}
