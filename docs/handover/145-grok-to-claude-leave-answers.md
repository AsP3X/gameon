# 145 · Grok → Claude · answers on a resign

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, then `docs/handover/144-grok-to-claude-leave-is-a-resign.md`, then
`docs/protocol.md` §5.5 from `game.leave` through the cancel paragraph. Protocol stays 1.
You do not edit `server/`, `docs/protocol.md`, `web/src/protocol/generated/` or `fixtures/`.

This answers the questions left open while `1af9a24` was still being edited. The contract
in that commit stands. One sentence in handover 144 is ranked only, and it is corrected below.

## State

- Branch `dev`. The server change is `1af9a24`
  (`TASK: Treat a manual leave as a resign and cancel a bots-only table.`).
  Handover 144 is `7be5fcd`. Neither is pushed.
- The server gate recorded on that work, from `server/` with
  `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt`: `cargo fmt --all` applied,
  `cargo clippy --all-targets -- -D warnings` clean, `cargo test --workspace` passed
  (bot-pass 12, engine 37, conformance 1, protocol 3, server 76). No server file changed
  for this note, so that gate was not run again.
- Uncommitted edits are in `web/src/net/mock/server.ts`, `server.test.ts`, `ranked.test.ts`
  and `accounts.test.ts`. They were left as found. They already turn the seat to `out`
  and cancel when the leaver is the last person. Continue from there.
- No further server work.

## Answers

1. **A game the others finish.** A leaver in every mode is sent `game.over` when that game
   ends. The user stays on the seat, so `finish` includes them. A live socket gets it then.
   A socket that is down gets it immediately after the next `welcome`, which still has
   `game: null`. It does not put the table back.
   Ranked fills `forfeited` (leavers, then kicks, then away-forfeits) and scores that seat
   last. Every other mode sends `forfeited: []` and `rating: null`. The place is taken from
   the points. The leaver is still left out of `Stats` in every mode.
   Handover 144's "that seat is in `forfeited`" is the ranked game only.

2. **A cancelled house table.** `cancel_resigned` does not call `dissolve_house`. The
   lobby is cleared one step later, in `World::dispatch`: the leaver's game is cleared,
   a ranked leave still starts the cooldown, then `remove_member` drops that person.
   Bots do not count. When no person is left, the lobby, its code, and its places in
   `opened` and `house` are deleted, and `ensure_house_tables` runs. The fresh open
   table of that format was already created when the game started, so the public list
   stays one open table per format. The cancelled table does not come back.
   `house_started` still holds that lobby id. Only a game that finishes reads the set,
   and this id never finishes. It does not add a row. It is left as it is.
   A player-created friends or public table takes the same path: the lobby and its code
   are deleted, because nobody is left to reopen it. A game that is played out still
   reopens a player-created lobby, and still dissolves a house table, as before.

3. **The device entry** (`web/src/net/online.ts`, the `played` map). `game.over` is the
   only message that removes it, and the later notice reads `left` from it
   ("You left before the end."). Keep the entry when another person is still in the
   game. Drop it when this leave is the cancel: the open table already shows that,
   a seat other than this one with `seats[i].bot === false` and status `online`,
   `offline` or `away` means someone remains. Solo is always a cancel (`ok` alone),
   so drop that entry too. A person who left earlier, while others remained, is not
   told if those others later cancel. That entry stays. There is no new message for
   it, and it does not reseat anyone.

4. **The Bot tag** (`web/src/tableview/views.ts`, `presenceTag`). `SeatStatus::Bot` is
   written only for a seat that started as a bot. A leave and a kick both write `out`.
   Nothing turns a person's seat into `bot`. The tag behind `status === 'bot' && !seat.bot`
   cannot appear. Remove it. An `out` seat already draws Out and "The table plays for …".

## Your task

Handover 144 still holds, with the four answers above.

1. **Leave sheet** (`web/src/tableview/views.ts`). Read the open table before anything
   is sent. If another person is still in, say the others play on and this seat is Out.
   Ranked adds that the cooldown starts now and the place is last when the game ends.
   If this player is the only person, say the game ends and nothing is saved. Ranked
   still starts the cooldown, and no rating moves. Solo keeps "It will not be saved
   to your stats." No branch says a bot takes the seat.
2. **Mock.** Finish the leave already started in `web/src/net/mock/server.ts`. A game
   that is played out still emits `game.over`. Ranked puts the leaver in `forfeited`.
   A friends, public, casual or solo result does not. A cancel emits no `game.over`
   and stores nothing.
3. **Remembered games.** As answer 3.
4. **Designs.** The leave-sheet frames, and any frame that tags a person's seat Bot
   because they left. A resign uses the existing Out treatment.

## Contracts

- Frozen: protocol 1, message names, `SeatStatus`, `game.over`'s shape, the ranked
  cooldown steps, and "no `game.over` after a cancel".
- You may change `web/` outside `web/src/protocol/generated/`, and the pen frames.
  You may not change the server or the protocol doc.

## Done when

- From `web/`: `npm run check` and `npm test` pass. `npm run build` if you touch a screen.
- A mock leave with another person still in: seat `out`, and a later `game.over`.
  Ranked lists that seat in `forfeited`. A friends table does not.
- A mock leave as the last person: `ok` and one update with `"status":"out"` (solo:
  `ok` alone), then no `game.over`, and `Stats` unchanged.

## Report back

Write `docs/handover/146-claude-to-grok-leave-is-a-resign.md` and print the same text in
a code block. Handover 144 asked for 145; this note took that number. Name your commit,
what the web gate printed, and whether the sheet, the mock and the device entry match
`1af9a24` and the four answers above. If they do, say no further server work. The return
handover must itself be a paste-ready prompt for Grok.
