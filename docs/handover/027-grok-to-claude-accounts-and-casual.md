You are Claude, the web engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the web client and the design
file. Grok writes the Rust server, Compose, deploy files and CI. You and Grok cannot see each
other's sessions: the owner pastes handover prompts between you. This is handover 027, the answer
to your 026. The server now speaks the accounts, public list, and casual queue your mock speaks.
Nothing in the mock or the client has to change for the 17 holes. Your task is the browser smoke
against this server.

READ FIRST, IN THIS ORDER
1. `AGENTS.md`, then `docs/agent-rules/ownership-and-handover.md`, `git.md`, `web-quality.md` and
   `definition-of-done.md`.
2. `docs/protocol.md` §2, §4 and §5.4 on this branch. The decisions below are written there.
3. Your own `web/src/net/mock/accounts.test.ts` only if a smoke frame disagrees with it.

STATE

Branch `feature/grok-accounts`, cut from `feature/grok-phase1-server` (`461f5b0`), which already
contains `dev` (`0a9fabd`). It was not cut from bare `dev`: that commit has no Phase 1 server.
The code is `72069a9` (`72069a98f51ae6c52f052a42193e9c8a7bbd3ddf`). This handover is the next
commit on that branch. Worktree `/Users/nvorberg/Documents/development/SkullKingTavern`. Not
pushed, not merged. Do not commit here and do not merge it.

Your branch `feature/claude-accounts` at `873c058`, worktree
`/Users/nvorberg/Documents/development/skt-claude-accounts`, was not modified.

Gate, from `server/`, with `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt`:
- `cargo fmt --check` passed.
- `cargo clippy --all-targets -- -D warnings` passed.
- `cargo test --workspace`: skt-engine 23 passed, conformance 1 passed (41 fixtures), skt-protocol
  3 passed, skt-server 12 passed. The protocol regeneration test was clean, so
  `web/src/protocol/generated/` did not change. `protocol` stays 1.

`npx vp test` on your branch was not re-run. The generated tree is unchanged.

Not done: ranked queue, ratings, the action log, and restoring a game after a restart. Games are
still in memory. Accounts, sessions and stats are in Postgres.

THE 17 HOLES

All seventeen match the mock. Each one is now prose in `docs/protocol.md`. No message, field or
error code was added.

1. No reserved username list. §4.
2. `WEAK_PASSWORD` only for an empty password. The message is exactly `Enter a password.` §4.
3. Logout, and a login that replaces a different session, closes that socket with 1008, leaves an
   open lobby, leaves the queue, and keeps a game seat as a drop. Login as the same account does
   not close the socket. Register does not close it. §2.
4. A queued table has no lobby. `lobbyId` is null on `game.start` and `game.over`. §5.4.
5. A casual queue's `Active.id` is `casual`. §4.
6. `queue.leave` when not queued is `ok`. §5.4.
7. A dropped socket keeps the queue place, with no time limit. §5.4.
8. Bots fill the casual queue after 6000 ms from the moment it became non-empty. §5.4.
9. `queue.status` is not sent to the joiner, and none is sent when the table forms. §5.4.
10. A seated guest who asks for ranked gets `ACCOUNT_REQUIRED`, not `ALREADY_SEATED`. §5.4.
11. `GET /lobbies` includes full lobbies, oldest first, with no limit. §4.
12. `lobby.join` by id may enter a private lobby. §5.3.
13. `PATCH /me` sends `lobby.state` to the lobby the user sits in. A running game keeps its
    starting names. §4.
14. A display name is 1–16 code points after trim. Category `Cc` is `VALIDATION`. §4.
15. Every finished custom or casual game counts. A shared first place is a win for each. A
    `game.leave` seat is not counted. §4.
16. `POST /auth/logout` with no session is 401 `UNAUTHENTICATED`. §4.
17. A seated guest may register. The seat is not touched. §4.

WHERE THE SERVER IS NOT THE MOCK

- Passwords are argon2id. Session tokens are stored as SHA-256. Neither is the mock's plain copy.
- Register is limited to 5 calls a minute, and login to 10, for one address. The address is the
  first value of `X-Forwarded-For`, or the TCP peer when that header is absent. `Retry-After` is
  the seconds left in that minute, at least 1. The body is `RATE_LIMITED` with message
  `Too many requests.`
- `ranked` from an account is `INTERNAL`, as in the mock. There is no ranked queue.

YOUR TASK

Run the browser smoke from `feature/claude-accounts` against this server. Do not change the mock
unless a frame disagrees with the list above.

1. Stop the old `skt-api` container if it is still the previous image (`docker stop skt-api`).
   Do not use `docker compose down -v`. Postgres may stay up.
2. From `server/` in `/Users/nvorberg/Documents/development/SkullKingTavern`:
   `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt cargo run -p skt-server`
   It listens on `127.0.0.1:8080`. Postgres is `postgres://skt:skt@127.0.0.1:5432/skt` from
   `./deploy.sh` on this branch. If that port is closed, start only postgres:
   `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --no-deps postgres`
3. From your worktree's `web/`, `npm run dev`. The page proxies `/api` to `127.0.0.1:8080`.
4. In the browser: create an account from a guest, sign out, sign in, open the public list, and
   start quick play. A forgotten password cannot be recovered, and an empty password is refused
   with `Enter a password.`
5. If a frame disagrees with the holes above, change your client or mock to match the server and
   say which frame. If nothing disagrees, say so. Do not invent a difference to have a patch.

CONTRACTS

- Frozen: `server/`, `docs/protocol.md`, `web/src/protocol/generated/`, `fixtures/`. Protocol
  stays 1.
- You may change: `web/` except the generated tree, and `design/web.pen` through Pencil, only
  where the smoke shows a real disagreement.
- `ServerConfig.emotes` stays empty.

DONE WHEN

- The smoke in step 4 has been exercised, and you have named every frame that disagreed, or
  written that there were none.
- If you changed `web/`: `npx vp check` and `npx vp test` pass.
- The `.pen` file is still the owner's save, as in your 026, unless a smoke fix changes a screen.

REPORT BACK

Write `docs/handover/028-claude-to-grok-accounts-smoke.md` and print the same text in one fenced
code block. It must be a paste-ready prompt for Grok ("You are Grok"). Include the branch, the
commit, what you clicked, and any frame that disagreed.
