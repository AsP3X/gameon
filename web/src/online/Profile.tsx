/* Who the player is online: their own profile, which they can edit, and another player's, which is
   read from the server (`GET /users/{id}`) and never put together from what a table happened to show. */
import { useEffect, useState } from 'react';
import type { ApiResult } from '../net/api';
import type { Online } from '../net/online';
import type { Me, Profile, ProfilePatch, UserId } from '../protocol/generated';
import { Sound } from '../sound/sound';
import { cssColor } from '../tableview/dom';
import { TABLE_COLORS } from './colors';
import { failureText, NAME_MAX } from './copy';
import { Avatar, Head, StatTiles } from './parts';

type Note = { tone: 'error' | 'ok'; text: string };

export interface ProfileScreenProps {
  online: Online;
  me: Me;
  live: boolean;
  onBack: () => void;
  onSignUp: () => void;
  onSignIn: () => void;
  /** The session is over: there is nothing online to show any more. */
  onSignedOut: () => void;
}

/** The player's own profile: the name and colour others see, the online record, and the account. */
export function ProfileScreen({ online, me, live, onBack, onSignUp, onSignIn, onSignedOut }: ProfileScreenProps) {
  const [name, setName] = useState(me.user.name);
  const [color, setColor] = useState(me.user.color);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const trimmed = name.trim(),
    valid = trimmed.length >= 1 && Array.from(trimmed).length <= NAME_MAX,
    dirty = trimmed !== me.user.name || color !== me.user.color;

  const save = (): void => {
    Sound.play('confirm');
    setBusy(true);
    setNote(null);
    // Only what changed is sent: an omitted field stays as it is.
    const patch: ProfilePatch = {};
    if (trimmed !== me.user.name) patch.name = trimmed;
    if (color !== me.user.color) patch.color = color;
    void online.saveProfile(patch).then((r) => {
      setBusy(false);
      if (r.ok) {
        setName(trimmed);
        setNote({ tone: 'ok', text: 'Saved.' });
      } else
        setNote({
          tone: 'error',
          text: r.code === 'VALIDATION' ? "That name can't be used. Use 1 to 16 characters." : failureText(r),
        });
    });
  };
  const signOut = (): void => {
    Sound.play('tap');
    setBusy(true);
    setNote(null);
    void online.logout().then((r) => {
      if (r.ok) return onSignedOut();
      setBusy(false);
      setNote({ tone: 'error', text: failureText(r) });
    });
  };
  const to = (go: () => void) => () => {
    Sound.play('tap');
    go();
  };

  return (
    <>
      <div className="wrap">
        <Head title="Your profile" onBack={onBack} />
        <div className="stack sections">
          <div className="row who">
            <Avatar name={trimmed || me.user.name} color={color} size="lg" />
            <span className="grow">
              <b>{me.user.name}</b>
              <span className={`pill ${me.guest ? 'soft' : 'blue'}`}>{me.username ? `@${me.username}` : 'Guest'}</span>
            </span>
          </div>
          <section className="stack" aria-label="Online games">
            <span className="label">Online games</span>
            <StatTiles stats={me.stats} />
            {me.stats.games === 0 && <p className="muted">No online games yet. Your first one counts here.</p>}
          </section>
          <section className="stack">
            <label className="label" htmlFor="display-name">
              Display name
            </label>
            <input
              id="display-name"
              className="name field"
              value={name}
              maxLength={NAME_MAX}
              autoComplete="nickname"
              spellCheck={false}
              aria-describedby="display-name-help"
              onChange={(e) => {
                setNote(null);
                setName(e.target.value);
              }}
            />
            <p id="display-name-help" className="muted">
              1 to 16 characters. This is the name others see at the table.
            </p>
          </section>
          <section className="stack">
            <span className="label" id="colour-label">
              Colour
            </span>
            <div className="swatches" role="radiogroup" aria-labelledby="colour-label">
              {TABLE_COLORS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  className="swatch"
                  aria-checked={color === value}
                  aria-label={label}
                  onClick={() => {
                    Sound.play('select');
                    setNote(null);
                    setColor(value);
                  }}
                >
                  <i style={{ background: cssColor(value) }}></i>
                </button>
              ))}
            </div>
          </section>
          <section className="stack" aria-label="Account">
            <span className="label">Account</span>
            {me.guest ? (
              <>
                <p className="muted">
                  You are playing as a guest. Create an account to keep this pirate and to sign in on other devices.
                </p>
                <button type="button" className="btn ghost" disabled={busy} onClick={to(onSignUp)}>
                  Create an account
                </button>
                <button type="button" className="btn ghost" disabled={busy} onClick={to(onSignIn)}>
                  Sign in
                </button>
              </>
            ) : (
              <>
                <p className="muted">Signed in as @{me.username}.</p>
                <button type="button" className="btn ghost" disabled={busy} onClick={signOut}>
                  Sign out
                </button>
              </>
            )}
          </section>
        </div>
      </div>
      <div className="footbar">
        <div>
          {note ? (
            <p
              className={note.tone === 'error' ? 'foot-hint alert' : 'foot-hint'}
              role={note.tone === 'error' ? 'alert' : 'status'}
            >
              {note.text}
            </p>
          ) : (
            !live && (
              <p className="foot-hint" role="status">
                Not connected. Trying again…
              </p>
            )
          )}
          <button type="button" className="btn" disabled={!live || busy || !dirty || !valid} onClick={save}>
            Save
          </button>
        </div>
      </div>
    </>
  );
}

type Loaded = { id: UserId; result: ApiResult<Profile> };

/** Another player: their name, colour and online record, as the server has them. */
export function PlayerScreen(props: { online: Online; id: UserId; onBack: () => void }) {
  const { online, id } = props;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let stale = false;
    void online.profile(id).then((result) => {
      if (!stale) setLoaded({ id, result });
    });
    return () => {
      stale = true;
    };
  }, [online, id, attempt]);
  // An answer for somebody else is not this player's.
  const result = loaded?.id === id ? loaded.result : null;

  return (
    <div className="wrap">
      <Head title="Pirate" onBack={props.onBack} />
      <div className="stack sections">
        {!result ? (
          <div className="notice" role="status">
            <b>Looking up this pirate…</b>
            <p>One moment.</p>
          </div>
        ) : !result.ok ? (
          <div className="notice" role="alert">
            <b>Couldn't load this pirate</b>
            <p>They may be gone, or the connection dropped.</p>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                Sound.play('tap');
                setLoaded(null);
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className="row who">
              <Avatar name={result.value.user.name} color={result.value.user.color} size="lg" />
              <span className="grow">
                <b>{result.value.user.name}</b>
              </span>
            </div>
            <section className="stack" aria-label="Online games">
              <span className="label">Online games</span>
              <StatTiles stats={result.value.stats} />
              {result.value.stats.games === 0 && <p className="muted">No online games yet.</p>}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
