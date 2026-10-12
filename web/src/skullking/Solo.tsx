/* Solo, the player alone against bots, as design/skt.pen draws it (plan item W3): the page a solo
   game is set up on, and what is said after one was left. The game itself is played at the
   renderer's table, as every game is.

   The page decides nothing about the game. "Start" hands the settings to whoever starts it: the
   server is asked (`solo.start`), and only when the server cannot be asked is the game played on
   this device. What the server refuses is said as the server said it. */
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Rules } from '../game';
import { GoContext } from '../gameon/Frame';
import type { Go, Who } from '../gameon/Frame';
import { useWho } from '../gameon/who';
import type { Online, OnlineState, SoloOutcome } from '../net/online';
import { failureText } from '../online/copy';
import { BackIcon, CloseIcon } from '../online/icons';
import { initialOf } from '../online/parts';
import type { BotLevel, Format, GameSettings, Me, Scoring } from '../protocol/generated';
import { Sound } from '../sound/sound';
import { cssColor } from '../tableview/dom';
import { COLORS, prefs } from '../tableview/state';
import { Store } from '../tableview/store';
import { LegacyIcon, Player } from './parts';
import { EXTRAS, FORMATS, isFormat, isScoring, SCORINGS } from './rulesets';

/** The fewest and the most bots a solo table has: the whole table is that many and the player. */
export const MIN_BOTS = 1;
export const MAX_BOTS = 7;

const LEVELS: [BotLevel, string, string][] = [
  ['easy', 'Easy', 'Makes mistakes'],
  ['normal', 'Normal', 'Solid play'],
  ['hard', 'Hard', 'Counts cards'],
];
/** What the setup is set to. */
export interface SoloChoice {
  bots: number;
  level: BotLevel;
  scoring: Scoring;
  format: Format;
  loot: boolean;
  kraken: boolean;
  whale: boolean;
  abilities: boolean;
}
const DEFAULT: SoloChoice = {
  bots: 3,
  level: 'normal',
  scoring: 'classic',
  format: 'classic',
  loot: false,
  kraken: false,
  whale: false,
  abilities: false,
};
/** Where the last setup is kept on this device: a convenience, and nothing a game depends on. */
const KEY = 'skullking-tavern.solo.v1';

const isLevel = (x: unknown): x is BotLevel => LEVELS.some(([level]) => level === x);

/** The last setup of this device, as far as it can still be read. Whatever cannot is the default. */
export function loadChoice(): SoloChoice {
  const kept: Partial<Record<keyof SoloChoice, unknown>> = Store.get(KEY) ?? {};
  const bots = typeof kept.bots === 'number' && Number.isInteger(kept.bots) ? kept.bots : DEFAULT.bots;
  return {
    bots: Math.min(MAX_BOTS, Math.max(MIN_BOTS, bots)),
    level: isLevel(kept.level) ? kept.level : DEFAULT.level,
    scoring: isScoring(kept.scoring) ? kept.scoring : DEFAULT.scoring,
    format: isFormat(kept.format) ? kept.format : DEFAULT.format,
    loot: kept.loot === true,
    kraken: kept.kraken === true,
    whale: kept.whale === true,
    abilities: kept.abilities === true,
  };
}

/**
 * The settings a solo game is asked for with. The table is the player and their bots. A solo game
 * has no clock, so there is no pace to choose: the field is sent as `standard`, which is what the
 * server keeps whatever it is sent.
 */
export const settingsOf = (choice: SoloChoice): GameSettings => ({
  maxPlayers: choice.bots + 1,
  scoring: choice.scoring,
  format: choice.format,
  abilities: choice.abilities,
  botLevel: choice.level,
  pace: 'standard',
  loot: choice.loot,
  kraken: choice.kraken,
  whale: choice.whale,
});

export interface SoloSetupProps {
  online: Online;
  state: OnlineState;
  go: Go;
  /** One of the renderer's sheets is open over the page: what is behind it takes no input. */
  behind: boolean;
  /** Back to Skull King's home. */
  onBack: () => void;
  /** Start the game. It resolves when the server has answered, or when the device has taken over. */
  onStart: (settings: GameSettings) => Promise<SoloOutcome>;
}

