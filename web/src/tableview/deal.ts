/* The deal: one face-down stack on the felt is riffled, then dealt off the top, clockwise from the
   seat after the dealer, one card to a seat per lap. What is left stays on the felt as the pile.

   It is a picture of something that has already happened. The engine shuffled and dealt before the
   round was shown, so nothing here orders a card: every back looks the same, and the riffle shows no
   order. The picture is drawn from what the seat's view already says and nothing else: the dealer,
   the cards per seat, how many seats there are and how long the card list is.

   A run is a clock and three counters. The table is redrawn while it runs (a bot bids), so nothing
   is kept in the page: after every redraw, and after every card that lands, paintDeal() puts the
   run's state on whatever elements are there. The cards in the air are elements of their own,
   outside the table, and are gone when they land. Not in the legacy build. */
import type { TableView } from '../game';
import { clamp } from '../game/util';
import type { Seat } from '../protocol/generated';
import { cardBack } from './art';
import { $, $$, reduced } from './dom';
import { stage } from './state';

/** How long the stack is riffled before the first card leaves it. */
export const SHUFFLE_MS = 600;
/** How long one card is in the air. */
export const FLIGHT_MS = 320;
/** How long a hand card takes to turn face up, and how far apart the cards of a hand start turning. */
const TURN_MS = 280,
  TURN_GAP_MS = 35;

/** The time between two cards leaving the stack: slow when few are dealt, and under two seconds for a full table. */
export const dealGap = (flights: number): number => clamp(1600 / Math.max(1, flights), 28, 90);
/** Who gets each card, in the order they leave the stack: clockwise by seat, starting after the dealer. */
export const dealOrder = (dealer: Seat, seats: number, cards: number): Seat[] =>
  Array.from({ length: seats * cards }, (_, k) => (dealer + 1 + k) % seats);
/** How many cards are left on the felt once every seat has its hand. */
export const pileSize = (v: TableView): number => Math.max(0, v.deck.length - v.seats.length * v.cards);

interface Run {
  me: Seat;
  seats: number;
  /** The receiver of every card, in order. */
  order: Seat[];
  gap: number;
  /** The size of the whole stack. */
  total: number;
  /** When the riffle started, on this device's clock. */
  t0: number;
  /** Cards that have left the stack, and cards that have arrived. They land in the order they left. */
  launched: number;
  landed: number;
  /** When the hand on screen turns face up (its last card is down), and when the run is over. */
  flipAt: number;
  end: number;
  flipped: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  /** The cards in the air, oldest first. */
  flying: { i: number; el: HTMLElement }[];
}
let run: Run | null = null;

/** Whether a deal is being shown right now. */
export const dealing = (): boolean => run != null;

/** How many of the cards that have landed are `seat`'s. */
function landedAt(r: Run, seat: Seat): number {
  const place = (seat - r.order[0] + r.seats) % r.seats;
  return Math.floor(r.landed / r.seats) + (place < r.landed % r.seats ? 1 : 0);
}

/** The top card of the stack, when the felt is drawn: where every card leaves from. */
function stackBox(): DOMRect | null {
  const box = $('.pile .pile-cards')?.getBoundingClientRect();
  return box && box.width > 0 ? box : null;
}

