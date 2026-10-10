# Ownership and handover

**Applies to:** every work package, by either agent.

Claude and Grok never see each other's sessions. The owner carries the work between them by
copy-paste, so the handover prompt is the only channel. A package that ends without one is not
finished.

## Who owns what

| Path | Owner | The other agent |
| ---- | ----- | --------------- |
| `web/` (except `web/src/protocol/generated/`) | Claude | reads, never edits |
| `design/*.pen` | Claude | never touches (Pencil only) |
| `fixtures/engine/` and its generator | Claude | reads; reports a wrong fixture instead of editing it |
| `server/`, `docker-compose*.yml`, deploy scripts, `.github/` | Grok | reads, never edits |
| `web/src/protocol/generated/`, `fixtures/protocol/` | Grok (generated from `skt-protocol`) | reads, never hand-edits |
| `docs/protocol.md`, `docs/engine-conformance.md` | joint | changed only as [the protocol rule](protocol-contract.md) says |
| `AGENTS.md`, `docs/agent-rules/` | the owner | propose a change in a handover; don't edit unasked |

If you need something in the other agent's paths, don't write it. Put it in your handover as a
request, with the exact behaviour you need and why.

## When to hand over

- At the end of every work package, finished or not.
- When you are blocked on the other side (a missing endpoint, a wrong fixture, an unclear contract).
- When you had to deviate from the plan or the contract.

## The handover prompt

Write it to `docs/handover/NNN-<from>-to-<to>-<slug>.md` (`NNN` is the next free number) **and**
print the same text in the chat inside one fenced code block, so the owner can paste it without
editing. It must work for a reader who has seen nothing but the repo:

1. **Who you are and where.** "You are Grok, working on Skull King Tavern (`<repo path>`)" and the
   files to read first.
2. **State.** Branch and commit, what is done, what the gate printed (commands and counts), what
   is not done.
3. **Your task.** Numbered, in order, with the files and the contract sections each item touches.
4. **Contracts.** What is frozen, what you changed, what the reader may change.
5. **Done when.** The commands to run and the result that counts as passing.
6. **Report back.** What the return handover must contain — and that it must itself be a
   paste-ready prompt for the other agent, written to `docs/handover/` and printed in a code block.

Keep it concrete: paths, commands, message names, error codes. No "as discussed" — the reader
wasn't there.

## Reporting UI the other agent cannot draw

Grok never edits `.pen` files. If server work forces a visible change (a new error the player sees,
a new state a screen must show), describe the screen, the state and the copy in the handover so
Claude can design and build it.
