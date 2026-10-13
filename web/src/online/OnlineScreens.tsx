/* The online screens: the index with its three doors, the ranked page, the public tables, a new
   table, the table's lobby, joining by code and the queue. Signing up and in, the profile, another
   player and the ladder are pages of the frame (src/gameon). React draws them next to the legacy
   renderer's #app; the
   game itself is still played there, at the same table the offline modes use. Everything shown is
   what the server said (src/net/online.ts): a tap asks, and the screen changes when the answer or
   the next state arrives.

   The index, the ranked page and the five tables are drawn as design/skt.pen draws them (plan item
   W4). The queue and the code are the screens they were. */
import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { KeyTone } from '../gameon/art';
import { IconKey } from '../gameon/art';
import { Link } from '../gameon/Frame';
import type { Go } from '../gameon/Frame';
import { Icon } from '../gameon/icons';
import type { IconName } from '../gameon/icons';
import type { Notice, Online, OnlineState, Outcome } from '../net/online';
import type { LinkStatus } from '../net/socket';
import { Sound } from '../sound/sound';
import { whole } from '../tableview/dom';
import type { LobbyId } from '../protocol/generated';
import { AT, playerAt } from '../router/addresses';
import type { OnlineRoute } from '../router/addresses';
import { failureText, ordinal } from './copy';
import { LobbyRoom } from './LobbyRoom';
import { Bar, Head, Page } from './parts';
import { PublicTables } from './PublicTables';
import { QueueScreen } from './Queue';
import { reloadPage } from './reload';
import { RankedScreen } from './Ranked';
import { FIXED, loadTable, saveSettings } from './settings';
import { SettingsForm } from './SettingsForm';

/** The characters a table code is made of (docs/protocol.md §5.3). Everything else is dropped as it is typed. */
const NOT_CODE = /[^ABCDEFGHJKMNPQRSTUVWXYZ23456789]/g;
const CODE_LENGTH = 6;

export function noticeText(notice: Notice): { title: string; text: string } {
  if (notice.kind === 'lobbyClosed')
    return notice.reason === 'kicked'
      ? { title: 'The host removed you from the table', text: 'You can join another table or create your own.' }
      : notice.reason === 'idle'
        ? { title: 'The table was closed', text: 'Nothing happened at it for too long.' }
        : { title: 'The table was closed', text: 'Nobody was left to host it.' };
  if (notice.kind === 'seatLost')
    return {
      title: 'You lost your seat',
      text: `You were away for two turns in a row. The game goes on without you.${notice.ranked ? ' It counts as a forfeit.' : ''}`,
    };
  const parts = [
    notice.left
      ? 'You left before the end.'
      : notice.lost
        ? 'You lost your seat before the end.'
        : 'It ended while you were away.',
    notice.place != null ? `Final place: ${ordinal(notice.place)} of ${notice.seats}.` : '',
    notice.forfeited ? 'It counts as a forfeit.' : '',
    notice.delta != null ? `Rating ${notice.delta > 0 ? '+' : ''}${whole(notice.delta)}.` : '',
  ].filter(Boolean);
  return { title: 'Your last game is over', text: parts.join(' ') };
}

/** What stands between the player and the server, if anything. */
function LinkNotice({ status, online, onOffline }: { status: LinkStatus; online: Online; onOffline: () => void }) {
  const again = (): void => {
    Sound.play('tap');
    online.retry();
  };
  switch (status) {
    case 'idle':
    case 'connecting':
      return (
        <div className="notice" role="status">
          <b>Finding the tavern…</b>
          <p>One moment. Create and Join wait until you are connected.</p>
        </div>
      );
    case 'offline':
      return (
        <div className="notice" role="status">
          <b>Can't reach the tavern</b>
          <p>Check your connection. Trying again on its own.</p>
          <button type="button" className="btn ghost" onClick={again}>
            Try now
          </button>
          <p>Bots, one phone for the crew and the scoresheet need no connection.</p>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              Sound.play('back');
              onOffline();
            }}
          >
            Play offline
          </button>
        </div>
      );
    case 'superseded':
      return (
        <div className="notice" role="status">
          <b>Playing in another tab</b>
          <p>This player is connected from another tab or device. Only one can play at a time.</p>
          <button type="button" className="btn ghost" onClick={again}>
            Play here
          </button>
        </div>
      );
    case 'unsupported':
      return (
        <div className="notice" role="alert">
          <b>The tavern has moved on</b>
          <p>This page is older than the server. Reload to update.</p>
          <button type="button" className="btn" onClick={reloadPage}>
            Reload to update
          </button>
        </div>
      );
    case 'online':
      return null;
  }
}

