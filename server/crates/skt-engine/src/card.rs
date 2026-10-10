//! The canonical deck, trick legality, and trick resolution.
//!
//! Card ids are indexes into the deck built for the table's expansions. The order is the legacy
//! order: four suits, five Escapes, five Pirates, Tigress, Skull King, two Mermaids, then any
//! Loot, Kraken and White Whale that are switched on.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::{CreateError, StepError};
use crate::ids::{CardId, Seat};
use crate::model::{Ability, Beast, Captures, LootMove, Play, PlayedAs, Suit, TrickResult};
use crate::rules::Expansions;

/// One card in the deck sent with `game.start`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind")]
#[ts(tag = "kind", export_to = "Card.ts")]
pub enum Card {
    /// A suited rank from 1 to 14. Black is trump.
    #[serde(rename = "num")]
    Number {
        /// Index in this deck.
        id: CardId,
        /// Parrot, chest, map, or jolly roger.
        suit: Suit,
        /// 1 through 14.
        rank: u8,
    },
    /// An escape. Five of them are always in the deck.
    #[serde(rename = "escape")]
    Escape {
        /// Index in this deck.
        id: CardId,
    },
    /// A pirate with an ability. The ability fires only when this card wins and abilities are on.
    #[serde(rename = "pirate")]
    Pirate {
        /// Index in this deck.
        id: CardId,
        /// Which pirate.
        ability: Ability,
    },
    /// The Tigress. The player declares pirate or escape as it is played.
    #[serde(rename = "tigress")]
    Tigress {
        /// Index in this deck.
        id: CardId,
    },
    /// The Skull King.
    #[serde(rename = "sk")]
    SkullKing {
        /// Index in this deck.
        id: CardId,
    },
    /// A mermaid. Two are always in the deck.
    #[serde(rename = "mermaid")]
    Mermaid {
        /// Index in this deck.
        id: CardId,
    },
    /// Loot. Behaves as an escape, then moves to the trick winner if someone else played it.
    #[serde(rename = "loot")]
    Loot {
        /// Index in this deck.
        id: CardId,
    },
    /// The Kraken. Destroys the trick.
    #[serde(rename = "kraken")]
    Kraken {
        /// Index in this deck.
        id: CardId,
    },
    /// The White Whale. The highest number card wins, ignoring suit.
    #[serde(rename = "whale")]
    Whale {
        /// Index in this deck.
        id: CardId,
    },
}

impl Card {
    /// The id stored on the card. It matches the card's index in [`build_deck`].
    #[must_use]
    pub const fn id(self) -> CardId {
        match self {
            Self::Number { id, .. }
            | Self::Escape { id }
            | Self::Pirate { id, .. }
            | Self::Tigress { id }
            | Self::SkullKing { id }
            | Self::Mermaid { id }
            | Self::Loot { id }
            | Self::Kraken { id }
            | Self::Whale { id } => id,
        }
    }

    /// The pirate ability, when this card is a pirate and not the Tigress.
    #[must_use]
    pub const fn pirate_ability(self) -> Option<Ability> {
        match self {
            Self::Pirate { ability, .. } => Some(ability),
            _ => None,
        }
    }

    /// Suit and rank, for a number card.
    #[must_use]
    pub const fn number(self) -> Option<(Suit, u8)> {
        match self {
            Self::Number { suit, rank, .. } => Some((suit, rank)),
            _ => None,
        }
    }

    fn suit(self) -> Option<Suit> {
        match self {
            Self::Number { suit, .. } => Some(suit),
            _ => None,
        }
    }

    fn rank(self) -> Option<u8> {
        match self {
            Self::Number { rank, .. } => Some(rank),
            _ => None,
        }
    }

    pub(crate) const fn is_tigress(self) -> bool {
        matches!(self, Self::Tigress { .. })
    }

    const fn is_loot(self) -> bool {
        matches!(self, Self::Loot { .. })
    }

    const fn beast(self) -> Option<Beast> {
        match self {
            Self::Kraken { .. } => Some(Beast::Kraken),
            Self::Whale { .. } => Some(Beast::Whale),
            _ => None,
        }
    }
}

