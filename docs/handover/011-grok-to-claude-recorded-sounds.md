You are Claude, the web engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write the web client. Grok writes the
Rust server, Compose, deploy files and CI, and never edits `web/` except the generated protocol
tree. You and Grok cannot see each other's sessions: the owner pastes handover prompts between you.
This is handover 011, the answer to your 010. The recorded sounds need nothing from the server.
Phase 1 is not open. C3 has not landed.

READ FIRST, IN THIS ORDER
1. `AGENTS.md`, then `docs/agent-rules/ownership-and-handover.md`, `design-sync.md`,
   `web-quality.md` and `git.md`.
2. `docs/multiplayer-plan.md` Phase 0, item C3. Phase 1 stays closed until the owner opens it.

STATE

No server commit for this package. `web.yml` is unchanged: `web/**` already starts it, and the job
has no audio tooling. The branch `feature/claude-card-play-samples` (`c758955`, the takes in
`dc0a27b` and `0a058dd`) is not on `dev`. `dev` is still `4845b2e`. Grok did not merge it.

The web gate was run from `web/` in `/Users/nvorberg/Documents/development/skt-claude-sound`, which
is that branch, Node v25.2.0 (npm 11.6.2). Node 24 is not installed here. vite-plus 1.1.0 and
vitest 5.0.3 warn that they do not support Node 25. The commands passed, and that worktree was
left clean:

- `npm ci` — added 135 packages, audited 136, found 0 vulnerabilities.
- `npx vp check` — all 47 files formatted; no warnings, lint errors or type errors in 41 files.
- `npx vp test` — 13 files, 105 tests passed. Duration 11.95s.
- `npx vp build` — 50 modules, built in 231ms. `dist/assets/index-BPSUDFHJ.js` 339.92 kB,
  `dist/assets/index-Ds6jq9VY.css` 45.00 kB, and the seven hashed `.wav` files.
- `node scripts/generate-engine-fixtures.mjs --check` — `fixtures/engine matches the generator
  (41 games).`

Static serving of `web/dist` does not exist yet. It is the nginx in the Compose setup, plan Phase
4. When that lands, `/assets/*.wav` will be served like the other content-hashed files:

- Content-Security-Policy allows the page's own `fetch`: `connect-src 'self'`. `media-src` is not
  required.
- The content type may be `application/octet-stream` or `audio/wav`. `nosniff` is fine either way.
- `Cache-Control` matches the scripts and fonts: a long max-age on the hashed name.
- A missing file is not a player-facing error. The client drops that take and, with none left,
  plays the synthesised recipe.

`docs/protocol.md`: None.

YOUR TASK

1. C3, when the owner can sit at the keyboard and save the Pen file: draw `design/web.pen` from
   the running app. This sound package changes nothing a player can see, so the design file does
   not need a change for the takes.
2. Leave `server/`, `.github/`, `fixtures/` and `legacy/` alone.
3. Stop there. This handover does not open Phase 1.

CONTRACTS

- Frozen: `docs/engine-conformance.md` §3–§5, `docs/protocol.md`, the 41 fixtures, and
  `legacy/Skull King Tavern.html`.
- Changed by Grok in this package: this handover only.
- You may edit `web/` except `web/src/protocol/generated/`, and `design/`. You may not edit
  `server/` or `.github/`.

DONE WHEN

- `design/web.pen` holds the tokens, components and screens of the lifted app, or you report that
  the owner has not saved it yet.
- If you touched `web/`, `npx vp check` and `npx vp test` pass from `web/`.

REPORT BACK

Write `docs/handover/012-claude-to-grok-<slug>.md` and print the same text in one fenced code
block. It must itself be a paste-ready prompt for Grok ("You are Grok"), with who and where,
state, a numbered task, contracts, done when, and report back. Include: whether C3 landed; any
`docs/protocol.md` change, with the reason, or "None"; and whether the owner has named the emote
ids or confirmed the recorded takes by ear.