/** One way to a table, on its card. A door that leads to a page is a link. Quick play asks at once. */
function Door(props: {
  name: string;
  line: string;
  icon: IconName;
  tone: KeyTone;
  /** The page the door leads to. Without it the door is a button. */
  to?: string;
  onPick?: () => void;
  /** Nothing answers: the door is there and cannot be gone through. */
  shut: boolean;
}) {
  const inside: ReactNode = (
    <>
      <IconKey icon={props.icon} tone={props.tone} />
      <span className="sk-way-text">
        <b>{props.name}</b>
        <span>{props.line}</span>
      </span>
      <span className="sk-way-go">
        <Icon name="chevronRight" />
      </span>
    </>
  );
  if (props.shut)
    return (
      <li>
        <div className="sk-way dim" aria-disabled="true">
          {inside}
        </div>
      </li>
    );
  if (props.to != null)
    return (
      <li onClickCapture={() => Sound.play('tap')}>
        <Link to={props.to} className="sk-way">
          {inside}
        </Link>
      </li>
    );
  return (
    <li>
      <button type="button" className="sk-way" onClick={props.onPick}>
        {inside}
      </button>
    </li>
  );
}

/** The index: the three doors to a table, and the code of a friend's. */
function Hub(props: { online: Online; state: OnlineState; onExit: () => void; go: Go }) {
  const { online, state } = props,
    live = state.status === 'online',
    notice = state.notice ? noticeText(state.notice) : null;
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const find = (): void => {
    if (finding) return;
    Sound.play('confirm');
    setFinding(true);
    setError(null);
    void online.joinQueue('casual').then((r) => {
      setFinding(false);
      if (!r.ok) setError(failureText(r));
    });
  };
  return (
    <Page go={props.go}>
      <Bar title="Online" onBack={props.onExit} me={state.me} status={state.status} />
      <main className="on-body">
        <LinkNotice status={state.status} online={online} onOffline={props.onExit} />
        {notice && (
          <div className="notice gold" role="status">
            <b>{notice.title}</b>
            <p>{notice.text}</p>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                Sound.play('tap');
                online.dismissNotice();
              }}
            >
              OK
            </button>
          </div>
        )}
        <ul className="sk-ways" aria-label="Ways to a table">
          <Door
            name="Quick play"
            line="A random table. Bots fill the empty seats. The standard rules."
            icon="shuffle"
            tone="green"
            onPick={find}
            shut={!live || finding}
          />
          <Door
            name="Public tables"
            line="Anyone can see the table. You pick the rules."
            icon="globe"
            tone="blue"
            to={AT.publicTables}
            shut={!live}
          />
          <Door
            name="Your table"
            line="Friends only, with a code. You pick the rules."
            icon="lock"
            tone="orange"
            to={AT.newTable}
            shut={!live}
          />
        </ul>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          className="btn ghost"
          disabled={!live}
          onClick={() => {
            Sound.play('tap');
            props.go(AT.join);
          }}
        >
          Join with a code
        </button>
      </main>
    </Page>
  );
}

function Join(props: { live: boolean; onBack: () => void; onJoin: (code: string) => Promise<Outcome> }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (code.length !== CODE_LENGTH || busy || !props.live) return;
    Sound.play('confirm');
    setBusy(true);
    setError(null);
    void props.onJoin(code).then((r) => {
      setBusy(false);
      if (!r.ok) setError(failureText(r));
    });
  };
  return (
    <form onSubmit={submit}>
      <div className="wrap">
        <Head title="Join a table" onBack={props.onBack} />
        <div className="stack">
          <label className="label" htmlFor="table-code">
            Table code
          </label>
          <input
            id="table-code"
            className="name code-input"
            value={code}
            maxLength={CODE_LENGTH}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={error != null}
            aria-describedby="table-code-help"
            onChange={(e) => {
              setError(null);
              setCode(e.target.value.toUpperCase().replace(NOT_CODE, '').slice(0, CODE_LENGTH));
            }}
          />
          {error ? (
            <p id="table-code-help" className="alert" role="alert">
              {error}
            </p>
          ) : (
            <p id="table-code-help" className="muted" role={props.live ? undefined : 'status'}>
              {props.live ? 'Ask the host for the 6-character code.' : 'Not connected. Trying again…'}
            </p>
          )}
        </div>
      </div>
      <div className="footbar">
        <div>
          <button type="submit" className="btn" disabled={code.length !== CODE_LENGTH || busy || !props.live}>
            Join table
          </button>
        </div>
      </div>
    </form>
  );
}

