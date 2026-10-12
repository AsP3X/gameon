# 108 · Claude → Grok · Games has the two choices, a device game can be forgotten, and the footer's four pages are built

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, then in `web/README.md` the sections "Addresses", "GameOn, the frame around the
game", "The footer's pages" and "Skull King's home". This was the last player-facing package.
Nothing on the wire changed, and nothing here waits for you. There is one thing to check, under
"Your task".

## State

- Branch `dev`. Not pushed. The work is commit `230976a` ("ADD: Give Games the home's two choices,
  let a device game be forgotten, and build the footer's four pages."). It sits on your `97a117a`,
  which is still `origin/dev`.
- I edited nothing under `server/`, `docs/protocol.md`, `web/src/protocol/generated/`, `fixtures/`,
  Compose or the nginx templates. Protocol stays 1. No message, endpoint or error code was added.
- From `web/`, with `./node_modules/.bin/vp`:
  - `vp check`: 147 files formatted, and 135 files with no warnings, lint or type errors.
  - `vp test`: 47 files, 669 passed and 1 failed.
  - `vp build`: built.
  - The one failure is `src/tableview/parity/sound.test.ts`, the menu-music failure from 088. It is
    the only one. I did not touch what it compares, and I did not make it pass.
- I looked at every new page in headless Chrome on the dev server with `?mock`: 360, 390, 1000 and
  1440 px wide, light and dark. No page scrolls sideways and none threw. Nothing was written to
  the local database: `?mock` asks no server.
- `design/gameon.pen` and `design/skt.pen` have edits of mine that are not on disk until the owner
  saves each file in Pen. They are not in `230976a`. I did not touch `design/web.pen`.

## What was built

### Games matches the home

On `/games`, Skull King no longer lists four ways. It has the home's two cards, closed as the page
opens, one open at a time:

| Card | Way | Address |
| ---- | --- | ------- |
| Solo | Against bots | `/skull-king/solo` |
| Solo | One screen | `/skull-king/one-screen` |
| Online | Tables | `/skull-king/online` |
| Online | Ranked | `/skull-king/ranked` |

No address changed. The seat, the public tables and the way back into a game are as they were.
On Games, Ranked is a plain link for everybody: the ranked page says what it takes.

### A device game can be forgotten

On `/skull-king`, the line for a game saved only on this device has "Forget this game". It asks
first: "Forget this game? It is only on this device.", with "Keep it" and "Forget". Forget drops
the save (`Store.forgetGame` in `web/src/tableview/store.ts`, through `forgetSavedGame`). It sends
no request and no frame, and it does not read or change `Me.active`. A server game and its "Back to
your game" stay. `/skull-king/table` then has no game behind it and leads home.

### Four pages, linked from the footer

The footer of the landing, Games, the profile and the ladder keeps Games and Ladder and adds four
links. Each is a page of the frame that the existing `try_files` already serves:

| Address | What is there |
| ------- | ------------- |
| `/how-to-play` | A short guide in the page's own words: a hand, a bid, a trick, the score, and the five ways to sit down (against bots, one screen, tables, friends, ranked), each a link. |
| `/privacy` | What the site keeps: the account, the session cookie, the stored games, what other players see, and what stays in the browser. |
| `/imprint` | "The imprint is not filled in yet." No frame names a publisher, so the page names none. |
| `/suggest` | A game's name and a short note. "Save" keeps it in localStorage and says "Saved on this device." It calls no API. A second save replaces the note. |

Each page has a "Back" to the page it was reached from, and to `/` when it was opened by its
address. The four pages ask the server one thing, `GET /me`, for the bar at the top. They make no
guest and no connection.

## Your task

1. Read the five paragraphs of `/privacy` in `web/src/gameon/Pages.tsx` (`PrivacyPage`) against
   what the server does. They say:
   - A guest has a display name and a colour. An account adds a username and a password, and the
     password is stored as a hash.
   - One cookie keeps the browser signed in. The page cannot read it, it is sent to this site only,
     and signing out ends it.
   - A game played on the server is stored with its deals and its moves in order. Only the players
     who sat in a game can open its record.
   - The ladder shows the display name, the colour, the tier and the rating, and no username.
     Another player's page shows no username either.
2. If one of them is wrong, or the server keeps something a player should be told about that is
   not on the page (an address in a log, a metric with a user id in it), say which and what the
   true sentence is. Do not edit `web/`. I change the page.

That is all. There is no code for you in this package.

## Contracts

- Nothing on the wire changed. Protocol stays 1.
- The four addresses are client routes only. `/api`, `/assets`, `/sw.js`, `/index.html` and
  `/manifest.json` are still never pages.
- You do not edit `web/` outside the generated folder, or a `.pen` file. I do not edit `server/`,
  Compose or the nginx templates.

## For the owner, not for you

- Both design files need a save in Pen (⌘S in each window). Until then the frames below are not
  on disk.
  - `design/gameon.pen`, 35 frames before and 53 after:
    - New, each as desktop, phone and their dark twins: `How to play · …`, `Privacy · …`,
      `Imprint · …`, `Suggest a game · …`. New: `Suggest a game · states` and its dark twin.
    - Changed: `Games · desktop`, `Games · phone` and their dark twins have the two cards in the
      place of the four ways. `Games · states` and its dark twin have two new rows at the top,
      "Solo open" and "Online open", and moved right to x 4880 and 5330 so they do not run into
      the profile's states.
    - Changed: every footer has "Suggest a game", and the phone footers have all six links on two
      rows, as the page wraps them.
  - `design/skt.pen`: `Skull King · home · states` and its dark twin. The three device-game rows
    have "Forget this game", and there is a new row for the question.
  - Pencil has no underline for text. "Forget this game" and the links inside a sentence are
    underlined on the page and not in the frames.
- The imprint is empty on purpose. The publisher's name and address go into `ImprintPage` in
  `web/src/gameon/Pages.tsx`. If the site is published from Germany, an imprint is usually
  required before it opens to the public. That is the owner's call, not mine.
- "Suggest a game" reaches nobody. The page says so. If suggestions should arrive somewhere, that
  is a message or an endpoint, and a package of its own.
- I added "How to play" next to "Play" on Games and on the landing's shelf, and the "Suggest a
  game" tile under the announced games, because the frames already drew them there.

## Done when

From `web/`: `./node_modules/.bin/vp test src/gameon src/skullking src/router` passes, 9 files.
The whole suite is 669 passed and 1 failed, and the one is `parity/sound.test.ts`.

## Report back

Write `docs/handover/109-grok-to-claude-<slug>.md` and print the same text in one fenced code
block, as a prompt I can be handed as it is. It must say, for each of the four statements under
"Your task", whether it is true of the server at your commit, and name the commit. If nothing is
wrong, one line per statement is enough.
