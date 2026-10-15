# 164 · Grok → Claude · the Ocho client

You are Claude, the callee, working on Skull King Tavern
(`/Users/niklas/Documents/development/gameon`), branch `feature/game-ocho`. Do this work
yourself. Do not run `claude` or `grok`. Do not edit `server/`.

Read `docs/ocho-protocol.md`, `docs/drafts/ocho/rules.md`, `docs/agent-rules/web-quality.md`,
and `docs/agent-rules/design-sync.md` first. The screens are already drawn in
`design/ocho.pen` (table, sit down, how to play, between hands, match won) and
`design/gameon.pen` (the live card). Build the page from those frames. Do not redraw them
unless a control you need is missing, and then only through Pencil.

## What exists

`ocho-server` is a separate process from the account API. It listens on
`127.0.0.1:8091`. The page will proxy `/ocho/` to it. The player is already signed in:
send the existing `skt_session` cookie. Ocho does not log anyone in.

`docs/ocho-protocol.md` is the wire. A frame is one JSON object with `t`.

## Your task

1. In `web/vite.config.ts`, proxy `/ocho` to `http://127.0.0.1:8091` with websockets, the
   same way `/api` is proxied.
2. Add Ocho to the Games shelf as the live card drawn in `design/gameon.pen`: under Skull
   King, facts `2–8 players · Cards`, the line "Match a colour or a number, then be the
   first to play your last card.", pill Live, and two ways, A table and Teams. Play opens
   sit down. How to play opens the Ocho rules page. No bots, no ranked, no pass-and-play.
   Take Ocho out of Coming soon.
3. Sit down: players 2–8, Free-for-all or Teams (Teams locks the count at 4), One hand or
   First to 500, then Start. Start sends `ocho.create` with those settings, then
   `ocho.ready` for the host. Show the code. A second player joins with the code
   (`ocho.join`) and readies. When the table is full and ready, the host's Start on that
   waiting screen sends `ocho.start`.
4. The table renders `ocho.view`. Eight seats, the hand, the discard, the draw pile, the
   colour and symbol, the direction, the stack total, and the action the view's `must`
   field names. Play sends `ocho.play`. A wild sends `color`. Draw, keep, opening colour,
   and next hand send `ocho.draw`, `ocho.keep`, `ocho.color`, and `ocho.next`.
   X-Ray cards from `view.xray` sit on those seats on a wide window and in rows on a
   narrow one. Never show another seat's hand. A partner hand is present only when the
   server sent `partnerHand`.
5. Between hands and match won use `handWinner`, `handPoints`, `scores`, and
   `matchWinner`. Next hand and Back to games are the buttons already named in the frames.
6. How to play is the page in the drawing, with the words from `docs/drafts/ocho/rules.md`.
7. From `web/`: `npx vp check` and `npx vp test`. Node is at
   `/tmp/node-v22.23.3-darwin-arm64/bin` if `node` is not on `PATH`. Do not install Node.

## Git

Branch `feature/game-ocho`. Commit only `web/` and a return handover. Do not push. Do not
create a branch. Prefix `ADD:`. No AI attribution. Author Niklas Vorberg
<services@vorberg-webmail.de> if git would invent a hostname email.

## Report back

Write `docs/handover/165-claude-to-grok-ocho-client.md` and print it in one fenced code
block. Name the routes you added and quote the gate counts.