export interface OnlineScreensProps {
  online: Online;
  state: OnlineState;
  /** The page the address names. A lobby or a queue the server seated the player in is shown instead. */
  route: OnlineRoute;
  /** To another page, as a link goes. */
  go: Go;
  /** Back to the page this one is reached from. */
  up: (parent: string) => void;
  /** Back from the hub: to the home screen. */
  onExit: () => void;
  /** A public table the player asked for before the list was up (Games): the list sits them down. */
  sit?: LobbyId | null;
  /** That table has been asked for. */
  onSat?: () => void;
}

export function OnlineScreens({ online, state, route, go, up, onExit, sit, onSat }: OnlineScreensProps) {
  /** The rules, open on top of a lobby. They belong to that lobby and are gone with it. */
  const [rules, setRules] = useState<LobbyId | null>(null);
  const { lobby, me, queue } = state,
    live = state.status === 'online',
    hub = (): void => up(AT.online);

  if (lobby && me) {
    const back = (): void => setRules(null);
    if (rules === lobby.id && lobby.hostId === me.user.id && lobby.state === 'open')
      return (
        <SettingsForm
          go={go}
          me={me}
          // The seats, the pace and the bots' skill stay what the table has: the form has no control for them.
          initial={lobby.settings}
          disabled={!live}
          onBack={back}
          onSubmit={async (settings) => {
            const r = await online.setSettings(settings);
            if (r.ok) {
              saveSettings(settings);
              back();
            }
            return r;
          }}
        />
      );
    return (
      <LobbyRoom
        online={online}
        go={go}
        lobby={lobby}
        me={me}
        status={state.status}
        notice={state.notice ? noticeText(state.notice) : null}
        onRules={() => setRules(lobby.id)}
        onPlayer={(id) => {
          const at = playerAt(id);
          if (at) go(at);
        }}
      />
    );
  }
  // A quick-play table that bots filled: the queue's last picture, for the moment before the table.
  if (state.boarding)
    return (
      <QueueScreen
        online={online}
        queue={state.boarding.queue}
        boarded={state.boarding.bots}
        live={live}
        rules={state.config?.standard ?? null}
      />
    );
  if (queue) return <QueueScreen online={online} queue={queue} live={live} rules={state.config?.standard ?? null} />;
  if (route.page === 'ranked')
    return (
      <RankedScreen
        online={online}
        state={state}
        go={go}
        onBack={onExit}
        onLadder={() => go(AT.ladder)}
        onSignUp={() => go(AT.signUp)}
      >
        <LinkNotice status={state.status} online={online} onOffline={onExit} />
      </RankedScreen>
    );
  if (route.page === 'newTable') {
    // A public table is opened from the public list, and goes back there.
    const { visibility } = route,
      from = visibility === 'public' ? AT.publicTables : AT.online;
    return (
      <SettingsForm
        // The two pages are one form: going from one to the other starts it again.
        key={visibility}
        go={go}
        me={me}
        visibility={visibility}
        initial={loadTable()}
        disabled={!live}
        onBack={() => up(from)}
        onSubmit={async (chosen, seatBots) => {
          // Whatever the device remembers, a new table has the fixed seats, pace and bot skill.
          const settings = { ...chosen, ...FIXED };
          const r = await online.createLobby(visibility, settings, seatBots);
          if (r.ok) {
            saveSettings(settings);
            hub();
          }
          return r;
        }}
      />
    );
  }
  if (route.page === 'join')
    return (
      <Join
        live={live}
        onBack={hub}
        onJoin={async (code) => {
          const r = await online.joinLobby(code);
          if (r.ok) hub();
          return r;
        }}
      />
    );
  if (route.page === 'publicTables')
    return (
      <PublicTables
        online={online}
        go={go}
        me={me}
        live={live}
        onBack={hub}
        onCreate={() => go(AT.newPublicTable)}
        sit={sit ?? null}
        onSat={onSat}
      />
    );
  return <Hub online={online} state={state} onExit={onExit} go={go} />;
}