export function SoloSetup({ online, state, go, behind, onBack, onStart }: SoloSetupProps) {
  // Looking at the setup makes nobody: a browser without a session gets its guest when it connects to start.
  const who: Who = useWho(online, state.me, false);
  const [choice, setChoice] = useState(loadChoice);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const me = who.is === 'player' ? who.me : null;

  useEffect(() => {
    const before = document.title;
    document.title = 'Solo game · Skull King';
    title.current?.focus({ preventScroll: true });
    document.scrollingElement?.scrollTo?.(0, 0);
    return () => {
      document.title = before;
    };
  }, []);

  const pick = (change: Partial<SoloChoice>): void => {
    Sound.play('select');
    setRefused(null);
    setChoice((was) => ({ ...was, ...change }));
  };
  const start = (e: FormEvent): void => {
    e.preventDefault();
    if (busy) return;
    Sound.play('start');
    Store.set(KEY, choice);
    setBusy(true);
    setRefused(null);
    void onStart(settingsOf(choice)).then((answer) => {
      // An accepted start, or a device game, takes this page away. A refusal leaves it to say why.
      if (answer.ok) return;
      setBusy(false);
      // No answer in time is a server that cannot be reached, said in the same words.
      setRefused(failureText({ ...answer, code: answer.code === 'TIMEOUT' ? 'OFFLINE' : answer.code }));
    });
  };

  return (
    <GoContext value={go}>
      <form id="gameon" className="sk-solo" inert={behind} onSubmit={start}>
        <header className="sk-bar">
          <div className="sk-solo-head">
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
            <h1 tabIndex={-1} ref={title}>
              Solo game
            </h1>
          </div>
          <div className="sk-bar-right wide-only">
            <button type="button" className="icon-btn" data-act="soundSheet" aria-label="Sound settings">
              <LegacyIcon icon={prefs.muted ? 'mute' : 'sound'} />
            </button>
            {me && <Player me={me} />}
          </div>
        </header>
        <main className="sk-solo-body">
          <section aria-labelledby="sk-bots">
            <h2 className="label" id="sk-bots">
              Bots
            </h2>
            <div className="sk-bots" role="group" aria-labelledby="sk-bots">
              {Array.from({ length: MAX_BOTS - MIN_BOTS + 1 }, (_, i) => MIN_BOTS + i).map((n) => (
                <button
                  key={n}
                  type="button"
                  className="chip"
                  aria-pressed={choice.bots === n}
                  aria-label={`${n} ${n === 1 ? 'bot' : 'bots'}`}
                  onClick={() => pick({ bots: n })}
                >
                  {n}
                </button>
              ))}
            </div>
          </section>
          <section aria-labelledby="sk-level">
            <h2 className="label" id="sk-level">
              Bot skill
            </h2>
            <div className="seg" role="group" aria-labelledby="sk-level">
              {LEVELS.map(([level, name, note]) => (
                <button key={level} type="button" aria-pressed={choice.level === level} onClick={() => pick({ level })}>
                  {name}
                  <small>{note}</small>
                </button>
              ))}
            </div>
          </section>
          <section aria-labelledby="sk-scoring">
            <h2 className="label" id="sk-scoring">
              Scoring
            </h2>
            <div className="seg" role="group" aria-labelledby="sk-scoring">
              {SCORINGS.map(([scoring, name, note]) => (
                <button
                  key={scoring}
                  type="button"
                  aria-pressed={choice.scoring === scoring}
                  onClick={() => pick({ scoring })}
                >
                  {name}
                  <small>{note}</small>
                </button>
              ))}
            </div>
          </section>
          <section className="sk-rounds" aria-labelledby="sk-format">
            <h2 className="label" id="sk-format">
              Rounds
            </h2>
            <div className="seg sk-formats" role="group" aria-labelledby="sk-format">
              {FORMATS.map(([format, name]) => {
                const rounds = Rules.FORMATS[format].seq;
                return (
                  <button
                    key={format}
                    type="button"
                    aria-pressed={choice.format === format}
                    onClick={() => pick({ format })}
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
          <section className="sk-extras" aria-labelledby="sk-extras">
            <h2 className="label" id="sk-extras">
              Advanced
            </h2>
            <div className="sk-extras-list">
              {EXTRAS.map(([key, name, note]) => (
                <button
                  key={key}
                  type="button"
                  className="toggle"
                  aria-pressed={choice[key]}
                  onClick={() => pick({ [key]: !choice[key] })}
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
            {refused && (
              <p className="alert" role="alert">
                {refused}
              </p>
            )}
            <button type="submit" className="btn" disabled={busy} aria-busy={busy}>
              Start
            </button>
            <div className="sk-hints">
              <p>No clock. Bots play up to your turn and wait.</p>
              <p>One game at a time. It stays until you finish it or you leave it. Leaving it does not count.</p>
              <p>
                Saved to your account, so you can pick the game up on any device. Offline, it runs on this device and is
                not counted in your stats.
              </p>
            </div>
          </div>
        </main>
      </form>
    </GoContext>
  );
}

/** In the table's place after a solo game was left: it is gone, and it did not count. */
export function SoloLeft({ me, onAgain, onHome }: { me: Me | null; onAgain: () => void; onHome: () => void }) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div id="gameon" className="sk-left">
      <div className="sk-left-top">
        <button
          type="button"
          className="icon-btn"
          aria-label="Home"
          onClick={() => {
            Sound.play('back');
            onHome();
          }}
        >
          <CloseIcon />
        </button>
      </div>
      <div className="sk-left-mid">
        <span className="avatar lg" style={{ background: cssColor(me?.user.color ?? COLORS[0]) }} aria-hidden="true">
          {me ? initialOf(me.user.name) : 'Y'}
        </span>
        <h1 tabIndex={-1} ref={title}>
          You left this game.
        </h1>
        <p>It was not counted.</p>
      </div>
      <div className="sk-left-actions">
        <button
          type="button"
          className="btn"
          onClick={() => {
            Sound.play('start');
            onAgain();
          }}
        >
          Play again
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            Sound.play('tap');
            onHome();
          }}
        >
          Home
        </button>
      </div>
    </div>
  );
}
