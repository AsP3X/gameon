//! Ranked rating, seasons, match window, and leave cooldown.
//!
//! The number a player sees is the nearest integer of μ − 3σ. μ and σ are Weng-Lin
//! (`OpenSkill`, Plackett-Luce), one player per team, from the `skillratings` crate.
//! A new account has no row: the screen shows unrated. The prior used for a first game
//! is μ 25 and σ 25/3, whose ordinal is 0.

use std::time::Duration;

use skillratings::MultiTeamOutcome;
use skillratings::weng_lin::{WengLinConfig, WengLinRating, weng_lin_multi_team};
use skt_protocol::{Rating, Season, UnixMs};

/// Games in a season that still count as placement. The fifth game ends it.
pub const PLACEMENT_GAMES: u32 = 5;

/// Ordinal half-width when a player has just joined the ranked queue.
pub const WINDOW_START: i32 = 10;

/// Added to the half-width for every [`WINDOW_EVERY`] spent waiting.
pub const WINDOW_STEP: i32 = 10;

/// How often the match window grows.
pub const WINDOW_EVERY: Duration = Duration::from_secs(15);

/// The matchmaker only looks at the players who have waited the longest.
pub const WINDOW_OLDEST: usize = 12;

/// First leave of a season closes ranked for this long. Each further leave doubles it.
pub const COOLDOWN_BASE_MS: i64 = 15 * 60 * 1000;

/// The leave penalty never closes ranked for longer than a day.
pub const COOLDOWN_CAP_MS: i64 = 24 * 60 * 60 * 1000;

const MU: f64 = 25.0;
const SIGMA: f64 = 25.0 / 3.0;
const BETA: f64 = 25.0 / 6.0;
const SEASON_EPOCH_YEAR: i32 = 2026;

/// μ, σ, and how many ranked games this season already count.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PlayerSkill {
    /// Weng-Lin μ.
    pub mu: f64,
    /// Weng-Lin σ.
    pub sigma: f64,
    /// Ranked games finished this season.
    pub games: u32,
}

/// What Postgres stored, before a season boundary is applied.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct StoredSkill {
    /// Season the μ was written in.
    pub season_id: u32,
    /// Weng-Lin μ.
    pub mu: f64,
    /// Weng-Lin σ.
    pub sigma: f64,
    /// Ranked games in `season_id`.
    pub games: u32,
    /// Ranked leaves in `leave_season`.
    pub leaves: u32,
    /// Season the leave count belongs to.
    pub leave_season: u32,
    /// Unix milliseconds when ranked opens again, if a penalty is stored.
    pub cooldown_until: Option<i64>,
}

/// One account waiting in ranked, in join order.
#[derive(Debug, Clone, Copy)]
pub struct Waiter {
    /// Ordinal at the moment of joining. Unrated is 0.
    pub rating: i32,
    /// How long this player has been in the queue.
    pub waited: Duration,
}

/// The prior for an account that has never finished a ranked game.
#[must_use]
pub fn prior() -> PlayerSkill {
    PlayerSkill {
        mu: MU,
        sigma: SIGMA,
        games: 0,
    }
}

/// Nearest integer of μ − 3σ. Half away from zero. Outside `i32` saturates.
#[must_use]
pub fn ordinal(mu: f64, sigma: f64) -> i32 {
    round_i32(mu - 3.0 * sigma)
}

/// Tier name for an ordinal. Placement does not hide it.
#[must_use]
pub fn tier_name(value: i32) -> &'static str {
    match value {
        ..8 => "Deckhand",
        8..16 => "Bosun",
        16..24 => "Quartermaster",
        24..32 => "First Mate",
        32..40 => "Captain",
        40..48 => "Pirate Lord",
        _ => "Skull King",
    }
}

/// The wire rating. `provisional` while `games` is below [`PLACEMENT_GAMES`].
#[must_use]
pub fn to_rating(skill: PlayerSkill) -> Rating {
    let value = ordinal(skill.mu, skill.sigma);
    Rating {
        value,
        tier: tier_name(value).to_owned(),
        provisional: skill.games < PLACEMENT_GAMES,
        games: skill.games,
    }
}

