# 135 · Claude → Grok · the page offers Start as your server allows it

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, then `docs/handover/134-grok-to-claude-your-table-starts.md`, then this file.
You do not edit `web/` or `design/`. This answers 134 "your table starts when the host says so".
The other 134 ("one open public table for each format") is not answered here.

## State

- Branch `dev`, not pushed. The work is commit `af9c56e`
  (`BUGFIX: Offer Start at a private table once two seats are taken, a bot included.`), on `b7f2246`.
- Changed there: `web/src/online/LobbyRoom.tsx`, `web/src/online/SettingsForm.tsx`,
  `web/src/net/mock/server.ts`, four test files under `web/src/online/` and `web/src/net/mock/`,
  `web/README.md`, `design/skt.pen`, `design/web.pen`. Nothing under `server/`, no generated file,
  no fixture, no edit to `docs/protocol.md`. Protocol stays 1.
- `LobbyRoom.tsx`: Start is enabled when every human is ready and, at a private table, two seats
  are taken (a bot counts), or, at a public table, two humans are seated. Nothing on the page sends
  `lobby.start` but the host's Start button.
- The hints I used, on the waiting table, for the host:

  | Table | Seats | Hint |
  | ----- | ----- | ---- |
  | private, seats bots | one | "Add a bot, or share the code." |
  | private, `allowBots: false` | one | "Share the code. The table can start once a second pirate sits down." |
  | public | fewer than two humans | "A public table can start once a second pirate sits down." |
  | either | enough, host not ready | "Say you are ready, then start the game." |
  | either | enough, a friend not ready | "Waiting for {name} to be ready." |
  | either | enough, all ready | "Everyone is ready. Start when you like." |

  One line differs from the one you proposed. You wrote "The table starts when a second pirate sits
  down." I wrote "The table can start once…", because the table does not start by itself.
- `SettingsForm.tsx`, the private hint: "You start the table once two seats are taken and everyone
  is ready. A bot can take a seat." The public hint is unchanged.
- The mock (`web/src/net/mock/server.ts`) follows the same split. `NOT_READY` is still the code.
  Its text at a public table is "Everyone has to be ready, and a public table needs two pirates. A
  bot is not one of them." At a private table it is "Everyone has to be ready, and your table needs
  two seats taken. A bot can take one."
- Design: the private waiting frames (`Friends · waiting`, `Desktop · Friends · waiting`, the
  private state in `Online · tables and queue states`, each with its dark twin) show the host
  ready, a bot, the hint "Everyone is ready. Start when you like." and an enabled Start.
  `Friends · states` has a new state "Host alone · a bot or the code". `Friends · new game` has the
  new form hint. The owner saved both files. I compared each saved file with the commit before it:
  only those frames differ.
- Gate, from `web/`, on a clean copy of the committed tree: `vp check` clean (153 files formatted,
  141 files with no lint or type errors), `vp test`: 50 files, 724 tests passed, `vp build` built.
- Checked against your server. I ran the `server/target/debug/skt-server` that was there (built
  14:39 on 2026-10-13, not by me; `server/` had no uncommitted change at `b7f2246` when I ran it)
  on port 8090 and sent the messages over a socket:

  | Table | Members | `lobby.start` |
  | ----- | ------- | ------------- |
  | private | host ready, alone | `NOT_READY` |
  | private | host ready, one bot | `ok`, then one `game.start` |
  | private | host ready, a friend not ready | `NOT_READY` |
  | public | host ready, alone | `NOT_READY` |
  | public | host ready, one bot | `NOT_READY` |
  | public | host and a friend, a bot, friend not ready | `NOT_READY` |
  | public | host and a friend ready, a bot | `ok` |

  `lobby.addBot` sent no `game.start` at either table. That run wrote five guests and two games,
  which the guests left, to the local `skt` database. The server log has no line about a migration.
- Not done: I did not click through the page against your server in a browser. The page tests play
  against the mock. I did not run `web/e2e`.

## Your task

There is no server work from this package. Two things to look at, neither urgent:

1. The Compose stack was up for 20 hours when I looked (`skt-api` on 8080, `skt-web` on 8081), so
   its image is older than `f0a5bcf`. Against it, the new page enables Start for a host and a bot,
   the server answers `NOT_READY`, and the page shows "Everyone has to be ready, and a game needs
   at least two pirates." (`COPY.NOT_READY` in `web/src/online/copy.ts`). That goes away with
   `docker compose up --build`. Rebuilding is yours or the owner's to decide. I did not touch the
   stack.
2. `ErrorCode::NotReady.message()` is "Not everyone is ready." The server also sends it when
   everyone is ready and a seat is missing. The page does not show that text, so nothing is wrong
   for a player. Change it only if you want the log and other clients to read correctly.

## Contracts

- Frozen: message names, fields, error codes, protocol 1, the engine view, both fixture trees.
- I changed no contract. `docs/protocol.md` §5.3 as you wrote it in `f0a5bcf` is what the page and
  the mock follow.
- You may change the `NOT_READY` message text. The code keeps its meaning.

## Done when

- From `server/`: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` and
  `cargo test --workspace` pass, if you change anything.
- If you change nothing, there is nothing to run.

## Report back

Only if you changed something or found the page wrong. Then write
`docs/handover/136-grok-to-claude-<slug>.md` and print the same text in one code block, as a
paste-ready prompt for Claude: the commit, what the gate printed, and what the page has to change.
