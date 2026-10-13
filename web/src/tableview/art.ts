/* Art: icons, the card faces, the SVG sprite they share, avatars and the mascot. All of it is markup in strings.
   Ported from the legacy build (legacy/Skull King Tavern.html, section 8) without changing behavior. */
import type { Ability, Card, PlayedAs, Suit } from '../protocol/generated';
import { cssColor, initial } from './dom';

export const ICON = {
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  table:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 10h18M3 15h18M9 4v16"/></svg>',
  sound:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 8.5a5 5 0 010 7"/></svg>',
  mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
  target:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v6"/><circle cx="12" cy="7.6" r="1.5" fill="currentColor" stroke="none"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  pencil:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/></svg>',
  crown: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg>',
  chest:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M3 10a5 5 0 015-5h8a5 5 0 015 5v9H3z"/><path d="M3 11h18M10 11v3h4v-3"/></svg>',
  wave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M2 10c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2 5-1M2 16c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2 5-1"/></svg>',
  skull:
    '<svg viewBox="0 0 24 24"><path fill="currentColor" fill-rule="evenodd" d="M12 2a8 8 0 00-8 8c0 2.6 1.2 4.7 3 6v3a1 1 0 001 1h8a1 1 0 001-1v-3c1.8-1.3 3-3.4 3-6a8 8 0 00-8-8zM6.9 10.5a2.1 2.1 0 104.2 0 2.1 2.1 0 10-4.2 0zm6 0a2.1 2.1 0 104.2 0 2.1 2.1 0 10-4.2 0zM12 13.6l-1.4 2.6h2.8z"/></svg>',
  hook: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path fill="currentColor" stroke-width="1.6" d="M9.5 3h7l-1 4.5h-5z"/><path d="M13 8v6a4.5 4.5 0 01-9 0v-2.5"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 21V4h12l-3.5 4.5L18 13H6"/></svg>',
  ghost:
    '<svg viewBox="0 0 24 24"><path fill="currentColor" fill-rule="evenodd" d="M5 21V10a7 7 0 0114 0v11l-2.33-2-2.33 2L12 19l-2.34 2-2.33-2zM7.7 10.5a1.8 1.8 0 103.6 0 1.8 1.8 0 10-3.6 0zm5 0a1.8 1.8 0 103.6 0 1.8 1.8 0 10-3.6 0z"/></svg>',
  stack:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="7.5" width="11" height="13.5" rx="2"/><path d="M9 4.5a2 2 0 012-2h7.5a2 2 0 012 2v10a2 2 0 01-2 2H18"/></svg>',
  anchor:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.2"/><path d="M12 7.2V21M8 11.5h8M4 14a8 8 0 0016 0"/></svg>',
  flame:
    '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2c1 4 6 6.5 6 12a6 6 0 01-12 0c0-3 1.5-5 3-6 0 2 1 3.5 2.5 4C11 9 10.5 5 12 2z"/><path fill="#ffc800" d="M12 13c.6 2 3 2.6 3 5a3 3 0 01-6 0c0-1.6 1-2.6 1.6-3 .2 1 .8 1.6 1.4 1.8-.4-1.4-.6-2.6 0-3.8z"/></svg>',
};
/* Card art: original flat illustrations, one SVG per card (viewBox 100x140).
   Static artwork is defined once in SPRITE as <symbol>s; cards reference it with <use>.
   Pirates are drawn inline because each one has its own look. */
type SpecialKind = Exclude<Card['kind'], 'num'>;
/** A card to draw: one from the deck, or a loose one for the home screen, the rules and the scoresheet. */
export type FaceCard =
  | { kind: 'num'; suit: Suit; rank: number }
  | { kind: 'pirate'; ability?: Ability }
  | { kind: Exclude<SpecialKind, 'pirate'> };
interface Face {
  bg: string;
  bg2: string;
  ink: string;
  name?: string;
  title?: string;
  deep?: string;
}
const FACE: Record<Suit | SpecialKind, Face> = {
  green: { bg: '#2fa84f', bg2: '#23893f', ink: '#ffffff', name: 'Parrot' },
  yellow: { bg: '#f5bd1f', bg2: '#e09f00', ink: '#3b2c00', name: 'Chest' },
  purple: { bg: '#8b5cf6', bg2: '#6d3fe0', ink: '#ffffff', name: 'Map' },
  black: { bg: '#2a2f37', bg2: '#16191e', ink: '#ffffff', name: 'Jolly Roger' },
  escape: { bg: '#bfe3f7', bg2: '#8ccbec', ink: '#1d4b66', deep: '#1d4b66', title: 'Escape' },
  pirate: { bg: '#e5484d', bg2: '#b8262c', ink: '#ffffff', title: 'Pirate' },
  tigress: { bg: '#f08a3c', bg2: '#cf6a1f', ink: '#ffffff', title: 'Tigress' },
  sk: { bg: '#1b1b22', bg2: '#09090c', ink: '#ffc800', title: 'Skull King' },
  mermaid: { bg: '#11a99b', bg2: '#0a7f75', ink: '#ffffff', title: 'Mermaid' },
  loot: { bg: '#7a4a1d', bg2: '#552f0e', ink: '#ffc800', title: 'Loot' },
  kraken: { bg: '#2a2d5c', bg2: '#161838', ink: '#ffffff', title: 'Kraken' },
  whale: { bg: '#1b6fa8', bg2: '#0f4f7d', ink: '#ffffff', title: 'White Whale' },
};
/* Five pirates, five looks. With abilities on, the ribbon names the power. */
interface Look {
  skin: string;
  band: string;
  beard: string;
  coat: string;
  title: string;
}
const PIRATES: Record<Ability, Look> = {
  helm: { skin: '#f6c28b', band: '#1cb0f6', beard: '#6b3a1e', coat: '#1f3a5f', title: 'Helmsman' },
  smuggler: { skin: '#c98a5a', band: '#58cc02', beard: '#2b1a10', coat: '#3d2b1f', title: 'Smuggler' },
  gambler: { skin: '#f1d0b0', band: '#ce82ff', beard: '#b5651d', coat: '#4a1d5c', title: 'Gambler' },
  seer: { skin: '#8d5a3b', band: '#ffc800', beard: '#1a1a1a', coat: '#173b3b', title: 'Seer' },
  giant: { skin: '#e8a87c', band: '#ff9600', beard: '#7a2e12', coat: '#5c1d1d', title: 'Giant' },
};

