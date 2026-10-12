# 074 · Claude → Grok · planning the platform update

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/agent-rules/ownership-and-handover.md`, your own
`docs/handover/069-grok-to-claude-solo-on-the-server.md` (the build order at its end) and
`docs/handover/071-claude-to-grok-tables-and-profile-design.md` first. The owner wants the two of
us to agree on how the big update is built before anyone builds. This is my half of that plan and
the questions I need you to answer. No code in this package, on either side.

## State

- Branch `dev`, commit `75ba44b`. The designs of the update are committed in `e942ae2`:
  `design/skt.pen` (Skull King inside GameOn: home, solo, the solo table and its ends, the three
  online doors, friends, public, ranked) and `design/gameon.pen` (landing, sign up, sign in,
  Games, profile). Every screen has a phone and a dark twin; the new ones have a desktop.
- Not drawn yet: the ladder as a GameOn page (the navigation has "LADDER"), the pages behind the
  footer (How to play, Privacy, Imprint), a no-bots waiting screen, and `design/admin.pen`.
- Nothing is built. `docs/protocol.md`, `skt-protocol`, the generated TypeScript, both fixture
  trees and the engine are as they were. 069 is still a proposal.
- Open from earlier handovers, all yours to answer: questions 1 to 4 of
  `071-claude-to-grok-tables-and-profile-design.md` (table size, pace and bot level on a friends
  or public table; whether a lobby's seat count includes bots; "ADD A BOT" on a no-bots table;
  whether the cooldown end is still sent), and the question of 064 (sign-up without a session:
  (a) the account keeps the guest's name, or (b) `register` sets `name` to the username). I have
  no answer to either on record.
- Two files carry the number 071. This one refers to the tables-and-profile file by its full name.

## What the update is, as the designs draw it

1. **GameOn, the platform.** Landing, sign up, sign in, Games, profile, ladder, footer pages.
2. **Skull King, a game inside it.** Its home with four ways in; solo on the server with the
   device as the fallback; the online index and its three doors; ranked.
3. **The record.** Five lines per player, best score, the list of finished games.
4. **Signals**, server only. **Admin**, a later app.

## How the web is built today, and what that means

- `web/` is one page with no addresses. `App.tsx` mounts the legacy renderer, which owns the home
  screen, solo, one screen, the scorekeeper and the table. "Play online" hands over to the React
  screens in `web/src/online/`. Which screen shows is state in memory, not a URL.
- The update turns that around: GameOn is the frame, in React, with addresses; Skull King's home,
  solo setup and the online screens are React pages inside it; the legacy renderer keeps only the
  table, one screen and the scorekeeper. The table is still ported piece by piece, never rewritten.
- Solo today never touches the socket. After the update a solo game is a `RemoteTable` like any
  online game, with no deadline, and the local table runs only when the socket is down at the start.

## The web lane I propose

Each package ends with `vp check`, `vp test`, `vp build`, the designs in sync, and a handover.

| | Package | Needs from you first | Contract |
| - | ------- | -------------------- | -------- |
| W0 | **Addresses.** A router and one address per page: `/`, `/sign-in`, `/sign-up`, `/games`, `/profile`, `/players/{id}`, `/ladder`, `/skull-king`, `/skull-king/solo`, `/skull-king/online`, `/skull-king/online/public`, `/skull-king/ranked`, and the table. Reload and back work. The service worker serves the page for every one of them. | Every non-`/api` path answers with the page, in dev, Compose and production (question 1). | None |
| W1 | **The GameOn frame.** Navigation, footer, landing, sign up, sign in, Games. Reads `Me`, `GET /lobbies` and the auth endpoints as they are. | The answer to 064. | None |
| W2 | **Skull King's home.** The four ways in, the states, the jump-back block. The legacy home screen goes. | `Me.active` with `table`, `round`, `rounds`, `bots` (your Package 1). Until then the solo jump-back is the offline save only. | Additive |
| W3 | **Solo on the server.** Setup page, `solo.start`, the table with no ring, "Saved" and "Offline" pills, connection lost, the leave confirm, the three ends. The mock server in `web/src/net/mock` learns `solo.start`. | Your Package 1, with its samples in `fixtures/protocol/`. | Additive |
| W4 | **The five tables.** The online index, friends and public (new game, waiting, list), ranked and its states, mostly the screens in `web/src/online/` redrawn. | Your Package 2, and the answers to 071's questions 1 to 4. | Additive |
| W5 | **Profile and ladder.** The five lines, best score, "Your games" with "Load more", another player's page; the ladder as a GameOn page (designed first). | Your Package 3. | Additive |

W0 and W1 need no protocol change, so they can run while you do Package 0 and Package 1. From W2
on, each web package starts when your handover names the commit it builds on.

## What I would change in 069's build order

- Add the frame (W0, W1) as its own package next to Package 0. 069 has no place for it, and it is
  the largest piece of web work that does not wait for you.
- Package 0 should lock the answers to 071's four questions along with the words, so friends and
  public are not built on a guess.
- The rest of 069's order stands: solo, the five tables, the profile, signals, admin later.

## Questions for the plan

1. **Serving the page.** Who answers `/games` or `/skull-king/solo` on a cold load: the server
   binary, nginx, or the Vite dev proxy only? Compose and deploy are yours. Tell me what you will
   set up and whether any address above collides with something of yours.
2. **Is GameOn anything on the wire?** I propose it is not: the cookie, `/api/v1`, `hello`,
   `protocol` 1 and the database stay Skull King Tavern's, and GameOn is the name of the web frame.
   Say if you would rather namespace now (for example `Stats` or the lobby endpoints under a game
   key) so a second game does not force a break later, and what that would cost today.
3. **The ladder.** GameOn's "LADDER" would show Skull King's ranked season, the only one there
   is. Is the ladder endpoint enough for a page of its own, or does it assume the ranked screen?
4. **Deploy order.** Both sides ignore unknown messages, so a new page that sends `solo.start` to
   an old server waits and times out. I assume the server always ships first and the page second.
   Confirm, or say what you want the page to check before it offers Solo on the server.
5. **One release or several.** I would merge each package into `dev` as it passes and move to
   `master` only when W0 to W5 and your Packages 0 to 3 are all in, because a half-built GameOn
   frame around the old screens is worse than either. Say if your side needs earlier releases.
6. **Your lane.** For each of your packages: what it touches, what it needs from me, what can go
   wrong, and roughly how big it is next to the others. Say where you would split a package or
   reorder mine.
7. **The gates that need both of us.** The multi-browser smoke and the cheat probe need a running
   server and the built page. Say who runs them per package and against what.

## For the owner, not for you

Listed here so the plan is in one place. Do not answer these.

- The agent rules name only `design/web.pen`. Once W1 is built, `design/gameon.pen` and
  `design/skt.pen` are the record of the app and `design/web.pen` is not. The rules need to say so.
- `docs/multiplayer-plan.md` still says solo is offline only and has no GameOn in it.
- The Games jump-back line "saved on this device", and the home's Solo card next to an open solo
  game (071, questions 5 and 7).

## Your task

1. Do not build, and do not edit `docs/protocol.md`.
2. Answer questions 1 to 7 above, the four questions of 071 and the question of 064.
3. Give your lane as a table like mine: package, what it needs first, what it changes in the
   contract.
4. Name anything in my lane you think is wrong, too big, or in the wrong order.

## Contracts

- Frozen until the owner says build: `docs/protocol.md`, `skt-protocol`,
  `web/src/protocol/generated/`, both fixture trees, the engine.
- Everything in this handover is a proposal. The owner decides the order and the release.
- You may not edit `web/` or any `.pen` file. I may not edit `server/`, Compose or deploy files.

## Done when

There is nothing to run. Your reply holds the answers and your lane, so the owner can read both
plans side by side and say build.

## Report back

A paste-ready prompt for Claude in `docs/handover/NNN-grok-to-claude-<slug>.md`, also printed in
one fenced code block. `NNN` is the next free number at the time you write it.
