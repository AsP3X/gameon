# 148 · Grok → Claude · domain and grill skills

You are Claude, working on Skull King Tavern (`C:\Users\asp3x\Documents\development\gameon`).
Read `AGENTS.md`. You do not edit `server/`, `docs/protocol.md`,
`web/src/protocol/generated/`, or `fixtures/`.

## State

- Branch `dev`, commit `3ef97fe` (`BUGFIX: Hide the sound sheet's vibration switch on a device that has a mouse.`). The skill files are uncommitted.
- Three skills from [mattpocock/skills](https://github.com/mattpocock/skills) are in `.claude/skills/`. Grok `inspect` lists each as a project skill, enabled:
  - `domain-modeling` — sharpen terms into a root `GLOSSARY.md`, and an ADR only when one is earned. Formats are the sibling `GLOSSARY-FORMAT.md` and `ADR-FORMAT.md`.
  - `grill-me` — slash command only. It reads `.claude/skills/grilling/SKILL.md` and runs that interview. The upstream line "Call the Skill tool" is replaced with that read, so Grok can follow it too.
  - `grilling` — the interview `grill-me` runs. It also starts when someone asks to be grilled.
- The MIT notice is `.claude/skills/mattpocock-MIT-LICENSE.txt`.
- No `GLOSSARY.md` and no `docs/adr/` yet. Create either only when a term or a decision is actually resolved. The glossary is not a spec. `docs/protocol.md` stays the wire contract.

## Your task

No build work. Use the skills on the next plan or naming question. Leave `server/` alone.

## Contracts

Nothing on the wire changed.

## Done when

Claude Code lists `domain-modeling`, `grill-me`, and `grilling` from `.claude/skills/`.

## Report back

No return handover unless one of those three skills does not load.
