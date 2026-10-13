//! The live dashboard. It is an alternate screen, so a normal terminal scrollback
//! is restored before the written report is printed.

use std::io::{self, Write};
use std::iter::repeat_n;

use crossterm::cursor::{Hide, MoveTo, Show};
use crossterm::style::{Attribute, Color, Print, ResetColor, SetAttribute, SetForegroundColor};
use crossterm::terminal::{Clear, ClearType, EnterAlternateScreen, LeaveAlternateScreen};
use crossterm::{execute, queue, terminal};
use skt_engine::BotLevel;

use crate::report::{TABLE, eta_text, rate_text};
use crate::stats::{Pass, SuiteKind, SuiteStats, level_index, level_name, mean_text, percent_text};

pub(crate) struct Screen {
    active: bool,
}

impl Screen {
    pub(crate) fn enter() -> io::Result<Self> {
        execute!(io::stdout(), EnterAlternateScreen, Hide)?;
        Ok(Self { active: true })
    }

    pub(crate) fn leave(&mut self) -> io::Result<()> {
        if !self.active {
            return Ok(());
        }
        self.active = false;
        execute!(io::stdout(), Show, LeaveAlternateScreen)
    }

    pub(crate) fn draw(&self, pass: &Pass) -> io::Result<()> {
        if !self.active {
            return Ok(());
        }
        let mut out = io::stdout();
        queue!(out, MoveTo(0, 0), Clear(ClearType::All))?;
        paint(&mut out, pass)?;
        out.flush()
    }
}

impl Drop for Screen {
    fn drop(&mut self) {
        if let Ok(()) = self.leave() {}
    }
}

fn paint(out: &mut impl Write, pass: &Pass) -> io::Result<()> {
    let columns = columns();
    write_line(out, columns, Color::Cyan, true, "Skull King bot pass")?;
    write_line(out, columns, Color::White, false, TABLE)?;
    write_line(
        out,
        columns,
        Color::DarkGrey,
        false,
        &format!(
            "seed {:x}  ·  {} workers  ·  Ctrl-C stops and still writes the report",
            pass.base_seed, pass.workers
        ),
    )?;
    write_line(out, columns, Color::White, false, "")?;
    for kind in SuiteKind::all() {
        if let Some(suite) = pass.suites.get(crate::stats::suite_index(kind)) {
            write_suite(out, columns, suite)?;
        }
    }
    write_line(out, columns, Color::White, false, "")?;
    let elapsed = pass.started.elapsed();
    let pace = format!(
        "{}   eta {}",
        rate_text(pass.attempted(), elapsed),
        eta_text(pass.attempted(), pass.planned(), elapsed)
    );
    write_line(out, columns, Color::White, false, &pace)?;
    let (color, fault) = match pass.faults.last() {
        Some(fault) => (
            Color::Red,
            format!(
                "Last fault: {} game {} seed {:x} {} after {} steps: {}",
                fault.kind.name(),
                fault.index,
                fault.seed,
                fault.phase,
                fault.steps,
                fault.detail
            ),
        ),
        None => (Color::DarkGrey, "Last fault: none".to_string()),
    };
    write_line(out, columns, color, false, &fault)?;
    Ok(())
}

fn write_suite(out: &mut impl Write, columns: usize, suite: &SuiteStats) -> io::Result<()> {
    let color = if suite.faults > 0 {
        Color::Red
    } else if suite.attempted() >= suite.planned && suite.planned > 0 {
        Color::Green
    } else {
        Color::White
    };
    let text = format!(
        "{:<6} {}  {:>4}/{}  faults {:<3}  {}",
        suite.kind.name(),
        bar(suite.attempted(), suite.planned),
        suite.attempted(),
        suite.planned,
        suite.faults,
        tail(suite)
    );
    write_line(out, columns, color, false, &text)
}

fn tail(suite: &SuiteStats) -> String {
    if suite.finished == 0 {
        return "hit n/a  mean n/a".to_string();
    }
    if suite.kind == SuiteKind::Mixed {
        return mixed_tail(suite);
    }
    let mut bids = 0u64;
    let mut hits = 0u64;
    let mut score = 0i64;
    let mut games = 0u32;
    for seat in &suite.seats {
        bids = bids.saturating_add(seat.bids);
        hits = hits.saturating_add(seat.hits);
        score = score.saturating_add(seat.score_sum);
        games = games.saturating_add(seat.games);
    }
    format!(
        "hit {}  mean {}",
        percent_text(hits, bids),
        mean_text(score, games)
    )
}

fn mixed_tail(suite: &SuiteStats) -> String {
    let mut parts = Vec::new();
    for level in [BotLevel::Easy, BotLevel::Normal, BotLevel::Hard] {
        if let Some(tally) = suite.levels.get(level_index(level)) {
            let letter = level_name(level).chars().next().unwrap_or('?');
            parts.push(format!(
                "{letter} {}",
                mean_text(tally.score_sum, tally.games)
            ));
        }
    }
    parts.join("  ")
}

fn bar(done: u32, total: u32) -> String {
    let width = 16usize;
    let filled = if total == 0 {
        0
    } else {
        let product = u64::from(done.min(total)) * u64::try_from(width).unwrap_or(0);
        usize::try_from(product / u64::from(total)).unwrap_or(width)
    };
    let filled = filled.min(width);
    let mut text = String::from("[");
    text.extend(repeat_n('=', filled));
    text.extend(repeat_n('.', width - filled));
    text.push(']');
    text
}

fn write_line(
    out: &mut impl Write,
    columns: usize,
    color: Color,
    bold: bool,
    text: &str,
) -> io::Result<()> {
    let shown: String = text.chars().take(columns.saturating_sub(1)).collect();
    if bold {
        queue!(out, SetAttribute(Attribute::Bold))?;
    }
    queue!(
        out,
        SetForegroundColor(color),
        Print(shown),
        ResetColor,
        SetAttribute(Attribute::Reset),
        Print("\n"),
    )
}

fn columns() -> usize {
    let width = terminal::size().map_or(80, |(width, _)| width);
    usize::from(width.clamp(60, 120))
}
