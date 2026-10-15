# Ownership and handover

**Applies to:** every work package, by either agent.

Claude and Grok never see each other's sessions. The handover file is the record of what one
asked the other to do. Grok delivers a handover addressed to Claude by running the Claude Code
CLI in this repo. A package that only leaves the file for the owner to paste is not finished.

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
print the same text in the chat inside one fenced code block, so the owner can see what was sent.
It must work for a reader who has seen nothing but the repo:

1. **Who you are and where.** "You are Grok, working on Skull King Tavern (`<repo path>`)" and the
   files to read first.
2. **State.** Branch and commit, what is done, what the gate printed (commands and counts), what
   is not done.
3. **Your task.** Numbered, in order, with the files and the contract sections each item touches.
4. **Contracts.** What is frozen, what you changed, what the reader may change.
5. **Done when.** The commands to run and the result that counts as passing.
6. **Report back.** What the return handover must contain. Claude writes that file under
   `docs/handover/` and prints it. Claude does not start `grok`. The Grok session that launched
   Claude reads the file when the CLI exits.

Keep it concrete: paths, commands, message names, error codes. No "as discussed" — the reader
wasn't there.

## Grok delivers it with the Claude Code CLI

**Applies when:** the handover is from Grok to Claude.

The CLI is `claude` on `PATH` (`C:\Users\asp3x\.local\bin\claude.exe` on this machine). Before
the run, `claude auth status` must report `loggedIn: true`. If it does not, stop and tell the
owner to run `claude auth login`. Do not ask them to paste the handover. Run the delivery from
the repo root after the handover file is written, and wait until it exits. The prompt is the
file and nothing else.

```
Get-Content -Raw docs/handover/NNN-grok-to-claude-<slug>.md | claude -p --permission-mode bypassPermissions --dangerously-skip-permissions --output-format text
```

- `--permission-mode bypassPermissions` is only for this handover run, so Claude can edit `web/`
  and run the gate with nobody at the prompt. Do not add a second task, a branch, or a worktree.
- When `claude` exits, read the return file it wrote under `docs/handover/` and say what it
  changed and what the gate printed. The owner is not asked to paste either prompt.
- If `claude` is not on `PATH`, or it exits without doing the task, say the command and the
  output. Do not fall back to asking the owner to paste.
- Printing the prompt in chat is the record. The CLI run is the delivery.

## Reporting UI the other agent cannot draw

Grok never edits `.pen` files. If server work forces a visible change (a new error the player sees,
a new state a screen must show), describe the screen, the state and the copy in the handover so
Claude can design and build it.
