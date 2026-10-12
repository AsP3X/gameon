/* Small pieces Skull King's pages share: an icon of the renderer's own set, and the player at the
   right of a page's bar. */
import { Link } from '../gameon/Frame';
import { initialOf } from '../online/parts';
import type { Me } from '../protocol/generated';
import { AT } from '../router/addresses';
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
