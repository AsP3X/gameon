# Route work to the owning agent

**Applies to:** every request, before the first edit, by either agent.

The initiator is the agent the owner started. UI and client work is done by Claude, through the
local `claude` CLI. Non-UI code is done by Grok, through the local `grok` CLI. You do the other
agent's work yourself only under [Exceptions](#exceptions), and you record the evidence in the
reply.

This applies to a one-line style change and to a new screen. The size of the change does not
waive it.

## How this rule is loaded

- Claude Code loads this file from `CLAUDE.md` at the start of every session.
- Grok loads `AGENTS.md` at the start of every session, and loads
  `.grok/rules/agent-routing.md`, a symlink to this file. If this file is not already in your
  context, read it before the first edit.
- Removing this rule removes this file, its row in `AGENTS.md`, its `@` line in `CLAUDE.md`, and
  `.grok/rules/agent-routing.md`.
- [Ownership and handover](ownership-and-handover.md) says who may edit which path. This rule
  says how the initiator gets that edit done. The handover file is the prompt and the record.

## Which agent

| You are… | When |
| -------- | ---- |
| The initiator | The owner is talking to this session. |
| Claude | This session is Claude Code. |
| Grok | This session is Grok. |
| The callee | The prompt you were given says you are the callee. |

The process started with the other CLI is the callee. It is a new session and sees only its
prompt. A callee does the task itself and does not run `claude` or `grok`.

## What goes to which agent

Use the same split as the [ownership table](ownership-and-handover.md).

| Work | Agent |
| ---- | ----- |
| UI and client work. What a player sees or operates: layout, styles, motion, on-screen copy, client routing, client state, screens, components. Paths: `web/` except `web/src/protocol/generated/`, `design/`, `fixtures/engine/` and its generator. | Claude |
| Non-UI code. `server/`, SQL and migrations, HTTP and WebSocket handlers, the protocol schema and its generated types, `web/src/protocol/generated/`, `fixtures/protocol/`, Compose, deploy, CI. | Grok |
| A question, review or plan that does not edit those paths. | The initiator, by reading. |

A player-visible change is UI, including when server work is what forced it. A change under
`server/`, deploy, CI or the generated protocol is non-UI code, including when a player will
later see its result. `web/src/protocol/generated/` belongs to Grok. The reference engine in
`web/src/game/` and `fixtures/engine/` stay with Claude.

A request with both kinds of work is two tasks. Do them in dependency order. When the UI needs
a new or changed message, Grok's protocol and server work comes first, and Claude then renders
what the server sends. Paragraphs in `docs/` are edited by the agent whose task they describe.
`docs/protocol.md` and `docs/engine-conformance.md` follow
[the protocol rule](protocol-contract.md). `AGENTS.md` and `docs/agent-rules/` change when the
owner asks.

## Before you edit

1. Classify every part of the request as UI, non-UI code, or neither.
2. Do the parts you own. Send the rest across, unless an exception applies to this run.
3. Write the handover file first, and only when that agent has a task. It is the whole prompt.
   Use the shape in [ownership and handover](ownership-and-handover.md), including the callee
   lines below. No task means no file and no CLI call.
4. Run that agent's local CLI from the repo root and wait until it exits. While it runs, do not
   edit, stage, commit, or run a formatter that rewrites the tree. Reading is fine.
5. One callee at a time, in this checkout. Do not pass `--worktree`. A new worktree exists only
   when the owner asks for one ([git](git.md)).
6. Read the CLI's JSON before treating the task as done. Read a return handover only when the
   callee wrote one because you still have a task.

A callee that finds work outside its paths stops that part. It writes a return handover when
the initiator has to do that work, and leaves it out when the task is finished. The initiator
routes whatever work remains.

## The prompt

The callee sees this file and nothing from the initiator's session. Include:

1. **Callee.** "You are Claude, the callee" or "You are Grok, the callee", the repo path, and
   the sentence "Do this work yourself. Do not run `claude` or `grok`."
2. **Paths.** Which paths to edit, and which to leave untouched, including dirty files already
   in the tree.
3. **State, task, contracts, done when, report back.** As the handover rule requires.
4. **Git.** The current branch. Commit only your own paths, and only after the gate for those
   paths passes. Do not push. Do not create a branch or a worktree.
