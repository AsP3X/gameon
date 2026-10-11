//! In-memory budgets for register and login. One process, no Redis.
//!
//! The key is the client address, without a port. A forwarded header counts only when the TCP
//! peer is listed in `SKT_TRUSTED_PROXIES`.

use std::collections::{HashMap, VecDeque};
use std::net::{IpAddr, SocketAddr};
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

/// Proxies whose forwarded headers may be believed. Anyone else is the client.
#[derive(Clone, Debug)]
pub struct TrustedProxies {
    nets: Vec<Cidr>,
}

impl TrustedProxies {
    /// No proxy is trusted. Forwarded headers are ignored.
    #[must_use]
    pub const fn none() -> Self {
        Self { nets: Vec::new() }
    }

    /// `SKT_TRUSTED_PROXIES`, a comma-separated list of addresses and CIDRs.
    ///
    /// # Errors
    ///
    /// A list entry is not an address or a CIDR.
    pub fn from_env() -> Result<Self, String> {
        match std::env::var("SKT_TRUSTED_PROXIES") {
            Ok(raw) => Self::parse(&raw),
            Err(std::env::VarError::NotPresent) => Ok(Self::none()),
            Err(std::env::VarError::NotUnicode(_)) => {
                Err("SKT_TRUSTED_PROXIES is not text".to_owned())
            }
        }
    }

    /// Parse `172.16.0.0/12, 10.0.0.1`.
    ///
    /// # Errors
    ///
    /// An entry is not an address or a CIDR.
    pub fn parse(raw: &str) -> Result<Self, String> {
        let mut nets = Vec::new();
        for part in raw.split(',') {
            let part = part.trim();
            if part.is_empty() {
                continue;
            }
            nets.push(Cidr::parse(part)?);
        }
        Ok(Self { nets })
    }

    fn contains(&self, ip: IpAddr) -> bool {
        self.nets.iter().any(|net| net.contains(ip))
    }
}

/// The address a login or registration is charged to.
#[must_use]
pub fn client_key(
    peer: SocketAddr,
    forwarded_for: Option<&str>,
    real_ip: Option<&str>,
    trusted: &TrustedProxies,
) -> String {
    if !trusted.contains(peer.ip()) {
        return peer.ip().to_string();
    }
    if let Some(chain) = forwarded_for {
        for hop in chain
            .rsplit(',')
            .map(str::trim)
            .filter(|hop| !hop.is_empty())
        {
            let Ok(ip) = hop.parse::<IpAddr>() else {
                continue;
            };
            if !trusted.contains(ip) {
                return ip.to_string();
            }
        }
    }
    if let Some(ip) = real_ip.and_then(|value| value.trim().parse::<IpAddr>().ok())
        && !trusted.contains(ip)
    {
        return ip.to_string();
    }
    peer.ip().to_string()
}

#[derive(Clone, Copy, Debug)]
struct Cidr {
    v6: bool,
    prefix: u8,
    bits: u128,
}

impl Cidr {
    fn parse(raw: &str) -> Result<Self, String> {
        let (addr, prefix) = raw
            .rsplit_once('/')
            .map_or((raw, None), |(addr, prefix)| (addr, Some(prefix)));
        let ip: IpAddr = addr
            .parse()
            .map_err(|_| format!("SKT_TRUSTED_PROXIES has {raw}"))?;
        let (v6, width, bits) = match ip {
            IpAddr::V4(value) => (false, 32u8, u128::from(u32::from(value))),
            IpAddr::V6(value) => (true, 128u8, u128::from(value)),
        };
        let prefix = match prefix {
            None => width,
            Some(text) => text
                .parse::<u8>()
                .map_err(|_| format!("SKT_TRUSTED_PROXIES has {raw}"))?,
        };
        if prefix > width {
            return Err(format!("SKT_TRUSTED_PROXIES has {raw}"));
        }
        Ok(Self { v6, prefix, bits })
    }

    fn contains(self, ip: IpAddr) -> bool {
        let (v6, width, bits) = match ip {
            IpAddr::V4(value) => (false, 32u8, u128::from(u32::from(value))),
            IpAddr::V6(value) => (true, 128u8, u128::from(value)),
        };
        if v6 != self.v6 || self.prefix > width {
            return false;
        }
        if self.prefix == 0 {
            return true;
        }
        let shift = u32::from(width - self.prefix);
        let mask = u128::MAX << shift;
        (bits & mask) == (self.bits & mask)
    }
}

#[cfg(test)]
mod tests {
    use super::{Budgets, RateGate, TrustedProxies, client_key};
    use std::net::SocketAddr;
    use std::time::Duration;

    fn addr(text: &str) -> SocketAddr {
        text.parse().expect("address")
    }

    #[test]
    fn a_direct_peer_is_keyed_without_its_port_and_ignores_forwarded_headers() {
        let trusted = TrustedProxies::parse("172.16.0.0/12").expect("cidr");
        let first = addr("203.0.113.9:40000");
        let second = addr("203.0.113.9:40001");
        assert_eq!(
            client_key(first, Some("198.51.100.1"), Some("198.51.100.2"), &trusted),
            "203.0.113.9"
        );
        assert_eq!(
            client_key(second, Some("203.0.113.77"), None, &trusted),
            client_key(first, None, None, &trusted)
        );
    }

    #[test]
    fn a_trusted_proxy_keeps_the_rightmost_address_the_client_did_not_choose() {
        let trusted = TrustedProxies::parse("172.16.0.0/12").expect("cidr");
        let proxy = addr("172.18.0.3:4321");
        // nginx appended the hop it saw. A forged value sits to the left of that hop.
        let key = client_key(
            proxy,
            Some("203.0.113.77, 198.51.100.10, 172.19.0.4"),
            Some("172.19.0.4"),
            &trusted,
        );
        assert_eq!(key, "198.51.100.10");
        let other = client_key(
            proxy,
            Some("203.0.113.88, 198.51.100.10, 172.19.0.4"),
            None,
            &trusted,
        );
        assert_eq!(other, key);
    }

    #[tokio::test]
    async fn two_real_addresses_do_not_share_a_budget() {
        let gate = RateGate::new(Budgets {
            register: 5,
            login: 2,
            window: Duration::from_mins(1),
        });
        assert!(gate.login("203.0.113.9").await.is_ok());
        assert!(gate.login("203.0.113.9").await.is_ok());
        assert!(gate.login("203.0.113.9").await.is_err());
        assert!(gate.login("203.0.113.10").await.is_ok());
    }
}
