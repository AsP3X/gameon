# 089 · Grok → Claude · the protocol words are locked

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/handover/075-grok-to-claude-platform-plan.md` and `docs/protocol.md`
from the type block in §4 through the new paragraphs at the end of §5.6. This is Package 0.
The owner said build. I did not edit `web/` outside `web/src/protocol/generated/`, and I did
not edit a `.pen` file.

## State

- Branch `dev`. The lock is commit `7b6b8b5` ("TASK: Lock solo, table kind and the game record into protocol 1.").
- Protocol stays 1. Every addition is optional, a new message, or a new error code.
- `cargo fmt --check` was clean. `cargo clippy --all-targets -- -D warnings` was clean.
- `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt cargo test --workspace`: engine 23 passed, conformance 1 passed, protocol 3 passed, server 53 passed.
- From `web/`, `npm run check`: 110 files formatted, 100 files with no warnings, lint, or type errors. I did not run `npm run test`. The two menu-music failures from 088 are still yours.

## What you can import

From `web/src/protocol/generated/`:

- `TableKind`: `"solo" | "friends" | "public" | "casual" | "ranked"`.
- `GameStart.table?`. Absent means read `mode`, as today. Solo, friends and public keep `mode: "custom"`.
- `Active` for a game may add `table?`, `round?`, `rounds?`, `bots?`. A lobby and a queue are unchanged.
- `Stats.byMode?`. When it is present it is `{ solo, friends, public, casual, ranked }`, each a `ModeLine` with the same five fields as `Stats`. Omitted means every line is empty.
- `ClientMessage` gains `solo.start` with `{ id, settings }` and `lobby.create` gains `allowBots?`. Omitted means true.
- `Lobby.allowBots?` and `LobbySummary.allowBots?`. Omitted means true.
- `ErrorCode` gains `"BOTS_DISABLED"`. The message is `This table does not seat bots.`
- `FinishedGame`, `FinishedSeat`, `GamePage` for `GET /api/v1/me/games`.

## Samples

- `fixtures/protocol/solo.start.json`
- `fixtures/protocol/game-start-solo.json`
- `fixtures/protocol/active-solo.json`
- `fixtures/protocol/stats-by-mode.json`
- `fixtures/protocol/lobby.create-no-bots.json`
- `fixtures/protocol/lobby-summary-no-bots.json`
- `fixtures/protocol/me-games.json`

The older samples are unchanged. `game.start` still has no `table`. `lobby.create` still has no `allowBots`.

## Not live yet

The words are in the doc and the types. These behaviours are later packages. Do not send them from the page yet.

- `solo.start` is parsed and gets no reply. A page that sends it waits until its own timeout. That is Package 1. W3 waits for that commit. W2 does not send it.
- `allowBots: false` is accepted on `lobby.create` and then dropped. The lobby still seats a bot. `BOTS_DISABLED` is not returned. That is Package 2.
- `game.start.table` is absent on every deal the server sends today. Package 1 sets `solo`. Package 2 sets the other four.
- `byMode` is omitted on every `Me` and `Profile` today. Package 3 stores the rows and sends the lines.
- `GET /api/v1/me/games` is not mounted. The path is the usual unknown-route 404. Package 3 mounts it.
- Cheat signals are not a player message. Package 4 writes them. There is nothing for you to parse.

## Your task

1. Nothing to build for Package 0. Do not paint a frame for it.
2. W0 and W1 may proceed. They do not wait on this commit.
3. Do not construct a required `byMode`, `table`, or `allowBots`. The current page typechecks without them.

## Contracts

- Protocol stays 1. `game.leave` on a table that is not solo is unchanged. Ranked and casual ignore `allowBots`.
- You do not edit `server/`. I do not edit your table code or a `.pen` file.

## Done when

There is nothing to run on your side for this package.

## Report back

No return handover unless a generated type does not match `docs/protocol.md`. If it does not, write `docs/handover/NNN-claude-to-grok-<slug>.md` and print it in one code block. Name the field.
