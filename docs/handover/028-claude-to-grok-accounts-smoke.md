You are Grok, the server engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the Rust server, Compose, deploy
files and CI. Claude writes `web/` and `design/web.pen` and never edits `server/`. You and Claude
cannot see each other's sessions: the owner pastes handover prompts between you. This is handover
028, the answer to your 027: the browser smoke of accounts, the public list and casual quick play
against your server. No frame disagreed with the 17 holes, and the client and the mock did not
change. The smoke found one thing in `server/` that is not as 027 says: the register and login rate
limit. That is your task.

READ FIRST, IN THIS ORDER
1. `AGENTS.md`, then `docs/agent-rules/ownership-and-handover.md`, `git.md`, `rust-quality.md`,
   `api-and-migrations.md` and `definition-of-done.md`.
2. `server/crates/skt-server/src/http_api.rs`, the function `caller`, and
   `server/crates/skt-server/src/rate.rs`.
3. `deploy/nginx/api-proxy.conf`, the two lines that set `X-Real-IP` and `X-Forwarded-For`.

STATE

Claude's branch is `feature/claude-accounts`, worktree
`/Users/nvorberg/Documents/development/skt-claude-accounts`, cut from `dev` at `0a9fabd`:
- `873c058` the client and the mock (unchanged since 026).
- `49a2ed9` handover 026.
- `972e066` `design/web.pen`. The owner saved it in Pen, so the new screens are now on disk and
  committed. 93 top-level frames: the 76 of `dev`, and 17 new ones.
- This handover is the next commit.
Not pushed, not merged. Do not commit there and do not merge it.

The smoke ran against your `feature/grok-accounts` at `2cf2f9a` (code `72069a9`), started as 027
says: `docker stop skt-api`, then `cargo run -p skt-server` from `server/` with
`DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt`, and the page from Claude's worktree on
`http://localhost:5178` with `/api` proxied to `127.0.0.1:8080`. Nothing in your checkout was
edited.

Gate, from `web/` on `feature/claude-accounts`, re-run after the smoke:
- `npx vp check`: clean. 81 files formatted, 74 with no lint or type errors.
- `npx vp test`: 25 files, 330 tests passed.
`web/` was not changed, so `npx vp build` and `npm run fixtures:check` are as in 026.

How the machine was left: Claude's `cargo run` and dev server are stopped. The `skt-api` container
is stopped (it was the image from before `72069a9`); `skt-postgres` and `skt-web` are up. Postgres
now holds one account, `smoke_2qpk1v`, and four guests from the smoke. Nothing was deleted.

WHAT WAS CLICKED, AND WHAT CAME BACK

Every line matched the mock and `docs/protocol.md` on your branch.
1. Home, "Play online". `GET /me` was 401 before, then `POST /auth/guest` 200 and the hub said
   "Playing as a guest", "Connected". `GET /config` gave the standard ruleset the queue screen shows.
2. "Profile", "Create an account". The button is disabled while the password is empty, so the page
   never sends one. Sent by hand from the page's console: an empty password is 400 `WEAK_PASSWORD`
   with `Enter a password.`; the username `a b` is 400 `USERNAME_INVALID`.
3. Username and the password twice, "Create account". 200. `user` and `stats` were identical to
   the guest's, byte for byte, `guest` false, `username` set. The profile said `@smoke_2qpk1v`. A second register from that session: 409 `ALREADY_REGISTERED`.
4. "Sign out". 204, the page went to the home screen, `GET /me` 401, a second logout 401
   `UNAUTHENTICATED`.
5. "Play online" again: a new guest with another id. That guest asking for the taken username in
   upper case: 409 `USERNAME_TAKEN`.
6. "Profile", "Sign in" with a wrong password: 401, the screen said "Wrong username or password.",
   and the session was still the guest. With the right password and the username in upper case:
   200, the hub said "Playing as @smoke_2qpk1v", connected, the same user id as the account.
7. A second player (a script with its own guest and a bare socket) created a public lobby.
   `GET /lobbies` listed it with `hostName`, `players: 1` and its settings. "Browse tables" showed
   that row, "Join" seated the page by `lobbyId`, the lobby screen said "Public" with both members.
   Tapping the host opened `GET /users/{id}`: `user`, `stats`, `rating` and nothing else.
   "Leave table" went back to the list.
8. "Create a public table" from the list: the lobby said "Public", and `GET /lobbies` had both
   tables, oldest first. After "Leave table" it had one.
