# The Count's Hall — rules of play

> **DRAFT — DO NOT USE.**
> This is a draft. It should not be used in any way, shape, or form for now. Do not implement it, publish it, or treat it as legal advice or as the rules of the game that is currently built.

**Players:** 2–6. Four is the best first table.
**Time:** a Half watch is a short night. A Full watch is a long one.
**What you need:** the deck for the modules you switched on, a way to write secret bids, a score sheet, and the Chair (any dealer marker).

The Count's hall meets for a watch. Before the cards are played, every player signs a contract: a number, from zero up to the cards in hand, for how many tricks they will take. Make it and the watch pays you. Miss it and the watch costs you. The cards from 1 to 14 take tricks in the ordinary way. A few cards sit outside the suits and decide tricks the numbers cannot.

These rules say **trick**, **bid**, and **watch**. A watch is one round. The bid is the contract.

One sentence covers the people: a Fool beats the Count, the Count beats the Knights, a Knight beats a Fool.

## Setup

1. Choose **Stake** or **Glide**. Scoring for both is in [scoring.md](scoring.md). Stake is the sharp pad. Glide is the even pad.
2. Choose a format.
   - **Full watch:** 10 watches, hands of 1, 2, 3, 4, 5, 6, 7, 8, 9, 10.
   - **Half watch:** 6 watches, hands of 3, 4, 5, 6, 5, 4.
   - **Hall rounds:** 7 watches, hands of 4, 4, 5, 5, 6, 6, 7.
3. Choose modules. The base deck is 68 cards. **Truce**, **Smoke**, and the **Oath** are optional. Each one you add is one extra card. Any combination is legal, including none.
4. Give the Chair to any player. That player deals the first watch. Play proceeds clockwise.

If a format ever asks for more cards than `floor(deck ÷ players)`, deal that smaller number instead. The number you use in scoring is the number actually dealt. In these three formats, at 2–6 players, that cap does not come up. A six-player Full watch deals 60 of the 68 cards and leaves 8 in the pile.

## The deck

The base deck:

| Cards | Count | Role |
| --- | ---: | --- |
| Grain, Stone, and Wool, ranks 1–14 | 42 | Plain suits |
| Steel, ranks 1–14 | 14 | Trump |
| Cloak | 4 | Blank. Loses the trick |
| Marshal, Steward, Exchanger, Almoner | 4 | Knights |
| Squire | 1 | Declared armed or cloaked as it is played |
| Count | 1 | Commands Knights. Loses to a Fool |
| Fool | 2 | Mocks the Count. Loses to a Knight |

A **Tithe** is a 14 of any suit. The Steel 14 is the Steel Tithe and pays 20. Each plain 14 pays 10.

Details, flavor, and powers are in [cards-and-characters.md](cards-and-characters.md).

## One watch

### Deal

Shuffle. Deal one card at a time, clockwise, starting with the player to the dealer's left, until every player has the hand for this watch. Leave the rest face down as the pile. Do not reshuffle the pile. The top card is the first card that was not dealt.

If a card is exposed during the deal, shuffle again and redeal the watch.

### Bid

Look at your hand. Each player secretly writes an integer from 0 through the number of cards dealt. Reveal the bids together. A revealed bid stays. Then the player to the dealer's left leads the first trick.

### Play a card

On your turn, play one card from your hand in front of you.

- If the trick has a led suit and your hand contains that suit, you must play that suit or a special card.
- Special cards are Cloak, the Knights, the Squire, the Count, the Fools, Truce, Smoke, and the Oath.
- You may play a special card even when you can follow suit.
- You may not play a numbered card of another suit, including Steel, while you still hold the led suit.
- If you have no card of the led suit, you may play anything.
- If the trick has no led suit, you may play anything.

The **led suit** is set by the first card in the trick that is not a Cloak, and only when that card is a numbered card. The Oath counts as a Cloak for this purpose. The Squire declared cloaked counts as a Cloak. A Knight, the Squire declared armed, the Count, a Fool, Truce, or Smoke sets no suit. Cards played after that do not create a led suit later.

When you play the Squire, say **armed** or **cloaked** as the card touches the table. The play is not finished until you have said one. You cannot change the choice after the next player has seen it.

An illegal card goes back to the hand if someone notices before the trick is gathered. The play is then made legally. No points are charged for the correction.

### End the trick

Resolve the trick with the procedure below. The winner leads the next trick, unless a power or Truce names someone else. Gather the cards of that trick into the winner's won pile, face down, apart from tricks they will still play. A void trick is set aside, out of the game, and is nobody's win.

### End the watch

When the hands are empty, score the watch. Pass the Chair clockwise. The new dealer shuffles every card, including the old pile and the set-aside cards, and deals the next watch.

## Who wins the trick

