# 196 · Grok → Claude · The phone landing menu shows Games

> Status: withdrawn by `197`. The owner rejected the Games label in the logo row. Do not run this file.

You are Claude, the callee, working on Skull King Tavern
(`C:\Users\asp3x\Documents\development\gameon`), branch `dev`. Do this work yourself.
Do not run `claude` or `grok`.

Read `docs/agent-rules/design-sync.md` and `web/src/styles/tokens.css`. Draw through
the Pencil tools only. Pen is `C:\Program Files\Pencil\Pen.exe`. Open
`design/gameon.pen`. Do not write the `.pen` file by hand. Do not edit `web/`,
`server/`, `tokens.css`, or `PRODUCT.md`. Do not commit. Do not export a PNG or
any other picture.

## State

`dev` is `0533d49`. `design/gameon.pen` is already modified and uncommitted.
These files are also untracked, and you leave them alone:

- `design/landing-desktop-dark.png`
- `design/landing-desktop-proposal.png`
- `design/landing-phone-dark.png`
- `design/landing-phone-proposal.png`

Do not revert the pen file. Do not stage it. Do not commit it.

The owner is looking at the two phone landing frames:

- `z8V6wL`, `Landing · phone`, width 390, light
- `h6hTpa`, `Landing · phone · dark`, width 390, dark

On a phone, Games (the game library) is not in the top bar. The desktop bar
has it. The phone page keeps it for the footer, after every section. The owner
says a player who has to scroll the whole landing to search for that page will
leave. The word they must see without scrolling is "Games".

## Your task

1. Read `z8V6wL` and `h6hTpa` through the Pencil tools before you change either
   one. If either is not width 390, or is not named as above, the open document
   is a stale buffer. Do not save it. Reopen `design/gameon.pen` from disk and
   read them again. If they are still wrong, stop and say what you found.

2. Change only the top bar of those two frames. Keep each id, name, x, y,
   width, and theme mode. Leave every section under the bar as it is: same
   order, same copy, same cards. The footer may keep its own Games link.

3. Leave every other frame alone. In particular leave the desktop frames
   `dqAXj` (`Landing · desktop`) and `EKRZ1` (`Landing · desktop · dark`).
   Do not resize them. Do not copy the phone bar onto them.

## The menu

One row, the existing top bar. Do not add a second bar, a hamburger, a sheet,
or an icon menu. "Games" is a word in the bar, visible when the frame opens.

Keep the bar's height. Fill `$bg`, bottom stroke `$line` 2px, horizontal
padding 16, children vertically centered, space between the two ends.

Left, in one row, gap 12, centered:

- The GameOn logo already in the frame. Do not redraw the mark.
- The word "Games". Nunito 800, 16px, `$fg`, no letter-spacing, no pill, no
  icon, no underline. Its hit area is at least 44px tall. This is the game
  library.

Right: the single trailing control the bar already has. If that control is
"Play" or "Play now", keep it. If it is "Sign in", keep it. Do not add a
second control. Do not remove the one that is there.

If the row is tight, reduce the horizontal padding to 12 before you shrink
the type. The type stays at least 15px. The bar stays one row. "Games" stays.
The trailing control stays.

Use the file's variables only. No new hex. No second typeface. Nunito for the
word. Pirata One only inside the existing Skull King wordmark, which you do
not touch. Radius 16. A button keeps its hard 4px bottom lip. No glass, no
gradient, no small-caps, no emoji.

`h6hTpa` gets the same layout. Its theme mode already switches the colours.
Do not paste a light colour onto it.

## Save

Save `design/gameon.pen` from Pen with File, Save, while that document is
focused, and only after the two phone frames are the ones you edited. Then
read `z8V6wL` and `h6hTpa` back. Both must still be width 390 and still named
as above, and the top bar of each must contain the word "Games". The file on
disk must change. If the save does not change it, try once more and say so
if it still did not.

## Done when

Both phone frames open on a bar that shows "Games" beside the logo. Neither
frame is wider or narrower than 390. No other frame changed. `web/` was not
edited.

## Git

Branch `dev`. Do not commit. Do not push. Do not create a branch or a worktree.

## Report back

The CLI result is the report. No return handover. For each of `z8V6wL` and
`h6hTpa`, quote the name, the width, the height, and the top bar's text in
order, including the trailing control. Say whether any section under the bar
changed. Give the file's new size and write time.