9. "Profile": a new display name with spaces around it and the colour Pink, "Save". 200, the name
   trimmed, "Saved." By hand: `{ color: '#000000' }` and a 17-character name are 400 `VALIDATION`.
10. "Find a game": `ok` with the queue, the screen said "1 of 4 found", `Me.active` was
    `{ kind: 'queue', id: 'casual' }`. "Leave the queue": back at the hub, `active` null.
11. "Find a game" again, then the second player joined the queue. The page showed "1 of 4 found",
    then "2 of 4 found", then the table. The second player's `ok` carried `found: 2`, it was sent
    no `queue.status`, and both got `game.start` with `mode: 'casual'`, `lobbyId: null`, the two
    humans first and two bots after them, then `game.update` with `rev` 0 and no events.
12. At the table, the leave sheet and "Leave table": back at the hub, `active` null, stats still 0.

Not smoked, and why:
- Stats after a finished game on the profile screen. A casual game is five rounds on the standard
  clocks, and both tables were left after the deal. Your integration test and the mock test cover it.
- The 1008 close on logout. The page gives up its own socket, so it never sees that close.
- `PATCH /me` reaching a lobby, a queue place kept across a reconnect, and a guest asking for ranked.

FRAMES THAT DISAGREED

With the 17 holes: none. The client and the mock were not changed.

With 027's "Register is limited to 5 calls a minute, and login to 10, for one address":
A. Without `X-Forwarded-For` the limit never fires. `caller` returns `peer.to_string()`, and a
   `SocketAddr` prints as address and port, so every new TCP connection is a new key. Measured:
   13 wrong logins from `curl` to `127.0.0.1:8080` inside one second were all 401. The page through
   the dev proxy did the same 12 times. With `X-Forwarded-For: 203.0.113.9` on every call the 11th
   was 429 with `retry-after: 55` and `{"error":{"code":"RATE_LIMITED","message":"Too many
   requests."}}`, which is what 027 describes and what the client has copy for.
B. With `X-Forwarded-For` the key is the first value, and the client chooses it. A call with
   `X-Forwarded-For: 203.0.113.77` got a fresh budget while `203.0.113.9` was limited. Behind
   `deploy/nginx/api-proxy.conf` the header is `$proxy_add_x_forwarded_for`, which keeps what the
   client sent and appends the real address, so the first value is still the client's. That part
   was read from the config, not measured through nginx. A client that sends a new value each time
   would never be limited on login or register.

YOUR TASK

On `feature/grok-accounts`:
1. Key the limiter on the address without the port when no proxy header is used (`peer.ip()`).
2. Take the client address from something the client cannot set. `X-Real-IP` is `$remote_addr` in
   `api-proxy.conf`; the last value of `X-Forwarded-For` is the hop nginx saw. Decide which, and
   decide what happens when the Nginx Proxy Manager of `docker-compose.npm.yml` sits in front of
   `skt-web`, where the nearest hop is another proxy. Trust a forwarded header only when the TCP
   peer is that proxy.
3. Tests: 11 logins from one address on separate connections end in 429; a different
   `X-Forwarded-For` on each call does not reset the budget; two different real addresses do not
   share one.
4. If the rule a player can run into changes, say so in your handover. The client shows "Too fast.
   Wait a moment and try again." for `RATE_LIMITED` and does not read `Retry-After`.

CONTRACTS

- Frozen for you: `web/` except `web/src/protocol/generated/`, `design/`, `fixtures/engine/`.
- Yours: `server/`, Compose, deploy files, `.github/`.
- `docs/protocol.md`: no message, field or error code changes with this. Protocol stays 1.
- The mock has no REST rate limit and gets none.

DONE WHEN

From `server/`: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` and
`cargo test --workspace` pass with the new tests, and by hand:
`for i in $(seq 1 11); do curl -s -o /dev/null -w '%{http_code} ' -X POST -H 'Origin: http://localhost:5173' -H 'Content-Type: application/json' -d '{"username":"nobody","password":"x"}' http://127.0.0.1:8080/api/v1/auth/login; done`
prints ten times 401 and then 429.

REPORT BACK

Write `docs/handover/029-grok-to-claude-<slug>.md` and print the same text in one fenced code
block. It must be a paste-ready prompt for Claude ("You are Claude"), with who and where, state, a
numbered task, contracts, done when, and report back. Include your branch and commit, the gate
counts, which header the server now trusts and from whom, and whether anything a player sees
changed. If nothing is left for Claude to build, say that the Phase 2 branches are ready for the
owner to merge, and in which order.
