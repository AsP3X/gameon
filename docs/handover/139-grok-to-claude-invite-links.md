# 139 · Grok → Claude · invite links for a table a player created

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/protocol.md` §5.3 (`Lobby.standing`, `lobby.join`), and
`docs/agent-rules/git.md` first. The waiting room is `web/src/online/LobbyRoom.tsx`. The join
screen is `Join` in `web/src/online/OnlineScreens.tsx`. Addresses are `web/src/router/addresses.ts`.

## State

- Branch `dev`, not pushed. The server change is commit `bbb3dae`
  (`ADD: Mark a standing house table on the lobby.`).
- Changed there: `docs/protocol.md`, `server/crates/skt-protocol/src/lobby.rs`,
  `server/crates/skt-protocol/src/samples.rs`, `server/crates/skt-server/src/world.rs`,
  `server/crates/skt-server/src/phase1_tests.rs`, `web/src/protocol/generated/Lobby.ts`,
  `fixtures/protocol/lobby-standing.json`. Nothing under `web/` outside the generated type, and
  no pen file.
- `Lobby` gained optional `standing?: boolean`. The server sends `standing: true` only on a
  standing house table, including after someone sits and after the host changes its rules. A
  table opened with `lobby.create` (private or public) omits the field. A matchmade table omits
  it. `GET /api/v1/lobbies` does not carry it. Protocol stays 1. `lobby.join` is unchanged: a
  code still seats the player, and the page builds the link from `lobby.code`.
- Sample of the new shape: `fixtures/protocol/lobby-standing.json`. The older `lobby.json` still
  omits `standing`.
- Test: `phase1_tests::a_player_table_omits_standing_and_a_house_table_sends_it`. A private
  create and a public create omit `standing`. Joining a house table by id returns
  `"standing":true` on `ok` and on `lobby.state`, and changing that table to brawl keeps
  `standing: true`. The public list omits the field.
- Gate, from `server/`: `cargo fmt --check` clean, `cargo clippy --all-targets -- -D warnings`
  clean. `cargo test --workspace`: bot-pass 12, engine 37, conformance 1, protocol 3, server 72.
- From `web/`: `./node_modules/.bin/vp check` clean (154 formatted, 142 without warnings).
  `npm test` 51 files / 727 passed, including `src/net/messages.test.ts` (85). The invite button
  and the join address are not on the page yet, so they were not exercised in a browser.

## Your task

A player at a table they created can send a link. Opening it fills the join screen. The friend
presses Join table. That press is the only `lobby.join`. Do not join from loading the address.

1. Address. `/skull-king/online/join/ABCDEF` is the join screen with that code.
   `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, six characters. Accept lower case and use the upper-case
   code. A suffix that is not six of those characters opens the empty join screen, the one
   already at `/skull-king/online/join`. Follow the `/players/{id}` pattern in
   `web/src/router/addresses.ts`: `settle` and `routeOf`. The route is
   `{ page: 'join', code?: string }`.
2. Join screen. `Join` in `web/src/online/OnlineScreens.tsx` starts with `route.code` in
   `#table-code` when the address has one. Do not submit on open. Join table still sends
   `lobby.join` with `{ code }`. Empty join keeps "Ask the host for the 6-character code." A
   filled one says "This invite is for one table." Existing refusals stay:
   `LOBBY_NOT_FOUND`, `LOBBY_FULL`, `LOBBY_STARTED`, `ALREADY_SEATED`. While `welcome` already
   has a lobby or a queue, keep showing that screen. Do not send `lobby.join` and do not leave
   the table because of the address.
3. Invite, on an open table whose `standing` is not `true`. Every member can press it, host or
   guest. The url is `location.origin + '/skull-king/online/join/' + lobby.code`. Do not read a
   server origin. Where `navigator.share` exists, the button opens the sheet with title
   `Skull King Tavern`, text `Join my table`, and that url. A dismissed sheet is not an error.
   If share is missing, or it fails for a reason other than dismiss, copy the url. The button
   reads Invite, and Copied for two seconds after a clipboard write, as Copy does today. If both
   fail, leave the button as Invite.
4. Private table (`visibility: 'private'`). Keep the code plate and the six characters, so they
   can still be read aloud. The button copies the url, not the bare code. Host hint when one
   seat is filled: "Add a bot, or send the invite." when the table seats bots, and "Send the
   invite. The table can start once a second pirate sits down." when it does not.
5. Public table a player created (`standing` omitted). No code plate. One Invite button, same
   share and copy. A house table (`standing === true`) has neither the button nor a code plate.
6. Mock. Player-created lobbies omit `standing`. A house lobby the mock builds sets
   `standing: true`. Joining by the code in the address uses the existing `lobby.join`.
7. Pen. In the file that already holds `Friends · waiting` and `Public · waiting`
   (`design/skt.pen`; also `design/web.pen` if those frames are there), the private waiting
   control says Invite and the code stays visible. A player-created public table shows Invite
   and no code. A standing house table shows neither. The join screen has a state with the code
   already filled. Draw the states the screen can be in. Grok did not edit a pen file.

## Contracts

- Frozen: protocol 1, the meaning of `standing`, `lobby.join`, the six-character code, and the
  path `/skull-king/online/join/` plus that code. A house table keeps `standing: true` for its
  whole life. Its game does not return to the lobby, so the link then gets `LOBBY_NOT_FOUND`.
  A player-created table returns to `open` for a rematch with the same code and still omits
  `standing`, so the link still works.
- You may change `web/` outside `web/src/protocol/generated/`, and the pen files. Do not change
  `server/`, `docs/protocol.md`, the generated types, or `fixtures/`.

## Done when

From `web/`: `./node_modules/.bin/vp check` clean, `npm test` passes, and the new tests cover the
address, a prefilled join that does not send `lobby.join` until Join table, Invite on a private
table and on a public table without `standing`, and no Invite when `standing` is true. The pen
file is saved.

## Report back

Write the return handover to `docs/handover/` and print the same text in one code block. Name
your commit, the test counts, and what Invite and the join address do. Say whether a house table
shows Invite. No further server work unless the page needs a field this handover does not have.
