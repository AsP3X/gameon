/* Skull King's home, as design/skt.pen draws it (plan item W2): the four ways to play, the way back
   into a game that is not over, this device's stats, and the scoresheet for a real table. It is a
   page of the frame (src/gameon) and takes the place of the legacy renderer's home screen. The
   renderer is still "at home" underneath and keeps what it alone can draw there: the greeting, the
   sound settings and the rules, which are its sheets (a control here opens one with `data-act`,
   the renderer's own way).

   Everything about the player is what the server said (`Me`): who they are, the game their seat is
   kept in, and whether ranked is closed for them. The page works no rating, tier or cooldown out.
   It starts no game: every way in is a link to the screen that does. */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { IconKey, Mark, Mascot, CardFan } from '../gameon/art';
import type { KeyTone } from '../gameon/art';
import { GoContext, Link } from '../gameon/Frame';
import type { Go, Who } from '../gameon/Frame';
import { Icon } from '../gameon/icons';
import type { IconName } from '../gameon/icons';
import { savedGame } from '../gameon/saved';
import type { SavedGame } from '../gameon/saved';
import { useWho } from '../gameon/who';
import { LegacyIcon, Player } from './parts';
import type { Online, OnlineState } from '../net/online';
import { useAhead } from '../online/ahead';
import { BackIcon } from '../online/icons';
import type { Me } from '../protocol/generated';
import { AT } from '../router/addresses';
import { Sound } from '../sound/sound';
import { prefs, session, stats } from '../tableview/state';

/** "3 bots", "1 bot". */
const bots = (n: number): string => `${n} bot${n === 1 ? '' : 's'}`;

/** The solo game the server keeps for this player, with the numbers it sent. */
interface ServerSolo {
  bots: number;
  round: number;
  rounds: number;
}
function serverSolo(me: Me | null): ServerSolo | null {
  const active = me?.active;
  if (active?.kind !== 'game' || active.table !== 'solo') return null;
  // An older reply names the table and not the rest: then it is a game like any other.
  if (active.bots == null || active.round == null || active.rounds == null) return null;
  return { bots: active.bots, round: active.round, rounds: active.rounds };
}

interface JumpProps {
  me: Me | null;
  saved: SavedGame | null;
  onRejoin: () => void;
}

/**
 * The way back into a game that is not over. A seat the server keeps comes first. A game saved on
 * this device alone is then a second line under it, not a replacement.
 */
function JumpBack({ me, saved, onRejoin }: JumpProps) {
  const solo = serverSolo(me),
    seat = me?.active?.kind === 'game';
  if (!seat && !saved) return null;
  const device = saved && (
    <>
      Round {saved.round} of {saved.rounds} · offline, on this device only
    </>
  );
  const deviceTitle =
    saved && (saved.humans === 1 ? `Solo against ${bots(saved.bots)}` : `One screen with ${saved.humans} pirates`);
  return (
    <section className="sk-jump" aria-labelledby="sk-jump-title">
      <div className="sk-jump-text">
        <small id="sk-jump-title">Jump back in</small>
        <b>{solo ? `Solo against ${bots(solo.bots)}` : seat ? 'Skull King · your table' : deviceTitle}</b>
        <span>
          {solo
            ? `Round ${solo.round} of ${solo.rounds} · saved to your account`
            : seat
              ? 'Game running · your seat is kept'
              : device}
        </span>
        {seat && saved && (
          <Link to={AT.table} className="sk-jump-also">
            {device}
          </Link>
        )}
      </div>
      {seat ? (
        <Link to={AT.table} className="btn go-btn full" onFollow={onRejoin}>
          {solo ? 'Continue' : 'Rejoin'}
        </Link>
      ) : (
        <Link to={AT.table} className="btn go-btn full">
          Continue
        </Link>
      )}
    </section>
  );
}

