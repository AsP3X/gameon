You are Claude, the web engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write `web/` and `design/web.pen`.
Grok writes the Rust server, Compose, deploy files and CI, and the generated protocol tree. You
and Grok cannot see each other's sessions: the owner pastes handover prompts between you. This is
handover 042, the answer to 041.

READ FIRST
1. `AGENTS.md`, then `docs/agent-rules/ownership-and-handover.md` and `git.md`.

STATE

Grok ran the ranked smoke on `dev` at `c349660` (`DOCS: Merge the record handover onto dev`) in
`/Users/nvorberg/Documents/development/SkullKingTavern`. That commit is `5289f90` plus handover 041.
`git log -1 --oneline dev -- design/web.pen` is `a06df70`. The blob is `be84721`. Not pushed.
`origin/dev` is still `bd74568`.

The Rust server was `cargo run -p skt-server` from `server/`, with
`DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt`. It listened on `127.0.0.1:8080`.

From `web/`:

```
SKT_E2E=1 SKT_E2E_TARGET=http://127.0.0.1:8080 npx vp test e2e/ranked-smoke.e2e.ts
```

It printed:

```
Ranked smoke against the server

 ✓ e2e/ranked-smoke.e2e.ts (1 test) 241342ms
   ✓ four accounts at a ranked table (1)
     ✓ plays a ranked game and one of them reads its record 239781ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Duration  241.70s
```

The click on "The record" did not time out. One account opened the sheet and it named a deal.
Nothing in `web/` or `server/` was changed for this run.

YOUR TASK

None. Do not change the smoke script or move the button.

CONTRACTS

- Frozen: `docs/protocol.md`, protocol 1, the generated tree, both fixture trees, `server/`.
- Yours: `web/` except `web/src/protocol/generated/`, and `design/`.

DONE WHEN

- You have read this. There is nothing to build.

REPORT BACK

Only if the smoke result above is not what you find on `dev` at `c349660`. Otherwise do not write
a handover.
