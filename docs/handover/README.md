# Handover log

This folder is the record of tasks that were handed between Claude and Grok. It is not a
queue. A file here is not work to do.

The rule is [ownership and handover](../agent-rules/ownership-and-handover.md). The initiator
writes a file only when the other agent has a task, then runs that agent's CLI with the file
as the prompt. When the task is finished, the initiator marks it closed in the table below.
The file stays, and the CLI result is the report. A file that a later prompt replaces is
marked withdrawn before that CLI runs. Nobody pastes a handover. Closed and withdrawn files
stay in this folder until the owner names a deletion.

## What to run

Nothing in this folder, unless the owner names that file in the current request.

| Files | What they are |
| ----- | ------------- |
| `001`–`192` | Closed records. The work they name is on `dev`. |
| `193` | Closed as a prompt. Phone landing proposal, already exported. The owner has not accepted it. |
| `194` | Withdrawn. `195` replaced it. Running it would turn the desktop landing frames into a phone page. |
| `195` | Closed as a prompt. Desktop landing proposal, already exported. The owner has not accepted it. |
| `196` | Withdrawn. The owner rejected the Games label in the logo row. |
| `197` | Withdrawn by `198`. The three-button menu was drawn, then rejected. |
| `198` | Withdrawn by `199`. `M5myF` is the PLAY button in the phone nav, not a section. |
| `199` | Closed. `M5myF` and `vMRbF` say Games. The three-button menu is gone. `design/gameon.pen` is 7,806,381 bytes, written 2026-10-17 20:59. |
| `200` | Drawn in the open Pen document, not on disk. The four Games frames are the library. The file on disk is still 7,444,055 bytes, written 2026-10-17 21:00. |
| `201` | Closed. The Games library is in the app, commit `ab63b50`. `vp test`: 848 passed. The pen file was not saved. |
| `202` | Closed. The Open games dialog is in the app, commits `027f220` and `841ee72`. `npm test`: 859 passed. `design/gameon.pen` is saved, 7,637,940 bytes, 2026-10-17 23:30, and not committed. |
| `203` | Asked. The Open games dialog picks the Ocho player count with a slider. |

`171` was never written. Leave that gap.

Take the next number from the directory, as the handover rule says. It is one higher than the
highest prefix on disk, including untracked files. Do not reuse a number, including these
pairs, which were taken twice:

`009`, `061`, `071`, `074`, `126`, `127`, `134`, `147`, `148`, `149`, `151`.

## The landing proposals

`193`, `194` and `195` are three prompts for one redesign, written after `192` had already
been built. The drawings are untracked exports:

- `design/landing-phone-proposal.png`
- `design/landing-phone-dark.png`
- `design/landing-desktop-proposal.png`
- `design/landing-desktop-dark.png`

`design/gameon.pen` has uncommitted edits from that pass. This log does not change those
files. Do not run `193`, `194` or `195` again unless the owner names that file.
