/* What the frame's pages are drawn with: the GameOn logo, the keys (the coloured tiles an icon or
   the mascot sits on), and the cards of Skull King. The cards and the mascot are the renderer's own
   artwork (src/tableview/art.ts), which is HTML in strings. Every string put on the page here is
   built from constants of this file: nothing a player typed and nothing the server sent. */
import { CardBack, CardFace } from '../ocho/cards';
import type { Card } from '../ocho/wire';
import { cardHTML, mascot } from '../tableview/art';
import type { FaceCard } from '../tableview/art';
import { Icon } from './icons';
import type { IconName } from './icons';
import { WORDMARK_BOX, WORDMARK_GAME, WORDMARK_ON } from './wordmark';

/** The mark of design/brand/gameon/gameon-mark.svg: the G on its key, with the key's lower edge. */
export function Mark() {
  return (
    <svg className="go-mark" viewBox="0 0 512 512" aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="var(--green-d)" />
      <rect width="512" height="482" rx="112" fill="var(--green)" />
      <path
        d="M382.39 353.43A168 168 0 1 1 382.39 146.57A30 30 0 0 1 335.11 183.51A108 108 0 1 0 335.11 316.49A30 30 0 0 1 382.39 353.43ZM256 220H400a30 30 0 0 1 0 60H256a30 30 0 0 1 0 -60Z"
        fill="var(--green-d)"
      />
      <path
        d="M382.39 341.43A168 168 0 1 1 382.39 134.57A30 30 0 0 1 335.11 171.51A108 108 0 1 0 335.11 304.49A30 30 0 0 1 382.39 341.43ZM256 208H400a30 30 0 0 1 0 60H256a30 30 0 0 1 0 -60Z"
        fill="var(--white)"
      />
    </svg>
  );
}

/** The GameOn logo: the mark and the wordmark. The link around it carries the name. */
export function Logo() {
  return (
    <span className="go-logo">
      <Mark />
      <svg className="go-wordmark" viewBox={WORDMARK_BOX} aria-hidden="true">
        <path d={WORDMARK_GAME} fill="var(--fg)" />
        <path d={WORDMARK_ON} fill="var(--green)" />
      </svg>
    </span>
  );
}

export type KeyTone = 'blue' | 'gold' | 'green' | 'orange' | 'purple' | 'red' | 'kraken';

/** An icon on its key. */
export function IconKey({ icon, tone }: { icon: IconName; tone: KeyTone }) {
  return (
    <span className={`go-key ${tone}`} aria-hidden="true">
      <Icon name={icon} />
    </span>
  );
}

const MASCOT = mascot('wink', 'sm');

/** The mascot of Skull King, by itself. */
export function Mascot() {
  return <span className="go-mascot" aria-hidden="true" dangerouslySetInnerHTML={{ __html: MASCOT }} />;
}

/** Skull King's own key: the mascot on green. */
export function SkullKingKey() {
  return <span className="go-key sk green" aria-hidden="true" dangerouslySetInnerHTML={{ __html: MASCOT }} />;
}

const FAN: FaceCard[] = [
  { kind: 'sk' },
  { kind: 'mermaid' },
  { kind: 'num', suit: 'black', rank: 14 },
  { kind: 'pirate' },
  { kind: 'num', suit: 'yellow', rank: 14 },
];
const TRIO: FaceCard[] = [{ kind: 'pirate' }, { kind: 'sk' }, { kind: 'mermaid' }];
const html = (cards: FaceCard[]): string => cards.map((card) => `<div>${cardHTML(card)}</div>`).join('');
const FAN_HTML = html(FAN);
const TRIO_HTML = html(TRIO);

/** Five cards of Skull King, held as a hand. Decoration: the text next to it says what the game is. */
export function CardFan({ trio = false }: { trio?: boolean }) {
  return (
    <div
      className={trio ? 'go-fan trio' : 'go-fan'}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: trio ? TRIO_HTML : FAN_HTML }}
    />
  );
}

/** A few of Ocho's cards, fanned, with its back in front. Decoration: the text beside says what the game is. */
const OCHO_FAN: Card[] = [
  { id: 0, color: 'red', kind: { number: 3 } },
  { id: 1, color: 'blue', kind: { number: 7 } },
  { id: 2, color: 'green', kind: { number: 5 } },
  { id: 3, color: 'yellow', kind: { number: 8 } },
];

export function OchoFan() {
  return (
    <div className="oc-fan" aria-hidden="true">
      <CardBack />
      {OCHO_FAN.map((card) => (
        <CardFace key={card.id} card={card} />
      ))}
    </div>
  );
}

/** Ocho's key: its eight on the black tile. */
export function OchoKey() {
  return (
    <span className="go-key oc-key" aria-hidden="true">
      8
    </span>
  );
}