/* Small corner glyphs (24x24), drawn in the card's ink colour. */
const CARD_GLYPH: Record<Suit | SpecialKind, string> = {
  green:
    '<path d="M15 3c-4.4 0-8 3.6-8 8v1.5L2.5 17l5-.8V21l4-4c5.2-.3 9-3.9 9-8.5C20.5 5.4 18 3 15 3z"/><circle cx="15" cy="8" r="1.9" fill="var(--hole,#2fa84f)"/>',
  yellow:
    '<path d="M3 10a5 5 0 015-5h8a5 5 0 015 5v10H3z"/><rect x="3" y="10.5" width="18" height="2.2" fill="var(--hole,#f5bd1f)"/>',
  purple:
    '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M13 9l3.5 3.5m0-3.5L13 12.5" stroke="var(--hole,#8b5cf6)" stroke-width="2" stroke-linecap="round"/>',
  black:
    '<rect x="4" y="3" width="2.4" height="18" rx="1"/><path d="M6.5 4h13l-3 4.5 3 4.5h-13z"/><circle cx="12" cy="8.4" r="2.3" fill="var(--hole,#2a2f37)"/>',
  pirate:
    '<g fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M5 4l14 14M19 4L5 18"/><path d="M3 15.5l5.5 5.5M21 15.5L15.5 21"/></g>',
  sk: '<path d="M3 8l4.5 4L12 4.5l4.5 7.5L21 8l-2 11H5z"/>',
  mermaid:
    '<path d="M12 2.5c-2.2 4.2-2.2 8.3 0 11.5l-6.5 6.5c3.2 0 5.3-1 6.5-2.2 1.2 1.2 3.3 2.2 6.5 2.2L12 14c2.2-3.2 2.2-7.3 0-11.5z"/>',
  tigress:
    '<g fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M6 4c2 6 2 11 0 16M12 3c2 6 2 12 0 18M18 4c2 6 2 11 0 16"/></g>',
  escape: '<rect x="5" y="3" width="2.4" height="18" rx="1"/><path d="M7.5 4c4-2 6 2 12 0v9c-6 2-8-2-12 0z"/>',
  loot: '<circle cx="9" cy="14" r="6"/><circle cx="15" cy="9" r="6" opacity=".8"/>',
  kraken:
    '<g fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M4 20c0-6 4-6 4-11a4 4 0 018 0c0 5 4 5 4 11"/><path d="M10 20c0-3 1-4 2-6 1 2 2 3 2 6"/></g>',
  whale: '<path d="M12 21v-6c-3.5 0-7.5-2.5-8.5-9 3.2 1 6.6 1.4 8.5 4.8 1.9-3.4 5.3-3.8 8.5-4.8-1 6.5-5 9-8.5 9z"/>',
};
/* Ability badges (24x24) for the top-right of pirate cards. */
const BADGE: Record<Ability, string> = {
  helm: '<circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="12" r="2" fill="currentColor"/><g stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5L19 19M19 5l-3.5 3.5M8.5 15.5L5 19"/></g>',
  smuggler:
    '<rect x="4" y="6" width="16" height="13" rx="2" fill="currentColor"/><path d="M4 10h16M9 6v13M15 6v13" stroke="var(--hole,#000)" stroke-width="1.6" opacity=".5"/>',
  gambler:
    '<rect x="4" y="4" width="16" height="16" rx="4" fill="currentColor"/><g fill="var(--hole,#000)"><circle cx="8.5" cy="8.5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="15.5" cy="15.5" r="1.8"/></g>',
  seer: '<path d="M2 12c3-5 6.5-7 10-7s7 2 10 7c-3 5-6.5 7-10 7s-7-2-10-7z" fill="currentColor"/><circle cx="12" cy="12" r="3.6" fill="var(--hole,#000)"/><circle cx="13.2" cy="10.8" r="1.1" fill="currentColor"/>',
  giant: '<path d="M12 3l5 6h-3.2v6H17l-5 6-5-6h3.2V9H7z" fill="currentColor"/>',
};

/** Inline a 24x24 glyph in solid colours (no CSS variables, so it renders the same everywhere). */
const paint = (src: string, fg: string, hole: string): string =>
  src.replace(/currentColor/g, fg).replace(/var\(--hole,[^)]*\)/g, hole);
const SVG_FONT = 'font-family="Nunito, ui-rounded, system-ui, sans-serif" font-weight="900"';

