//! Rebuild a table from the deals and accepted actions that were stored.
//!
//! `GameState` is never written down. The next process deals the same cards and
//! plays the same steps.

use skt_engine::{CardId, DealSource, Expansions, GameState, PlayedAs, Ruleset, Seat};
use skt_protocol::{AbilityChoice, GameSettings};

/// One stored step. `kind` is `deal`, `bid`, `play`, `ability`, or `advance`.
pub struct Step {
    /// The step name.
    pub kind: String,
    /// Acting seat, or nothing for a deal or an advance.
    pub seat: Option<u8>,
    /// JSON payload.
    pub body: String,
}

/// Deals already stored, in the order the engine will ask for them.
struct LoggedDeals {
    orders: Vec<Vec<CardId>>,
    next: usize,
}

impl DealSource for LoggedDeals {
    fn deal_order(&mut self, _round: usize) -> Vec<CardId> {
        let order = self.orders.get(self.next).cloned().unwrap_or_default();
        self.next = self.next.saturating_add(1);
        order
    }
}

/// Play the stored steps. `None` when a step no longer fits the rules.
pub fn rebuild(settings: &GameSettings, players: u8, log: &[Step]) -> Option<GameState> {
    let rules = Ruleset::new(
        settings.scoring,
        settings.format,
        Expansions {
            loot: settings.expansions.loot,
            kraken: settings.expansions.kraken,
            whale: settings.expansions.whale,
        },
        settings.abilities,
    );
    let orders = log
        .iter()
        .filter(|entry| entry.kind == "deal")
        .map(|entry| cards_of(&entry.body))
        .collect::<Option<Vec<_>>>()?;
    let mut deals = LoggedDeals { orders, next: 0 };
    let mut state = GameState::create(rules, players, Seat::from_index(0), &mut deals).ok()?;
    for entry in log {
        let seat = entry.seat.map(Seat::from_index);
        let played = match entry.kind.as_str() {
            "deal" => true,
            "bid" => seat
                .and_then(|seat| bid_of(&entry.body).map(|bid| state.bid(seat, bid).is_ok()))
                .unwrap_or(false),
            "play" => seat
                .and_then(|seat| {
                    play_of(&entry.body)
                        .map(|(card, played_as)| state.play(seat, card, played_as).is_ok())
                })
                .unwrap_or(false),
            "ability" => seat
                .and_then(|seat| {
                    serde_json::from_str::<AbilityChoice>(&entry.body)
                        .ok()
                        .map(|choice| state.ability(seat, &choice).is_ok())
                })
                .unwrap_or(false),
            "advance" => state.advance(&mut deals).is_ok(),
            _ => false,
        };
        if !played {
            return None;
        }
    }
    Some(state)
}

fn cards_of(body: &str) -> Option<Vec<CardId>> {
    let value: serde_json::Value = serde_json::from_str(body).ok()?;
    let cards = value.get("cards")?.as_array()?;
    cards
        .iter()
        .map(|card| {
            card.as_u64()
                .and_then(|index| usize::try_from(index).ok())
                .and_then(|index| u8::try_from(index).ok())
                .map(CardId::from_index)
        })
        .collect()
}

fn bid_of(body: &str) -> Option<i64> {
    let value: serde_json::Value = serde_json::from_str(body).ok()?;
    value.get("bid")?.as_i64()
}

fn play_of(body: &str) -> Option<(CardId, Option<PlayedAs>)> {
    let value: serde_json::Value = serde_json::from_str(body).ok()?;
    let index = value.get("card")?.as_u64()?;
    let played_as = value
        .get("as")
        .and_then(|played| serde_json::from_value(played.clone()).ok());
    Some((CardId::from_index(u8::try_from(index).ok()?), played_as))
}