/// Build the deck. Ids are `0..len`.
///
/// # Errors
///
/// [`CreateError::Deal`] if the deck would not fit in a [`CardId`]. The real decks are 70 to 74 cards.
pub fn build_deck(expansions: Expansions) -> Result<Vec<Card>, CreateError> {
    let mut deck = Vec::with_capacity(74);
    for suit in [Suit::Green, Suit::Yellow, Suit::Purple, Suit::Black] {
        for rank in 1..=14 {
            let id = next_id(&deck)?;
            deck.push(Card::Number { id, suit, rank });
        }
    }
    for _ in 0..5 {
        let id = next_id(&deck)?;
        deck.push(Card::Escape { id });
    }
    for ability in [
        Ability::Helm,
        Ability::Smuggler,
        Ability::Gambler,
        Ability::Seer,
        Ability::Giant,
    ] {
        let id = next_id(&deck)?;
        deck.push(Card::Pirate { id, ability });
    }
    let id = next_id(&deck)?;
    deck.push(Card::Tigress { id });
    let id = next_id(&deck)?;
    deck.push(Card::SkullKing { id });
    for _ in 0..2 {
        let id = next_id(&deck)?;
        deck.push(Card::Mermaid { id });
    }
    if expansions.loot {
        for _ in 0..2 {
            let id = next_id(&deck)?;
            deck.push(Card::Loot { id });
        }
    }
    if expansions.kraken {
        let id = next_id(&deck)?;
        deck.push(Card::Kraken { id });
    }
    if expansions.whale {
        let id = next_id(&deck)?;
        deck.push(Card::Whale { id });
    }
    Ok(deck)
}

fn next_id(deck: &[Card]) -> Result<CardId, CreateError> {
    let index = u8::try_from(deck.len()).map_err(|_| CreateError::Deal)?;
    Ok(CardId::from_index(index))
}

