# End-to-end: four browsers at one table

`npm run e2e` (from `web/`) runs `four-players.e2e.ts`: four browser contexts, each a guest of its
own, open and join a private table of four seats, play a whole game, reload one
page in the middle of a trick, and try to cheat. It is plan item C8.

It is not part of `npm run test`: it needs a browser and a dev server, and takes a minute or two.

## What it runs against

The page is always the real one, served by `vp dev` and talking through the dev proxy, the way it
will in production: `POST /api/v1/auth/guest` for the session cookie, then the WebSocket at
`/api/v1/ws`. Only the proxy's target changes (`SKT_API_TARGET`, read in `vite.config.ts`):

| Target                  | When                                                        | How                                                                 |
| ----------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------- |
| The Rust server         | Something answers `GET http://127.0.0.1:8080/api/v1/health` | Nothing to do: the script finds it.                                 |
| A server somewhere else | `SKT_E2E_TARGET=http://host:port npm run e2e`               | It must answer `/api/v1/health`, or the run fails.                  |
| The mock host           | Nothing answers on 8080, or `SKT_E2E_TARGET=mock`           | `mockHost.ts` puts the mock server of `src/net/mock` behind a port. |

So the day the Rust server serves guests, lobbies and the table (G3, G4, G5), the same script plays
against it with no change: start the server on 127.0.0.1:8080 and run `npm run e2e`. Until then the
absence of that server is not a failure. The first line the run prints says which target it used.

`SKT_E2E_HEADED=1` shows the browsers. `SKT_E2E_PORT=5173` pins the page's port, which is otherwise
a free one: a server that checks the `Origin` of the upgrade has to allow the page's origin.

## The browser

Playwright drives the Chrome or Edge installed on the machine. Where there is none (CI), install
Playwright's own once: `npx playwright-core install chromium`.

## Files

- `stage.ts`: picks the target, starts `vp dev` on a free port, launches the browser.
- `mockHost.ts`: the mock server with a real HTTP and WebSocket door, sessions by cookie.
- `player.ts`: one context, its page, every frame it exchanged, and the hands that click.
- `four-players.e2e.ts`: the script.
- `ranked-smoke.e2e.ts`: four accounts at one ranked table, reached over the sign-up page and the
  ranked page, and the record of the game. The mock host has no accounts: it needs the server.
- `solo.e2e.ts`: one guest starts a solo game from the setup page, reloads in the middle of a trick
  to the same hand with nothing played in between, and leaves.
- `empty-seat.e2e.ts`: three guests at a table. One stays away for two turns: the others see
  the seat marked OUT and play on, and the one who went is told once that the seat is lost.
  `SKT_E2E_SHOTS=<folder>` writes a picture of both.
- `quick-play.e2e.ts`: two guests in the casual queue, the second one four seconds late. Both are
  told the same `fillsAt`, the late page opens on what is left of the wait, the first page's rings
  run on, and when the time has come both show the bots sitting down and then the table.
- `pwa.e2e.ts`: the built page as an installed app. It builds the page, serves it with `vp preview`
  in front of the mock host, and takes both away: the page must still open and deal a game.