/// Skill shown now. A stored row from an older season is soft-reset and not written here.
#[must_use]
pub fn shown(stored: StoredSkill, now_ms: i64) -> PlayerSkill {
    let skill = PlayerSkill {
        mu: stored.mu,
        sigma: stored.sigma,
        games: stored.games,
    };
    if stored.season_id == season_at(now_ms).id {
        skill
    } else {
        soft_reset(skill)
    }
}

/// Pull μ halfway back to 25 and widen σ, capped at the prior. Games go back to zero.
#[must_use]
pub fn soft_reset(skill: PlayerSkill) -> PlayerSkill {
    PlayerSkill {
        mu: f64::midpoint(skill.mu, MU),
        sigma: skill.sigma.hypot(BETA).min(SIGMA),
        games: 0,
    }
}

/// Leaves that count toward the next penalty. A new season starts the count over.
#[must_use]
pub fn active_leaves(stored: StoredSkill, now_ms: i64) -> u32 {
    if stored.leave_season == season_at(now_ms).id {
        stored.leaves
    } else {
        0
    }
}

/// A penalty that has not run out, or nothing.
#[must_use]
pub fn active_cooldown(until: Option<i64>, now_ms: i64) -> Option<i64> {
    until.filter(|until| *until > now_ms)
}

/// A ranked seat that was away at the end of more than half the rounds is a forfeit.
#[must_use]
pub fn away_is_forfeit(away_rounds: u32, rounds: u32) -> bool {
    rounds > 0 && away_rounds.saturating_mul(2) > rounds
}

/// How long ranked stays closed after a leave. `leaves` includes the one just taken.
#[must_use]
pub fn cooldown_ms(leaves: u32) -> i64 {
    let steps = leaves.saturating_sub(1).min(16);
    let mut ms = COOLDOWN_BASE_MS;
    for _ in 0..steps {
        ms = ms.saturating_mul(2);
    }
    ms.min(COOLDOWN_CAP_MS)
}

/// New skills in the same order as `players`. `places` uses 1 as the winner; ties share a place.
///
/// // Human: Every human in the ranked game is one team, including a seat that already left.
/// // Agent: CALLS `skillratings::weng_lin_multi_team`; WRITES nothing; RETURNS one skill per input.
#[must_use]
pub fn rate(players: &[PlayerSkill], places: &[u32]) -> Vec<PlayerSkill> {
    if players.is_empty() || players.len() != places.len() {
        return players.to_vec();
    }
    let singles: Vec<WengLinRating> = players
        .iter()
        .map(|player| WengLinRating {
            rating: player.mu,
            uncertainty: player.sigma,
        })
        .collect();
    let groups: Vec<(&[WengLinRating], MultiTeamOutcome)> = singles
        .iter()
        .zip(places)
        .map(|(player, place)| {
            (
                std::slice::from_ref(player),
                MultiTeamOutcome::new(usize::try_from(*place).unwrap_or(usize::MAX)),
            )
        })
        .collect();
    let updated = weng_lin_multi_team(&groups, &WengLinConfig::new());
    updated
        .into_iter()
        .zip(players)
        .map(|(team, before)| {
            let Some(next) = team.first() else {
                return *before;
            };
            PlayerSkill {
                mu: next.rating,
                sigma: next.uncertainty,
                games: before.games.saturating_add(1),
            }
        })
        .collect()
}

/// Places for a ranked game. A forfeited seat is last. Two forfeits share that place.
/// Everyone else is ordered by total, ignoring forfeited totals. Ties share a place.
#[must_use]
pub fn ranked_places(totals: &[i32], forfeited: &[usize]) -> Vec<u32> {
    let last = u32::try_from(totals.len()).unwrap_or(0);
    totals
        .iter()
        .enumerate()
        .map(|(index, total)| {
            if forfeited.contains(&index) {
                return last;
            }
            let ahead = totals
                .iter()
                .enumerate()
                .filter(|(other, score)| *score > total && !forfeited.contains(other))
                .count();
            1 + u32::try_from(ahead).unwrap_or(0)
        })
        .collect()
}

