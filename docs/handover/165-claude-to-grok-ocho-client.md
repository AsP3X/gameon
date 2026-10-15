# 165 · Claude → Grok · the Ocho client (return)

You are Grok, the callee, working on Skull King Tavern
(`/Users/niklas/Documents/development/gameon`), branch `feature/game-ocho`. Do this work
yourself. Do not run `claude` or `grok`. This is the return handover for
`docs/handover/164-grok-to-claude-ocho-client.md`. Read `docs/ocho-protocol.md`,
`server/crates/ocho-server/src/room.rs` and `web/src/ocho/client.ts` first. Edit only
`server/` and `docs/ocho-protocol.md`. Do not touch `web/` or `design/`.

## State

- Branch `feature/game-ocho`, commit `a7a1a2a` (`ADD: Play Ocho from the Games shelf: sit
  down, the table, the match score and how to play.`), on top of `e3e89b9`. Not pushed. Only
  `web/` is in it.
- Gate, from `web/` with Node 22 (`/tmp/node-v22.23.3-darwin-arm64/bin`):
  - `npx vp check`: all 166 files formatted; no warnings, lint errors or type errors in 153 files.
  - `npx vp test`: 55 files, **811 passed**, 0 failed.
  - `npx vp build`: built.
- Smoke test: `vp dev` with `?mock` for the API and a throwaway WebSocket on `127.0.0.1:8091`
  that sent canned `ocho.lobby` / `ocho.view` frames. Checked: sit down (teams), the waiting
  table, the table at 390 and 1440 px, an open stack, X-Ray rows on a phone, a teams table with
  the partner's hand, the colour sheet, between hands, light and dark. The real `ocho-server` was
  not run.
- **Design:** `design/ocho.pen` now has the join-with-code block on all eight `16`/`17` sit-down
  frames, and four new frames `21 Your table · waiting · {Phone,Desk} · {Light,Dark}` below
  frame 20. In `design/gameon.pen`, the Ocho card's "A table" line now reads "2 to 8 players.
  Friends join with a code." (Ocho has no public tables). **Neither `.pen` change is on disk**
  until the owner presses ⌘S in Pen with each file open. Then check that `git diff --stat`
  shows only those two files, and commit them alone with the prefix `DOCS:`.

## What the page does

Routes added (all are frame pages; Skull King's socket stays closed on them):

| Address | Page |
| --- | --- |
| `/games/ocho` | Sit down, or the table waiting, or the table, or the match score, as the server says |
| `/games/ocho/teams` | The same, with Teams chosen on sit down (the shelf's "Teams" way) |
| `/games/ocho/how-to-play` | How to play, in the words of frame 18 |

The page routes are **not** under `/ocho/`, because nginx sends `location /ocho/` to
`ocho-server`. `web/vite.config.ts` proxies `/ocho/` (WebSocket included) to
`SKT_OCHO_TARGET` or `http://127.0.0.1:8091`. The service worker leaves `/ocho/` to the network.

The socket is `/ocho/v1/ws`. It sends `hello` first, then one intent at a time with a growing
`id`, and it reconnects with backoff (500 ms doubling, max 15 s). Sit down sends `ocho.create`
and then `ocho.ready {ready:true}`. Join sends `ocho.join` (code upper-cased) and then
`ocho.ready`. The host's Start on the waiting table sends `ocho.start`. At the table: Play sends
`ocho.play` (with `color` for a wild, chosen on the colour sheet), and Draw, Take N, End turn,
the opening colour and Next hand send `ocho.draw`, `ocho.draw`, `ocho.keep`, `ocho.color` and
`ocho.next`. "Back to games" after a match sends `ocho.leave` and forgets the table on the page.

Seat names come from `lobby.members[seat]`. The seat order is the member order, as `start()`
builds it. The page draws another seat's cards only from `view.xray` and `view.partnerHand`.

## Your task

These are gaps on the server side that the client cannot close. In order:

1. **Snapshot on connect.** `hello` and `attach` send nothing. After a reload or a dropped
   socket the player is still seated, but the page has no lobby and no view, so it shows sit
   down, and `ocho.create` then answers `ALREADY_SEATED`. The page offers "Leave that table" for
   that case, and that only works before the deal. Push `ocho.lobby` and, once dealt,
   `ocho.view` to the user on `hello` (or right after `attach`) when they are seated. Add this to
   `docs/ocho-protocol.md`. The client needs no change: it already keeps whatever arrives.
2. **Leaving after the match.** `leave()` refuses `GAME_RUNNING` whenever `lobby.table` is
   `Some`, even when the phase is `Over`. A player who finished a match can never sit down again
   (`ALREADY_SEATED` forever). Let `ocho.leave` succeed once the match is over, and drop the
   lobby when its last member leaves. The page already sends `ocho.leave` from "Back to games".
3. **One socket per account.** `attach` overwrites the sender, but the old socket's loop keeps
   running, and its `detach` removes the new one when it closes. Close or ignore the old socket
   when a new one attaches (see `server-authority.md`: "a new connection replaces the old one").
4. **Optional, for the frames already drawn.** The view has no event list, so the page cannot
   draw "Fay played Draw 2 · Gus added Wild Draw 4", who Dead Red or Boo Blue hit, the reshuffle
   banner, or frame 14's other hands face up at hand end. It shows the stack total, the colour
   and symbol, the direction, whose turn it is, and the score frames 19 and 20 from `scores`,
   `handPoints`, `handWinner` and `matchWinner`. If you add public events or the hand-end hands
   to the view, write the shape in `docs/ocho-protocol.md` and hand it back to Claude.

## Contracts

- Nothing in `skt-protocol`, `web/src/protocol/generated/` or `fixtures/` changed. Ocho's wire
  types are hand-written in `web/src/ocho/wire.ts`, because Ocho is not in `skt-protocol`. They
  follow the serde shapes in `ocho-engine` (`Kind` as `{"number":n}` or a camelCase string,
  `partnerHand`, `stack`, `target`, `handWinner`, `matchWinner` and `handPoints` as `null` when
  absent). A frame that does not parse is dropped.
- Frozen for the page: the frame names in `docs/ocho-protocol.md`, the `PlayerView` and
  `LobbyView` field names, and `must`/`phase` values. A rename breaks the client. Adding a
  field is safe.
- Error `message` strings are shown to the player as they come.

## Done when

- `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` and `cargo test --workspace`
  pass in `server/`.
- A test in `ocho-server` shows that a seated user who reconnects gets `ocho.lobby` (and
  `ocho.view` once dealt), and that `ocho.leave` succeeds after the match is over.
- `docs/ocho-protocol.md` says both.

## Report back

Write `docs/handover/166-grok-to-claude-<slug>.md` as a paste-ready prompt for Claude, and print
it in one fenced code block. Name the commit and the gate counts, and say whether the view or the
protocol changed. Commit only `server/` and `docs/`, prefix `ADD:` or `BUGFIX:`, no AI
attribution, and do not push.
