import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import type { GameSettings, LobbyId } from './protocol/generated';
import { Api } from './net/api';
import type { Backend } from './net/api';
import { appBackend, appMemory, BUILD } from './net/connect';
import { Online } from './net/online';
import type { OnlineMemory, SoloOutcome } from './net/online';
import { SocketClient } from './net/socket';
import { GameOn } from './gameon/GameOn';
import { GameRecord } from './online/GameRecord';
import { OnlineScreens } from './online/OnlineScreens';
import { TableOverlay } from './online/TableOverlay';
import { AT, HUB, isFrame, isLegacy, isOnline, routeOf, settle } from './router/addresses';
import { SkullKingHome } from './skullking/Home';
import { SoloLeft, SoloSetup } from './skullking/Solo';
import { browserPlaces } from './router/places';
import type { Places } from './router/places';
import { createRouter } from './router/router';
import {
  closeOnlineTable,
  coverTavern,
  mountTavern,
  openOnlineTable,
  showOnlineResult,
  showPlace,
  startSoloOnDevice,
} from './tableview';

export interface AppProps {
  /** How the online screens reach a server. Tests hand in a mock server's browser. */
  backend?: Backend;
  /** What one page leaves on the device for the next. Tests hand in an object. */
  memory?: OnlineMemory;
  /** The browser's history, which holds the page's address. Tests hand in a list of their own. */
  places?: Places;
}

/**
 * The page: the legacy renderer and, next to it, the frame around the game and the online screens.
 * Which of the three is up, and which screen of it, is the page's address (src/router/addresses.ts).
 *
 * React renders #app and #fx once and never looks inside them: the legacy renderer owns #app (it
 * rebuilds it from HTML strings) and draws confetti on #fx. The new-game screen, the scoresheet and
 * the game table live there. The frame (GameOn: the landing, Games, signing up and in), Skull
 * King's home and the online screens are React's; an online game is played back at the renderer's
 * table, with the server on the other side of it.
 *
 * At Skull King's home the renderer is still there, under the page, for the sheets only it draws
 * (the greeting, the sound settings, the rules). The home's address is one of the renderer's own:
 * the connection is given up there, and the home asks the server who the player is over REST.
 *
 * The frame needs no connection and leaves the one there is alone: it is made at the online
 * screens and given up at the renderer's own.
 *
 * The address and the renderer follow each other. A tap in the renderer that goes to another screen
 * moves the address (`moved`). An address that changed by itself, by Back, Forward, a reload or a
 * typed address, moves the renderer (`showPlace`). An online table is the one page an address
 * cannot leave: for as long as the server says the player sits there, the page is the table.
 *
 * A page that opens on a device whose last page was seated in a lobby or at a table connects by
 * itself: that is what a reload is. What it comes back to is whatever the server's `welcome` says.
 */