5. **Rules.** Follow `AGENTS.md` and every rule that applies to the paths you touch. UI work
   includes [design sync](design-sync.md) and [web quality](web-quality.md). Server work
   includes [Rust quality](rust-quality.md), [API errors and migrations](api-and-migrations.md)
   and [server authority](server-authority.md).

## Commands

Run from the repo root so `AGENTS.md` and `CLAUDE.md` load. Do not pass `--bare`,
`--system-prompt`, `--system-prompt-override` or `--worktree`. Use
`--permission-mode bypassPermissions` so the callee can edit files and run the gates with no
person at the keyboard.

Before `claude` runs, `claude auth status` must report `"loggedIn": true`. If it does not,
tell the owner to run `claude auth login`. Do not paste the handover. If this run still cannot
sign in, that is [not available](#exceptions).

UI and client work, Grok calling Claude. Claude Code takes the prompt on stdin:

```bash
claude -p \
  --permission-mode bypassPermissions \
  --output-format json \
  < docs/handover/NNN-grok-to-claude-<slug>.md
```

If that CLI reports the prompt is missing, pass the same file as the prompt argument:

```bash
claude -p --permission-mode bypassPermissions --output-format json \
  "$(cat docs/handover/NNN-grok-to-claude-<slug>.md)"
```

Non-UI code, Claude calling Grok:

```bash
grok -p \
  --permission-mode bypassPermissions \
  --cwd "<repo root>" \
  --output-format json \
  --prompt-file docs/handover/NNN-claude-to-grok-<slug>.md
```

`<repo root>` is this checkout. Capture stdout and stderr.

- Claude's JSON carries `result`, `is_error` and `session_id`.
- Grok's JSON carries `text` and `sessionId`.
- A follow-up on the same task resumes that id (`claude -p --resume <session_id>`,
  `grok -p --resume <sessionId>`).
- A non-zero exit or a failing gate is a result to send back to the same callee. It is an
  exception only when the output matches a case below.

The callee writes a return handover under `docs/handover/` only when the initiator still has a
task. It does not print the prompt for anyone to paste. The CLI result is the report when the
task is done.

## Exceptions

You may do the other agent's work yourself only when one of these is true of this run. Check
in this order.

1. **Not installed.** `command -v claude` or `command -v grok` fails, and the usual path is
   missing or not executable: `$HOME/.local/bin/claude`, `$HOME/.grok/bin/grok`. A binary that
   exists is installed; call that path. Do not install either CLI unless the owner asks.
2. **Not available.** The binary exists, and this run exits before it accepts the task: auth
   or login failure, the API or network unreachable, or a crash on startup. One retry is
   allowed for a dropped connection. A second failure of that kind means it is not available.
3. **Out of tokens.** This run's output says the account is out of usage: a usage limit, rate
   limit, quota, credits, extra usage, or a billing or spend cap. Do not retry a quota failure.
4. **The owner, in the current request,** tells you to do that work yourself.

The reply names the exception before any edit to the other agent's paths, with the command,
the exit code, and the error lines. For "not available" and "out of tokens", quote the CLI.

On a fallback, read and follow every rule for the paths you then touch. Do not hand-write a
`.pen` file. When you cannot edit it through the Pencil tools, say so and leave the design for
Claude.

When the callee has already edited its paths and then fails under 2 or 3, keep those edits and
finish only the remainder under that exception.

## These stay on the normal path

- The change is small, obvious, or already designed.
- You have already started, or doing it yourself looks faster.
- An earlier session ran out of tokens. This run is what counts.
- The call is waiting on a permission prompt. Stop it and rerun with the command above.
- The callee came back with a failing test, a question, or a partial handover. Resume it.
- You are unsure which side a path is on. Use the table, then route it, and leave the file
  unedited until that is done.

## After the callee exits

- Read the diff. Leave edits outside the callee's paths untouched: do not stage them and do
  not build on them. Resume the callee and tell it to revert those paths, or tell the owner.
- The work is finished when the gates that apply have run
  ([definition of done](definition-of-done.md)). A return handover is on disk only when one
  agent still has a task for the other.
- Mark that handover closed in `docs/handover/README.md`
  ([ownership and handover](ownership-and-handover.md)). Do this after you have read the CLI
  result, and before you tell the owner the task is done.
- Tell the owner which agent did which part, and what the gates printed.