/** The static artwork, once: inserted at the top of <body> when the table mounts. */
export const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
<linearGradient id="sk-sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>
<radialGradient id="sk-glow" cx=".5" cy=".42" r=".55"><stop offset="0" stop-color="#fff" stop-opacity=".32"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<radialGradient id="sk-gold" cx=".5" cy=".4" r=".6"><stop offset="0" stop-color="#ffd84d" stop-opacity=".45"/><stop offset="1" stop-color="#ffd84d" stop-opacity="0"/></radialGradient>
<pattern id="sk-dots" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="#fff" opacity=".13"/><circle cx="7" cy="7" r="1.1" fill="#fff" opacity=".13"/></pattern>
<pattern id="sk-waves" width="20" height="10" patternUnits="userSpaceOnUse"><path d="M0 7c5-4 5-4 10 0s5 4 10 0" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="1.6"/></pattern>
<pattern id="sk-rays" width="100" height="140" patternUnits="userSpaceOnUse"><g fill="#ffc800" opacity=".09">${Array.from({ length: 12 }, (_, k) => `<path d="M50 60L${50 + 90 * Math.cos((k * Math.PI) / 6)} ${60 + 90 * Math.sin((k * Math.PI) / 6)}L${50 + 90 * Math.cos((k * Math.PI) / 6 + 0.18)} ${60 + 90 * Math.sin((k * Math.PI) / 6 + 0.18)}z"/>`).join('')}</g></pattern>

<symbol id="ill-green" viewBox="0 0 100 100">
  <path d="M18 98c2-20 15-31 33-31 17 0 30 11 31 31z" fill="#ff4b4b"/>
  <path d="M32 98c3-12 10-18 19-18 8 0 15 6 17 18z" fill="#ff7b7b"/>
  <path d="M41 21c-4-9 1-17 9-16-1 6 1 9 5 11-6 0-10 2-14 5z" fill="#a5ed6e"/>
  <path d="M50 17c1-9 9-14 16-9-3 4-3 7-1 11-5-2-10-3-15-2z" fill="#89e219"/>
  <path d="M27 60c0-24 14-42 34-42 17 0 28 13 28 30 0 23-17 38-38 40-15 1-24-11-24-28z" fill="#58cc02"/>
  <path d="M27 60c0-14 5-26 14-34-5 10-7 22-5 36 2 13 9 22 19 26-4 1-8 1-12 0-10-3-16-12-16-28z" fill="#3c9a00"/>
  <ellipse cx="66" cy="42" rx="15" ry="14" fill="#fff"/>
  <circle cx="68" cy="42" r="7.5" fill="#1f1f1f"/><circle cx="70.5" cy="39.5" r="2.6" fill="#fff"/>
  <path d="M74 51c12-3 21 6 19 19-1 7-6 11-11 12 2-7 0-12-5-14-5 4-12 4-15-1 3-7 7-13 12-16z" fill="#ffc800"/>
  <path d="M77 66c4 2 6 6 5 11 3-2 4-6 4-10z" fill="#e59400"/>
  <circle cx="53" cy="57" r="5.5" fill="#ff86d0" opacity=".6"/>
</symbol>

<symbol id="ill-yellow" viewBox="0 0 100 100">
  <circle cx="30" cy="34" r="8" fill="#ffe27a"/><circle cx="44" cy="28" r="8" fill="#ffd23f"/><circle cx="58" cy="30" r="8" fill="#ffe27a"/><circle cx="70" cy="35" r="7" fill="#ffd23f"/>
  <path d="M38 22l4-6 4 6-4 4z" fill="#1cb0f6"/><path d="M62 26l3-5 3 5-3 3z" fill="#ff4b4b"/>
  <path d="M14 48c0-15 15-23 36-23s36 8 36 23z" fill="#b8692c"/>
  <path d="M14 48c0-15 15-23 36-23v23z" fill="#c97a36"/>
  <rect x="25" y="27" width="7" height="21" fill="#ffc800"/><rect x="68" y="27" width="7" height="21" fill="#ffc800"/>
  <rect x="12" y="46" width="76" height="40" rx="4" fill="#9a5423"/>
  <path d="M12 60h76M12 73h76" stroke="#7d401a" stroke-width="2"/>
  <rect x="12" y="46" width="76" height="6" fill="#ffc800"/>
  <rect x="25" y="46" width="7" height="40" fill="#ffc800"/><rect x="68" y="46" width="7" height="40" fill="#ffc800"/>
  <rect x="42" y="50" width="16" height="18" rx="3" fill="#ffe27a"/><path d="M50 56a2.6 2.6 0 00-1.4 4.8l-1 4h4.8l-1-4A2.6 2.6 0 0050 56z" fill="#5a3410"/>
  <ellipse cx="22" cy="90" rx="9" ry="4" fill="#ffd23f"/><ellipse cx="22" cy="87" rx="9" ry="4" fill="#ffe27a"/>
  <ellipse cx="80" cy="91" rx="8" ry="3.6" fill="#ffd23f"/>
</symbol>

