# Rust quality

**Applies to:** all crates in the `server/` workspace.

## Workspace conventions

Same as `../shroud/server`: edition 2024, stable toolchain pinned in `rust-toolchain.toml`,
versions in `[workspace.dependencies]`, and

```toml
[workspace.lints.rust]
unsafe_code = "forbid"

[workspace.lints.clippy]
all = { level = "warn", priority = -1 }
pedantic = { level = "warn", priority = -1 }
```

`skt-engine` has no I/O and no async: no `tokio`, no `sqlx`, no clock, no global RNG. Everything
it needs (the shuffle, bot randomness) is passed in.

## Error handling

- No `unwrap()`, `expect()`, `panic!`, `unreachable!`, indexing that can panic, or
  `unwrap_or_default()` that hides an error in non-test code. Return `Result` and propagate with `?`.
- Typed errors with `thiserror`; API errors flow through `AppError`
  ([API rule](api-and-migrations.md)). The engine returns a typed rejection for an illegal action;
  it never panics on player input.
- `expect()` is acceptable only for a start-up invariant that should crash loudly (missing required
  config at boot). In tests, `unwrap`/`expect` are fine.

## Lints and dead code

- No `#[allow(dead_code)]` and no broad `#[allow(...)]`. Use the value or remove the code. A new
  `cargo clippy -- -D warnings` failure is fixed, not silenced.
- Run `cargo fmt`; don't hand-format against rustfmt.

## Concurrency

- Never block the async runtime: no blocking I/O, `std::thread::sleep` or CPU-heavy loops on
  executor threads. Password hashing goes through `spawn_blocking`.
- One task owns one table. State is moved by messages, not shared behind a lock across `.await`.
  Document the lifetime of every task and channel that isn't obvious.

## Types

- Strong types over primitives: newtypes for `UserId`, `LobbyId`, `GameId`, `Seat`, `CardId`;
  enums for closed sets (phases, card kinds, error codes).
- Validate external input at the handler boundary into typed values before use.
- Public items in library crates have rustdoc.

## Inline documentation

Every non-trivial module, function and type gets a comment that says what it is for. Where the
behavior is not obvious, use the paired form above the code:

```rust
// Human: Reveals all bids in one update once the last seat has bid, so nobody can react to a bid.
// Agent: READS state.bids; WRITES round.bids, phase=Playing; RETURNS Event::BidsRevealed; never serialises a single hidden bid.
```

On the `Agent` line prefer `READS`, `WRITES`, `CALLS`, `RETURNS`, `HTTP`, `DB`, env vars and
failure modes. Anything that touches hidden information says where it is allowed to flow
([server authority](server-authority.md)). Keep comments true when the code changes.

## Before "done"

`cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` and `cargo test --workspace` pass
([definition of done](definition-of-done.md)).
