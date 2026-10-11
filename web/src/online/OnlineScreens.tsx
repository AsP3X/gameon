/* The online screens: the hub, a new table, joining by code, and the table's lobby. React draws them
   next to the legacy renderer's #app; the game itself is still played there, at the same table the
   offline modes use. Everything shown is what the server said (src/net/online.ts): a tap asks, and
   the screen changes when the answer or the next state arrives. */
import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Notice, Online, OnlineState, Outcome } from '../net/online';
import type { LinkStatus } from '../net/socket';
import { Sound } from '../sound/sound';
import { cssColor } from '../tableview/dom';
import { failureText, ordinal } from './copy';
import { BackIcon } from './icons';
import { LobbyRoom } from './LobbyRoom';
import { loadSettings, MIN_SEATS, saveSettings } from './settings';
import { SettingsForm } from './SettingsForm';

type Page = 'hub' | 'create' | 'join' | 'rules';

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
    notice.left ? 'You left before the end.' : 'It ended while you were away.',
    notice.place != null ? `Final place: ${ordinal(notice.place)} of ${notice.seats}.` : '',
    notice.forfeited ? 'It counts as a forfeit.' : '',
    notice.delta != null ? `Rating ${notice.delta > 0 ? '+' : ''}${notice.delta}.` : '',
  ].filter(Boolean);
  return { title: 'Your last game is over', text: parts.join(' ') };
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
  const to = (page: Page) => () => {
    Sound.play('tap');
    props.onPage(page);
  };
  return (
    <div className="wrap">
      <div className="row head">
        <button
          type="button"
          className="icon-btn"
          aria-label="Back"
          onClick={() => {
            Sound.play('back');
            props.onExit();
          }}
        >
          <BackIcon />
        </button>
        <h2 className="grow">Play online</h2>
      </div>
      <div className="stack sections">
        <div className="row identity">
          <span
            className={me ? 'avatar sm' : 'avatar sm empty'}
            style={me ? { background: cssColor(me.user.color) } : undefined}
          >
            {me ? (me.user.name.trim()[0] || '?').toUpperCase() : '?'}
          </span>
          <span className="grow">
            <small>Playing as</small>
            <b>{me ? me.user.name : '…'}</b>
          </span>
          <span className={`pill ${pill.tone}`} role="status">
            {pill.text}
          </span>
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
          <span className="label">Private table</span>
          <button type="button" className="btn" disabled={!live} onClick={to('create')}>
            Create a table
          </button>
          <button type="button" className="btn ghost" disabled={!live} onClick={to('join')}>
            Join with a code
          </button>
          <p className="muted">Create a table to get a code for your crew, or type in the code a friend gave you.</p>
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
        <div className="row head">
          <button
            type="button"
            className="icon-btn"
            aria-label="Back"
            onClick={() => {
              Sound.play('back');
              props.onBack();
            }}
          >
            <BackIcon />
          </button>
          <h2 className="grow">Join a table</h2>
        </div>
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
  const { lobby, me } = state,
    live = state.status === 'online';

  if (lobby && me) {
    if (page === 'rules' && lobby.hostId === me.user.id && lobby.state === 'open')
      return (
        <SettingsForm
          title="Table rules"
          submit="Save rules"
          note="Saving new rules clears everyone's ready."
          initial={lobby.settings}
          minSeats={Math.max(MIN_SEATS, lobby.members.length)}
          disabled={!live}
          onBack={() => setPage('hub')}
          onSubmit={async (settings) => {
            const r = await online.setSettings(settings);
            if (r.ok) {
              saveSettings(settings);
              setPage('hub');
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
        onRules={() => setPage('rules')}
      />
    );
  }
  if (page === 'create')
    return (
      <SettingsForm
        title="New table"
        submit="Create table"
        initial={loadSettings()}
        minSeats={MIN_SEATS}
        disabled={!live}
        onBack={() => setPage('hub')}
        onSubmit={async (settings) => {
          const r = await online.createLobby('private', settings);
          if (r.ok) {
            saveSettings(settings);
            setPage('hub');
          }
          return r;
        }}
      />
    );
  if (page === 'join')
    return (
      <Join
        live={live}
        onBack={() => setPage('hub')}
        onJoin={async (code) => {
          const r = await online.joinLobby(code);
          if (r.ok) setPage('hub');
          return r;
        }}
      />
    );
  return <Hub online={online} state={state} onExit={onExit} onPage={setPage} />;
}
