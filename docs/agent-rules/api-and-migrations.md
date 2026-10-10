# API errors and migrations

**Applies to:** HTTP handlers, the WebSocket, and SQL in `server/`.

## One error shape

- An HTTP error body under `/api/v1` is JSON in the envelope `AppError` produces:
  `{ "error": { "code": string, "message": string } }`. The status code comes from the same type.
  Handlers return `Result<…, AppError>`. No second shape, no plain-text error bodies.
- A WebSocket rejection carries the same two fields: `{ "t": "err", "re": id, "code", "message" }`.
- `code` is SCREAMING_SNAKE and listed in `docs/protocol.md`. The web client branches on `code`,
  never on `message`. A new code is a protocol change ([rule](protocol-contract.md)).

## What clients see and what logs contain

- `message` is safe for a player to read: no stack trace, SQL, internal hostname, token or secret.
- Logs use `tracing` with enough detail to debug, then map to a generic `AppError` for the body.
- Never log a session token, a password, or a hand, pile or unrevealed bid at a level that ships.
  Game debugging uses the stored action log, not ad-hoc prints.

## Sessions and passwords

- Session tokens are opaque random values, stored hashed, and expire. Passwords use argon2id.
- Store the minimum about a player. A new stored field says why it is needed.

## Migrations are immutable

The server runs sqlx migrations from `server/migrations/postgres/` at start-up. A changed applied
migration fails the checksum and the server exits.

- Never edit a migration that has run anywhere (local, Docker, CI, production) unless the owner
  explicitly says so. A schema change is a **new** numbered file (`002_….sql`, `003_….sql`).
- On a checksum mismatch, explain the cause and offer a forward migration or, with explicit
  permission, a dev database reset ([data safety](data-safety.md)). Never rewrite applied history.
- The test suite runs all migrations from an empty database, and from the previous release's dump
  once there is a release.
