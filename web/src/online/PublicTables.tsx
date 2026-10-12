/* The public tables: the open lobbies anyone may sit down at (`GET /lobbies`). The list is what the
   server said when it was asked; nothing pushes changes to it, so it is asked again on Refresh and
   after a table turned out to be full, started or gone. */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Online } from '../net/online';
import type { LobbyId, LobbySummary } from '../protocol/generated';
import { Sound } from '../sound/sound';
import { failureText } from './copy';
import { Head } from './parts';
import { describeTable } from './settings';

type List = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; lobbies: LobbySummary[] };

export interface PublicTablesProps {
  online: Online;
  live: boolean;
  onBack: () => void;
  /** To the "New table" screen, set to public. */
  onCreate: () => void;
  /** A table the player asked to sit down at before this list was up. It is asked for once connected. */
  sit?: LobbyId | null;
  /** That table has been asked for: it is not asked for again. */
  onSat?: () => void;
}

export function PublicTables({ online, live, onBack, onCreate, sit = null, onSat }: PublicTablesProps) {
  const [list, setList] = useState<List>({ state: 'loading' });
  const [round, setRound] = useState(0);
  const [joining, setJoining] = useState<LobbyId | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!live) return;
    let stale = false;
    void online.publicLobbies().then((r) => {
      if (!stale) setList(r.ok ? { state: 'ready', lobbies: r.value } : { state: 'failed' });
    });
    return () => {
      stale = true;
    };
  }, [online, live, round]);

  const refresh = (): void => {
    Sound.play('tap');
    setError(null);
    setList({ state: 'loading' });
    setRound((n) => n + 1);
  };
  const join = useCallback(
    (id: LobbyId): void => {
      Sound.play('confirm');
      setJoining(id);
      setError(null);
      void online.joinPublicLobby(id).then((r) => {
        setJoining(null);
        if (r.ok) return;
        // By id there is no code to check: a table that cannot be found has closed since the list was read.
        setError(r.code === 'LOBBY_NOT_FOUND' ? 'That table is gone.' : failureText(r));
        // The list was wrong about that table, so it is read again; the row stays until the answer is in.
        if (r.code === 'LOBBY_NOT_FOUND' || r.code === 'LOBBY_FULL' || r.code === 'LOBBY_STARTED')
          setRound((n) => n + 1);
      });
    },
    [online],
  );
  /** The table that was asked for on the player's behalf: once, however often the effect runs. */
  const sat = useRef<LobbyId | null>(null);

  // Asked from Games, which has no connection: the answer, a seat or why not, is shown here.
  useEffect(() => {
    if (!live || sit == null || sat.current === sit) return;
    sat.current = sit;
    onSat?.();
    join(sit);
  }, [live, sit, onSat, join]);

  return (
    <>
      <div className="wrap">
        <Head title="Public tables" onBack={onBack}>
          <button type="button" className="mini" disabled={!live || list.state === 'loading'} onClick={refresh}>
            Refresh
          </button>
        </Head>
        <div className="stack">
          {list.state === 'loading' ? (
            <div className="notice" role="status">
              <b>Looking for tables…</b>
              <p>One moment.</p>
            </div>
          ) : list.state === 'failed' ? (
            <div className="notice" role="alert">
              <b>Couldn't load the tables</b>
              <p>Check your connection and try again.</p>
              <button type="button" className="btn ghost" disabled={!live} onClick={refresh}>
                Try again
              </button>
            </div>
          ) : list.lobbies.length === 0 ? (
            <div className="notice" role="status">
              <b>No public tables right now</b>
              <p>Create one and open it to everyone, or try quick play.</p>
            </div>
          ) : (
            <ul className="stack tables" aria-label="Public tables">
              {list.lobbies.map((lobby, i) => {
                const text = describeTable(lobby.settings, lobby.players),
                  full = lobby.players >= lobby.settings.maxPlayers;
                return (
                  <li className="plate" key={lobby.id}>
                    <span className="grow">
                      <b id={`table-host-${i}`}>{lobby.hostName}</b>
                      <small>{text.seats}</small>
                      <small>{text.rules}</small>
                    </span>
                    {full ? (
                      <span className="pill soft">Full</span>
                    ) : (
                      <button
                        type="button"
                        className="mini"
                        aria-describedby={`table-host-${i}`}
                        disabled={!live || joining != null}
                        onClick={() => join(lobby.id)}
                      >
                        Join
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      <div className="footbar">
        <div>
          {error ? (
            <p className="foot-hint alert" role="alert">
              {error}
            </p>
          ) : (
            !live && (
              <p className="foot-hint" role="status">
                Not connected. Trying again…
              </p>
            )
          )}
          <button
            type="button"
            className="btn ghost"
            disabled={!live}
            onClick={() => {
              Sound.play('tap');
              onCreate();
            }}
          >
            Create a public table
          </button>
        </div>
      </div>
    </>
  );
}
