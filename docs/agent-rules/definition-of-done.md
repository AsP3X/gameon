# Definition of done

**Applies to:** every claim that work is complete, fixed or passing.

Evidence before assertions. Don't say "done" until every applicable item holds, and state the
evidence: the commands you ran and what they printed. If something is blocked, say so with the
exact command or decision that unblocks it.

## Checklist (apply what is relevant)

1. **Builds** — `cargo build` for server changes; `vp build` for web changes.
2. **Rust gate** — `cargo fmt --check`; `cargo clippy --all-targets -- -D warnings` with no new
   suppressions; `cargo test --workspace` ([Rust quality](rust-quality.md)).
3. **Web gate** — `vp check`; `vp test` ([web quality](web-quality.md)).
4. **Regression** — new behavior has tests; a bug fix has the test that guards it; nothing that
   passed before fails now.
5. **Engine conformance** — every file in `fixtures/engine/` replays exactly on the Rust engine
   (`docs/engine-conformance.md`). A fixture is never edited to make a port pass.
6. **Hidden information** — the leak tests pass, and anything new in the state has one
   ([server authority](server-authority.md)).
7. **Protocol** — a contract change updated the doc, the Rust types, the generated TypeScript and
   `fixtures/protocol/` together ([protocol](protocol-contract.md)).
8. **Migrations** — schema changes are new forward files only ([API rule](api-and-migrations.md)).
9. **Design** — visible UI changes are in `design/web.pen`, or the summary says why not
   ([design sync](design-sync.md)).
10. **No deprecated APIs, no data loss** — ([deprecated](no-deprecated-apis.md),
    [data safety](data-safety.md)).
11. **Handover** — when the other agent had a task, the initiator wrote the prompt and ran that
    agent's local CLI ([ownership and handover](ownership-and-handover.md),
    [agent routing](agent-routing.md)). No task means no handover file and no CLI call.
12. **Routing** — UI and client work was done by Claude, and non-UI code by Grok, each through
    that agent's local CLI. A fallback names the exception and quotes the CLI's output.

## Verification by change type

| You changed… | Required checks |
| ------------ | --------------- |
| Rules, reducer or view in either engine | Engine fixtures on both sides; regenerate fixtures only for an intended rule change |
| A message, DTO, endpoint or error code | Protocol fixtures; web parse tests; the other agent told through a handover |
| Lobby, queue, timers, reconnect | Server integration tests with real sockets; the multi-player browser smoke |
| Auth, sessions, ratings, SQL | `cargo test` against Postgres; new migration file; migration test from empty |
| Table UI or animation | `vp test`; manual smoke of a full round in solo and online, light and dark, 360 px |

## Manual smoke paths

1. **Solo** — start a game against bots, play a round, reload, resume.
2. **Friends** — create a private lobby, join by code in a second browser, play a full game.
3. **Reconnect** — drop one player's network mid-trick; they come back to the same seat and hand.
4. **Cheat probe** — from the browser console, send a play out of turn, a card not in hand and a
   bid for another seat; each is rejected and nothing changes for anyone.

## Reporting

End substantive work with a short evidence summary — for example `cargo test --workspace`: 87
passed; clippy: clean; `vp test`: 42 passed — plus what is blocked and how to unblock it.
