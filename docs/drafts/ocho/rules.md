# Ocho — design source

Design source for the first Pencil pass. Not implemented. No engine, protocol, or page is built from this file.

The first drawing is the Plato-style game only: the table and the card layouts. The standard-deck variant is recorded below and is not drawn in this pass. Home, setup, and the Games shelf tile are not in this pass.

Card layouts are frames: back, rank, color, and the name of a special. No illustrations, no generated images, and no use of the Skull King card-art scripts.

## Locked for the drawing

Taken from the rules text and from the owner. Not house additions.

1. **Eight seats.** The official maximum is 8. The table is drawn for 8 players. Two players are a second frame, because Reverse is a Skip there. Team mode is a third frame: four seats, partners opposite, each partner's cards visible. Eight players is free-for-all, not four teams.
2. **Boo Blue.** A tie hits every player who shares the fewest cards. Each of them draws 2.
3. **Dead Red.** The card is on the discard before hands are checked. The player who played it draws 2 when it was their last red card. That is what makes "the player who played it can be affected" true.
4. **Opening card.** Any card may be turned up. It sets color and number or symbol only. Its effect does not fire.
5. **Hand end.** The frame shows who went out, the cards left in the other hands, and the point sum: a number is its face value, an action is 20, a wild or a special is 50.

Everything else below is the text to draw from.

## Plato-style Ocho

A shedding game. Be the first to play your last card. The hand ends at once when a player has no cards. There is no call when one card is left, and no penalty for staying quiet. There is no challenge on Wild Draw 4.

### Players

The table seats 2 to 8. Eight is the official maximum, and it is the table drawn for every play state. With two players, Reverse is a Skip. Team mode is 2v2 only: four seats, partners opposite, each sees the partner's cards, and the team wins when one partner goes out. An eight-player game is not played in teams.

### Deck

Four colors: red, blue, green, yellow. Counts below are the suggested deck, not a published Plato list. The layouts need one face per kind, not one frame per copy.

| Kind | Count | Matches by |
| --- | --- | --- |
| Number 0 | one per color | color or number |
| Numbers 1–9 | two per color | color or number |
| Skip | two per color | color or Skip |
| Reverse | two per color | color or Reverse |
| Draw 2 | two per color | color or Draw 2 |
| Ocho Wild | 4–8 | anything; player names the next color |
| Wild Draw 4 | 4 | anything; names the next color |
| Shield | 4 | anything; names the next color |
| X-Ray | 4 | anything; names the next color |
| Dead Red | 2–4 | red |
| Boo Blue | 2–4 | blue |

Number cards: 76. Skip, Reverse, and Draw 2: 24. With the specials above, the deck is about 110–120 cards.

### Setup

Shuffle. Deal 8 cards face down to each player. The rest is the draw pile, face down. Turn one card to start the discard. That card sets the starting color and the starting number or symbol. Skip, Reverse, Draw, and the other specials do not fire from it. Play starts with the player to the left of the dealer and goes clockwise until a Reverse. Direction is shown on the table at all times, with the color and the number or symbol that must be matched.

### A turn

Play one card, or draw one card.

A card is legal when it matches the discard by color, by number, or by the same action symbol. Ocho Wild, Wild Draw 4, Shield, and X-Ray are legal on anything, even when the player has a match.

If the player cannot play, they draw one card. They may play that card at once if it is legal. If they do not, the turn ends.

After a play, the turn passes to the next player in the current direction. One card per turn, except a Draw card played to add to a stack.

### Cards

- **Numbers 0–9.** No effect.
- **Ocho Wild.** The player names the next color.
- **Skip.** The next player loses a turn.
- **Reverse.** Direction flips. With two players, Reverse is a Skip.
- **Draw 2.** The next player draws 2 and loses the turn, unless they play a Draw 2 or a Wild Draw 4 onto the stack.
- **Wild Draw 4.** The player names the next color. The next player draws 4 and loses the turn, unless they play a Draw 2 or a Wild Draw 4 onto the stack.
- **Shield.** A wild. It blocks a Draw 2, a Wild Draw 4, or the whole stack aimed at the player, and sends that total back to the last player who played a draw card. A Shield can send a stack back at another Shield. It does not block Dead Red or Boo Blue.
- **X-Ray.** A wild. The player who played it is shown one random card from each opponent's hand. Only that player sees those cards. Hands stay hidden otherwise, except partners in team mode.
- **Dead Red.** Counts as red. Every player who has no red card in hand draws 2. Shield does not stop it. It happens before the next ordinary turn. The player who played it is included if they qualify.
- **Boo Blue.** Counts as blue. Every player who has the fewest cards draws 2, including a tie and including the player who played it. Shield does not stop it. It happens before the next ordinary turn.

### Stacking draws

Draw 2 and Wild Draw 4 add to a running total. The first player who does not play another Draw 2 or Wild Draw 4 draws the whole total and loses the turn. A Draw 2 followed by a Wild Draw 4 is 6 cards. Shield throws the current total back at the last player who played a draw card.

The table shows the running total while a stack is open.

### Edges

- **Draw pile empty.** Shuffle the discard into a new draw pile and leave the top card face up. The player who was drawing does it.
- **Last card.** The hand ends when it is played. Its effect still happens. A last-card Draw 2 still starts a stack.
- **Several Skips or Reverses.** They resolve in the order played. Reverse changes direction at once.

### Scoring

The hand ends when a player has no cards. The hand-end frame shows that player, the cards left in the other hands, and the point sum of those cards: a number is its face value, an action is 20, a wild or a special is 50. First to a target such as 500 wins the match, or the match is a fixed number of hands. The match score itself is not a screen in this pass.

## Standard deck

Not drawn in this pass.

A 52-card deck plus jokers. Deal 7. Match suit or rank. Ace is Reverse. 2 is Draw Two, and 2s stack. 3–10 have no effect. Jack, Queen, and King name a new suit. Joker is Wild Draw Four: it names a suit, the next player draws 4 and loses the turn, and it is not used to stack on a Draw Two. Playing a card of the same rank and suit skips the next player. A player with one card left must say "Ocho"; if someone else says it first, after a pause, that player draws 4. The opening card sets suit and rank and does not fire an Ace or a 2. An empty draw pile is reshuffled, leaving the top card.

## What the table has to show

Direction of play. The color and the number or symbol to match. Whose turn it is. The draw pile and the discard. An open draw total. A private X-Ray look. Who Dead Red or Boo Blue sent cards to. The hand ending when someone plays their last card.