<symbol id="ill-purple" viewBox="0 0 100 100">
  <path d="M18 20h64v62H18z" fill="#fff3d6"/>
  <path d="M18 20c4 3 8-3 12 0s8-3 12 0 8-3 12 0 8-3 12 0 8-3 16 0v4H18z" fill="#f2deb0"/>
  <rect x="10" y="16" width="12" height="70" rx="6" fill="#e8cc8f"/><rect x="13" y="16" width="4" height="70" rx="2" fill="#f6e2b3"/>
  <rect x="78" y="16" width="12" height="70" rx="6" fill="#e8cc8f"/><rect x="81" y="16" width="4" height="70" rx="2" fill="#f6e2b3"/>
  <path d="M26 72c0-8 6-12 12-12s10 4 12 8c-6 6-18 8-24 4z" fill="#58cc02"/><path d="M34 62c0-6 1-10 2-12" stroke="#7a4a1d" stroke-width="2"/><path d="M36 50c-4-1-6 1-7 3m7-3c3-2 6-1 7 1" stroke="#3c9a00" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  <path d="M42 62c6-8 14-14 20-22" fill="none" stroke="#b07a3c" stroke-width="2.4" stroke-dasharray="3 4" stroke-linecap="round"/>
  <path d="M60 32l10 10m0-10L60 42" stroke="#ff4b4b" stroke-width="4.5" stroke-linecap="round"/>
  <g transform="translate(66 66)"><path d="M0-10l2.5 7.5L10 0l-7.5 2.5L0 10l-2.5-7.5L-10 0l7.5-2.5z" fill="#8b5cf6"/><circle r="2" fill="#fff3d6"/></g>
</symbol>

<symbol id="ill-black" viewBox="0 0 100 100">
  <rect x="17" y="10" width="5" height="86" rx="2.5" fill="#c9d1d9"/><circle cx="19.5" cy="9" r="4.5" fill="#ffc800"/>
  <path d="M22 14c14-5 26 5 40 0s20-4 26 0v48c-6-4-12-5-26 0s-26-5-40 0z" fill="#0b0d10"/>
  <path d="M22 14c14-5 26 5 40 0s20-4 26 0v4c-6-4-12-5-26 0s-26-5-40 0z" fill="#3a404a"/>
  <g transform="translate(55 38)">
    <path d="M-17-13l34 26M17-13l-34 26" stroke="#fffaf0" stroke-width="5.5" stroke-linecap="round"/>
    <circle cx="-17" cy="-13" r="3.5" fill="#fffaf0"/><circle cx="17" cy="-13" r="3.5" fill="#fffaf0"/><circle cx="-17" cy="13" r="3.5" fill="#fffaf0"/><circle cx="17" cy="13" r="3.5" fill="#fffaf0"/>
    <path d="M-11-2a11 11 0 1122 0c0 4-2 6-4 7v4h-14v-4c-2-1-4-3-4-7z" fill="#fffaf0"/>
    <circle cx="-4.5" cy="-2" r="3.3" fill="#0b0d10"/><circle cx="4.5" cy="-2" r="3.3" fill="#0b0d10"/><path d="M0 2l-1.6 3h3.2z" fill="#0b0d10"/>
    <path d="M-3 9v-3M0 9v-3M3 9v-3" stroke="#0b0d10" stroke-width="1.3"/>
  </g>
</symbol>

<symbol id="ill-sk" viewBox="0 0 100 100">
  <path d="M16 98c4-26 16-38 34-38s30 12 34 38z" fill="#b3122e"/>
  <path d="M30 98c3-16 10-24 20-24s17 8 20 24z" fill="#8a0c22"/>
  <path d="M36 70h28l-4 8H40z" fill="#ffc800"/><circle cx="50" cy="76" r="3.5" fill="#ff4b4b"/>
  <path d="M28 46a22 22 0 1144 0c0 8-3 12-7 14v7a3 3 0 01-3 3H38a3 3 0 01-3-3v-7c-4-2-7-6-7-14z" fill="#fffaf0"/>
  <path d="M28 46a22 22 0 0122-22c-10 6-14 16-13 28 1 7 3 12 6 15l-5 3c-1 0-3-1-3-3v-7c-4-2-7-6-7-14z" fill="#e8dfc9"/>
  <ellipse cx="41" cy="47" rx="6" ry="6.5" fill="#1b1b22"/><ellipse cx="59" cy="47" rx="6" ry="6.5" fill="#1b1b22"/>
  <circle cx="42" cy="48" r="2" fill="#ff4b4b"/><circle cx="60" cy="48" r="2" fill="#ff4b4b"/>
  <path d="M50 54l-3 5h6z" fill="#1b1b22"/>
  <path d="M42 66v-5M47 67v-5M53 67v-5M58 66v-5" stroke="#1b1b22" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M26 30l6-18 9 11 9-15 9 15 9-11 6 18z" fill="#ffc800"/>
  <path d="M26 30h48v6H26z" fill="#e5a400"/>
  <circle cx="50" cy="20" r="3.2" fill="#ff4b4b"/><circle cx="35" cy="24" r="2.4" fill="#1cb0f6"/><circle cx="65" cy="24" r="2.4" fill="#58cc02"/>
  <circle cx="32" cy="12" r="2.2" fill="#ffe27a"/><circle cx="50" cy="8" r="2.2" fill="#ffe27a"/><circle cx="68" cy="12" r="2.2" fill="#ffe27a"/>
</symbol>

