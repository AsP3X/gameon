# Skull King Tavern — multiplayer plan

Written 2026-10-10. Turns the single-file game into an online game with lobbies (friends and
randoms), casual and ranked play, and a Rust server that is the only authority.

- Rules for agents: `AGENTS.md` and `docs/agent-rules/`.
- Wire contract: `docs/protocol.md`. Engine port: `docs/engine-conformance.md`.
- Handovers between Claude (web) and Grok (server): `docs/handover/`.

---

## 1. Where the project is today

The whole project is one file, `Skull King Tavern.html` (2,541 lines, 183 KB, no build, no tests,
no git). It is in better shape for this conversion than a single file suggests, because it was
written in layers with the online move in mind:

| Layer | Lines | What it is | Online fate |
| ----- | ----- | ---------- | ----------- |
| Rules | 497–635 | Deck, legality, trick resolution, scoring. Pure. | Ported to Rust (`skt-engine`). Stays in the client for offline play. |
| Engine | 637–804 | Pure reducer `reduce(state, action) → {state, events}` and `view(state, seat)`, which already redacts other hands, open bids and the pile. | Ported to Rust. The server runs it; the client's copy is the reference for fixtures. |
| Bots | 806–889 | Three levels. They read only their own hand and the played cards. | Ported to Rust (fill seats, take over for a player who left). |
| LocalTable | 891–931 | The "transport": holds state, runs bot timers, exposes `view(seat)`, `dispatch(action)`, `subscribe(fn)`. | Kept for offline. A `RemoteTable` with the same interface talks to the server. |
| Storage | 933–940 | `localStorage`: saved game, preferences, stats. | Offline only. Online stats and results live on the server. |
| Sound | 942–1085 | Synthesised with Web Audio, no files. | Unchanged. |
| Art | 1087–1418 | Card and avatar SVG, built as strings. | Unchanged. |
| UI | 1420–2539 | String-template views re-rendered into `#app`, FLIP animation, an event queue so animations never overlap, one delegated click handler. | Becomes the table component inside a React shell. |
| Scorekeeper | 1857–2097 | A score tracker for games played with physical cards. | Offline, untouched. |

Modes today: solo against bots, pass-and-play on one device, and the scorekeeper.

### What has to change, found while reading the code

1. **The shuffle is guessable.** `mulberry32` runs on a 32-bit seed from `Math.random()`. A player
   who sees one hand can search all 2³² seeds and learn every hand. The server must shuffle with an
   OS-seeded CSPRNG, and the engine must take the shuffle as an input.
2. **`advance` has no owner.** Anyone holding the table can move a finished trick or round forward.
   Online it becomes a server timer; no client message reaches it.
3. **"Human" means "this device".** `humansOf`, `isPassAndPlay`, `humanActor` and `syncSeat` treat
   every non-bot seat as someone holding this phone. Online, other humans are remote, so these must
   key on *local seats*. This is the riskiest part of the UI port.
4. **Dispatch is synchronous.** `act()` and `myPlay()` read the reducer's answer in the same tick.
   Online the answer arrives later or not at all, so they become async with a reject and a timeout
   path. The existing `ui.waiting` lock already models "input locked until the table answers".
5. **The view carries static data on every update** (`deck`, `seats`, `cfg`). Online they are sent
   once when the game starts.
6. **No turn limits, no presence.** Online needs deadlines, away detection, and a bot that takes a
   seat over.
7. **Names are escaped consistently** through `esc()` (checked: every seat name, the toast, the
   tables). That discipline now matters for security, because names come from strangers. It becomes
   a rule (`web-quality.md`).
8. **Fonts load from Google's CDN.** They get bundled: no third-party requests at runtime.
9. **No tests exist.** The fixtures in step C1 are the first, and they are what keeps the Rust
   port honest.

Nothing in the rules code is known to be wrong. The port preserves its behavior exactly, quirks
included (`docs/engine-conformance.md`).

---

## 2. Target architecture

