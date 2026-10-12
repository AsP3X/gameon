/* The online screens: the hub, the profile, the public tables, the quick-play queue,
   a new table, joining by code, and the table's lobby. Signing up and in are pages of the frame
   (src/gameon). React draws them
   next to the legacy renderer's #app; the game itself is still played there, at the same table the
   offline modes use. Everything shown is what the server said (src/net/online.ts): a tap asks, and
   the screen changes when the answer or the next state arrives. */
import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Notice, Online, OnlineState, Outcome } from '../net/online';
import type { LinkStatus } from '../net/socket';
import { Sound } from '../sound/sound';
import { cssColor, whole } from '../tableview/dom';
import type { LobbyId } from '../protocol/generated';
import { AT, playerAt } from '../router/addresses';
import type { OnlineRoute } from '../router/addresses';
import { failureText, ordinal } from './copy';
import { LobbyRoom } from './LobbyRoom';
import { Head, initialOf } from './parts';
import { PlayerScreen, ProfileScreen } from './Profile';
import { PublicTables } from './PublicTables';
import { QueueScreen } from './Queue';
import { reloadPage } from './reload';
import { LadderScreen, RankedSection } from './Ranked';
import { loadSettings, MIN_SEATS, saveSettings } from './settings';
import { SettingsForm } from './SettingsForm';

/** The characters a table code is made of (docs/protocol.md §5.3). Everything else is dropped as it is typed. */
const NOT_CODE = /[^ABCDEFGHJKMNPQRSTUVWXYZ23456789]/g;
const CODE_LENGTH = 6;

const STATUS_PILL: Record<LinkStatus, { tone: string; text: string }> = {
  idle: { tone: 'soft', text: 'Connecting…' },
  connecting: { tone: 'soft', text: 'Connecting…' },
  online: { tone: 'green', text: 'Connected' },
  offline: { tone: 'red', text: 'Offline' },
  superseded: { tone: 'soft', text: 'Paused' },
  unsupported: { tone: 'red', text: 'Update needed' },
};

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

function Hub(props: { online: Online; state: OnlineState; onExit: () => void; go: (path: string) => void }) {
  const { online, state } = props,
    me = state.me,
    live = state.status === 'online',
    pill = STATUS_PILL[state.status],
    notice = state.notice ? noticeText(state.notice) : null;
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const to = (path: string) => () => {
    Sound.play('tap');
    props.go(path);
  };
  const find = (): void => {
    Sound.play('confirm');
    setFinding(true);
    setError(null);
    void online.joinQueue('casual').then((r) => {
      setFinding(false);
      if (!r.ok) setError(failureText(r));
    });
  };
  return (
    <div className="wrap">
      <Head title="Play online" onBack={props.onExit}>
        <span className={`pill ${pill.tone}`} role="status">
          {pill.text}
        </span>
      </Head>
      <div className="stack sections">
        <div className="plate identity">
          <span
            className={me ? 'avatar sm' : 'avatar sm empty'}
            style={me ? { background: cssColor(me.user.color) } : undefined}
            aria-hidden="true"
          >
            {me ? initialOf(me.user.name) : '?'}
          </span>
          <span className="grow">
            <small>{me?.username ? `Playing as @${me.username}` : me ? 'Playing as a guest' : 'Playing as'}</small>
            <b>{me ? me.user.name : '…'}</b>
          </span>
          <button type="button" className="mini" disabled={!me} onClick={to(AT.profile)}>
            Profile
          </button>
        </div>
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
        <section className="stack">
          <span className="label">Quick play</span>
          <button type="button" className="btn" disabled={!live || finding} onClick={find}>
            Find a game
          </button>
          {error ? (
            <p className="alert" role="alert">
              {error}
            </p>
          ) : (
            <p className="muted">Sit down with other pirates at the standard rules. Open seats are filled with bots.</p>
          )}
        </section>
        <RankedSection
          online={online}
          me={me}
          live={live}
          onLadder={() => props.go(AT.ladder)}
          onSignUp={() => props.go(AT.signUp)}
        />
        <section className="stack">
          <span className="label">Public tables</span>
          <button type="button" className="btn ghost" disabled={!live} onClick={to(AT.publicTables)}>
            Browse tables
          </button>
        </section>
        <section className="stack">
          <span className="label">Your own table</span>
          <button type="button" className="btn ghost" disabled={!live} onClick={to(AT.newTable)}>
            Create a table
          </button>
          <button type="button" className="btn ghost" disabled={!live} onClick={to(AT.join)}>
            Join with a code
          </button>
          <p className="muted">
            Create a table for your crew or open it to everyone, or type in the code a friend gave you.
          </p>
        </section>
      </div>
    </div>
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
  go: (path: string) => void;
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

  // Another player's page is the same from the lobby, the ladder or a typed address.
  if (route.page === 'player') return <PlayerScreen online={online} id={route.id} onBack={hub} />;
  if (lobby && me) {
    const back = (): void => setRules(null);
    if (rules === lobby.id && lobby.hostId === me.user.id && lobby.state === 'open')
      return (
        <SettingsForm
          title="Table rules"
          submit="Save rules"
          note="Saving new rules clears everyone's ready."
          initial={lobby.settings}
          minSeats={Math.max(MIN_SEATS, lobby.members.length)}
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
  if (queue) return <QueueScreen online={online} queue={queue} live={live} rules={state.config?.standard ?? null} />;
  if (route.page === 'newTable') {
    // "New table" opens set to public when it was reached from the public list, and goes back there.
    const from = route.visibility === 'public' ? AT.publicTables : AT.online;
    return (
      <SettingsForm
        title="New table"
        submit="Create table"
        initial={loadSettings()}
        visibility={route.visibility}
        minSeats={MIN_SEATS}
        disabled={!live}
        onBack={() => up(from)}
        onSubmit={async (settings, visibility) => {
          const r = await online.createLobby(visibility, settings);
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
        live={live}
        onBack={hub}
        onCreate={() => go(AT.newPublicTable)}
        sit={sit ?? null}
        onSat={onSat}
      />
    );
  if (route.page === 'ladder')
    return <LadderScreen online={online} me={me?.user.id ?? null} live={live} onBack={hub} />;
  if (me && route.page === 'profile')
    return (
      <ProfileScreen
        // Another player after signing in: the form starts from who they are.
        key={me.user.id}
        online={online}
        me={me}
        live={live}
        onBack={hub}
        onSignUp={() => go(AT.signUp)}
        onSignIn={() => go(AT.signIn)}
        onSignedOut={onExit}
      />
    );
  return <Hub online={online} state={state} onExit={onExit} go={go} />;
}
