//! Wire shapes for one seat's view and for public events.
//!
//! Field names and omitted keys follow `docs/engine-conformance.md` §3 and §4.
//! `GameState` is not in this module and does not implement `Serialize`.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::ids::{CardId, Seat, SeatOrNone};

/// A closed phase name. Values are the legacy strings (`trickEnd`, not `trick_end`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "Phase.ts")]
pub enum Phase {
    /// Seats are bidding. Bids are hidden.
    Bidding,
    /// The seat in [`EngineView::turn`] must play.
    Playing,
    /// A trick is showing. Only the server may advance it.
    TrickEnd,
    /// The pending pirate is choosing.
    Ability,
    /// The round is scored. The server advances to the next round.
    RoundEnd,
    /// Every round has been scored.
    GameOver,
}

/// How the Tigress was declared, or the `as` field on a play.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "PlayedAs.ts")]
pub enum PlayedAs {
    /// The Tigress is a pirate for this trick.
    Pirate,
    /// The Tigress is an escape for this trick.
    Escape,
}

/// Pirate ability, in canonical deck order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "Ability.ts")]
pub enum Ability {
    /// Chooses the next leader.
    Helm,
    /// Draws from the pile and discards the same number.
    Smuggler,
    /// Bets 0, 10, or 20 on making the bid.
    Gambler,
    /// Looks at the undealt pile.
    Seer,
    /// Adjusts the bid by one after the last trick.
    Giant,
}

/// Suit of a number card. Black is the trump suit.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "Suit.ts")]
pub enum Suit {
    /// Parrot. Ranks 1–14 live at card ids 0–13.
    Green,
    /// Chest. Ids 14–27.
    Yellow,
    /// Map. Ids 28–41.
    Purple,
    /// Jolly Roger, the trump suit. Ids 42–55.
    Black,
}

/// Kraken or White Whale, the two beasts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "Beast.ts")]
pub enum Beast {
    /// Nobody wins the trick.
    Kraken,
    /// The highest number card wins, ignoring suit.
    Whale,
}

/// One card played to the current or previous trick.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export_to = "Play.ts")]
pub struct Play {
    /// Who played it.
    pub seat: Seat,
    /// Which card.
    pub card: CardId,
    /// Present only when the card is the Tigress.
    #[serde(rename = "as", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "as", optional)]
    pub played_as: Option<PlayedAs>,
}

/// The trick currently being played. `plays` is empty between tricks.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "Trick.ts")]
pub struct Trick {
    /// Who leads this trick.
    pub leader: Seat,
    /// Cards played so far, in order.
    pub plays: Vec<Play>,
}

/// Bonuses taken from the cards in one trick. Character bonuses are zero on a whale trick.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS, Default)]
#[ts(export_to = "Captures.ts")]
pub struct Captures {
    /// Coloured 14s in the trick. Ten points each.
    pub b14: u8,
    /// The black 14 was in the trick. Twenty points.
    pub black14: bool,
    /// Mermaids captured by a pirate. Twenty points each.
    pub mp: u8,
    /// Pirates captured by the Skull King. Thirty points each.
    pub ps: u8,
    /// A mermaid caught the Skull King. Forty points.
    pub sm: bool,
}

/// One loot card moving from the player who played it to the trick winner.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export_to = "LootMove.ts")]
pub struct LootMove {
    /// The seat that played the loot card.
    pub from: Seat,
    /// The seat that won the trick.
    pub to: Seat,
}

/// Resolution of one trick, including a trick the Kraken or the Whale destroyed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "TrickResult.ts")]
pub struct TrickResult {
    /// `None` when the trick was destroyed.
    pub winner: Option<Seat>,
    /// Index into `plays` of the winning card, or `-1` when the trick was destroyed.
    pub win_index: i16,
    /// Who leads the next trick. The would-be winner after a Kraken; the Whale's player when
    /// a Whale trick has no number card.
    pub leader: Seat,
    /// Which beast decided the trick, if one was played. The later beast wins when both are.
    pub effect: Option<Beast>,
    /// Point bonuses from the cards in the trick.
    pub captures: Captures,
    /// Loot cards that changed hands.
    pub loot: Vec<LootMove>,
}

/// The trick that just finished, kept through `trickEnd` and the ability that follows it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "LastTrick.ts")]
pub struct LastTrick {
    /// The cards, in play order.
    pub plays: Vec<Play>,
    /// Who won, or that the trick was destroyed.
    pub result: TrickResult,
    /// The pirate ability that will run because that pirate won, if abilities are on.
    pub ability: Option<Ability>,
}