/** One back in the air from `from` to `to` for `seat`, drawn `w` wide, ending at `shrink` times that. */
function fly(seat: Seat, from: DOMRect, to: DOMRect, w: number, shrink: number, tilt: number): HTMLElement | null {
  if (to.width <= 0) return null;
  const cx = to.left + to.width / 2,
    cy = to.top + to.height / 2,
    dx = from.left + from.width / 2 - cx,
    dy = from.top + from.height / 2 - cy;
  const el = document.createElement('div');
  el.className = 'dealfly';
  el.dataset.seat = String(seat);
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = `left:${cx - w / 2}px;top:${cy - w * 0.7}px;--w:${w}px`;
  el.innerHTML = cardBack();
  document.body.appendChild(el);
  el.animate(
    [
      { transform: `translate(${dx}px,${dy}px) scale(${from.width / w}) rotate(${tilt}deg)` },
      { transform: `scale(${shrink})` },
    ],
    { duration: FLIGHT_MS, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'both' },
  );
  return el;
}
/** Where a card for `seat` lands: that seat's pile, or the slot of the hand on screen that this lap fills. */
function landing(r: Run, i: number): HTMLElement | null {
  const seat = r.order[i];
  if (seat === r.me) return $$('.hand .hslot')[Math.floor(i / r.seats)] ?? null;
  return $(`.spile[data-seat="${seat}"] .card`) ?? $(`[data-anchor="seat-${seat}"]`);
}
function launch(r: Run, i: number): void {
  const from = stackBox(),
    to = landing(r, i)?.getBoundingClientRect();
  if (!from || !to) return;
  const seat = r.order[i],
    mine = seat === r.me;
  const el = fly(seat, from, to, mine ? to.width : from.width, mine ? 1 : to.width / from.width, (i % 5) * 4 - 8);
  if (el) r.flying.push({ i, el });
}

/** The hand on screen turns face up, card by card. A hand that is drawn as backs has no cover and stays down. */
function turnHand(): void {
  $$('.hand .hslot').forEach((slot, k) => {
    const hc = $('.hc', slot),
      cover = $('.cover', slot);
    if (!hc || !cover) return;
    cover.classList.add('turning');
    const delay = k * TURN_GAP_MS;
    hc.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], {
      duration: TURN_MS,
      delay,
      easing: 'ease-in-out',
    });
    setTimeout(() => cover.remove(), delay + TURN_MS / 2);
  });
}

/**
 * Put the run's state on the table as it is drawn now: the count on the stack, each seat's pile,
 * and which cards of the hand on screen are still to come or still face down. Without a run it
 * takes all of that off again, and the table is what the view drew.
 */
export function paintDeal(): void {
  const app = stage.app;
  if (!app) return;
  const r = run,
    t = r ? Date.now() - r.t0 : 0;
  const pile = $('.pile', app),
    left = pile && $('.cnt', pile);
  if (pile && left) {
    if (r) {
      pile.dataset.deal = t < SHUFFLE_MS ? 'shuffle' : 'deal';
      // A redraw mid-riffle makes a new stack: it picks the riffle up where the old one was.
      if (t < SHUFFLE_MS && !pile.style.getPropertyValue('--t')) pile.style.setProperty('--t', `${-Math.round(t)}ms`);
    } else {
      delete pile.dataset.deal;
      pile.style.removeProperty('--t');
    }
    const n = r ? r.total - r.launched : Number(pile.dataset.n);
    pile.hidden = !r && n === 0;
    left.textContent = String(n);
  }
  $$('.spile', app).forEach((el) => {
    const n = r ? landedAt(r, Number(el.dataset.seat)) : Number(el.dataset.n),
      count = $('.cnt', el);
    el.classList.toggle('none', n === 0);
    if (count) count.textContent = String(n);
  });
  const down = r != null && !r.flipped,
    mine = r ? landedAt(r, r.me) : 0;
  $$('.hand .hslot', app).forEach((slot, k) => {
    const cover = $('.cover', slot);
    if (!down) {
      delete slot.dataset.deal;
      if (cover && !cover.classList.contains('turning')) cover.remove();
      return;
    }
    slot.dataset.deal = k < mine ? 'down' : 'wait';
    // A hand that is shown gets a back over each face until it turns. A hidden hand is backs already.
    const hc = slot.dataset.key ? $('.hc', slot) : null;
    if (cover || !hc) return;
    hc.insertAdjacentHTML('beforeend', cardBack());
    hc.lastElementChild?.classList.add('cover');
  });
  $('.hand', app)?.toggleAttribute('data-deal', down);
  // The felt's own words come back when the last card is down.
  $('.trick .empty', app)?.toggleAttribute('data-deal', r != null);
}