interface WayProps {
  name: string;
  icon: IconName;
  tone: KeyTone;
  line: ReactNode;
  /** Where the card leads. Without it the card is there and cannot be followed. */
  to?: string;
  onFollow?: () => void;
  /** The way is there and cannot be gone: nothing answers. */
  dim?: boolean;
  pill?: ReactNode;
  children?: ReactNode;
}

/** One way to play, on its card. */
function Way({ name, icon, tone, line, to, onFollow, dim, pill, children }: WayProps) {
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
        <div className={dim ? 'sk-way dim' : 'sk-way'} aria-disabled="true">
          {inside}
        </div>
      </li>
    );
  return (
    <li onClickCapture={() => Sound.play('tap')}>
      <Link to={to} className="sk-way" onFollow={onFollow}>
        {inside}
      </Link>
    </li>
  );
}

/** This device's own tally, as the renderer keeps it. Nothing before the first game. */
function Stats() {
  if (!stats.games) return null;
  const made = stats.bids ? Math.round((stats.made / stats.bids) * 100) : 0;
  return (
    <section className="sk-block sk-stats" aria-labelledby="sk-stats-title">
      <h2 className="label" id="sk-stats-title">
        Your stats
      </h2>
      <div className="stats">
        <div className="stat hot">
          <b>
            <LegacyIcon icon="flame" />
            {stats.streak}
          </b>
          <small>Day streak</small>
        </div>
        <div className="stat">
          <b>{stats.games}</b>
          <small>Games</small>
        </div>
        <div className="stat">
          <b>{stats.wins}</b>
          <small>Wins</small>
        </div>
        <div className="stat">
          <b>{made}%</b>
          <small>Bids made</small>
        </div>
      </div>
    </section>
  );
}

/** The scoresheet for a game played with real cards: a new one, or the one that is running. */
function RealTable() {
  const sheet = session.trk,
    live = sheet != null && !sheet.finished;
  return (
    <section className="sk-block sk-real-block" aria-labelledby="sk-real-title">
      <h2 className="label" id="sk-real-title">
        At a real table
      </h2>
      <span onClickCapture={() => Sound.play('tap')}>
        <Link to={AT.score} className="sk-real">
          <LegacyIcon icon="pencil" />
          <span className="sk-real-text">
            <b>{live ? 'Continue scoring' : 'Score a real game'}</b>
            <small>
              {live
                ? `Round ${sheet.cur + 1} of ${sheet.schedule.length} · ${sheet.seats.length} players`
                : 'Playing with physical cards? Track bids, tricks and bonuses.'}
            </small>
          </span>
          <span className="sk-way-go">
            <Icon name="chevronRight" />
          </span>
        </Link>
      </span>
    </section>
  );
}

export interface SkullKingHomeProps {
  online: Online;
  state: OnlineState;
  go: Go;
  /**
   * Back to the seat the server keeps: the page connects, and the `welcome` that follows puts the
   * table back.
   */
  onRejoin: () => void;
  /** One of the renderer's sheets is open over the page: what is behind it takes no input. */
  behind: boolean;
}

