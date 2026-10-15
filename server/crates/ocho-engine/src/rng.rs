//! Randomness the shuffle, the reshuffle, and X-Ray ask for.
//!
//! The game server passes an OS-seeded generator. Tests pass a fixed sequence.
//! The engine never reads the clock and never builds its own generator.

/// A source of uniform `u32` values.
pub trait Rng {
    /// The next sample.
    fn next_u32(&mut self) -> u32;
}

/// An index in `0..len`.
pub(crate) fn index_below(rng: &mut impl Rng, len: usize) -> usize {
    if len <= 1 {
        return 0;
    }
    let span = u32::try_from(len).unwrap_or(u32::MAX);
    usize::try_from(rng.next_u32() % span).unwrap_or(0)
}
