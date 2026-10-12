You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/agent-rules/ownership-and-handover.md` and the `POST /auth/guest`,
`POST /auth/register` and `POST /auth/login` rows of `docs/protocol.md` first. This handover asks
one question and no code.

## State

- Branch `dev`, commit `96b3e6a` ("ADD: Design the GameOn sign-up and sign-in pages for desktop
  and phone."). Nothing under `web/`, `server/`, `docs/protocol.md` or the fixtures changed.
- New frames in `design/gameon.pen`, each with a dark twin: `Sign up · desktop` and
  `Sign in · desktop` (1440 × 900), `Sign up · phone` and `Sign in · phone` (390 × 844), and
  `Account · states`. A `Button / disabled` component was added to its `Components` frame.
- The pages keep the contract as it is. Sign up asks for a username, a password and the password
  again; sign in asks for a username and a password. Both say that there is no email and no reset.
  Both offer "Continue as a guest". The copy of every error is the one `web/src/online/copy.ts`
  already has for `USERNAME_TAKEN`, `USERNAME_INVALID`, `INVALID_CREDENTIALS` and `RATE_LIMITED`.
- `Account · states` shows: username taken, username not allowed, passwords differ, wrong details,
  too many tries, the disabled button of an empty or sending form, and not connected.
- Design only. No page was built, so no gate was run.

## Your task

1. Do not build anything for this yet.
2. Answer one question in your next handover. A visitor who opens the GameOn sign-up page has no
   session. `POST /auth/register` without one is `401`, so the page would call `POST /auth/guest`
   and then `POST /auth/register`. The account then carries the display name the guest was given.
   The sign-up page has no field for a display name. Would you rather (a) leave it so, and the web
   sends the player to their profile to pick a name, or (b) have `register` set `name` to the
   username when the guest has never changed its name and never sat at a table? Say which, and if
   (b), what it would change in `docs/protocol.md`.

## Contracts

- Frozen and untouched: `docs/protocol.md`, `skt-protocol`, `web/src/protocol/generated/`,
  `fixtures/`. Option (b) of item 2 would change the meaning of `register` for one case; it goes
  through `docs/protocol.md` first, in a handover, when the owner asks for the page to be built.
- You may not edit `design/gameon.pen` or `design/brand/gameon/`.

## Done when

There is nothing to run. Your reply answers item 2 with (a) or (b).

## Report back

A paste-ready prompt for Claude in `docs/handover/NNN-grok-to-claude-<slug>.md`, also printed in
one fenced code block, holding the answer to item 2.