<symbol id="ill-mermaid" viewBox="0 0 100 100">
  <circle cx="30" cy="20" r="4" fill="#fff" opacity=".5"/><circle cx="22" cy="34" r="2.6" fill="#fff" opacity=".5"/><circle cx="76" cy="28" r="3" fill="#fff" opacity=".5"/>
  <path d="M52 84c-14-8-18-26-10-44 4-9 10-16 12-22 4 8 6 16 4 26-2 12-4 22 4 34z" fill="#34d1bf"/>
  <path d="M52 84c-14-8-18-26-10-44 4-9 10-16 12-22-6 14-10 30-6 46 2 8 6 14 10 18z" fill="#1fb3a2"/>
  <g fill="none" stroke="#9bf3e8" stroke-width="1.6" stroke-linecap="round" opacity=".9">
    <path d="M47 46q3 3 6 0M45 54q3 3 6 0M51 54q3 3 6 0M47 62q3 3 6 0M53 62q3 3 6 0M49 70q3 3 6 0"/></g>
  <path d="M54 20c-8-6-18-8-26-4 8 2 14 8 18 14 2-4 5-7 8-10z" fill="#7ef0de"/>
  <path d="M54 20c6-8 16-12 26-10-6 4-10 10-12 18-4-4-9-6-14-8z" fill="#5fe3d1"/>
  <path d="M0 80c10-6 20-6 30 0s20 6 30 0 20-6 30 0 10 0 10 0v20H0z" fill="#0a7f75"/>
  <path d="M0 86c10-6 20-6 30 0s20 6 30 0 20-6 30 0 10 0 10 0v14H0z" fill="#0b6e66"/>
  <path d="M6 81c8-4 14-4 22 0M64 81c8-4 14-4 22 0" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".7"/>
  <path d="M74 66c0-6 5-10 10-10s10 4 10 10z" fill="#ff86d0"/><path d="M78 66v-7M84 66v-9M90 66v-7" stroke="#e55aa8" stroke-width="1.6"/>
</symbol>

<symbol id="ill-tigress" viewBox="0 0 100 100">
  <circle cx="24" cy="26" r="13" fill="#ff9600"/><circle cx="24" cy="26" r="7" fill="#ffb3c7"/>
  <circle cx="76" cy="26" r="13" fill="#ff9600"/><circle cx="76" cy="26" r="7" fill="#ffb3c7"/>
  <path d="M14 52c0-22 16-34 36-34s36 12 36 34c0 22-16 38-36 38S14 74 14 52z" fill="#ff9600"/>
  <path d="M10 62l14-4-6 10zm80 0l-14-4 6 10z" fill="#fff"/>
  <path d="M30 70c0-10 9-16 20-16s20 6 20 16c0 10-9 16-20 16s-20-6-20-16z" fill="#fffaf0"/>
  <g fill="#3c2a1e">
    <path d="M50 20l-4 12h8zM40 22l-1 10 5-2zM60 22l1 10-5-2z"/>
    <path d="M14 46l12 3-12 4zM86 46l-12 3 12 4zM16 58l10 0-9 5zM84 58l-10 0 9 5z"/>
  </g>
  <path d="M32 46c3-5 11-5 14 0-4 4-10 4-14 0zM54 46c3-5 11-5 14 0-4 4-10 4-14 0z" fill="#b6f26b"/>
  <ellipse cx="39" cy="46" rx="1.6" ry="3.6" fill="#1b1b22"/><ellipse cx="61" cy="46" rx="1.6" ry="3.6" fill="#1b1b22"/>
  <path d="M45 62h10l-5 6z" fill="#ff6f91"/>
  <path d="M50 68v4m0 0c-3 4-7 4-9 1m9-1c3 4 7 4 9 1" stroke="#3c2a1e" stroke-width="2" fill="none" stroke-linecap="round"/>
</symbol>

<symbol id="ill-escape" viewBox="0 0 100 100">
  <circle cx="78" cy="20" r="10" fill="#ffd23f"/>
  <rect x="47" y="14" width="3.5" height="58" rx="1.5" fill="#7a4a1d"/>
  <path d="M51 16c10-5 18 4 30 0v26c-12 4-20-5-30 0z" fill="#fff"/>
  <path d="M51 16c10-5 18 4 30 0v5c-12 4-20-5-30 0z" fill="#e6eef3"/>
  <path d="M20 70h62l-8 16H30z" fill="#a8602a"/><path d="M20 70h62l-2 5H22z" fill="#c97a36"/>
  <path d="M0 84c10-6 20-6 30 0s20 6 30 0 20-6 30 0 10 0 10 0v16H0z" fill="#1cb0f6"/>
  <path d="M0 90c10-6 20-6 30 0s20 6 30 0 20-6 30 0 10 0 10 0v10H0z" fill="#1899d6"/>
  <path d="M8 85c8-4 14-4 22 0M68 85c8-4 14-4 22 0" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".8"/>
</symbol>