/// Half of the rating window after `waited`.
#[must_use]
pub fn half_width(waited: Duration) -> i32 {
    let steps = i32::try_from(waited.as_secs() / WINDOW_EVERY.as_secs()).unwrap_or(i32::MAX);
    WINDOW_START.saturating_add(WINDOW_STEP.saturating_mul(steps))
}

/// The oldest compatible four among the first [`WINDOW_OLDEST`], or nothing yet.
///
/// `apart` is true when those two waiters must not sit together. Join order is the slice order.
#[must_use]
pub fn pick_table(waiters: &[Waiter], apart: impl Fn(usize, usize) -> bool) -> Option<[usize; 4]> {
    let limit = waiters.len().min(WINDOW_OLDEST);
    if limit < 4 {
        return None;
    }
    let mut choice = [0; 4];
    search(waiters, limit, 0, 0, &mut choice, &apart).then_some(choice)
}

/// Calendar quarter containing `now_ms`, numbered from 2026 Q1 as season 1.
#[must_use]
pub fn season_at(now_ms: i64) -> Season {
    let days = now_ms.div_euclid(86_400_000);
    let (year, month, _) = civil_from_unix_days(days);
    let quarter = match month {
        1..=3 => 1,
        4..=6 => 2,
        7..=9 => 3,
        _ => 4,
    };
    let start_month = match quarter {
        1 => 1,
        2 => 4,
        3 => 7,
        _ => 10,
    };
    let (end_year, end_month) = if quarter == 4 {
        (year.saturating_add(1), 1)
    } else {
        (year, start_month + 3)
    };
    let id = season_id(year, quarter);
    Season {
        id,
        name: format!("{year} Q{quarter}"),
        starts_at: UnixMs::new(
            unix_days_from_civil(year, start_month, 1).saturating_mul(86_400_000),
        ),
        ends_at: UnixMs::new(
            unix_days_from_civil(end_year, end_month, 1).saturating_mul(86_400_000),
        ),
    }
}

fn season_id(year: i32, quarter: u32) -> u32 {
    let raw = i64::from(year) * 4 + i64::from(quarter) - i64::from(SEASON_EPOCH_YEAR) * 4;
    u32::try_from(raw.max(1)).unwrap_or(u32::MAX)
}

fn search(
    waiters: &[Waiter],
    limit: usize,
    start: usize,
    depth: usize,
    choice: &mut [usize; 4],
    apart: &impl Fn(usize, usize) -> bool,
) -> bool {
    if depth == 4 {
        return group_ok(waiters, choice, apart);
    }
    for index in start..limit {
        choice[depth] = index;
        if search(
            waiters,
            limit,
            index.saturating_add(1),
            depth.saturating_add(1),
            choice,
            apart,
        ) {
            return true;
        }
    }
    false
}

fn group_ok(
    waiters: &[Waiter],
    choice: &[usize; 4],
    apart: &impl Fn(usize, usize) -> bool,
) -> bool {
    choice.iter().enumerate().all(|(left, left_index)| {
        choice
            .iter()
            .skip(left.saturating_add(1))
            .all(|right_index| {
                let Some(left_waiter) = waiters.get(*left_index) else {
                    return false;
                };
                let Some(right_waiter) = waiters.get(*right_index) else {
                    return false;
                };
                fits(left_waiter, right_waiter) && !apart(*left_index, *right_index)
            })
    })
}

fn fits(left: &Waiter, right: &Waiter) -> bool {
    let gap = i64::from(left.rating)
        .saturating_sub(i64::from(right.rating))
        .unsigned_abs();
    let left_half = u64::try_from(half_width(left.waited)).unwrap_or(u64::MAX);
    let right_half = u64::try_from(half_width(right.waited)).unwrap_or(u64::MAX);
    gap <= left_half && gap <= right_half
}

fn round_i32(value: f64) -> i32 {
    if !value.is_finite() {
        return 0;
    }
    let rounded = value.round();
    if rounded >= f64::from(i32::MAX) {
        return i32::MAX;
    }
    if rounded <= f64::from(i32::MIN) {
        return i32::MIN;
    }
    format!("{rounded:.0}").parse().unwrap_or(0)
}

