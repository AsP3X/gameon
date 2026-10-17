# Ownership and handover

**Applies to:** every work package, by either agent.

Claude and Grok do not see each other's sessions. When the other agent has a task, the
initiator writes the handover below and runs that agent's local CLI with this file as the
prompt. The CLI is installed locally (`claude` at `$HOME/.local/bin/claude`, `grok` at
`$HOME/.grok/bin/grok`). The initiator runs it. The owner is not asked to paste the prompt.
The file is the record of a task that was run.

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

If you need something in the other agent's paths, don't write it yourself. Route it as
[agent routing](agent-routing.md) says. The handover states the exact behaviour you need and why.

## When to hand over

Write a handover only when the other agent has something to do: a change in their paths, a
decision only they can make, or a correction to work they already committed.

- The file exists before the CLI runs, because it is the prompt.
- When you are blocked on the other side (a missing endpoint, a wrong fixture, an unclear contract).
- When you had to deviate from the plan or the contract and the other agent has to adjust.

Do not write one when there is no task. A finished package, a confirmation that the two sides
already match, and a note that nothing further is required are said to the owner in the reply.
They are not a handover, and the other CLI is not started. A callee does the same: write a
return handover only when the initiator still has a task. The CLI result is the report when
the callee's work is done.

## The number

`NNN` is one higher than the highest prefix already on disk under `docs/handover/`, including
untracked files. Look at the directory. Do not fill a gap. Do not reuse a number, even when
two old files already share one. If the number you were about to take is taken, take the next
one before the CLI runs.

## The handover prompt

Write it to `docs/handover/NNN-<from>-to-<to>-<slug>.md`, then
run the other agent's CLI with that file as the prompt. Do not print it for the owner to paste.
It must work for a reader who has seen nothing but the repo:

1. **Who you are and where.** "You are Grok, the callee, working on Skull King Tavern
   (`<repo path>`). Do this work yourself. Do not run `claude` or `grok`." Name the files to
   read first. The same shape, with the names swapped, when the callee is Claude.
2. **State.** Branch and commit, what is done, what the gate printed (commands and counts), what
   is not done.
3. **Your task.** Numbered, in order, with the files and the contract sections each item touches.
4. **Contracts.** What is frozen, what you changed, what the reader may change.
5. **Done when.** The commands to run and the result that counts as passing.
6. **Report back.** What the callee's CLI result must contain. Ask for a return handover only
   when this task will leave the other agent with work of their own.

Keep it concrete: paths, commands, message names, error codes. No "as discussed" — the reader
wasn't there.

## Running the other CLI

The commands, and when you may do the other agent's work yourself, are in
[agent routing](agent-routing.md). Before `claude` runs, `claude auth status` must report
`loggedIn: true`. If it does not, tell the owner to run `claude auth login`. Do not paste the
handover. If this run still cannot sign in, that is the "not available" exception in that rule.

## Closing the log

`docs/handover/README.md` is the index. A file in `docs/handover/` is a record. Nothing there
is work to do unless the owner names that file.

- When the callee exits and the task is finished, mark that handover closed in the index
  before you tell the owner it is done. One line: the number, and that it is closed.
- When a new handover replaces one that has not been run, mark the earlier file withdrawn
  in the same edit, before the CLI runs. Name the file that replaced it, in the index and
  in one line at the top of the earlier file.
- A closed or withdrawn file stays. Do not delete it, and do not move it, unless the owner
  names that action.
- The callee does not close the initiator's file. The initiator updates the index after
  reading the CLI result. A return handover, when one was required, is closed the same way
  once that remaining task is finished.

## Reporting UI the other agent cannot draw

Grok never edits `.pen` files. A visible change is UI, so it goes to Claude through
[agent routing](agent-routing.md). Describe the screen, the state and the copy in that handover.
