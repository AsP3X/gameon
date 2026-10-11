/* Which of the three layouts the page is in. The stylesheet (styles/responsive.css) does the
   arranging with the same two widths; the renderer only needs to know the layout for the few
   things markup has to decide: where the round pills go, whether the rail is drawn, and whether
   the copy says "tap" or "click".

   The answer comes from the same media queries the stylesheet uses, so the two can never disagree
   (a scrollbar makes the document narrower than the viewport those queries measure). A document
   that has not been laid out has no width: that is the parity tests, where the renderer stays in
   the phone layout and its markup stays the legacy page's. */

/** From here the seats sit on the felt and sheets are dialogs. */
export const TABLET = 700;
/** From here the scoreboard and the last trick have a rail of their own. */
export const DESK = 1024;

export type Layout = 'phone' | 'tablet' | 'desk';

const atLeast = (px: number): boolean =>
  document.documentElement.clientWidth > 0 && matchMedia(`(min-width: ${px}px)`).matches;

export function layout(): Layout {
  return atLeast(DESK) ? 'desk' : atLeast(TABLET) ? 'tablet' : 'phone';
}

/** "Click" where there is a mouse and room for one, "Tap" everywhere else. */
export function tapWord(): 'Tap' | 'Click' {
  if (layout() === 'phone') return 'Tap';
  return matchMedia('(hover: hover) and (pointer: fine)').matches ? 'Click' : 'Tap';
}
