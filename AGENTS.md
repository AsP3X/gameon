# Skull King Tavern — instructions for coding agents

This is the single source of the project rules for every coding agent. Claude Code reads it through
`CLAUDE.md`; other agents (Grok) read it directly. The rules are adapted from `../shroud`.

Two agents work in this repo, relayed by the owner:

| Agent  | Owns                                                                 |
| ------ | -------------------------------------------------------------------- |
| Claude | `web/`, `design/`, `fixtures/engine/` (generated from the reference engine) |
| Grok   | `server/`, Compose and deploy files, CI, `web/src/protocol/generated/` (generated output only) |

`docs/` is shared. The plan is `docs/multiplayer-plan.md`; the wire contract is `docs/protocol.md`;
the engine port is specified in `docs/engine-conformance.md`.

## Rules

Every rule is mandatory. Each one lives in its own file under `docs/agent-rules/`. Before you start
work, read the full file of every rule that applies to it — the summaries below are an index, not
the rule.

| Rule | Applies to | Summary |
| ---- | ---------- | ------- |
| [The server is the only authority](docs/agent-rules/server-authority.md) | Everything that touches online play | The server decides and hides; the client sends intents and renders what it is given. |
| [Ownership and handover](docs/agent-rules/ownership-and-handover.md) | Every work package | Stay in your own paths; end every package with a paste-ready handover prompt for the other agent. |
| [The protocol is a contract](docs/agent-rules/protocol-contract.md) | Any change to a message, DTO, endpoint or error code | Change the doc, the Rust types, the generated TypeScript and the fixtures together, through a handover. |
| [Keep the designs in sync with the UI](docs/agent-rules/design-sync.md) | Visible UI changes in `web/` | Every UI change also lands in `design/web.pen`, edited only through the Pencil MCP tools. |
| [No deprecated APIs](docs/agent-rules/no-deprecated-apis.md) | Every code change | Don't call, extend or suppress deprecated APIs; replace them or implement the behavior. |
| [No AI attribution](docs/agent-rules/no-ai-attribution.md) | Every commit and pull request | No `Co-Authored-By` trailer or "Generated with …" footer for an AI assistant. |
| [Git: branches, worktrees, commits](docs/agent-rules/git.md) | Every git action | Feature branches off an up-to-date `dev`, one worktree per agent, prefixed messages, no push or merge unless the owner says so. |
| [Data safety](docs/agent-rules/data-safety.md) | Anything destructive | Nothing that wipes volumes, databases, history or files without the owner naming that action. |
| [Rust quality](docs/agent-rules/rust-quality.md) | `server/**/*.rs` | No panics outside tests, no lint suppressions, no blocking in async, `// Human:` / `// Agent:` comments. |
| [API errors and migrations](docs/agent-rules/api-and-migrations.md) | `server/` HTTP, WebSocket and SQL | One error envelope, safe messages, applied migrations are immutable. |
| [Web quality](docs/agent-rules/web-quality.md) | `web/` | Strict TypeScript, `vp check` clean, tokens only, every remote string escaped, nothing in the client is a security control. |
| [Definition of done](docs/agent-rules/definition-of-done.md) | Every claim that work is finished | Evidence before assertions: the gate commands, their results, and the regression fixtures. |

## Adding or changing a rule

- One rule per file in `docs/agent-rules/`, named after the rule in kebab-case. Start it with a
  `# Title` and an `**Applies to:**` line.
- Add a row to the table above, and an `@docs/agent-rules/<file>.md` line to `CLAUDE.md` so Claude
  Code loads the full text.
- Write rules for any agent: name a specific tool only where the rule is about that tool.
- Removing a rule removes its file, its row and its `CLAUDE.md` line.
