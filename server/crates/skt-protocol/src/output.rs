//! Write the generated TypeScript and the protocol samples.

use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde::de::DeserializeOwned;
use thiserror::Error;
use ts_rs::TS;

use crate::client::ClientMessage;
use crate::error_code::{ErrorBody, ErrorCode, ErrorObject};
use crate::lobby::{
    Lobby, LobbyList, LobbyPhase, LobbySummary, Member, QueueMode, QueueStatus, TableKind,
    TableMode, Visibility,
};
use crate::pushes::{
    CloseReason, ErrMessage, GameEmotePush, GameOver, LobbyClosed, LobbyStatePush, OkReply,
    QueueStatusPush, SeatLost, SeatLostReason, Superseded, Welcome, WelcomeGame,
};
use crate::rest::{
    ActionLog, ActionLogEntry, Active, Credentials, FinishedGame, FinishedSeat, GamePage, Health,
    LadderEntry, LadderPage, Me, Metrics, ModeLine, Profile, ProfilePatch, Rating, Season,
    ServerConfig, Stats, StatsByMode, TableColor, Timers, User,
};
use crate::samples;
use crate::settings::{GameSettings, Pace};
use crate::table::{
    Deadline, DeadlineKind, GameEvent, GameResult, GameStart, GameUpdate, OnlineEvent,
    RatingChange, SeatInfo, SeatStatus, TableInfo,
};
use skt_engine::{AbilityChoice, Card, EngineView};

/// A failure while writing or checking the generated contract.
#[derive(Debug, Error)]
pub enum ExportError {
    /// A directory was not created or a file was not read or written.
    #[error("{path}: {source}")]
    Io {
        /// The file or directory.
        path: PathBuf,
        /// The filesystem error.
        #[source]
        source: std::io::Error,
    },
    /// Refused to clear a directory that is not a generated contract directory.
    #[error("refusing to clear {path}")]
    Refused {
        /// The directory that was not cleared.
        path: PathBuf,
    },
    /// TypeScript export failed.
    #[error("typescript: {0}")]
    Typescript(#[from] ts_rs::ExportError),
    /// JSON serialising or parsing failed.
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    /// A sample file does not match the value this crate writes.
    #[error("{path} does not match\n--- expected\n{expected}\n--- actual\n{actual}")]
    Mismatch {
        /// The sample file.
        path: PathBuf,
        /// The text this crate would write.
        expected: Box<str>,
        /// The text on disk.
        actual: Box<str>,
    },
    /// The sample parsed, but not back to the same value.
    #[error("{path} did not round-trip")]
    RoundTrip {
        /// The sample file.
        path: PathBuf,
    },
}

impl ExportError {
    fn io(path: &Path, source: std::io::Error) -> Self {
        Self::Io {
            path: path.to_path_buf(),
            source,
        }
    }
}

/// `web/src/protocol/generated`, relative to this crate.
#[must_use]
pub fn typescript_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../web/src/protocol/generated")
}

/// `fixtures/protocol`, relative to this crate.
#[must_use]
pub fn fixture_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../fixtures/protocol")
}

/// Write TypeScript and the protocol samples into the repo.
///
/// # Errors
///
/// Returns an error when a directory cannot be prepared, a file cannot be written,
/// or TypeScript export fails.
pub fn export() -> Result<(), ExportError> {
    export_typescript(&typescript_dir())?;
    write_fixtures(&fixture_dir())?;
    Ok(())
}

/// Write one TypeScript file per exported type, plus `index.ts`.
///
/// # Errors
///
/// Returns an error when the directory cannot be prepared or a binding cannot be written.
pub fn export_typescript(dir: &Path) -> Result<(), ExportError> {
    prepare(dir)?;
    let cfg = ts_rs::Config::new()
        .with_out_dir(dir)
        .with_large_int("number");
    export_roots(&cfg)?;
    write_index(dir)?;
    Ok(())
}

/// Write one pretty JSON file per message and DTO.
///
/// # Errors
///
/// Returns an error when the directory cannot be prepared or a file cannot be written.
pub fn write_fixtures(dir: &Path) -> Result<(), ExportError> {
    prepare(dir)?;
    samples::apply(dir, true)?;
    Ok(())
}