```
Browser (web/, Vite+ · React 19 · TypeScript)            Server (server/, Rust · axum · tokio)
┌───────────────────────────────────────────┐            ┌─────────────────────────────────────────┐
│ Screens: home, online hub, lobby, queue,  │   REST     │ skt-server                              │
│ profile, ladder, sign-in                  │ ─────────► │  auth · profiles · ladder · lobby list  │
│                                           │ /api/v1    │                                         │
│ Table component (legacy renderer)         │            │  lobby registry ── matchmaker           │
│   ▲ view + events        │ intents        │ WebSocket  │        │               │                │
│ Table interface ─────────┼───────────     │ ◄────────► │  one task per table: owns GameState,    │
│   LocalTable  (offline: JS engine + bots) │ /api/v1/ws │  timers, bots, sends per-seat views     │
│   RemoteTable (online: socket client)     │            │        │                                │
└───────────────────────────────────────────┘            │ skt-engine (pure): rules, reducer,      │
                                                         │   view redaction, bots                  │
                                                         │ skt-protocol: wire types → TypeScript   │
                                                         └──────────────┬──────────────────────────┘
                                                                        ▼
                                                              PostgreSQL: users, sessions, games,
                                                              action logs, ratings, seasons
```

### Server

- **Workspace** like `../shroud/server`: edition 2024, axum 0.8 with WebSocket, tokio, sqlx on
  PostgreSQL 16, serde, thiserror, tracing, argon2. `unsafe` forbidden, clippy `all` + `pedantic`.
- **`skt-engine`** — pure library. Rules, reducer, per-seat view, bots. No I/O, no async, no clock,
  no global RNG. `GameState` is not serialisable; only views are.
- **`skt-protocol`** — every wire type, with serde and `ts-rs`. Generates
  `web/src/protocol/generated/` and the samples in `fixtures/protocol/`.
- **`skt-server`** — the binary. One tokio task per table owns its `GameState` and its timers and
  is driven by a message inbox, so a table never needs a lock. Lobbies and queues live in memory;
  accounts, results, ratings and action logs live in Postgres.
- **Single node.** A table's state is a few kilobytes; one process carries thousands of tables.
  No Redis in v1. Scaling out (sticky routing per table) is a later decision, not a v1 cost.

### Web

- **Vite+** (`vp`) with TypeScript strict and **React 19**, the same base as `../shroud/web`.
- **React for the shell and all new screens.** Lobbies and queues update while a player is typing
  or mid-tap; a renderer that replaces the whole DOM on each update loses focus and input there.
- **The table stays the legacy renderer**, lifted into typed modules and mounted as one component.
  Its animation timing is tuned and worth keeping. It is ported piece by piece only where online
  needs it (timers, presence, waiting states).
