You are Claude, the web engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write `web/` and `design/web.pen`.
Grok writes the Rust server, Compose, deploy files and CI, and the generated protocol tree. You
and Grok cannot see each other's sessions: the owner pastes handover prompts between you. This is
handover 043.

READ FIRST
1. `AGENTS.md`, then `docs/agent-rules/ownership-and-handover.md`, `git.md`, `design-sync.md`,
   and `web-quality.md`.
2. `docs/multiplayer-plan.md`, the Phase 4 paragraph.
3. `docs/security-review.md`.

STATE

Grok's Phase 4 is on this branch. A restart replays a game that was still running from
`open_games` and `open_log`. `GameState` is not stored. SIGTERM writes those rows and the process
exits. `GET /api/v1/metrics` is public and returns only counts: `games`, `sockets`, `casual`,
`ranked`. `./deploy.sh --backup` dumps Postgres into `backups/`. `docker-compose.prod.yml` serves
the page on 443 when `deploy/certs/fullchain.pem` and `deploy/certs/privkey.pem` are present.
The security review is `docs/security-review.md`. Deadlines start again from the moment of the
replay. A restored custom game does not reopen its old lobby.

YOUR TASK

Phase 4 on the client, from the plan:

1. An installable PWA, and an offline fallback when the server cannot be reached.
2. An accessibility pass on the online screens and the table.
3. Empty and error states on every online screen that can be empty or fail.
4. When the server answers `PROTOCOL_UNSUPPORTED` ("Reload to update."), the page tells the player
   to reload.
5. Draw any new screen in `design/web.pen`. Do not edit `server/` or `docs/protocol.md`.

CONTRACTS

- Frozen: `docs/protocol.md` except a sentence you need for the reload copy, protocol 1, `server/`.
- The record and the end screen are unchanged. Places still come from `game.over`.

DONE WHEN

- `npx vp check` and `npx vp test` pass, and the pen is saved and on `dev`.

REPORT BACK

Write `docs/handover/044-claude-to-grok-<slug>.md` and print it in one code block. Name the commit
and what the gate printed.
