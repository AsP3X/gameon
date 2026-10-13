# 112 · Grok → Claude · quick play waits ten seconds, and the page can see when

You are Claude, working on Skull King Tavern (`/Users/nvorberg/Documents/development/SkullKingTavern`).
Read `AGENTS.md`, `docs/protocol.md` §5.4, and `web/src/online/Queue.tsx` first. The server side of
the quick-play countdown is done. You design the animation, and you stop there until the owner
says the sequence is good.

## State

- Branch `dev`. Not pushed. The change is commit `6d57a0d` ("TASK: Give quick play ten seconds, and say when the bots fill.").
- Protocol stays 1. One optional field was added. I did not edit `web/` outside
  `web/src/protocol/generated/QueueStatus.ts`, and I did not edit a `.pen` file.
  `design/web.pen` is modified in the checkout. I left it unstaged.
- From `server/`: `cargo fmt --all -- --check` clean, `cargo clippy -p skt-server -p skt-protocol --all-targets -- -D warnings`
  clean, `DATABASE_URL=postgres://skt:skt@127.0.0.1:5432/skt cargo test --workspace`: engine 23
  passed, conformance 1 passed, protocol 3 passed, server 60 passed.
- From `web/`: `./node_modules/.bin/vp check` clean, 147 files formatted, 135 files with no
  warnings, lint or type errors.

## What the server sends

Casual waits 10000 ms from the moment that line stopped being empty, then seats whoever is
waiting and fills the empty seats with bots. Four people still start at once, in join order.

`QueueStatus` gains optional `fillsAt`, Unix milliseconds:

- On `casual` it is that moment, and it is the same number for everyone waiting. A player who
  joins during the wait does not get a fresh 10 seconds.
- It is omitted for `ranked`.
- It is omitted when four people are already waiting, and once the wait has run out.
- `ok.queue`, `queue.status` and `welcome.queue` all carry it. The sample is
  `fixtures/protocol/queue-status.json`: `"fillsAt": 1700000010000` beside `since`
  `1700000000000`.

The generated type is `fillsAt?: UnixMs` on `web/src/protocol/generated/QueueStatus.ts`.

## Your task

1. Design the countdown. Do not change `web/src/online/Queue.tsx` yet, and do not wire `fillsAt`
   into the page yet.
2. In `design/skt.pen`, through the Pencil tools, draw the quick-play wait as a sequence the
   owner can step through. If that screen has no frame, add it. Cover phone and desktop, light
   and dark. The motion has to be smooth and responsive:
   - The wait reads as one continuous movement, not a number that jumps once a second.
   - A player who arrives with time already gone sees the time that is left, not 10.
   - When someone else joins, the seats update and the countdown does not restart.
   - At the end the empty seats become bots and the game starts. Ranked has no countdown.
3. Stop. Ask the owner whether that sequence is good. Build the page only after they say so.

## Contracts

- Protocol stays 1. `fillsAt` is optional. An older page ignores it.
- You change `design/skt.pen` for this step, and `web/` only after the owner accepts the
  sequence. I do not edit a `.pen` file.

## Done when

- The frames are in `design/skt.pen`, and the owner has been asked about the sequence. Nothing
  else is required for this step.

## Report back

Print the sequence in one fenced code block, in the order the frames play, and ask the owner if
it is good. No return handover until they answer. If they say yes, build the countdown from
`fillsAt` and then write the handover.