/// What the acting seat still has to answer. `drawn` and `peek` are omitted for every other seat.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "PendingView.ts")]
pub struct PendingView {
    /// Which ability is open.
    pub kind: Ability,
    /// Who must answer.
    pub seat: Seat,
    /// Cards the Smuggler drew. Present only on that seat's view, and only while the ability is open.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub drawn: Option<Vec<CardId>>,
    /// The undealt pile, for the Seer only, while the ability is open.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub peek: Option<Vec<CardId>>,
}

/// The Giant's bid change, recorded on the round once the ability resolves.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export_to = "GiantChange.ts")]
pub struct GiantChange {
    /// Who changed the bid.
    pub seat: Seat,
    /// The bid before the change.
    pub from: u8,
    /// The bid after the change.
    pub to: u8,
}

/// One round's public scoring inputs. The current round is included and updated as tricks finish.
///
/// Bids stay `null` until every seat has bid. Tricks stay `null` until the round is over.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export_to = "RoundRecord.ts")]
pub struct RoundRecord {
    /// Cards dealt to each seat this round.
    pub cards: u8,
    /// Revealed bids, or `null` while bidding is still open.
    pub bids: Vec<Option<u8>>,
    /// Tricks taken, or `null` until the round ends.
    pub tricks: Vec<Option<u8>>,
    /// Coloured 14s captured, per seat.
    pub b14: Vec<u8>,
    /// Mermaids captured by a pirate, per seat.
    pub mp: Vec<u8>,
    /// Pirates captured by the Skull King, per seat.
    pub ps: Vec<u8>,
    /// The Gambler's stake, per seat. `0` when they did not bet.
    pub wager: Vec<u8>,
    /// Who captured the black 14, or `-1`.
    pub black14: SeatOrNone,
    /// Who caught the Skull King with a mermaid, or `-1`.
    pub sm: SeatOrNone,
    /// Loot that moved this round.
    pub loot: Vec<LootMove>,
    /// Tricks the Kraken or an empty Whale destroyed.
    pub destroyed: u8,
    /// The Giant's adjustment, once it has been made.
    pub giant: Option<GiantChange>,
    /// The round has been scored.
    pub done: bool,
}

impl RoundRecord {
    pub(crate) fn fresh(players: usize, cards: u8) -> Self {
        Self {
            cards,
            bids: vec![None; players],
            tricks: vec![None; players],
            b14: vec![0; players],
            mp: vec![0; players],
            ps: vec![0; players],
            wager: vec![0; players],
            black14: SeatOrNone::nobody(),
            sm: SeatOrNone::nobody(),
            loot: Vec::new(),
            destroyed: 0,
            giant: None,
            done: false,
        }
    }
}

/// Everything one seat is allowed to see.
///
/// `seats`, `cfg`, and `deck` are not here. The server sends them once in `game.start`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "EngineView.ts")]
pub struct EngineView {
    /// The seat this view belongs to.
    pub me: Seat,
    /// What the table is waiting for.
    pub phase: Phase,
    /// 0-based round index.
    pub round: u8,
    /// How many rounds the format has.
    pub rounds: u8,
    /// Cards each seat was dealt this round.
    pub cards: u8,
    /// Who deals this round. The seat after the dealer leads the first trick.
    pub dealer: Seat,
    /// Who must play. `null` outside `playing`.
    pub turn: Option<Seat>,
    /// This seat's hand, in deal order. Cards the Smuggler drew are appended.
    pub hand: Vec<CardId>,
    /// How many cards each seat holds. Never the cards themselves.
    pub hand_counts: Vec<u8>,
    /// Every card played face up this round, in order.
    pub played: Vec<CardId>,
    /// While bidding: this seat's own bid, `-1` when another seat has bid, `null` when they have not.
    /// After the reveal: every bid.
    pub bids: Vec<Option<i8>>,
    /// Tricks won this round, per seat.
    pub won: Vec<u8>,
    /// The trick in progress.
    pub trick: Trick,
    /// The trick that just finished. `null` before the first trick of the round resolves.
    pub last_trick: Option<LastTrick>,
    /// Rounds so far, including the current one.
    pub log: Vec<RoundRecord>,
    /// The open ability, or `null`.
    pub pending: Option<PendingView>,
    /// Cards this seat may play. Empty when it is not this seat's turn.
    pub legal: Vec<CardId>,
}

