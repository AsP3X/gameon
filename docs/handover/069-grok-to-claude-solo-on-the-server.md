# 069 · Grok → Claude · solo on the server, and the road after it

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/agent-rules/ownership-and-handover.md`, `docs/agent-rules/server-authority.md`
and, in `docs/protocol.md`, the `Me` type, `Stats`, `GameSettings`, and sections 5.3 and 5.4 first.
This answers 068. No code in this package. The proposal is not applied to `docs/protocol.md`.

## State

- Branch `dev`. This file is the whole of the package. `design/skt.pen` is the owner's unsaved-until-they-save design and is not mine to commit. Nothing under `web/`, `server/`, `docs/protocol.md` or the fixtures changed.
- No gate was run. Nothing was built.
- `docs/multiplayer-plan.md` still says solo is offline only. That line is out of date. The plan is the owner's to edit. This handover is the contract the build follows instead.
- Ranked seasons are already one quarter. `docs/protocol.md` and `season_at` in `server/crates/skt-server/src/rating.rs`: Q1 starts 1 January UTC, Q2 1 April, Q3 1 July, Q4 1 October. `id` 1 is 2026 Q1. Do not rebuild that.

## Answers

### 2a. How a solo game starts

Its own socket message, `solo.start`. Not a lobby and not a queue.

A lobby still needs two humans, and that rule does not grow a special case. A queue is for strangers and a clock. Solo is one person and one to seven bots, private, never listed, never ranked, and the table exists on the reply. There is no ready step and no code.

`GameSettings` already holds the rules. `maxPlayers` is the whole table, 2..8, so one human plus one to seven bots is `maxPlayers` 2..8. Do not add a bot-count field. `botLevel` is the level of every bot. Scoring, format, loot, kraken, whale and abilities apply as on any other table. The human is the first seat. Bots fill the rest at `botLevel`.

`pace` is sent as `standard` and ignored. See 2b.

`lobby.addBot` is not how a solo table is filled. The bots are seated by `solo.start`.

### 2b. No clock

`pace` does not scale a solo game. The stored value is `standard` so the field stays one of the three names.

On the human's turn, `deadline` is `null`. A missed click plays nothing. There is no `timedOut`, no away, and no second miss. Bots play when the turn reaches them, then stop on the human's turn. Trick-end and round-end delays still run while the human is connected, so the table can show the trick. They are not a clock on the player.

If the socket drops, the table pauses. No bot moves, no trick advances, and the disconnect grace does not hand the seat to a bot. That is the line "No card is played while you are away." On the next `welcome` the same game resumes, bots catch up to the human's turn, and they wait.

### 2c. How long it is kept

One unfinished solo game per player. It is kept until they finish it or they abandon it. There is no expiry.

A second `solo.start` while that game exists is `ALREADY_SEATED`. `Me.active` already points at it. Abandon is `game.leave` on a solo game only: the game ends with no result, no bot takes the seat, `Stats` do not move, and a guest or an account is not cooled down. `game.leave` on every other table stays what it is today.

A guest may start one. It is stored on that guest id. Another device sees it when that same id signs in. Registering upgrades the guest in place, so the unfinished game stays. A brand-new guest on a second device does not.

### 2d. Jump back in

Add the round. The line keeps "Round 4 of 10".

`Me.active` for a solo game gains optional fields. Old clients ignore them. Protocol stays 1.

```ts
type Active =
  | { kind: 'lobby'; id: string }
  | { kind: 'queue'; id: string }
  | {
      kind: 'game';
      id: string;
      table?: 'solo' | 'friends' | 'public' | 'casual' | 'ranked';
      round?: number;    // 1-based deal index. Present when table is 'solo'.
      rounds?: number;   // format length: classic 10, brawl 5, swift 5, even 10, whirl 10.
      bots?: number;     // seated bots. Present when table is 'solo'.
    };
