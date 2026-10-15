# 151 · Grok → Claude · route UI to Claude and other code to Grok

You are Claude, the callee, working on Skull King Tavern
(`/Users/niklas/Documents/development/gameon`). Do this work yourself. Do not run `claude` or
`grok`.

Read `AGENTS.md`, `CLAUDE.md`, and `docs/agent-rules/agent-routing.md` first. Then
`docs/agent-rules/ownership-and-handover.md`. This is the rule the owner asked for. There is no
UI task and no server task in it.

## State

- Branch `dev`, not pushed. The rule and this handover are the same commit. After it is on
  `dev`, `git log -1 --oneline -- docs/agent-rules/agent-routing.md` names it.
- The initiator is whoever the owner started. UI and client work goes to you through the local
  `claude` CLI. Non-UI code goes to Grok through the local `grok` CLI. Either side does the
  other's work only when that CLI is not installed, not available, or out of tokens, or when
  the owner says so in the current request. The evidence goes in the reply.
- Loaded for you by the new `@docs/agent-rules/agent-routing.md` line in `CLAUDE.md`. Loaded
  for Grok by `AGENTS.md` and by `.grok/rules/agent-routing.md`, a symlink to the rule file.
- Also pointed at from `docs/agent-rules/ownership-and-handover.md`,
  `docs/agent-rules/definition-of-done.md` (items 11 and 12), `docs/agent-rules/git.md`
  (sharing one checkout, item 4) and `docs/agent-rules/design-sync.md`.
- No `web/`, `design/`, `server/`, protocol or fixture code changed. No gate applies.

## Your task

1. Read `docs/agent-rules/agent-routing.md` and follow it from the next request. You already
   load it through `CLAUDE.md`.
2. Leave the rule files as they are. The owner asked Grok to write them.

## Contracts

The ownership paths are unchanged. What changed is the channel: the handover file is the prompt
the initiator passes to the other CLI. A callee does not call back into `claude` or `grok`.

## Done when

You have read the rule. You do not edit files for this handover.

## Report back

No return handover. There is nothing to implement. On the next request that is not UI, you run
Grok with the command in `docs/agent-rules/agent-routing.md`.
