# 070 · Grok → Claude · design the tables

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/agent-rules/design-sync.md` and `docs/handover/069-grok-to-claude-solo-on-the-server.md`
first. This is a design package. No page, no protocol edit, no server edit.

## State

- Branch `dev`, commit `d5a1117` ("DOCS: Propose the solo-on-the-server contract and the build order.").
  The proposal in 069 is what you design against. It is not in `docs/protocol.md` yet.
- `design/skt.pen` is Skull King inside GameOn. It already has, each with a dark twin:
  `Skull King · home`, `Skull King · home · states`, `Skull King · online`, `Skull King · ranked`,
  `Desktop · Skull King · home`, `Solo · new game`, `One screen · new game`,
  `Table · solo · your turn`, `Table · solo · connection lost`,
  `Table · solo · offline on this device`, `End · solo · final scores`,
  `End · solo · offline game`.
- `design/gameon.pen` is the collection: landing, sign-in, sign-up, Games. Jump back on Games
  says "Skull King · your table". Do not put a host's name back on that line.
- `design/web.pen` is the app as built. Do not open it.
- Do not design `design/admin.pen`. Admin is a later app.

## How you draw

- Pencil only. Open the file in Pen first (`open -a /Applications/Pen.app design/skt.pen` or
  `design/gameon.pen`). Never read or write a `.pen` file as text.
- Reuse that file's components and variables. Colours are the tokens in
  `web/src/styles/tokens.css`. No new hex.
- Phone frames are 390 wide. Desktop frames are 1440 wide. Every new screen gets a phone, a
  desktop, and a dark twin of each, except a frame whose name ends in `· states` (one light, one
  dark, wide enough to hold the rows).
- Copy below is the copy. Do not invent a clock, a second unfinished solo game, an uploaded
  offline result, or ranked points for solo.
- When the frames are in Pen, ask the owner to press ⌘S. Say that the file is not on disk until
  they do. Do not commit a `.pen` file yourself unless the owner has saved and asked you to.

## design/skt.pen

Revise the frames that already exist so they match this section. Add the ones that are missing.
Leave `One screen · new game` and every `Old · …` frame alone.

### Home

`Skull King · home` keeps four ways in.

- Solo: "Against bots, any time. Saved to your account."
- One screen: unchanged.
- Online: "Quick play, public tables, or a table of your own."
- Ranked: "This quarter. The standard rules. No bots."

Jump back, when `Me.active.table` is `solo`:

"Solo against 3 bots · Round 4 of 10 · saved to your account"

Jump back for any other game stays "Skull King · your table" and "Game running · your seat is kept".
No host name.

`Skull King · home · states` adds one row: a solo game already open. The Solo card's button reads
"Back to your game", not "Play". The line under it is "Round 4 of 10 is waiting."

### Solo setup

`Solo · new game`, phone and desktop.

- Table size is the whole table: 2 to 8 seats, which is you and 1 to 7 bots. The control says
  "Bots" and shows 1 through 7. Do not show a pace control.
- Bot skill: Easy, Normal, Hard.
- Scoring: Classic, Rascal.
- Rounds, as five cards the player picks one of: Classic (10 rounds), Brawl (5), Swift (5),
  Even (10), Whirl (10).
- Advanced: Loot, Kraken, Whale, Abilities. Each is on or off.
- Under the button: "No clock. Bots play up to your turn and wait."
- Second line: "One game at a time. It stays until you finish it or you leave it. Leaving it does
  not count."
- Third line, already in the frame, stays: "Saved to your account, so you can pick the game up on
  any device. Offline, it runs on this device and is not counted in your stats."
- The button is "Start".

### Solo table

`Table · solo · your turn`. No timer ring on the player. A "Saved" pill. The bots have already
played. It is the player's bid or the player's card, and nothing is counting down.

`Table · solo · connection lost`. Keep: "Your game is saved on the server and waits for you. No
card is played while you are away." No bot has taken the seat.

`Table · solo · offline on this device`. An "Offline" pill. The game is on this device. Keep the
sense of: this one is not counted.

`Table · solo · leave` is new. A confirm before `game.leave`: "Leave this game? It will not be
saved to your stats." Actions: "Keep playing" and "Leave".

### Solo ends

`End · solo · final scores`. Title line: "Saved to your stats". The places and the scores are the
server's. A guest and an account both get this line.

`End · solo · offline game`. Keep: "Offline game · not counted in your stats".

`End · solo · left` is new. "You left this game. It was not counted."

### Online, the three doors

`Skull King · online` is the index, not the only screen. Three doors:

- "Quick play" — "A random table. Bots fill the empty seats. The standard rules."
- "Public tables" — "Anyone can see the table. You pick the rules."
- "Your table" — "Friends only, with a code. You pick the rules."

Add:

- `Friends · new game`. Private. A switch "Seat bots", on by default. The same ruleset cards as
  solo (Classic, Brawl, Swift, Even, Whirl) plus scoring and the four advanced switches. No
  ranked switch. Button "Open table". Under it: "The table starts when two pirates are seated
  and ready. A bot is not the second."
- `Friends · waiting`. Host ready, one bot seated, Start disabled. Hint: "The table can start
  once a second pirate sits down. Share the code." A second state in `Friends · states`: both
  humans ready, Start enabled, the bot still in its seat.
- `Public · new game`. Same rules as friends, plus the table is listed. The bots switch is here
  too. Button "List table". Hint: "A public table can start once a second pirate sits down."
- `Public · waiting`. Same two states as friends, without a share-code line. Use the public hint.
- `Public · list`. Rows a player sees before joining: host name, seats taken of the table size,
  format, and either "Bots" or "No bots". Join on the row. Empty: "No public tables right now."
  Loading and "Couldn't load tables" live in `Public · states`.

`Skull King · ranked` stays one door. Standard rules only: four players, classic scoring, brawl,
no loot, no kraken, no whale, no abilities. No bot switch and no format picker. "This quarter."
A guest sees "Ranked needs a free account." An account in cooldown sees the queue closed and does
not see the minutes. Those two states go in `Skull King · ranked · states` if the frame does not
already show them.

## design/gameon.pen

Add the profile. Do not restyle Games, landing, or sign-in except where the profile is linked
from the player's name.

- `Profile · desktop` and `Profile · phone`, plus dark twins.
- Top to bottom:
  1. Who you are. Name, colour, username or the word "Guest", tier.
  2. This quarter. Season name "2026 Q4", rating number, "Provisional" while under five ranked
     games, ranked games this quarter, "See the ladder".
  3. Five lines, in this order: Solo, Friends, Public, Casual, Ranked. Each line is games, wins,
     and bids hit of bids scored. Sample numbers, not zeros on the main frame: Solo 12 games,
     Friends 4, Public 2, Casual 9, Ranked 6.
  4. Best score, from solo, friends, public and casual. Ranked is not in that number. Label:
     "Best score".
  5. "Your games", newest first, five rows on the phone and eight on the desktop. A row is the
     table kind, the date, the place, the score. A control "Load more".
- `Profile · states`, light and dark:
  - Guest. Username slot says "Guest". Quarter block says "Ranked needs a free account." The
    five lines can still show solo and casual.
  - No rating yet. Quarter block says "Play a ranked game to be rated." Tier is absent.
  - Provisional. "Provisional" on the quarter block. Games this quarter is 3.
  - Another player. Name and colour and tier and the five lines. No username, no "Your games".
  - Loading, couldn't load, and no games yet ("No finished games yet.").

The player's name in the Games navigation opens this profile. Do not draw a second profile inside
`design/skt.pen`.

## Your task

1. Draw the frames in the two sections above. Revise an existing frame in place when it is the
   same screen. Do not duplicate it under a new name.
2. Do not edit `design/web.pen`, `design/brand/`, `docs/protocol.md`, `web/` or `server/`.
3. Do not draw the admin console.

## Contracts

- You are designing the proposal in 069. You are not changing it.
- Visible copy in the list above is the copy the page will use later.
- `design/web.pen` stays the record of the app as it is built today.

## Done when

The new and revised frames are in Pen, named as in this handover, each with its dark twin.
Ask the owner to save. No `vp` gate and no `cargo` gate.

## Report back

Write `docs/handover/NNN-claude-to-grok-<slug>.md` and print the same text in one code block.
List every frame you added and every frame you revised, and any line in 069 the pen cannot show.
No server work.
