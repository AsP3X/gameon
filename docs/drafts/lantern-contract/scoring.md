# Scoring

> **DRAFT — DO NOT USE.**
> This is a draft. It should not be used in any way, shape, or form for now. Do not implement it, publish it, or treat it as legal advice.

Choose **Stake** or **Glide** before the first deal. The whole game uses that choice. "Cards" in every formula is the number of cards actually dealt that watch.

## True, Near, and Wide

Compare the bid with the tricks taken.

| Result | Meaning |
| --- | --- |
| True | Taken equals the bid |
| Near | Off by exactly 1 |
| Wide | Off by 2 or more |

A bid of 0 that takes 0 is True. A bid of 0 that takes 1 is Near. A bid of 0 that takes 2 or more is Wide.

## Raw bonuses

During the watch, write one raw bonus total for each player. Start at 0. Add these when that player ends the trick as the winner. The Almoner's gift uses the player who received the trick. A void trick adds nothing.

| Event | Add |
| --- | ---: |
| Each plain Tithe (Grain 14, Stone 14, Wool 14) | 10 |
| Steel Tithe (Steel 14) | 20 |
| Winning card was a Knight, for each Fool in the trick | 10 |
| Winning card was the Count, for each Knight in the trick | 15 |
| Winning card was a Fool, and the Count is in the trick | 25 |
| You are on one side of an Oath | 10 |

The Squire armed is a Knight. The Squire declared cloaked is not.

Build the total first. Scale it once at the end of the watch. Do not scale each line and then add the lines. Judge an Oath before this scale: if either member is Wide, leave the Oath's 10 out of both totals.

| Accuracy | Stake bonuses | Glide bonuses |
| --- | --- | --- |
| True | Keep the total | Keep the total |
| Near | The total becomes 0 | Half of it, fraction dropped |
| Wide | The total becomes 0 | The total becomes 0 |

Glide is the only mode that halves. Add the lines first. A Near total of 15 and 15, from the Count dismissing two Knights, is 30 and pays **15**. It does not pay 7 + 7. A plain Tithe is 10. The Steel Tithe is 20. Half of 10 is 5. Half of 15 is 7. Half of 20 is 10. Half of 25 is 12. Half of 30 is 15.

## Stake

The bid score:

| Result | Bid score |
| --- | --- |
| True, bid of 1 or more | `15 × bid` |
| True, bid of 0 | `8 × cards` |
| Miss, bid of 1 or more | `−6 × the difference` |
| Miss, bid of 0 | `−8 × cards` |

A made bid of 1 or more does not grow with the size of the hand. Each extra trick in the bid is worth 15 if you make it. A made zero does grow: it is 8 for every card dealt. A broken zero is the same cost whether the player took 1 trick or every trick, and it keeps no bonus. Further tricks after a broken zero do not change that player's Stake score. They still change everyone else's count.

The watch score is the bid score plus the Stake bonuses. It may be negative. The running total may be negative.

### Made bids

A made bid of 1 through 10 scores 15, 30, 45, 60, 75, 90, 105, 120, 135, 150. A made zero scores:

| Cards | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Made zero | 8 | 16 | 24 | 32 | 40 | 48 | 56 | 64 | 72 | 80 |

On a 5-card watch a made zero (40) beats a made bid of 2 and loses to a made bid of 3. On a 10-card watch a made zero (80) beats a made bid of 5 (75) and loses to a made bid of 6 (90). On a 1-card watch a made bid of 1 (15) beats a made zero (8).

### One scored Stake watch

Four players, four cards. The tricks are the teaching watch in [rules.md](rules.md).

| Player | Bid | Taken | Accuracy | Bid score | Raw bonus | Bonus scored | Watch |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| Alba | 1 | 1 | True | 15 | 10 | 10 | 25 |
| Bo | 0 | 2 | Wide | −32 | 20 | 0 | −32 |
| Cen | 2 | 1 | Near | −6 | 25 | 0 | −6 |
| Dae | 1 | 0 | Near | −6 | 0 | 0 | −6 |

Alba: `15 × 1 = 15`, and the silence bonus stays 10.
Bo: a broken zero is `−8 × 4 = −32`. The Steel Tithe, worth 20, pays nothing. One taken trick would have been the same bid score.
Cen: `−6 × 1 = −6`. The 25 pays nothing on a missed Stake bid.
Dae: off by one with no bonus. Watch score −6.

### A pact on a made zero

Five cards. Stake. Dae bid 0 and took 0. Cen bid 1 and took 1. Dae's Oath was in a trick Cen won. Neither player has any other bonus. Neither is Wide, so each adds 10.

- Dae is True. Bid score `8 × 5 = 40`. Bonus 10. **50.**
- Cen is True. Bid score `15 × 1 = 15`. Bonus 10. **25.**

If Cen had bid 2 and taken 1, Cen would be Near, not Wide. The pact still adds 10 to each raw total. Dae stays True and still scores **50**. Cen scores `−6` and keeps no bonus, so Cen scores **−6**. One exact bid is enough for the player who made it.

If Cen had bid 0 and taken 2, Cen would be Wide. The pact pays nothing to either player. Dae scores **40**. Cen scores `−8 × 5 = −40`.

## Glide

There is no special zero. Every bid uses the same pot: `8 × cards`.

| Accuracy | Pot | Bonuses |
| --- | --- | --- |
| True | The whole pot | The whole raw total |
| Near | Half the pot | Half the raw total, fraction dropped |
| Wide | 0 | 0 |

`8 × cards` is always even, so the pot never needs a fraction dropped. Only the bonus total can.

A Glide watch score is 0 or more. Glide never subtracts.

| Cards | True pot | Near pot |
| ---: | ---: | ---: |
| 1 | 8 | 4 |
| 2 | 16 | 8 |
| 3 | 24 | 12 |
| 4 | 32 | 16 |
| 5 | 40 | 20 |
| 6 | 48 | 24 |
| 7 | 56 | 28 |
| 8 | 64 | 32 |
| 9 | 72 | 36 |
| 10 | 80 | 40 |

### The same four-card watch, in Glide

Pot 32. Near pot 16.

| Player | Accuracy | Pot | Scaled bonus | Watch |
| --- | --- | ---: | ---: | ---: |
| Alba | True | 32 | 10 | 42 |
| Bo | Wide | 0 | 0 | 0 |
| Cen | Near | 16 | 12 | 28 |
| Dae | Near | 16 | 0 | 16 |

Bo's Steel Tithe does not soften a Wide miss. Cen's 25 still pays 12.

## The pad

One row per player per watch is enough.

| Watch | Cards | Player | Bid | Taken | Bid score or pot | Raw bonus | Bonus scored | Watch | Running |
| ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |

At the end of the format, the highest running total wins. A tie shares, unless the table agreed to a 5-card decider before the first deal. The decider is one watch, scored in the same mode, and only its scores rank the tied players.

## What the two modes ask of you

Stake pays 15 for every trick in a made bid, so a high bid is worth making. A made zero grows with the watch and, by the last watch, sits just above a made bid of 5. A broken zero is one flat loss, and a missed Stake bid keeps no bonus.

Glide makes every accurate bid worth the same pot. Bidding higher does not raise the pot. It changes which result you can hit, and which bonuses you might be holding. Being one off is worth half. Being two off is worth nothing for the watch. A wide miss by either member of an Oath also takes the Oath's 10 off the other member's sheet.
