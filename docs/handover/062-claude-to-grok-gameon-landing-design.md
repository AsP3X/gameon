You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/agent-rules/ownership-and-handover.md` and `docs/protocol.md` (the
`GET /ladder` row, `Season`, `Rating` and the tier bands) first. This handover asks one question
and no code.

## State

- Branch `dev`, commits `0e7e525` ("ADD: Design the GameOn landing page for desktop and phone in
  design/gameon.pen.") and `b65b46d` ("TASK: Put a ranked panel with season, podium and tiers
  under the hero of the GameOn landing page."). Nothing under `web/`, `server/`,
  `docs/protocol.md` or the fixtures changed.
- `design/gameon.pen` is the design file of GameOn, the collection this site becomes. It holds the
  landing page in four frames: `Landing · desktop` (1440 wide), `Landing · phone` (390 wide) and a
  dark twin of each. It carries the same tokens and components as `design/web.pen` (buttons, pills,
  avatar, mascot, five cards) and the GameOn logo of `design/brand/gameon/`.
- The desktop page, top to bottom: navigation (Games, Ways to play, Ladder, Sign in, Play now); a
  hero with Skull King as the featured game; the ranked panel; three ways to play (solo, one
  screen, online); the game overview (Skull King live, five placeholder games marked "Soon", a
  "suggest a game" tile); a call to action; the footer.
- The phone page is shorter on purpose: headline, the Skull King card with the one Play button,
  the ranked panel, three ways to play in one line each, the coming games as six small tiles, the
  footer.
- The ranked panel sits directly under the hero on both. It shows the season's name ("Season 2026
  Q4"), the first three places of the Skull King ladder as a podium (name, rating; on desktop the
  tier too), "Find a ranked game", "See the ladder" and "Ranked needs a free account". Desktop also
  lists the seven tiers in order. The sample numbers follow the contract: ratings 52, 49 and 47,
  tiers Skull King and Pirate Lord.
- Design only. No page was built, so no gate was run.

## Your task

1. Do not build anything for this yet.
2. Answer one question in your next handover: the landing page shows the first three rows of the
   Skull King ladder (rank, name, colour, `rating.value`, `rating.tier`) and the season's name to a
   visitor **without a session**. Today `GET /ladder` needs a session and answers `401` without
   one. Is a public, read-only, cached "top N" of the current season (N at most 10, no pagination)
   acceptable to you, and under which path would you put it? If you would rather not expose it,
   say so, and the design changes to show the podium to signed-in players only.
3. Does `GET /config` answer without a session, so the page can read `config.season.name` from it?
4. If you know of a second number the landing page could show honestly without a session (tables
   open right now, players online), name the endpoint you would offer. The design does not depend
   on it.

## Contracts

- Frozen and untouched: `docs/protocol.md`, `skt-protocol`, `web/src/protocol/generated/`,
  `fixtures/`. Item 2 would be an additive change (a new endpoint, no version bump); it goes
  through `docs/protocol.md` first, in a handover, when the owner asks for the page to be built.
- You may not edit `design/gameon.pen` or `design/brand/gameon/`.
- `AGENTS.md` and `docs/agent-rules/design-sync.md` name only `design/web.pen`. Proposal for the
  owner, not done here: name `design/gameon.pen` there as the design file of the GameOn shell.

## Done when

There is nothing to run. Your reply answers item 2 with yes and a path, or no, and item 3 with yes
or no.

## Report back

A paste-ready prompt for Claude in `docs/handover/NNN-grok-to-claude-<slug>.md`, also printed in
one fenced code block, holding the answers to items 2 and 3 and, if any, item 4.
