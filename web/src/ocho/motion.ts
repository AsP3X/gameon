/* Ocho's table in motion, as design/ocho.pen draws it ("Motion · the table"): a play flies to the
   discard, a draw leaves the pile for a hand or a seat, a new hand is shuffled and dealt.

   Nothing here comes from the server. The page remembers the last view it drew and compares it with
   the next one; what changed is what moves. The new view is already on the page when its motion
   starts: a flight is a copy of a card over the table, and the card it lands as is only held
   transparent until then. Every button works at once, a view that arrives mid-flight cancels the
   flight, and with reduced motion (or no Web Animations) nothing travels. */
import type { Card, View } from './wire';

/** What moved between two views, by the page's reckoning. */
export interface Changes {
  /** A new hand: shuffle the pile, then deal. */
  deal: boolean;
  /** The card that went onto the discard, and who played it: `you`, or another seat. */
  played: { card: Card; from: 'you' | number } | null;
  /** Backs that went from the pile to another seat, by seat. */
  drawn: { seat: number; n: number }[];
  /** Cards that joined your hand, in hand order. */
  mine: number[];
  /** The direction of play flipped. */
  turned: boolean;
  /** The open draw total changed. */
  stacked: boolean;
}

const ids = (cards: Card[]): Set<number> => new Set(cards.map((c) => c.id));

/** The other seats in play order from you, the order the deal goes round. */
const othersOf = (view: View): number[] =>
  Array.from({ length: view.counts.length - 1 }, (_, i) => (view.you + 1 + i) % view.counts.length);

export function changes(prev: View | null, next: View): Changes {
  const none: Changes = { deal: false, played: null, drawn: [], mine: [], turned: false, stacked: false };
  const dealt = prev == null ? next.phase === 'turn' || next.phase === 'chooseColor' : prev.handNo !== next.handNo;
  if (dealt)
    return {
      ...none,
      deal: true,
      drawn: othersOf(next)
        .map((seat) => ({ seat, n: next.counts[seat] ?? 0 }))
        .filter((d) => d.n > 0),
      mine: next.hand.map((c) => c.id),
    };
  if (prev == null || prev.counts.length !== next.counts.length) return none;
  let played: Changes['played'] = null;
  if (next.top.id !== prev.top.id) {
    if (ids(prev.hand).has(next.top.id)) played = { card: next.top, from: 'you' };
    else {
      const dropped = othersOf(next).filter((s) => (next.counts[s] ?? 0) < (prev.counts[s] ?? 0));
      const from = dropped.includes(prev.turn) ? prev.turn : (dropped[0] ?? prev.turn);
      played = { card: next.top, from: from === next.you ? 'you' : from };
    }
  }
  const had = ids(prev.hand);
  return {
    deal: false,
    played,
    drawn: othersOf(next)
      .map((seat) => ({ seat, n: (next.counts[seat] ?? 0) - (prev.counts[seat] ?? 0) }))
      .filter((d) => d.n > 0),
    mine: next.hand.filter((c) => !had.has(c.id)).map((c) => c.id),
    turned: prev.direction !== next.direction,
    stacked: next.stack != null && next.stack !== prev.stack,
  };
}

/** How many layers the draw pile shows: one per ten cards, up to ten. */
export const pileLayers = (drawCount: number): number =>
  drawCount <= 0 ? 0 : Math.min(10, Math.max(1, Math.ceil(drawCount / 10)));

