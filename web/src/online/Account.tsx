/* Signing up and signing in. A guest who signs up stays who they are and gets a login; signing in
   switches this device to another account. The password goes to the server in the request and
   nowhere else: it is not stored, logged or put in an address. */
import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Outcome } from '../net/online';
import type { Credentials } from '../protocol/generated';
import { Sound } from '../sound/sound';
import { failureText, USERNAME_MAX, USERNAME_SHAPE } from './copy';
import { Head } from './parts';

type Wrong = { field: 'username' | 'repeat' | 'form'; text: string };

interface AccountFormProps {
  live: boolean;
  onBack: () => void;
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
    <section className="stack">
      <label className="label" htmlFor={props.id}>
        {props.label}
      </label>
      <input
        id={props.id}
        className="name field"
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
        <p id={`${props.id}-help`} className={props.error ? 'alert' : 'muted'} role={props.error ? 'alert' : undefined}>
          {note}
        </p>
      )}
    </section>
  );
}

function Foot(props: { wrong: Wrong | null; live: boolean; disabled: boolean; submit: string }) {
  return (
    <div className="footbar">
      <div>
        {props.wrong?.field === 'form' ? (
          <p className="foot-hint alert" role="alert">
            {props.wrong.text}
          </p>
        ) : (
          !props.live && (
            <p className="foot-hint" role="status">
              Not connected. Trying again…
            </p>
          )
        )}
        <button type="submit" className="btn" disabled={props.disabled}>
          {props.submit}
        </button>
      </div>
    </div>
  );
}

/** Give this guest a username and a password. */
export function SignUp({ live, onBack, onSubmit }: AccountFormProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState<Wrong | null>(null);
  const edit = (set: (value: string) => void) => (value: string) => {
    setWrong(null);
    set(value);
  };
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (busy || !live || !username || !password) return;
    // Checked here so the answer is immediate. The server checks again, and its code is what counts.
    if (!USERNAME_SHAPE.test(username))
      return setWrong({ field: 'username', text: failureText({ ok: false, code: 'USERNAME_INVALID', message: '' }) });
    if (password !== repeat) return setWrong({ field: 'repeat', text: 'The two passwords are not the same.' });
    Sound.play('confirm');
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
    <form onSubmit={submit}>
      <div className="wrap">
        <Head title="Create an account" onBack={onBack} />
        <div className="stack sections">
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
          <div className="notice gold">
            <b>Keep your password safe</b>
            <p>There is no email and no reset. A forgotten password cannot be recovered.</p>
          </div>
          <p className="muted">Your name, colour and stats stay with you.</p>
        </div>
      </div>
      <Foot wrong={wrong} live={live} disabled={busy || !live || !username || !password} submit="Create account" />
    </form>
  );
}

/** Switch this device to an account that already exists. */
export function SignIn({ live, guest, onBack, onSubmit }: AccountFormProps & { guest: boolean }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState<Wrong | null>(null);
  const edit = (set: (value: string) => void) => (value: string) => {
    setWrong(null);
    set(value);
  };
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (busy || !live || !username || !password) return;
    Sound.play('confirm');
    setBusy(true);
    setWrong(null);
    void onSubmit({ username, password }).then((r) => {
      if (r.ok) return;
      setBusy(false);
      setWrong({ field: 'form', text: failureText(r) });
    });
  };
  return (
    <form onSubmit={submit}>
      <div className="wrap">
        <Head title="Sign in" onBack={onBack} />
        <div className="stack sections">
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
          {guest && (
            <p className="muted">Signing in switches to that account. This guest and its stats are left behind.</p>
          )}
        </div>
      </div>
      <Foot wrong={wrong} live={live} disabled={busy || !live || !username || !password} submit="Sign in" />
    </form>
  );
}