pub(crate) fn lookup(deck: &[Card], id: CardId) -> Result<Card, StepError> {
    match deck.get(id.index()).copied() {
        Some(card) if card.id() == id => Ok(card),
        _ => Err(StepError::Broken),
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Role {
    Escape,
    Number,
    Pirate,
    Sk,
    Mermaid,
    Kraken,
    Whale,
}

/// How a played card behaves. A missing Tigress declaration is an escape. Loot is an escape.
fn role(card: Card, played_as: Option<PlayedAs>) -> Role {
    match card {
        Card::Tigress { .. } => {
            if played_as == Some(PlayedAs::Pirate) {
                Role::Pirate
            } else {
                Role::Escape
            }
        }
        Card::Loot { .. } | Card::Escape { .. } => Role::Escape,
        Card::Pirate { .. } => Role::Pirate,
        Card::SkullKing { .. } => Role::Sk,
        Card::Mermaid { .. } => Role::Mermaid,
        Card::Kraken { .. } => Role::Kraken,
        Card::Whale { .. } => Role::Whale,
        Card::Number { .. } => Role::Number,
    }
}

/// The suit that must be followed, if the lead has one.
///
/// The first card that is not an escape sets it. A character or a beast in that position
/// means there is no suit to follow.
///
/// # Errors
///
/// [`StepError::Broken`] when a play names a card that is not in `deck`.
pub fn lead_suit(plays: &[Play], deck: &[Card]) -> Result<Option<Suit>, StepError> {
    for play in plays {
        let card = lookup(deck, play.card)?;
        if role(card, play.played_as) == Role::Escape {
            continue;
        }
        return Ok(card.suit());
    }
    Ok(None)
}

/// Cards from `hand` that may be played on `plays`, in hand order.
///
/// # Errors
///
/// [`StepError::Broken`] when a card id is not in `deck`.
pub fn legal_cards(
    hand: &[CardId],
    plays: &[Play],
    deck: &[Card],
) -> Result<Vec<CardId>, StepError> {
    let suit = lead_suit(plays, deck)?;
    let Some(suit) = suit else {
        return Ok(hand.to_vec());
    };
    if !has_number_of_suit(hand, deck, suit)? {
        return Ok(hand.to_vec());
    }
    let mut legal = Vec::new();
    for id in hand {
        let card = lookup(deck, *id)?;
        let follows = match card.number() {
            Some((card_suit, _)) => card_suit == suit,
            None => true,
        };
        if follows {
            legal.push(*id);
        }
    }
    Ok(legal)
}

fn has_number_of_suit(hand: &[CardId], deck: &[Card], suit: Suit) -> Result<bool, StepError> {
    for id in hand {
        if lookup(deck, *id)?.suit() == Some(suit) {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Whether `card` may be played from `hand` onto `plays`.
///
/// # Errors
///
/// [`StepError::Broken`] when a card id is not in `deck`.
pub fn is_legal(
    hand: &[CardId],
    plays: &[Play],
    deck: &[Card],
    card: CardId,
) -> Result<bool, StepError> {
    Ok(legal_cards(hand, plays, deck)?.contains(&card))
}

/// Resolve a trick. A partial trick is allowed: the bots try a play this way.
///
/// # Errors
///
/// [`StepError::Broken`] when `plays` is empty or a card id is not in `deck`.
pub fn resolve_trick(plays: &[Play], deck: &[Card]) -> Result<TrickResult, StepError> {
    if plays.is_empty() {
        return Err(StepError::Broken);
    }
    let effect = last_beast(plays, deck)?;
    if effect == Some(Beast::Kraken) {
        let leader = seat_at(plays, standing(plays, deck)?)?;
        return Ok(destroyed(leader, effect));
    }
    if effect == Some(Beast::Whale) {
        return resolve_whale(plays, deck);
    }
    let win_index = standing(plays, deck)?;
    scored(plays, deck, win_index, effect)
}

fn destroyed(leader: Seat, effect: Option<Beast>) -> TrickResult {
    TrickResult {
        winner: None,
        win_index: -1,
        leader,
        effect,
        captures: Captures::default(),
        loot: Vec::new(),
    }
}

fn resolve_whale(plays: &[Play], deck: &[Card]) -> Result<TrickResult, StepError> {
    let Some(win_index) = highest_number(plays, deck)? else {
        return Ok(destroyed(last_beast_seat(plays, deck)?, Some(Beast::Whale)));
    };
    scored(plays, deck, win_index, Some(Beast::Whale))
}

fn scored(
    plays: &[Play],
    deck: &[Card],
    win_index: usize,
    effect: Option<Beast>,
) -> Result<TrickResult, StepError> {
    let winner = seat_at(plays, win_index)?;
    let mut captures = Captures::default();
    count_fourteens(plays, deck, &mut captures)?;
    // Human: A mermaid that catches the Skull King does not also score the pirates in that trick.
    // Agent: READS roles of plays; WRITES captures.sm or captures.ps or captures.mp, only one of them; whale skips this.
    if effect != Some(Beast::Whale) {
        count_characters(plays, deck, win_index, &mut captures)?;
    }
    let loot = loot_moves(plays, deck, winner)?;
    Ok(TrickResult {
        winner: Some(winner),
        win_index: i16::try_from(win_index).map_err(|_| StepError::Broken)?,
        leader: winner,
        effect,
        captures,
        loot,
    })
}

fn last_beast(plays: &[Play], deck: &[Card]) -> Result<Option<Beast>, StepError> {
    let mut effect = None;
    for play in plays {
        if let Some(beast) = lookup(deck, play.card)?.beast() {
            effect = Some(beast);
        }
    }
    Ok(effect)
}

fn last_beast_seat(plays: &[Play], deck: &[Card]) -> Result<Seat, StepError> {
    let mut found = None;
    for play in plays {
        if lookup(deck, play.card)?.beast().is_some() {
            found = Some(play.seat);
        }
    }
    found.ok_or(StepError::Broken)
}

fn highest_number(plays: &[Play], deck: &[Card]) -> Result<Option<usize>, StepError> {
    let mut best: Option<(usize, u8)> = None;
    for (index, play) in plays.iter().enumerate() {
        let Some(rank) = lookup(deck, play.card)?.rank() else {
            continue;
        };
        let higher = match best {
            Some((_, best_rank)) => rank > best_rank,
            None => true,
        };
        if higher {
            best = Some((index, rank));
        }
    }
    Ok(best.map(|(index, _)| index))
}

/// Index of the play that is winning, ignoring beasts.
fn standing(plays: &[Play], deck: &[Card]) -> Result<usize, StepError> {
    let roles = roles_of(plays, deck)?;
    let sk = roles.iter().position(|role| *role == Role::Sk);
    let mermaid = roles.iter().position(|role| *role == Role::Mermaid);
    let pirate = roles.iter().position(|role| *role == Role::Pirate);
    if sk.is_some() && mermaid.is_some() {
        return mermaid.ok_or(StepError::Broken);
    }
    if let Some(index) = sk.or(pirate).or(mermaid) {
        return Ok(index);
    }
    let mut best: Option<usize> = None;
    for (index, play) in plays.iter().enumerate() {
        let Some((suit, rank)) = lookup(deck, play.card)?.number() else {
            continue;
        };
        let Some(best_index) = best else {
            best = Some(index);
            continue;
        };
        let Some((best_suit, best_rank)) = lookup(deck, seat_card(plays, best_index)?)?.number()
        else {
            return Err(StepError::Broken);
        };
        let trump = suit == Suit::Black && best_suit != Suit::Black;
        let higher = suit == best_suit && rank > best_rank;
        if trump || higher {
            best = Some(index);
        }
    }
    // All escapes: the first card wins.
    Ok(best.unwrap_or(0))
}

fn roles_of(plays: &[Play], deck: &[Card]) -> Result<Vec<Role>, StepError> {
    let mut roles = Vec::with_capacity(plays.len());
    for play in plays {
        roles.push(role(lookup(deck, play.card)?, play.played_as));
    }
    Ok(roles)
}

fn count_fourteens(
    plays: &[Play],
    deck: &[Card],
    captures: &mut Captures,
) -> Result<(), StepError> {
    for play in plays {
        let Some((suit, rank)) = lookup(deck, play.card)?.number() else {
            continue;
        };
        if rank != 14 {
            continue;
        }
        if suit == Suit::Black {
            captures.black14 = true;
        } else {
            captures.b14 = captures.b14.checked_add(1).ok_or(StepError::Broken)?;
        }
    }
    Ok(())
}

fn count_characters(
    plays: &[Play],
    deck: &[Card],
    win_index: usize,
    captures: &mut Captures,
) -> Result<(), StepError> {
    let roles = roles_of(plays, deck)?;
    let winner = roles.get(win_index).ok_or(StepError::Broken)?;
    if *winner == Role::Mermaid && roles.contains(&Role::Sk) {
        captures.sm = true;
    } else if *winner == Role::Sk {
        captures.ps = count_role(&roles, Role::Pirate)?;
    } else if *winner == Role::Pirate {
        captures.mp = count_role(&roles, Role::Mermaid)?;
    }
    Ok(())
}

fn count_role(roles: &[Role], want: Role) -> Result<u8, StepError> {
    u8::try_from(roles.iter().filter(|role| **role == want).count()).map_err(|_| StepError::Broken)
}

fn loot_moves(plays: &[Play], deck: &[Card], winner: Seat) -> Result<Vec<LootMove>, StepError> {
    let mut loot = Vec::new();
    for play in plays {
        if lookup(deck, play.card)?.is_loot() && play.seat != winner {
            loot.push(LootMove {
                from: play.seat,
                to: winner,
            });
        }
    }
    Ok(loot)
}

fn seat_at(plays: &[Play], index: usize) -> Result<Seat, StepError> {
    plays
        .get(index)
        .map(|play| play.seat)
        .ok_or(StepError::Broken)
}

fn seat_card(plays: &[Play], index: usize) -> Result<CardId, StepError> {
    plays
        .get(index)
        .map(|play| play.card)
        .ok_or(StepError::Broken)
}

pub(crate) fn is_tigress(deck: &[Card], id: CardId) -> Result<bool, StepError> {
    Ok(lookup(deck, id)?.is_tigress())
}
