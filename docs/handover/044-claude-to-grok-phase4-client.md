You are Grok, the server engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the Rust server, Compose, deploy
files and CI. Claude writes `web/` and `design/web.pen` and never edits `server/` or `deploy/`. You
and Claude cannot see each other's sessions: the owner pastes handover prompts between you. This is
handover 044, the answer to 043.

READ FIRST
1. `AGENTS.md`, then `docs/agent-rules/ownership-and-handover.md`, `git.md` and
   `server-authority.md`.
2. `web/src/sw.ts` (60 lines) and the `precache` plugin in `web/vite.config.ts`.
3. `deploy/nginx/nginx.conf.template` and `nginx-tls.conf.template`, which task 1 is about.

STATE

`dev` is `eee4b54` "Merge the Phase 4 client onto dev: installable, offline, accessible", plus the
merge that brings this text. `origin/dev` is `7954631`: nothing after it is pushed. The work was on
`feature/claude-phase4`, cut from `7954631`:
- `58c0042` Make the page installable and let it open with no network.
- `1a2dbd7` Keep the keyboard through redraws, sheets and screen changes, and make every table
  control 44 px.
- `b97449e` Let the record be asked for again, and test "Reload to update" on the page.
- `c795550` Darken four text colours of the light theme to 4.5:1.
- `4bc0653` Draw the Phase 4 client changes in design/web.pen. The owner saved the file.
  `git rev-parse dev:design/web.pen` is `dd9e67c`, and was `be84721`.
Nothing in `server/`, `deploy/`, `.github/`, `docs/protocol.md` or the generated tree changed.

1. Installable, and open with no network.
- `web/public/manifest.json`, icons in `web/public/icons/` (drawn from the mascot by
  `web/scripts/generate-icons.mjs`), and the links in `web/index.html`.
- `web/src/sw.ts` is built to `/sw.js` next to the page. When the build is done, the `precache`
  plugin writes the list of built files into it, and a cache name made from their content. A
  development build has no worker: `web/src/pwa.ts` registers it only when `import.meta.env.PROD`.
- What the worker does, and the test for each is in `web/src/sw.test.ts`:
  - `/api/...` is never answered by it, for any method: every answer of the server comes from the
    server. Nothing a seat sees about a game, a table or an account can be an old copy.
  - A navigation is fetched from the network first, and the kept `/index.html` is used only when
    there is no network. So "Reload to update" after `PROTOCOL_UNSUPPORTED` gets the new page.
  - A file of the build is answered from what it kept. It ignores `Vary` when it looks one up:
    with `Vary: Origin` on the answers, the page's own requests for its script and fonts did not
    match what the worker had stored, and the page stayed blank with the server gone.
- With the server out of reach, the hub's notice now also says "Bots, one phone for the crew and
  the scoresheet need no connection." and has a "Play offline" button back to the home screen.

2. Accessibility, online screens and table.
- The table is rebuilt from strings on every change, and the control that had the keyboard was
  gone after it. `render.ts` now finds that control again (by id, or by tag, data attributes and
  position), hands the keyboard to a sheet or the curtain when it opens, marks what is behind it
  `inert` (the scrim stays live), and gives the keyboard back to what opened it.
- A new online screen takes the keyboard to its title. The lost-connection overlay takes it to its
  button. The record is `role="dialog"`, closes on Escape, and the table under it is `inert`.
- `.icon-btn` is 44 px (was 40), the "How to play" pill is 44 px high (was 38), and "Last trick"
  has a 44 px touch area.
- Measured in the page at 390 and 360 px against the in-page mock: no control under 44 px on the
  hub, profile, public tables, new table, join, lobby and through one full round at the table; no
  control without a name; no horizontal scroll at 360 px.
- Four text tokens of the light theme are darker, by the owner's choice: `--muted` `#6b6b6b`,
  `--blue-ink` `#0a6a9f`, `--green-ink` `#357000`, `--red-ink` `#c41a1a`. They are used for text
  only. Still under 4.5:1 and left as they are, also by the owner's choice: white labels on the
  green, blue and gold fills and on avatars (2.09 to 2.44), the table's faint feed lines (2.03),
  and the gold "Dealer" pill (2.00).

3. Empty and error states. Every online screen already had loading, empty, error and disconnected
states. The record had no way to ask again: after a request that got no answer it now shows the
message and "Try again". For a game the server does not have (`NOT_FOUND`) it shows the server's
message and no button, as before.

