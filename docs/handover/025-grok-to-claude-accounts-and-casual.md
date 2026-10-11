You are Claude, the web engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the web client and the design
file. Grok writes the Rust server, Compose, deploy files and CI, and never edits `web/` except the
generated protocol tree. You and Grok cannot see each other's sessions: the owner pastes handover
prompts between you. This is handover 025. It is the Phase 2 client package: accounts, the public
lobby list, and casual quick play. Ranked is not this package.

READ FIRST, IN THIS ORDER
1. `AGENTS.md`, then `docs/agent-rules/ownership-and-handover.md`, `git.md`,
   `design-sync.md`, `web-quality.md`, `server-authority.md` and `definition-of-done.md`.
2. `docs/protocol.md` §2, §3, §4 and §5.3–§5.4 on `dev`. The username, display name and colour
   rules are the paragraph under the type block in §4. The error codes you show are in §3.
3. `docs/multiplayer-plan.md` §3 "Identity" and "Ways to play", and §5 Phase 2 rows C9, C10 and C11.
   C12, the ranked queue, is not this package.

STATE

`dev` is `0a9fabd` (`0a9fabda6fd5f3f537c733a2df08dc6f6822b80d`). Cut your branch from that.
Grok's checkout is `/Users/nvorberg/Documents/development/SkullKingTavern` on
`feature/grok-phase1-server` at `6d9f84d`
(`6d9f84da4bfd3c16148c2d604ad09b9cd0d5e921`). This handover is the next commit on that branch.
Do not commit there, do not merge it, and do not start a server from it as part of this package.

These client branches are finished and are not on `dev`. Do not merge them, do not rebase onto
them, and do not copy files out of their worktrees:

- `feature/claude-four-players` at `4d9c37e`, worktree
  `/Users/nvorberg/Documents/development/skt-claude-online`. Online table chrome and the
  four-browser script.
- `feature/claude-menu-music` at `4c1f377`, worktree
  `/Users/nvorberg/Documents/development/skt-claude-sound`. The home-screen tune.

On `dev` you already have the guest session, the socket, the mock, the private lobby screens
(`web/src/online/`), and generated types for `Credentials`, `Me`, `Profile`, `ProfilePatch`,
`LobbySummary` and `queue.join`. Use those types. Do not hand-edit
`web/src/protocol/generated/`.

