# Security review

Checked against `docs/agent-rules/server-authority.md` before launch.

- The seat of a bid, play, or ability is the session's seat. A seat named in the message is not read.
- `GameState` is not serialized. A restart replays `open_log`. Metrics are counts only.
- Session tokens are stored as SHA-256. Passwords are argon2id. Neither is logged.
- Deals use the operating system generator. The action log stores the order after the deal, not a seed.
- Ranked requires an account. A private party is not seated together again for two hours.
- The action log of a finished game is readable only by someone who sat in it.
- A frame over 4 KB, a frame that is not JSON, a missing hello, and a silent socket close the connection.
- SIGTERM writes running games, then the process exits. The next start replays them.

Still for the client, not this review: the installable PWA, the offline page, the accessibility pass, and empty and error states on every screen.
