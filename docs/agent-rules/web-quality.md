# Web quality

**Applies to:** everything under `web/`.

## Toolchain

- Vite+ (`vp`) is the toolchain: `vp dev`, `vp check` (format, lint, types), `vp test`, `vp build`.
  Tool configuration lives in `vite.config.ts`; no separate ESLint, Prettier or Vitest config files.
- TypeScript is strict (`strict`, `noUnusedLocals`, `noUnusedParameters`,
  `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`). No `any`, no `@ts-ignore`, no
  non-null `!` to quiet the compiler; narrow the type instead.
- React 19 for the app shell and every new screen. The game table is the legacy renderer mounted as
  one component; it is ported piece by piece, never rewritten in one go.

## The client is a renderer

- Online, the client shows the view the server sent and sends intents
  ([server authority](server-authority.md)). It never computes an outcome the server then trusts.
- The reference engine in `web/src/game/` serves the offline modes (solo, pass-and-play, the
  scorekeeper) and generates `fixtures/engine/`. Online code never runs it to "predict" a result.
- Wire types come from `web/src/protocol/generated/`. Don't redeclare them by hand and don't edit
  the generated files ([protocol](protocol-contract.md)).

## Untrusted strings

Player names, lobby names and anything else another player typed are hostile input. In React they
render as text. In the legacy table renderer, which builds HTML strings, every one of them goes
through `esc()` — no exception, including toasts, banners, `title` and `aria-label` attributes.
Never build a URL, a style or an attribute from a remote string.

## Network

- Same origin only: REST under `/api/v1`, the socket at `/api/v1/ws`, both through the dev proxy.
  No third-party requests at runtime — fonts are bundled, not loaded from a CDN.
- The session lives in an HttpOnly cookie the page cannot read. Never put a token in
  `localStorage`, a URL or a log.
- Every screen that depends on the server has loading, empty, error and disconnected states.
  A dropped socket reconnects with backoff and resumes from the server's snapshot.

## Storage

`localStorage` holds per-device conveniences only (sound, theme, the offline save, the last lobby
settings), wrapped in try/catch. Anything that must survive or be shared lives on the server.

## UI

- Tokens from `web/src/styles/tokens.css` only; light and dark both work; layouts hold at 360 px
  wide with no horizontal scroll.
- Interactive targets are at least 44 px, focus is visible, text contrast is at least 4.5:1, and
  motion respects `prefers-reduced-motion`.
- Every visible change is mirrored in `design/web.pen` ([design sync](design-sync.md)).

## Tests

- Unit tests sit next to the code as `*.test.ts`. The reference engine, the socket client and the
  remote table have tests; a bug fix adds the test that would have caught it.
- The web suite parses every sample in `fixtures/protocol/`.

## Before "done"

`vp check`, `vp test` and `vp build` pass ([definition of done](definition-of-done.md)).
