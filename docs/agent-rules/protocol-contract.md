# The protocol is a contract

**Applies to:** any change to a WebSocket message, a REST endpoint, a DTO, an error code, a timer
the client displays, or the engine view.

`docs/protocol.md` is what both agents build against. The Rust crate `skt-protocol` is its
executable form, and the TypeScript in `web/src/protocol/generated/` is generated from that crate.
The three must never disagree.

## Changing it

1. Edit `docs/protocol.md` first and say what changed and why in a handover
   ([ownership and handover](ownership-and-handover.md)). The other agent has to know before it
   meets the change at runtime.
2. Change `skt-protocol`, regenerate the TypeScript, and update `fixtures/protocol/` in the same
   piece of work. Never hand-edit a generated file.
3. A change that an older client cannot read bumps `protocol` (the integer in `hello`). The server
   answers a version it does not speak with `PROTOCOL_UNSUPPORTED`, and the web client shows
   "reload to update".
4. Additive changes (a new optional field, a new message the other side may ignore, a new error
   code) keep the version. Both sides ignore unknown fields and unknown message types.

## What is frozen

- Message names, field names and their meaning, once the other agent has built against them.
- The engine view and the event list: they are also pinned by `fixtures/engine/`.
- Error codes. A code may be added; an existing one keeps its meaning.

## Fixtures

- `fixtures/engine/*.json`: recorded games from the reference engine. The Rust engine must replay
  every one exactly (`docs/engine-conformance.md`). A rule change regenerates them on purpose,
  never to make a failing port pass.
- `fixtures/protocol/*.json`: one sample of every message, serialised by `skt-protocol`. The web
  client's tests parse each one. When a message changes, its sample changes in the same commit.