/// Check that every sample on disk matches the value this crate writes and parses back.
///
/// # Errors
///
/// Returns an error when a file is missing, differs, or does not deserialise to the same value.
pub fn check_fixtures(dir: &Path) -> Result<(), ExportError> {
    samples::apply(dir, false)
}

fn prepare(dir: &Path) -> Result<(), ExportError> {
    let name = dir.file_name().and_then(|value| value.to_str());
    let allowed = matches!(name, Some("generated" | "protocol"))
        || name.is_some_and(|value| value.starts_with("skt-protocol-"));
    if !allowed {
        return Err(ExportError::Refused {
            path: dir.to_path_buf(),
        });
    }
    fs::create_dir_all(dir).map_err(|source| ExportError::io(dir, source))?;
    for entry in fs::read_dir(dir).map_err(|source| ExportError::io(dir, source))? {
        let entry = entry.map_err(|source| ExportError::io(dir, source))?;
        let path = entry.path();
        if path
            .extension()
            .is_some_and(|ext| ext == "ts" || ext == "json")
        {
            fs::remove_file(&path).map_err(|source| ExportError::io(&path, source))?;
        }
    }
    Ok(())
}

fn export_roots(cfg: &ts_rs::Config) -> Result<(), ExportError> {
    export_rest(cfg)?;
    export_lobby(cfg)?;
    export_table(cfg)?;
    export_messages(cfg)?;
    Ok(())
}

fn export_rest(cfg: &ts_rs::Config) -> Result<(), ExportError> {
    ErrorCode::export_all(cfg)?;
    ErrorBody::export_all(cfg)?;
    ErrorObject::export_all(cfg)?;
    Health::export_all(cfg)?;
    Metrics::export_all(cfg)?;
    ActionLogEntry::export_all(cfg)?;
    ActionLog::export_all(cfg)?;
    TableColor::export_all(cfg)?;
    Timers::export_all(cfg)?;
    ServerConfig::export_all(cfg)?;
    Active::export_all(cfg)?;
    User::export_all(cfg)?;
    ModeLine::export_all(cfg)?;
    StatsByMode::export_all(cfg)?;
    Stats::export_all(cfg)?;
    FinishedSeat::export_all(cfg)?;
    FinishedGame::export_all(cfg)?;
    GamePage::export_all(cfg)?;
    Rating::export_all(cfg)?;
    Season::export_all(cfg)?;
    Me::export_all(cfg)?;
    Profile::export_all(cfg)?;
    LadderEntry::export_all(cfg)?;
    LadderPage::export_all(cfg)?;
    Credentials::export_all(cfg)?;
    ProfilePatch::export_all(cfg)?;
    Ok(())
}

fn export_lobby(cfg: &ts_rs::Config) -> Result<(), ExportError> {
    Pace::export_all(cfg)?;
    GameSettings::export_all(cfg)?;
    TableKind::export_all(cfg)?;
    TableMode::export_all(cfg)?;
    QueueMode::export_all(cfg)?;
    Visibility::export_all(cfg)?;
    LobbyPhase::export_all(cfg)?;
    Member::export_all(cfg)?;
    Lobby::export_all(cfg)?;
    LobbySummary::export_all(cfg)?;
    LobbyList::export_all(cfg)?;
    QueueStatus::export_all(cfg)?;
    Ok(())
}

fn export_table(cfg: &ts_rs::Config) -> Result<(), ExportError> {
    DeadlineKind::export_all(cfg)?;
    Deadline::export_all(cfg)?;
    SeatStatus::export_all(cfg)?;
    OnlineEvent::export_all(cfg)?;
    GameEvent::export_all(cfg)?;
    SeatInfo::export_all(cfg)?;
    GameStart::export_all(cfg)?;
    GameUpdate::export_all(cfg)?;
    TableInfo::export_all(cfg)?;
    RatingChange::export_all(cfg)?;
    GameResult::export_all(cfg)?;
    EngineView::export_all(cfg)?;
    Card::export_all(cfg)?;
    AbilityChoice::export_all(cfg)?;
    Ok(())
}