- **One `Table` interface, two implementations.** `LocalTable` (today's code) for offline;
  `RemoteTable` for online. The table component does not know which one it has.
- **A mock server in the browser** speaks the same protocol using the JS engine, so every online
  screen can be built and tested before the Rust server exists.

### Why two engines, and how they stay equal

The rules exist in JS today and must exist in Rust for the server. Until they are one code base,
**golden fixtures** keep them equal: recorded games from the JS engine (config, deals, every action,
every resulting event and every seat's view) that the Rust engine must replay exactly. The deals are
part of the fixture, so the two sides never need the same random number generator.

Later, optionally, the Rust engine is compiled to WebAssembly for the offline modes and the JS
engine is deleted (Phase 4). The fixtures stay as regression tests.

---

## 3. What players get

### Identity

- **Guest**: one tap, a generated pirate name, no password. Can play solo, join friends' lobbies and
  play casual.
- **Account**: username and password (argon2id). Required for ranked. A guest who registers keeps
  their id, name and history.
- No email in v1: nothing to verify, nothing to leak. A forgotten password is unrecoverable until a
  recovery method is added, and the sign-up screen says so.

### Ways to play

| Mode | Who | Rules | Bots | Rating |
| ---- | --- | ----- | ---- | ------ |
| Solo / pass-and-play / scorekeeper | Offline, as today | Any | Yes | No |
| **Private lobby** (friends) | Join by 6-character code or link | Host picks everything | Host may add | No |
| **Public lobby** (randoms) | Listed in the lobby browser | Host picks, shown in the list | Host may add | No |
| **Quick play** (randoms, casual) | Queue | The standard ruleset | Fill empty seats after a wait | No |
| **Ranked** | Queue, account required, solo only | The standard ruleset | Never at the start | Yes |

The **standard ruleset** (quick play and ranked): 4 players, classic scoring, the 70-card deck with
no expansions and no pirate abilities, "Skip to the Brawl" (five rounds of 6 to 10 cards, about 20
minutes). Low-card rounds are mostly luck and long games get abandoned; the big rounds are where
skill shows.

### At the table

- Server deadlines for bidding, playing and abilities, shown as a ring on the acting seat.
- A missed deadline plays a bot move for that turn. Two in a row marks the seat away and the bot
  keeps playing instantly until the player acts again.
- A dropped connection keeps the seat for a grace period, then a bot takes over. The player can
  return to the same seat and hand at any time before the game ends.
- Emotes instead of chat in v1: nothing to moderate.
- After the game: standings, rating change in ranked, rematch or back to the lobby.

### Ranked

- Rating by Weng-Lin (OpenSkill, Plackett-Luce), which handles four players finishing in an order.
  Shown as one number and a tier: Deckhand, Bosun, Quartermaster, First Mate, Captain, Pirate Lord,
  Skull King.
- Seasons of three months with a soft reset; the first games of a season are placement games.
- Leaving a ranked game scores last place and adds a queue cooldown that grows with repeats. A bot
  finishes the game so the other three still get a result.
- Solo queue only, and the matchmaker avoids seating accounts together that just shared a private
  lobby. In a four-player free-for-all, two friends at one table can feed each other.

---

## 4. How cheating is prevented

The full list is `docs/agent-rules/server-authority.md`. In short:

- The server shuffles, deals, validates, resolves, scores, times and rates. Clients send intents.
- State leaves the engine only as a per-seat view. The type that holds everything cannot be
  serialised, so a leak takes deliberate effort, not a slip.
- Bids are revealed together. The Smuggler's and the Seer's secrets go only to that seat.
- The seat is taken from the session, never from the message. Stale, out-of-turn and illegal
  intents are rejected and change nothing.
- Every game's deals and actions are stored, so a result can be replayed and audited.
- Tests: property tests play random games and assert that no seat's serialised view contains
  another seat's cards; the browser cheat probe in the definition of done sends forged intents.

What this cannot stop: two people sharing their hands over voice chat. That is why ranked is solo
queue, and why casual with friends is unrated.

---

## 5. Phases

Each phase has a Claude track and a Grok track that run in parallel, and one gate that both must
pass together. Every work package ends with a handover (`ownership-and-handover.md`).

### Phase 0 — Foundations

| | Claude (web) | Grok (server) |
| - | ------------ | ------------- |
| 1 | **C0** Repo: `git init`, `master` and `dev`, `.gitignore`; move the HTML to `legacy/` unchanged. | **G0** Scaffold `server/` (three crates, lints, toolchain), CI, Compose with Postgres. |
| 2 | **C1** Fixture generator: runs the legacy engine in Node and writes `fixtures/engine/*.json`, at least 40 games covering every player count, format, expansion, ability and scoring mode, plus rejected actions. | **G1** Port rules, reducer, view and bots to `skt-engine`; conformance harness over `fixtures/engine/`; leak property tests. |
| 3 | **C2** Scaffold `web/` with Vite+; lift the monolith into typed modules with no behavior change; bundle the fonts; `tokens.css`; engine unit tests; the JS engine replays its own fixtures. | **G2** `skt-protocol` from `docs/protocol.md`; generate TypeScript and `fixtures/protocol/`. |
| 4 | **C3** `design/web.pen`: tokens, components and the existing screens. | |

**Gate 0:** the lifted web app plays solo, pass-and-play and the scorekeeper exactly as the legacy
file does; `vp check`, `vp test`, `vp build` pass; the Rust engine replays every fixture; the leak
tests pass; `cargo fmt`, `clippy`, `test` pass.

### Phase 1 — One table, online (the vertical slice)

| | Claude (web) | Grok (server) |
| - | ------------ | ------------- |
| 1 | **C4** `Table` interface; local seats replace "non-bot means this device"; async dispatch with reject and timeout. | **G3** Guest sessions (cookie), `/api/v1/config`, `/me`, the WebSocket with `hello`/`welcome`, heartbeat, limits. |
| 2 | **C5** Socket client (reconnect with backoff, resume, request/ack, server-clock offset) and `RemoteTable`. Mock server speaking protocol v1. | **G4** Private lobbies: create, join by code, ready, settings, bots, kick, host migration, start. |
| 3 | **C6** Screens: online hub, create and join lobby, lobby room. Design first. | **G5** Table task: deals with the CSPRNG, deadlines, server-driven `advance`, bot seats, per-seat `game.update`, emotes. |
| 4 | **C7** Table online: deadline ring, presence badges, waiting states, ready for next round, reconnect overlay, leave. | **G6** Reconnect and resume, away detection, bot takeover, action log to Postgres. |
| 5 | **C8** Browser end-to-end test: four contexts play a full game against the real server. | **G7** Integration tests with real sockets; forged-intent tests; Compose service for the server. |

**Gate 1:** four browsers on one machine play a full private game with a bot seat, one player
reloads mid-trick and returns to the same hand, and the cheat probe is rejected on every attempt.

### Phase 2 — Accounts and randoms (casual)

| | Claude (web) | Grok (server) |
| - | ------------ | ------------- |
| 1 | **C9** Sign-up, sign-in, guest upgrade, profile, name and colour. | **G8** Register, login, logout, guest upgrade, username rules, rate limits. |
| 2 | **C10** Public lobby browser; quick-play queue screen. | **G9** Public lobby list; casual matchmaker with bot fill. |
| 3 | **C11** Post-game: standings, rematch, back to lobby; online stats on the profile. | **G10** Results and per-player stats persisted; rematch; `GET /users/{id}`. |

**Gate 2:** a guest queues for quick play and is seated with strangers or bots within the fill
time; a registered account keeps its history across devices.

### Phase 3 — Ranked

| | Claude (web) | Grok (server) |
| - | ------------ | ------------- |
| 1 | **C12** Ranked queue, tier badge, rating change after the game, placement state. | **G11** Ranked queue (rating window that widens with waiting), solo-only, account-only. |
| 2 | **C13** Ladder and season screens. | **G12** Weng-Lin ratings, seasons, ladder endpoint, all in the result transaction. |
| 3 | **C14** Leave warning, cooldown state. | **G13** Leaver penalty and cooldowns; recent-lobby avoidance; audit endpoint over the action log. |

**Gate 3:** scripted ranked games move ratings as the model predicts; a leaver is placed last and
cooled down; the other three get a normal result.

### Phase 4 — Hardening and launch

- Grok: recovery of running games after a restart (replay the action log), load test, metrics,
  production Compose with nginx and TLS, backups, graceful drain on deploy.
- Claude: installable PWA, offline fallback, accessibility pass, empty and error states everywhere,
  "reload to update" on a protocol bump.
- Both: security review against `server-authority.md`; report and block; optionally friends list
  and invites, spectating with a delay, and the WebAssembly engine replacing the JS one.

---

## 6. Repository layout

```
SkullKingTavern/
  AGENTS.md  CLAUDE.md
  legacy/Skull King Tavern.html     the original build, kept as the behavior reference
  web/                              Claude — Vite+ app
    src/game/        reference engine: rules, engine, bots (typed, from the legacy file)
    src/table/       Table interface, LocalTable, RemoteTable, mock server
    src/net/         REST client, socket client, server clock
    src/protocol/generated/         generated by skt-protocol — never hand-edited
    src/tableview/   the legacy table renderer, art, motion
    src/screens/  src/components/  src/sound/  src/styles/tokens.css
    scripts/         fixture generator
  server/                           Grok — Rust workspace
    crates/skt-engine/  crates/skt-protocol/  crates/skt-server/
    migrations/postgres/
  fixtures/engine/                  golden games (from the reference engine)
  fixtures/protocol/                one sample per message (from skt-protocol)
  design/web.pen                    Claude — Pencil only
  docs/  multiplayer-plan.md  protocol.md  engine-conformance.md  agent-rules/  handover/
  docker-compose.yml                Grok
```

---

## 7. Decisions taken, for the owner to overrule

These are settled in this plan so both agents can start. Changing one is cheap now and expensive
after Phase 1.

| # | Decision | Chosen | Why | Alternative |
| - | -------- | ------ | --- | ----------- |
| D1 | UI framework | React 19 shell, legacy table renderer inside it | Same as shroud; live-updating forms need it; keeps the tuned animations | Stay fully vanilla (less to learn, fights live lobby updates); rewrite the table in React (months of regression risk) |
| D2 | Accounts | Guests for casual, username + password for ranked, no email | Lowest friction for "send a link to friends"; nothing to verify | Email or passkeys from day one |
| D3 | Session | HttpOnly cookie, same origin | A script injected into the page cannot read it; the socket upgrade carries it | Bearer token in `localStorage` (needed only if native apps follow) |
| D4 | Wire format | JSON text frames, full per-seat view on every update | Tiny payloads, trivial resume, readable in dev tools | Deltas or a binary format (no need at this size) |
| D5 | Standard ruleset | 4 players, classic scoring, base deck, Skip to the Brawl | About 20 minutes; the skilful rounds | Full 10-round classic (about 35 minutes, more leavers) |
| D6 | Chat | Emotes only | Nothing to moderate at launch | Free text with reporting and filters |
| D7 | Rating | Weng-Lin via the `skillratings` crate | Built for more than two players | Pairwise Elo (simpler, slower to converge) |
| D8 | Engine in the client | JS reference engine now, WebAssembly later | Unblocks both agents today | WebAssembly first (one engine sooner, blocks the web port on Grok) |
| D9 | Infrastructure | One node, Postgres, no Redis | Enough for thousands of tables | Redis and several nodes from the start |
| D10 | Agent commits | Each agent commits on its own feature branch; no push or merge without the owner | A handover has to name a commit | shroud's stricter "commit only when asked" |

Not technical, but the owner should weigh it before a public launch: "Skull King" is a trademark of
Grandpa Beck's Games and the rules are theirs. The art here is original, but a public ranked service
under that name invites a takedown. A name change and a note that this is an unofficial fan game are
cheap now. Accounts for players in the EU also mean a privacy notice and, in Germany, an Impressum.

---

## 8. Risks

| Risk | What limits it |
| ---- | -------------- |
| The two engines drift | Golden fixtures in both test suites; a rule change regenerates them in the same commit |
| Hidden information leaks | Non-serialisable state, leak property tests, protocol samples, the review checklist |
| The local-seat rework breaks pass-and-play | Done in Phase 1 step C4 on its own, behind the solo and pass-and-play smoke paths |
| Legacy renderer and React fight over the DOM | The table owns one element and React never renders inside it; overlays are siblings |
| Vite+ is young | It wraps Vite, Vitest and the Oxc tools; falling back to plain Vite is a config change |
| Too few players for ranked | The queue widens its rating window with waiting time; quick play and bots always work |
| Collusion in ranked | Solo queue, recent-lobby avoidance, stored action logs |
| A deploy kills running games | Phase 4: drain, then replay from the action log |
