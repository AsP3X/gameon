//! Randomness the bots ask for. The engine never draws a number itself.

/// A source of uniform values in `[0, 1)`.
///
/// The server passes an OS-seeded generator. Tests pass a fixed sequence.
/// `1.0` is not a value this trait should return: a bot uses it as `Math.random()`.
pub trait Rng {
    /// The next sample.
    fn next_f64(&mut self) -> f64;
}

/// `Math.round`: halves go toward `+∞`.
pub(crate) fn js_round(value: f64) -> i32 {
    floor_i32(value + 0.5)
}

/// `Math.floor` for a finite value that fits in `i32`. Non-finite input yields 0.
pub(crate) fn floor_i32(value: f64) -> i32 {
    if !value.is_finite() {
        return 0;
    }
    if value >= 0.0 {
        let mut rest = value;
        let mut whole = 0i32;
        while rest >= 1.0 {
            rest -= 1.0;
            whole = whole.saturating_add(1);
        }
        whole
    } else {
        let mut rest = value;
        let mut whole = 0i32;
        while rest < 0.0 {
            rest += 1.0;
            whole = whole.saturating_sub(1);
        }
        whole
    }
}

/// Floor of a non-negative finite value, as a `usize`.
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
