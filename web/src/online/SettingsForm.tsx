/* The rules of a table, as design/skt.pen draws them (`Friends · new game`, `Public · new game`):
   the same cards the solo setup has, and for a new table the switch that says whether it seats
   bots. A table of friends and a public table are the same form with other words.

   There is no control for the seats or the pace. A new table is sent with the fixed ones (`FIXED`),
   and a table whose rules are changed keeps the ones it has. Your table also picks the bots' skill,
   with the solo setup's three buttons: one skill for every bot. */
import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Go } from '../gameon/Frame';
import { Rules } from '../game';
import type { Outcome } from '../net/online';
import type { GameSettings, Me, Visibility } from '../protocol/generated';
import { EXTRAS, FORMATS, LEVELS, SCORINGS } from '../skullking/rulesets';
import { Sound } from '../sound/sound';
import { failureText } from './copy';
import { Bar, Page } from './parts';

/** What a new table is, in the words of its page. */
const NEW: Record<Visibility, { title: string; pill: string; intro: string; submit: string; hint: string }> = {
  private: {
    title: 'Your table',
    pill: 'Private',
    intro: 'Friends only, with a code. You pick the rules.',
    submit: 'Open table',
    hint: 'You start the table once two seats are taken and everyone is ready. A bot can take a seat.',
  },
  public: {
    title: 'Public table',
    pill: 'Public',
    intro: 'Anyone can see the table. You pick the rules.',
    submit: 'List table',
    hint: 'A public table can start once a second pirate sits down.',
  },
};

export interface SettingsFormProps {
  go: Go;
  me: Me | null;
  /**
   * The table to open: with a code only, or listed for everyone. Without it the form changes the
   * rules of a table that is already open, and asks neither who can join nor about bots: no
   * message changes those afterwards.
   */
  visibility?: Visibility;
  initial: GameSettings;
  /**
   * The form offers the bots' skill: Your table, and the rules of a private table that seats bots.
   * On a new table it is hidden while Seat bots is off, and the last choice is still sent.
   */
  skill: boolean;
  disabled: boolean;
  onBack: () => void;
  /** `seatBots` is the switch of a new table. It is true where the form does not ask. */
  onSubmit: (settings: GameSettings, seatBots: boolean) => Promise<Outcome>;
}

export function SettingsForm({ go, me, visibility, initial, skill, disabled, onBack, onSubmit }: SettingsFormProps) {
  const [settings, setSettings] = useState(initial);
  const [seatBots, setSeatBots] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const words = visibility ? NEW[visibility] : null;
  const set = (patch: Partial<GameSettings>): void => {
    Sound.play('select');
    setError(null);
    setSettings((s) => ({ ...s, ...patch }));
  };
  const send = (e: FormEvent): void => {
    e.preventDefault();
    if (busy || disabled) return;
    Sound.play('confirm');
    setBusy(true);
    setError(null);
    void onSubmit(settings, seatBots).then((r) => {
      setBusy(false);
      if (!r.ok) setError(failureText(r));
    });
  };

  return (
    <Page go={go}>
      <Bar title={words?.title ?? 'Table rules'} onBack={onBack} me={me} />
      <form className={words ? 'on-body wide on-grid on-setup' : 'on-body wide on-grid on-setup rules'} onSubmit={send}>
        {words && (
          <div className="on-intro">
            <span className="pill blue">{words.pill}</span>
            <p>{words.intro}</p>
          </div>
        )}
        {(words || skill) && (
          <section className="on-bots" aria-labelledby={words ? 'on-bots' : 'on-level'}>
            {words && (
              <>
                <h2 className="label" id="on-bots">
                  Bots
                </h2>
                <button
                  type="button"
                  className="toggle"
                  aria-pressed={seatBots}
                  onClick={() => {
                    Sound.play(seatBots ? 'toggleOff' : 'toggleOn');
                    setSeatBots(!seatBots);
                  }}
                >
                  <span className="grow">Seat bots</span>
                  <span className="switch"></span>
                </button>
              </>
            )}
            {skill && seatBots && (
              <div className="on-level">
                <h2 className="label" id="on-level">
                  Bot skill
                </h2>
                <div className="seg" role="group" aria-labelledby="on-level">
                  {LEVELS.map(([botLevel, name, note]) => (
                    <button
                      key={botLevel}
                      type="button"
                      aria-pressed={settings.botLevel === botLevel}
                      onClick={() => set({ botLevel })}
                    >
                      {name}
                      <small>{note}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
        <section className="sk-rounds" aria-labelledby="on-format">
          <h2 className="label" id="on-format">
            Rounds
          </h2>
          <div className="seg sk-formats" role="group" aria-labelledby="on-format">
            {FORMATS.map(([format, name]) => {
              const rounds = Rules.FORMATS[format].seq;
              return (
                <button
                  key={format}
                  type="button"
                  aria-pressed={settings.format === format}
                  onClick={() => set({ format })}
                >
                  {name}
                  <small>{rounds.length} rounds</small>
                  <span className="fmt" aria-hidden="true">
                    {rounds.map((cards, i) => (
                      <i key={i}>{cards}</i>
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
        <section className="on-scoring" aria-labelledby="on-scoring">
          <h2 className="label" id="on-scoring">
            Scoring
          </h2>
          <div className="seg" role="group" aria-labelledby="on-scoring">
            {SCORINGS.map(([scoring, name, note]) => (
              <button
                key={scoring}
                type="button"
                aria-pressed={settings.scoring === scoring}
                onClick={() => set({ scoring })}
              >
                {name}
                <small>{note}</small>
              </button>
            ))}
          </div>
        </section>
        <section className="sk-extras" aria-labelledby="on-extras">
          <h2 className="label" id="on-extras">
            Advanced
          </h2>
          <div className="sk-extras-list">
            {EXTRAS.map(([key, name, note]) => (
              <button
                key={key}
                type="button"
                className="toggle"
                aria-pressed={settings[key]}
                onClick={() => {
                  Sound.play(settings[key] ? 'toggleOff' : 'toggleOn');
                  setError(null);
                  setSettings((s) => ({ ...s, [key]: !s[key] }));
                }}
              >
                <span className="grow">
                  {name}
                  <small>{note}</small>
                </span>
                <span className="switch"></span>
              </button>
            ))}
          </div>
        </section>
        <div className="sk-start">
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn" disabled={disabled || busy} aria-busy={busy}>
            {words?.submit ?? 'Save rules'}
          </button>
          <div className="sk-hints">
            {disabled ? (
              <p role="status">Not connected. Trying again…</p>
            ) : (
              <p>{words?.hint ?? "Saving new rules clears everyone's ready."}</p>
            )}
          </div>
        </div>
      </form>
    </Page>
  );
}
