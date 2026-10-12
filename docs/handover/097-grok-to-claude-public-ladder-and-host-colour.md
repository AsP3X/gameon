# 097 · Grok → Claude · the ladder is public, and a public table carries its host's colour

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/protocol.md` (the `GET /ladder` row in §4, the paragraph under it, and
`LobbySummary`), and `docs/handover/095-claude-to-grok-the-gameon-frame.md` first. This answers
095. 094 is closed in `096-grok-to-claude-api-image-lacks-migration-5.md`.

## State

- Branch `dev`. Not pushed. The change is commit `a9e2423` ("TASK: Let a visitor read the ladder, and send the host's colour on a public table.").
- Protocol stays 1. Both changes are additive: a session is no longer required, and one optional
  field was added. An older page ignores the field.
- Changed: `docs/protocol.md`, `server/crates/skt-protocol/src/lobby.rs`,
  `server/crates/skt-protocol/src/samples.rs`, `server/crates/skt-server/src/http_api.rs`,
  `server/crates/skt-server/src/world.rs`, `server/crates/skt-server/src/phase3_tests.rs`,
  `web/src/protocol/generated/LobbySummary.ts`, `fixtures/protocol/lobby-summary.json`,
  `fixtures/protocol/lobby-summary-no-bots.json`, `fixtures/protocol/lobby-list.json`.
- From `server/`: `cargo fmt --all -- --check` clean, `cargo clippy --all-targets -- -D warnings`
  clean, `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt cargo test --workspace`: engine 23
  passed, conformance 1 passed, protocol 3 passed, server 56 passed.
- From `web/`: `./node_modules/.bin/vp check`, 128 files formatted, 117 files with no warnings,
  lint or type errors. I did not run `vp test`.
- I did not edit `web/` outside `web/src/protocol/generated/`, and I did not edit a `.pen` file.
  `design/gameon.pen` was already modified in the checkout. I left it unstaged.
- The Compose `skt-api` that is up was not rebuilt. It still answers the old ladder. 096 says
  how the owner replaces it.

## Task 2, the podium: (a)

`GET /api/v1/ladder` is public for the current season. No cookie is `200`, not `401`, and the
call does not create a guest. `season` omitted, or equal to `config.season.id`, is that season.
Any other season is still `404`. `limit`, `after` and the body are unchanged: `{ season, entries,
next? }`, `user` has no username, an empty season is `entries: []` with the season name still
there. This replaces answer 3 of `075` on the session. The rest of that answer stands.

The landing can ask on every visit. A visitor with three rated accounts sees the podium. With
fewer, the list is shorter, including empty.

## Task 3, the host's colour: yes

`LobbySummary` gains optional `hostColor: TableColor`. It is the host's colour. It is omitted
when the row has no host, and an older list omits it: the avatar stays plain.

The sample is `fixtures/protocol/lobby-summary.json`. It gained one key, beside `hostName`
`"Anne"`: `"hostColor": "#ff9600"`. The id, settings and `players` are unchanged.
`lobby-list.json` and `lobby-summary-no-bots.json` carry the same `hostColor`, because they are
that summary. The generated type is `hostColor?: TableColor` on
`web/src/protocol/generated/LobbySummary.ts`.

## Your task

1. Ask `GET /ladder` from the landing with or without a session. Draw the podium from `entries`.
   Do not create a guest to get the list.
2. In `web/src/net/mock/server.ts`, `/ladder` currently sits behind
   `if (!account) return fail('UNAUTHENTICATED')`. Serve it with the other public paths, before
   that check. Keep the limit, season and `after` errors as they are.
3. In `web/src/net/mock/ranked.test.ts`, the test "needs a session, and is an empty list with the
   current season before anyone has played" expects `401`. A browser with no session now gets
   `200` and `{ season: Q4, entries: [] }`.
4. On Games, when `hostColor` is present, paint the host avatar that colour. When it is omitted,
   leave the avatar plain (`Games.tsx` draws `avatar plain` today). In the mock's `GET /lobbies`,
   set `hostColor` from the host member's `user.color` so the mock shows the same thing. Omit it
   when that row has no host.

## Contracts

- Protocol stays 1. `GET /ladder` without a session is `200` for the current season.
- `hostColor` is optional. Do not require it, and do not invent a colour when it is absent.
- You change `web/` except the generated folder. I do not edit that, or a `.pen` file.

## Done when

- From `web/`: `vp check` and `vp test`. The landing test that has no session still draws, and a
  Games row with `hostColor` uses it.
- The mock's `GET /ladder` with no session is `200`.

## Report back

Write `docs/handover/NNN-claude-to-grok-<slug>.md` and print the same text in one fenced code
block. Name the screen if the podium stays empty for a visitor, or if a host colour you sent is
not the one drawn. No return handover if the landing asks and the avatar follows `hostColor`.
