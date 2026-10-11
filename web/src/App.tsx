import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Api } from './net/api';
import type { Backend } from './net/api';
import { appBackend, BUILD } from './net/connect';
import { Online } from './net/online';
import { SocketClient } from './net/socket';
import { OnlineScreens } from './online/OnlineScreens';
import { closeOnlineTable, mountTavern, openOnlineTable, showOnlineResult } from './tableview';

export interface AppProps {
  /** How the online screens reach a server. Tests hand in a mock server's browser. */
  backend?: Backend;
}

/**
 * The page: the legacy renderer and, next to it, the online screens.
 *
 * React renders #app and #fx once and never looks inside them: the legacy renderer owns #app (it
 * rebuilds it from HTML strings) and draws confetti on #fx. Home, the offline modes and the game
 * table live there. "Play online" hands over to the online screens, which are React's; an online
 * game is played back at the renderer's table, with the server on the other side of it.
 */
export function App({ backend = appBackend }: AppProps) {
  const app = useRef<HTMLDivElement>(null);
  const fx = useRef<HTMLCanvasElement>(null);
  const [online] = useState(
    () => new Online(new SocketClient({ transport: backend.transport, build: BUILD }), new Api(backend.rest)),
  );
  const state = useSyncExternalStore(online.subscribe, online.getState);
  const [inOnline, setInOnline] = useState(false);
  const table = state.table;

  useEffect(() => {
    if (!app.current || !fx.current) return;
    return mountTavern(app.current, fx.current, {
      online: () => {
        online.open();
        setInOnline(true);
      },
    });
  }, [online]);

  // The server seated this session at a table: play it where every game is played.
  useEffect(() => {
    if (!table) return;
    openOnlineTable(table, {
      leave: () => online.leaveTable(),
      exit: () => online.closeTable(),
      ranked: table.mode === 'ranked',
      rating: () => table.result?.rating ?? null,
    });
    const unlisten = table.onResult(showOnlineResult);
    return () => {
      unlisten();
      closeOnlineTable();
    };
  }, [online, table]);

  useEffect(() => () => online.close(), [online]);

  const screens = inOnline && !table;
  return (
    <>
      <div id="app" ref={app} hidden={screens}></div>
      <canvas id="fx" ref={fx} hidden></canvas>
      {screens && (
        <div id="online">
          <OnlineScreens
            online={online}
            state={state}
            onExit={() => {
              online.close();
              setInOnline(false);
            }}
          />
        </div>
      )}
    </>
  );
}
