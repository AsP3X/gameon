# 071 · Claude → Grok · the tables and the profile are drawn

You are Grok, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/agent-rules/ownership-and-handover.md`, and your own
`docs/handover/069-grok-to-claude-solo-on-the-server.md` and
`docs/handover/070-grok-to-claude-design-the-tables.md` first. This answers 070. It is a design
package: no page, no protocol edit, no server edit. There is no server work in it for you, only
questions the drawing raised.

## State

- Branch `dev`. The commit that adds this file holds this file only.
- The frames are in the running Pen app, in `design/skt.pen` and `design/gameon.pen`. **Neither
  file is on disk until the owner presses ⌘S in each window**, and neither is committed.
  `design/web.pen`, `design/brand/`, `docs/protocol.md`, `web/` and `server/` are untouched.
  `design/admin.pen` does not exist and was not drawn.
- No `vp` gate and no `cargo` gate, as 070 says. What was checked instead: every frame was exported
  as a PNG and read, light and dark; every string 070 gives was searched for in the document and
  found (34 of 34); every light frame has a dark twin; the new frames overlap nothing.
  `design/skt.pen` went from 230 to 266 top-level frames, `design/gameon.pen` from 21 to 27.
- Naming: in `design/skt.pen` the phone frame carries the name from 070 and its desktop is
  `Desktop · <that name>`, as the file already did for the home. In `design/gameon.pen` the frames
  are `Profile · desktop` and `Profile · phone`, as 070 names them.

## Frames added

`design/skt.pen`, each with a `· dark` twin:

- `Desktop · Solo · new game`
- `Table · solo · leave`, `Desktop · Table · solo · leave`
- `End · solo · left`, `Desktop · End · solo · left`
- `Friends · new game`, `Desktop · Friends · new game`
- `Friends · waiting`, `Desktop · Friends · waiting`
- `Friends · states`
- `Public · new game`, `Desktop · Public · new game`
- `Public · waiting`, `Desktop · Public · waiting`
- `Public · list`, `Desktop · Public · list`
- `Public · states`
- `Skull King · ranked · states`

`design/gameon.pen`, each with a `· dark` twin:

- `Profile · desktop`, `Profile · phone`, `Profile · states`

## Frames revised

`design/skt.pen` (the dark twin of each was redrawn from the light frame):

- `Skull King · home` and `Desktop · Skull King · home` — the Online line and the Ranked line are
  070's. The Ranked card no longer shows "Rating 12 · Bosun". Solo, One screen and the solo
  jump-back already matched.
- `Skull King · home · states` — new row "a solo game already open" (Solo card: "Round 4 of 10 is
  waiting." and "Back to your game"). The online jump-back title was "Your table" and is now
  "Skull King · your table". The cooldown row said "The queue opens again in 12 min." and now says
  "Ranked is closed for you." The frame moved to the right of the desktop home because it grew.
- `Solo · new game` — the crew list (four named rows, "ADD BOT", "Turn order follows this list.")
  is gone; in its place "BOTS" with 1 to 7, 3 chosen. Scoring is Classic and Rascal. Rounds are
  five cards, Classic, Brawl, Swift, Even, Whirl, each with its round count. Advanced is Loot,
  Kraken, Whale, Abilities as switches. The button is "START", with 070's three lines under it.
  There was no pace control and there is none.
- `Table · solo · connection lost` — gained the "Saved" pill the table behind it has.
- `Table · solo · offline on this device` — gained the line "Offline game · not counted in your
  stats" under the "Offline" pill.
- `Skull King · online` — three doors with 070's titles and lines, then "JOIN WITH A CODE". The
  old line "Create a table for your crew or open it to everyone…" is gone.
- `Skull King · ranked` — "This quarter. The standard rules. No bots." under the button, and a
  fixed list "THE STANDARD RULES": Four players, Classic scoring, Brawl (5 rounds), No loot, No
  kraken, No whale, No abilities. No switch, no picker.

Compared and left as they were, because they already matched: `Table · solo · your turn` (no ring,
"Saved" pill, the three bots have played), `End · solo · final scores` ("Saved to your stats", no
guest line, no rating), `End · solo · offline game`. `One screen · new game` and every `Old · …`
frame were not touched.

`design/gameon.pen`: nothing revised. In Games the player chip (desktop) and the avatar (phone)
already read as controls, so they are the link to the profile as they stand. On the Profile frames
the same chip or avatar is drawn as the current place.

## Lines that were false under 069

- None of the five kinds (host's name, clock on solo, second unfinished solo game, uploaded
  offline result, ranked points for solo) was found in `design/skt.pen`.
- **Not changed, for the owner to decide:** in `design/gameon.pen`, the jump-back block on
  `Games · desktop` and `Games · phone` (and their dark twins) reads "Skull King · solo against 3
  bots" / "Round 4 of 10 · saved on this device". Under 069 2c the game is saved to the account,
  not the device. 070 says that line is "Skull King · your table"; only the `Games · states` row
  says that. 070 allowed no change to Games beyond the profile link, so it stands. The fix I
  propose is one string: "Round 4 of 10 · saved to your account".

## What the pen cannot show

These are in 069 and have no frame, because they are behaviour and not a screen:

- The pause is the server's: no bot moves and no trick advances while the socket is down, and the
  same hand comes back on `welcome`.
- A second `solo.start` is `ALREADY_SEATED`. The design never offers it: with a game open the Solo
  card is "Back to your game".
- A guest who registers keeps the game; a new guest on a second device does not see it.
- `pace` is sent as `standard` and ignored; `maxPlayers` is bots + 1. The screen shows only the
  number of bots.
- `BOTS_DISABLED` has no frame. See question 3.
- From `Stats`: the headline totals (`games`, `wins`, `bidsMade`, `bidsTotal`) and
  `ModeLine.bestScore` per mode are not drawn. The profile shows the five lines and one best score.
- From the game row: settings, seat lines, bids hit per game and the forfeit flag are not drawn. A
  "Your games" row is kind, date, place and score, and it is not a link.
- `GET /me/games` paging is one control, "Load more".
- The cheat signals have no player screen, as 069 says.

## Questions

For you where it says Grok, for the owner otherwise. None blocks the save.

1. **Grok — table size, pace and bot level on a friends or public table.** 070 lists the controls
   of `Friends · new game` and `Public · new game`: the bots switch, the rounds cards, scoring, the
   four advanced switches. It lists no table size, no pace and no bot level, so none is drawn. But
   `Friends · waiting` shows "CREW · 2 OF 4" with two open seats, and a `Public · list` row shows
   "2 of 4 seats". `lobby.create` needs `maxPlayers`, `pace` and `botLevel` in `GameSettings`. Say
   whether the page sends fixed values (which?) or the screen needs three more controls. If
   controls, I add them to both frames.
2. **Grok — does a lobby's seat count include bots?** A list row reads "2 of 4 seats · Classic".
   If `LobbySummary.players` counts humans only, the word has to change.
3. **Grok — a table listed with "Seat bots" off.** Drawn: the switch, and "Bots" or "No bots" on
   the list row. Not drawn: the waiting screen of a no-bots table. I would leave "ADD A BOT" out of
   it, so `BOTS_DISABLED` is never seen by an honest client. Confirm, or say the button stays and
   shows the message.
4. **Grok — the cooldown.** The player no longer sees the minutes: "Ranked is closed for you" /
   "You forfeited a ranked game." on the ranked screen, "Ranked is closed for you." on the home
   card. If the server still sends when the cooldown ends, the client receives it and does not
   show it. Say whether that field stays.
5. **Owner — the home with a solo game open.** `Skull King · home` shows the solo jump-back block
   and, under it, the Solo card with its usual line, as 070 says. The states row says the Solo card
   reads "Round 4 of 10 is waiting." and "Back to your game" in that case. I take the states row as
   the rule the page follows; the main frame then shows a card that cannot appear next to that
   block. Say if the main frame's card should change too.
6. **Owner or Grok — an offline game and a server game at once.** The states frame has a row for a
   device-only game ("Round 2 of 10 · offline, on this device only") and one for the server game.
   Neither handover says which the home shows if both exist.
7. **Owner — the Games jump-back line** (see "Lines that were false under 069").

## Words I had to choose

070's copy is used word for word. Where it gave none, these stand until someone changes them:

- Capitals: the file draws button and section labels in capitals, so "Start" is drawn "START",
  "Open table" "OPEN TABLE", "List table" "LIST TABLE", "Keep playing" "KEEP PLAYING", "Leave"
  "LEAVE", "Bots" "BOTS". The strings are 070's.
- Split lines: the solo jump-back is a title "Solo against 3 bots" and a line "Round 4 of 10 ·
  saved to your account". "Leave this game?" is the title and "It will not be saved to your
  stats." the body. "You left this game." is the heading and "It was not counted." the line under.
- "Saved to your stats" is the pill under the awards, where it already was. The header still reads
  "FINAL SCORES".
- Screen titles: "Solo game", "Your table" (friends, new game and waiting), "Public table" (new
  game and waiting), "Public tables" (the list).
- Friends and public: a "Private" or "Public" pill with the door's own line; the section label
  "BOTS" over "Seat bots". On the waiting screens, kept from the old lobby: "NOT READY", "ADD A
  BOT", a remove mark on the bot row, a "RULES" card with "CHANGE", "TABLE CODE" with "COPY", and
  the button "START".
- Public list: "REFRESH", "JOIN", a "Full" pill on a full table, and "CREATE A PUBLIC TABLE" as
  the way to `Public · new game` (the form's own button says "LIST TABLE"; two verbs for one act).
  Loading is "Looking for tables…" / "One moment.". The failure is 070's "Couldn't load tables"
  with "Check your connection and try again." and "TRY AGAIN".
- Ranked states: the guest row has "SIGN UP"; both rows show a disabled "FIND A RANKED GAME".
- `End · solo · left`: the player's avatar, the two lines, and the actions of the other end
  frames, "PLAY AGAIN" and "HOME". No places, no scores.
- Solo setup keeps the old one-line descriptions under bot skill, scoring and the advanced
  switches. Under scoring that now reads "Classic" over "Classic, high risk", which repeats
  itself. The rounds cards show the round count and the cards per round.
- Profile: column heads "GAMES", "WINS", "BIDS HIT" with cells like "71 of 120"; tiles "RATING"
  and "RANKED GAMES"; under "Best score" the caption "Solo, Friends, Public and Casual"; places as
  "1st", "2nd"; dates as "12 Oct 2026"; "The profile could not be loaded." with "TRY AGAIN"; the
  guest's quarter block has "CREATE AN ACCOUNT". Tiers are the names in `docs/protocol.md`:
  Captain, Bosun, First Mate. Another player shows name, colour, tier and the five lines, and no
  rating, no best score, no username and no list.

## Not drawn

- Desktop frames for screens that had none and that 070 did not make new: `Skull King · online`,
  `Skull King · ranked`, the three solo tables, the two older solo ends.
- A "not connected" state for the profile. Games has the banner the page can reuse.
- Known in the pen, mine to fix: the `Toggle / on` component draws its knob on the left. The new
  frames correct it per instance.

## Your task

1. No server work, no protocol edit.
2. Answer questions 1 to 4 in your return handover. If an answer changes a frame, say which frame
   and what it must show; I draw it.
3. Do not start Package 0 of 069 until the owner says build.

## Contracts

- Frozen: `docs/protocol.md`, `skt-protocol`, `web/src/protocol/generated/`, both fixture trees,
  the engine. This package changed none of them.
- 069 is still the proposal, not the contract. These frames are drawn against it.
- You may not edit `design/skt.pen`, `design/gameon.pen`, `design/web.pen` or `design/brand/`.
- The visible copy in 070 is in the frames as written. The words under "Words I had to choose" are
  open to change by the owner.

## Done when

There is nothing to run. Your reply answers questions 1 to 4.

## Report back

A paste-ready prompt for Claude in `docs/handover/NNN-grok-to-claude-<slug>.md`, also printed in
one fenced code block. It holds your answers and, for each, the frame that has to change, if any.
