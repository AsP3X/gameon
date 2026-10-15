/* Ocho's cards as design/ocho.pen draws them ("Components · Cards"): a coloured face with the rank
   or the name of the special in the corner and its sign in the middle, no illustrations. Every word
   on a card is a constant of this file; nothing on it is a string someone typed. */
import type { ReactNode } from 'react';
import type { Card, Color, Kind, Sign } from './wire';

export const COLOR_NAME: Record<Color, string> = { red: 'Red', blue: 'Blue', green: 'Green', yellow: 'Yellow' };

const KIND_NAME: Record<Exclude<Kind, { number: number }>, string> = {
  skip: 'Skip',
  reverse: 'Reverse',
  draw2: 'Draw 2',
  wild: 'Ocho Wild',
  wildDraw4: 'Wild Draw 4',
  shield: 'Shield',
  xRay: 'X-Ray',
  deadRed: 'Dead Red',
  booBlue: 'Boo Blue',
};

/** The card's own name, without a colour: "7", "Skip", "Wild Draw 4". */
export const kindName = (kind: Kind): string => (typeof kind === 'string' ? KIND_NAME[kind] : String(kind.number));

/** A card names the next colour when it is played: it has no colour of its own. */
export const isWild = (card: Card): boolean =>
  card.kind === 'wild' || card.kind === 'wildDraw4' || card.kind === 'shield' || card.kind === 'xRay';

/** "Yellow 7", "Blue Draw 2", "Ocho Wild", "Dead Red". */
export function cardName(card: Card): string {
  const kind = kindName(card.kind);
  if (card.color == null || card.kind === 'deadRed' || card.kind === 'booBlue') return kind;
  return `${COLOR_NAME[card.color]} ${kind}`;
}

/** What the next card has to match, as the table writes it: "Yellow · 4", "Red · X-Ray". */
export function matchLine(color: Color, sign: Sign, top: Card): string {
  const what = sign === 'color' ? kindName(top.kind) : typeof sign === 'string' ? KIND_NAME[sign] : String(sign.number);
  return `${COLOR_NAME[color]} · ${what}`;
}

/** "yellow or 4": the colour and the sign a card may match, in the action bar's words. */
export function matchWords(color: Color, sign: Sign): string {
  const c = COLOR_NAME[color].toLowerCase();
  if (sign === 'color') return c;
  return `${c} or ${typeof sign === 'string' ? KIND_NAME[sign] : sign.number}`;
}

const CORNER: Record<Exclude<Kind, { number: number }>, string> = {
  skip: 'SKIP',
  reverse: 'REVERSE',
  draw2: '+2',
  wild: 'WILD',
  wildDraw4: '+4',
  shield: 'SHIELD',
  xRay: 'X-RAY',
  deadRed: 'DEAD RED',
  booBlue: 'BOO BLUE',
};

function Wheel({ children }: { children: ReactNode }) {
  return <span className="oc-wheel">{children}</span>;
}

/** What sits in the middle of a wild's wheel: the eight, +4, the shield or the eye. */
export function WheelSign({ kind }: { kind: Kind }) {
  switch (kind) {
    case 'wildDraw4':
      return <b>+4</b>;
    case 'shield':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
        </svg>
      );
    case 'xRay':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    default:
      return <b>8</b>;
  }
}

/** The corner of a face: the rank, or the special's name. */
export const cornerOf = (kind: Kind): string => (typeof kind === 'string' ? CORNER[kind] : String(kind.number));

function Middle({ kind }: { kind: Kind }) {
  if (typeof kind !== 'string') return <b className="oc-face-big">{kind.number}</b>;
  switch (kind) {
    case 'skip':
      return (
        <svg className="oc-face-sign" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M5.6 5.6l12.8 12.8" />
        </svg>
      );
    case 'reverse':
      return (
        <svg className="oc-face-sign" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 9h13l-4-4M20 15H7l4 4" />
        </svg>
      );
    case 'draw2':
      return <b className="oc-face-mid">+2</b>;
    case 'wild':
    case 'wildDraw4':
    case 'shield':
    case 'xRay':
      return (
        <Wheel>
          <WheelSign kind={kind} />
        </Wheel>
      );
    case 'deadRed':
      return <b className="oc-face-word">DEAD RED</b>;
    case 'booBlue':
      return <b className="oc-face-word">BOO BLUE</b>;
  }
}

/** The colour class of a face: a wild is black, Dead Red red and Boo Blue blue. */
const tone = (card: Card): string => card.color ?? 'black';

/** One card face up. The text next to it, or its button's label, says which card it is. */
export function CardFace({ card, size = 'md' }: { card: Card; size?: 'sm' | 'md' | 'lg' }) {
  const corner = cornerOf(card.kind);
  return (
    <span
      className={`oc-card ${size} ${tone(card)}${typeof card.kind === 'string' ? '' : ' oc-num'}`}
      aria-hidden="true"
    >
      <small className="oc-corner">{corner}</small>
      <span className="oc-mid">
        <Middle kind={card.kind} />
      </span>
    </span>
  );
}

/** The back of a card: the gold eight and OCHO on black. */
export function CardBack({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`oc-card back ${size}`} aria-hidden="true">
      <span className="oc-back-eight">8</span>
      <span className="oc-back-word">OCHO</span>
    </span>
  );
}

/** The short names a mini card has room for, as the guide's specials write them. */
const MINI: Record<Exclude<Kind, { number: number }>, string> = {
  skip: 'SKIP',
  reverse: 'REV',
  draw2: '+2',
  wild: 'WILD',
  wildDraw4: '+4',
  shield: 'SHLD',
  xRay: 'XRAY',
  deadRed: 'DEAD',
  booBlue: 'BOO',
};

/** A face as small as a seat's count: the cards X-Ray showed, and a partner's hand. */
export function MiniCard({ card }: { card: Card }) {
  const label = typeof card.kind === 'string' ? MINI[card.kind] : String(card.kind.number);
  return (
    <span className={`oc-mini ${tone(card)}`} title={cardName(card)}>
      {label}
    </span>
  );
}