export function App({ backend = appBackend, memory = appMemory, places }: AppProps) {
  const app = useRef<HTMLDivElement>(null);
  const fx = useRef<HTMLCanvasElement>(null);
  const [online] = useState(
    () => new Online(new SocketClient({ transport: backend.transport, build: BUILD }), new Api(backend.rest), memory),
  );
  const [router] = useState(() => {
    const made = createRouter(places ?? browserPlaces());
    // An address without a page of its own leads to one, and a device that was seated comes back
    // online wherever it opens: the address says so before anything is drawn.
    const at = settle(made.getPath());
    made.go(online.wasSeated && !isOnline(routeOf(at)) ? AT.online : at, { replace: true });
    return made;
  });
  const path = useSyncExternalStore(router.subscribe, router.getPath);
  const route = useMemo(() => routeOf(path), [path]);
  const state = useSyncExternalStore(online.subscribe, online.getState);
  /** The page is in its online part: connected, or trying to be. */
  const [linked, setLinked] = useState(() => online.wasSeated);
  const [record, setRecord] = useState(false);
  /** The public table the player asked to sit down at from Games. The public list does the asking. */
  const [sitting, setSitting] = useState<LobbyId | null>(null);
  /** One of the renderer's sheets is open: over the home the page draws, it is the only thing to reach. */
  const [sheet, setSheet] = useState(false);
  /** The player left a solo game: the page says so, in the table's place, until they go on. */
  const [soloLeft, setSoloLeft] = useState(false);
  const table = state.table;

  // Forward, or a typed address, can land on one that only leads somewhere.
  useEffect(() => {
    router.go(settle(path), { replace: true });
  }, [router, path]);

  useEffect(() => {
    if (!app.current || !fx.current) return;
    return mountTavern(app.current, fx.current, {
      // Skull King's home is the page's own (src/skullking). The renderer keeps its sheets there.
      pageHome: true,
      greet: routeOf(router.getPath()).page === 'home',
      dialog: setSheet,
      // The next solo game is set up on the page's own setup, which takes the end screen's place.
      soloAgain: () => router.go(AT.solo, { replace: true }),
      moved: (place) => {
        const from = routeOf(router.getPath()).page;
        // Back at the home screen is the way back, not a step further on.
        if (place === 'home') router.up(AT.home);
        else if (place === 'setup') router.go(from === 'setup' ? router.getPath() : AT.oneScreen);
        // A game that starts takes the place of the screen it was set up on: Back from a table is home.
        else if (place === 'table') router.go(AT.table, { replace: from === 'setup' || from === 'solo' });
        else router.go(AT.score);
      },
    });
  }, [router]);

  // The link follows the address: up at the online screens, given up at the renderer's own.
  // The table is on both sides, and leaves the link as it is. So does the frame.
  useEffect(() => {
    if (isOnline(route)) {
      online.open();
      setLinked(true);
    } else if (isLegacy(route) && route.page !== 'table' && linked) {
      online.close(true);
      setLinked(false);
    }
  }, [online, route, linked]);
  useEffect(() => () => online.close(), [online]);

  // The server seated this session at a table: play it where every game is played.
  useEffect(() => {
    if (!table) return;
    const solo = table.kind === 'solo';
    openOnlineTable(table, {
      leave: () => online.leaveTable(),
      exit: (to) => {
        if (!solo) return online.closeTable();
        // A solo game is nobody's lobby to go back to. One that was left says so in the table's
        // place. One that was played to its end leads to the next setup, or home.
        const left = table.hasLeft;
        if (left) flushSync(() => setSoloLeft(true));
        online.closeTable();
        if (!left) router.go(to === 'again' ? AT.solo : AT.home, { replace: true });
      },
      now: online.serverNow,
      ranked: table.mode === 'ranked',
      solo,
      result: () => table.result,
      record: () => setRecord(true),
    });
    const unlisten = table.onResult(showOnlineResult);
    return () => {
      unlisten();
      closeOnlineTable();
      setRecord(false);
    };
  }, [online, table]);

  // A seat at a table holds its address: Back does not leave it, the table's own way out does.
  // And when that table is gone, the page is back at the online screens it came from.
  // A solo game takes the place of the page it was set up on. One that was left has no hub to go to.
  useEffect(() => {
    if (table) router.go(AT.table, { replace: route.page === 'solo' });
    else if (route.page === 'table' && linked && !soloLeft) router.go(AT.online, { replace: true });
  }, [router, route, table, linked, soloLeft]);
  // What is said about a game that was left is said at the table's address, and nowhere else.
  useEffect(() => {
    if (soloLeft && route.page !== 'table') setSoloLeft(false);
  }, [soloLeft, route]);

  // The address changed by itself: the renderer shows what belongs there, or there is nothing to
  // show (no game is open or saved) and the page is at home.
  // Under the online screens the renderer is at its home screen, as it was when they first went up.
  useEffect(() => {
    if (table) return;
    if (!isLegacy(route)) showPlace('home');
    else if (!linked && !showPlace(route.page)) router.go(AT.home, { replace: true });
  }, [router, route, table, linked]);

  // The online screens are up where the address is theirs, and for the moment a closed table's
  // address still stands.
  const screens = !table && !soloLeft && (isOnline(route) || (route.page === 'table' && linked));
  // The frame's page, where the address is one of its own.
  const framed = !table && isFrame(route) ? route : null;
  // They take the renderer's place: its home screen is still there, but not to be seen.
  const covered = screens || framed != null || soloLeft;
  useEffect(() => coverTavern(covered), [covered]);
  // Skull King's home and the solo setup: the page's own, with the renderer under them for its sheets.
  const atHome = !table && !covered && route.page === 'home',
    atSolo = !table && !covered && route.page === 'solo';

  /**
   * "Start" on the solo setup. The server is asked for the game, and its table arrives as state.
   * When the server cannot be asked, or does not answer in the time an action gets, the game is
   * played on this device. A refusal is the server's word and starts nothing anywhere.
   */
  const startSolo = async (settings: GameSettings): Promise<SoloOutcome> => {
    setLinked(true);
    const answer = await online.startSolo(settings);
    // The player went somewhere else while it was asked: nothing follows them there.
    if (answer.ok || routeOf(router.getPath()).page !== 'solo') return answer;
    if (answer.code === 'ALREADY_SEATED') {
      // The seat they already have is the server's to give back: the table's address, and `welcome`.
      router.go(AT.table, { replace: true });
      return answer;
    }
    if (answer.code !== 'TIMEOUT' && answer.code !== 'OFFLINE') return answer;
    // Nothing of a server game is continued here, and nothing the server says later opens a table.
    online.close(true);
    flushSync(() => setLinked(false));
    startSoloOnDevice({
      bots: settings.maxPlayers - 1,
      level: settings.botLevel,
      scoring: settings.scoring,
      format: settings.format,
      loot: settings.loot,
      kraken: settings.kraken,
      whale: settings.whale,
      abilities: settings.abilities,
    });
    return { ok: true };
  };
  // The table is on screen and the server is not there: what it shows may be old.
  const cut = table != null && state.status !== 'online' ? state.status : null;
  // The record is a dialog over the end screen: the table underneath takes no input while it is open.
  const shown = record && table?.result != null;
  return (
    <>
      <div
        id="app"
        ref={app}
        hidden={covered}
        data-behind={atHome || atSolo ? '' : undefined}
        inert={cut != null || shown}
      ></div>
      <canvas id="fx" ref={fx} hidden></canvas>
      {cut && <TableOverlay status={cut} online={online} solo={table?.kind === 'solo'} />}
      {table && shown && <GameRecord online={online} gameId={table.gameId} onClose={() => setRecord(false)} />}
      {screens && (
        <div id="online">
          <OnlineScreens
            online={online}
            state={state}
            route={isOnline(route) ? route : HUB}
            go={router.go}
            up={router.up}
            onExit={() => router.up(AT.home)}
            sit={sitting}
            onSat={() => setSitting(null)}
          />
        </div>
      )}
      {atHome && (
        <SkullKingHome
          online={online}
          state={state}
          go={router.go}
          behind={sheet}
          onRejoin={() => {
            // The seat is the server's: the connection is made, and its `welcome` puts the table back.
            online.open();
            setLinked(true);
            router.go(AT.table);
          }}
        />
      )}
      {atSolo && (
        <SoloSetup
          online={online}
          state={state}
          go={router.go}
          behind={sheet}
          onBack={() => router.up(AT.home)}
          onStart={startSolo}
        />
      )}
      {soloLeft && (
        <SoloLeft
          me={state.me}
          onAgain={() => router.go(AT.solo, { replace: true })}
          onHome={() => router.go(AT.home, { replace: true })}
        />
      )}
      {framed && (
        <GameOn
          online={online}
          state={state}
          route={framed}
          go={router.go}
          onJoin={(id) => {
            setSitting(id);
            router.go(AT.publicTables);
          }}
        />
      )}
    </>
  );
}
