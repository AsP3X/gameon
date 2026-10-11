/* The record of one finished game: the action log the server stored for a seat that sat it.
   Nothing here decides what happened. It shows the steps in the order the server listed them. */
import { useEffect, useRef, useState } from 'react';
import type { ActionLog } from '../protocol/generated';
import type { Online } from '../net/online';
import { Sound } from '../sound/sound';

export interface GameRecordProps {
  online: Pick<Online, 'record'>;
  gameId: string;
  onClose: () => void;
}

/** One finished game's stored steps, or why they could not be read. */
export function GameRecord({ online, gameId, onClose }: GameRecordProps) {
  const [log, setLog] = useState<ActionLog | null>(null);
  /** Why the record could not be read, and whether asking again can help: a game the server does not have stays that way. */
  const [failure, setFailure] = useState<{ message: string; again: boolean } | null>(null);
  const [round, setRound] = useState(0);

  useEffect(() => {
    let live = true;
    void online.record(gameId).then((result) => {
      if (!live) return;
      if (result.ok) setLog(result.value);
      else setFailure({ message: result.message, again: result.code !== 'NOT_FOUND' });
    });
    return () => {
      live = false;
    };
  }, [online, gameId, round]);

  // A dialog over the end screen: it takes the keyboard while it is open, Escape closes it like
  // the table's own sheets, and the keyboard goes back to the button that opened it.
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement;
    sheet.current?.focus({ preventScroll: true });
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div
      id="record"
      ref={sheet}
      role="dialog"
      aria-modal="true"
      aria-labelledby="record-title"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="head">
        <button type="button" className="btn ghost" onClick={onClose}>
          Back to the scores
        </button>
        <span className="label" id="record-title">
          The record
        </span>
      </div>
      {failure ? (
        <>
          <p className="alert" role="alert">
            {failure.message}
          </p>
          {failure.again && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                Sound.play('tap');
                setFailure(null);
                setRound((n) => n + 1);
              }}
            >
              Try again
            </button>
          )}
        </>
      ) : !log ? (
        <p className="muted" role="status">
          Loading the record.
        </p>
      ) : log.entries.length === 0 ? (
        <p className="muted">This game has no record.</p>
      ) : (
        <ol className="stack">
          {log.entries.map((entry) => (
            <li key={entry.seq}>
              <b>
                {entry.seq} · {entry.kind}
                {entry.seat == null ? '' : ` · seat ${entry.seat}`}
              </b>
              <p className="muted">{entry.body}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
