//! In-memory budgets for register and login. One process, no Redis.

use std::collections::{HashMap, VecDeque};
use std::time::{Duration, Instant};

use tokio::sync::Mutex;

/// How many register and login calls one address may make in a window.
#[derive(Clone, Copy)]
pub struct Budgets {
    /// Register calls allowed per window.
    pub register: u32,
    /// Login calls allowed per window.
    pub login: u32,
    /// The length of the window.
    pub window: Duration,
}

impl Budgets {
    /// Ten logins and five registrations a minute.
    #[must_use]
    pub const fn standard() -> Self {
        Self {
            register: 5,
            login: 10,
            window: Duration::from_mins(1),
        }
    }
}

/// A sliding window per address.
#[derive(Clone)]
pub struct RateGate {
    inner: std::sync::Arc<Mutex<Book>>,
    budgets: Budgets,
}

struct Book {
    register: HashMap<String, VecDeque<Instant>>,
    login: HashMap<String, VecDeque<Instant>>,
}

impl RateGate {
    /// `budgets` is the production window, or a wider one in tests.
    #[must_use]
    pub fn new(budgets: Budgets) -> Self {
        Self {
            inner: std::sync::Arc::new(Mutex::new(Book {
                register: HashMap::new(),
                login: HashMap::new(),
            })),
            budgets,
        }
    }

    /// `Ok(())` when the call is inside the budget. `Err(seconds)` is `Retry-After`.
    pub async fn register(&self, key: &str) -> Result<(), u64> {
        self.hit(key, true).await
    }

    /// `Ok(())` when the call is inside the budget. `Err(seconds)` is `Retry-After`.
    pub async fn login(&self, key: &str) -> Result<(), u64> {
        self.hit(key, false).await
    }

    async fn hit(&self, key: &str, register: bool) -> Result<(), u64> {
        let mut book = self.inner.lock().await;
        let budget = if register {
            self.budgets.register
        } else {
            self.budgets.login
        };
        let stamps = if register {
            book.register.entry(key.to_owned()).or_default()
        } else {
            book.login.entry(key.to_owned()).or_default()
        };
        let now = Instant::now();
        while stamps
            .front()
            .is_some_and(|stamp| now.duration_since(*stamp) >= self.budgets.window)
        {
            stamps.pop_front();
        }
        if u32::try_from(stamps.len()).unwrap_or(u32::MAX) >= budget {
            let oldest = stamps.front().copied().unwrap_or(now);
            let retry = self
                .budgets
                .window
                .saturating_sub(now.duration_since(oldest))
                .as_secs()
                .max(1);
            return Err(retry);
        }
        stamps.push_back(now);
        Ok(())
    }
}
