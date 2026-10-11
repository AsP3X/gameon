You are Claude, the web engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the web client and the design
file. Grok writes the Rust server, Compose, deploy files and CI, and never edits `web/` except the
generated protocol tree. You and Grok cannot see each other's sessions: the owner pastes handover
prompts between you. This is handover 030. It replaces the empty task in 029. The Phase 3 client
package is C12, C13 and C14: the ranked queue, the ladder, and the leave warning. Build them
against the mock. The Rust server does not speak ranked yet.

READ FIRST, IN THIS ORDER
1. `AGENTS.md`, then `docs/agent-rules/ownership-and-handover.md`, `git.md`, `design-sync.md`,
   `web-quality.md`, `server-authority.md` and `definition-of-done.md`.
2. `docs/protocol.md` §4 (`Me.rating`, `Me.cooldownUntil`, `GET /ladder`), §5.4 (the ranked row of
   `queue.join`) and §5.5 (`game.over.result.rating`, `forfeited`, ranked `game.leave`). On `dev`
   those types already exist in `web/src/protocol/generated/`. Do not hand-edit them.
3. `docs/multiplayer-plan.md` §3 "Ranked", and §5 Phase 3 rows C12, C13 and C14. The Weng-Lin
   formula, the season length, and the cooldown growth are server work. Do not implement them.

STATE

Cut `feature/claude-ranked` from the tip of `feature/claude-accounts`. That tip is `04d670b`
in `/Users/nvorberg/Documents/development/skt-claude-accounts`. It has the account screens, the
public list, casual quick play, and `design/web.pen` with the 17 new frames. Do not cut from
`dev`. Do not merge `feature/claude-four-players` or `feature/claude-menu-music`. Do not commit
in Grok's checkout `/Users/nvorberg/Documents/development/SkullKingTavern`
(`feature/grok-accounts`). Use your own worktree.

`feature/grok-accounts` at `50a0ae9` has accounts, casual queue, and the rate-limit fix. On that
server, `queue.join` with `{ mode: 'ranked' }` from a guest is `ACCOUNT_REQUIRED`. From an
account it is `INTERNAL`. That is expected. Build against `web/src/net/mock/`. A missing ranked
route is not a client bug and not a reason to stop.

`docs/protocol.md`: do not edit it. Protocol stays 1. Two ids are not written down yet. Use them
and name them in your report so Grok can add the sentences:
- `Active` for the ranked queue is `{ kind: 'queue', id: 'ranked' }`.
- The mock's rating numbers and the 15-minute cooldown below are stand-ins, not the formula.

YOUR TASK

One branch for the whole package. Design each new screen in `design/web.pen` first, through the
Pencil tools only, then build it. Same copy in the file and in the client. Empty, loading, error
and disconnected states are part of the screen. Tokens from `web/src/styles/tokens.css` only.
Casual quick play, public tables, private tables, and the account screens stay as they are.

1. Ranked queue (C12). Add it beside "Find a game". An account may queue. A guest is shown that
   ranked needs an account and the client sends nothing; if a guest socket sends
   `queue.join { mode: 'ranked' }` anyway, the mock answers `ACCOUNT_REQUIRED` before
   `ALREADY_SEATED`.
   - An account's `queue.join { mode: 'ranked' }` answers `ok` with
     `queue: { mode: 'ranked', since, found, needed: 4 }`. `since` is when this player joined.
     Further changes arrive as `queue.status` to the other waiters only, as casual already does.
     The joiner is not pushed their own join. No `queue.status` is sent when the table forms.
   - `needed` is 4. No bots are added. The table forms when four accounts are waiting, humans in
     join order. `game.start` has `mode: 'ranked'`, `lobbyId: null`, and `settings` equal to
     `config.standard`. Then `game.update` with `rev` 0 and `events: []`. There is no accept step
     and no duration printed on the screen.
   - `ALREADY_SEATED` when the player is in a lobby, a game, or either queue.
   - The screen shows `found` of `needed`, the same way casual does.
   - `Me.rating` is `{ value, tier, provisional, games }`. Draw `value` and the `tier` string.
     The plan's tier names are Deckhand, Bosun, Quartermaster, First Mate, Captain, Pirate Lord,
     Skull King. Display whatever string arrived. Do not compute a tier from the number.
   - `provisional: true` is the placement state: say these games are placement, and do not present
     the tier as settled. The protocol does not say how many games end placement. Do not pick a
     count. Render the flag.
   - On `game.over`, when `result.rating` is present, show `before.value`, `after.value` and
     `delta` for this seat, including a negative delta. Casual and custom leave `rating` null and
     the line is absent. Do not rebuild the rest of the end screen.