fn export_messages(cfg: &ts_rs::Config) -> Result<(), ExportError> {
    ClientMessage::export_all(cfg)?;
    OkReply::export_all(cfg)?;
    ErrMessage::export_all(cfg)?;
    Welcome::export_all(cfg)?;
    WelcomeGame::export_all(cfg)?;
    Superseded::export_all(cfg)?;
    LobbyStatePush::export_all(cfg)?;
    CloseReason::export_all(cfg)?;
    LobbyClosed::export_all(cfg)?;
    QueueStatusPush::export_all(cfg)?;
    GameEmotePush::export_all(cfg)?;
    GameOver::export_all(cfg)?;
    SeatLost::export_all(cfg)?;
    SeatLostReason::export_all(cfg)?;
    Ok(())
}

fn write_index(dir: &Path) -> Result<(), ExportError> {
    let mut names = Vec::new();
    for entry in fs::read_dir(dir).map_err(|source| ExportError::io(dir, source))? {
        let entry = entry.map_err(|source| ExportError::io(dir, source))?;
        let Some(text) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        let path = Path::new(&text);
        if path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("ts"))
            && text != "index.ts"
            && let Some(stem) = path.file_stem().and_then(|stem| stem.to_str())
        {
            names.push(stem.to_owned());
        }
    }
    names.sort();
    let mut body = String::from("// Generated by export-protocol. Do not edit.\n");
    for name in names {
        let _ = writeln!(body, "export type {{ {name} }} from \"./{name}\";");
    }
    let path = dir.join("index.ts");
    fs::write(&path, body).map_err(|source| ExportError::io(&path, source))?;
    Ok(())
}

pub(crate) fn put<T>(dir: &Path, write: bool, name: &str, value: &T) -> Result<(), ExportError>
where
    T: Serialize + DeserializeOwned + PartialEq + std::fmt::Debug,
{
    let path = dir.join(format!("{name}.json"));
    let text = format!("{}\n", serde_json::to_string_pretty(value)?);
    if write {
        fs::write(&path, &text).map_err(|source| ExportError::io(&path, source))?;
        return Ok(());
    }
    let actual = fs::read_to_string(&path).map_err(|source| ExportError::io(&path, source))?;
    if actual != text {
        return Err(ExportError::Mismatch {
            path,
            expected: text.into_boxed_str(),
            actual: actual.into_boxed_str(),
        });
    }
    let parsed: T = serde_json::from_str(&actual)?;
    if parsed != *value {
        return Err(ExportError::RoundTrip { path });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};

    use super::{check_fixtures, export_typescript, fixture_dir, typescript_dir, write_fixtures};

    #[test]
    fn typescript_regenerates_clean() {
        let tmp = scratch("ts");
        export_typescript(&tmp).expect("export");
        assert_same(&typescript_dir(), &tmp);
        fs::remove_dir_all(&tmp).expect("cleanup");
    }

    #[test]
    fn fixtures_round_trip_and_regenerate_clean() {
        check_fixtures(&fixture_dir()).expect("round-trip");
        let tmp = scratch("json");
        write_fixtures(&tmp).expect("write");
        assert_same(&fixture_dir(), &tmp);
        fs::remove_dir_all(&tmp).expect("cleanup");
    }

    fn scratch(kind: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("skt-protocol-{kind}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    fn assert_same(left: &Path, right: &Path) {
        let left_names = names(left);
        let right_names = names(right);
        assert_eq!(left_names, right_names);
        for name in left_names {
            let left_bytes = fs::read(left.join(&name)).expect("read");
            let right_bytes = fs::read(right.join(&name)).expect("read");
            assert_eq!(left_bytes, right_bytes, "{name}");
        }
    }

    fn names(dir: &Path) -> Vec<String> {
        let mut found = Vec::new();
        for entry in fs::read_dir(dir).expect("dir") {
            let entry = entry.expect("entry");
            if entry.path().is_file() {
                found.push(entry.file_name().to_string_lossy().into_owned());
            }
        }
        found.sort();
        found
    }
}
