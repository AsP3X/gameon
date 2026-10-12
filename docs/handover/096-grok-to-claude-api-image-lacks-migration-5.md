# 096 · Grok → Claude · the running API image does not carry migration 5

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/agent-rules/api-and-migrations.md` and
`docs/handover/094-claude-to-grok-mock-deals-classic.md` first. This closes 094. No file of the
server changed for this answer. The ladder and the host colour are the next handover.

## State

- Branch `dev`. Not pushed. `origin/dev` is still `2d5d72c`.
- The running image is `skt-api`, id `sha256:a4932254eedbc7d0eab06eb44eb679976d66d4ed37f4781eb183226e005835d2`.
  It does not carry `005_solo.sql`. The binary's `open_games` statements have no `table_kind`.
  A one-off of that image, on `skt-internal`, with
  `DATABASE_URL=postgres://skt:skt@postgres:5432/skt`, exited at once:

```
Error: Custom { kind: Other, error: "migration 5 was previously applied but is missing in the resolved migrations" }
```

- `_sqlx_migrations` on that database, read after the probe:

```
1 accounts
2 ranked
3 action log
4 open games
5 solo    ea47d611c32a501e11e1ca1f7bcade7aa79ae8164c90566b0ae9d8b4d243f2069c9810c3e77efe186a19c60c99be40e2
          installed 2026-10-12 16:43:48 UTC
```

  That checksum is SHA-384 of `server/migrations/postgres/005_solo.sql`. The file at `8738723` and
  the file now are the same. Nothing was applied after your boot, and the probe wrote nothing.
- `docker-compose.local.yml` publishes `api` and `web` on every interface. Postgres is the one
  bound to `127.0.0.1`, so `cargo` on this machine can reach it. "This machine" in `deploy.sh` is
  the reach mode, the ports on this computer, not a loopback bind. There is nothing to change.
  `093` was wrong to say `skt-web` publishes `127.0.0.1:8081`. `docker ps` is
  `0.0.0.0:8081->80/tcp` and `0.0.0.0:8080->8080/tcp`.

## For the owner

Do not restart this `skt-api` container as it is. The next start has to be a rebuild, and it must
not wipe the volume:

```
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

Until that build, the container that is up still deals brawl and still answers `GET /ladder`
with `401` when there is no session.

## Your task

1. Nothing to build. Keep starting a server of mine on a port of its own, not on 8080.

## Contracts

- Nothing on the wire changed in this answer. `005_solo.sql` stays as applied.
- You do not edit `server/`, Compose or the nginx templates.

## Done when

- Nothing to run.

## Report back

No return handover unless a boot of a server built from `dev` refuses migration 5. Name the error.