2. Ladder (C13). `GET /api/v1/ladder?season=&limit=&after=` returns
   `{ season, entries, next? }`. `season` is `{ id, name, startsAt, endsAt }`. Each entry is
   `{ rank, user, rating }`. `user` is the public player: name, colour, tier. No username.
   - The screen shows the season name and its dates, then the rows. An empty list is an empty
     state, not an error.
   - Ask for `limit=25`. If `next` is present, a control loads the following page with that `after`.
     Omit `season` to get the current one. The mock may have a single season named `Season 1`.
   - `config.season` may be null. The ladder screen does not require it to be set.

3. Leave warning and cooldown (C14).
   - In a ranked game, the leave sheet says that leaving scores last place and starts a cooldown.
     Confirm sends `game.leave`. Cancel sends nothing. Casual and custom keep the leave sheet
     they have.
   - The mock, on ranked `game.leave`, adds that seat to `forfeited` and sets `Me.cooldownUntil`
     to 15 minutes from now. Fifteen minutes is a stand-in. The screen does not hardcode it. It
     reads `cooldownUntil`.
   - While `cooldownUntil` is in the future, Ranked does not send `queue.join`. Show the time from
     that timestamp. If a join is sent anyway, the mock answers `QUEUE_COOLDOWN`. The `message`
     carries no duration. `GET /me` does.
   - A ranked leave still takes the table down, as `game.leave` already does. Later `welcome` has
     `game: null`.

4. Mock numbers, fixed so the screen can render. These are not the rating model.
   - A new account that has never played ranked has `rating: null`.
   - After a ranked game the mock sets `result.rating` and stores `Me.rating` from `after`.
     Winner: `before.value` 0, `after.value` 1, `delta` 1, `tier` `"Deckhand"`, `provisional` true,
     `games` 1. Each other human: `delta` -1, `after.value` -1, the same tier, `provisional` true,
     `games` 1. A seat that sent `game.leave` is last, and its `delta` is -1 as well.
   - Say in the report that Grok must replace these numbers. Do not tune them.

5. Tests, next to the mock and the screens. Cover: a guest is refused ranked with
   `ACCOUNT_REQUIRED`; an account reaches `game.start` with four humans and no bot; `lobbyId` is
   null; the end screen shows `delta`; the ladder omits usernames and pages with `next`; a ranked
   leave warns before it sends `game.leave`; during the cooldown the client does not send
   `queue.join`; a forced join is `QUEUE_COOLDOWN`. Casual queue tests still pass. Do not aim
   these tests at `127.0.0.1:8080`.

CONTRACTS

- Frozen: `server/`, `docs/protocol.md`, `web/src/protocol/generated/`, `fixtures/`. Protocol
  stays 1.
- You may change: `web/` except the generated tree, and `design/web.pen` through Pencil only.
- You may not change: another agent's worktree, `legacy/`, or the generated protocol files.
- `ServerConfig.emotes` stays empty. Do not invent emote ids.
- The Rust server's `INTERNAL` on ranked `queue.join` for an account is expected.

DONE WHEN

From `web/` on your branch:
- `npx vp check` is clean.
- `npx vp test` passes, including the new ranked, ladder and leave tests, and the account and
  casual tests already on `feature/claude-accounts`.
- `npx vp build` succeeds.
- `npm run fixtures:check` still reports 41 games.
- The new screens are in `design/web.pen`. If Pen has not been saved, say that plainly.

REPORT BACK

Write `docs/handover/031-claude-to-grok-ranked.md` and print the same text in one fenced code
block. It must be a paste-ready prompt for Grok ("You are Grok"), with who and where, state, a
numbered task, contracts, done when, and report back. Include the branch, the commit, and the
gate counts. Describe the mock's ranked `queue.join`, `game.start`, `game.over.result.rating`,
`GET /ladder`, and the cooldown precisely enough to implement G11 and G12. Name every number that
was a stand-in. Name any protocol hole, including the queue id `ranked` if you kept it.
