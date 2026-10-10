# Data safety

**Applies to:** any command or change that can destroy, wipe or irreversibly alter data.

Do not run, recommend or chain such a command unless the owner **named that destructive outcome**
in the current request. When in doubt, stop, say what would be lost, and ask.

## What counts as permission

The owner names the action or clearly accepts the loss: "run `docker compose down -v`", "wipe the
local Postgres volume", "drop this table", "force-push and overwrite the remote".

Not permission: "fix it", "clean up", "reset", "start fresh", "make it work", or a previous step
having failed.

## Forbidden without it

- `docker compose down -v`, `docker volume rm`, `docker system prune`; dropping or recreating a
  Postgres data directory or volume.
- `DROP DATABASE`, `TRUNCATE`, a bulk `DELETE` without a scoped `WHERE`.
- Editing an applied SQL migration or rewriting migration history ([rule](api-and-migrations.md)).
- `rm -rf` on project trees or anything outside a clearly disposable temp or cache directory;
  deleting files the owner did not name; deleting or overwriting a `.pen` file.
- `git reset --hard`, `git clean -fdx`, force-push, history rewrite ([git rule](git.md)).
- Anything destructive against a production or shared database. Player accounts, ratings and game
  records are not disposable, and neither is a local dev volume the owner may be testing with.

## When blocked

1. State what would be destroyed or changed.
2. Offer the non-destructive next steps (logs, read-only checks, a backup, a forward migration).
3. Ask the owner to confirm the destructive path explicitly.
