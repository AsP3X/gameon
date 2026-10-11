/* The online screens: the hub, the profile and the account, the public tables, the quick-play queue,
   a new table, joining by code, and the table's lobby. React draws them
   next to the legacy renderer's #app; the game itself is still played there, at the same table the
   offline modes use. Everything shown is what the server said (src/net/online.ts): a tap asks, and
   the screen changes when the answer or the next state arrives. */
import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Notice, Online, OnlineState, Outcome } from '../net/online';
import type { LinkStatus } from '../net/socket';
import { Sound } from '../sound/sound';
import { cssColor } from '../tableview/dom';
import type { LobbyId, UserId, Visibility } from '../protocol/generated';
import { SignIn, SignUp } from './Account';
import { failureText, ordinal } from './copy';
import { LobbyRoom } from './LobbyRoom';
import { Head, initialOf } from './parts';
import { PlayerScreen, ProfileScreen } from './Profile';
import { PublicTables } from './PublicTables';
import { QueueScreen } from './Queue';
import { loadSettings, MIN_SEATS, saveSettings } from './settings';
import { SettingsForm } from './SettingsForm';

type Page = 'hub' | 'create' | 'join' | 'tables' | 'profile' | 'signup' | 'signin';

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

function noticeText(notice: Notice): { title: string; text: string } {
  if (notice.kind === 'lobbyClosed')
    return notice.reason === 'kicked'
      ? { title: 'The host removed you from the table', text: 'You can join another table or create your own.' }
      : notice.reason === 'idle'
        ? { title: 'The table was closed', text: 'Nothing happened at it for too long.' }
        : { title: 'The table was closed', text: 'Nobody was left to host it.' };
  const parts = [
    notice.left ? 'You left before the end.' : '',
    notice.place != null ? `Final place: ${ordinal(notice.place)} of ${notice.seats}.` : '',
    notice.forfeited ? 'It counts as a forfeit.' : '',
    notice.delta != null ? `Rating ${notice.delta > 0 ? '+' : ''}${notice.delta}.` : '',
  ].filter(Boolean);
  return { title: 'Your last game is over', text: parts.join(' ') || 'It ended while you were away.' };
}

/** What stands between the player and the server, if anything. */
function LinkNotice({ status, online }: { status: LinkStatus; online: Online }) {
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
          <button type="button" className="btn" onClick={() => location.reload()}>
            Reload to update
          </button>
        </div>
      );
    case 'online':
      return null;
  }
}

function Hub(props: { online: Online; state: OnlineState; onExit: () => void; onPage: (page: Page) => void }) {
  const { online, state } = props,
    me = state.me,
    live = state.status === 'online',
    pill = STATUS_PILL[state.status],
    notice = state.notice ? noticeText(state.notice) : null;
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const to = (page: Page) => () => {
    Sound.play('tap');
    props.onPage(page);
  };
  const find = (): void => {
    Sound.play('confirm');
    setFinding(true);
    setError(null);
    void online.joinQueue().then((r) => {
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
          <button type="button" className="mini" disabled={!me} onClick={to('profile')}>
            Profile
          </button>
        </div>
        <LinkNotice status={state.status} online={online} />
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
        <section className="stack">
          <span className="label">Public tables</span>
          <button type="button" className="btn ghost" disabled={!live} onClick={to('tables')}>
            Browse tables
          </button>
        </section>
        <section className="stack">
          <span className="label">Your own table</span>
          <button type="button" className="btn ghost" disabled={!live} onClick={to('create')}>
            Create a table
          </button>
          <button type="button" className="btn ghost" disabled={!live} onClick={to('join')}>
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
  /** Back from the hub: to the home screen. */
  onExit: () => void;
}

export function OnlineScreens({ online, state, onExit }: OnlineScreensProps) {
  const [page, setPage] = useState<Page>('hub');
  /** Whether "New table" opens set to public: it does when it was reached from the public list. */
  const [open, setOpen] = useState<Visibility>('private');
  /** What is open on top of a lobby. It belongs to that lobby and is gone with it. */
  const [over, setOver] = useState<{ lobby: LobbyId; view: 'rules' } | { lobby: LobbyId; player: UserId } | null>(null);
  const { lobby, me, queue } = state,
    live = state.status === 'online',
    hub = (): void => setPage('hub');

  if (lobby && me) {
    const on = over?.lobby === lobby.id ? over : null,
      back = (): void => setOver(null);
    if (on && 'view' in on && lobby.hostId === me.user.id && lobby.state === 'open')
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
    if (on && 'player' in on) return <PlayerScreen online={online} id={on.player} onBack={back} />;
    return (
      <LobbyRoom
        online={online}
        lobby={lobby}
        me={me}
        status={state.status}
        onRules={() => setOver({ lobby: lobby.id, view: 'rules' })}
        onPlayer={(id) => setOver({ lobby: lobby.id, player: id })}
      />
    );
  }
  if (queue) return <QueueScreen online={online} queue={queue} live={live} rules={state.config?.standard ?? null} />;
  if (page === 'create')
    return (
      <SettingsForm
        title="New table"
        submit="Create table"
        initial={loadSettings()}
        visibility={open}
        minSeats={MIN_SEATS}
        disabled={!live}
        onBack={() => setPage(open === 'public' ? 'tables' : 'hub')}
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
  if (page === 'join')
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
  if (page === 'tables')
    return (
      <PublicTables
        online={online}
        live={live}
        onBack={hub}
        onCreate={() => {
          setOpen('public');
          setPage('create');
        }}
      />
    );
  if (me && page === 'profile')
    return (
      <ProfileScreen
        // Another player after signing in: the form starts from who they are.
        key={me.user.id}
        online={online}
        me={me}
        live={live}
        onBack={hub}
        onSignUp={() => setPage('signup')}
        onSignIn={() => setPage('signin')}
        onSignedOut={onExit}
      />
    );
  if (me && page === 'signup')
    return (
      <SignUp
        live={live}
        onBack={() => setPage('profile')}
        onSubmit={async (credentials) => {
          const r = await online.register(credentials);
          if (r.ok) setPage('profile');
          return r;
        }}
      />
    );
  if (page === 'signin')
    return (
      <SignIn
        live={live}
        guest={me?.guest ?? true}
        onBack={() => setPage('profile')}
        onSubmit={async (credentials) => {
          const r = await online.login(credentials);
          if (r.ok) hub();
          return r;
        }}
      />
    );
  return (
    <Hub
      online={online}
      state={state}
      onExit={onExit}
      onPage={(next) => {
        if (next === 'create') setOpen('private');
        setPage(next);
      }}
    />
  );
}
