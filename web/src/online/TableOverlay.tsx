import { useEffect, useRef } from 'react';
import type { Online } from '../net/online';
import type { LinkStatus } from '../net/socket';
import { Sound } from '../sound/sound';
import { reloadPage } from './reload';

const COPY: Record<Exclude<LinkStatus, 'online'>, { title: string; text: string; action: string }> = {
  idle: { title: 'Connection lost', text: '', action: 'Try now' },
  connecting: { title: 'Connection lost', text: '', action: 'Try now' },
  offline: {
    title: 'Connection lost',
    text: 'Getting you back to the table. The table plays for you when your time runs out. Miss two turns in a row and you lose your seat.',
    action: 'Try now',
  },
  superseded: {
    title: 'Playing in another tab',
    text: 'This player is connected from another tab or device. Only one can play at a time.',
    action: 'Play here',
  },
  unsupported: {
    title: 'The tavern has moved on',
    text: 'This page is older than the server. Reload to update.',
    action: 'Reload to update',
  },
};

/**
 * Over the table while the server cannot be heard: what is on the table underneath may be old, so
 * it takes no input until the next `welcome` has replaced it.
 */
export function TableOverlay({ status, online }: { status: Exclude<LinkStatus, 'online'>; online: Online }) {
  const copy = COPY[status],
    text = copy.text || COPY.offline.text,
    reload = status === 'unsupported';
  // The table underneath is inert: the keyboard has to be on the one thing that can be done.
  const action = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    action.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div
      className="table-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="overlay-title"
      aria-describedby="overlay-text"
    >
      <div className="box">
        <h2 id="overlay-title">{copy.title}</h2>
        <p id="overlay-text">{text}</p>
        <button
          type="button"
          ref={action}
          className={reload ? 'btn' : 'btn ghost'}
          onClick={() => {
            Sound.play('tap');
            if (reload) reloadPage();
            else online.retry();
          }}
        >
          {copy.action}
        </button>
      </div>
    </div>
  );
}
