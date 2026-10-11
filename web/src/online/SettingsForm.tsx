import { useState } from 'react';
import type { ReactNode } from 'react';
import { Rules } from '../game';
import type { Outcome } from '../net/online';
import type { BotLevel, Format, GameSettings, Scoring } from '../protocol/generated';
import { Sound } from '../sound/sound';
import { failureText } from './copy';
import { BackIcon } from './icons';
import { MAX_SEATS, PACES } from './settings';

const LEVELS: readonly { value: BotLevel; name: string; desc: string }[] = [
  { value: 'easy', name: 'Easy', desc: 'Makes mistakes' },
  { value: 'normal', name: 'Normal', desc: 'Solid play' },
  { value: 'hard', name: 'Hard', desc: 'Counts cards' },
];
const SCORINGS: readonly { value: Scoring; name: string; desc: string }[] = [
  { value: 'classic', name: "Skull King's", desc: 'Classic, high risk' },
  { value: 'rascal', name: "Rascal's", desc: '10 per card dealt' },
];
const EXTRAS: readonly { key: 'abilities' | 'loot' | 'kraken' | 'whale'; name: string; desc: string }[] = [
  {
    key: 'abilities',
    name: 'Pirate abilities',
    desc: 'Win a trick with a Pirate to use its power: Helmsman, Smuggler, Gambler, Seer or Giant.',
  },
  { key: 'loot', name: 'Loot cards', desc: 'Win a Loot to form an alliance: +20 each if both make their bids.' },
  { key: 'kraken', name: 'Kraken', desc: 'Swallows the trick. Nobody wins it.' },
  { key: 'whale', name: 'White Whale', desc: 'Special cards stop counting; the highest number wins.' },
];
const FORMATS = Object.entries(Rules.FORMATS) as [Format, (typeof Rules.FORMATS)[Format]][];

function Choice<T extends string>(props: {
  label: string;
  value: T;
  options: readonly { value: T; name: string; desc: string }[];
  onPick: (value: T) => void;
}): ReactNode {
  return (
    <section className="stack">
      <span className="label">{props.label}</span>
      <div className="seg">
        {props.options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={props.value === o.value}
            onClick={() => props.onPick(o.value)}
          >
            {o.name}
            <small>{o.desc}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

export interface SettingsFormProps {
  title: string;
  submit: string;
  initial: GameSettings;
  /** A table that already has this many at it cannot have fewer seats. */
  minSeats: number;
  /** Shown under the form: what saving will do besides saving. */
  note?: string;
  disabled: boolean;
  onBack: () => void;
  onSubmit: (settings: GameSettings) => Promise<Outcome>;
}

/** The rules of an online table: the "New table" screen, and the host's "Table rules". */
export function SettingsForm({
  title,
  submit,
  initial,
  minSeats,
  note,
  disabled,
  onBack,
  onSubmit,
}: SettingsFormProps) {
  const [settings, setSettings] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<GameSettings>): void => {
    Sound.play('select');
    setSettings((s) => ({ ...s, ...patch }));
  };
  const seats = settings.maxPlayers;
  const most = Math.floor(Rules.buildDeck(settings).length / seats);
  const capped = Rules.FORMATS[settings.format].seq.some((c) => c > most);

  const send = (): void => {
    Sound.play('confirm');
    setBusy(true);
    setError(null);
    void onSubmit(settings).then((r) => {
      setBusy(false);
      if (!r.ok) setError(failureText(r));
    });
  };

  return (
    <>
      <div className="wrap">
        <div className="row head">
          <button
            type="button"
            className="icon-btn"
            aria-label="Back"
            onClick={() => {
              Sound.play('back');
              onBack();
            }}
          >
            <BackIcon />
          </button>
          <h2 className="grow">{title}</h2>
        </div>
        <div className="stack sections">
          <section className="stack">
            <span className="label">Seats</span>
            <div className="row seats-row">
              <span className="grow">
                Up to {seats} pirates<small>Fill open seats with friends or bots at the table.</small>
              </span>
              <span className="stepper">
                <button
                  type="button"
                  className="sbtn"
                  aria-label="Fewer seats"
                  disabled={seats <= minSeats}
                  onClick={() => set({ maxPlayers: seats - 1 })}
                >
                  −
                </button>
                <output className="num" aria-label="Seats">
                  {seats}
                </output>
                <button
                  type="button"
                  className="sbtn"
                  aria-label="More seats"
                  disabled={seats >= MAX_SEATS}
                  onClick={() => set({ maxPlayers: seats + 1 })}
                >
                  +
                </button>
              </span>
            </div>
          </section>
          <Choice
            label="Bot skill"
            value={settings.botLevel}
            options={LEVELS}
            onPick={(botLevel) => set({ botLevel })}
          />
          <Choice label="Scoring" value={settings.scoring} options={SCORINGS} onPick={(scoring) => set({ scoring })} />
          <section className="stack">
            <span className="label">Rounds</span>
            {FORMATS.map(([key, f]) => (
              <div className="seg one" key={key}>
                <button type="button" aria-pressed={settings.format === key} onClick={() => set({ format: key })}>
                  {f.name}
                  <small>{f.desc}</small>
                  <span className="fmt">
                    {f.seq.map((c, i) => (
                      <i key={i}>{c}</i>
                    ))}
                  </span>
                </button>
              </div>
            ))}
            {capped && (
              <p className="muted">
                With {seats} pirates each hand tops out at {most} cards.
              </p>
            )}
          </section>
          <Choice label="Pace" value={settings.pace} options={PACES} onPick={(pace) => set({ pace })} />
          <section className="stack">
            <span className="label">Advanced rules</span>
            {EXTRAS.map((x) => (
              <button
                key={x.key}
                type="button"
                className="toggle"
                aria-pressed={settings[x.key]}
                onClick={() => {
                  Sound.play(settings[x.key] ? 'toggleOff' : 'toggleOn');
                  setSettings((s) => ({ ...s, [x.key]: !s[x.key] }));
                }}
              >
                <span className="grow">
                  {x.name}
                  <small>{x.desc}</small>
                </span>
                <span className="switch"></span>
              </button>
            ))}
          </section>
        </div>
      </div>
      <div className="footbar">
        <div>
          {error ? (
            <p className="foot-hint alert" role="alert">
              {error}
            </p>
          ) : disabled ? (
            <p className="foot-hint" role="status">
              Not connected. Trying again…
            </p>
          ) : (
            note && <p className="foot-hint">{note}</p>
          )}
          <button type="button" className="btn" disabled={disabled || busy} onClick={send}>
            {submit}
          </button>
        </div>
      </div>
    </>
  );
}