4. "Reload to update" already existed for `PROTOCOL_UNSUPPORTED` on the hub and over the table.
`web/src/online/OnlineScreens.test.tsx` now sends a `hello` with protocol 0 through the whole page
and checks the notice, the button, and that the page does not try again by itself.

5. `design/web.pen`, 124 top-level frames where it had 123: the four colour variables; icon
buttons at 44 px and info pills at 44 px wherever they appear; "Play offline" in
`Online · hub states`; a "no answer" state in `Online · the record states`; a new `App icon`
frame. Light and dark. Checked before the commit by hashing the saved file against the file of
`7954631` in Pen: with those changes taken out, every frame and every other variable hashes to its
old value.

Gate on `dev` at `eee4b54`, from `web/`:
- `npx vp check`: clean. 106 files formatted, 97 with no lint or type errors.
- `npx vp test`: 33 files, 427 tests passed.
- `npx vp build`: built. `dist/sw.js` holds the file list and neither marker.
- On the branch at `c795550`: `SKT_E2E=1 SKT_E2E_TARGET=mock npx vp test e2e/pwa.e2e.ts
  e2e/four-players.e2e.ts`: 2 files, 9 tests passed. `pwa.e2e.ts` is new: it builds the page,
  serves it with `vp preview` in front of the mock host, stops both, reloads, and the page still
  opens, says "Can't reach the tavern" online, and deals a game against bots.

Not done:
- The ranked smoke against the Rust server was not run: nothing answered on `127.0.0.1:8080`.
  The table's redraw and the end screen's record changed under it.
- Nobody listened to the page with a screen reader. The numbers above are measurements.
- The page was not installed from a real HTTPS origin. `pwa.e2e.ts` runs on `localhost`.
- Heading levels are as they were: the online screens start at `h2` and have no `h1`.

YOUR TASK

1. nginx, both templates. `/sw.js` and `/manifest.json` are served by `location /` with no
   `Cache-Control`. Give each its own `location =` with the security headers and
   `Cache-Control "no-cache, must-revalidate"`, as `/index.html` has. A worker a proxy or a
   browser keeps would go on serving the old file list after a deploy. Do not put `/sw.js` under
   `/assets/` and do not give it a long lifetime. The CSP needs no change: `worker-src 'self'`
   is there, and the manifest falls under `default-src 'self'`.
2. Run the ranked smoke from `web/` against the Rust server on this `dev`, the way you ran it for
   042, and report what it printed.
3. CI, if you want it there: `e2e/pwa.e2e.ts` needs Chrome or
   `npx playwright-core install chromium`, and no server:
   `SKT_E2E=1 SKT_E2E_TARGET=mock npx vp test e2e/pwa.e2e.ts`. It runs `vp build` itself and sets
   `NODE_ENV=production` for it, because the test runner's own `NODE_ENV` makes a development
   build, which has no worker.
4. If a deploy check loads the page with `wget` or `curl`: `/sw.js` must answer 200 with a
   JavaScript content type, and `/manifest.json` with JSON. `X-Content-Type-Options: nosniff` is
   set, so a worker served as anything else is refused by the browser.

CONTRACTS

- Frozen: `docs/protocol.md`, protocol 1, the generated tree, both fixture trees. Nothing here
  touched them, and the reload copy needed no new sentence.
- The worker is not a security control and decides nothing. It must never answer for `/api`. If
  you move the API to another path, tell Claude first: the worker tells the server's answers from
  the build's files by that prefix.
- Yours: `server/`, Compose, `deploy/`, CI, the generated protocol tree.
- Claude's: `web/` except `web/src/protocol/generated/`, and `design/`.

HOW THE MACHINE WAS LEFT

- Worktree `/Users/nvorberg/Documents/development/skt-claude-phase4` on `feature/claude-phase4`,
  level with `dev`. The branch and the worktree are kept.
- No dev server of this session is running.

DONE WHEN

- `curl -sI` on `/sw.js` and `/manifest.json` of the production image shows
  `Cache-Control: no-cache, must-revalidate` and the security headers.
- The ranked smoke passes against the Rust server on this `dev`.

REPORT BACK

A paste-ready prompt for Claude, written to `docs/handover/NNN-grok-to-claude-<slug>.md` and
printed in one code block: the `dev` commit, each command and what it printed, and the two
`curl -sI` answers.
