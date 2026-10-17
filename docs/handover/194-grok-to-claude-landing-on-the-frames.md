# 194 · Grok → Claude · Put the new landing on the frames the owner is looking at

> Status: withdrawn by `195`. Do not run this file. It would resize `dqAXj` and `EKRZ1`
> to 390 and replace the desktop landing with the phone page.

You are Claude, the callee, working on Skull King Tavern
(`C:\Users\asp3x\Documents\development\gameon`), branch `dev`. Do this work yourself.
Do not run `claude` or `grok`.

The owner looked at the landing they already have open and said nothing
changed. The frames they are looking at are:

- `dqAXj`, `Landing · desktop`
- `EKRZ1`, `Landing · desktop · dark`

The proposal you drew as `k9hqO` is not what they are looking at. `design/gameon.pen`
on disk is still the old file: 8,080,748 bytes, last written 2026-10-16 23:56.
Ctrl+S did not save. The screenshot `design/landing-phone-proposal.png` is the
design they were shown.

## Your task

Open `design/gameon.pen` through the Pencil tools. Pen is
`C:\Program Files\Pencil\Pen.exe`. If the open document is a different file,
open this path. Do not write the `.pen` file by hand. Do not edit `web/`,
`server/`, `tokens.css`, or `PRODUCT.md`. Do not commit. Do not add another
frame.

1. Replace the contents of `dqAXj` with the phone landing from handover 193,
   the same page as `k9hqO` and as `design/landing-phone-proposal.png`. Keep
   the id `dqAXj`. Resize that frame to 390 wide and as tall as the content,
   with 24px of page colour under the footer. Rename it `Landing · phone`.
   Light tokens only, as in the screenshot.

2. Replace the contents of `EKRZ1` with the same page in the dark theme. Keep
   the id `EKRZ1`. Same width, same sections, same words, same order. Rename
   it `Landing · phone · dark`. Use the dark values already in `tokens.css`,
   and no new hex:
   - page `#131f24`, card `#131f24`, soft `#1b2a31`, line `#37464f`
   - text `#f1f7fb`, muted `#8ea3ae`, faint `#52656f`
   - green band `#1f3322`, blue band `#16323f`, gold well `#3a3217`
   - green, green lip, blue, blue lip, gold, gold lip, orange, red, and
     purple stay the same colours as the light page
   - Skull King cards and the Ocho fan stay as they are
   - the close band stays `#58cc02` with white type and a white button
   - secondary buttons are `#1b2a31` fill, `#37464f` border and lip, label
     `#f1f7fb`
   - "Sign in", "Suggest a game", and the white button on the green close
     stay readable. The close button stays white with `#3c3c3c` label and a
     `#58a700` lip

3. Delete `k9hqO` if it is still in the open document, so the landing is only
   `dqAXj` and `EKRZ1`.

4. Save `design/gameon.pen` from Pen. File, Save, while that document is
   focused. Then read `dqAXj` and `EKRZ1` back through the Pencil tools and
   confirm the new children are what got saved. The file on disk must change.
   Its size or its write time must no longer be 8,080,748 bytes at
   2026-10-16 23:56. If the save does not change the file, try once more
   from the Pen window that has `design/gameon.pen` open, and say so if it
   still did not.

Export a screenshot of `dqAXj` to `design/landing-phone-proposal.png`,
replacing that file. Export `EKRZ1` to `design/landing-phone-dark.png`.

## Done when

A read of `dqAXj` shows, in order: Bar, Opening, Shelves, Play now, More
games on the way, Three ways to play, Ranked, Close, Footer. The heading in
Opening is "Pick a game." A read of `EKRZ1` shows the same children on the
dark page. The file on disk has a new write time.

## Report back

The CLI result is the report. No return handover. Quote the child names of
`dqAXj` and of `EKRZ1` after the save, and the file's new size and write time.
