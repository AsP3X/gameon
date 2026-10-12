You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/agent-rules/server-authority.md`, `docs/agent-rules/protocol-contract.md`
and, in `docs/protocol.md`, the lobby and queue sections, `Me`, `Stats` and `GameSettings` first.
This handover tells you about a decision of the owner and asks for a contract proposal. No code.

## The owner's decision

Skull King becomes one game inside GameOn. Solo play stays, and it moves to the server: a solo
game is a server game, saved to the player, with the device's own engine as the fallback when
there is no connection. `docs/multiplayer-plan.md` still says solo is offline only; that line is
out of date as of this handover. The plan is the owner's to edit.

## State

- Branch `dev`, commit `a7621ac` ("ADD: Redesign Skull King as a game inside GameOn in
  design/skt.pen."). Nothing under `web/`, `server/`, `docs/protocol.md` or the fixtures changed.
- `design/skt.pen` started as a copy of `design/web.pen` (commit `c2190b6`) and is the design of
  Skull King inside GameOn. `design/web.pen` is untouched and stays the record of the app as built.
- New in `design/skt.pen`, each with a dark twin: `Skull King · home`, `Skull King · home · states`,
  `Skull King · online`, `Skull King · ranked`, `Desktop · Skull King · home`, `Solo · new game`,
  `One screen · new game`, `Table · solo · your turn`, `Table · solo · connection lost`,
  `Table · solo · offline on this device`, `End · solo · final scores`, `End · solo · offline game`.
- Removed from `design/skt.pen`: the old Home, the "Play online" hub, the offline Setup, and the
  create-account and sign-in screens (those two live in `design/gameon.pen` now). Ten frames whose
  layout is not redone yet are renamed `Old · …`.
- What the design says, in the player's words:
  - Home has four ways in: Solo ("Against bots, any time. Saved to your account."), One screen,
    Online (quick play, public tables, your own table) and Ranked.
  - Solo setup: you and one to seven bots, bot skill, scoring, rounds, the advanced rules. No
    clock. "Saved to your account, so you can pick the game up on any device. Offline, it runs on
    this device and is not counted in your stats."
  - At a solo table a "Saved" pill; without a connection at the start, an "Offline" pill and a
    game that runs on the device.
  - A connection lost in a solo game: "Your game is saved on the server and waits for you. No
    card is played while you are away."
  - The end of a solo game: "Saved to your stats". The end of an offline game: "Offline game ·
    not counted in your stats".
  - Jump back in: "Solo against 3 bots · Round 4 of 10 · saved to your account".
- Design only. No page was built, so no gate was run.

## Your task

1. Do not build anything yet.
2. Propose, in your next handover, the contract for solo on the server, as the changes you would
   make to `docs/protocol.md`. It has to answer these:
   a. **How a solo game starts.** A lobby now needs two people to start. Solo is one person and
      one to seven bots, private, never ranked, started at once. Is that a lobby kind, a queue, or
      an endpoint of its own? Which `GameSettings` apply, and where do the number of bots and
      their level go?
   b. **No clock.** A solo game has no deadline for the player. What does `pace` become, and do
      the bots simply play up to the player's turn and wait?
   c. **How long it is kept.** The design promises the game waits while the player is away and
      can be picked up on another device. For how long, and how many unfinished solo games per
      player (the design assumes one)?
   d. **Jump back in.** The line shows "Round 4 of 10". `Me.active` is `{ kind, id }`. Would you
      add the round and the number of rounds for a solo game, or does the line lose them?
   e. **Stats.** Do solo games on the server count in `Stats` (games, wins, bids made, best
      score), for guests too? If they should be kept apart from games against people, say how.
   f. **Offline.** The offline game never reaches the server and counts for nothing, because the
      server writes results only from state it computed itself. Confirm, or say what you would
      accept instead.
3. Say what in `docs/engine-conformance.md` or the fixtures this touches, if anything.

## Contracts

- Frozen and untouched: `docs/protocol.md`, `skt-protocol`, `web/src/protocol/generated/`,
  `fixtures/`. Solo on the server is a contract change; it goes through `docs/protocol.md` first,
  in a handover, and is built only when the owner says so.
- You may not edit `design/skt.pen`, `design/gameon.pen`, `design/web.pen` or `design/brand/`.
- `AGENTS.md` and `docs/agent-rules/design-sync.md` name only `design/web.pen`. Proposal for the
  owner, not done here: name `design/skt.pen` and `design/gameon.pen` there once the redesign is
  what gets built.

## Done when

There is nothing to run. Your reply answers 2a to 2f and item 3.

## Report back

A paste-ready prompt for Claude in `docs/handover/NNN-grok-to-claude-<slug>.md`, also printed in
one fenced code block, holding the proposed contract text and the answers.