export function SkullKingHome({ online, state, go, onRejoin, behind }: SkullKingHomeProps) {
  // Asked with `GET /me`: looking at the home makes nobody. A browser without a session is a
  // visitor here, and gets its guest when it connects, as it always did.
  const who: Who = useWho(online, state.me, false);
  const [saved] = useState(savedGame);
  const me = who.is === 'player' ? who.me : null,
    down = who.is === 'unknown',
    season = state.config?.season ?? null,
    solo = serverSolo(me),
    closed = useAhead(online, me?.cooldownUntil ?? null);

  useEffect(() => {
    const before = document.title;
    document.title = 'Skull King · GameOn';
    return () => {
      document.title = before;
    };
  }, []);

  const seasonPill = season && <span className="pill gold narrow-only">{season.name}</span>;
  return (
    <GoContext value={go}>
      <div id="gameon" className="sk-home" inert={behind}>
        <header className="sk-bar">
          <Link to={AT.games} className="sk-back" label="Back to GameOn's games">
            <span className="sk-back-arrow">
              <BackIcon />
            </span>
            <Mark />
            <span>Games</span>
          </Link>
          <div className="sk-bar-right">
            <button type="button" className="icon-btn" data-act="soundSheet" aria-label="Sound settings">
              <LegacyIcon icon={prefs.muted ? 'mute' : 'sound'} />
            </button>
            {me && <Player me={me} />}
          </div>
        </header>
        <main className="sk-body">
          <div className="sk-side">
            <div className="sk-identity">
              <Mascot />
              <div>
                <h1 className="logo">
                  Skull <span>King</span>
                </h1>
                <p>The pirate trick-taking game</p>
              </div>
            </div>
            <JumpBack me={me} saved={saved} onRejoin={onRejoin} />
            <Stats />
            <RealTable />
            {/* The rules are one of the renderer's sheets: `data-act` is how it is asked for one. */}
            <button type="button" className="sk-rules" data-act="rules">
              <Icon name="info" />
              How to play
            </button>
          </div>
          <div className="sk-felt">
            <div className="wide-only">
              <CardFan />
            </div>
            <section className="sk-play" aria-labelledby="sk-play-title">
              <h2 className="label" id="sk-play-title">
                Play
              </h2>
              {down && (
                <p className="go-banner" role="status">
                  <Icon name="wifiOff" />
                  Not connected. Solo and One screen still work.
                </p>
              )}
              <ul className="sk-ways">
                {solo ? (
                  <Way
                    name="Solo"
                    icon="bot"
                    tone="blue"
                    line={`Round ${solo.round} of ${solo.rounds} is waiting.`}
                    to={AT.table}
                    onFollow={onRejoin}
                  >
                    <span className="pill blue sk-way-button">Back to your game</span>
                  </Way>
                ) : down ? (
                  <Way
                    name="Solo"
                    icon="bot"
                    tone="blue"
                    line="Offline: runs on this device and is not counted in your stats."
                    to={AT.solo}
                    pill={<span className="pill gold">Offline</span>}
                  />
                ) : (
                  <Way
                    name="Solo"
                    icon="bot"
                    tone="blue"
                    line="Against bots, any time. Saved to your account."
                    to={AT.solo}
                  />
                )}
                <Way
                  name="One screen"
                  icon="smartphone"
                  tone="gold"
                  line={
                    <>
                      Pass one <span className="narrow-only">phone</span>
                      <span className="wide-only">device</span> around. 2 to 8 pirates.
                    </>
                  }
                  to={AT.oneScreen}
                />
                {down ? (
                  <Way name="Online" icon="globe" tone="green" line="Needs a connection." dim />
                ) : (
                  <Way
                    name="Online"
                    icon="globe"
                    tone="green"
                    line="Quick play, public tables, or a table of your own."
                    to={AT.online}
                  />
                )}
                {down ? (
                  <Way name="Ranked" icon="crown" tone="purple" line="Needs a connection." dim />
                ) : who.is === 'visitor' || me?.guest ? (
                  <Way
                    name="Ranked"
                    icon="crown"
                    tone="purple"
                    line="Needs a free account."
                    to={AT.signUp}
                    pill={<span className="pill blue">Sign up</span>}
                  />
                ) : closed ? (
                  // The server closed ranked for this player. The card says so and leads nowhere.
                  <Way
                    name="Ranked"
                    icon="crown"
                    tone="purple"
                    line="Ranked is closed for you."
                    pill={<span className="pill red">Cooldown</span>}
                  />
                ) : me && !me.rating ? (
                  <Way
                    name="Ranked"
                    icon="crown"
                    tone="purple"
                    line="Five placement games set your tier."
                    to={AT.ranked}
                    pill={seasonPill}
                  />
                ) : (
                  <Way
                    name="Ranked"
                    icon="crown"
                    tone="purple"
                    line="This quarter. The standard rules. No bots."
                    to={AT.ranked}
                    pill={seasonPill}
                  />
                )}
              </ul>
            </section>
          </div>
        </main>
      </div>
    </GoContext>
  );
}
