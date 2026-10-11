//! Replays every game in `fixtures/engine`. A checkout without that directory fails.

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;
use skt_engine::{
    AbilityChoice, CardId, DealSource, GameEvent, GameState, PlayedAs, Rejection, Ruleset, Scoring,
    Seat, StepError,
};

struct Replay {
    rounds: Vec<Vec<CardId>>,
}

impl DealSource for Replay {
    fn deal_order(&mut self, round: usize) -> Vec<CardId> {
        self.rounds.get(round).cloned().unwrap_or_default()
    }
}

struct Table {
    game: GameState,
    deals: Replay,
}

#[test]
fn engine_fixtures_replay() {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../fixtures/engine");
    assert!(
        path.is_dir(),
        "fixtures/engine is missing; a checkout without it cannot pass"
    );
    let games = json_files(&path);
    assert!(
        !games.is_empty(),
        "fixtures/engine contains no JSON fixtures"
    );
    let count = games.len();
    for game in &games {
        replay_file(game);
    }
    eprintln!("replayed {count} engine fixtures");
}

fn json_files(path: &Path) -> Vec<PathBuf> {
    let mut files: Vec<_> = fs::read_dir(path)
        .unwrap_or_else(|error| panic!("read {}: {error}", path.display()))
        .map(|entry| entry.expect("entry").path())
        .filter(|file| file.extension().is_some_and(|ext| ext == "json"))
        .collect();
    files.sort();
    files
}

fn replay_file(path: &Path) {
    let text =
        fs::read_to_string(path).unwrap_or_else(|error| panic!("{}: {error}", path.display()));
    let fixture: Value =
        serde_json::from_str(&text).unwrap_or_else(|error| panic!("{}: {error}", path.display()));
    let name = fixture["name"].as_str().unwrap_or("game");
    let mut table = Table::start(name, &fixture);
    assert_eq!(
        table.views(name),
        fixture["initial"]["views"],
        "{name} initial"
    );
    let steps = fixture["steps"]
        .as_array()
        .unwrap_or_else(|| panic!("{name} steps"));
    for (index, step) in steps.iter().enumerate() {
        table.apply(name, index, step);
    }
    let totals = serde_json::to_value(table.game.totals().expect("totals")).expect("totals");
    let scores = serde_json::to_value(table.game.scores().expect("scores")).expect("scores");
    assert_eq!(totals, fixture["final"]["totals"], "{name} totals");
    assert_eq!(scores, fixture["final"]["scores"], "{name} scores");
}

impl Table {
    fn start(name: &str, fixture: &Value) -> Self {
        let rules = rules_of(name, &fixture["settings"]);
        let players = narrow(name, &fixture["players"]);
        let dealer = Seat::from_index(narrow(name, &fixture["dealer"]));
        let rounds = fixture["deals"]
            .as_array()
            .unwrap_or_else(|| panic!("{name} deals"))
            .iter()
            .map(|round| ids(name, round))
            .collect();
        let mut deals = Replay { rounds };
        let game = GameState::create(rules, players, dealer, &mut deals)
            .unwrap_or_else(|error| panic!("{name} create {error}"));
        Self { game, deals }
    }

    fn apply(&mut self, name: &str, index: usize, step: &Value) {
        let before = self.views(name);
        let accepted = step["ok"]
            .as_bool()
            .unwrap_or_else(|| panic!("{name} step {index} ok"));
        match (accepted, self.dispatch(&step["action"])) {
            (true, Ok(events)) => {
                let encoded = serde_json::to_value(&events).expect("events");
                assert_eq!(encoded, step["events"], "{name} step {index} events");
                assert_eq!(self.views(name), step["views"], "{name} step {index} views");
            }
            (false, Err(code)) => {
                assert_eq!(
                    code,
                    step["reject"].as_str().unwrap_or(""),
                    "{name} step {index} code"
                );
                assert_eq!(
                    self.views(name),
                    before,
                    "{name} step {index} changed on a rejection"
                );
            }
            (true, Err(code)) => panic!("{name} step {index} rejected with {code}"),
            (false, Ok(_)) => panic!("{name} step {index} was accepted"),
        }
    }

    fn dispatch(&mut self, action: &Value) -> Result<Vec<GameEvent>, String> {
        match action["type"].as_str().unwrap_or("") {
            "bid" => self.bid(action),
            "play" => self.play(action),
            "ability" => self.ability(action),
            "advance" => self.game.advance(&mut self.deals).map_err(step_code),
            _ => Err("ILLEGAL_MOVE".to_owned()),
        }
    }

