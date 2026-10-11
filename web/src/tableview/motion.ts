/* Motion: FLIP for the cards, the trick sweep, counters, the stamp banner, confetti and the finale.
   Ported from the legacy build (legacy/Skull King Tavern.html, section 12) without changing behavior:
   same durations, delays and easings. Everything here steps aside when the user prefers reduced motion. */
import type { TableView } from '../game';
import { clamp } from '../game/util';
import { Sound } from '../sound/sound';
import { $, $$, esc, reduced, sgn, wait } from './dom';
import { stage, ui } from './state';

/** Where the keyed elements and the anchors were before a re-render. */
export interface Snapshot {
  keys: Map<string, DOMRect>;
  anchors: Map<string, DOMRect>;
}
/** FLIP: remember where keyed elements were, then animate them from there after re-render. */
export function snapshot(): Snapshot {
  const keys = new Map<string, DOMRect>(),
    anchors = new Map<string, DOMRect>();
  $$('[data-key]').forEach((el) => keys.set(el.dataset.key ?? '', el.getBoundingClientRect()));
  $$('[data-anchor]').forEach((el) => anchors.set(el.dataset.anchor ?? '', el.getBoundingClientRect()));
  return { keys, anchors };
}
export function flip(snap: Snapshot | null): void {
  if (!snap || reduced()) return;
  $$('[data-key]').forEach((el) => {
    const now = el.getBoundingClientRect();
    let from: { left: number; top: number; width: number } | undefined = snap.keys.get(el.dataset.key ?? ''),
      fresh = false;
    if (!from && el.dataset.from) {
      const anchorEl = $(`[data-anchor="${el.dataset.from}"]`);
      const a = snap.anchors.get(el.dataset.from) || (anchorEl && anchorEl.getBoundingClientRect());
      if (a) {
        from = {
          left: a.left + a.width / 2 - now.width / 2,
          top: a.top + a.height / 2 - now.height / 2,
          width: now.width,
        };
        fresh = true;
      }
    }
    if (!from) return;
    const dx = from.left - now.left,
      dy = from.top - now.top,
      sc = fresh ? 0.4 : from.width / now.width;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sc - 1) < 0.01) return;
    el.animate(
      [
        { transform: `translate(${dx}px,${dy}px) scale(${sc})`, opacity: fresh ? 0.2 : 1 },
        { transform: 'none', opacity: 1 },
      ],
      {
        duration: fresh ? 460 : 340,
        delay: +(el.dataset.delay || 0),
        easing: 'cubic-bezier(.2,.9,.3,1.12)',
        fill: 'backwards',
      },
    );
  });
}
/** Sweep the finished trick to its winner, or sink it if a beast destroyed it. */
export async function collectTrick(prev: TableView | null): Promise<void> {
  if (reduced() || !prev || !prev.lastTrick) return;
  const slots = $$('.trick .slot');
  if (!slots.length) return;
  const w = prev.lastTrick.result.winner,
    target = w != null ? $(`[data-anchor="seat-${w}"]`) : null;
  const tr = target && target.getBoundingClientRect();
  const anims = slots.map((el, k) => {
    const r = el.getBoundingClientRect();
    const end = tr
      ? `translate(${tr.left + tr.width / 2 - (r.left + r.width / 2)}px,${tr.top + tr.height / 2 - (r.top + r.height / 2)}px) scale(.22) rotate(${k * 9 - 14}deg)`
      : `translateY(60px) scale(.5) rotate(${k % 2 ? 24 : -24}deg)`;
    return el.animate(
      [
        { transform: 'none', opacity: 1 },
        { transform: end, opacity: tr ? 0.4 : 0 },
      ],
      { duration: tr ? 440 : 560, delay: k * 45, easing: 'cubic-bezier(.55,0,.75,.2)', fill: 'forwards' },
    );
  });
  await Promise.all(anims.map((a) => a.finished.catch(() => {})));
}
export function animateBar(): void {
  const bar = $('.bar>i[data-to]');
  if (bar && bar.style.width !== bar.dataset.to + '%') {
    bar.getBoundingClientRect();
    requestAnimationFrame(() => {
      bar.style.width = bar.dataset.to + '%';
    });
  }
}
export function countUp(): void {
  $$('[data-count]').forEach((el, k) => {
    const end = Number(el.dataset.count),
      fmt = el.hasAttribute('data-plain') ? String : sgn;
    if (reduced()) {
      el.textContent = fmt(end);
      return;
    }
    const t0 = performance.now() + k * 70,
      dur = 650;
    const step = (now: number): void => {
      const p = clamp((now - t0) / dur, 0, 1);
      el.textContent = fmt(Math.round(end * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
/** Full-screen stamp text. words are stamped in sequence; sub is an optional caption. */
export async function banner(words: string[], sub?: string): Promise<void> {
  const el = document.createElement('div');
  el.className = 'banner' + (sub ? ' small' : '');
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<div>${words.map((w, k) => `<span style="animation-delay:${k * 260}ms">${esc(w)}</span>`).join('')}</div>${sub ? `<small>${esc(sub)}</small>` : ''}`;
  document.body.appendChild(el);
  if (reduced()) {
    await wait(500);
    el.remove();
    return;
  }
  await wait(1150);
  el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' });
  await wait(180);
  el.remove();
}
export function confetti(): void {
  if (reduced()) return;
  const c = stage.fx;
  if (!c) return;
  const x = c.getContext('2d');
  if (!x) return;
  c.hidden = false;
  const W = (c.width = innerWidth * devicePixelRatio),
    H = (c.height = innerHeight * devicePixelRatio);
  const cols = ['#58cc02', '#1cb0f6', '#ffc800', '#ff4b4b', '#ce82ff', '#ff9600'];
  const P = Array.from({ length: 150 }, () => ({
    x: Math.random() * W,
    y: -Math.random() * H * 0.5,
    vx: (Math.random() - 0.5) * 6,
    vy: 2 + Math.random() * 5,
    r: Math.random() * 6.28,
    vr: (Math.random() - 0.5) * 0.3,
    s: (6 + Math.random() * 8) * devicePixelRatio,
    c: cols[(Math.random() * 6) | 0],
  }));
  const t0 = performance.now();
  (function f(now: number): void {
    if (stage.fx !== c) return; // unmounted while the confetti fell
    x.clearRect(0, 0, W, H);
    P.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy * devicePixelRatio;
      p.vy += 0.04;
      p.r += p.vr;
      x.save();
      x.translate(p.x, p.y);
      x.rotate(p.r);
      x.fillStyle = p.c;
      x.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      x.restore();
    });
    if (now - t0 < 3200) requestAnimationFrame(f);
    else {
      x.clearRect(0, 0, W, H);
      c.hidden = true;
    }
  })(t0);
}

/* ---------- Finale: others -> winner -> awards ---------- */
/** Bumped whenever a running finale must stop: a new one starts, it is skipped, or the screen is left. */
export const finale = { token: 0 };
function countTo(el: HTMLElement | null, dur = 700): void {
  if (!el) return;
  const end = Number(el.dataset.final);
  if (reduced()) {
    el.textContent = String(end);
    return;
  }
  const t0 = performance.now();
  const step = (now: number): void => {
    const p = clamp((now - t0) / dur, 0, 1);
    el.textContent = String(Math.round(end * (1 - Math.pow(1 - p, 3))));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
/** Reveal the standings from last place up, build suspense, crown the winner, then flip in the awards. */
export async function playFinale(): Promise<void> {
  const token = ++finale.token;
  const alive = (): boolean => token === finale.token && ui.screen === 'end' && !ui.finaleDone;
  if (reduced()) return finishFinale();
  await wait(700);
  if (!alive()) return;
  const rows = $$('.standings li').sort((a, b) => Number(a.dataset.step) - Number(b.dataset.step));
  const gap = clamp(2800 / Math.max(1, rows.length), 450, 800);
  for (let k = 0; k < rows.length; k++) {
    rows[k].classList.add('in');
    countTo(rows[k].querySelector<HTMLElement>('[data-final]'), 500);
    Sound.play('tick', k);
    await wait(gap);
    if (!alive()) return;
  }
  const hero = $('.hero-win');
  if (!hero) return;
  hero.classList.add('suspense');
  Sound.play('drum');
  await wait(1700);
  if (!alive()) return;
  hero.classList.add('revealed');
  countTo(hero.querySelector<HTMLElement>('.reveal [data-final]'), 900);
  Sound.play('fanfare');
  confetti();
  await wait(1500);
  if (!alive()) return;
  const tiles = $$('.award');
  for (let k = 0; k < tiles.length; k++) {
    tiles[k].classList.add('in');
    Sound.play('chime', k);
    await wait(380);
    if (!alive()) return;
  }
  await wait(250);
  if (!alive()) return;
  finishFinale();
}
/** Jump to the final state (end of the sequence, a tap to skip, or leaving the screen). */
export function finishFinale(): void {
  ui.finaleDone = true;
  finale.token++;
  const root = $('.end');
  if (!root) return;
  root.classList.add('done');
  $$('[data-final]', root).forEach((el) => {
    el.textContent = el.dataset.final ?? null;
  });
}
