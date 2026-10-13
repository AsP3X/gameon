# Cards and characters

> **DRAFT — DO NOT USE.**
> This is a draft. It should not be used in any way, shape, or form for now. Do not implement it, commission art from it, or treat it as legal advice.

Names and colors for a future table are in [names-and-presentation.md](names-and-presentation.md). Play rules are in [rules.md](rules.md). This file is the card list those rules refer to.

## Number cards

Four suits, ranks 1 through 14. These are the ordinary cards. They follow suit, they trump, and their 14s pay the Tithe.

- **Grain, Stone, and Wool** are the plain suits. They matter when they are led, and when Smoke has turned trump off.
- **Steel** is trump. Any Steel card beats any plain card in a normal trick. Steel 1 beats Grain 14. Steel does not beat a Fool, a Knight, the Count, or the Squire armed.
- A **Tithe** is any 14. Each plain Tithe is worth 10 to the winner of its trick. The Steel Tithe is worth 20.

Higher rank beats lower rank of the same suit. Rank 14 is the top of every suit. There is one card of each rank in each suit, so two Grain cards never tie.

## Cloak

Four cards. A Cloak never wins a trick unless every card in the trick is a Cloak or is treated as a Cloak. It does not set a led suit. It may be played even when you can follow suit.

The Oath and the Squire declared cloaked are Cloaks for the trick ladder. They are not copies of these four.

## The Count

One card. The Count commands the hall.

The Count beats every Knight and every numbered card. A Fool beats the Count. If a Fool and the Count are in the same trick, the earliest Fool wins, even if a Knight is there too.

When the Count wins a trick, the Count's player scores 15 for each Knight in that trick. The Squire armed counts as a Knight. The Count is not a Knight.

## The Fools

Two cards. A Fool mocks the Count and beats every numbered card. A Knight beats a Fool.

When a Fool wins a trick that contains the Count, that player scores 25. Score 25 once, not once per Fool. When a Knight wins a trick that contains a Fool, that player scores 10 for each Fool. A Fool that did not win the trick scores no 25.

## The Squire

One card. As you play it, say one of these:

- **Armed.** The Squire is a Knight for the rest of the trick. It can win as a Knight, the Count can dismiss it for 15, and it can silence a Fool for 10. It has no Knight power.
- **Cloaked.** The Squire is a Cloak. It sets no suit and wins only if every card in the trick is a Cloak or treated as a Cloak.

The choice is part of the play. Say it as the card goes down.

## The Knights

Four named cards. They beat Fools and numbered cards. The Count beats them. The earliest Knight wins if more than one is in the trick and the Count is not.

A power is available only when that Knight's own card wins the trick. The player who played it decides, immediately, before the next lead. Powers are optional.

### Marshal

Name any player to lead the next trick. You may name yourself. If you decline, you lead, because you won the trick.

The Marshal does nothing on the last trick. There is no next lead to give.

### Steward

Look secretly at the top three cards of the undealt pile. If fewer than three remain, look at those. Put the cards back in any order. You do not take one. The other players do not see them.

The Steward does nothing on the last trick, and nothing if the pile is empty. Reordering cards nobody will draw this watch would only slow the table.

On a six-player Full watch the base deck leaves 8 cards in the pile, so the Steward still has something to see.

### Exchanger

You may draw the top card of the pile and then discard one card from your hand, face down, out of the game. You may discard the card you drew. No other player looks at the drawn card or the discard. The discard scores nothing and is shuffled back in only when the next watch is dealt.

The Exchanger is legal only when both of these are true:

- the pile has at least one card, and
- after the Exchanger was played, at least one card remains in your hand.

On the last trick the second condition fails, so the Exchanger does nothing. After a legal exchange your hand size for the rest of the watch is unchanged: one card played, one drawn, one discarded.

### Almoner

You may give the trick to another player who is still short of their bid. Still short means the tricks they have already won this watch, not counting this trick, are fewer than their bid. A player who bid zero and has won nothing is not short. A player who has already met or passed their bid is not short. If you give the trick, that player won it: add one to their trick count, give them the bonuses, and give them the next lead. If nobody else is short, you keep it.

The card that won is still the Almoner. A silence bonus on that trick is paid to the player who received the gift.

The Almoner cannot give a void trick. Truce and a failed Smoke trick have no winner, so the Almoner never resolves them.

Giving the trick to the player who played the Oath creates no pact, because the Oath's player then won the trick. Giving it to anyone else who is short creates the pact with that recipient, if the Oath was in the trick. The pact is still judged at the end of the watch.

The Almoner saves a zero when someone else still needs a trick. It can fill that player's bid, and it can move a silence bonus or a Tithe onto their sheet. It cannot break a clean zero, and it cannot punish a bid that has already been made.

## Optional cards

Add any, all, or none before the game. Adding a card makes the deck 69, 70, or 71.

### Truce

One card. If Truce is in a trick and Smoke is not, the trick is void. Nobody's trick count changes. No bonuses, powers, or pact come from it. The next leader is the next player clockwise from the player who played Truce, not the player who would have won.

Truce sets no led suit. It may be played against a led suit, like any special.

### Smoke

One card. If Smoke is in a trick and Truce is not:

- specials cannot win, and
- Steel is not trump.

The highest card of the led suit wins. If the trick has no led suit, the highest rank wins, and the earlier card wins a tie of rank. If no numbered card was played, the trick is void and the player who played Smoke leads next.

Smoke does not erase Tithes. The numbered winner still collects the 14s in the trick. Relationship bonuses are not scored, because a special did not win.

A led Wool 6 beats Steel 14 under Smoke. That is the point of the card.

### The Oath

One card. It plays as a Cloak. It sets no suit and loses the trick unless every card is a Cloak or treated as a Cloak.

If someone else is the final winner, those two players have a pact. At the end of the watch, if either of them is off by two or more, neither adds the 10. Otherwise each adds 10 to their own raw bonus total, and [scoring.md](scoring.md) scales that total. In Stake only a true bid keeps it. In Glide a miss of one keeps half of that player's whole total. Both players do not have to be exact. A wide miss by either one voids the 10 for both. Other bonuses stay on the sheet.

If Truce and Smoke are both in the Oath's trick, they become Cloaks and the trick resolves normally. The Oath can still form a pact from that result.

## Edges worth settling once

| Situation | Result |
| --- | --- |
| Squire armed, then a named Knight, no Count | The Squire wins. No named power fires. A Fool in the trick still pays 10. |
| Count, two Knights, no Fool | The Count wins and scores 15 for each Knight. |
| Two Fools and the Count | The earlier Fool wins and scores 25 once. |
| Fool, Count, and a Knight | The Fool wins and scores 25. The Knight pays nothing and takes nothing. |
| Almoner wins and a Fool is in the trick | Silence pays 10 to whoever keeps or receives the trick. |
| Almoner is in a trick the Count won | The Almoner did not win, so the power does not fire. The Count scores 15 for the Almoner. |
| Marshal wins the last trick | No power. There is no next lead to assign. |
| Steward or Exchanger and the pile is empty | Both powers do nothing. The printed formats at 2–6 players do not empty the pile. |
| Oath player also wins a different trick | The pact is unchanged. Their bid is judged from all of their tricks, as usual. |
