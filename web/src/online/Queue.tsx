/* Waiting for a quick-play or a ranked table. The screen shows what the server says about the queue and nothing
   else: how many it has found and how many a table needs. When the table forms the game starts by
   itself; there is nothing to accept.

   Quick play waits a fixed time before bots take the open seats, and the server says when that is
   (`fillsAt`). The page draws that wait twice: a ring that closes around every open seat, and a
   coin with the whole seconds left. Both are read off the server's clock when they are first
   drawn, so a player who arrives late sees the time that is left, and another `queue.status`
   moves the seats and never the clock. Ranked has no such time, and draws neither. */
import { useState, type CSSProperties } from 'react';
import type { Online } from '../net/online';
import { QUEUE_FILL_MS } from '../net/timing';
import type { GameSettings, QueueStatus } from '../protocol/generated';
import { Sound } from '../sound/sound';
import { useSecondsLeft } from './ahead';
import { failureText } from './copy';
import { BotIcon, CheckIcon } from './icons';
import { Head } from './parts';
import { describeSettings, MAX_SEATS } from './settings';

/** How long the queue's last picture stands once the server has started a game with bots in it. */
export const BOARDING_MS = 600;
/**
 * The server writes `fillsAt` afresh into every message, off its own clock of the moment, and two
 * of them can be a fifth of a second apart for the same wait. A time this close to the one already
 * drawn is that one: the ring and the coin are not read off the clock again for it.
 */
const SAME_WAIT_MS = 500;

type Vars = CSSProperties & Record<`--${string}`, string | number>;

/** The ring around an open seat. It is drawn where the clock is, and closes in what is left of the wait. */
function Ring({ online, fillsAt }: { online: Online; fillsAt: number }) {
  // Read once: the animation carries on by itself, and drawing the seats again must not restart it.
  const [style] = useState((): Vars => {
    const left = Math.max(0, fillsAt - online.serverNow());
    return {
      '--open': Math.min(100, (left / QUEUE_FILL_MS) * 100).toFixed(1),
      '--left': `${left}ms`,
      '--ticks': Math.max(1, Math.ceil(left / 1000)),
    };
  });
  return (
    <svg className="queue-ring" viewBox="0 0 44 44" style={style}>
      <circle className="queue-ring-track" cx="22" cy="22" r="20" />
      <circle className="queue-ring-closed" cx="22" cy="22" r="20" pathLength="100" />
    </svg>
  );
}

/** The coin under the seats: the whole seconds left. A new number flips in over the one before it. */
function Coin({ seconds, gone }: { seconds: number; gone: boolean }) {
  const [shown, setShown] = useState<{ now: number; was: number | null }>({ now: seconds, was: null });
  if (shown.now !== seconds) setShown({ now: seconds, was: shown.now });
  const flip = shown.now === seconds && shown.was != null;
  return (
    <span className={gone ? 'queue-coin gone' : 'queue-coin'} aria-hidden="true">
      <span className={flip ? 'coin flip' : 'coin'} key={seconds}>
        {flip && <span className="was">{shown.was}</span>}
        <span className="now">{seconds}</span>
      </span>
    </span>
  );
}

const count = (n: number, one: string): string => `${n} ${n === 1 ? one : `${one}s`}`;

export interface QueueScreenProps {
  online: Online;
  queue: QueueStatus;
  live: boolean;
  /** The quick-play rules, once the server has said what they are. */
  rules: GameSettings | null;
  /**
   * The table the server made of this queue, seat by seat: whether a bot sits there. The queue is
   * over then, and this is its last picture.
   */
  boarded?: readonly boolean[];
}

export function QueueScreen({ online, queue, live, rules, boarded }: QueueScreenProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A table has at most eight seats: no number from the wire draws more than that.
  const seats = Math.max(0, Math.min(MAX_SEATS, queue.needed)),
    found = Math.max(0, Math.min(seats, queue.found)),
    ranked = queue.mode === 'ranked',
    text = rules ? describeSettings(rules, { bots: !ranked }) : null;
  // The seats that were taken when the screen went up are simply there. One that fills later pops.
  const [first] = useState(found);
  // The wait is drawn for quick play, while the server is heard and has said when the bots come.
  const named = ranked ? null : (queue.fillsAt ?? null);
  const [wait, setWait] = useState(named);
  if (named == null ? wait != null : wait == null || Math.abs(named - wait) > SAME_WAIT_MS) setWait(named);
  const timed = wait != null,
    fillsAt = live && !boarded ? wait : null,
    seconds = useSecondsLeft(online, fillsAt ?? 0);
  const sat = boarded?.slice(0, MAX_SEATS),
    bots = sat?.filter(Boolean).length ?? 0;
  const leave = (): void => {
    if (busy || boarded) return;
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
              {sat
                ? sat.map((bot, i) =>
                    bot ? (
                      <span
                        className="queue-seat bot"
                        key={i}
                        style={{ '--nth': sat.slice(0, i).filter(Boolean).length } as Vars}
                      >
                        <BotIcon />
                      </span>
                    ) : (
                      <span className="queue-seat found" key={i}>
                        <CheckIcon />
                      </span>
                    ),
                  )
                : Array.from({ length: seats }, (_, i) =>
                    i < found ? (
                      <span className={i < first ? 'queue-seat found' : 'queue-seat found pop'} key={i}>
                        <CheckIcon />
                      </span>
                    ) : fillsAt != null ? (
                      <span className="queue-seat timed" key={i}>
                        <Ring online={online} fillsAt={fillsAt} key={fillsAt} />?
                      </span>
                    ) : (
                      <span className="queue-seat" key={i}>
                        ?
                      </span>
                    ),
                  )}
            </div>
            {(fillsAt != null || (sat && timed)) && (
              <Coin seconds={sat ? 0 : Math.min(seconds, QUEUE_FILL_MS / 1000)} gone={sat != null} />
            )}
            <h3>
              {sat ? 'All aboard!' : fillsAt != null && seconds === 0 ? 'Setting the table…' : 'Looking for pirates…'}
            </h3>
            <p className="muted" role="status">
              {sat
                ? `${count(sat.length - bots, 'pirate')}, ${count(bots, 'bot')}`
                : `${queue.found} of ${queue.needed} found`}
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
              : fillsAt != null || (sat && timed)
                ? 'Bots take the open seats when the ring closes. With four pirates the game starts at once.'
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
            disabled={!live || busy || boarded != null}
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