The Rust server does not implement this package. `POST /api/v1/auth/register`,
`POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `PATCH /api/v1/me`, `GET /api/v1/users/{id}`
and `GET /api/v1/lobbies` are not routes. `queue.join` and `queue.leave` answer `INTERNAL`.
Build against the mock in `web/src/net/mock/`. A missing route on the Rust server is not a bug
for you to work around and not a reason to stop.

`docs/protocol.md`: None. No message, field or error code changes. Protocol stays 1.

YOUR TASK

Work in your own worktree, on `feature/claude-accounts`, cut from `dev`. One branch for the whole
package. Design each new screen in `design/web.pen` first, through the Pencil tools only, then
build it. Same copy in the file and in the client. Empty, loading, error and disconnected states
are part of the screen. Tokens from `web/src/styles/tokens.css` only.

1. Accounts (C9). Keep the one-tap guest (`POST /api/v1/auth/guest`). Add register, login, logout
   and the profile.
   - `POST /api/v1/auth/register` with `{ username, password }` upgrades the guest in place. The
     cookie stays the session. `Me.guest` becomes false, `Me.username` is set, and `Me.user.id`
     does not change. `ALREADY_REGISTERED` if that session is already an account.
   - `POST /api/v1/auth/login` is public. It replaces the session. The mock returns that account's
     `Me` and sets a new cookie. `INVALID_CREDENTIALS` when the username or password does not match.
   - `POST /api/v1/auth/logout` returns 204 and clears the cookie. The next request has no session
     until the player becomes a guest again or logs in.
   - `PATCH /api/v1/me` with `ProfilePatch`. Omitted fields stay as they are. `name` is the display
     name: 1–16 characters after trim, no control characters. `color` is one of the eight
     `TableColor` values in §4. Offer those eight and no others.
   - Username: 3–16 characters of `A–Z a–z 0–9 _`, unique ignoring case. The protocol mentions a
     reserved list and does not name it. Do not invent one. The mock returns `USERNAME_INVALID`
     for a bad shape and `USERNAME_TAKEN` for a duplicate. The client may check the shape before
     sending. The code on the error is what the screen branches on. Do not parse `message`.
   - Password: §3 has `WEAK_PASSWORD` and does not define the rule. Do not invent a strength
     rule, a length, or a reserved-password list. The mock accepts any non-empty password. The
     sign-up screen says a forgotten password cannot be recovered. There is no email field.
   - The page never reads `skt_session`. Do not put the token or the password in `localStorage`,
     a URL, or a log.
   - `GET /api/v1/users/{id}` returns `Profile`. The profile shows the display name, the colour
     and `stats`. `rating` stays null. Ranked tiers are not this package.

2. Public lobbies and casual quick play (C10). The private lobby you have stays as it is.
   - `GET /api/v1/lobbies` returns `{ lobbies: LobbySummary[] }`: open public lobbies only.
     `LobbySummary` is `{ id, hostName, settings, players }`.
   - `lobby.create` with `visibility: 'public'` puts the lobby on that list. `visibility: 'private'`
     does not.
   - Joining from the list sends `lobby.join` with `{ lobbyId }`. If both `code` and `lobbyId` are
     present, `code` wins, which is already the rule.
   - `queue.join` with `{ mode: 'casual' }` answers `ok` and includes `queue`. Further changes
     arrive as `{ t: 'queue.status', queue }`. `queue.leave` answers `ok`. Show `found` and
     `needed` from that status. The protocol does not say how long the queue waits before it
     fills with bots. Do not print a duration. In tests the mock may form the table promptly,
     fill empty seats with bots, and then send `game.start`. There is no accept step.
   - Do not build a ranked queue screen. `queue.join` with `{ mode: 'ranked' }` from a guest
     answers `ACCOUNT_REQUIRED`. A registered player's ranked queue is Phase 3.
   - `ALREADY_SEATED` when the player is already in a lobby, a queue, or a game.

3. Stats after a game (C11). Do not rebuild the table, the deadline ring, or the four-browser
   script. Those are on `feature/claude-four-players`, which you are not merging.
   - The signed-in profile reads `Me.stats`: `games`, `wins`, `bidsMade`, `bidsTotal`, `bestScore`.
     After a game the mock counts that game. A win is place 1 from `game.over.result.places`.
     If you do not already have a bid total in the mock, leave `bidsMade` and `bidsTotal` at 0
     and say so. `bestScore` may stay null. Say which you did.
   - Rematch is the lobby returning to `open` with the same members and nobody ready (§5.3).
     Do not add a second rematch message.
   - Another player's profile is `GET /api/v1/users/{id}`, not a guess from the last table.

4. Tests. Extend `web/src/net/mock/` and the tests next to the screens. Cover: guest upgrade keeps
   the user id, a taken username, a bad login, logout, a profile colour outside the eight is not
   offered, the public list omits private lobbies, a casual queue reaches `game.start`, a guest
   asking for ranked gets `ACCOUNT_REQUIRED`, and `ALREADY_SEATED` while a queue or lobby is open.
   Do not aim these tests at `127.0.0.1:8080`.

CONTRACTS

- Frozen: `docs/protocol.md`, `server/`, `web/src/protocol/generated/`, `fixtures/engine/`,
  `fixtures/protocol/`, Compose, deploy files, `.github/`. Protocol stays 1.
- You may change: `web/` except the generated tree, and `design/web.pen` through Pencil only.
- You may not change: `server/`, the generated protocol files, `legacy/`, or another agent's
  worktree.
- `ServerConfig.emotes` stays empty. Do not invent emote ids.
- The Rust server's `INTERNAL` on `queue.join` is expected. Do not treat it as a client bug.

DONE WHEN

From `web/` on your branch, Node as you have it:

- `npx vp check` is clean.
- `npx vp test` passes, including the new account, lobby-list and queue tests, and the private
  lobby, solo and pass-and-play tests that already passed on `dev`.
- `npx vp build` succeeds.
- `npm run fixtures:check` still reports 41 games.
- Each new screen is in `design/web.pen`. If Pen has not been saved, say that plainly. Do not
  commit a `.pen` diff that contains edits from another session.

REPORT BACK

Write `docs/handover/026-claude-to-grok-accounts-and-casual.md` and print the same text in one
fenced code block. It must be a paste-ready prompt for Grok ("You are Grok"), with who and where,
state, a numbered task, contracts, done when, and report back. Include the branch, the commit,
and the gate counts. Describe the mock's register, login, logout, profile patch, `GET /lobbies`
and casual `queue.join` precisely enough that Grok can implement G8 and G9 without guessing:
status codes, which fields of `Me` change, and when `ALREADY_SEATED` is returned. Name any
protocol hole. Say whether the end-of-game screen changed.
