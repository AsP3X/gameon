/* Waiting for a quick-play or a ranked table. The screen shows what the server says about the queue and nothing
   else: how many it has found and how many a table needs. When the table forms the game starts by
   itself; there is nothing to accept. */
import { useState } from 'react';
import type { Online } from '../net/online';
import type { GameSettings, QueueStatus } from '../protocol/generated';
import { Sound } from '../sound/sound';
import { failureText } from './copy';
import { CheckIcon } from './icons';
import { Head } from './parts';
import { describeSettings, MAX_SEATS } from './settings';

export interface QueueScreenProps {
  online: Online;
  queue: QueueStatus;
  live: boolean;
  /** The quick-play rules, once the server has said what they are. */
  rules: GameSettings | null;
}

export function QueueScreen({ online, queue, live, rules }: QueueScreenProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A table has at most eight seats: no number from the wire draws more than that.
  const seats = Math.max(0, Math.min(MAX_SEATS, queue.needed)),
    found = Math.max(0, Math.min(seats, queue.found)),
    ranked = queue.mode === 'ranked',
    text = rules ? describeSettings(rules, { bots: !ranked }) : null;
  const leave = (): void => {
    if (busy) return;
    setBusy(true);
    setError(null);
    void online.leaveQueue().then((r) => {
      setBusy(false);
      if (!r.ok) setError(failureText(r));
    });
  };
  return (
    <>
      <div className="wrap">
        <Head title={ranked ? 'Ranked' : 'Quick play'} back="Leave the queue" onBack={leave} />
        <div className="stack sections">
          {!live && (
            <div className="notice" role="status">
              <b>Connection lost</b>
              <p>Trying again. If your place is gone, you can look for a game again.</p>
            </div>
          )}
          <div className="searching">
            <div className="queue-seats" aria-hidden="true">
              {Array.from({ length: seats }, (_, i) =>
                i < found ? (
                  <span className="queue-seat found" key={i}>
                    <CheckIcon />
                  </span>
                ) : (
                  <span className="queue-seat" key={i}>
                    ?
                  </span>
                ),
              )}
            </div>
            <h3>Looking for pirates…</h3>
            <p className="muted" role="status">
              {queue.found} of {queue.needed} found
            </p>
          </div>
          {text && (
            <section className="stack" aria-label="Rules">
              <span className="label">Rules</span>
              <div className="plate">
                <span className="grow">
                  <b>{text.title}</b>
                  <small>{text.detail}</small>
                </span>
              </div>
            </section>
          )}
          <p className="muted">
            {ranked
              ? 'The game starts by itself when the table is full. A ranked table has no bots. Leaving a ranked game, losing your seat, or staying away for most of it scores last place and starts a cooldown.'
              : 'The game starts by itself when the table is full. Open seats are filled with bots.'}
          </p>
        </div>
      </div>
      <div className="footbar">
        <div>
          {error && (
            <p className="foot-hint alert" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            className="btn ghost"
            disabled={!live || busy}
            onClick={() => {
              Sound.play('back');
              leave();
            }}
          >
            Leave the queue
          </button>
        </div>
      </div>
    </>
  );
}
