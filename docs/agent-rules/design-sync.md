# Keep the designs in sync with the UI

**Applies to:** any change that adds, changes or removes visible UI in `web/`.

Every UI change — a new screen or component, a change to an existing one, or a removal — also
lands in `design/web.pen` in the same piece of work. Removed UI is removed from the design too, not
left behind as a stale frame. New screens are designed there first, then built.

- Edit `.pen` files only through the Pencil MCP tools; never read or write them directly.
  Open the file in Pen first (`open -a /Applications/Pen.app design/web.pen`).
- Reuse the file's existing components and variables, and match the code: same copy, spacing,
  colours and states (empty, loading, error, disconnected) as the implementation.
- The tokens are the ones in `web/src/styles/tokens.css` (lifted from the legacy build's `:root`).
  Feature code and designs use the tokens, never a new hex value.
- Pencil edits live only in the running Pen app. When the design work is done, ask the owner to
  press ⌘S in Pen and say plainly that the `.pen` change is not on disk until they do.
- Before committing a `.pen` file, check that its diff holds only this change — a save also
  writes other sessions' unsaved edits.
- If a UI change deliberately skips the design (a pure bug fix with no visible difference, say),
  say so in the summary instead of silently leaving it out.
- Grok never edits a `.pen` file. A visible change that server work requires is described in the
  handover ([ownership and handover](ownership-and-handover.md)).