function step(): void {
  const r = run;
  if (!r) return;
  r.timer = null;
  const t = Date.now() - r.t0,
    flights = r.order.length;
  // No stack to deal from (a screen too short to keep the felt beside the bid): the hands are simply there.
  if (t >= r.end || (t >= SHUFFLE_MS && r.launched === 0 && !stackBox())) return settle();
  while (r.launched < flights && t >= SHUFFLE_MS + r.launched * r.gap) {
    // A card that would have landed already (the tab was in the background) is counted, not drawn.
    if (t < SHUFFLE_MS + r.launched * r.gap + FLIGHT_MS) launch(r, r.launched);
    r.launched++;
  }
  r.landed = clamp(Math.floor((t - SHUFFLE_MS - FLIGHT_MS) / r.gap) + 1, 0, r.launched);
  while (r.flying.length && r.flying[0].i < r.landed) r.flying.shift()?.el.remove();
  if (!r.flipped && t >= r.flipAt) {
    r.flipped = true;
    turnHand();
  }
  paintDeal();
  r.timer = setTimeout(step, t < SHUFFLE_MS ? SHUFFLE_MS - t : clamp(r.gap / 2, 14, 40));
}

/** The run is over: the stack goes to where the pile lies, and the felt says what it said before. */
function settle(): void {
  const cards = $('.pile .pile-cards'),
    before = cards?.getBoundingClientRect();
  endDeal();
  const pile = $('.pile'),
    now = cards?.getBoundingClientRect();
  if (!pile || !before || !now || before.width <= 0 || now.width <= 0 || reduced()) return;
  pile.animate(
    [
      {
        transform: `translate(${before.left - now.left}px,${before.top - now.top}px) scale(${before.width / now.width})`,
      },
      { transform: 'none' },
    ],
    { duration: 300, easing: 'cubic-bezier(.2,.9,.3,1)' },
  );
}

/**
 * Show the round on screen being dealt. Only for a round that was dealt just now: the caller knows
 * that from a `roundStarted` it was just told, or from having started the game itself. With reduced
 * motion nothing moves: the hands and the pile are in their places at once.
 */
export function startDeal(v: TableView): void {
  endDeal();
  const seats = v.seats.length,
    order = dealOrder(v.dealer, seats, v.cards);
  if (reduced() || !order.length) return;
  const gap = dealGap(order.length),
    lastMine = order.lastIndexOf(v.me),
    lastDown = SHUFFLE_MS + (order.length - 1) * gap + FLIGHT_MS;
  const flipAt = SHUFFLE_MS + lastMine * gap + FLIGHT_MS + 80;
  run = {
    me: v.me,
    seats,
    order,
    gap,
    total: v.deck.length,
    t0: Date.now(),
    launched: 0,
    landed: 0,
    flipAt,
    end: Math.max(lastDown + 120, flipAt + 40),
    flipped: false,
    timer: null,
    flying: [],
  };
  run.timer = setTimeout(step, SHUFFLE_MS);
}

/** Stop showing the deal: everything is where it ends up. Safe to call when none is running. */
export function endDeal(): void {
  const r = run;
  run = null;
  if (r?.timer != null) clearTimeout(r.timer);
  $$('.dealfly').forEach((el) => el.remove());
  if (r) paintDeal();
}

/**
 * A seat swapped cards with the pile (the Smuggler): that many backs go from the pile to the seat.
 * Which cards they are is the Smuggler's to know, and only that seat's own view has them.
 */
export function tossFromPile(seat: Seat, count: number): void {
  const from = stackBox(),
    to = $(`.spile[data-seat="${seat}"] .card`)?.getBoundingClientRect();
  if (reduced() || !from || !to) return;
  for (let k = 0; k < Math.min(count, 5); k++)
    setTimeout(() => {
      const el = fly(seat, from, to, from.width, to.width / from.width, k * 5 - 6);
      if (el) setTimeout(() => el.remove(), FLIGHT_MS);
    }, k * 90);
}
