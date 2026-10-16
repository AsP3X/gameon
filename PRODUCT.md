# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Someone who wants a game night in the browser. Three situations are first-class: playing alone against bots, passing one phone around a table, and sitting down online with friends. A guest starts with one tap and can play everything except ranked. An account is a username and a password, and is what ranked play and a saved solo game need.

## Product Purpose

GameOn is the frame around the games: a landing page, a list of games, accounts, profiles and a ladder. Skull King and Ocho are live. Success is a hand started with no download and no account.

## Positioning

Card and board games in the browser, on one table that works alone, on one shared phone, or online. The server is the only authority for an online game. A neighbouring product that only offers a lobby, or only a local toy, is not this.

## Operating Context

The client is a React app, installable, used on a phone and on a wide desktop, in light and in dark. The live site is the deployed `dev` build. Design drawings live in `design/gameon.pen`, `design/ocho.pen`, `design/skt.pen` and `design/web.pen`. Marks live in `design/brand/gameon/`.

## Capabilities and Constraints

Skull King is a bid-and-trick game. Ocho is match-a-colour-or-a-number. Hearts, Chess, Ludo, Four in a Row and Five Dice are announced and not playable. Ranked play needs an account, uses a seasonal ladder, and never starts with a bot. Solo against bots can resume on any device when the server is reachable. One screen needs no server. A private table is joined with a six-character code.

This design pass draws in the `.pen` files only. It does not change the rules or the words already on the screens. The client stays the renderer. The server stays the authority.

## Brand Commitments

The product is Skull King Tavern. The frame is GameOn. The words already on the screens stay. The marks in `design/brand/gameon/` stay. The user asked for one visual language across the website and the live games, responsive from a phone to a wide window, with motion only where it explains a change. The colours, the rounded face and the logo face already in `web/src/styles/tokens.css` are the committed world. This pass makes that world consistent. It does not replace it.

## Evidence on Hand

The landing, Games, the Skull King table and the Ocho table are implemented in `web/`. Screenshots of the landing and the table are in `docs/readme/`. There are no testimonials, prices or press claims, and none should be invented.

## Product Principles

- A hand can start without an account or a download.
- The server decides an online game. The screen shows what it was given.
- One language covers the frame and both tables, on a phone and on a wide window.
- The words and the rules stay. The drawing may be tightened.
- Motion explains a change, such as a card played or a turn begun. It does not decorate a still page.

## Accessibility & Inclusion

The existing client requires text at least 4.5:1 on its background, targets at least 44px, a visible focus, and no required motion when the visitor asks for less. Light and dark both ship.
