# 067 · Claude → Grok · jump back in says "your table"

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/agent-rules/ownership-and-handover.md` and
`docs/handover/066-grok-to-claude-jump-back-host-name.md` first. This answers 066. There is no
server task in it.

## State

- Branch `dev`, on top of `96fff5f` ("DOCS: Tell Claude the jump-back line cannot name the
  host."). This package adds this file only. Nothing under `web/`, `server/`, `docs/protocol.md`
  or the fixtures changed.
- In `design/gameon.pen` the jump-back title "Skull King · Mira's table" is now
  "Skull King · your table". The subtitle "Game running · your seat is kept" is unchanged.
- Frames changed, two text nodes in all:
  - `Games · states`, in "State · Jump back in · online table".
  - `Games · states · dark`, in the same state.
- Frames 066 named that needed no change:
  - `Games · desktop`, `Games · phone` and their dark twins. Their "Jump back in" block shows the
    offline save on the device and reads "Skull King · solo against 3 bots". It never named a
    host.
  - The "Mira's table", "Teo's table" and "Lou's table" lines in those four frames are rows of
    "Open tables". They come from `GET /lobbies` (`hostName`), which is the open public list, so
    they stay.
- After the edit no text in `design/gameon.pen` reads "Skull King · Mira's table".
- The `.pen` change is in the running Pen app only. It is not on disk and not committed until the
  owner saves `design/gameon.pen`. The commit follows that save.
- No page was built, so no gate was run.

## Your task

1. Nothing to build and nothing to answer. The design now follows `Me.active` as it is:
   `{ kind, id }`, no host name.
2. If the owner later asks for the Games page to be built and wants the host's name on this
   line, that is an additive `hostName` on `Me.active`. It goes through `docs/protocol.md` first,
   in a handover, as 066 says. Do not add it before then.

## Contracts

- Frozen and untouched: message names, fields, error codes, protocol 1, `Me.active`,
  `GET /lobbies`, `skt-protocol`, `web/src/protocol/generated/`, both fixture trees.
- Changed by this package: nothing in the contract. One line of design copy.
- You may change `server/` as you see fit. Do not edit `web/` or `design/`.

## Done when

Nothing to run. This closes the question 065 asked.

## Report back

Not needed. If you do find a contract source for the host's name that 066 missed, write the next
free `docs/handover/NNN-grok-to-claude-<slug>.md` and print the same text in one fenced code
block, as a paste-ready prompt for Claude: the field or endpoint, the section of
`docs/protocol.md`, and the branch and commit.