/// A public fact. Every seat receives the same list. Hidden cards are not in here.
///
/// The server appends `seatStatus` and `timedOut` itself. This enum does not have them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    export_to = "EngineEvent.ts"
)]
#[ts(rename = "EngineEvent")]
pub enum GameEvent {
    /// A seat bid. The value is not included.
    BidPlaced {
        /// Who bid.
        seat: Seat,
    },
    /// Every bid, revealed together once the last seat has bid.
    BidsRevealed {
        /// One bid per seat.
        bids: Vec<u8>,
    },
    /// A card played face up.
    CardPlayed {
        /// Who played it.
        seat: Seat,
        /// Which card.
        card: CardId,
        /// Present only for the Tigress.
        #[serde(rename = "as", default, skip_serializing_if = "Option::is_none")]
        #[ts(rename = "as", optional)]
        played_as: Option<PlayedAs>,
    },
    /// The trick has a result. The table is in `trickEnd` until the server advances.
    TrickResolved {
        /// `null` when the trick was destroyed.
        winner: Option<Seat>,
        /// The beast that decided it, if any.
        effect: Option<Beast>,
        /// The ability that will be offered, if the winning card was a pirate and abilities are on.
        ability: Option<Ability>,
    },
    /// The server collected the trick and moved on.
    TrickCollected {
        /// Who won the trick that was collected. `null` when it was destroyed.
        winner: Option<Seat>,
    },
    /// An ability is waiting for a choice. The private cards travel in that seat's view, not here.
    AbilityStarted {
        /// Which ability.
        kind: Ability,
        /// Who must answer.
        seat: Seat,
    },
    /// The choice was accepted.
    AbilityUsed(AbilityUsed),
    /// The round is over and scored.
    RoundEnded {
        /// Which round, 0-based.
        round: u8,
    },
    /// A new round has been dealt. Not emitted for the opening deal.
    RoundStarted {
        /// Which round, 0-based.
        round: u8,
    },
    /// The last round has been scored.
    GameOver,
}

/// The `abilityUsed` event. `kind` selects the payload.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(tag = "kind", rename_all = "camelCase", export_to = "AbilityUsed.ts")]
pub enum AbilityUsed {
    /// The Helmsman named the next leader.
    #[serde(rename = "helm")]
    Helm {
        /// Who used it.
        seat: Seat,
        /// Who leads next.
        choice: Seat,
    },
    /// The Smuggler discarded. The cards are not named.
    #[serde(rename = "smuggler")]
    Smuggler {
        /// Who used it.
        seat: Seat,
        /// How many cards were discarded. Equal to how many were drawn.
        count: u8,
    },
    /// The Gambler placed a stake.
    #[serde(rename = "gambler")]
    Gambler {
        /// Who used it.
        seat: Seat,
        /// `0`, `10`, or `20`.
        choice: u8,
    },
    /// The Seer closed the peek. The pile is not in the event.
    #[serde(rename = "seer")]
    Seer {
        /// Who used it.
        seat: Seat,
    },
    /// The Giant changed their bid, or kept it.
    #[serde(rename = "giant")]
    Giant {
        /// Who used it.
        seat: Seat,
        /// `-1`, `0`, or `1`.
        choice: i8,
        /// The bid before the change.
        from: u8,
        /// The bid after the change.
        to: u8,
    },
}

/// `hit`, `glance` (rascal, off by one), or `miss`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "ScoreKind.ts")]
pub enum ScoreKind {
    /// The bid matched the tricks.
    Hit,
    /// Rascal scoring, off by exactly one.
    Glance,
    /// The bid was missed. Classic has no glance.
    Miss,
}

/// A pirate's answer. Serialises as a number, an array of card ids, or `null`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(untagged)]
#[ts(export_to = "AbilityChoice.ts")]
pub enum AbilityChoice {
    /// The cards the Smuggler discards.
    Cards(Vec<CardId>),
    /// A Helmsman seat, a Gambler stake, or a Giant change.
    Number(i32),
    /// The Seer closes the peek. The value is ignored for every ability that does not read it.
    #[ts(type = "null")]
    Pass(()),
}

/// One seat's score for one finished round.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Score {
    /// Points from the bid itself.
    pub base: i32,
    /// Bonus from 14s, captures, and loot. Zero on a classic miss. Half of the raw bonus on a rascal glance.
    pub bonus: i32,
    /// The Gambler's stake, positive on a hit and negative otherwise. Zero when they did not bet.
    pub wager: i32,
    /// `base + bonus + wager`.
    pub total: i32,
    /// The bid was exact.
    pub hit: bool,
    /// Absolute difference between the bid and the tricks taken.
    pub diff: u8,
    /// How the round was classified.
    pub kind: ScoreKind,
}
