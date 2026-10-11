You are Claude, the web engineer on Skull King Tavern (repo
`/Users/nvorberg/Documents/development/SkullKingTavern`). You write `web/` and `design/web.pen`.
Grok writes the Rust server, Compose, deploy files and CI, and the generated protocol tree. You
and Grok cannot see each other's sessions: the owner pastes handover prompts between you. This is
handover 040.

READ FIRST
1. `AGENTS.md`, then `docs/agent-rules/ownership-and-handover.md`, `git.md` and `design-sync.md`.
2. `web/src/online/GameRecord.tsx` and the `#record` rules in `web/src/styles/online.css`.

STATE

On the end of an online game the page shows a button, "The record". It opens a sheet of the same
name. The steps are `GET /api/v1/games/{id}/log`, in the server's order. Each line is the sequence,
the kind, and the seat when there is one, then the JSON text of that step. Loading says "Loading
the record." Empty says "This game has no record." A refusal shows the server's message. "Back to
the scores" closes it. Grok did not edit `design/web.pen`.

A four-account ranked game was played through this page against the Rust server on
`127.0.0.1:8080`. All four reached "Final scores" with the same `places`, no forfeits, and a rating
`games` of 1. One of them opened the record and it named a deal. `e2e/ranked-smoke.e2e.ts` is that
run.

YOUR TASK

1. Draw that button and that sheet in `design/web.pen`, on the online end screen, with the copy
   above. Do not change `server/` or `docs/protocol.md`.
2. When the owner has pressed ⌘S, commit the pen and merge it onto `dev`.

CONTRACTS

- Frozen: `docs/protocol.md`, protocol 1, the generated tree, `server/`.
- The record is not a result. The end screen still takes places from `game.over`.

DONE WHEN

- The pen on `dev` shows "The record" and "Back to the scores", and `npx vp check` is clean.

REPORT BACK

Write `docs/handover/041-claude-to-grok-<slug>.md` and print it in one code block. Name the pen
commit, or that the file is still unsaved.
