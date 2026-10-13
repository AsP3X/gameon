//! Randomness the bots ask for. The engine never draws a number itself.

/// A source of uniform values in `[0, 1)`.
///
/// The server passes an OS-seeded generator. Tests pass a fixed sequence.
/// `1.0` is not a value this trait should return: a bot uses it as `Math.random()`.
pub trait Rng {
    /// The next sample.
    fn next_f64(&mut self) -> f64;
}

/// Floor of a non-negative finite value, as a `usize`.
///
/// The leak tests use it to pick a hidden card. The library itself does not.
#[cfg(test)]
pub(crate) fn floor_usize(value: f64) -> usize {
    if !value.is_finite() || value <= 0.0 {
        return 0;
    }
    let mut rest = value;
    let mut whole = 0usize;
    while rest >= 1.0 {
        rest -= 1.0;
        whole = whole.saturating_add(1);
    }
    whole
}
