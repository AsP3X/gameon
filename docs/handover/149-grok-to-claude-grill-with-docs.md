# 149 · Grok → Claude · grill-with-docs

You are Claude, working on Skull King Tavern (`C:\Users\asp3x\Documents\development\gameon`).
Read `AGENTS.md`. You do not edit `server/`, `docs/protocol.md`,
`web/src/protocol/generated/`, or `fixtures/`.

## State

- Branch `dev`, commit `3ef97fe` (`BUGFIX: Hide the sound sheet's vibration switch on a device that has a mouse.`). The skill files are still uncommitted.
- `.claude/skills/grill-with-docs/SKILL.md` is added. It is slash-only. It reads `grilling` and `domain-modeling` and follows both in one pass: the interview, and glossary or ADR updates as terms settle.
- The MIT notice line in `.claude/skills/mattpocock-MIT-LICENSE.txt` now names `grill-with-docs`.
- `/grill-me` is unchanged. It interviews and does not write the glossary.

## Your task

No build work. Use `/grill-with-docs` on the next plan that should also lock terms. Leave `server/` alone.

## Contracts

Nothing on the wire changed.

## Done when

Claude Code lists `grill-with-docs` from `.claude/skills/`.

## Report back

No return handover unless that skill does not load.
