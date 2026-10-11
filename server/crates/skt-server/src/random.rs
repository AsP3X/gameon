//! OS randomness for deals and bot noise. The engine never draws a number itself.

use rand::Rng;
use skt_engine::{CardId, DealSource, Rng as BotRng};

/// Shuffles from the operating system and answers the bots.
pub struct OsRandom;

impl OsRandom {
    /// A permutation of card ids `0..len`. Index 0 is dealt first.
    pub fn permutation(len: usize) -> Vec<CardId> {
        let mut order: Vec<CardId> = Vec::new();
        for index in 0..len {
            let Ok(narrow) = u8::try_from(index) else {
                continue;
            };
            order.push(CardId::from_index(narrow));
        }
        let mut rng = rand::rng();
        for index in (1..order.len()).rev() {
            let swap = rng.random_range(0..=index);
            order.swap(index, swap);
        }
        order
    }
}

impl BotRng for OsRandom {
    fn next_f64(&mut self) -> f64 {
        let sample = rand::rng().random::<f64>();
        if sample < 1.0 { sample } else { 0.0 }
    }
}

/// A deal source that keeps every order it produced, for the action log.
pub struct Recall {
    len: usize,
    /// Round index and card indexes, dealt first at index 0.
    pub orders: Vec<(u32, Vec<u8>)>,
}

impl Recall {
    /// Records shuffles of a deck of `len` cards.
    #[must_use]
    pub const fn new(len: usize) -> Self {
        Self {
            len,
            orders: Vec::new(),
        }
    }
}

impl DealSource for Recall {
    fn deal_order(&mut self, round: usize) -> Vec<CardId> {
        let order = OsRandom::permutation(self.len);
        let cards = order
            .iter()
            .map(|card| u8::try_from(card.index()).unwrap_or(0))
            .collect();
        self.orders.push((u32::try_from(round).unwrap_or(0), cards));
        order
    }
}