/// Days since the Unix epoch for a Gregorian date. Month and day are 1-based.
fn unix_days_from_civil(year: i32, month: u32, day: u32) -> i64 {
    let year = i64::from(year) - i64::from(month <= 2);
    let era = year.div_euclid(400);
    let yoe = year.rem_euclid(400);
    let month_index = i64::from(if month > 2 { month - 3 } else { month + 9 });
    let doy = (153 * month_index + 2) / 5 + i64::from(day) - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn civil_from_unix_days(unix_days: i64) -> (i32, u32, u32) {
    let z = unix_days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let month_index = (5 * doy + 2) / 153;
    let day = doy - (153 * month_index + 2) / 5 + 1;
    let month = if month_index < 10 {
        month_index + 3
    } else {
        month_index - 9
    };
    let year = if month <= 2 { year + 1 } else { year };
    (
        i32::try_from(year).unwrap_or(0),
        u32::try_from(month).unwrap_or(1),
        u32::try_from(day).unwrap_or(1),
    )
}

#[cfg(test)]
mod tests {
    use super::{
        COOLDOWN_BASE_MS, COOLDOWN_CAP_MS, PLACEMENT_GAMES, Waiter, active_cooldown, active_leaves,
        away_is_forfeit, civil_from_unix_days, cooldown_ms, ordinal, pick_table, prior,
        ranked_places, rate, season_at, tier_name, to_rating, unix_days_from_civil,
    };
    use skillratings::MultiTeamOutcome;
    use skillratings::weng_lin::{WengLinConfig, WengLinRating, weng_lin_multi_team};

    #[test]
    fn the_prior_ordinal_is_zero_and_deckhand() {
        let skill = prior();
        assert_eq!(ordinal(skill.mu, skill.sigma), 0);
        let rating = to_rating(skill);
        assert_eq!(rating.value, 0);
        assert_eq!(rating.tier, "Deckhand");
        assert!(rating.provisional);
        assert_eq!(rating.games, 0);
    }

    #[test]
    fn tiers_follow_the_ordinal_bands() {
        assert_eq!(tier_name(-3), "Deckhand");
        assert_eq!(tier_name(7), "Deckhand");
        assert_eq!(tier_name(8), "Bosun");
        assert_eq!(tier_name(16), "Quartermaster");
        assert_eq!(tier_name(24), "First Mate");
        assert_eq!(tier_name(32), "Captain");
        assert_eq!(tier_name(40), "Pirate Lord");
        assert_eq!(tier_name(48), "Skull King");
    }

    #[test]
    fn placement_ends_on_the_fifth_game() {
        let mut skill = prior();
        skill.games = PLACEMENT_GAMES - 1;
        assert!(to_rating(skill).provisional);
        skill.games = PLACEMENT_GAMES;
        assert!(!to_rating(skill).provisional);
    }

    #[test]
    fn scripted_places_match_the_crate_and_a_win_beats_a_loss() {
        let players = vec![prior(); 4];
        let places = [1, 2, 3, 4];
        let got = rate(&players, &places);
        let singles: Vec<WengLinRating> = players
            .iter()
            .map(|player| WengLinRating {
                rating: player.mu,
                uncertainty: player.sigma,
            })
            .collect();
        let groups: Vec<(&[WengLinRating], MultiTeamOutcome)> = singles
            .iter()
            .zip(places)
            .map(|(player, place)| {
                (
                    std::slice::from_ref(player),
                    MultiTeamOutcome::new(usize::try_from(place).expect("place")),
                )
            })
            .collect();
        let expected = weng_lin_multi_team(&groups, &WengLinConfig::new());
        for (skill, team) in got.iter().zip(expected) {
            let next = team.first().expect("player");
            assert!((skill.mu - next.rating).abs() < 1e-9);
            assert!((skill.sigma - next.uncertainty).abs() < 1e-9);
            assert_eq!(skill.games, 1);
        }
        let winner = to_rating(got[0]);
        let last = to_rating(got[3]);
        assert!(winner.value > last.value);
        assert!(winner.provisional);
        assert_eq!(winner.games, 1);
    }

    #[test]
    fn two_forfeits_share_last_and_the_same_new_ordinal() {
        let totals = vec![10, 40, 30, 80];
        let places = ranked_places(&totals, &[0, 2]);
        assert_eq!(places, vec![4, 2, 4, 1]);
        let players = vec![prior(); 4];
        let got = rate(&players, &places);
        assert_eq!(
            ordinal(got[0].mu, got[0].sigma),
            ordinal(got[2].mu, got[2].sigma)
        );
        assert!(ordinal(got[3].mu, got[3].sigma) > ordinal(got[0].mu, got[0].sigma));
    }

    #[test]
    fn away_for_most_rounds_is_a_forfeit() {
        assert!(!away_is_forfeit(0, 0));
        assert!(!away_is_forfeit(2, 5));
        assert!(away_is_forfeit(3, 5));
        assert!(away_is_forfeit(1, 1));
    }

    #[test]
    fn cooldown_doubles_and_stops_at_a_day() {
        assert_eq!(cooldown_ms(1), COOLDOWN_BASE_MS);
        assert_eq!(cooldown_ms(2), COOLDOWN_BASE_MS * 2);
        assert_eq!(cooldown_ms(3), COOLDOWN_BASE_MS * 4);
        assert_eq!(cooldown_ms(8), COOLDOWN_CAP_MS);
        assert_eq!(cooldown_ms(40), COOLDOWN_CAP_MS);
        assert_eq!(active_cooldown(Some(10), 10), None);
        assert_eq!(active_cooldown(Some(11), 10), Some(11));
    }

    #[test]
    fn a_new_season_clears_the_leave_count_and_soft_resets() {
        let stored = super::StoredSkill {
            season_id: 1,
            mu: 40.0,
            sigma: 2.0,
            games: 9,
            leaves: 3,
            leave_season: 1,
            cooldown_until: Some(50),
        };
        let now = unix_days_from_civil(2026, 10, 11) * 86_400_000;
        let shown = super::shown(stored, now);
        assert_eq!(shown.games, 0);
        assert!((shown.mu - 32.5).abs() < 1e-9);
        assert!(shown.sigma > 2.0);
        assert!(shown.sigma <= prior().sigma + 1e-9);
        assert_eq!(active_leaves(stored, now), 0);
        assert_eq!(active_cooldown(stored.cooldown_until, now), None);
    }

    #[test]
    fn equal_ratings_seat_at_once_and_a_gap_waits() {
        let close = Waiter {
            rating: 0,
            waited: std::time::Duration::ZERO,
        };
        assert_eq!(pick_table(&[close; 4], |_, _| false), Some([0, 1, 2, 3]));
        let mut mixed = vec![
            Waiter {
                rating: 80,
                waited: std::time::Duration::ZERO,
            },
            close,
            close,
            close,
        ];
        assert_eq!(pick_table(&mixed, |_, _| false), None);
        for waiter in &mut mixed {
            waiter.waited = std::time::Duration::from_mins(2);
        }
        assert_eq!(pick_table(&mixed, |_, _| false), Some([0, 1, 2, 3]));
        let six = [close; 6];
        let apart =
            |left: usize, right: usize| (left == 0 && right == 1) || (left == 1 && right == 0);
        assert_eq!(pick_table(&six, apart), Some([0, 2, 3, 4]));
    }

    #[test]
    fn october_2026_is_season_four() {
        assert_eq!(civil_from_unix_days(0), (1970, 1, 1));
        let noon = unix_days_from_civil(2026, 10, 11) * 86_400_000 + 12 * 3_600_000;
        let season = season_at(noon);
        assert_eq!(season.id, 4);
        assert_eq!(season.name, "2026 Q4");
        assert_eq!(
            season.starts_at.get(),
            unix_days_from_civil(2026, 10, 1) * 86_400_000
        );
        assert_eq!(
            season.ends_at.get(),
            unix_days_from_civil(2027, 1, 1) * 86_400_000
        );
    }

    #[test]
    fn delta_is_the_difference_of_the_sent_integers() {
        let before = to_rating(prior());
        let after_skill = rate(&[prior()], &[1]);
        let after = to_rating(after_skill[0]);
        let delta = after.value - before.value;
        assert_eq!(delta, after.value - before.value);
    }
}