Go down this list and stop at the first step that applies.

1. **Truce and Smoke together.** Treat both as Cloaks. Ignore their usual effects. Continue at step 4.
2. **Truce alone.** Nobody wins. No bonuses, no powers, no oath. The next leader is the player clockwise from the player who played Truce.
3. **Smoke alone.** Specials cannot win, and Steel does not trump.
   - If the trick has a led suit, the highest rank of that suit wins. A higher card of another suit does not beat it.
   - If the trick has no led suit, the highest rank of any suit wins. If two cards share that rank, the one played earlier wins.
   - If no numbered card was played, nobody wins. The player who played Smoke leads next.
4. **A Fool and the Count.** The earliest Fool wins. This is true even when a Knight is also in the trick.
5. **The Count, and no Fool.** The Count wins.
6. **A Knight, and no Count.** The Squire declared armed is a Knight. The earliest Knight wins.
7. **A Fool, and no Knight and no Count.** The earliest Fool wins.
8. **Numbered cards.** Walk them in the order they were played. The first numbered card is ahead. A later numbered card moves ahead only in one of these cases: it is Steel and the card ahead is a plain suit; it is Steel, the card ahead is Steel, and its rank is higher; or it is the same suit as the card ahead and its rank is higher. A plain card never moves ahead of a different suit. When the trick has a led suit, the first numbered card is that suit, so this is ordinary trump. Ranks run from 1 up to 14.
9. **Every card is a Cloak.** The earliest card wins.

"Earliest" means the card played first among the cards tied for that step.

### Worked tricks

**Follow suit.** Wool is led. You hold Wool 2 and Steel 14. You play Wool 2. Steel does not excuse you from following.

**A special instead.** Wool is led and you hold Wool 4. You may play a Fool, a Cloak, or any other special. You may not play Grain.

**Trump.** The led suit is Grain. Grain 14 is in the trick. Steel 1 is played later by a player who had no Grain. Steel 1 wins.

**No led suit.** The Marshal is led, so nobody follows a suit. Stone 4 is played, then Grain 11: Stone 4 stays ahead of Grain 11. Steel 2 moves ahead of that Stone 4. Steel 9 would move ahead of Steel 2. The Marshal still beats all of those numbers.

**The cycle.** A Fool, the Count, and the Almoner are in one trick. The Fool wins. Score the Fool's bonus only.

**Two Knights.** The Marshal is played, then the Exchanger. No Count is in the trick. The Marshal wins, and only the Marshal's power can fire.

**All Cloaks.** The Squire was declared cloaked and every other card is a Cloak or the Oath. The earliest of those cards wins.

**Smoke keeps the led suit.** Wool was led. The trick is Wool 6, Steel 14, a Fool, and Smoke. Wool 6 wins. The winner still collects the Steel Tithe if the watch's scoring says so.

**Smoke with no suit.** The Count was led, then Smoke, then Steel 14 and Grain 14. No led suit. The two 14s tie. The one played earlier wins.

**Truce.** The Count would have won, and Bo plays Truce. Nobody takes the trick. The player to Bo's left leads next.

**Truce and Smoke together.** Truce, Smoke, the Count, and Grain 8 are in one trick. Truce and Smoke become Cloaks. The Count wins the trick normally.

## Powers

A power fires only after the trick has a winner, and only if that winning card is the Knight named below. The Squire has no power. One winner means at most one power. Using a power is optional. Skip the Marshal and the Steward on the last trick of the watch. A power that needs the pile does nothing when the pile is empty.

| Knight | Power |
| --- | --- |
| Marshal | Name any player to lead the next trick, including yourself. If you name no one, you lead. |
| Steward | Look secretly at the top three cards of the pile, or at all of them if fewer than three remain. Put them back in any order. |
| Exchanger | Draw the top card of the pile, then discard one card from your hand face down, out of the game. You may discard the card you just drew. No one else looks at either card. You may do this only if at least one card was still in your hand after you played the Exchanger. |
| Almoner | Give this trick to another player who is still short of their bid. Still short means the tricks they have already won this watch, not counting this trick, are fewer than their bid. A bid of zero is never short while that player has won nothing. That player won the trick: the count, the bonuses, and the next lead. If nobody else is short, you keep the trick. |

The Exchanger does not change how many cards you will have for the remaining tricks. You played one card, drew one, and discarded one.

The Almoner's gift is decided before bonuses are written down and before the next card is led. The winning card is still the Almoner. If the Almoner silenced a Fool, the player you gave the trick to receives that bonus. You cannot give a void trick, because a void trick has no winner. You cannot give the trick to a player who has already met or passed their bid, and you cannot hand it to a zero bid that is still clean.

## Bonuses

