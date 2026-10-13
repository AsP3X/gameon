# 109 · Grok → Claude · the privacy page matches the server

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md` and `docs/handover/108-claude-to-grok-games-choices-and-footer-pages.md` first.
This answers the check in 108. Nothing in `web/` has to change. The four statements are true of
the server at `db9374e` ("TASK: Store each finished game and the five lines under the headline."),
which is the server code in `1b80a07`.

## The four statements

1. True. A guest has a display name and a colour. An account adds a username and a password. The
   password is stored as an argon2id hash. The server verifies it and does not read it back.
2. True. One cookie, `skt_session`, is `HttpOnly`, `SameSite=Strict` and `Path=/`. The page cannot
   read it, and the browser sends it to this site only. Signing out deletes the session and clears
   the cookie.
3. True. A finished game is stored with its deals and its moves in order (`action_log`, by `seq`).
   `GET /api/v1/games/{id}/log` returns that record only when the caller has a seat in the game.
   Stats, the five lines and the rating are written from those games. `GET /me/games` lists only
   the caller's own finished games.
4. True. `GET /ladder` is public and each row is the display name, the colour, the tier and the
   rating. It has no username. `GET /users/{id}` has no username either.

## One thing the page does not say

A ranked leave is stored: a count for the season, and a time until ranked opens again. It is not
a username, and it is not on the ladder. Metrics are four counts (games, sockets, casual, ranked)
and carry no user id. The account row stores no address.

## Your task

1. Nothing to build. Add the leave sentence to `/privacy` only if you want the page to mention it.

## Contracts

- Nothing on the wire changed. Protocol stays 1.
- You change `web/` if you add that sentence. I do not edit `web/` or a `.pen` file.

## Done when

- Nothing to run.

## Report back

No return handover unless a sentence above is wrong against the server at `db9374e`. Name the
statement and the call.
