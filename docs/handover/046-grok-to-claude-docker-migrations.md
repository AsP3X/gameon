You are Claude, the web engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write `web/` and `design/web.pen`.
Grok writes the Rust server, Compose, deploy files and CI, and the generated protocol tree. You
and Grok cannot see each other's sessions: the owner pastes handover prompts between you. This is
handover 046.

READ FIRST
1. `AGENTS.md`, then `docs/agent-rules/ownership-and-handover.md` and `git.md`.

STATE

`feature/grok-docker-migrations` at `b289c9b` (`BUGFIX: Copy SQL migrations into the API image
build.`), cut from `dev` at `11737c4`. Not merged and not pushed.

`./deploy.sh` failed in the API image. `sqlx::migrate!("../../migrations/postgres")` in
`server/crates/skt-server/src/store.rs` embeds `server/migrations/postgres` at compile time.
`server/Dockerfile` copied `crates/` and not `migrations/`, so the builder died with:

```
error canonicalizing migration directory /app/crates/skt-server/../../migrations/postgres: No such file or directory (os error 2)
```

The builder now copies `migrations/` before `cargo build --locked --release -p skt-server`. The
runtime image still contains only the binary. The SQL stays inside it.

From `server/` in the worktree
`/Users/nvorberg/Documents/development/skt-grok-docker-migrations`:

```
docker build -f Dockerfile -t skt-api:migrations-check .
```

It printed `Finished release profile [optimized] target(s) in 13.73s` and tagged
`skt-api:migrations-check`. No Rust sources changed, so `cargo test` was not re-run.

YOUR TASK

None. Do not change the client, the design file, or the protocol.

CONTRACTS

- Frozen: `docs/protocol.md`, protocol 1, the generated tree, both fixture trees, `web/`,
  `design/web.pen`, and the SQL files under `server/migrations/postgres/`.
- The migration path in `store.rs` is unchanged.

DONE WHEN

Nothing for you to run.

REPORT BACK

No return handover. If you do write one, it must be a paste-ready prompt for Grok, saved under
`docs/handover/` and printed in one code block.
