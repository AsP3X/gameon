//! The deck, what a card matches, and what it is worth.

use serde::{Deserialize, Serialize};

use crate::error::StepError;

/// Index into the deck built for the table. JSON number.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct CardId(u16);

impl CardId {
    /// An id that came from a [`Card`] the server sent.
    #[must_use]
    pub const fn new(id: u16) -> Self {
        Self(id)
    }

    /// The numeric id.
    #[must_use]
    pub const fn get(self) -> u16 {
        self.0
    }
}

/// The four colours a card can ask for.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Color {
    /// Red.
    Red,
    /// Blue.
    Blue,
    /// Green.
    Green,
    /// Yellow.
    Yellow,
}

impl Color {
    pub(crate) const ALL: [Self; 4] = [Self::Red, Self::Blue, Self::Green, Self::Yellow];
}

/// What is printed on a card, apart from its colour.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Kind {
    /// A rank from 0 to 9.
    Number(u8),
    /// The next player loses a turn.
    Skip,
    /// Direction flips. With two players this is a skip.
    Reverse,
    /// The next player draws two, unless they stack.
    Draw2,
    /// Names the next colour. No other effect.
    Wild,
    /// Names the next colour. The next player draws four, unless they stack.
    WildDraw4,
    /// Names the next colour and sends an open draw stack back.
    Shield,
    /// Names the next colour. The player sees one card from each opponent.
    XRay,
    /// Red. Players with no red card draw two.
    DeadRed,
    /// Blue. Every player who has the fewest cards draws two.
    BooBlue,
}

/// The colour and symbol the next card has to match.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Symbol {
    /// A number.
    Number(u8),
    /// Skip.
    Skip,
    /// Reverse.
    Reverse,
    /// Draw 2.
    Draw2,
    /// Only the colour matters. A wild was played, or the colour was named.
    Color,
    /// Dead Red.
    DeadRed,
    /// Boo Blue.
    BooBlue,
}

/// One card in the deck.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Card {
    /// Index in this deck.
    pub id: CardId,
    /// Colour, when the card has one. Wilds that name a colour have none.
    pub color: Option<Color>,
    /// Rank or special.
    pub kind: Kind,
}

impl Card {
    /// Points left in a hand: the face value, 20 for an action, 50 for a wild or special.
    #[must_use]
    pub fn points(self) -> i32 {
        match self.kind {
            Kind::Number(n) => i32::from(n),
            Kind::Skip | Kind::Reverse | Kind::Draw2 => 20,
            Kind::Wild
            | Kind::WildDraw4
            | Kind::Shield
            | Kind::XRay
            | Kind::DeadRed
            | Kind::BooBlue => 50,
        }
    }

    pub(crate) const fn symbol(self) -> Symbol {
        match self.kind {
            Kind::Number(n) => Symbol::Number(n),
            Kind::Skip => Symbol::Skip,
            Kind::Reverse => Symbol::Reverse,
            Kind::Draw2 => Symbol::Draw2,
            Kind::DeadRed => Symbol::DeadRed,
            Kind::BooBlue => Symbol::BooBlue,
            Kind::Wild | Kind::WildDraw4 | Kind::Shield | Kind::XRay => Symbol::Color,
        }
    }

    pub(crate) const fn names_color(self) -> bool {
        matches!(
            self.kind,
            Kind::Wild | Kind::WildDraw4 | Kind::Shield | Kind::XRay
        )
    }

    pub(crate) const fn is_draw_card(self) -> bool {
        matches!(self.kind, Kind::Draw2 | Kind::WildDraw4)
    }

    pub(crate) const fn draw_count(self) -> u8 {
        match self.kind {
            Kind::Draw2 => 2,
            Kind::WildDraw4 => 4,
            _ => 0,
        }
    }
}

/// One 0 and two of each 1–9 per colour, two of each action per colour, and four of each special.
#[must_use]
pub fn build_deck() -> Vec<Card> {
    let mut cards = Vec::with_capacity(124);
    let mut next = 0u16;
    let push = |cards: &mut Vec<Card>, next: &mut u16, color: Option<Color>, kind: Kind| {
        cards.push(Card {
            id: CardId::new(*next),
            color,
            kind,
        });
        *next = next.saturating_add(1);
    };
    for color in Color::ALL {
        push(&mut cards, &mut next, Some(color), Kind::Number(0));
        for rank in 1..=9 {
            push(&mut cards, &mut next, Some(color), Kind::Number(rank));
            push(&mut cards, &mut next, Some(color), Kind::Number(rank));
        }
        for kind in [Kind::Skip, Kind::Reverse, Kind::Draw2] {
            push(&mut cards, &mut next, Some(color), kind);
            push(&mut cards, &mut next, Some(color), kind);
        }
    }
    for kind in [
        Kind::Wild,
        Kind::WildDraw4,
        Kind::Shield,
        Kind::XRay,
        Kind::DeadRed,
        Kind::BooBlue,
    ] {
        let color = match kind {
            Kind::DeadRed => Some(Color::Red),
            Kind::BooBlue => Some(Color::Blue),
            _ => None,
        };
        for _ in 0..4 {
            push(&mut cards, &mut next, color, kind);
        }
    }
    cards
}

pub(crate) fn lookup(deck: &[Card], id: CardId) -> Result<Card, StepError> {
    deck.get(usize::from(id.get()))
        .copied()
        .filter(|card| card.id == id)
        .ok_or(StepError::Broken)
}

/// A card may be played on the current discard, ignoring an open draw stack.
pub(crate) fn matches(card: Card, color: Color, symbol: Symbol) -> bool {
    if card.names_color() {
        return true;
    }
    if card.color == Some(color) {
        return true;
    }
    card.symbol() == symbol && !matches!(symbol, Symbol::Color)
}

/// True when `hand` contains a red card.
pub(crate) fn holds_red(deck: &[Card], hand: &[CardId]) -> Result<bool, StepError> {
    for id in hand {
        let card = lookup(deck, *id)?;
        if card.color == Some(Color::Red) || matches!(card.kind, Kind::DeadRed) {
            return Ok(true);
        }
    }
    Ok(false)
}