```

`round` and `rounds` come from the server's own game, not from the device. The deck-size cap can shorten a round's card count. It does not change `rounds`. The jump-back line does not name a host. That was 066, and it still holds for friends and public tables.

### 2e. Stats

A finished solo game on the server counts. A guest counts the same way, because the guest id is the player. Offline solo counts for nothing (2f).

The headline `Stats` fields gain solo and do not gain ranked. Ranked stays in `rating` and in the new breakdown, so a number the client already shows does not change meaning.

```ts
type ModeLine = {
  games: number;
  wins: number;
  bidsMade: number;
  bidsTotal: number;
  bestScore: number | null;
};
type Stats = {
  games: number;       // solo + friends + public + casual. Not ranked.
  wins: number;
  bidsMade: number;
  bidsTotal: number;
  bestScore: number | null;
  byMode: {
    solo: ModeLine;
    friends: ModeLine;
    public: ModeLine;
    casual: ModeLine;
    ranked: ModeLine;  // also rating.games for this season
  };
};
```

`byMode` is required on new replies. An old client ignores it. A win is a sole or shared first place, same rule as today. `game.leave` on a friends, public, casual or ranked table still excludes that seat from `Stats`. Abandoned solo is not a finish, so it is absent here too.

Every finished game, solo included, is one stored row: id, `table`, settings, startedAt, endedAt, season id when `table` is `ranked`, and one seat line each (user id or bot, place, score, bids hit, forfeit). Per-player pages and, later, the admin totals are counts over that row. They are not a second source of truth.

`GET /me/games?limit=&after=` returns the caller's own rows, newest first. `limit` omitted is 25, max 100. `after` is the id of the last row of the previous page. The body is `{ games, next? }`. No session is `401`. `GET /users/{id}` gains `stats.byMode` and still has no username and no game list. Another player's deals stay off that route.

### 2f. Offline

Confirmed. An offline solo game never reaches the server. The device engine plays it. The server does not accept a result, a score, a deal or a "I finished" message from the client. If the socket is down when they press Solo, the page says Offline and stays on the device. When the socket is up, Solo is `solo.start` and the device engine is not in that game.

### 3. Engine and fixtures

`docs/engine-conformance.md` and `fixtures/engine/` are untouched. Solo uses the same rules. The clock, the pause, and the stats are server policy around the engine, not a rule of the cards.

When the owner says build, `fixtures/protocol/` gains a `solo.start` sample, a `game.start` with `table: 'solo'`, a `Me` with the new `active` fields, and a `Stats` with `byMode`. Those land with the `skt-protocol` change, not before.

## Proposed contract text

Not applied. This is what I would add to `docs/protocol.md` when the owner says build. Protocol stays 1. Every addition is a new message, a new optional field, or a new code.

**New code.** `BOTS_DISABLED`. `lobby.addBot` on a table that does not seat bots. The message is `This table does not seat bots.`

**`GameSettings`.** Unchanged. `pace` on a solo game is stored as `standard` and does not arm a human deadline.

**`game.start`.** Gains `table: 'solo' | 'friends' | 'public' | 'casual' | 'ranked'`. `mode` stays `custom` for solo, friends and public, `casual` for casual, `ranked` for ranked, so an older reader still has a mode it knows. Solo has `lobbyId: null`.

**`solo.start`.** Payload `{ settings: GameSettings }`. Who: a player who is not in a lobby, a queue, or a game. Result: `ok`, then `game.start` with `table: 'solo'`. `maxPlayers` outside 2..8 is `VALIDATION`. Ranked settings are not a field on this message. One human, bots in every other seat, `deadline: null` on the human's turn.

**`game.leave` on `table: 'solo'`.** The game ends. No result row, no stats, no bot, no cooldown. On every other table, `game.leave` is unchanged.

**Disconnect on `table: 'solo'`.** The seat stays the human. Status may show offline. The grace does not start. No bot is seated. No card is played until the same player connects again.

**`lobby.create`.** Gains `allowBots: boolean`. Omitted means `true`, which is today's host-may-add behaviour. `false` means `lobby.addBot` is `BOTS_DISABLED`. Ranked never reads it. Casual never reads it. The public list's `LobbySummary` gains `allowBots` so a table with no bots can be seen as such.

**Lobby kinds, in the words of the design, mapped onto fields that already exist plus `allowBots` and `table`.**

| The player says | How it is started | Bots | Rules | Rating |
| --- | --- | --- | --- | --- |
| Solo | `solo.start` | 1..7, required | The `settings` on that message | No |
| Friends only | `lobby.create` `visibility: 'private'` | `allowBots` | Host's `settings` | No |
| Public | `lobby.create` `visibility: 'public'` | `allowBots` | Host's `settings`, shown on `GET /lobbies` | No |
| Random, casual | `queue.join` `casual` | Fill after the wait | `config.standard` | No |
| Ranked | `queue.join` `ranked` | Never | `config.standard` | Yes, this quarter |

Ruleset variants (classic night, brawl, swift, even, whirl, rascal, loot, beasts, abilities) are a `GameSettings` object the host sends. They are not a new enum. The client may offer them as named cards. The server checks the object the way it already checks `lobby.settings`.

**`Me.active`.** As in 2d.

**`Stats` and `GET /me/games`.** As in 2e.

**Cheat signals.** Not a player message. The server writes a row when it sees one, from state it computed. The player socket never carries another seat's signal, and it does not accept "they cheated". v1 signals, ranked and casual only:

- two accounts on one address seated in the same ranked game
- a ranked pair who also shared a private lobby inside the two-hour window (the matchmaker already refuses this; a miss is a signal)
- a seat whose accepted bids and plays arrive in a pattern no human clock on that table supports, scored from the stored action log, never from the client
- a result the replay of the stored deals and actions does not reproduce

A signal does not void a game and does not ban. The admin app reads the rows later. Solo is out of this list: there is no second human to collude with, and there is no clock to miss.

## The build, when the owner says go

Two lanes. Grok owns the server, the protocol crate, the generated TypeScript, and the protocol fixtures. Claude owns `web/`, `design/skt.pen` and `design/gameon.pen`. Neither starts a package until the previous handover names the commit. Inside a package, each lane may split the work across subagents. One subagent, one package, one handover. Do not run two packages that edit `docs/protocol.md` at the same time.

**Package 0. Lock the words.** Grok copies the proposed text into `docs/protocol.md`, then `skt-protocol`, then regenerates `web/src/protocol/generated/` and `fixtures/protocol/`. Claude does not paint a new frame in this package. Gate: `cargo test --workspace` and the protocol fixture test. Handover back with the commit.

**Package 1. Solo, the table.** Grok: `solo.start`, the pause, one unfinished game, `game.leave` abandoning solo, solo rows in `Stats` and `byMode.solo`, `Me.active` round, rounds and bots. Tests: one human and three bots starts; a second start is `ALREADY_SEATED`; disconnect plays no card; reconnect is the same hand; a finish moves `Stats`; an abandon does not; a guest who registers keeps the game. Claude, after that commit: wire `design/skt.pen` Solo, the table pills (Saved, Offline, connection lost), the final-score lines, and the jump-back line "Solo against N bots · Round R of T · saved to your account". The device engine runs only when the socket is down at the start. Gate: server tests, `vp check`, `vp test`, and one browser smoke of a solo game that survives a reload.

**Package 2. The five tables.** Grok: `allowBots`, `BOTS_DISABLED`, `table` on `game.start`, `LobbySummary.allowBots`. Friends and public keep the two-human rule. Casual fill and ranked stay. Claude: the Online and Ranked screens in `design/skt.pen`, then the pages. Named ruleset cards send a `GameSettings` body. A card that says "no bots" sends `allowBots: false`. Gate: a public no-bot table rejects `lobby.addBot`; a friends table with bots still starts at two humans; ranked still never seats a bot.

**Package 3. The profile.** Grok: the game row for every finish, `GET /me/games`, `byMode` on `Me` and on `Profile`. Claude: a profile in `design/gameon.pen`, then the page. Structure, top to bottom: who you are (name, colour, username or guest, tier); this quarter (season name, rating, provisional, ranked games, link to the ladder); the five lines solo, friends, public, casual, ranked; bids hit against bids scored; best score; your games, paged. Another player's profile is the five lines and the public `User`, with no list and no username. Gate: a solo finish and a casual finish land on the right lines; ranked moves `byMode.ranked` and `rating` and not headline `games`.

**Package 4. Signals.** Grok only. Write the four signals next to the game row. No new player message. A test that a forged client report is `VALIDATION` and is not stored. Claude has nothing to draw.

**Package 5. Admin, later, its own app.** Not in packages 0–4. Same shape as `../shroud/admin`: `admin/api` (Grok) and `admin/ui` (Claude), its own sign-in, its own operators, mounted at `/admin`, no seat on the player socket. It reads the game rows, the five totals, the season, and the signals. It can abandon a stuck solo game and lock an account out of ranked. It cannot deal a card or see a hand the player API does not already store in the action log for a finished game. Claude draws `design/admin.pen` at the start of that package, not before. First page of that package is a handover of its own.

## Your task

1. Do not build a page, and do not edit `docs/protocol.md`.
2. Read `design/skt.pen` against the sentences in 2a–2f. If a frame promises a host's name, a clock, more than one unfinished solo game, an uploaded offline result, or ranked points for solo, name the frame and the line in your return handover.
3. Leave the pen as it is unless a line is false under this proposal. A false line becomes the words in this handover. "Skull King · your table" stays. The solo jump-back line may keep the round and the bot count.

## Contracts

- Frozen until the owner says build: `docs/protocol.md`, `skt-protocol`, `web/src/protocol/generated/`, both fixture trees, the engine.
- This handover is the proposal. It is not the contract yet.
- You may edit `design/skt.pen` only to correct a line item 2 finds. You may not edit `design/web.pen`, `design/gameon.pen` or `design/brand/`.

## Done when

Your return handover names every frame you compared and any line you changed. No `vp` gate and no `cargo` gate.

## Report back

Write `docs/handover/NNN-claude-to-grok-<slug>.md` and print the same text in one code block. No server work.
