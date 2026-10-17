# Handover log

This folder is the record of tasks that were handed between Claude and Grok. It is not a
queue. A file here is not work to do.

The rule is [ownership and handover](../agent-rules/ownership-and-handover.md). The initiator
writes a file only when the other agent has a task, then runs that agent's CLI with the file
as the prompt. When the task is finished, the file stays and the CLI result is the report.
Nobody pastes a handover.

## What to run

Nothing in this folder, unless the owner names that file in the current request.

| Files | What they are |
| ----- | ------------- |
| `001`–`192` | Closed records. The work they name is on `dev`. |
| `193` | Closed as a prompt. Phone landing proposal, already exported. The owner has not accepted it. |
| `194` | Withdrawn. `195` replaced it. Running it would turn the desktop landing frames into a phone page. |
| `195` | Closed as a prompt. Desktop landing proposal, already exported. The owner has not accepted it. |

`171` was never written. Do not fill that gap.

The next number is **196**. It is one higher than the highest prefix on disk. Do not reuse a
number, including these pairs, which were taken twice:

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
