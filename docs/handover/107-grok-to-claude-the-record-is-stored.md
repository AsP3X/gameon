# 107 · Grok → Claude · the record is stored, and the profile was the one that hid the rating

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/protocol.md` (`Stats.byMode`, `GET /me/games`, `Profile`), and
`docs/handover/106-claude-to-grok-the-profile-and-the-ladder.md` first. This closes Package 3. Nothing
in `web/` has to change for the page you built.

## State

- Branch `dev`. Package 3 is commit `db9374e` ("TASK: Store each finished game and the five lines under the headline.").
- `docs/protocol.md` did not change. No sentence moved. Protocol stays 1. I did not edit `web/`
  or a `.pen` file.
- From `server/`: `cargo fmt --all -- --check` clean, `cargo clippy --all-targets -- -D warnings`
  clean, `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt cargo test --workspace`: engine 23
  passed, conformance 1 passed, protocol 3 passed, server 59 passed.
- `skt-server` from this tree, `127.0.0.1:8090`,
  `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt`. From `web/`:
  `SKT_E2E=1 SKT_E2E_TARGET=http://127.0.0.1:8090 ./node_modules/.bin/vp test e2e/ranked-smoke.e2e.ts`:
  1 file, 1 passed in 289 seconds. The boot applied migration 6. I stopped that server.

## What the server answers now

After one solo game (total 5) and one later ranked game (total 40), for that account:

- `GET /me`: headline `games` 1 and `bestScore` 5. `byMode.solo` is that solo game.
  `byMode.ranked` is the ranked game, `bestScore` 40. Ranked is not in the headline.
- `GET /users/{id}`: the same `byMode`, no username. `rating` is present when the account has
  finished a ranked game this season, and `user.tier` is that rating's tier.
- `GET /me/games?limit=2`: both games, newest first. With only those two, `next` is omitted.
  `limit=1` returns the newer game and `next` equal to its id. The page after that id is the
  older game and has no `next`. No session is `401`. A limit of 0, or an `after` that is not one
  of the caller's games, is `400`.
- A new account with no finished game still has `byMode`, and every line is zero.

## Sailor 1ed3

The ladder was right. The profile was wrong. `GET /users/{id}` was sending `rating: null` and
`user.tier: null` even when `ratings` had a row. It now sends the same rating the ladder uses,
including a provisional one. Headline `stats` of all zeros was already right for an account whose
only finished game was ranked: ranked does not move `games` or `bestScore`. That game is on
`byMode.ranked`. Migration 6 fills `mode_stats` from the `game_seats` already stored, so a ranked
game played before this commit is on the line too.

## For the owner

The Account block stays on the profile. It is where a player changes their name and colour and
signs out. A menu on the chip can come later, if you want it.

## Your task

1. Nothing to build.

## Contracts

- Protocol stays 1. `byMode` is present. Omitted, on an older server, still means every line is
  empty. `GET /me/games` is mounted.
- You do not edit `server/`. I do not edit `web/` outside the generated folder, or a `.pen` file.

## Done when

- Nothing to run.

## Report back

No return handover unless a finished game is missing from `byMode` or from `GET /me/games`, or a
ranked game moves the headline `games` or `bestScore`. Name the call and the body.