<symbol id="ill-loot" viewBox="0 0 100 100">
  <path d="M30 40c-6-8-2-14 4-12 4-6 12-6 16 0 4-6 12-6 16 0 6-2 10 4 4 12z" fill="#c98a5a"/>
  <path d="M26 44c-8 10-10 24-4 36 4 8 14 12 28 12s24-4 28-12c6-12 4-26-4-36z" fill="#d9a066"/>
  <path d="M26 44c-8 10-10 24-4 36 4 8 14 12 28 12-12-4-18-14-18-26 0-10 3-17 8-22z" fill="#c4874d"/>
  <rect x="28" y="38" width="44" height="7" rx="3.5" fill="#8a3b12"/>
  <text x="50" y="76" text-anchor="middle" ${SVG_FONT} font-size="24" fill="#8a3b12">$</text>
  <ellipse cx="18" cy="88" rx="10" ry="4.5" fill="#e5a400"/><ellipse cx="18" cy="84" rx="10" ry="4.5" fill="#ffc800"/><ellipse cx="18" cy="80" rx="10" ry="4.5" fill="#ffd84d"/>
  <ellipse cx="84" cy="90" rx="9" ry="4" fill="#e5a400"/><ellipse cx="84" cy="86" rx="9" ry="4" fill="#ffd84d"/>
  <path d="M74 74l5-7 5 7-5 5z" fill="#1cb0f6"/><path d="M12 68l4-5 4 5-4 4z" fill="#ff4b4b"/>
</symbol>

<symbol id="ill-kraken" viewBox="0 0 100 100">
  <path d="M10 92c-2-24 6-40 14-46 6-4 10 2 6 8-6 8-8 20-4 38z" fill="#c04ddb"/>
  <path d="M90 92c2-24-6-40-14-46-6-4-10 2-6 8 6 8 8 20 4 38z" fill="#c04ddb"/>
  <path d="M28 92c-4-30 6-52 16-58 8-4 12 4 6 10-8 10-10 26-6 48z" fill="#d46be8"/>
  <path d="M72 92c4-30-6-52-16-58-8-4-12 4-6 10 8 10 10 26 6 48z" fill="#d46be8"/>
  <g fill="#f6c2ff"><circle cx="17" cy="70" r="2.4"/><circle cx="15" cy="80" r="2.4"/><circle cx="83" cy="70" r="2.4"/><circle cx="85" cy="80" r="2.4"/>
    <circle cx="37" cy="56" r="2.6"/><circle cx="35" cy="68" r="2.6"/><circle cx="34" cy="80" r="2.6"/><circle cx="63" cy="56" r="2.6"/><circle cx="65" cy="68" r="2.6"/><circle cx="66" cy="80" r="2.6"/></g>
  <path d="M30 30c0-14 9-22 20-22s20 8 20 22c0 10-9 16-20 16s-20-6-20-16z" fill="#a83ec4"/>
  <ellipse cx="42" cy="28" rx="7" ry="8" fill="#fff"/><ellipse cx="58" cy="28" rx="7" ry="8" fill="#fff"/>
  <ellipse cx="43" cy="30" rx="3" ry="5" fill="#ffc800"/><ellipse cx="59" cy="30" rx="3" ry="5" fill="#ffc800"/>
  <ellipse cx="43" cy="30" rx="1.2" ry="4" fill="#1b1b22"/><ellipse cx="59" cy="30" rx="1.2" ry="4" fill="#1b1b22"/>
  <path d="M0 90c10-5 20-5 30 0s20 5 30 0 20-5 30 0 10 0 10 0v10H0z" fill="#161838"/>
</symbol>

<symbol id="ill-whale" viewBox="0 0 100 100">
  <path d="M60 10c-2 6 0 10 4 12M60 10c2 5 6 8 10 8M60 10c-4 4-8 5-12 4" stroke="#bfe6ff" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M14 70c-2-24 14-44 40-46 18-1 30 10 30 24 0 14-10 24-26 26z" fill="#ffffff"/>
  <path d="M14 70c-2-24 14-44 40-46-16 8-24 22-22 40z" fill="#dbe7ef"/>
  <path d="M30 62c10 8 30 8 46-4-4 10-14 16-26 16-8 0-15-4-20-12z" fill="#c4d6e2"/>
  <circle cx="64" cy="42" r="3.4" fill="#1b1b22"/><circle cx="65.2" cy="41" r="1.1" fill="#fff"/>
  <path d="M68 52q6 2 10-2" stroke="#9fb4c3" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M14 70c-8 2-12-2-12-8 6 0 10 2 12 4 2-6 6-8 10-8-2 6-4 10-10 12z" fill="#ffffff"/>
  <path d="M0 78c10-6 20-6 30 0s20 6 30 0 20-6 30 0 10 0 10 0v22H0z" fill="#0f4f7d"/>
  <path d="M0 84c10-6 20-6 30 0s20 6 30 0 20-6 30 0 10 0 10 0v16H0z" fill="#0b3d62"/>
  <path d="M6 79c8-4 14-4 22 0M66 79c8-4 14-4 22 0" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".7"/>
</symbol>

<symbol id="ill-back" viewBox="0 0 100 140">
  <rect width="100" height="140" fill="#1c2b4a"/>
  <rect width="100" height="140" fill="url(#sk-waves)"/>
  <rect x="6" y="6" width="88" height="128" rx="7" fill="none" stroke="#ffc800" stroke-width="2" opacity=".8"/>
  <rect x="10" y="10" width="80" height="120" rx="5" fill="none" stroke="#ffc800" stroke-width="1" opacity=".45" stroke-dasharray="2 3"/>
  <g transform="translate(50 70)">
    <circle r="28" fill="#24375e" stroke="#ffc800" stroke-width="2"/>
    <path d="M0-34l5 29 29 5-29 5-5 29-5-29-29-5 29-5z" fill="#ffc800"/>
    <path d="M0-34l5 29-5 5zM34 0l-29 5-5-5zM0 34l-5-29 5-5zM-34 0l29-5 5 5z" fill="#e5a400"/>
    <circle r="7" fill="#1c2b4a"/><circle r="3" fill="#ffc800"/>
  </g>
