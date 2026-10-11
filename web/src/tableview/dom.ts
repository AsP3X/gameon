/* DOM utilities of the table renderer.
   Ported from the legacy build (legacy/Skull King Tavern.html, section 1) without changing behavior.
   The renderer builds HTML strings, so every string a player typed goes through `esc()` first. */

export const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document): T | null =>
  r.querySelector<T>(s);
export const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document): T[] =>
  Array.from(r.querySelectorAll<T>(s));

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Makes a string safe to put into HTML text or a quoted attribute. */
export const esc = (s: string | number): string => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);
export const sgn = (n: number): string => (n > 0 ? '+' + n : String(n));
/** A number from the server as a whole one, with a real minus sign: a rating is shown, never worked out. */
export const whole = (n: number): string => String(Math.round(n)).replace('-', '−');
export const toneOf = (n: number): 'pos' | 'neg' | 'zero' => (n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero');
export const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
export const reduced = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;
/**
 * A colour that is safe to put into a `style` attribute: a six-digit hex value, or the fallback.
 * Seat colours come from storage today and from other players later, so they are never trusted as CSS.
 */
export const cssColor = (value: unknown): string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : 'var(--blue)';
export const initial = (n: string | number): string => esc((String(n).trim()[0] || '?').toUpperCase());

/** The data-* attributes of the element that was clicked: what an action is told. */
export type ActionData = Readonly<Record<string, string | undefined>>;
/** What a `data-act` name runs. `el` is the element that carries it. */
export type ActionFn = (d: ActionData, el: HTMLElement) => void;
