You are Claude, the web engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the web client and the design
file. Grok writes the Rust server, Compose, deploy files and CI. You and Grok cannot see each
other's sessions: the owner pastes handover prompts between you. This is handover 029, the answer
to your 028. The login and register limit now keys on the client address. Nothing in the client
has to change.

READ FIRST
1. `AGENTS.md` and `docs/agent-rules/ownership-and-handover.md`.
2. Stop there. This handover opens no client package.

STATE

Branch `feature/grok-accounts`. The fix is `12fc226`
(`12fc22643cdaa192d32f10e9a956b1e54baf5bf1`), on top of `72069a9`. This handover is the next
commit. Worktree `/Users/nvorberg/Documents/development/SkullKingTavern`. Not pushed, not merged.
Do not commit here and do not merge it.

Your branch `feature/claude-accounts` was not modified. The account screens and
`design/web.pen` stay as you committed them.

Gate, from `server/`, with `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt`:
- `cargo fmt --check` passed.
- `cargo clippy --all-targets -- -D warnings` passed.
- `cargo test --workspace`: skt-engine 23 passed, conformance 1 passed (41 fixtures),
  skt-protocol 3 passed, skt-server 16 passed.
- By hand, eleven logins on separate connections to `127.0.0.1:8080` printed
  `401 401 401 401 401 401 401 401 401 401 429`.

`docs/protocol.md` was not changed. Protocol stays 1. The generated TypeScript was not
regenerated.

WHAT THE LIMIT DOES NOW

A direct connection, including `cargo run` and the dev proxy, is charged to `peer.ip()`. The
port is not part of the key. `X-Forwarded-For` and `X-Real-IP` are ignored unless the TCP peer
is listed in `SKT_TRUSTED_PROXIES`.

When the peer is trusted, the client is the rightmost address in `X-Forwarded-For` that is not
itself a trusted proxy. A value the browser invented sits to the left of the hop nginx appended,
so it does not choose the key. If that chain has no such address, `X-Real-IP` is used when it
too is outside the trusted list. `deploy/nginx/api-proxy.conf` sets `X-Real-IP` to `$remote_addr`
and appends that address to `X-Forwarded-For`.

Compose sets `SKT_TRUSTED_PROXIES` to `172.16.0.0/12`, which is the Docker bridge `skt-web` uses.
A connection to the published API port is not in that range. When Nginx Proxy Manager sits in
front of `skt-web` and its network is also inside `172.16.0.0/12`, both hops are skipped and the
browser's address is the key. If `proxy-network` uses another range, add that CIDR. Until it is
listed, everyone behind that hop shares one budget. They cannot each pick a fresh one.

The numbers a player can run into are unchanged: 5 registrations and 10 logins a minute.
`Retry-After` is still the seconds left in that minute, at least 1. The body is still
`RATE_LIMITED` with message `Too many requests.` The page still shows "Too fast. Wait a moment
and try again." and does not read `Retry-After`. What changed is that the limit now fires for
one person, which 027 described and the previous key did not do.

YOUR TASK

None. Do not open a client package, and do not change the mock. It has no REST rate limit.

The Phase 2 branches are ready for the owner to merge, in this order:

1. `feature/grok-accounts`. It already contains `feature/grok-phase1-server`. Do not merge that
   branch on its own as well.
2. `feature/claude-accounts`.

`feature/claude-four-players` and `feature/claude-menu-music` are still not on `dev`. They are
not part of this merge. Both touch files that `feature/claude-accounts` also touches.

CONTRACTS

- Frozen: `web/`, `design/`, `docs/protocol.md`, `fixtures/`. Protocol stays 1.
- You may change: nothing for this handover.

DONE WHEN

- You have not opened a client package.

REPORT BACK

Do not write handover 030 for this. Nothing is owed.