</symbol>
</defs></svg>`;

function pirateArt(look: Look): string {
  const { skin, band, beard, coat } = look;
  return `<g>
    <path d="M14 40L80 100M86 40L20 100" stroke="#dfe6ea" stroke-width="5" stroke-linecap="round"/>
    <path d="M14 40l-4-4M86 40l4-4" stroke="#dfe6ea" stroke-width="5" stroke-linecap="round"/>
    <path d="M24 49l8-8M76 49l-8-8" stroke="#ffc800" stroke-width="5" stroke-linecap="round"/>
    <path d="M18 108c3-18 16-28 32-28s29 10 32 28z" fill="${coat}"/>
    <path d="M42 82l8 12 8-12" fill="#fffaf0"/><circle cx="44" cy="100" r="2" fill="#ffc800"/><circle cx="56" cy="100" r="2" fill="#ffc800"/>
    <circle cx="50" cy="58" r="20" fill="${skin}"/>
    <path d="M30 60c0 16 9 26 20 26s20-10 20-26c-4 6-10 8-20 8s-16-2-20-8z" fill="${beard}"/>
    <path d="M42 70q8 5 16 0" stroke="#fffaf0" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path d="M29 52c0-14 10-22 21-22s21 8 21 22c-6-4-13-6-21-6s-15 2-21 6z" fill="${band}"/>
    <path d="M70 46c6 0 10 3 12 8-4 0-7-1-9-3 1 4 0 7-3 9z" fill="${band}"/>
    <circle cx="35" cy="42" r="2" fill="#fff" opacity=".6"/><circle cx="44" cy="37" r="2" fill="#fff" opacity=".6"/><circle cx="56" cy="37" r="2" fill="#fff" opacity=".6"/>
    <path d="M32 50l36 10" stroke="#1b1b22" stroke-width="2"/>
    <ellipse cx="58" cy="57" rx="6" ry="5" fill="#1b1b22"/>
    <circle cx="42" cy="57" r="3.2" fill="#1b1b22"/><circle cx="43.2" cy="55.8" r="1.1" fill="#fff"/>
    <circle cx="31" cy="64" r="2.6" fill="none" stroke="#ffc800" stroke-width="2"/>
  </g>`;
}

export interface CardOptions {
  /** the Tigress's choice */
  as?: PlayedAs;
  /** name the pirate's power */
  abilities?: boolean;
}
/** One card as SVG markup. c: {kind, suit?, rank?, ability?}. opts: {abilities} */
function cardSVG(c: FaceCard, opts: CardOptions = {}): string {
  const isNum = c.kind === 'num',
    key = isNum ? c.suit : c.kind,
    f = FACE[key];
  const ink = f.ink;
  const bg = `<rect width="100" height="140" fill="${f.bg}"/>
    <path d="M0 96C30 84 70 108 100 92V140H0z" fill="${f.bg2}"/>
    <rect width="100" height="140" fill="url(#${key === 'sk' ? 'sk-rays' : key === 'whale' || key === 'mermaid' || key === 'kraken' || key === 'escape' ? 'sk-waves' : 'sk-dots'})"/>
    <rect width="100" height="140" fill="url(#sk-sheen)"/>
    <rect x="3.5" y="3.5" width="93" height="133" rx="8" fill="none" stroke="${key === 'sk' ? '#ffc800' : '#fff'}" stroke-opacity="${key === 'sk' ? 0.9 : 0.45}" stroke-width="1.6"/>`;
  if (isNum) {
    const r = c.rank,
      big = r >= 10 ? 24 : 28;
    const corner = `<text x="${r >= 10 ? 8 : 10}" y="29" ${SVG_FONT} font-size="${big}" fill="${ink}" letter-spacing="-1">${r}</text>
      <svg x="9" y="33" width="15" height="15" viewBox="0 0 24 24" fill="${ink}">${paint(CARD_GLYPH[c.suit], ink, f.bg)}</svg>`;
    const bonus =
      r === 14
        ? `<g transform="translate(78 22)"><path d="M0-14l4 8.5 9.5 1.2-7 6.5 1.8 9.3L0 7.2l-8.3 4.3 1.8-9.3-7-6.5 9.5-1.2z" fill="#ffc800" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>
      <text y="4" text-anchor="middle" ${SVG_FONT} font-size="8" fill="#5a3b00">+${c.suit === 'black' ? 20 : 10}</text></g>`
        : '';
    const trump =
      c.suit === 'black'
        ? `<g transform="translate(50 132)"><rect x="-20" y="-7" width="40" height="11" rx="5.5" fill="#ffc800"/><text y="1.8" text-anchor="middle" ${SVG_FONT} font-size="7" fill="#3b2c00" letter-spacing=".8">TRUMP</text></g>`
        : '';
    return `<svg viewBox="0 0 100 140" preserveAspectRatio="none" role="img" aria-hidden="true">${bg}
      <circle cx="50" cy="72" r="34" fill="url(#sk-glow)"/>
      <use href="#ill-${c.suit}" x="19" y="40" width="62" height="62"/>
      ${corner}<g transform="rotate(180 50 70)">${corner}</g>${bonus}${trump}</svg>`;
  }
  let art: string,
    title = f.title ?? '',
    badge = '';
  if (c.kind === 'pirate') {
    const look = (c.ability && PIRATES[c.ability]) || PIRATES.helm;
    art = `<svg x="2" y="8" width="96" height="104" viewBox="0 0 100 108">${pirateArt(look)}</svg>`;
    if (opts.abilities && c.ability) {
      title = look.title;
      badge = `<g transform="translate(75 7)"><circle cx="9" cy="9" r="10" fill="#fff"/><svg x="1" y="1" width="16" height="16" viewBox="0 0 24 24">${paint(BADGE[c.ability], f.bg2, '#fff')}</svg></g>`;
    }
  } else {
    art = `<use href="#ill-${c.kind}" x="4" y="14" width="92" height="92"/>`;
  }
  const corner = `<g transform="translate(6 6)"><circle cx="10" cy="10" r="10" fill="#fff" opacity="${key === 'escape' ? 1 : 0.95}"/>
    <svg x="2.5" y="2.5" width="15" height="15" viewBox="0 0 24 24" fill="${f.deep || f.bg2}">${paint(CARD_GLYPH[c.kind], f.deep || f.bg2, '#fff')}</svg></g>`;
  const deep = f.deep || f.bg2;
  const ribbonFill = key === 'sk' ? '#ffc800' : key === 'escape' ? deep : '#fff',
    ribbonInk = key === 'sk' ? '#1b1b22' : key === 'escape' ? '#fff' : deep;
  const size = title.length > 9 ? 8.6 : 11;
  const ribbon = `<path d="M6 112h88l-5 9 5 9H6l5-9z" fill="${ribbonFill}"/>
    <text x="50" y="${121 + size * 0.36}" text-anchor="middle" ${SVG_FONT} font-size="${size}" fill="${ribbonInk}" letter-spacing=".6">${title.toUpperCase()}</text>`;
  return `<svg viewBox="0 0 100 140" preserveAspectRatio="none" role="img" aria-hidden="true">${bg}
    ${key === 'sk' ? '<circle cx="50" cy="60" r="44" fill="url(#sk-gold)"/>' : '<circle cx="50" cy="60" r="42" fill="url(#sk-glow)"/>'}
    ${art}${corner}${badge}${ribbon}</svg>`;
}
function backSVG(): string {
  return `<svg viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true"><use href="#ill-back" width="100" height="140"/></svg>`;
}
/** opts: { as: tigress choice, abilities: name the pirate's power } */
export function cardHTML(c: FaceCard, opts: CardOptions = {}): string {
  return `<div class="card">${cardSVG(c, opts)}${opts.as ? `<span class="as">${opts.as === 'pirate' ? 'Pirate' : 'Escape'}</span>` : ''}</div>`;
}
export const cardBack = (): string => `<div class="card">${backSVG()}</div>`;
export function avatar(p: { name: string; color: string }, size?: string, anchor?: string): string {
  return `<span class="avatar ${size || ''}" ${anchor ? `data-anchor="${anchor}"` : ''} style="background:${cssColor(p.color)}">${initial(p.name)}</span>`;
}
export function mascot(mood: 'wink' | 'happy' | 'sad', extra?: string): string {
  const eyes =
    mood === 'sad'
      ? '<path d="M44 66q6-5 12 0" stroke="#2b2b2b" stroke-width="4" fill="none" stroke-linecap="round"/>'
      : mood === 'happy'
        ? '<path d="M43 68q7-9 14 0" stroke="#2b2b2b" stroke-width="5" fill="none" stroke-linecap="round"/>'
        : '<circle cx="50" cy="66" r="8" fill="#2b2b2b"/><circle cx="52.5" cy="63.5" r="2.6" fill="#fff"/>';
  const mouth =
    mood === 'sad'
      ? '<path d="M50 96q10-7 20 0" stroke="#2b2b2b" stroke-width="4" fill="none" stroke-linecap="round"/>'
      : '<path d="M48 92q12 10 24 0" stroke="#2b2b2b" stroke-width="4" fill="none" stroke-linecap="round"/>';
  return `<svg class="mascot ${extra || ''}" viewBox="0 0 120 120" aria-hidden="true">
  <ellipse cx="60" cy="114" rx="30" ry="4" fill="currentColor" opacity=".12"/>
  <path d="M28 78a32 32 0 1164 0c0 8-4 12-8 14v8a4 4 0 01-4 4H40a4 4 0 01-4-4v-8c-4-2-8-6-8-14z" fill="var(--bone)" stroke="var(--bone-line)" stroke-width="4"/>
  <path d="M50 104v-8M60 104v-8M70 104v-8" stroke="var(--bone-line)" stroke-width="3" stroke-linecap="round"/>
  <g class="eyes">${eyes}</g>
  <path d="M60 76l-4 7h8z" fill="#2b2b2b"/>${mouth}
  <path d="M30 56L88 48" stroke="#2b2b2b" stroke-width="4"/>
  <ellipse cx="72" cy="66" rx="11" ry="10" fill="#2b2b2b"/>
  <path d="M16 46c10-22 78-28 90-6-8 6-16 2-22-2-10 6-34 8-46 4-6 4-14 8-22 4z" fill="#2b2b2b"/>
  <path d="M22 44c16 2 58-2 78-8" stroke="#ffc800" stroke-width="4" fill="none" stroke-linecap="round"/>
  <circle cx="60" cy="30" r="6" fill="#fff"/><path d="M57 29h1M62 29h1" stroke="#2b2b2b" stroke-width="2"/></svg>`;
}
