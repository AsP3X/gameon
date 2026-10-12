/* Signing up and signing in, as pages of the frame. Signing up gives the guest of this browser a
   login, and a browser nobody knows gets its guest first (src/net/online.ts, `signUp`). Signing in
   switches this browser to another account. The password goes to the server in the request and
   nowhere else: it is not stored, logged or put in an address. */
import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { Outcome } from '../net/online';
import type { Credentials, Season } from '../protocol/generated';
import { failureText, USERNAME_MAX, USERNAME_SHAPE } from '../online/copy';
import { AT } from '../router/addresses';
import { CardFan, IconKey } from './art';
import { Link, Nav, useTitle } from './Frame';
import type { Who } from './Frame';

type Wrong = { field: 'username' | 'repeat' | 'form'; text: string };

export interface AccountPageProps {
  who: Who;
  onSubmit: (credentials: Credentials) => Promise<Outcome>;
}

function Field(props: {
  id: string;
  label: string;
  type: 'text' | 'password';
  value: string;
  autoComplete: string;
  maxLength?: number;
  help?: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const note = props.error ?? props.help;
  return (
    <div className="go-field">
      <label htmlFor={props.id}>{props.label}</label>
      <input
        id={props.id}
        type={props.type}
        value={props.value}
        maxLength={props.maxLength}
        autoComplete={props.autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        aria-invalid={props.error != null}
        aria-describedby={note ? `${props.id}-help` : undefined}
        onChange={(e) => props.onChange(e.target.value)}
      />
      {note && (
        <p
          id={`${props.id}-help`}
          className={props.error ? 'alert' : undefined}
          role={props.error ? 'alert' : undefined}
        >
          {note}
        </p>
      )}
    </div>
  );
}

/** The button of a form, and above it what is wrong with the whole form or with the connection. */
function Send(props: { wrong: Wrong | null; reachable: boolean; disabled: boolean; children: ReactNode }) {
  return (
    <div className="go-send">
      {props.wrong?.field === 'form' ? (
        <p className="alert" role="alert">
          {props.wrong.text}
        </p>
      ) : (
        !props.reachable && <p role="status">Not connected. Trying again…</p>
      )}
      <button type="submit" className="btn go-btn full" disabled={props.disabled}>
        {props.children}
      </button>
    </div>
  );
}

const Guest = () => (
  <p className="go-guest">
    Just want to play?{' '}
    <Link to={AT.games} className="go-text-link">
      Continue as a guest
    </Link>
  </p>
);

/** Give this browser's guest a username and a password. */
export function SignUp({ who, onSubmit }: AccountPageProps) {
  const title = useTitle('GameOn · Create your account');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState<Wrong | null>(null);
  const reachable = who.is !== 'unknown';
  const edit = (set: (value: string) => void) => (value: string) => {
    setWrong(null);
    set(value);
  };
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (busy || !reachable || !username || !password) return;
    // Checked here so the answer is immediate. The server checks again, and its code is what counts.
    if (!USERNAME_SHAPE.test(username))
      return setWrong({ field: 'username', text: failureText({ ok: false, code: 'USERNAME_INVALID', message: '' }) });
    if (password !== repeat) return setWrong({ field: 'repeat', text: 'The two passwords are not the same.' });
    setBusy(true);
    setWrong(null);
    void onSubmit({ username, password }).then((r) => {
      if (r.ok) return;
      setBusy(false);
      const field = r.code === 'USERNAME_TAKEN' || r.code === 'USERNAME_INVALID' ? 'username' : 'form';
      setWrong({ field, text: failureText(r) });
    });
  };
  return (
    <>
      <Nav page="signUp" who={who} />
      <main className="go-account">
        <div className="go-in">
          <form onSubmit={submit}>
            <div className="go-form-head">
              <h1 tabIndex={-1} ref={title}>
                Create your account
              </h1>
              <p>One account for every game on GameOn.</p>
            </div>
            <Field
              id="signup-username"
              label="Username"
              type="text"
              value={username}
              autoComplete="username"
              maxLength={USERNAME_MAX}
              help="3 to 16 letters, digits or underscores. You sign in with it."
              error={wrong?.field === 'username' ? wrong.text : undefined}
              onChange={edit(setUsername)}
            />
            <Field
              id="signup-password"
              label="Password"
              type="password"
              value={password}
              autoComplete="new-password"
              onChange={edit(setPassword)}
            />
            <Field
              id="signup-repeat"
              label="Repeat password"
              type="password"
              value={repeat}
              autoComplete="new-password"
              error={wrong?.field === 'repeat' ? wrong.text : undefined}
              onChange={edit(setRepeat)}
            />
            <div className="go-keep">
              <b>Keep your password safe</b>
              <p>There is no email and no reset. A forgotten password cannot be recovered.</p>
            </div>
            <Send wrong={wrong} reachable={reachable} disabled={busy || !reachable || !username || !password}>
              Create account
            </Send>
            <Guest />
          </form>
          <aside className="go-brand wide-only">
            <CardFan />
            <div className="go-brand-text">
              <h2>What an account gets you</h2>
              <ul className="go-benefits">
                <li>
                  <IconKey icon="crown" tone="gold" />
                  <span>
                    <b>Ranked and the ladder</b>
                    <p>Queue for ranked games and earn your tier.</p>
                  </span>
                </li>
                <li>
                  <IconKey icon="smartphone" tone="blue" />
                  <span>
                    <b>Every device</b>
                    <p>Sign in anywhere and find your name, colour and stats.</p>
                  </span>
                </li>
                <li>
                  <IconKey icon="check" tone="green" />
                  <span>
                    <b>Keep what you have</b>
                    <p>Played as a guest? Your name, colour and stats stay with you.</p>
                  </span>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}

/** Switch this browser to an account that already exists. */
export function SignIn({ who, season, onSubmit }: AccountPageProps & { season: Season | null | undefined }) {
  const title = useTitle('GameOn · Sign in');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState<Wrong | null>(null);
  const reachable = who.is !== 'unknown';
  // A guest who has played leaves those games behind: the guest cannot be signed in to again.
  const leaves = who.is === 'player' && who.me.guest && who.me.stats.games > 0;
  const edit = (set: (value: string) => void) => (value: string) => {
    setWrong(null);
    set(value);
  };
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (busy || !reachable || !username || !password) return;
    setBusy(true);
    setWrong(null);
    void onSubmit({ username, password }).then((r) => {
      if (r.ok) return;
      setBusy(false);
      setWrong({ field: 'form', text: failureText(r) });
    });
  };
  return (
    <>
      <Nav page="signIn" who={who} />
      <main className="go-account">
        <div className="go-in">
          <form onSubmit={submit}>
            <div className="go-form-head">
              <h1 tabIndex={-1} ref={title}>
                Welcome back
              </h1>
              <p>Sign in to pick up where you left off.</p>
            </div>
            <Field
              id="signin-username"
              label="Username"
              type="text"
              value={username}
              autoComplete="username"
              maxLength={USERNAME_MAX}
              onChange={edit(setUsername)}
            />
            <Field
              id="signin-password"
              label="Password"
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={edit(setPassword)}
            />
            <Send wrong={wrong} reachable={reachable} disabled={busy || !reachable || !username || !password}>
              Sign in
            </Send>
            {leaves && (
              <p className="go-form-note">
                Signing in switches to that account. This guest and its games are left behind.
              </p>
            )}
            <p className="go-form-note">
              Forgot your password? There is no email and no reset, so it cannot be recovered.
            </p>
            <Guest />
          </form>
          <aside className="go-brand wide-only">
            <CardFan />
            <div className="go-brand-text">
              {season && <span className="pill gold caps">Season {season.name}</span>}
              <h2 className="big">Your seat is waiting.</h2>
              <p>Your name, your colour, your stats and your rating are where you left them, on any device.</p>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
