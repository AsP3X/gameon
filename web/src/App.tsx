import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Api } from './net/api';
import type { Backend } from './net/api';
import { appBackend, appMemory, BUILD } from './net/connect';
import { Online } from './net/online';
import type { OnlineMemory } from './net/online';
import { SocketClient } from './net/socket';
import { OnlineScreens } from './online/OnlineScreens';
import { TableOverlay } from './online/TableOverlay';
import { closeOnlineTable, mountTavern, openOnlineTable } from './tableview';

export interface AppProps {
  /** How the online screens reach a server. Tests hand in a mock server's browser. */
  backend?: Backend;
  /** What one page leaves on the device for the next. Tests hand in an object. */
  memory?: OnlineMemory;
}

/**
 * The page: the legacy renderer and, next to it, the online screens.
 *
 * React renders #app and #fx once and never looks inside them: the legacy renderer owns #app (it
 * rebuilds it from HTML strings) and draws confetti on #fx. Home, the offline modes and the game
 * table live there. "Play online" hands over to the online screens, which are React's; an online
 * game is played back at the renderer's table, with the server on the other side of it.
 *
 * A page that opens on a device whose last page was seated in a lobby or at a table connects by
 * itself: that is what a reload is. What it comes back to is whatever the server's `welcome` says.
 */
export function App({ backend = appBackend, memory = appMemory }: AppProps) {
  const app = useRef<HTMLDivElement>(null);
  const fx = useRef<HTMLCanvasElement>(null);
  const [online] = useState(
    () => new Online(new SocketClient({ transport: backend.transport, build: BUILD }), new Api(backend.rest), memory),
  );
  const state = useSyncExternalStore(online.subscribe, online.getState);
  const [inOnline, setInOnline] = useState(() => online.wasSeated);
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
      now: online.serverNow,
    });
    return closeOnlineTable;
  }, [online, table]);

  useEffect(() => {
    if (online.wasSeated) online.open();
    return () => online.close();
  }, [online]);

  const screens = inOnline && !table;
  // The table is on screen and the server is not there: what it shows may be old.
  const cut = table != null && state.status !== 'online' ? state.status : null;
  return (
    <>
      <div id="app" ref={app} hidden={screens} inert={cut != null}></div>
      <canvas id="fx" ref={fx} hidden></canvas>
      {cut && <TableOverlay status={cut} online={online} />}
      {screens && (
        <div id="online">
          <OnlineScreens
            online={online}
            state={state}
            onExit={() => {
              online.close(true);
              setInOnline(false);
            }}
          />
        </div>
      )}
    </>
  );
}
