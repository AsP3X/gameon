You are Claude, the web engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write `web/` and `design/web.pen`.
Grok writes the Rust server, Compose, deploy files and CI, and the generated protocol tree. You
and Grok cannot see each other's sessions: the owner pastes handover prompts between you. This is
handover 045, the answer to 044.

READ FIRST
1. `AGENTS.md`, then `docs/agent-rules/ownership-and-handover.md` and `git.md`.

STATE

The ranked smoke ran on `dev` at `46c7495` (`DOCS: Merge the Phase 4 client handover onto dev`).
That commit contains `eee4b54`. The server was `cargo run -p skt-server` from `server/`, with
`DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt`, listening on `127.0.0.1:8080`.

From `web/`:

```
SKT_E2E=1 SKT_E2E_TARGET=http://127.0.0.1:8080 npx vp test e2e/ranked-smoke.e2e.ts
```

It printed:

```
Ranked smoke against the server

 ✓ e2e/ranked-smoke.e2e.ts (1 test) 241881ms
   ✓ four accounts at a ranked table (1)
     ✓ plays a ranked game and one of them reads its record 240303ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Duration  242.25s
```

The click on "The record" did not time out.

`/sw.js` and `/manifest.json` now have their own `location =` in both
`deploy/nginx/nginx.conf.template` and `deploy/nginx/nginx-tls.conf.template`, commit `f5740e6`
on `feature/grok-sw-cache`. Each sends the security headers and
`Cache-Control: no-cache, must-revalidate`. The worker is `application/javascript`. The manifest
is `application/json`. Checked with `nginx:1.28-alpine`, the image the page container uses, and
the built `dist/`. Not merged and not pushed.

`curl -sI http://127.0.0.1:8099/sw.js`:

```
HTTP/1.1 200 OK
Content-Type: application/javascript
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'none'; worker-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Cache-Control: no-cache, must-revalidate
```

`curl -sI http://127.0.0.1:8099/manifest.json`:

```
HTTP/1.1 200 OK
Content-Type: application/json
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'none'; worker-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Cache-Control: no-cache, must-revalidate
```

The same two answers came back over TLS from the other template. `.github/workflows/web.yml` now
runs `e2e/pwa.e2e.ts` against the mock, with Chromium installed in that job.

YOUR TASK

None. Do not change the smoke script or the worker.

CONTRACTS

- Frozen: `docs/protocol.md`, protocol 1, the generated tree, both fixture trees, `server/`.
- Yours: `web/` except `web/src/protocol/generated/`, and `design/`.
- The worker still does not answer `/api`.

DONE WHEN

- You have read this. There is nothing to build.

REPORT BACK

Only if `/sw.js` or `/manifest.json` is not served as written above. Otherwise do not write a
handover.
