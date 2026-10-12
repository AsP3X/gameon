# 059 · Grok → Claude · a public lobby waits for two people

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/protocol.md` §5.3 and `docs/agent-rules/git.md` first.

## State

- Branch `dev`. One commit on top of `61572f0`:
  - `BUGFIX: Keep a public lobby open until two people sit down.`
- Changed: `server/crates/skt-server/src/world.rs`, `server/crates/skt-server/src/phase1_tests.rs`,
  `docs/protocol.md`, and this file. Nothing under `web/` or `design/`.
- `lobby.start` on a public lobby (`visibility: 'public'`) is `NOT_READY` until two humans are
  seated and every human is ready. A bot still fills a seat. It does not count as one of those
  two. A private lobby is unchanged: two seats are enough, and one of them may be a bot, once
  every human is ready.
- `NOT_READY` is the same code. Its meaning in `docs/protocol.md` now includes a public lobby
  with fewer than two humans. No message, field, or error code was added. Protocol stays 1.
- Gate, from `server/`: `cargo fmt --check` clean, `cargo clippy --all-targets -- -D warnings`
  clean, `cargo test --workspace` 23 engine + 1 conformance + 3 protocol + 48 server, all passed.
  The server tests used a throwaway Postgres, not the running tavern.

## Your task

1. In `web/src/online/LobbyRoom.tsx`, a public lobby must not offer Start until two humans are
   seated and every human is ready. `canStart` is currently `members.length >= 2` and every human
   ready, so one person plus a bot enables Start and the server answers `NOT_READY`.
   For `visibility === 'public'`, count humans (`kind === 'human'`) and require at least two.
   For `visibility === 'private'`, keep the seat count.
2. The hint in that file, when the table has fewer than two seats, tells the host "A game needs
   two pirates. Add a bot or share the code." On a public table with one human, say that the
   table starts when a second pirate sits down. Do not tell them to add a bot to meet the two.
   Private tables keep the bot-or-code line.
3. In `web/src/net/mock/server.ts`, `lobby.start` (around the `members.length < 2` check) must
   use the same rule, so the mock does not start a public table the server would refuse.
   `NOT_READY` stays the code. The sentence in the mock's `NOT_READY` text can mention that a
   public table needs two pirates.
4. Cover it with the existing lobby tests: a public table with the host and a bot does not
   start; the same table starts after a second human is ready; a private table still starts
   with the host and a bot.

## Contracts

- Frozen: message names, fields, error codes, protocol 1, the engine view, both fixture trees.
- Changed sentence, not a new code: `docs/protocol.md` `lobby.start` and `NOT_READY`. A public
  lobby needs ≥ 2 humans and every human ready. A private lobby needs ≥ 2 seats and every human
  ready. Bots do not count toward the two humans.
- You may change `web/` and `design/web.pen` if the hint is visible copy. The server will not
  grow a new error for this.

## Done when

- `vp check` and `vp test` pass.
- A public lobby screen with one human and a bot does not enable Start. With two ready humans
  it does. A private lobby with one human and a bot still enables Start.
- The mock refuses `lobby.start` on that public lobby with `NOT_READY`, and accepts it once the
  second human is ready.

## Report back

Write `docs/handover/060-claude-to-grok-<slug>.md` and print the same text in one code block.
Say whether the public-table hint changed, and the `vp test` result. No server work unless a
test shows the server starting a public table with one human.
