//! Bot-versus-bot pass. Four blocks, a live dashboard, and a report of faults and balance.

use std::collections::VecDeque;
use std::io::{self, IsTerminal};
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Mutex, PoisonError};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

use thiserror::Error;

use crate::play::play_one;
use crate::report::{TABLE, render, render_fault, render_replay};
use crate::stats::{Fault, GameSummary, Pass, SuiteKind, game_seed};
use crate::tui::Screen;

mod play;
mod report;
mod stats;
mod tui;

const DEFAULT_GAMES: u32 = 1_000;
const DEFAULT_SEED: u64 = 0x5EED_5A11;

#[derive(Debug, Error)]
enum RunError {
    #[error("could not set the Ctrl-C handler: {0}")]
    Signal(#[source] ctrlc::Error),
    #[error("could not control the terminal: {0}")]
    Terminal(#[source] io::Error),
}

#[derive(Debug)]
enum Cli {
    Help,
    Run(Options),
}

#[derive(Debug)]
struct Options {
    games: u32,
    seed: u64,
    plain: bool,
    report: ReportTo,
    replay: Option<(SuiteKind, u32)>,
}

#[derive(Debug)]
enum ReportTo {
    Default,
    File(PathBuf),
}

#[derive(Clone, Copy)]
struct Job {
    kind: SuiteKind,
    index: u32,
    seed: u64,
}

fn main() -> ExitCode {
    match parse(std::env::args().skip(1)) {
        Ok(Cli::Help) => {
            println!("{}", usage());
            ExitCode::SUCCESS
        }
        Ok(Cli::Run(options)) => match execute(&options) {
            Ok(0) => ExitCode::SUCCESS,
            Ok(_) => ExitCode::from(1),
            Err(error) => {
                eprintln!("{error}");
                ExitCode::from(2)
            }
        },
        Err(error) => {
            eprintln!("{error}");
            eprintln!();
            eprintln!("{}", usage());
            ExitCode::from(2)
        }
    }
}

fn execute(options: &Options) -> Result<u8, RunError> {
    if let Some((kind, index)) = options.replay {
        return Ok(replay(options.seed, kind, index));
    }
    let pass = run_pass(options)?;
    let text = render(&pass);
    println!("{text}");
    match write_report(options, &text) {
        Ok(path) => println!("\nWrote {path}"),
        Err(error) => println!("\nCould not write the report file: {error}"),
    }
    Ok(exit_code(&pass))
}

fn exit_code(pass: &Pass) -> u8 {
    u8::from(pass.fault_count > 0 || pass.stopped)
}

fn replay(base: u64, kind: SuiteKind, index: u32) -> u8 {
    let seed = game_seed(base, kind, index);
    match play_one(kind, index, seed) {
        Ok(game) => {
            println!("{}", render_replay(&game, base));
            0
        }
        Err(fault) => {
            println!("{}", render_fault(&fault, base));
            1
        }
    }
}

fn run_pass(options: &Options) -> Result<Pass, RunError> {
    let jobs_total = options.games.saturating_mul(4);
    let workers = worker_count(jobs_total);
    let mut pass = Pass::new(options.games, options.seed, workers);
    let cancel = std::sync::Arc::new(AtomicBool::new(false));
    let flag = std::sync::Arc::clone(&cancel);
    ctrlc::set_handler(move || flag.store(true, Ordering::Relaxed)).map_err(RunError::Signal)?;
    let queue = Mutex::new(job_queue(options.seed, options.games));
    let (tx, rx) = mpsc::channel();
    let plain = options.plain || !io::stdout().is_terminal();
    if plain {
        println!("Skull King bot pass");
        println!("{TABLE}");
        println!(
            "seed {:x}  ·  {workers} workers  ·  {} games in each block",
            options.seed, options.games
        );
        collect(&mut pass, &cancel, &queue, tx, &rx, workers, None);
    } else {
        match Screen::enter() {
            Ok(mut screen) => {
                collect(
                    &mut pass,
                    &cancel,
                    &queue,
                    tx,
                    &rx,
                    workers,
                    Some(&mut screen),
                );
                screen.leave().map_err(RunError::Terminal)?;
            }
            Err(_) => collect(&mut pass, &cancel, &queue, tx, &rx, workers, None),
        }
    }
    pass.mark_done();
    Ok(pass)
}

fn collect(
    pass: &mut Pass,
    cancel: &AtomicBool,
    queue: &Mutex<VecDeque<Job>>,
    tx: Sender<Result<GameSummary, Fault>>,
    rx: &Receiver<Result<GameSummary, Fault>>,
    workers: usize,
    screen: Option<&mut Screen>,
) {
    let plain = screen.is_none();
    thread::scope(|scope| {
        for _ in 0..workers {
            let tx = tx.clone();
            scope.spawn(move || worker(tx, queue, cancel));
        }
        drop(tx);
        receive(pass, rx, screen, plain);
    });
}

fn receive(
    pass: &mut Pass,
    rx: &Receiver<Result<GameSummary, Fault>>,
    mut screen: Option<&mut Screen>,
    plain: bool,
) {
    let mut last_draw = pass.started;
    loop {
        let outcome = rx.recv_timeout(std::time::Duration::from_millis(50));
        let mut changed = false;
        match outcome {
            Ok(result) => {
                apply(pass, result, plain);
                changed = true;
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
        let due = changed || last_draw.elapsed() >= std::time::Duration::from_millis(50);
        if let Some(view) = screen.as_mut()
            && due
            && view.draw(pass).is_ok()
        {
            last_draw = std::time::Instant::now();
        }
    }
    if let Some(view) = screen.as_mut()
        && view.draw(pass).is_ok()
    {}
}

fn apply(pass: &mut Pass, outcome: Result<GameSummary, Fault>, plain: bool) {
    match outcome {
        Ok(game) => {
            pass.record_game(&game);
            if plain && (pass.attempted() == 1 || pass.attempted().is_multiple_of(100)) {
                print_progress(pass);
            }
        }
        Err(fault) => {
            if plain {
                println!(
                    "fault: {} game {} seed {:x} {}: {}",
                    fault.kind.name(),
                    fault.index,
                    fault.seed,
                    fault.phase,
                    fault.detail
                );
            }
            pass.record_fault(fault);
        }
    }
}

fn print_progress(pass: &Pass) {
    let mut parts = Vec::new();
    for suite in &pass.suites {
        parts.push(format!(
            "{} {}/{}",
            suite.kind.name(),
            suite.attempted(),
            suite.planned
        ));
    }
    let elapsed = pass.started.elapsed();
    println!(
        "{}  {}  eta {}",
        parts.join("  "),
        crate::report::rate_text(pass.attempted(), elapsed),
        crate::report::eta_text(pass.attempted(), pass.planned(), elapsed)
    );
}

fn worker(
    tx: Sender<Result<GameSummary, Fault>>,
    queue: &Mutex<VecDeque<Job>>,
    cancel: &AtomicBool,
) {
    loop {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        let Some(job) = pop_job(queue) else {
            break;
        };
        let outcome = catch_unwind(AssertUnwindSafe(|| play_one(job.kind, job.index, job.seed)));
        let message = match outcome {
            Ok(result) => result,
            Err(_) => Err(panicked(job)),
        };
        if tx.send(message).is_err() {
            break;
        }
    }
    drop(tx);
}

fn panicked(job: Job) -> Fault {
    Fault {
        kind: job.kind,
        index: job.index,
        seed: job.seed,
        steps: 0,
        phase: "worker",
        detail: "the game panicked".to_string(),
    }
}

fn pop_job(queue: &Mutex<VecDeque<Job>>) -> Option<Job> {
    queue
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .pop_front()
}

fn job_queue(seed: u64, games: u32) -> VecDeque<Job> {
    let mut queue = VecDeque::new();
    for kind in SuiteKind::all() {
        for index in 0..games {
            queue.push_back(Job {
                kind,
                index,
                seed: game_seed(seed, kind, index),
            });
        }
    }
    queue
}

fn worker_count(jobs: u32) -> usize {
    let cores = thread::available_parallelism().map_or(1, std::num::NonZero::get);
    let job_count = usize::try_from(jobs).unwrap_or(cores);
    cores.min(job_count).max(1)
}

fn write_report(options: &Options, text: &str) -> io::Result<String> {
    match &options.report {
        ReportTo::File(path) => {
            if let Some(parent) = path.parent()
                && !parent.as_os_str().is_empty()
            {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(path, text)?;
            Ok(path.display().to_string())
        }
        ReportTo::Default => write_default(options.seed, text),
    }
}

fn write_default(seed: u64, text: &str) -> io::Result<String> {
    let dir = PathBuf::from("target/bot-pass");
    std::fs::create_dir_all(&dir)?;
    let latest = dir.join("latest.txt");
    std::fs::write(&latest, text)?;
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_secs());
    let stamped = dir.join(format!("{secs}-{seed:x}.txt"));
    std::fs::write(&stamped, text)?;
    Ok(format!("{} and {}", latest.display(), stamped.display()))
}

fn parse(args: impl Iterator<Item = String>) -> Result<Cli, String> {
    let mut games = DEFAULT_GAMES;
    let mut seed = DEFAULT_SEED;
    let mut plain = false;
    let mut report = ReportTo::Default;
    let mut replay = None;
    let mut args = args;
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--help" | "-h" => return Ok(Cli::Help),
            "--plain" => plain = true,
            "--games" => games = parse_games(&next_value(&mut args, "--games")?)?,
            "--seed" => seed = parse_seed(&next_value(&mut args, "--seed")?)?,
            "--report" => {
                report = ReportTo::File(PathBuf::from(next_value(&mut args, "--report")?));
            }
            "--replay" => {
                let kind =
                    SuiteKind::parse(&next_value(&mut args, "--replay")?).ok_or_else(|| {
                        "replay suite must be easy, normal, hard, or mixed".to_string()
                    })?;
                let index = parse_index(&next_value(&mut args, "--replay")?)?;
                replay = Some((kind, index));
            }
            other => return Err(format!("unknown argument {other}")),
        }
    }
    Ok(Cli::Run(Options {
        games,
        seed,
        plain,
        report,
        replay,
    }))
}

fn next_value(args: &mut impl Iterator<Item = String>, flag: &str) -> Result<String, String> {
    args.next().ok_or_else(|| format!("{flag} needs a value"))
}

fn parse_games(text: &str) -> Result<u32, String> {
    let games = text
        .parse::<u32>()
        .map_err(|_| format!("--games {text} is not a number"))?;
    if games == 0 {
        return Err("--games must be at least 1".to_string());
    }
    Ok(games)
}

fn parse_index(text: &str) -> Result<u32, String> {
    text.parse::<u32>()
        .map_err(|_| format!("replay index {text} is not a number"))
}

fn parse_seed(text: &str) -> Result<u64, String> {
    if let Some(body) = text.strip_prefix("0x").or_else(|| text.strip_prefix("0X")) {
        return u64::from_str_radix(body, 16).map_err(|_| format!("--seed {text} is not hex"));
    }
    if text.chars().any(|ch| matches!(ch, 'a'..='f' | 'A'..='F')) {
        return u64::from_str_radix(text, 16).map_err(|_| format!("--seed {text} is not hex"));
    }
    text.parse::<u64>()
        .map_err(|_| format!("--seed {text} is not a number"))
}

fn usage() -> String {
    format!(
        "\
bot-pass runs four blocks of bot-versus-bot games and writes what happened.

  scripts/bot-pass.sh
  scripts/bot-pass.sh --games 20 --plain
  scripts/bot-pass.sh --replay mixed 12 --seed {DEFAULT_SEED:x}

  --games N       games in each block (default {DEFAULT_GAMES})
  --seed HEX      base seed (default {DEFAULT_SEED:x}); the same seed replays the same games
  --plain         print a log instead of the dashboard (also used when stdout is not a terminal)
  --report PATH   write the report to PATH instead of target/bot-pass/
  --replay SUITE INDEX
                  play one game from this seed. SUITE is easy, normal, hard, or mixed.

Each block is 4 seats. Easy, Normal, and Hard are four bots of that level.
Mixed is one of each level plus a fourth seat that cycles, and the seats rotate.
The table is classic scoring, rounds of 1 to 10, with loot, Kraken, White Whale,
and pirate abilities. Exit 0 when every game finishes. Exit 1 when a game faults
or the pass is stopped."
    )
}

#[cfg(test)]
mod tests {
    use super::{Cli, DEFAULT_GAMES, DEFAULT_SEED, parse};

    #[test]
    fn the_default_is_four_blocks_of_a_thousand() {
        let Ok(Cli::Run(options)) = parse(std::iter::empty()) else {
            panic!("the default invocation should run");
        };
        assert_eq!(options.games, DEFAULT_GAMES);
        assert_eq!(options.seed, DEFAULT_SEED);
        assert!(options.replay.is_none());
    }

    #[test]
    fn zero_games_is_rejected() {
        let args = ["--games".to_string(), "0".to_string()];
        assert!(parse(args.into_iter()).is_err());
    }

    #[test]
    fn a_hex_seed_and_a_replay_parse() {
        let args = [
            "--seed".to_string(),
            "0x10".to_string(),
            "--replay".to_string(),
            "Hard".to_string(),
            "3".to_string(),
        ];
        let Ok(Cli::Run(options)) = parse(args.into_iter()) else {
            panic!("replay should parse");
        };
        assert_eq!(options.seed, 16);
        assert!(matches!(options.replay, Some((super::SuiteKind::Hard, 3))));
    }
}
