/* Small pieces Skull King's pages share: an icon of the renderer's own set, the player at the
   right of a page's bar, and the card that opens on the ways it holds. Games (src/gameon) draws
   the same two cards, so the choice reads the same wherever it is offered. */
import type { ReactNode } from 'react';
import { IconKey } from '../gameon/art';
import type { KeyTone } from '../gameon/art';
import { Link } from '../gameon/Frame';
import { Icon } from '../gameon/icons';
import type { IconName } from '../gameon/icons';
import { initialOf } from '../online/parts';
import type { Me } from '../protocol/generated';
import { AT } from '../router/addresses';
import { Sound } from '../sound/sound';
import { ICON } from '../tableview/art';
import { cssColor } from '../tableview/dom';

/** An icon of the renderer's own set: markup from a constant of src/tableview/art.ts. */
export function LegacyIcon({ icon }: { icon: keyof typeof ICON }) {
  return <span className="sk-ic" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON[icon] }} />;
}

/** The player, at the right of the bar: it leads to their profile. */
export function Player({ me }: { me: Me }) {
  return (
    <Link to={AT.profile} className="go-chip" label={`${me.user.name}, your profile`}>
      <span className="avatar sm" style={{ background: cssColor(me.user.color) }} aria-hidden="true">
        {initialOf(me.user.name)}
      </span>
      <span className="go-chip-text wide-only">
        <b>{me.user.name}</b>
        <small>{me.rating?.tier ?? me.username ?? 'Guest'}</small>
      </span>
    </Link>
  );
}

export interface ChoiceProps {
  /** The id of the list the card opens. */
  id: string;
  name: string;
  icon: IconName;
  tone: KeyTone;
  line: string;
  open: boolean;
  onToggle: () => void;
  /** The way needs a connection there is none of: the card is there and cannot be opened. */
  dim?: boolean;
  /** The ways the card holds. */
  children?: ReactNode;
}

/** One of the two ways to play, on its card. The card opens in place, and what it holds is under it. */
export function Choice({ id, name, icon, tone, line, open, onToggle, dim, children }: ChoiceProps) {
  const inside = (
    <>
      <IconKey icon={icon} tone={tone} />
      <span className="sk-way-text">
        <b>{name}</b>
        <span>{line}</span>
      </span>
      <span className="sk-way-go">
        <Icon name="chevronDown" />
      </span>
    </>
  );
  if (dim)
    return (
      <li className="sk-choice">
        <div className="sk-way dim" aria-disabled="true">
          {inside}
        </div>
      </li>
    );
  return (
    <li className="sk-choice">
      <button
        type="button"
        className="sk-way"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          Sound.play('tap');
          onToggle();
        }}
      >
        {inside}
      </button>
      <ul id={id} className="sk-opts" aria-label={name} hidden={!open}>
        {children}
      </ul>
    </li>
  );
}

export interface OptionProps {
  name: string;
  icon: IconName;
  tone: KeyTone;
  line: ReactNode;
  /** Where the row leads. Without it the row is there and cannot be followed. */
  to?: string;
  onFollow?: () => void;
  pill?: ReactNode;
  children?: ReactNode;
}

/** One way a card holds, on its row. */
export function Option({ name, icon, tone, line, to, onFollow, pill, children }: OptionProps) {
  const inside = (
    <>
      <IconKey icon={icon} tone={tone} />
      <span className="sk-way-text">
        <b>{name}</b>
        <span>{line}</span>
        {children}
      </span>
      {pill}
      <span className="sk-way-go">
        <Icon name="chevronRight" />
      </span>
    </>
  );
  if (to == null)
    return (
      <li>
        <div className="sk-opt" aria-disabled="true">
          {inside}
        </div>
      </li>
    );
  return (
    <li onClickCapture={() => Sound.play('tap')}>
      <Link to={to} className="sk-opt" onFollow={onFollow}>
        {inside}
      </Link>
    </li>
  );
}