    fn bid(&mut self, action: &Value) -> Result<Vec<GameEvent>, String> {
        let Some(seat) = seat_of(&action["seat"]) else {
            return Err("NOT_YOUR_TURN".to_owned());
        };
        let Some(bid) = action["bid"].as_i64() else {
            return Err("BID_OUT_OF_RANGE".to_owned());
        };
        self.game.bid(seat, bid).map_err(step_code)
    }

    fn play(&mut self, action: &Value) -> Result<Vec<GameEvent>, String> {
        let Some(seat) = seat_of(&action["seat"]) else {
            return Err("NOT_YOUR_TURN".to_owned());
        };
        let Some(card) = card_of(&action["card"]) else {
            return Err("ILLEGAL_MOVE".to_owned());
        };
        let played_as = match action.get("as").filter(|value| !value.is_null()) {
            None => None,
            Some(Value::String(text)) if text == "pirate" => Some(PlayedAs::Pirate),
            Some(Value::String(text)) if text == "escape" => Some(PlayedAs::Escape),
            Some(_) => return Err("ILLEGAL_MOVE".to_owned()),
        };
        self.game.play(seat, card, played_as).map_err(step_code)
    }

    fn ability(&mut self, action: &Value) -> Result<Vec<GameEvent>, String> {
        let Some(seat) = seat_of(&action["seat"]) else {
            return Err("NOT_YOUR_TURN".to_owned());
        };
        let choice = match &action["choice"] {
            Value::Null => AbilityChoice::Pass(()),
            Value::Number(number) => {
                let Some(value) = number.as_i64().and_then(|value| i32::try_from(value).ok())
                else {
                    return Err("ILLEGAL_MOVE".to_owned());
                };
                AbilityChoice::Number(value)
            }
            Value::Array(items) => {
                let mut cards = Vec::new();
                for item in items {
                    cards.push(card_of(item).ok_or_else(|| "ILLEGAL_MOVE".to_owned())?);
                }
                AbilityChoice::Cards(cards)
            }
            _ => return Err("ILLEGAL_MOVE".to_owned()),
        };
        self.game.ability(seat, &choice).map_err(step_code)
    }

    fn views(&self, name: &str) -> Value {
        serde_json::to_value(
            self.game
                .views()
                .unwrap_or_else(|error| panic!("{name} views {error}")),
        )
        .expect("views")
    }
}

fn step_code(error: StepError) -> String {
    match error {
        StepError::Rejected(Rejection::NotYourTurn) => "NOT_YOUR_TURN".to_owned(),
        StepError::Rejected(Rejection::IllegalMove) => "ILLEGAL_MOVE".to_owned(),
        StepError::Rejected(Rejection::BidOutOfRange) => "BID_OUT_OF_RANGE".to_owned(),
        StepError::Broken => "BROKEN".to_owned(),
    }
}

fn rules_of(name: &str, value: &Value) -> Ruleset {
    let scoring = match value["scoring"].as_str() {
        Some("classic") => Scoring::Classic,
        Some("rascal") => Scoring::Rascal,
        other => panic!("{name} has scoring {other:?}"),
    };
    let format = match value["format"].as_str() {
        Some("classic") => skt_engine::Format::Classic,
        Some("brawl") => skt_engine::Format::Brawl,
        Some("even") => skt_engine::Format::Even,
        Some("whirl") => skt_engine::Format::Whirl,
        Some("swift") => skt_engine::Format::Swift,
        other => panic!("{name} has format {other:?}"),
    };
    Ruleset::new(
        scoring,
        format,
        skt_engine::Expansions {
            loot: bool_flag(name, value, "loot"),
            kraken: bool_flag(name, value, "kraken"),
            whale: bool_flag(name, value, "whale"),
        },
        bool_flag(name, value, "abilities"),
    )
}

fn bool_flag(name: &str, value: &Value, key: &str) -> bool {
    value[key]
        .as_bool()
        .unwrap_or_else(|| panic!("{name} settings.{key} must be a boolean"))
}

fn ids(name: &str, value: &Value) -> Vec<CardId> {
    value
        .as_array()
        .unwrap_or_else(|| panic!("{name} deal"))
        .iter()
        .map(|id| card_of(id).unwrap_or_else(|| panic!("{name} card")))
        .collect()
}

fn seat_of(value: &Value) -> Option<Seat> {
    let number = value.as_u64()?;
    u8::try_from(number).ok().map(Seat::from_index)
}

fn card_of(value: &Value) -> Option<CardId> {
    let number = value.as_u64()?;
    u8::try_from(number).ok().map(CardId::from_index)
}

fn narrow(name: &str, value: &Value) -> u8 {
    let number = value.as_u64().unwrap_or_else(|| panic!("{name} number"));
    u8::try_from(number).unwrap_or_else(|_| panic!("{name} narrow"))
}