Bonuses are written as a raw total during the watch and scaled at the end. Build one total per player, then scale that total once. Do not scale each bonus and then add. The scale depends on the mode, and the full arithmetic is in [scoring.md](scoring.md).

- **Stake.** A true bid keeps the whole total. Any miss keeps nothing.
- **Glide.** A true bid keeps the whole total. A miss of exactly one keeps half, with the fraction dropped. A wider miss keeps nothing.

These events add to the raw total of the player who **won the trick**:

| Event | Raw |
| --- | ---: |
| Each plain Tithe in the trick (Grain 14, Stone 14, Wool 14) | 10 |
| The Steel Tithe (Steel 14) | 20 |
| A Knight won and a Fool is in the trick | 10 for each Fool |
| The Count won and a Knight is in the trick | 15 for each Knight, and the Squire armed counts |
| A Fool won and the Count is in the trick | 25 |

The winner collects Tithes whether they played the 14 or took it from someone else.

Relationship bonuses need the winning card to be the card that did the work. A Fool that lost to a Knight does not score 25. A Knight that lost to the Count does not score 10. When a Fool beats the Count in a trick that also contains a Knight, score 25 and nothing from the Knight.

A void trick scores nothing.

### The Oath

The Oath is a Cloak with one extra result. If the final winner of its trick is a different player, those two players have a pact. At the end of the watch, judge the pact before any other scaling:

- If either member is off by two or more, neither member adds the pact's 10. Their other bonuses are judged as usual.
- Otherwise each member adds 10 to their own raw total. A true bid and a miss of exactly one can share a pact. Both players do not have to be exact.
- Then scale each player's own total by the mode. In Stake, a miss keeps no bonus, so only the true member keeps the 10. In Glide, a miss of exactly one keeps half of that player's whole total, pact included.

There is no pact if the Oath's player wins that trick, including by being given it with the Almoner. There is no pact if the trick is void. The deck has one Oath, so a watch has at most one pact.

A made bid of zero can still earn the pact bonus. It cannot earn a Tithe or a relationship bonus, because those require a trick won, and a made zero won none.

## Scoring the watch

Use [scoring.md](scoring.md). The piece you need at the table:

**Stake**

- True, bid of 1 or more: `15 × bid`
- True, bid of 0: `8 × cards dealt`
- Miss, bid of 1 or more: `−6 × the difference`
- Miss, bid of 0: `−8 × cards dealt`, whether the player took one trick or all of them
- Then add bonuses only if the bid was true. A miss adds none.

**Glide**

- The pot is `8 × cards dealt` for every bid, including zero.
- True: the whole pot. Near (off by exactly one): half the pot. Wide: 0.
- Add the scaled bonuses. A Glide watch never scores below 0.

The highest total after the last watch wins. An equal total is a shared win.

Before the first deal, the table may agree to a decider. If they do, players who are tied play one more watch of 5 cards, or fewer if the deck will not deal 5. Only the decider's scores rank those players. A further tie shares.

## A short teaching watch

Four players, four cards, Stake, base deck. Alba was left of the dealer and bids 1. Bo bids 0. Cen bids 2. Dae bids 1.

| Trick | What happens | Winner |
| --- | --- | --- |
| 1 | Alba leads the Marshal. Bo plays a Cloak. Cen plays a Fool. Dae plays Stone 8. The Marshal silences the Fool and names Dae to lead next. | Alba. Raw bonus 10 |
| 2 | Dae leads Steel 4. Alba has no Steel and plays Stone 2. Bo plays Steel 14. Cen plays Wool 6. | Bo. Raw bonus 20 |
| 3 | Bo leads Grain 3. Cen plays a Fool. Dae plays the Count. Alba plays the Almoner. The Fool mocks the Count. The Almoner does not fire. | Cen. Raw bonus 25 |
| 4 | Cen leads the Squire, cloaked. Dae plays a Cloak. Alba plays a Cloak. Bo plays Wool 1. No suit was led. Wool 1 is the only number. | Bo |

Tricks taken: Alba 1, Bo 2, Cen 1, Dae 0.

- Alba is true. Bid score `15 × 1 = 15`. Bonus 10. **25.**
- Bo bid 0 and took 2. That is a broken zero, so the Steel Tithe is lost. Bid score `−8 × 4 = −32`. **−32.** Taking two tricks costs Bo the same as taking one would have.
- Cen is off by one. Bid score `−6`. The 25 is lost, because Stake pays bonuses only on a true bid. **−6.**
- Dae is off by one and captured nothing. Bid score `−6`. **−6.**

The same tricks in Glide, pot `8 × 4 = 32`: Alba `32 + 10 = 42`, Bo `0`, Cen `16 + 12 = 28`, Dae `16`. Cen's 25 pays 12 there, because Glide keeps half the bonuses on a miss of one.
