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

/// A deal source bound to one deck length.
pub struct DeckShuffle {
    len: usize,
}

impl DeckShuffle {
    /// Shuffles a deck of `len` cards on every round.
    #[must_use]
    pub const fn new(len: usize) -> Self {
        Self { len }
    }
}

impl DealSource for DeckShuffle {
    fn deal_order(&mut self, _round: usize) -> Vec<CardId> {
        OsRandom::permutation(self.len)
    }
}