/** A box on the page, relative to the table page. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const FLIGHT = 420;
const EASE = 'cubic-bezier(0.2, 0.9, 0.3, 1)';

/** Motion is on: the browser animates, and the player has not asked for less motion. */
export function moving(): boolean {
  if (typeof Element === 'undefined' || typeof Element.prototype.animate !== 'function') return false;
  return !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/** The motion of one table page. `page` is the positioned page, `layer` the empty box flights fly in. */
export class TableMotion {
  private running: Animation[] = [];
  private ghosts: HTMLElement[] = [];
  private ticking = new Set<HTMLElement>();
  private timers: number[] = [];
  private hand = new Map<number, Box>();
  private settled = 0;
  last: View | null = null;

  constructor(
    private page: HTMLElement,
    private layer: HTMLElement,
  ) {}

  /** Cancels whatever still moves: every card shows where the last view put it. */
  stop(): void {
    for (const a of this.running) a.cancel();
    for (const g of this.ghosts) g.remove();
    for (const t of this.timers) clearTimeout(t);
    for (const el of this.ticking) setCount(el, Number(el.dataset.n));
    this.timers = [];
    this.running = [];
    this.ghosts = [];
    this.ticking.clear();
    this.settled = 0;
  }

  /** Milliseconds until what was started last has landed. */
  idleIn(): number {
    return Math.max(0, this.settled - performance.now());
  }

  box(el: Element | null): Box | null {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const p = this.page.getBoundingClientRect();
    if (r.width === 0) return null;
    return { x: r.left - p.left, y: r.top - p.top, w: r.width, h: r.height };
  }

  /** Where each card of your hand is now, for the next view to fly from. */
  remember(): void {
    this.hand.clear();
    for (const li of this.page.querySelectorAll<HTMLElement>('[data-card]')) {
      const b = this.box(li.querySelector('.oc-card'));
      if (b) this.hand.set(Number(li.dataset.card), b);
    }
  }

  handBox(id: number): Box | null {
    return this.hand.get(id) ?? null;
  }

  private $(selector: string): HTMLElement | null {
    return this.page.querySelector<HTMLElement>(selector);
  }

  private keep(a: Animation): Animation {
    this.running.push(a);
    return a;
  }

  /** Holds `el` transparent for `ms`, then lets it show with a small landing. */
  private hold(el: HTMLElement, ms: number): void {
    this.keep(el.animate([{ opacity: 0 }, { opacity: 0 }], { duration: ms }));
    this.keep(
      el.animate([{ transform: 'scale(1.08)' }, { transform: 'none' }], { duration: 180, delay: ms, easing: EASE }),
    );
  }

  /** A copy of `proto` flying from one box to another. */
  private fly(proto: HTMLElement, from: Box, to: Box, delay: number, turn?: HTMLElement): number {
    const w = proto.offsetWidth;
    const h = proto.offsetHeight;
    if (w === 0 || h === 0) return delay;
    const ghost = document.createElement('div');
    ghost.className = 'oc-ghost';
    ghost.style.width = `${w}px`;
    ghost.style.height = `${h}px`;
    ghost.style.left = `${to.x + to.w / 2 - w / 2}px`;
    ghost.style.top = `${to.y + to.h / 2 - h / 2}px`;
    const back = proto.cloneNode(true) as HTMLElement;
    ghost.append(back);
    let face: HTMLElement | null = null;
    if (turn) {
      face = turn.cloneNode(true) as HTMLElement;
      ghost.append(face);
    }
    this.layer.append(ghost);
    this.ghosts.push(ghost);
    const dx = from.x + from.w / 2 - (to.x + to.w / 2);
    const dy = from.y + from.h / 2 - (to.y + to.h / 2);
    const a = this.keep(
      ghost.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${from.w / w}) rotate(-6deg)` },
          { transform: `translate(${dx * 0.45}px, ${dy * 0.55 - 18}px) scale(${(from.w / w + to.w / w) / 2 + 0.06})` },
          { transform: `scale(${to.w / w})` },
        ],
        { duration: FLIGHT, delay, easing: EASE, fill: 'backwards' },
      ),
    );
    if (face) {
      const timing = { duration: FLIGHT, delay, fill: 'both' as const };
      this.keep(
        back.animate(
          [
            { transform: 'scaleX(1)' },
            { transform: 'scaleX(1)', offset: 0.5 },
            { transform: 'scaleX(0)', offset: 0.68 },
          ],
          timing,
        ),
      );
      this.keep(
        face.animate(
          [
            { transform: 'scaleX(0)' },
            { transform: 'scaleX(0)', offset: 0.68 },
            { transform: 'scaleX(1)', offset: 0.86 },
          ],
          timing,
        ),
      );
    }
    void a.finished.then(
      () => ghost.remove(),
      () => ghost.remove(),
    );
    return delay + FLIGHT;
  }

  private pileTop(): HTMLElement | null {
    return this.$('[data-oc="draw"] .oc-card');
  }

  private discard(): HTMLElement | null {
    return this.$('[data-oc="discard"] .oc-card');
  }

  private seatBack(seat: number): HTMLElement | null {
    return this.$(`[data-seat="${seat}"] .oc-count .oc-card`);
  }

  private handCard(id: number): HTMLElement | null {
    return this.$(`[data-card="${id}"] .oc-card`);
  }

  /** A seat's count shows `n` until the backs flying to it land. */
  private countFrom(seat: number, n: number): void {
    const count = this.$(`[data-seat="${seat}"] [data-n]`);
    if (!count) return;
    this.ticking.add(count);
    setCount(count, n);
  }

  /** Backs from the pile to a seat; its count goes up with each one that lands. */
  private toSeat(seat: number, n: number, start: number, gap: number, from: number): number {
    const pile = this.pileTop();
    const a = this.box(pile);
    const b = this.box(this.seatBack(seat));
    if (!pile || !a || !b) return start;
    let end = start;
    for (let k = 0; k < n; k++) {
      const at = this.fly(pile, a, b, start + k * gap);
      end = Math.max(end, at);
      this.timers.push(
        window.setTimeout(() => {
          const count = this.$(`[data-seat="${seat}"] [data-n]`);
          if (count) setCount(count, from + k + 1);
        }, at),
      );
    }
    return end;
  }

  /** A back from the pile into your hand, turning into the card you were dealt. */
  private toHand(id: number, delay: number): number {
    const pile = this.pileTop();
    const card = this.handCard(id);
    const a = this.box(pile);
    const b = this.box(card);
    if (!pile || !card || !a || !b) return delay;
    const at = this.fly(pile, a, b, delay);
    this.keep(card.animate([{ opacity: 0 }, { opacity: 0 }], { duration: at }));
    this.keep(
      card.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], {
        duration: 200,
        delay: at,
        easing: EASE,
      }),
    );
    return at + 200;
  }

  private shuffle(): number {
    const pile = this.pileTop();
    const a = this.box(pile);
    if (!pile || !a) return 0;
    const halves = [-1, 1].map((side) => {
      const ghost = pile.cloneNode(true) as HTMLElement;
      ghost.classList.add('oc-ghost');
      ghost.style.left = `${a.x}px`;
      ghost.style.top = `${a.y}px`;
      this.layer.append(ghost);
      this.ghosts.push(ghost);
      const out = `translateX(${side * a.w * 0.6}px) rotate(${side * 10}deg)`;
      const anim = this.keep(
        ghost.animate(
          [
            { transform: 'none' },
            { transform: out },
            { transform: 'translateY(-4px)' },
            { transform: out },
            { transform: 'none' },
          ],
          { duration: 640, easing: 'ease-in-out' },
        ),
      );
      void anim.finished.then(
        () => ghost.remove(),
        () => ghost.remove(),
      );
      return anim;
    });
    return halves.length > 0 ? 680 : 0;
  }

  /** Moves the page from `prev` to `view`, which is already drawn. */
  view(view: View, launched: { id: number; box: Box } | null): void {
    const prev = this.last;
    this.last = view;
    this.stop();
    const was = new Map(this.hand);
    this.remember();
    if (!moving()) return;
    const c = changes(prev, view);
    let end = 0;

    if (c.deal) {
      let t = this.shuffle();
      const rounds = Math.max(view.hand.length, ...c.drawn.map((d) => d.n));
      const order = [...c.drawn.map((d) => d.seat), view.you];
      const gap = Math.max(18, Math.min(60, 1500 / Math.max(1, rounds * order.length)));
      const dealt = new Map<number, number>();
      for (const d of c.drawn) this.countFrom(d.seat, 0);
      for (let r = 0; r < rounds; r++)
        for (const seat of order) {
          if (seat === view.you) {
            const id = c.mine[r];
            if (id != null) end = Math.max(end, this.toHand(id, t));
          } else if (r < (view.counts[seat] ?? 0)) {
            end = Math.max(end, this.toSeat(seat, 1, t, 0, dealt.get(seat) ?? 0));
            dealt.set(seat, (dealt.get(seat) ?? 0) + 1);
          }
          t += gap;
        }
      const pile = this.pileTop();
      const top = this.discard();
      const a = this.box(pile);
      const b = this.box(top);
      if (pile && top && a && b) {
        const at = this.fly(pile, a, b, t, top);
        this.hold(top, at);
        end = Math.max(end, at);
      }
      this.settled = performance.now() + end;
      return;
    }

    if (c.played) {
      const top = this.discard();
      const b = this.box(top);
      if (top && b) {
        let at = 0;
        if (c.played.from === 'you') {
          const from = launched?.id === c.played.card.id ? launched.box : (was.get(c.played.card.id) ?? null);
          if (from) at = this.fly(top, from, b, 0);
        } else {
          const back = this.seatBack(c.played.from);
          const a = this.box(back);
          const pile = this.pileTop();
          if (a && pile) at = this.fly(pile, a, b, 0, top);
        }
        if (at > 0) this.hold(top, at);
        end = at;
      }
    }

    // The cards that stayed in your hand close up from where they were.
    for (const [id, now] of this.hand) {
      const then = was.get(id);
      const card = this.handCard(id);
      if (!then || !card) continue;
      const dx = then.x - now.x;
      const dy = then.y - now.y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      this.keep(
        card.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
          duration: 280,
          easing: EASE,
        }),
      );
    }

    const after = end > 0 ? end - 120 : 0;
    c.mine.forEach((id, k) => {
      end = Math.max(end, this.toHand(id, after + k * 90));
    });
    for (const d of c.drawn) {
      const before = (view.counts[d.seat] ?? 0) - d.n;
      this.countFrom(d.seat, before);
      end = Math.max(end, this.toSeat(d.seat, d.n, after, 90, before));
    }

    if (c.turned) {
      const arrow = this.$('.oc-direction svg');
      if (arrow) {
        const flip = view.direction < 0 ? ' scaleX(-1)' : '';
        this.keep(
          arrow.animate([{ transform: `rotate(-180deg)${flip}` }, { transform: `rotate(0deg)${flip}` }], {
            duration: 480,
            easing: EASE,
          }),
        );
      }
    }
    if (c.stacked) {
      const stack = this.$('.oc-stack');
      if (stack)
        this.keep(
          stack.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.16)' }, { transform: 'scale(1)' }], {
            duration: 420,
            delay: after,
            easing: EASE,
          }),
        );
    }
    this.settled = performance.now() + end;
  }

  /** The colour card grows out of `from` into its place, after whatever is still landing. */
  grow(card: HTMLElement | null, dim: HTMLElement | null, from: Box | null): void {
    if (!moving() || !card) return;
    const delay = this.idleIn();
    if (dim) this.keep(dim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay, fill: 'backwards' }));
    const to = this.box(card);
    if (!from || !to) {
      this.keep(
        card.animate(
          [
            { opacity: 0, transform: 'scale(0.6)' },
            { opacity: 1, transform: 'none' },
          ],
          {
            duration: 320,
            delay,
            easing: EASE,
            fill: 'backwards',
          },
        ),
      );
      return;
    }
    this.keep(card.animate(flipFrom(from, to), { duration: 360, delay, easing: EASE, fill: 'backwards' }));
  }

  /** `el` arrives from `from`: the colour card shrinking back into the hand or onto the discard. */
  settle(el: HTMLElement | null, from: Box): void {
    if (!moving() || !el) return;
    const to = this.box(el);
    if (!to) return;
    this.keep(el.animate(flipFrom(from, to), { duration: 300, easing: EASE }));
  }
}

function flipFrom(from: Box, to: Box): Keyframe[] {
  const dx = from.x + from.w / 2 - (to.x + to.w / 2);
  const dy = from.y + from.h / 2 - (to.y + to.h / 2);
  return [{ transform: `translate(${dx}px, ${dy}px) scale(${from.w / to.w})` }, { transform: 'none' }];
}

/** Writes a count into the text React put there; `stop` writes the view's own number back. */
function setCount(el: HTMLElement, n: number): void {
  const text = el.firstChild;
  if (text && text.nodeType === Node.TEXT_NODE) text.nodeValue = String(n);
}
